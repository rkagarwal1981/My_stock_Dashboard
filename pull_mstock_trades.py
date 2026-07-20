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
COOKIE_PATH = os.path.join(COOKIE_DIR, "mstock_session.json")
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

def get_mstock_credentials() -> Dict[str, str]:
    # Check env variables first (passed from backend)
    username = os.environ.get("MSTOCK_USERNAME")
    password = os.environ.get("MSTOCK_PASSWORD")
    api_key = os.environ.get("MSTOCK_API_KEY")
    totp_key = os.environ.get("MSTOCK_TOTP_KEY")
    
    if username and password:
        return {
            "username": username,
            "password": password,
            "api_key": api_key or "",
            "totp_key": totp_key or ""
        }
        
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

def get_current_fy_dates():
    now = datetime.now()
    if now.month >= 4:
        start_year = now.year
    else:
        start_year = now.year - 1
    # Format: YYYY-MM-DD (MStock API parses YYYY-MM-DD correctly, DD-MM-YYYY causes incorrect month/day parsing)
    from_date = f"{start_year}-04-01"
    to_date = now.strftime("%Y-%m-%d")
    return from_date, to_date

def save_to_excel(trades: List[dict], output_path: str = None):
    if output_path is None:
        output_path = os.path.join(WORKSPACE_ROOT, "Trade History - Mstock.xlsx")
    df = pd.DataFrame(trades)
    
    if df.empty:
        # Create empty DataFrame with correct columns if empty
        cols = ['Trade Date', 'Exchange', 'Buy / Sell', 'Scrip / Contract', 'Qty', 'Price', 'Trade Id']
        df = pd.DataFrame(columns=cols)
    else:
        # Reorder columns to match expected headers
        cols = ['Trade Date', 'Exchange', 'Buy / Sell', 'Scrip / Contract', 'Qty', 'Price', 'Trade Id']
        existing_cols = [c for c in cols if c in df.columns]
        df = df[existing_cols]
    
    try:
        # Ensure parent directory exists
        out_dir = os.path.dirname(output_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
            
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Trade History', index=False)
            
            # Style sheet
            workbook = writer.book
            worksheet = writer.sheets['Trade History']
            
            # Auto-fit columns
            for col in worksheet.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = col[0].column_letter
                worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)
                
        print(f"MStock trade history saved successfully to {output_path}. Total rows: {len(trades)}")
    except PermissionError:
        print(f"\n[WARNING] Permission denied when writing to '{output_path}'.")
        print("This usually happens if you have the file open in Microsoft Excel.")
        print("Please close Excel so the file can be updated during the next sync.\n")
    except Exception as e:
        print(f"Error saving to Excel file {output_path}: {e}")

def run_api_flow(creds: Dict[str, str]) -> bool:
    username = creds.get("username")
    password = creds.get("password")
    api_key = creds.get("api_key")
    totp_key = creds.get("totp_key")
    
    if not all([username, password, api_key, totp_key]):
        print("[MStock API] Missing required details. Skipping API flow.")
        return False
        
    try:
        from tradingapi_a.mconnect import MConnect
        print("\n[MStock API] Connecting...")
        mconnect = MConnect(timeout=30)
        
        login_resp = mconnect.login(username, password)
        totp_code = pyotp.TOTP(totp_key.strip()).now()
        
        try:
            mconnect.verify_totp(api_key, totp_code)
        except Exception:
            mconnect.generate_session(api_key, totp_code, "W")
            
        from_date, to_date = get_current_fy_dates()
        print(f"[MStock API] Requesting trades from {from_date} to {to_date}...")
        
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
            
        if not isinstance(raw_trades, list):
            raw_trades = []
            
        if not raw_trades:
            print("[MStock API] No trade history returned.")
            # Create validation downloads directory and save empty excel copy
            downloads_dir = os.path.join(WORKSPACE_ROOT, "mstock_tradebook_downloads")
            os.makedirs(downloads_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            excel_backup_path = os.path.join(downloads_dir, f"mstock_trades_download_{timestamp}.xlsx")
            save_to_excel([], excel_backup_path)
            save_to_excel([])
            return True
            
        # Map raw trades to standard excel format
        mapped_trades = []
        for t in raw_trades:
            order_ts = t.get("order_timestamp") or t.get("exchange_timestamp")
            if order_ts:
                try:
                    dt = datetime.strptime(order_ts, "%Y-%m-%d %H:%M:%S")
                    date_str = dt.strftime("%d-%m-%Y")
                except Exception:
                    date_str = datetime.now().strftime("%d-%m-%Y")
            else:
                date_str = datetime.now().strftime("%d-%m-%Y")
                
            exch = t.get("exchange", "NSE")
            if exch == "NSE":
                exch = "NSEEQ"
            elif exch == "BSE":
                exch = "BSEEQ"
                
            bs = t.get("transaction_type", "BUY").capitalize()
            
            mapped_trades.append({
                "Trade Date": date_str,
                "Exchange": exch,
                "Buy / Sell": bs,
                "Scrip / Contract": t.get("tradingsymbol"),
                "Qty": float(t.get("quantity") or 0.0),
                "Price": float(t.get("average_price") or 0.0),
                "Trade Id": t.get("trade_id")
            })
            
        # Sort chronologically ascending
        mapped_trades.sort(key=lambda x: datetime.strptime(x["Trade Date"], "%d-%m-%Y"))
        
        # Create validation downloads directory and save raw JSON
        downloads_dir = os.path.join(WORKSPACE_ROOT, "mstock_tradebook_downloads")
        os.makedirs(downloads_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        
        json_path = os.path.join(downloads_dir, f"mstock_trades_api_{timestamp}.json")
        try:
            with open(json_path, "w", encoding="utf-8") as jf:
                json.dump(raw_trades, jf, indent=2)
            print(f"[MStock API] Raw API tradebook data saved to {json_path}")
        except Exception as ej:
            print(f"[MStock API] Error saving raw JSON: {ej}")
            
        # Save timestamped Excel backup in downloads folder
        excel_backup_path = os.path.join(downloads_dir, f"mstock_trades_download_{timestamp}.xlsx")
        save_to_excel(mapped_trades, excel_backup_path)
        
        # Save to main Excel
        save_to_excel(mapped_trades)
        return True
    except Exception as e:
        print(f"[MStock API Error] {e}")
        traceback.print_exc()
        return False

def run_playwright_flow(creds: Dict[str, str]) -> bool:
    username = creds.get("username")
    password = creds.get("password")
    totp_key = creds.get("totp_key")
    
    print("\n[MStock Playwright] Starting browser fallback flow...")
    
    success = False
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context_args = {"accept_downloads": True}
        if os.path.exists(COOKIE_PATH):
            context_args["storage_state"] = COOKIE_PATH
            
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        try:
            page.goto("https://trade.mstock.com/#/index/reports/TradeHistory", timeout=30000)
            time.sleep(3)
            
            # Check login
            if "login" in page.url or page.locator("input[placeholder*='User ID']").is_visible():
                print("[MStock Playwright] Performing Login...")
                page.goto("https://trade.mstock.com/#/login")
                time.sleep(2)
                
                user_input = page.locator("input[placeholder*='User ID']").first
                if user_input.is_visible():
                    user_input.fill(username)
                    page.keyboard.press("Enter")
                    time.sleep(1.5)
                    
                pass_input = page.locator("input[type='password']").first
                if pass_input.is_visible():
                    pass_input.fill(password)
                    page.keyboard.press("Enter")
                    time.sleep(2)
                    
                otp_input = page.locator("input[placeholder*='OTP']").first
                if otp_input.is_visible():
                    print("[MStock Playwright] TOTP required, generating...")
                    otp = pyotp.TOTP(totp_key.strip()).now()
                    otp_input.fill(otp)
                    page.keyboard.press("Enter")
                    time.sleep(4)
                    
                page.wait_for_url("**/reports/TradeHistory", timeout=20000)
                context.storage_state(path=COOKIE_PATH)
                
            print("[MStock Playwright] Logged in. Navigating to reports...")
            page.goto("https://trade.mstock.com/#/index/reports/TradeHistory")
            time.sleep(3)
            
            # Click "Current F.Y" range selection
            current_fy_btn = page.locator("text=Current F.Y").first
            if current_fy_btn.is_visible():
                current_fy_btn.click()
                print("[MStock Playwright] Selected Current F.Y range.")
                time.sleep(1)
            else:
                print("[MStock Playwright] Warning: 'Current F.Y' button not visible. Trying fallback selectors...")
                
            # Click search/submit button
            submit_btn = page.locator("button:has-text('Submit'), button:has-text('Go'), input[type='submit']").first
            if submit_btn.is_visible():
                submit_btn.click()
            else:
                page.keyboard.press("Enter")
            time.sleep(4)
            
            # Click download button
            with page.expect_download() as download_info:
                excel_btn = None
                selectors = [
                    "a[title*='Excel']", 
                    "button[title*='Excel']", 
                    ".download-icon", 
                    "a:has-text('Excel')",
                    "button:has-text('Excel')",
                    "text=Excel",
                    "text=Download"
                ]
                for sel in selectors:
                    try:
                        loc = page.locator(sel).first
                        if loc.is_visible():
                            excel_btn = loc
                            break
                    except Exception:
                        pass
                
                if excel_btn:
                    excel_btn.click()
                else:
                    # Fallback click
                    page.click("a[title*='Excel']")
                
            download = download_info.value
            
            # Create validation downloads directory
            downloads_dir = os.path.join(WORKSPACE_ROOT, "mstock_tradebook_downloads")
            os.makedirs(downloads_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            excel_backup_path = os.path.join(downloads_dir, f"mstock_trades_download_{timestamp}.xlsx")
            
            # Save copy to validation directory first
            try:
                download.save_as(excel_backup_path)
                print(f"[MStock Playwright] Backup copy saved to {excel_backup_path}")
            except Exception as e_copy:
                print(f"[MStock Playwright] Error saving backup copy: {e_copy}")
                
            # Now save to main path
            target_path = os.path.join(WORKSPACE_ROOT, "Trade History - Mstock.xlsx")
            try:
                download.save_as(target_path)
                print(f"[MStock Playwright] Downloaded spreadsheet saved to {target_path}")
            except PermissionError:
                print(f"\n[WARNING] Permission denied when writing to '{target_path}'.")
                print("This usually happens if you have the file open in Microsoft Excel.")
                print("Please close Excel so the file can be updated during the next sync.\n")
            except Exception as e_main:
                print(f"[MStock Playwright] Error saving main file: {e_main}")
                
            success = True
            
        except Exception as e:
            print(f"[MStock Playwright Error] {e}")
            traceback.print_exc()
        finally:
            browser.close()
            
    return success

def main():
    parser = argparse.ArgumentParser(description="Pull MStock Trade History")
    parser.add_argument("--force", action="store_true", help="Force pull trades skipping daily cache check")
    args = parser.parse_args()
    
    if should_skip_pull("mstock", args.force):
        print("MStock trades already pulled today. Skipping.")
        sys.exit(0)
        
    creds = get_mstock_credentials()
    if not creds:
        print("Error: No MStock credentials configured.")
        sys.exit(1)
        
    success = run_api_flow(creds)
    if not success:
        print("API flow failed. Falling back to Playwright...")
        success = run_playwright_flow(creds)
        
    if success:
        update_cache("mstock")
        print("MStock trade history sync completed successfully.")
    else:
        print("Failed to sync MStock trade history.")
        sys.exit(1)

if __name__ == "__main__":
    main()
