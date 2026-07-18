import os
import sys

# Adjust python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.broker_api import get_mstock_credentials, MStockClient

creds = get_mstock_credentials()
if not creds:
    print("No MStock credentials found!")
else:
    client = MStockClient(creds)
    mconnect = client.login()
    
    print("\n--- Querying get_trade_book() ---")
    tb_resp = mconnect.get_trade_book()
    print("Response type:", type(tb_resp))
    
    raw_trades = []
    if hasattr(tb_resp, "json"):
        resp_json = tb_resp.json()
        print("Response JSON keys:", resp_json.keys() if isinstance(resp_json, dict) else "Not a dict")
        if isinstance(resp_json, dict):
            raw_trades = resp_json.get("data", [])
        elif isinstance(resp_json, list):
            raw_trades = resp_json
    else:
        raw_trades = tb_resp
        
    print(f"Total trades found in trade book: {len(raw_trades)}")
    if raw_trades:
        print("First trade detail:")
        print(raw_trades[0])
