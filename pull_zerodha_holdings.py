import os
import re
import sys
import time
import json
import traceback
import pandas as pd
import pyotp
from typing import Dict, List, Optional
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

# Set this to False if you want to run Playwright headlessly
HEADLESS = True

# Define directories
WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))
COOKIE_DIR = os.path.join(WORKSPACE_ROOT, "backend", "database", "cookies")
os.makedirs(COOKIE_DIR, exist_ok=True)
COOKIE_PATH_API = os.path.join(COOKIE_DIR, "zerodha_api_session.json")
COOKIE_PATH_WEB = os.path.join(COOKIE_DIR, "zerodha_session.json")

def parse_credentials_file(file_path: str) -> Dict[str, str]:
    creds = {}
    if not os.path.exists(file_path):
        return creds
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                key, val = line.split(":", 1)
                key_norm = re.sub(r"\s+", "_", key.strip().lower())
                creds[key_norm] = val.strip()
    return creds

def get_zerodha_credentials() -> Dict[str, str]:
    path = os.path.join(WORKSPACE_ROOT, "zerodha_credentials.txt")
    raw = parse_credentials_file(path)
    mapped = {}
    for k, v in raw.items():
        if "username" in k:
            mapped["username"] = v
        elif "password" in k:
            mapped["password"] = v
        elif "api_key" in k:
            mapped["api_key"] = v
        elif "api_secret" in k:
            mapped["api_secret"] = v
        elif "totp" in k or "2_a" in k or "2a" in k:
            mapped["totp_key"] = v
        elif "pin" in k:
            mapped["pin"] = v
    return mapped

def clean_numeric(val_str: str) -> float:
    if not val_str:
        return 0.0
    cleaned = val_str.replace(",", "").replace("₹", "").strip()
    match = re.search(r"[-+]?\d*\.\d+|\d+", cleaned)
    if match:
        return float(match.group(0))
    return 0.0

def parse_generic_holding(item: dict) -> Optional[dict]:
    scrip = (
        item.get("tradingSymbol") or 
        item.get("tradingsymbol") or 
        item.get("symbol") or 
        item.get("scrip") or 
        item.get("script") or 
        item.get("scrip_name") or 
        item.get("instrument_name") or 
        ""
    ).strip()
    
    if not scrip:
        return None
        
    if not scrip.endswith("-EQ") and not any(x in scrip for x in [" FUT", " OPT", "-BE"]):
        scrip = f"{scrip}-EQ"
        
    # Calculate total quantity (free + T1 + pledged + MTF)
    qty = float(
        item.get("quantity", 0) + 
        item.get("t1_quantity", 0) + 
        item.get("collateral_quantity", 0) + 
        item.get("mtf", {}).get("quantity", 0)
    ) if "quantity" in item or "t1_quantity" in item else float(
        item.get("qty") or item.get("total_qty") or 0.0
    )
    
    avg_price = float(
        item.get("avg_price") or 
        item.get("averagePrice") or 
        item.get("average_price") or 
        item.get("avgPrice") or 
        item.get("buy_price") or 
        item.get("price") or 
        0.0
    )
    
    ltp = float(
        item.get("ltp") or 
        item.get("lastPrice") or 
        item.get("last_price") or 
        item.get("closePrice") or 
        item.get("close_price") or 
        avg_price
    )
    
    current_value = qty * ltp
    pnl = current_value - (qty * avg_price)
    
    return {
        "Broker": "Zerodha",
        "Scrip": scrip,
        "Quantity": qty,
        "Avg Price": avg_price,
        "LTP": ltp,
        "Current Value": current_value,
        "P&L": pnl
    }

def run_api_flow(creds: Dict[str, str]) -> Optional[List[dict]]:
    username = creds.get("username")
    password = creds.get("password")
    api_key = creds.get("api_key")
    api_secret = creds.get("api_secret")
    totp_key = creds.get("totp_key")
    pin = creds.get("pin")
    
    if not all([username, password, api_key, api_secret, totp_key]):
        print("[Zerodha API] Missing required API details (api_key, api_secret, totp_key, username, password). Skipping API flow.")
        return None
        
    try:
        from kiteconnect import KiteConnect
        print("\n=== Connecting via Zerodha Kite Connect API ===")
        kite = KiteConnect(api_key=api_key)
        request_token = None
        captured_urls = []
        
        with sync_playwright() as p:
            print(f"Launching login browser for request token (headless={HEADLESS})...")
            browser = p.chromium.launch(headless=HEADLESS)
            context_args = {}
            if os.path.exists(COOKIE_PATH_API):
                context_args["storage_state"] = COOKIE_PATH_API
            context = browser.new_context(**context_args)
            page = context.new_page()
            
            def handle_request(request):
                captured_urls.append(request.url)
                parsed = urlparse(request.url)
                params = parse_qs(parsed.query)
                if "request_token" in params:
                    nonlocal request_token
                    request_token = params["request_token"][0]
            
            page.on("request", handle_request)
            connect_url = f"https://kite.zerodha.com/connect/login?api_key={api_key}&v=3"
            print(f"Navigating to connect login URL...")
            page.goto(connect_url, timeout=30000)
            time.sleep(3)
            
            if "login" in page.url or page.locator("input#userid").is_visible() or page.locator("input#password").is_visible():
                print("Logging in to Kite...")
                if page.locator("input#userid").is_visible():
                    page.fill("input#userid", username)
                elif page.locator("text=Change user").is_visible():
                    if not page.locator(f"text={username}").is_visible():
                        page.click("text=Change user")
                        page.wait_for_selector("input#userid", timeout=5000)
                        page.fill("input#userid", username)
                page.fill("input#password", password)
                page.click("button[type='submit']")
                
                try:
                    page.wait_for_selector("input#password", state="detached", timeout=10000)
                except Exception:
                    pass
                time.sleep(3)
                
                # Detect second screen inputs
                inputs = page.locator("input").all()
                totp_or_pin_input = None
                for inp in inputs:
                    inp_id = inp.get_attribute('id')
                    inp_type = inp.get_attribute('type')
                    inp_label = inp.get_attribute('label') or ""
                    inp_placeholder = inp.get_attribute('placeholder') or ""
                    
                    if inp_type != 'hidden' and inp_id != 'password' and inp.is_visible():
                        if "totp" in inp_label.lower() or "totp" in inp_placeholder.lower() or "totp" in inp_id.lower() or "external totp" in inp_label.lower():
                            totp_or_pin_input = inp
                        elif "pin" in inp_label.lower() or "pin" in inp_placeholder.lower() or "pin" in inp_id.lower():
                            totp_or_pin_input = inp
                        elif not totp_or_pin_input and inp_id == 'userid':
                            totp_or_pin_input = inp
                            
                if totp_or_pin_input:
                    is_totp = False
                    inp_label = totp_or_pin_input.get_attribute('label') or ""
                    inp_placeholder = totp_or_pin_input.get_attribute('placeholder') or ""
                    if "totp" in inp_label.lower() or "totp" in inp_placeholder.lower() or totp_key:
                        is_totp = True
                        
                    if is_totp and totp_key:
                        otp = pyotp.TOTP(totp_key.strip()).now()
                        print(f"Generating TOTP code: {otp}")
                        totp_or_pin_input.fill(otp)
                    elif pin:
                        print("Filling PIN...")
                        totp_or_pin_input.fill(pin)
                    else:
                        print("Error: No TOTP key or PIN provided for second screen authentication.")
                        return None
                        
                    for attempt in range(8):
                        time.sleep(1)
                        if request_token:
                            break
                            
                    if not request_token:
                        try:
                            page.click("button[type='submit']", timeout=3000)
                            for attempt in range(5):
                                time.sleep(1)
                                if request_token:
                                    break
                        except Exception:
                            pass
                            
            if not request_token:
                parsed = urlparse(page.url)
                params = parse_qs(parsed.query)
                if "request_token" in params:
                    request_token = params["request_token"][0]
                    
            if not request_token:
                for url in captured_urls:
                    parsed = urlparse(url)
                    params = parse_qs(parsed.query)
                    if "request_token" in params:
                        request_token = params["request_token"][0]
                        break
                        
            if request_token:
                print(f"Successfully captured request token: {request_token}")
                context.storage_state(path=COOKIE_PATH_API)
            else:
                print("Could not obtain Zerodha request token.")
                # Capture screenshot
                screenshot_path = os.path.join(WORKSPACE_ROOT, "zerodha_api_failed.png")
                page.screenshot(path=screenshot_path)
                print(f"Saved failure screenshot to {screenshot_path}")
                
            browser.close()
            
        if request_token:
            print("Generating session with KiteConnect...")
            session = kite.generate_session(request_token, api_secret=api_secret)
            kite.set_access_token(session["access_token"])
            
            print("Fetching holdings...")
            kite_holdings = kite.holdings()
            
            # Print raw response structure
            print("\nRaw API Holdings response:")
            print(json.dumps(kite_holdings, indent=2))
            
            holdings = []
            for item in kite_holdings:
                h = parse_generic_holding(item)
                if h and h["Quantity"] > 0:
                    holdings.append(h)
            return holdings
    except Exception as e:
        print(f"[Zerodha API Error] {e}")
        traceback.print_exc()
    return None

def run_playwright_flow(creds: Dict[str, str]) -> List[dict]:
    username = creds.get("username")
    password = creds.get("password")
    totp_key = creds.get("totp_key")
    pin = creds.get("pin")
    
    print("\n=== Falling back to Playwright UI Scraping ===")
    
    holdings = []
    with sync_playwright() as p:
        print(f"Launching browser (headless={HEADLESS})...")
        browser = p.chromium.launch(headless=HEADLESS)
        context_args = {}
        if os.path.exists(COOKIE_PATH_WEB):
            print(f"Loading session cookies from {COOKIE_PATH_WEB}")
            context_args["storage_state"] = COOKIE_PATH_WEB
            
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        try:
            print("Navigating to Zerodha Kite holdings page...")
            page.goto("https://kite.zerodha.com/holdings/equity", timeout=30000)
            time.sleep(3)
            
            # Check if login is required
            is_login = page.url.startswith("https://kite.zerodha.com/login") or page.locator("input#userid").is_visible() or page.locator("input#password").is_visible()
            
            if is_login:
                print("Login page detected. Attempting login...")
                page.goto("https://kite.zerodha.com/")
                time.sleep(2)
                
                if page.locator("input#userid").is_visible():
                    page.fill("input#userid", username)
                elif page.locator("text=Change user").is_visible():
                    if not page.locator(f"text={username}").is_visible():
                        page.click("text=Change user")
                        page.wait_for_selector("input#userid", timeout=5000)
                        page.fill("input#userid", username)
                page.fill("input#password", password)
                page.click("button[type='submit']")
                
                try:
                    page.wait_for_selector("input#password", state="detached", timeout=10000)
                except Exception:
                    pass
                time.sleep(2)
                
                # Detect PIN/TOTP inputs on second screen
                inputs = page.locator("input").all()
                totp_or_pin_input = None
                for inp in inputs:
                    inp_id = inp.get_attribute('id')
                    inp_type = inp.get_attribute('type')
                    inp_label = inp.get_attribute('label') or ""
                    inp_placeholder = inp.get_attribute('placeholder') or ""
                    
                    if inp_type != 'hidden' and inp_id != 'password' and inp.is_visible():
                        if "totp" in inp_label.lower() or "totp" in inp_placeholder.lower() or "totp" in inp_id.lower() or "external totp" in inp_label.lower():
                            totp_or_pin_input = inp
                        elif "pin" in inp_label.lower() or "pin" in inp_placeholder.lower() or "pin" in inp_id.lower():
                            totp_or_pin_input = inp
                        elif not totp_or_pin_input and inp_id == 'userid':
                            totp_or_pin_input = inp
                            
                if totp_or_pin_input:
                    is_totp = False
                    inp_label = totp_or_pin_input.get_attribute('label') or ""
                    inp_placeholder = totp_or_pin_input.get_attribute('placeholder') or ""
                    if "totp" in inp_label.lower() or "totp" in inp_placeholder.lower() or totp_key:
                        is_totp = True
                        
                    if is_totp and totp_key:
                        otp = pyotp.TOTP(totp_key.strip()).now()
                        print(f"Generating TOTP code: {otp}")
                        totp_or_pin_input.fill(otp)
                    elif pin:
                        print("Filling PIN...")
                        totp_or_pin_input.fill(pin)
                    else:
                        print("Error: No TOTP key or PIN provided for second screen authentication.")
                        return []
                        
                    for attempt in range(8):
                        time.sleep(1)
                        if "dashboard" in page.url or "holdings" in page.url:
                            break
                            
                    if "dashboard" not in page.url and "holdings" not in page.url:
                        try:
                            page.click("button[type='submit']", timeout=3000)
                            time.sleep(3)
                        except Exception:
                            pass
                            
                print("Waiting for page redirection to Dashboard/Holdings...")
                try:
                    page.wait_for_url("**/dashboard", timeout=20000)
                    print("Redirection successful. Saving session state...")
                    context.storage_state(path=COOKIE_PATH_WEB)
                    page.goto("https://kite.zerodha.com/holdings/equity")
                except Exception as ex:
                    # Let's try direct navigation as fallback
                    try:
                        page.goto("https://kite.zerodha.com/holdings/equity")
                        page.wait_for_selector(".holdings-table", timeout=10000)
                        print("Direct navigation to holdings succeeded. Saving session state...")
                        context.storage_state(path=COOKIE_PATH_WEB)
                    except Exception:
                        print(f"Redirection/navigation failed. Current URL: {page.url}")
                        screenshot_path = os.path.join(WORKSPACE_ROOT, "zerodha_login_failed.png")
                        page.screenshot(path=screenshot_path)
                        print(f"Saved failure screenshot to {screenshot_path}")
                        raise ex
            else:
                print("Already logged in (restored session).")
                
            print("Waiting for holdings table...")
            page.wait_for_selector(".holdings-table", timeout=15000)
            time.sleep(3)
            
            print(f"Current URL: {page.url}")
            print(f"Page Title: {page.title()}")
            
            rows = page.locator(".holdings-table tbody tr").all()
            print(f"Found {len(rows)} holdings rows in table. Extracting data...")
            
            for index, r in enumerate(rows):
                cells = r.locator("td").all()
                if len(cells) >= 6:
                    script = cells[0].inner_text().split('\n')[0].strip()
                    if not script or script.lower() in ["total", "scrip", "symbol"]:
                        continue
                        
                    try:
                        qty = clean_numeric(cells[1].inner_text())
                        avg_price = clean_numeric(cells[2].inner_text())
                        ltp = clean_numeric(cells[3].inner_text())
                        
                        # In Zerodha holdings table:
                        # cells[1]: Qty
                        # cells[2]: Avg. cost
                        # cells[3]: LTP
                        # cells[4]: Invested Value
                        # cells[5]: Current Value
                        # cells[6]: P&L
                        # If table contains 7 or more cells, extract them. Otherwise, fall back to calculations.
                        if len(cells) >= 7:
                            cur_val = clean_numeric(cells[5].inner_text())
                            pnl = clean_numeric(cells[6].inner_text())
                        else:
                            cur_val = clean_numeric(cells[4].inner_text())
                            pnl = cur_val - (qty * avg_price)
                        
                        holdings.append({
                            "Broker": "Zerodha",
                            "Scrip": f"{script}-EQ" if not script.endswith("-EQ") else script,
                            "Quantity": qty,
                            "Avg Price": avg_price,
                            "LTP": ltp,
                            "Current Value": cur_val,
                            "P&L": pnl
                        })
                        print(f"Extracted: {script} | Qty: {qty} | Avg Price: {avg_price} | LTP: {ltp} | P&L: {pnl}")
                    except Exception as ex:
                        print(f"Error parsing row {index}: {ex}")
                        continue
                        
            print(f"Successfully scraped {len(holdings)} holdings via Playwright UI.")
        except Exception as e:
            print(f"[Zerodha Playwright Error] {e}")
            traceback.print_exc()
            try:
                screenshot_path = os.path.join(WORKSPACE_ROOT, "zerodha_scrape_failed.png")
                page.screenshot(path=screenshot_path)
                print(f"Saved error screenshot to {screenshot_path}")
            except Exception:
                pass
        finally:
            browser.close()
            
    return holdings

def main():
    creds = get_zerodha_credentials()
    if not creds:
        print("Error: Could not read zerodha_credentials.txt. Please verify file name and path.")
        sys.exit(1)
        
    print(f"Credentials read successfully for user: {creds.get('username')}")
    
    # Run API flow
    holdings = run_api_flow(creds)
    
    # Fallback to Playwright if API flow failed or returned empty
    if not holdings:
        print("\nAPI flow did not return any holdings. Falling back to Playwright...")
        holdings = run_playwright_flow(creds)
        
    if not holdings:
        print("\nError: Failed to fetch holdings from both API and Playwright browser.")
        sys.exit(1)
        
    # Create DataFrame
    df = pd.DataFrame(holdings)
    
    # Print table to console
    print("\n=== Live Holdings Summary (Zerodha) ===")
    print(df.to_string(index=False))
    
    # Save to Excel
    output_path = os.path.join(WORKSPACE_ROOT, "Zerodha_Live_Holdings.xlsx")
    print(f"\nSaving data to Excel: {output_path}...")
    
    # Format and save nicely
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Zerodha Holdings', index=False)
        
        # Style sheet
        workbook = writer.book
        worksheet = writer.sheets['Zerodha Holdings']
        
        # Auto-fit columns
        for col in worksheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = col[0].column_letter
            worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)
            
    print("Done! Excel file generated successfully.")

if __name__ == "__main__":
    main()
