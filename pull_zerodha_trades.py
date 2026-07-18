import os
import sys
import re
import time
import json
import argparse
import traceback
import pandas as pd
import pyotp
from datetime import datetime
from typing import Dict, List, Optional
from playwright.sync_api import sync_playwright

# Set this to False if you want to run Playwright headlessly
HEADLESS = False

WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))
COOKIE_DIR = os.path.join(WORKSPACE_ROOT, "backend", "database", "cookies")
os.makedirs(COOKIE_DIR, exist_ok=True)
COOKIE_PATH = os.path.join(COOKIE_DIR, "zerodha_session.json")
CACHE_FILE = os.path.join(WORKSPACE_ROOT, "backend", "database", "last_pull_trades.json")

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
    # Check env variables first (passed from backend)
    username = os.environ.get("ZERODHA_USERNAME")
    password = os.environ.get("ZERODHA_PASSWORD")
    pin = os.environ.get("ZERODHA_PIN")
    totp_key = os.environ.get("ZERODHA_TOTP_KEY")
    
    if username and password:
        return {
            "username": username,
            "password": password,
            "pin": pin or "",
            "totp_key": totp_key or ""
        }
        
    path = os.path.join(WORKSPACE_ROOT, "zerodha_credentials.txt")
    raw = parse_credentials_file(path)
    mapped = {}
    for k, v in raw.items():
        if "username" in k:
            mapped["username"] = v
        elif "password" in k:
            mapped["password"] = v
        elif "pin" in k:
            mapped["pin"] = v
        elif "totp" in k or "2_a" in k or "2a" in k:
            mapped["totp_key"] = v
    return mapped

def should_skip_pull(broker: str, force: bool = False) -> bool:
    if force:
        return False
    if not os.path.exists(CACHE_FILE):
        return False
    try:
        with open(CACHE_FILE, "r") as f:
            cache = json.load(f)
        last_date = cache.get(broker)
        if last_date == datetime.now().strftime("%Y-%m-%d"):
            return True
    except Exception:
        pass
    return False

def update_cache(broker: str):
    cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                cache = json.load(f)
        except Exception:
            pass
    cache[broker] = datetime.now().strftime("%Y-%m-%d")
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        print(f"Error updating cache file: {e}")

def run_playwright_flow(creds: Dict[str, str]) -> bool:
    username = creds.get("username")
    password = creds.get("password")
    totp_key = creds.get("totp_key")
    pin = creds.get("pin")
    
    print("\n[Zerodha Console] Starting browser automation flow...")
    
    success = False
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context_args = {"accept_downloads": True}
        if os.path.exists(COOKIE_PATH):
            context_args["storage_state"] = COOKIE_PATH
            
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        try:
            # Navigate to Console reports > Tradebook directly
            print("[Zerodha Console] Navigating to Tradebook...")
            page.goto("https://console.zerodha.com/reports/tradebook", timeout=45000)
            time.sleep(5) # Let initial load and redirects settle
            
            # Check if we were redirected to Kite login/2FA screen
            is_login = "kite.zerodha.com" in page.url or "login" in page.url or "twofa" in page.url
            
            if is_login:
                print("[Zerodha Console] Kite login required. Performing login...")
                time.sleep(2)
                
                # Check if we are on the 2FA screen directly
                if "twofa" in page.url:
                    print("[Zerodha Console] Redirected to 2FA page directly.")
                else:
                    # We are on the login form
                    try:
                        page.wait_for_selector("input#password", timeout=15000)
                    except Exception as e:
                        print(f"[Zerodha Console] Warning: Login password input not visible: {e}")
                        
                    print("[Zerodha Console] Login form visible. Filling credentials...")
                    
                    # Target the visible username input field (if present)
                    user_field = None
                    for inp in page.locator("input#userid").all():
                        if inp.is_visible():
                            user_field = inp
                            break
                    if user_field:
                        user_field.fill(username)
                        
                    page.fill("input#password", password)
                    page.click("button[type='submit']")
                    
                    # Wait for 2FA screen to load (URL changes to contain /twofa)
                    try:
                        page.wait_for_url("**/twofa", timeout=15000)
                    except Exception:
                        pass
                    time.sleep(3)
                
                # Now find the active 2FA input field (which is the only visible input on the 2FA screen)
                totp_or_pin_input = None
                for inp in page.locator("input").all():
                    if inp.is_visible() and inp.get_attribute("type") != "hidden" and inp.get_attribute("id") != "password":
                        totp_or_pin_input = inp
                        break
                        
                if totp_or_pin_input:
                    inp_id = totp_or_pin_input.get_attribute("id") or ""
                    inp_type = totp_or_pin_input.get_attribute("type") or ""
                    inp_placeholder = totp_or_pin_input.get_attribute("placeholder") or ""
                    
                    is_totp = "totp" in inp_id.lower() or "totp" in inp_placeholder.lower() or inp_type == "number" or totp_key
                    
                    if is_totp and totp_key:
                        otp = pyotp.TOTP(totp_key.strip()).now()
                        print(f"[Zerodha Console] Generating TOTP code: {otp}")
                        totp_or_pin_input.fill(otp)
                    elif pin:
                        print("[Zerodha Console] Filling PIN...")
                        totp_or_pin_input.fill(pin)
                    else:
                        print("[Zerodha Console] Error: No TOTP key or PIN provided for login.")
                        return False
                        
                    for attempt in range(8):
                        time.sleep(1)
                        if "dashboard" in page.url or "console" in page.url or "tradebook" in page.url:
                            break
                            
                    if "dashboard" not in page.url and "console" not in page.url and "tradebook" not in page.url:
                        try:
                            page.click("button[type='submit']", timeout=3000)
                            time.sleep(3)
                        except Exception:
                            pass
                            
                try:
                    page.wait_for_url(lambda u: "dashboard" in u or "console" in u or "tradebook" in u, timeout=25000)
                except Exception:
                    pass
                print("[Zerodha Console] Login step completed. Saving cookies...")
                context.storage_state(path=COOKIE_PATH)
                
                # Navigate to console tradebook now if not already there
                if "tradebook" not in page.url:
                    page.goto("https://console.zerodha.com/reports/tradebook")
                    time.sleep(4)
                
            # If Console shows "Login with Kite" button, click it
            login_with_kite = page.locator("a:has-text('Login with Kite'), button:has-text('Login with Kite')").first
            if login_with_kite.is_visible():
                print("[Zerodha Console] Clicking 'Login with Kite'...")
                login_with_kite.click()
                time.sleep(5)
                
            # Wait for tradebook filters
            print("[Zerodha Console] Waiting for tradebook options...")
            page.wait_for_selector("select, .select, input, button", timeout=20000)
            time.sleep(2)
            
            # 1. Select Segment: Equity
            try:
                segment_select = page.locator("select[id='segment'], select[name='segment'], .select select").first
                if segment_select.is_visible():
                    segment_select.select_option("equity")
                    print("[Zerodha Console] Segment selected: Equity (via select)")
                else:
                    segment_wrapper = page.locator("div:has-text('Segment'), .select-wrapper").first
                    if segment_wrapper.is_visible():
                        if "equity" not in segment_wrapper.text_content().lower():
                            segment_wrapper.click()
                            time.sleep(1)
                            page.locator("li:has-text('Equity'), div:has-text('Equity')").first.click()
                            print("[Zerodha Console] Segment selected: Equity (via custom dropdown)")
            except Exception as e:
                print(f"[Zerodha Console] Warning selecting segment: {e} (proceeding with default)")
                
            time.sleep(1)
            
            # 2. Click "current FY" date filter pill/button
            current_fy_btn = page.locator(".mx-shortcuts:has-text('current FY'), button:has-text('current FY'), .mx-shortcuts:has-text('Current FY')").first
            if not current_fy_btn.is_visible():
                current_fy_btn = page.get_by_text("current FY", exact=False).first
                
            if current_fy_btn.is_visible():
                current_fy_btn.click()
                print("[Zerodha Console] Clicked 'current FY' filter.")
                time.sleep(1.5)
            else:
                # Let's try filling date inputs directly as fallback
                print("[Zerodha Console] 'current FY' pill not found, trying fallback date inputs...")
                now = datetime.now()
                start_year = now.year if now.month >= 4 else now.year - 1
                from_date_str = f"{start_year}-04-01"
                to_date_str = now.strftime("%Y-%m-%d")
                
                # Check for standard date inputs
                from_input = page.locator("input[placeholder*='from'], input[name*='from'], .from-date input").first
                to_input = page.locator("input[placeholder*='to'], input[name*='to'], .to-date input").first
                if from_input.is_visible():
                    from_input.fill(from_date_str)
                    to_input.fill(to_date_str)
                    print(f"[Zerodha Console] Filled date inputs: {from_date_str} to {to_date_str}")
                    
            # 3. Click Submit/Go button
            submit_btn = page.locator("button[type='submit'], .btn-blue, button.btn-blue, button.submit, button:has-text('Go'), .submit-btn").first
            if submit_btn.is_visible():
                submit_btn.click()
                print("[Zerodha Console] Clicked submit.")
            else:
                page.keyboard.press("Enter")
                print("[Zerodha Console] Pressed Enter to submit.")
                
            time.sleep(4)
            
            # 4. Click Download button
            # Wait up to 25 seconds for the report to compile and download button to appear
            print("[Zerodha Console] Waiting for report to build and download button to appear...")
            try:
                page.locator("a[title*='xlsx'], button:has-text('XLSX'), button[title*='XLSX'], .download-btn").first.wait_for(state="visible", timeout=25000)
            except Exception:
                pass
                
            with page.expect_download() as download_info:
                # Select the XLSX download button
                download_btn = page.locator("a[title*='xlsx'], button:has-text('XLSX'), button[title*='XLSX'], .download-btn").first
                if not download_btn.is_visible():
                    download_btn = page.get_by_text("XLSX", exact=False).first
                if not download_btn.is_visible():
                    # Check for generic download button/icon
                    download_btn = page.locator("a:has-text('Download'), button:has-text('Download'), .icon-download").first
                
                download_btn.click()
                
            download = download_info.value
            target_path = os.path.join(WORKSPACE_ROOT, "Trade History - Zerodha.xlsx")
            try:
                download.save_as(target_path)
                print(f"[Zerodha Console] Tradebook downloaded and saved to {target_path}")
            except PermissionError:
                print(f"\n[WARNING] Permission denied when writing to '{target_path}'.")
                print("This usually happens if you have the file open in Microsoft Excel.")
                print("Please close Excel so the file can be updated during the next sync.\n")
            except Exception as e:
                print(f"[Zerodha Console] Error saving tradebook: {e}")
                
            success = True
            
        except Exception as e:
            print(f"[Zerodha Console Error] {e}")
            traceback.print_exc()
        finally:
            browser.close()
            
    return success

def main():
    parser = argparse.ArgumentParser(description="Pull Zerodha Trade History")
    parser.add_argument("--force", action="store_true", help="Force pull trades skipping daily cache check")
    args = parser.parse_args()
    
    if should_skip_pull("zerodha", args.force):
        print("Zerodha trades already pulled today. Skipping.")
        sys.exit(0)
        
    creds = get_zerodha_credentials()
    if not creds:
        print("Error: No Zerodha credentials configured.")
        sys.exit(1)
        
    success = run_playwright_flow(creds)
    if success:
        update_cache("zerodha")
        print("Zerodha trade history sync completed successfully.")
    else:
        print("Failed to sync Zerodha trade history.")
        sys.exit(1)

if __name__ == "__main__":
    main()
