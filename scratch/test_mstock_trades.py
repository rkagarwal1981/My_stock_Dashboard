import os
import sys
import pyotp
from datetime import datetime

# Include root in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pull_mstock_holdings import get_mstock_credentials
from tradingapi_a.mconnect import MConnect

def test_api():
    creds = get_mstock_credentials()
    if not creds:
        print("No MStock credentials found.")
        return
    
    username = creds.get("username")
    password = creds.get("password")
    api_key = creds.get("api_key")
    totp_key = creds.get("totp_key")
    
    print(f"Testing MStock API for user {username}...")
    mconnect = MConnect()
    
    login_resp = mconnect.login(username, password)
    print("Login success.")
    
    totp_code = pyotp.TOTP(totp_key.strip()).now()
    print(f"TOTP code: {totp_code}")
    
    try:
        verify_resp = mconnect.verify_totp(api_key, totp_code)
        print("TOTP verified.")
    except Exception as e:
        print(f"verify_totp error, trying generate_session: {e}")
        mconnect.generate_session(api_key, totp_code, "W")
        print("Session generated.")
        
    # Test get_trade_history
    # Let's try current FY from 2026-04-01 to 2026-07-05
    from_date = "01-04-2026"
    to_date = datetime.now().strftime("%d-%m-%Y")
    
    print(f"Requesting trades from {from_date} to {to_date}...")
    try:
        trades_resp = mconnect.get_trade_history(from_date, to_date)
        print("Raw Trade History Response type:", type(trades_resp))
        if hasattr(trades_resp, "json"):
            print("Response JSON data:")
            resp_json = trades_resp.json()
            import json
            print(json.dumps(resp_json, indent=2)[:2000]) # first 2000 chars
        else:
            print("Response:", trades_resp)
    except Exception as e:
        print(f"Error getting trade history: {e}")

if __name__ == "__main__":
    test_api()
