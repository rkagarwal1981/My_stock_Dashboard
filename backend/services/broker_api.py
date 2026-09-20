import os
import re
import pyotp
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from tradingapi_a.mconnect import MConnect
from kiteconnect import KiteConnect
import pandas as pd
from dhanhq import dhanhq, DhanContext


# Define root folder (parent of backend)
WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def parse_credentials_file(file_path: str) -> Dict[str, str]:
    """
    Parses a credentials file of key-value pairs formatted with colons (e.g. 'UserName : X').
    """
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
    # Check env variables first
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
    # Normalize keys
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

def get_mstock_ka_credentials() -> Dict[str, str]:
    # Check env variables first
    username = os.environ.get("MSTOCK_KA_USERNAME")
    password = os.environ.get("MSTOCK_KA_PASSWORD")
    api_key = os.environ.get("MSTOCK_KA_API_KEY")
    totp_key = os.environ.get("MSTOCK_KA_TOTP_KEY")
    if username and password:
        return {
            "username": username,
            "password": password,
            "api_key": api_key or "",
            "totp_key": totp_key or ""
        }
    path = os.path.join(WORKSPACE_ROOT, "mstock_credentials_KA.txt")
    raw = parse_credentials_file(path)
    # Normalize keys
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

def get_dhan_credentials() -> Dict[str, str]:
    path = os.path.join(WORKSPACE_ROOT, "dhan_credentials.txt")
    raw = parse_credentials_file(path)
    mapped = {}
    for k, v in raw.items():
        if "client_id" in k or "username" in k:
            mapped["client_id"] = v
        elif "access_token" in k or "token" in k:
            mapped["access_token"] = v
    return mapped

# --- MStock API Client ---

class MStockClient:
    def __init__(self, creds: Dict[str, str]):
        self.username = creds.get("username")
        self.password = creds.get("password")
        self.api_key = creds.get("api_key")
        self.totp_key = creds.get("totp_key")
        self.mconnect = None

    def login(self) -> MConnect:
        if not all([self.username, self.password, self.api_key, self.totp_key]):
            raise ValueError("Incomplete MStock credentials")
            
        mconnect = MConnect(timeout=30)
        
        # Step 1: Login with username/password
        print(f"[MStock API] Logging in for user: {self.username}...")
        login_resp = mconnect.login(self.username, self.password)
        
        # Check login response if it holds error messages
        if hasattr(login_resp, "json"):
            login_json = login_resp.json()
            if login_json.get("status") == "error":
                raise ValueError(f"MStock Login failed: {login_json.get('message')}")
                
        # Step 2: Generate TOTP and Verify
        if not self.totp_key:
            raise ValueError("MStock TOTP Key is missing or invalid in credentials")
        totp_code = pyotp.TOTP(self.totp_key.strip()).now()
        print(f"[MStock API] Generating TOTP code... Verification endpoint call...")
        
        try:
            # Try to verify via dedicated TOTP endpoint
            verify_resp = mconnect.verify_totp(self.api_key, totp_code)
            if hasattr(verify_resp, "json"):
                v_json = verify_resp.json()
                if v_json.get("status") == "error":
                    raise ValueError(v_json.get("message", "TOTP verification failed"))
        except Exception as e:
            print(f"[MStock API] TOTP verification endpoint raised exception: {e}. Trying generate_session fallback...")
            # Fallback to standard session token generation endpoint
            mconnect.generate_session(self.api_key, totp_code, "W")
            
        self.mconnect = mconnect
        print("[MStock API] Authentication Successful!")
        return mconnect

    def fetch_holdings(self, broker: str = "MStock") -> List[dict]:
        if not self.mconnect:
            self.login()
            
        if not self.mconnect:
            raise ValueError("MStock connection is not initialized. Please ensure login is successful.")
            
        raw_holdings = []
        try:
            holdings_resp = self.mconnect.get_holdings()
            if hasattr(holdings_resp, "json"):
                resp_json = holdings_resp.json()
                if isinstance(resp_json, dict) and resp_json.get("data"):
                    h_data = resp_json.get("data")
                    if isinstance(h_data, list):
                        raw_holdings.extend(h_data)
                    elif isinstance(h_data, dict):
                        raw_holdings.extend(h_data.get("holdings") or h_data.get("portfolio") or [])
                    else:
                        raw_holdings.extend(resp_json.get("holdings") or resp_json.get("portfolio") or [])
                elif isinstance(resp_json, list):
                    raw_holdings.extend(resp_json)
            elif isinstance(holdings_resp, list):
                raw_holdings.extend(holdings_resp)
        except Exception as eh:
            print(f"[MStock API] get_holdings exception: {eh}")

        # Fetch MTF positions from get_net_position
        try:
            pos_resp = self.mconnect.get_net_position()
            if hasattr(pos_resp, "json"):
                resp_json = pos_resp.json()
                if isinstance(resp_json, dict) and resp_json.get("data"):
                    pos_data = resp_json.get("data")
                    if isinstance(pos_data, dict):
                        raw_positions = pos_data.get("net") or pos_data.get("position") or []
                    elif isinstance(pos_data, list):
                        raw_positions = pos_data
                    else:
                        raw_positions = []
                        
                    for pos in raw_positions:
                        if pos.get("product") == "F" and float(pos.get("quantity") or 0) > 0:
                            raw_holdings.append(pos)
        except Exception as ep:
            print(f"[MStock API] get_net_position exception: {ep}")

        parsed_items = []
        if isinstance(raw_holdings, list):
            for item in raw_holdings:
                scrip = (item.get("tradingSymbol") or item.get("tradingsymbol") or item.get("symbol") or item.get("scrip") or item.get("script") or "").strip()
                if not scrip:
                    continue
                # Normalize script name
                if not scrip.endswith("-EQ") and not any(x in scrip for x in [" FUT", " OPT", "-BE"]):
                    scrip = f"{scrip}-EQ"
                    
                qty = float(item.get("quantity") or item.get("qty") or item.get("total_qty") or 0.0)
                if qty <= 0:
                    continue
                avg_price = float(item.get("avg_price") or item.get("averagePrice") or item.get("average_price") or item.get("avgPrice") or item.get("buy_price") or item.get("price") or 0.0)
                ltp = float(item.get("ltp") or item.get("lastPrice") or item.get("last_price") or item.get("closePrice") or item.get("close_price") or avg_price)
                
                parsed_items.append({
                    "broker": broker,
                    "script": scrip,
                    "quantity": qty,
                    "avg_price": avg_price,
                    "ltp": ltp,
                    "current_value": qty * ltp,
                    "pnl": (qty * ltp) - (qty * avg_price)
                })

        # Group by scrip to merge duplicate CNC and MTF positions
        grouped = {}
        for h in parsed_items:
            scrip = h["script"]
            if scrip not in grouped:
                grouped[scrip] = []
            grouped[scrip].append(h)
            
        holdings = []
        for scrip, items in grouped.items():
            if len(items) == 1:
                holdings.append(items[0])
            else:
                total_qty = sum(x["quantity"] for x in items)
                total_cost = sum(x["quantity"] * x["avg_price"] for x in items)
                avg_price = round(total_cost / total_qty, 4) if total_qty > 0 else 0.0
                first = items[0]
                cur_val = total_qty * first["ltp"]
                pnl = cur_val - (total_qty * avg_price)
                holdings.append({
                    "broker": first["broker"],
                    "script": scrip,
                    "quantity": total_qty,
                    "avg_price": avg_price,
                    "ltp": first["ltp"],
                    "current_value": cur_val,
                    "pnl": pnl
                })
        return holdings

    def fetch_transactions(self, days_back: int = 365) -> List[dict]:
        if not self.mconnect:
            self.login()
            
        if not self.mconnect:
            raise ValueError("MStock connection is not initialized. Please ensure login is successful.")
            
        to_date = datetime.now().strftime("%Y-%m-%d")
        from_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        
        print(f"[MStock API] Fetching trade history from {from_date} to {to_date}...")
        trade_resp = self.mconnect.get_trade_history(from_date, to_date)
        raw_trades = []
        if hasattr(trade_resp, "json"):
            resp_json = trade_resp.json()
            if isinstance(resp_json, dict):
                raw_trades = resp_json.get("data", [])
            elif isinstance(resp_json, list):
                raw_trades = resp_json
        else:
            raw_trades = trade_resp
            
        normalized = []
        if isinstance(raw_trades, list):
            for item in raw_trades:
                # Expected fields: trade date, quantity, buy/sell, scrip, price, order no/trade id
                date_val = item.get("trade_date") or item.get("tradeDate") or item.get("date")
                if not date_val:
                    continue
                    
                try:
                    # mStock trade date can be string or timestamp
                    if isinstance(date_val, str):
                        from services.importer import safe_parse_datetime
                        tx_date = safe_parse_datetime(date_val, dayfirst=True)
                    else:
                        tx_date = datetime.fromtimestamp(date_val / 1000.0)
                except Exception:
                    tx_date = datetime.now()
                    
                scrip_raw = item.get("tradingsymbol") or item.get("scrip_name") or item.get("symbol") or item.get("scrip") or ""
                scrip = scrip_raw.strip().upper()
                if not scrip:
                    continue
                if not scrip.endswith("-EQ") and not any(x in scrip for x in [" FUT", " OPT", "-BE"]):
                    scrip = f"{scrip}-EQ"
                    
                buy_sell = str(item.get("transaction_type") or item.get("buySell") or item.get("type") or "BUY").strip().upper()
                qty = float(item.get("quantity") or item.get("qty") or item.get("filledQuantity") or 0.0)
                price = float(item.get("price") or item.get("averagePrice") or 0.0)
                
                # Check for exchange NSE/BSE
                exch = str(item.get("exchange") or "NSE").strip().upper()
                exch_norm = "NSE" if "NSE" in exch else ("BSE" if "BSE" in exch else exch)
                
                trade_id = str(item.get("trade_id") or item.get("tradeId") or item.get("order_id") or "")
                
                normalized.append({
                    "transaction_date": tx_date,
                    "broker": "MStock",
                    "script": scrip,
                    "buy_sell": buy_sell,
                    "quantity": qty,
                    "price": price,
                    "charges": 0.0,
                    "net_amount": qty * price,
                    "exchange": exch_norm,
                    "order_number": trade_id,
                    "trade_id": trade_id
                })
        return normalized

# --- Zerodha API Client ---

class ZerodhaClient:
    def __init__(self, creds: Dict[str, str]):
        self.creds = creds
        self.kite = None

    def login(self) -> KiteConnect:
        api_key = self.creds.get("api_key")
        if not api_key:
            raise ValueError("No API Key found for Zerodha in credentials file.")
        self.kite = KiteConnect(api_key=api_key)
        return self.kite

    def fetch_holdings(self) -> List[dict]:
        # Implementation placeholder
        return []

    def fetch_transactions(self) -> List[dict]:
        return []

# --- Dhan API Client ---

class DhanClient:
    def __init__(self, creds: Dict[str, str]):
        self.client_id = creds.get("client_id")
        self.access_token = creds.get("access_token")
        self.dhan = None

    def login(self) -> dhanhq:
        if not self.client_id or not self.access_token:
            raise ValueError("No client_id or access_token found for Dhan in credentials file.")
        self.dhan = dhanhq(DhanContext(self.client_id, self.access_token))
        return self.dhan

    def fetch_holdings(self) -> List[dict]:
        if not self.dhan:
            self.login()
        if not self.dhan:
            raise ValueError("Dhan connection is not initialized. Please ensure login is successful.")
        response = self.dhan.get_holdings()
        data = response.get("data", []) if isinstance(response, dict) else response
        
        normalized = []
        if isinstance(data, list):
            for item in data:
                scrip = (item.get("tradingSymbol") or item.get("symbol") or "").strip()
                if not scrip:
                    continue
                if not scrip.endswith("-EQ") and not any(x in scrip for x in [" FUT", " OPT", "-BE"]):
                    scrip = f"{scrip}-EQ"
                    
                qty = float(item.get("quantity") or item.get("qty") or 0.0)
                avg_price = float(item.get("avg_price") or item.get("averagePrice") or 0.0)
                ltp = float(item.get("ltp") or item.get("lastPrice") or avg_price)
                
                normalized.append({
                    "broker": "Dhan",
                    "script": scrip,
                    "quantity": qty,
                    "avg_price": avg_price,
                    "ltp": ltp,
                    "current_value": qty * ltp,
                    "pnl": (qty * ltp) - (qty * avg_price)
                })
        return normalized

    def fetch_transactions(self) -> List[dict]:
        if not self.dhan:
            self.login()
        if not self.dhan:
            raise ValueError("Dhan connection is not initialized. Please ensure login is successful.")
        response = self.dhan.get_trade_book()
        data = response.get("data", []) if isinstance(response, dict) else response
        
        normalized = []
        if isinstance(data, list):
            for item in data:
                # parse transaction format
                pass
        return normalized
