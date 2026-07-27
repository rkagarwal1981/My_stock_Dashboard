import os
import re
import sys
import json
import pyotp
import pandas as pd
from datetime import datetime

WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))

def parse_credentials_file(file_path: str) -> dict:
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

def get_mstock_credentials() -> dict:
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

def main():
    print("==================================================")
    print(" MStock API Portfolio Holdings Test Script ")
    print("==================================================")
    
    creds = get_mstock_credentials()
    username = creds.get("username")
    password = creds.get("password")
    api_key = creds.get("api_key")
    totp_key = creds.get("totp_key")
    
    if not all([username, password, api_key, totp_key]):
        print("ERROR: Missing username, password, api_key, or totp_key in mstock_credentials.txt")
        sys.exit(1)
        
    print(f"User ID: {username}")
    print("Connecting to MStock API...")
    
    try:
        from tradingapi_a.mconnect import MConnect
        mconnect = MConnect(timeout=30)
        
        # Step 1: Login
        login_resp = mconnect.login(username, password)
        print("Login Successful.")
        
        # Step 2: Generate TOTP & Verify Session
        totp_code = pyotp.TOTP(totp_key.strip()).now()
        print(f"Generated 2FA TOTP: {totp_code}")
        
        try:
            mconnect.verify_totp(api_key, totp_code)
            print("TOTP Session Verified.")
        except Exception:
            mconnect.generate_session(api_key, totp_code, "W")
            print("Session Generated via Fallback.")
            
        # Step 3: Fetch Holdings from get_holdings() or get_net_position()
        print("\nFetching portfolio holdings via API...")
        raw_items = []
        
        # Try get_holdings()
        try:
            holdings_resp = mconnect.get_holdings()
            if hasattr(holdings_resp, "json"):
                resp_json = holdings_resp.json()
                if isinstance(resp_json, dict) and resp_json.get("data"):
                    h_data = resp_json.get("data")
                    if isinstance(h_data, list):
                        raw_items = h_data
                    elif isinstance(h_data, dict):
                        raw_items = h_data.get("holdings") or h_data.get("portfolio") or []
        except Exception as eh:
            print(f"get_holdings exception: {eh}")
            
        # Fallback to get_net_position() if get_holdings returned empty
        if not raw_items:
            print("get_holdings() returned null/empty. Querying get_net_position()...")
            try:
                pos_resp = mconnect.get_net_position()
                if hasattr(pos_resp, "json"):
                    resp_json = pos_resp.json()
                    if isinstance(resp_json, dict) and resp_json.get("data"):
                        pos_data = resp_json.get("data")
                        if isinstance(pos_data, dict):
                            raw_items = pos_data.get("net") or pos_data.get("position") or []
                        elif isinstance(pos_data, list):
                            raw_items = pos_data
            except Exception as ep:
                print(f"get_net_position exception: {ep}")

        holdings_list = []
        for item in raw_items:
            scrip = (
                item.get("tradingsymbol") or item.get("tradingSymbol") or item.get("symbol") or item.get("scrip") or ""
            ).strip()
            if not scrip:
                continue
            if not scrip.endswith("-EQ") and not any(x in scrip for x in [" FUT", " OPT", "-BE"]):
                scrip = f"{scrip}-EQ"
                
            qty = float(item.get("quantity") or item.get("qty") or item.get("buy_quantity") or 0.0)
            avg_price = float(item.get("average_price") or item.get("avg_price") or item.get("buy_price") or 0.0)
            ltp = float(item.get("last_price") or item.get("ltp") or item.get("close_price") or avg_price)
            cur_val = qty * ltp
            pnl = cur_val - (qty * avg_price)
            
            if qty > 0:
                holdings_list.append({
                    "Broker": "MStock",
                    "Scrip": scrip,
                    "Quantity": qty,
                    "Avg Price": avg_price,
                    "LTP": ltp,
                    "Current Value": cur_val,
                    "P&L": pnl
                })

        if holdings_list:
            df = pd.DataFrame(holdings_list)
            output_excel = os.path.join(WORKSPACE_ROOT, "MStock_API_Holdings_Test.xlsx")
            df.to_excel(output_excel, index=False)
            print(f"\n==================================================")
            print(f" SUCCESS: Retrieved {len(df)} holdings via MStock API!")
            print(f" Excel output saved to: {output_excel}")
            print(f"==================================================\n")
            print(df.to_string(index=False))
        else:
            print("\nERROR: No active holding positions found in MStock API response.")

    except Exception as e:
        print(f"\nAPI Execution Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
