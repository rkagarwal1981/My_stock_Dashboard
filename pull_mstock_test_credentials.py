import os
import sys
import time
import traceback
import pyotp
from typing import Dict, Any
from datetime import datetime
from playwright.sync_api import sync_playwright

WORKSPACE_ROOT = "c:/My_work_RA/Antigravity"

def parse_credentials_file(path: str) -> Dict[str, str]:
    raw = {}
    if not os.path.exists(path):
        print(f"[Warning] Credentials file {path} not found.")
        return raw
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or ":" not in line:
                continue
            parts = line.split(":", 1)
            key = parts[0].strip().lower()
            val = parts[1].strip()
            # Normalize keys
            if "username" in key:
                raw["username"] = val
            elif "password" in key:
                raw["password"] = val
            elif "api key" in key:
                raw["api_key"] = val
            elif "totp" in key or "2 a key" in key or "2a key" in key:
                raw["totp_key"] = val
    return raw

def run_api_flow(creds: Dict[str, str], broker: str) -> bool:
    username = creds.get("username")
    password = creds.get("password")
    api_key = creds.get("api_key")
    totp_key = creds.get("totp_key")
    
    if not all([username, password, api_key, totp_key]):
        print(f"[{broker} API] Missing required details. Skipping API flow.")
        return False
        
    try:
        from tradingapi_a.mconnect import MConnect
        print(f"\n[{broker} API] Connecting...")
        mconnect = MConnect(timeout=30)
        
        login_resp = mconnect.login(username, password)
        totp_code = pyotp.TOTP(totp_key.strip()).now()
        
        try:
            mconnect.verify_totp(api_key, totp_code)
        except Exception:
            mconnect.generate_session(api_key, totp_code, "W")
            
        # Get current dates
        # Get dates for current F.Y
        now = datetime.now()
        if now.month >= 4:
            from_date = f"{now.year}-04-01"
            to_date = now.strftime("%Y-%m-%d")
        else:
            from_date = f"{now.year-1}-04-01"
            to_date = now.strftime("%Y-%m-%d")
            
        print(f"[{broker} API] Requesting trades from {from_date} to {to_date}...")
        trades_resp = mconnect.get_trade_history(from_date, to_date)
        raw_trades = []
        if hasattr(trades_resp, "json"):
            resp_json = trades_resp.json()
            if isinstance(resp_json, dict):
                raw_trades = resp_json.get("data", [])
            elif isinstance(resp_json, list):
                raw_trades = resp_json
        else:
            raw_trades = trades_resp
            
        print(f"[{broker} API Success] Successfully connected and retrieved {len(raw_trades or [])} trades via API!")
        return True
    except Exception as e:
        print(f"[{broker} API Error] {e}")
        return False

def run_playwright_flow(creds: Dict[str, str], broker: str) -> bool:
    username = creds.get("username")
    password = creds.get("password")
    totp_key = creds.get("totp_key")
    
    if not all([username, password, totp_key]):
        print(f"[{broker} Playwright] Missing required details. Skipping Playwright flow.")
        return False
        
    print(f"\n[{broker} Playwright] Starting browser flow...")
    
    downloads_dir = os.path.join(WORKSPACE_ROOT, "mstock_tradebook_downloads")
    os.makedirs(downloads_dir, exist_ok=True)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Empty context to ensure fresh credentials testing
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        
        try:
            print(f"[{broker} Playwright] Navigating to login page...")
            page.goto("https://trade.mstock.com/#/login", timeout=30000)
            time.sleep(5)
            
            # Check for invalid session popup
            popup = page.locator("text=Your session has been invalidated!")
            if popup.is_visible():
                print(f"[{broker} Playwright] Detected 'Your session has been invalidated!' modal. Clicking 'Close'...")
                page.click("text=Close")
                time.sleep(3)
                
            print(f"[{broker} Playwright] Performing credentials login...")
            page.wait_for_selector("text=Login with Credentials", timeout=15000)
            page.click("text=Login with Credentials")
            time.sleep(2)
            
            page.wait_for_selector("input#username", timeout=20000)
            page.fill("input#username", username)
            page.keyboard.press("Enter")
            time.sleep(1)
            
            page.wait_for_selector("input#password-field", timeout=20000)
            page.fill("input#password-field", password)
            page.keyboard.press("Enter")
            time.sleep(1)
            
            page.wait_for_selector("input[type='tel']", timeout=10000)
            otp = pyotp.TOTP(totp_key.strip()).now()
            otp_fields = page.locator("input[type='tel']").all()
            print(f"[{broker} Playwright] Entering 6-digit TOTP: {otp}")
            otp_fields[0].click()
            time.sleep(0.5)
            page.keyboard.type(otp, delay=150)
            time.sleep(2)
            
            # Click Submit button if not auto-submitted/redirected
            if "/index/" not in page.url:
                submit_btn = page.locator("button:has-text('Submit'), .btn-primary").first
                if submit_btn.is_visible():
                    submit_btn.click()
                else:
                    page.keyboard.press("Enter")
            time.sleep(4)
            
            page.wait_for_url("**/index/**", timeout=30000)
            print(f"[{broker} Playwright] Login successful! Navigating to reports page...")
            
            page.goto("https://trade.mstock.com/#/index/reports/TradeHistory", timeout=30000)
            page.wait_for_selector("text=Current F.Y", timeout=20000)
            
            page.click("text=Current F.Y")
            time.sleep(1)
            
            # Click search/submit button
            submit_btn = page.locator("button:has-text('Submit'), button:has-text('Go'), input[type='submit']").first
            submit_btn.click()
            print(f"[{broker} Playwright] Submitted search form.")
            time.sleep(4)
            
            # Download file
            print(f"[{broker} Playwright] Attempting tradebook Excel download...")
            with page.expect_download() as download_info:
                page.click("a[title*='Excel']", force=True)
            download = download_info.value
            
            target_path = os.path.join(downloads_dir, f"{broker.lower()}_test_tradebook.xlsx")
            download.save_as(target_path)
            print(f"[{broker} Playwright Success] File downloaded successfully to {target_path}!")
            
            # Save screenshot
            screenshot_path = os.path.join(WORKSPACE_ROOT, f"{broker.lower()}_verify_success.png")
            page.screenshot(path=screenshot_path)
            print(f"[{broker} Playwright] Saved success screenshot to {screenshot_path}")
            return True
            
        except Exception as e:
            print(f"[{broker} Playwright Error] Login/Download failed: {e}")
            err_screenshot = os.path.join(WORKSPACE_ROOT, f"{broker.lower()}_verify_err.png")
            page.screenshot(path=err_screenshot)
            print(f"[{broker} Playwright] Saved error screenshot to {err_screenshot}")
            return False
        finally:
            browser.close()

def main():
    configs = [
        {"broker": "MStock", "file": "mstock_credentials.txt"},
        {"broker": "Mstock_KA", "file": "mstock_credentials_KA.txt"}
    ]
    
    for conf in configs:
        broker = conf["broker"]
        filename = conf["file"]
        path = os.path.join(WORKSPACE_ROOT, filename)
        
        print("\n" + "="*50)
        print(f"TESTING CREDENTIALS FOR: {broker} ({filename})")
        print("="*50)
        
        creds = parse_credentials_file(path)
        if not creds:
            print(f"Failed to parse credentials file: {path}")
            continue
            
        print(f"Parsed Username: {creds.get('username')}")
        
        # Try API verification only
        api_success = run_api_flow(creds, broker)
        if api_success:
            print(f"[{broker}] API verification SUCCESSFUL!")
        else:
            print(f"[{broker}] API verification FAILED!")

if __name__ == "__main__":
    main()
