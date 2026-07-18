import os
import time
import json
import asyncio
from typing import Dict, List, Optional
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COOKIE_DIR = os.path.join(BASE_DIR, "database", "cookies")
os.makedirs(COOKIE_DIR, exist_ok=True)

# In-memory session state for interactive OTP input
# broker_name -> {'status': 'IDLE'|'AWAITING_OTP'|'SUCCESS'|'FAILED', 'otp': None, 'error': None}
automation_states: Dict[str, dict] = {
    "mstock": {"status": "IDLE", "otp": None, "error": None},
    "zerodha": {"status": "IDLE", "otp": None, "error": None},
    "dhan": {"status": "IDLE", "otp": None, "error": None}
}

def get_cookie_path(broker: str) -> str:
    return os.path.join(COOKIE_DIR, f"{broker}_session.json")

def wait_for_otp(broker: str, timeout_sec: int = 120) -> str:
    """Blocks execution and polls the in-memory state until the user provides an OTP."""
    automation_states[broker]["status"] = "AWAITING_OTP"
    automation_states[broker]["otp"] = None
    
    start_time = time.time()
    while time.time() - start_time < timeout_sec:
        if automation_states[broker]["otp"] is not None:
            otp = automation_states[broker]["otp"]
            automation_states[broker]["status"] = "PROCESSING_OTP"
            return otp
        time.sleep(1)
        
    automation_states[broker]["status"] = "FAILED"
    automation_states[broker]["error"] = "OTP verification timed out."
    raise TimeoutError("Timed out waiting for OTP from user.")

def parse_generic_holding(item: dict, broker: str) -> Optional[dict]:
    # Resolve symbol/scrip name
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
        
    # Standardize script name with -EQ if it is a stock
    if not scrip.endswith("-EQ") and not any(x in scrip for x in [" FUT", " OPT", "-BE"]):
        scrip = f"{scrip}-EQ"
        
    # Resolve quantity
    if broker == "Zerodha":
        # Calculate total quantity for Zerodha (free + T1 + pledged + MTF)
        qty = float(
            item.get("quantity", 0) + 
            item.get("t1_quantity", 0) + 
            item.get("collateral_quantity", 0) + 
            item.get("mtf", {}).get("quantity", 0)
        )
    else:
        qty = float(
            item.get("quantity") or 
            item.get("qty") or 
            item.get("volume") or 
            item.get("total_qty") or 
            0.0
        )
    
    # Resolve average price
    avg_price = float(
        item.get("avg_price") or 
        item.get("averagePrice") or 
        item.get("average_price") or 
        item.get("avgPrice") or 
        item.get("buy_price") or 
        item.get("price") or 
        0.0
    )
    
    # Resolve last traded price (LTP)
    ltp = float(
        item.get("ltp") or 
        item.get("lastPrice") or 
        item.get("last_price") or 
        item.get("closePrice") or 
        item.get("close_price") or 
        avg_price # default
    )
    
    current_value = qty * ltp
    pnl = current_value - (qty * avg_price)
    
    return {
        "broker": broker,
        "script": scrip,
        "quantity": qty,
        "avg_price": avg_price,
        "ltp": ltp,
        "current_value": current_value,
        "pnl": pnl
    }
def clean_numeric(val_str: str) -> float:
    if not val_str:
        return 0.0
    cleaned = val_str.replace(",", "").strip()
    import re
    match = re.search(r"[-+]?\d*\.\d+|\d+", cleaned)
    if match:
        return float(match.group(0))
    return 0.0

def run_zerodha_scraper(username: str, password_decrypted: str, pin_decrypted: Optional[str] = None, totp_key: Optional[str] = None, api_key: Optional[str] = None, api_secret: Optional[str] = None) -> List[dict]:
    """Scrapes holdings from Zerodha Kite using KiteConnect API (and Playwright fallback)."""
    holdings = []
    
    # Attempt official KiteConnect API
    if api_key and api_secret:
        try:
            from kiteconnect import KiteConnect
            import pyotp
            from urllib.parse import urlparse, parse_qs
            
            print(f"Attempting Zerodha API connection for {username}...")
            kite = KiteConnect(api_key=api_key)
            cookie_path = get_cookie_path("zerodha_api")
            request_token = None
            captured_urls = []
            
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context_args = {}
                if os.path.exists(cookie_path):
                    context_args["storage_state"] = cookie_path
                context = browser.new_context(**context_args)
                page = context.new_page()
                
                # Listen to request URLs to extract request_token even if local callback is offline
                def handle_request(request):
                    captured_urls.append(request.url)
                    parsed = urlparse(request.url)
                    params = parse_qs(parsed.query)
                    if "request_token" in params:
                        nonlocal request_token
                        request_token = params["request_token"][0]
                
                page.on("request", handle_request)
                
                # Direct to the connect login URL
                connect_url = f"https://kite.zerodha.com/connect/login?api_key={api_key}&v=3"
                page.goto(connect_url, timeout=30000)
                time.sleep(2)
                
                if "login" in page.url or page.locator("input#userid").is_visible():
                    page.fill("input#userid", username)
                    page.fill("input#password", password_decrypted)
                    page.click("button[type='submit']")
                    
                    try:
                        page.wait_for_selector("input#password", state="detached", timeout=10000)
                    except:
                        pass
                    time.sleep(2)
                    
                    # Detect PIN/TOTP inputs on second screen (could use id=userid on second screen)
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
                            totp_or_pin_input.fill(otp)
                        elif pin_decrypted:
                            totp_or_pin_input.fill(pin_decrypted)
                        else:
                            # Try asking user if interactive session, otherwise fall back to wait_for_otp
                            otp = wait_for_otp("zerodha")
                            totp_or_pin_input.fill(otp)
                            
                        # Wait for redirect
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
                            except:
                                pass
                                
                # Check for request token in the query params of page URL as fallback
                if not request_token:
                    parsed = urlparse(page.url)
                    params = parse_qs(parsed.query)
                    if "request_token" in params:
                        request_token = params["request_token"][0]
                        
                if not request_token:
                    # Final check on all captured URLs
                    for url in captured_urls:
                        parsed = urlparse(url)
                        params = parse_qs(parsed.query)
                        if "request_token" in params:
                            request_token = params["request_token"][0]
                            break
                            
                if request_token:
                    context.storage_state(path=cookie_path)
                
                browser.close()
                
            if request_token:
                session = kite.generate_session(request_token, api_secret=api_secret)
                kite.set_access_token(session["access_token"])
                kite_holdings = kite.holdings()
                
                for item in kite_holdings:
                    h = parse_generic_holding(item, "Zerodha")
                    if h and h["quantity"] > 0:
                        holdings.append(h)
                
                if holdings:
                    automation_states["zerodha"]["status"] = "SUCCESS"
                    return holdings
        except Exception as e:
            print(f"Zerodha API flow failed: {e}. Falling back to browser scraping...")
 
    # Fallback to Playwright UI Scraper
    cookie_path = get_cookie_path("zerodha")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context_args = {}
        if os.path.exists(cookie_path):
            context_args["storage_state"] = cookie_path
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        try:
            page.goto("https://kite.zerodha.com/holdings/equity", timeout=30000)
            
            if page.url.startswith("https://kite.zerodha.com/login") or page.locator("input#userid").is_visible():
                page.goto("https://kite.zerodha.com/")
                page.fill("input#userid", username)
                page.fill("input#password", password_decrypted)
                page.click("button[type='submit']")
                
                try:
                    page.wait_for_selector("input#password", state="detached", timeout=10000)
                except:
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
                        try:
                            import pyotp
                            otp = pyotp.TOTP(totp_key.strip()).now()
                            totp_or_pin_input.fill(otp)
                        except Exception:
                            otp = wait_for_otp("zerodha")
                            totp_or_pin_input.fill(otp)
                    elif pin_decrypted:
                        totp_or_pin_input.fill(pin_decrypted)
                    else:
                        otp = wait_for_otp("zerodha")
                        totp_or_pin_input.fill(otp)
                        
                    for attempt in range(8):
                        time.sleep(1)
                        if "dashboard" in page.url:
                            break
                            
                    if "dashboard" not in page.url:
                        try:
                            page.click("button[type='submit']", timeout=3000)
                            time.sleep(3)
                        except Exception:
                            pass
                            
                page.wait_for_url("**/dashboard", timeout=20000)
                context.storage_state(path=cookie_path)
                page.goto("https://kite.zerodha.com/holdings/equity")
                
            page.wait_for_selector(".holdings-table", timeout=15000)
            time.sleep(2)
            
            rows = page.locator(".holdings-table tbody tr").all()
            for r in rows:
                cells = r.locator("td").all()
                if len(cells) >= 5:
                    script = cells[0].inner_text().strip()
                    qty = clean_numeric(cells[1].inner_text())
                    avg_price = clean_numeric(cells[2].inner_text())
                    ltp = clean_numeric(cells[3].inner_text())
                    
                    if len(cells) >= 7:
                        cur_val = clean_numeric(cells[5].inner_text())
                        pnl = clean_numeric(cells[6].inner_text())
                    else:
                        cur_val = clean_numeric(cells[4].inner_text())
                        pnl = cur_val - (qty * avg_price)
                    
                    holdings.append({
                        "broker": "Zerodha",
                        "script": f"{script}-EQ" if not script.endswith("-EQ") else script,
                        "quantity": qty,
                        "avg_price": avg_price,
                        "ltp": ltp,
                        "current_value": cur_val,
                        "pnl": pnl
                    })
                    
            automation_states["zerodha"]["status"] = "SUCCESS"
        except Exception as e:
            automation_states["zerodha"]["status"] = "FAILED"
            automation_states["zerodha"]["error"] = str(e)
            print(f"Error scraping Zerodha holdings: {e}")
        finally:
            browser.close()
            
    return holdings

def run_mstock_scraper(username: str, password_decrypted: str, pin_decrypted: Optional[str] = None, totp_key: Optional[str] = None, api_key: Optional[str] = None, api_secret: Optional[str] = None) -> List[dict]:
    """Scrapes holdings from MStock using Type A API client (and Playwright fallback)."""
    holdings = []
    
    # Attempt official MStock Type A API Connection
    if api_key:
        try:
            from tradingapi_a.mconnect import MConnect
            import pyotp
            
            print(f"Attempting MStock API connection for {username}...")
            mconnect = MConnect()
            
            # Step 1: Login (triggers OTP)
            login_resp = mconnect.login(username, password_decrypted)
            
            # Step 2: OTP/TOTP Verification
            otp_code = None
            if totp_key:
                try:
                    otp_code = pyotp.TOTP(totp_key.strip()).now()
                except Exception as et:
                    print(f"Error generating TOTP for MStock: {et}")
                    
            if not otp_code:
                otp_code = wait_for_otp("mstock")
                
            # Step 3: Session verification
            try:
                # First try to verify totp endpoint directly
                verify_resp = mconnect.verify_totp(api_key, otp_code)
                if isinstance(verify_resp, dict) and verify_resp.get("status") == "error":
                    raise ValueError("TOTP verification endpoint returned error")
            except Exception:
                # Fallback to standard generate_session
                mconnect.generate_session(api_key, otp_code, "W")
                
            # Step 4: Retrieve Holdings and Net Positions
            data = []
            try:
                holdings_resp = mconnect.get_holdings()
                if hasattr(holdings_resp, "json"):
                    resp_json = holdings_resp.json()
                    if isinstance(resp_json, dict):
                        h_data = resp_json.get("data")
                        if isinstance(h_data, list):
                            data.extend(h_data)
                    elif isinstance(resp_json, list):
                        data.extend(resp_json)
                elif isinstance(holdings_resp, list):
                    data.extend(holdings_resp)
            except Exception as eh:
                print(f"Error fetching MStock holdings: {eh}")

            try:
                pos_resp = mconnect.get_net_position()
                if hasattr(pos_resp, "json"):
                    pos_json = pos_resp.json()
                    if isinstance(pos_json, dict):
                        p_data = pos_json.get("data")
                        if isinstance(p_data, dict) and "net" in p_data:
                            data.extend(p_data["net"])
                        elif isinstance(p_data, list):
                            data.extend(p_data)
                elif isinstance(pos_resp, list):
                    data.extend(pos_resp)
            except Exception as ep:
                print(f"Error fetching MStock net positions: {ep}")

            seen = {}
            for item in data:
                h = parse_generic_holding(item, "MStock")
                if h and h["quantity"] > 0:
                    script = h["script"]
                    if script not in seen:
                        seen[script] = h
                    else:
                        old_h = seen[script]
                        total_qty = old_h["quantity"] + h["quantity"]
                        if total_qty > 0:
                            total_cost = (old_h["quantity"] * old_h["avg_price"]) + (h["quantity"] * h["avg_price"])
                            old_h["avg_price"] = total_cost / total_qty
                            old_h["quantity"] = total_qty
                            old_h["ltp"] = max(old_h["ltp"], h["ltp"])
                            old_h["current_value"] = total_qty * old_h["ltp"]
                            old_h["pnl"] = old_h["current_value"] - total_cost

            holdings = list(seen.values())
            if holdings:
                automation_states["mstock"]["status"] = "SUCCESS"
                return holdings
        except Exception as e:
            print(f"MStock API flow failed: {e}. Falling back to browser scraping...")

    # Fallback to Playwright UI Scraper
    cookie_path = get_cookie_path("mstock")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context_args = {}
        if os.path.exists(cookie_path):
            context_args["storage_state"] = cookie_path
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        try:
            page.goto("https://trade.mstock.com/#/index/watchlist/Portfolio", timeout=30000)
            time.sleep(2)
            
            if "login" in page.url or page.locator("input#loginId").is_visible() or page.locator("input[placeholder*='User ID']").is_visible():
                page.goto("https://trade.mstock.com/#/login")
                time.sleep(2)
                
                user_input = page.locator("input[placeholder*='User ID']").first
                if user_input.is_visible():
                    user_input.fill(username)
                
                page.keyboard.press("Enter")
                time.sleep(1)
                
                pass_input = page.locator("input[type='password']").first
                pass_input.fill(password_decrypted)
                page.keyboard.press("Enter")
                time.sleep(2)
                
                otp = wait_for_otp("mstock")
                otp_input = page.locator("input[placeholder*='OTP']").first
                if otp_input.is_visible():
                    otp_input.fill(otp)
                    page.keyboard.press("Enter")
                    time.sleep(3)
                
                page.wait_for_url("**/watchlist/Portfolio", timeout=20000)
                context.storage_state(path=cookie_path)
                
            page.wait_for_selector(".portfolio-grid, .portfolio-row, tr", timeout=15000)
            time.sleep(2)
            
            rows = page.locator("tr").all()
            for r in rows:
                cells = r.locator("td").all()
                if len(cells) >= 5:
                    cell_0_text = cells[0].inner_text().strip()
                    if not cell_0_text or any(x in cell_0_text.lower() for x in ["total", "scrip", "symbol"]):
                        continue
                    
                    try:
                        # Extract symbol name and details block
                        lines = [l.strip() for l in cell_0_text.split("\n") if l.strip()]
                        if len(lines) < 2:
                            continue
                        
                        scrip_text = lines[0]
                        details = lines[1]
                        
                        # Pattern to parse details block: "260 @ 1,532.34 | LTP : 1,393.80 (3.19%)"
                        import re
                        match = re.search(
                            r"([\d,.]+)\s*@\s*([\d,.]+)\s*\|\s*LTP\s*:\s*([\d,.]+)", 
                            details, 
                            re.IGNORECASE
                        )
                        if not match:
                            continue
                            
                        qty = float(match.group(1).replace(",", ""))
                        avg_price = float(match.group(2).replace(",", ""))
                        ltp = float(match.group(3).replace(",", ""))
                        
                        # Fetch Invested, Current Value, and P&L from table columns or calculate
                        # Columns are: 0: Symbol/details, 1: Invested, 2: Current, 3: Day's P/L, 4: Overall P/L
                        cur_val = float(cells[2].inner_text().replace(",", "").replace("₹", "").strip() or (qty * ltp))
                        pnl = float(cells[4].inner_text().split('(')[0].replace(",", "").replace("₹", "").strip() or (cur_val - qty * avg_price))
                        
                        holdings.append({
                            "broker": "MStock",
                            "script": f"{scrip_text}-EQ" if not scrip_text.endswith("-EQ") else scrip_text,
                            "quantity": qty,
                            "avg_price": avg_price,
                            "ltp": ltp,
                            "current_value": cur_val,
                            "pnl": pnl
                        })
                    except Exception as ex:
                        print(f"Error parsing MStock row: {ex}")
                        continue
                        
            automation_states["mstock"]["status"] = "SUCCESS"
        except Exception as e:
            automation_states["mstock"]["status"] = "FAILED"
            automation_states["mstock"]["error"] = str(e)
            print(f"Error scraping MStock holdings: {e}")
        finally:
            browser.close()
            
    return holdings

def run_dhan_scraper(username: str, password_decrypted: str, pin_decrypted: Optional[str] = None, totp_key: Optional[str] = None, api_key: Optional[str] = None, api_secret: Optional[str] = None) -> List[dict]:
    """Scrapes holdings from Dhan using official SDK (and Playwright fallback)."""
    holdings = []
    
    # Attempt official DhanHQ API Connection
    # username = client_id, password_decrypted = access_token
    if username and password_decrypted and len(password_decrypted) > 30:
        try:
            from dhanhq import dhanhq, DhanContext
            print(f"Attempting Dhan API connection for client: {username}...")
            dhan = dhanhq(DhanContext(username, password_decrypted))
            response = dhan.get_holdings()
            
            data = []
            if isinstance(response, dict):
                data = response.get("data", [])
            else:
                data = response
                
            if isinstance(data, list):
                for item in data:
                    h = parse_generic_holding(item, "Dhan")
                    if h and h["quantity"] > 0:
                        holdings.append(h)
                
                if holdings:
                    automation_states["dhan"]["status"] = "SUCCESS"
                    return holdings
        except Exception as e:
            print(f"Dhan API flow failed: {e}. Falling back to browser scraping...")

    # Fallback to Playwright UI Scraper
    cookie_path = get_cookie_path("dhan")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context_args = {}
        if os.path.exists(cookie_path):
            context_args["storage_state"] = cookie_path
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        try:
            page.goto("https://web.dhan.co/index/portfolio", timeout=30000)
            time.sleep(2)
            
            if "login" in page.url or page.locator("input[placeholder*='Mobile']").is_visible():
                page.goto("https://login.dhan.co/")
                time.sleep(2)
                
                page.fill("input[placeholder*='Mobile']", username)
                page.click("button[type='submit']")
                time.sleep(1)
                
                page.fill("input[type='password']", password_decrypted)
                page.click("button[type='submit']")
                time.sleep(2)
                
                otp = wait_for_otp("dhan")
                otp_input = page.locator("input[placeholder*='OTP']").first
                if otp_input.is_visible():
                    otp_input.fill(otp)
                    page.click("button[type='submit']")
                    time.sleep(3)
                    
                page.wait_for_url("**/portfolio", timeout=20000)
                context.storage_state(path=cookie_path)
                
            page.wait_for_selector(".holding-item, tr", timeout=15000)
            time.sleep(2)
            
            rows = page.locator("tr").all()
            for r in rows:
                cells = r.locator("td").all()
                if len(cells) >= 6:
                    scrip_text = cells[0].inner_text().strip()
                    if not scrip_text or scrip_text.lower() in ["total", "scrip", "symbol"]:
                        continue
                    try:
                        qty = float(cells[1].inner_text().replace(",", "").strip() or 0)
                        avg_price = float(cells[2].inner_text().replace(",", "").strip() or 0)
                        ltp = float(cells[3].inner_text().replace(",", "").strip() or 0)
                        cur_val = float(cells[4].inner_text().replace(",", "").strip() or 0)
                        pnl = float(cells[5].inner_text().replace(",", "").strip() or 0)
                        
                        holdings.append({
                            "broker": "Dhan",
                            "script": f"{scrip_text}-EQ" if not scrip_text.endswith("-EQ") else scrip_text,
                            "quantity": qty,
                            "avg_price": avg_price,
                            "ltp": ltp,
                            "current_value": cur_val,
                            "pnl": pnl
                        })
                    except Exception:
                        continue
                        
            automation_states["dhan"]["status"] = "SUCCESS"
        except Exception as e:
            automation_states["dhan"]["status"] = "FAILED"
            automation_states["dhan"]["error"] = str(e)
            print(f"Error scraping Dhan holdings: {e}")
        finally:
            browser.close()
            
    return holdings
