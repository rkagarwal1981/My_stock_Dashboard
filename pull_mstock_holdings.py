import os
import re
import sys
import time
import json
import traceback
import pandas as pd
import pyotp
from typing import Dict, List, Optional
from playwright.sync_api import sync_playwright

# Set this to False if you want to run Playwright headlessly
HEADLESS = False

# Define directories
WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))
COOKIE_DIR = os.path.join(WORKSPACE_ROOT, "backend", "database", "cookies")
os.makedirs(COOKIE_DIR, exist_ok=True)
COOKIE_PATH = os.path.join(COOKIE_DIR, "mstock_session.json")

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

def get_mstock_credentials() -> Dict[str, str]:
    path = os.path.join(WORKSPACE_ROOT, "mstock_credentials.txt")
    raw = parse_credentials_file(path)
    mapped = {}
    for k, v in raw.items():
        if "username" in k:
            mapped["username"] = v
        elif "password" in k:
            mapped["password"] = v
        elif "api_key" in k:
            mapped["api_key"] = v
        elif "totp" in k or "2_a" in k or "2a" in k:
            mapped["totp_key"] = v
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
        
    qty = float(
        item.get("quantity") or 
        item.get("qty") or 
        item.get("volume") or 
        item.get("total_qty") or 
        0.0
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
        "Broker": "MStock",
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
    totp_key = creds.get("totp_key")
    
    if not all([username, password, api_key, totp_key]):
        print("[MStock API] Missing username, password, api_key, or totp_key. Skipping API flow.")
        return None
        
    try:
        from tradingapi_a.mconnect import MConnect
        print("\n=== Connecting via MStock API ===")
        mconnect = MConnect(timeout=30)
        
        print(f"Logging in user {username}...")
        login_resp = mconnect.login(username, password)
        print("Login response structure:")
        try:
            print(json.dumps(login_resp.json() if hasattr(login_resp, "json") else login_resp, indent=2))
        except Exception:
            print(login_resp)
            
        print("Generating TOTP code...")
        totp_code = pyotp.TOTP(totp_key.strip()).now()
        print(f"Generated TOTP: {totp_code}")
        
        try:
            print("Verifying TOTP...")
            verify_resp = mconnect.verify_totp(api_key, totp_code)
            print("TOTP Verification response:")
            try:
                print(json.dumps(verify_resp.json() if hasattr(verify_resp, "json") else verify_resp, indent=2))
            except Exception:
                print(verify_resp)
        except Exception as e:
            print(f"verify_totp failed ({e}). Falling back to generate_session...")
            mconnect.generate_session(api_key, totp_code, "W")
            
        print("Fetching holdings from API...")
        holdings_resp = mconnect.get_holdings()
        print("Raw Holdings response:")
        
        raw_holdings = []
        if hasattr(holdings_resp, "json"):
            resp_json = holdings_resp.json()
            print(json.dumps(resp_json, indent=2))
            if isinstance(resp_json, dict):
                raw_holdings = resp_json.get("data")
            elif isinstance(resp_json, list):
                raw_holdings = resp_json
        else:
            print(holdings_resp)
            raw_holdings = holdings_resp
            
        print("Fetching net positions from API...")
        pos_resp = mconnect.get_net_position()
        print("Raw Net Position response:")
        
        raw_positions = []
        if hasattr(pos_resp, "json"):
            resp_json = pos_resp.json()
            print(json.dumps(resp_json, indent=2))
            if isinstance(resp_json, dict):
                p_data = resp_json.get("data")
                if isinstance(p_data, dict) and "net" in p_data:
                    raw_positions = p_data["net"]
                elif isinstance(p_data, list):
                    raw_positions = p_data
            elif isinstance(resp_json, list):
                raw_positions = resp_json
        else:
            print(pos_resp)
            raw_positions = pos_resp
            
        # Ensure they are list types to prevent concatenation error
        if not isinstance(raw_holdings, list):
            raw_holdings = []
        if not isinstance(raw_positions, list):
            raw_positions = []
            
        # Combine and parse
        holdings = []
        seen = {}
        for item in raw_holdings + raw_positions:
            h = parse_generic_holding(item)
            if h and h["Quantity"] > 0:
                scrip = h["Scrip"]
                if scrip not in seen:
                    seen[scrip] = h
                else:
                    old_h = seen[scrip]
                    total_qty = old_h["Quantity"] + h["Quantity"]
                    if total_qty > 0:
                        total_cost = (old_h["Quantity"] * old_h["Avg Price"]) + (h["Quantity"] * h["Avg Price"])
                        old_h["Avg Price"] = total_cost / total_qty
                        old_h["Quantity"] = total_qty
                        old_h["LTP"] = max(old_h["LTP"], h["LTP"])
                        old_h["Current Value"] = total_qty * old_h["LTP"]
                        old_h["P&L"] = old_h["Current Value"] - total_cost
                        
        holdings = list(seen.values())
        return holdings
    except Exception as e:
        print(f"[MStock API Error] {e}")
        traceback.print_exc()
        return None

def run_playwright_flow(creds: Dict[str, str]) -> List[dict]:
    username = creds.get("username")
    password = creds.get("password")
    totp_key = creds.get("totp_key")
    
    print("\n=== Falling back to Playwright UI Scraping ===")
    
    holdings = []
    with sync_playwright() as p:
        print(f"Launching browser (headless={HEADLESS})...")
        browser = p.chromium.launch(headless=HEADLESS)
        context_args = {}
        if os.path.exists(COOKIE_PATH):
            print(f"Loading session cookies from {COOKIE_PATH}")
            context_args["storage_state"] = COOKIE_PATH
            
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        try:
            print("Navigating to MStock watchlist/Portfolio page...")
            page.goto("https://trade.mstock.com/#/index/watchlist/Portfolio", timeout=30000)
            time.sleep(3)
            
            # Check if login is required
            is_login = "login" in page.url or page.locator("input#loginId").is_visible() or page.locator("input[placeholder*='User ID']").is_visible()
            
            if is_login:
                print("Login page detected. Attempting login...")
                page.goto("https://trade.mstock.com/#/login")
                time.sleep(3)
                
                user_input = page.locator("input[placeholder*='User ID']").first
                if user_input.is_visible():
                    user_input.fill(username)
                    print(f"Filled username: {username}")
                
                page.keyboard.press("Enter")
                time.sleep(2)
                
                pass_input = page.locator("input[type='password']").first
                if pass_input.is_visible():
                    pass_input.fill(password)
                    print("Filled password.")
                    
                page.keyboard.press("Enter")
                time.sleep(3)
                
                # Check for OTP page
                otp_input = page.locator("input[placeholder*='OTP']").first
                if otp_input.is_visible():
                    print("OTP field detected. Generating TOTP code...")
                    otp = pyotp.TOTP(totp_key.strip()).now()
                    print(f"Generated TOTP Code: {otp}")
                    otp_input.fill(otp)
                    page.keyboard.press("Enter")
                    time.sleep(4)
                else:
                    # Check if OTP screen is active but field isn't immediate
                    print("Waiting to see if OTP is requested...")
                    time.sleep(2)
                    otp_input = page.locator("input[placeholder*='OTP']").first
                    if otp_input.is_visible():
                        otp = pyotp.TOTP(totp_key.strip()).now()
                        print(f"Generated TOTP Code: {otp}")
                        otp_input.fill(otp)
                        page.keyboard.press("Enter")
                        time.sleep(4)
                        
                print("Waiting for page redirection to Portfolio...")
                try:
                    page.wait_for_url("**/watchlist/Portfolio", timeout=20000)
                    print("Redirection successful. Saving session state...")
                    context.storage_state(path=COOKIE_PATH)
                except Exception as ex:
                    print(f"Redirection timed out or failed. Current URL: {page.url}")
                    # Capture screenshot for user diagnostics
                    screenshot_path = os.path.join(WORKSPACE_ROOT, "mstock_login_failed.png")
                    page.screenshot(path=screenshot_path)
                    print(f"Saved failure screenshot to {screenshot_path}")
                    raise ex
            else:
                print("Already logged in (restored session).")
                
            print("Waiting for portfolio table...")
            page.wait_for_selector("tr", timeout=15000)
            time.sleep(3)
            
            # Print page title and current url
            print(f"Current URL: {page.url}")
            print(f"Page Title: {page.title()}")
            
            # Let's inspect the page rows
            rows = page.locator("tr").all()
            print(f"Found {len(rows)} table rows. Extracting data...")
            
            for index, r in enumerate(rows):
                cells = r.locator("td").all()
                if len(cells) >= 5:
                    cell_0_text = cells[0].inner_text().strip()
                    if not cell_0_text or any(x in cell_0_text.lower() for x in ["total", "scrip", "symbol"]):
                        continue
                    
                    try:
                        lines = [l.strip() for l in cell_0_text.split("\n") if l.strip()]
                        if len(lines) < 2:
                            print(f"Row {index}: Less than 2 lines of text. Skipping. Text: {repr(cell_0_text)}")
                            continue
                        
                        scrip_text = lines[0]
                        details = lines[1]
                        
                        # Pattern to parse: "260 @ 1,532.34 | LTP : 1,393.80 (3.19%)"
                        match = re.search(
                            r"([\d,.]+)\s*@\s*([\d,.]+)\s*\|\s*LTP\s*:\s*([\d,.]+)", 
                            details, 
                            re.IGNORECASE
                        )
                        if not match:
                            print(f"Row {index}: Details do not match expected format. Text: {repr(details)}")
                            continue
                            
                        qty = float(match.group(1).replace(",", ""))
                        avg_price = float(match.group(2).replace(",", ""))
                        ltp = float(match.group(3).replace(",", ""))
                        
                        # Read columns: Invested (cells[1]), Current (cells[2]), Day's P/L (cells[3]), Overall P/L (cells[4])
                        invested_val = clean_numeric(cells[1].inner_text())
                        cur_val = clean_numeric(cells[2].inner_text())
                        if cur_val == 0.0:
                            cur_val = qty * ltp
                        pnl = clean_numeric(cells[4].inner_text())
                        
                        holdings.append({
                            "Broker": "MStock",
                            "Scrip": f"{scrip_text}-EQ" if not scrip_text.endswith("-EQ") else scrip_text,
                            "Quantity": qty,
                            "Avg Price": avg_price,
                            "LTP": ltp,
                            "Current Value": cur_val,
                            "P&L": pnl
                        })
                        print(f"Extracted: {scrip_text} | Qty: {qty} | Avg Price: {avg_price} | LTP: {ltp} | P&L: {pnl}")
                    except Exception as ex:
                        print(f"Error parsing row {index}: {ex}")
                        continue
                        
            print(f"Successfully scraped {len(holdings)} holdings via Playwright UI.")
        except Exception as e:
            print(f"[MStock Playwright Error] {e}")
            traceback.print_exc()
            # Capture failure screenshot
            try:
                screenshot_path = os.path.join(WORKSPACE_ROOT, "mstock_scrape_failed.png")
                page.screenshot(path=screenshot_path)
                print(f"Saved error screenshot to {screenshot_path}")
            except Exception:
                pass
        finally:
            browser.close()
            
    return holdings

def main():
    creds = get_mstock_credentials()
    if not creds:
        print("Error: Could not read mstock_credentials.txt. Please verify file name and path.")
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
    print("\n=== Live Holdings Summary (MStock) ===")
    print(df.to_string(index=False))
    
    # Save to Excel
    output_path = os.path.join(WORKSPACE_ROOT, "MStock_Live_Holdings.xlsx")
    print(f"\nSaving data to Excel: {output_path}...")
    
    # Format and save nicely
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='MStock Holdings', index=False)
        
        # Style sheet
        workbook = writer.book
        worksheet = writer.sheets['MStock Holdings']
        
        # Auto-fit columns
        for col in worksheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = col[0].column_letter
            worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)
            
    print("Done! Excel file generated successfully.")

if __name__ == "__main__":
    main()
