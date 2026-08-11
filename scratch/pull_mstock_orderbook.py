import os
import sys
import re
import pyotp
import pandas as pd
from datetime import datetime
from tradingapi_a.mconnect import MConnect

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def parse_credentials_file(file_path: str) -> dict:
    creds = {}
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found.")
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

def parse_api_response(response) -> list:
    data = []
    if hasattr(response, "json"):
        try:
            resp_json = response.json()
            if isinstance(resp_json, dict):
                data = resp_json.get("data", []) or resp_json.get("orders", []) or resp_json.get("trades", []) or []
            elif isinstance(resp_json, list):
                data = resp_json
        except Exception:
            pass
    elif isinstance(response, list):
        data = response
    elif isinstance(response, dict):
        data = response.get("data", []) or response.get("orders", []) or response.get("trades", []) or []
    
    if not isinstance(data, list):
        return []
    return data

def main():
    print("Reading credentials from mstock_credentials.txt...")
    creds = get_mstock_credentials()
    
    username = creds.get("username")
    password = creds.get("password")
    api_key = creds.get("api_key")
    totp_key = creds.get("totp_key")
    
    if not all([username, password, api_key, totp_key]):
        print("Error: Missing required credentials in mstock_credentials.txt.")
        print("Required: username, password, api_key, and totp_key.")
        sys.exit(1)
        
    print(f"Logging in for user: {username} (MStock) via TOTP...")
    mconnect = MConnect(timeout=30)
    
    # Step 1: Login
    login_resp = mconnect.login(username, password)
    
    # Step 2: Generate TOTP and authenticate
    totp_code = pyotp.TOTP(totp_key.strip()).now()
    print(f"Generated TOTP Code: {totp_code}")
    
    try:
        print("Calling verify_totp...")
        mconnect.verify_totp(api_key, totp_code)
    except Exception as e:
        print(f"verify_totp failed ({e}). Attempting generate_session fallback...")
        mconnect.generate_session(api_key, totp_code, "W")
        
    print("Authentication successful!")
    
    # Step 3: Fetch Order Book
    print("Fetching order book...")
    try:
        order_book_resp = mconnect.get_order_book()
        orders = parse_api_response(order_book_resp)
        print(f"Successfully retrieved {len(orders)} orders.")
    except Exception as e:
        print(f"Failed to fetch order book: {e}")
        orders = []
        
    # Step 4: Fetch Trade Book
    print("Fetching trade book...")
    try:
        trade_book_resp = mconnect.get_trade_book()
        trades = parse_api_response(trade_book_resp)
        print(f"Successfully retrieved {len(trades)} trades.")
    except Exception as e:
        print(f"Failed to fetch trade book: {e}")
        trades = []
        
    # Step 5: Export to Excel
    output_path = os.path.join(WORKSPACE_ROOT, "MStock_OrderBook_TradeBook.xlsx")
    print(f"Writing data to {output_path}...")
    
    df_orders = pd.DataFrame(orders)
    df_trades = pd.DataFrame(trades)
    
    try:
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            if not df_orders.empty:
                df_orders.to_excel(writer, sheet_name='Order Book', index=False)
                # Auto-fit columns
                worksheet = writer.sheets['Order Book']
                for col in worksheet.columns:
                    max_len = max(len(str(cell.value or '')) for cell in col)
                    col_letter = col[0].column_letter
                    worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)
            else:
                # Write a placeholder sheet if empty
                pd.DataFrame({"Message": ["No orders found or API failed"]}).to_excel(writer, sheet_name='Order Book', index=False)
                
            if not df_trades.empty:
                df_trades.to_excel(writer, sheet_name='Trade Book', index=False)
                # Auto-fit columns
                worksheet = writer.sheets['Trade Book']
                for col in worksheet.columns:
                    max_len = max(len(str(cell.value or '')) for cell in col)
                    col_letter = col[0].column_letter
                    worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)
            else:
                pd.DataFrame({"Message": ["No trades found or API failed"]}).to_excel(writer, sheet_name='Trade Book', index=False)
                
        print(f"Excel file successfully saved to: {output_path}")
        
    except Exception as ex:
        print(f"Error saving to Excel: {ex}")

if __name__ == "__main__":
    main()
