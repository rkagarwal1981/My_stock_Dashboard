import os
import sys
import time
import json
import pyotp
import threading
import argparse
import traceback
from datetime import datetime, time as dt_time, timedelta
from typing import Dict, List, Optional
from playwright.sync_api import sync_playwright
from kiteconnect import KiteConnect
import pandas as pd

# Adjust Python path to load modules correctly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.database import SessionLocal
from models.executed_order import ExecutedOrder
from models.audit_log import AuditLog
from services.market_data import fetch_live_prices
from services.importer import normalize_script_name
from services.broker_api import (
    get_mstock_credentials,
    get_mstock_ka_credentials,
    get_zerodha_credentials,
    MStockClient
)

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TOKEN_CACHE_DIR = os.path.join(WORKSPACE_ROOT, "backend", "database", "cookies")
os.makedirs(TOKEN_CACHE_DIR, exist_ok=True)
TOKEN_CACHE_PATH = os.path.join(TOKEN_CACHE_DIR, "zerodha_access_token.json")

def is_market_hours() -> bool:
    """
    Returns True if current local time is a weekday (Mon-Fri) 
    and lies between 10:00 AM and 3:00 PM.
    """
    now = datetime.now()
    # Check weekday (0-4: Monday-Friday, 5-6: Saturday-Sunday)
    if now.weekday() >= 5:
        return False
        
    start_time = dt_time(10, 0, 0)
    end_time = dt_time(15, 0, 0)
    current_time = now.time()
    return start_time <= current_time <= end_time

def get_zerodha_api_client() -> Optional[KiteConnect]:
    """
    Returns an authenticated KiteConnect client.
    Attempts to read cached daily session token, falling back to Playwright login.
    """
    creds = get_zerodha_credentials()
    api_key = creds.get("api_key")
    api_secret = creds.get("api_secret")
    username = creds.get("username")
    password = creds.get("password")
    pin = creds.get("pin")
    totp_key = creds.get("totp_key")

    if not api_key or not api_secret or not username or not password:
        print("[Order Tracker] Missing Zerodha API credentials in zerodha_credentials.txt. Skipping.")
        return None

    # Try to load cached token
    today_str = datetime.now().strftime("%Y-%m-%d")
    if os.path.exists(TOKEN_CACHE_PATH):
        try:
            with open(TOKEN_CACHE_PATH, "r") as f:
                cached = json.load(f)
            if cached.get("date") == today_str and cached.get("access_token"):
                print("[Order Tracker] Found cached Zerodha access token for today.")
                kite = KiteConnect(api_key=api_key)
                kite.set_access_token(cached["access_token"])
                # Test the client
                kite.profile()
                return kite
        except Exception as e:
            print(f"[Order Tracker] Cached token test failed: {e}. Re-authenticating...")

    # Log in and generate session using Playwright
    print("[Order Tracker] Launching headless browser for Zerodha authentication...")
    try:
        import asyncio
        import sys
        if sys.platform == 'win32':
            try:
                # Force create and set ProactorEventLoop for the background thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                # Apply WindowsProactorEventLoopPolicy
                asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
            except Exception as loop_err:
                print(f"[Order Tracker] Failed to set ProactorEventLoop: {loop_err}")

        kite = KiteConnect(api_key=api_key)
        request_token = None
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()
            
            captured_urls = []
            # Listen to requests to capture request token from redirect
            def handle_request(request):
                nonlocal request_token
                captured_urls.append(request.url)
                if "request_token=" in request.url:
                    from urllib.parse import urlparse, parse_qs
                    parsed = urlparse(request.url)
                    params = parse_qs(parsed.query)
                    if "request_token" in params:
                        request_token = params["request_token"][0]
            
            page.on("request", handle_request)
            
            connect_url = f"https://kite.zerodha.com/connect/login?api_key={api_key}&v=3"
            page.goto(connect_url, timeout=30000)
            time.sleep(2)
            
            # Perform login
            if "login" in page.url or page.locator("input#userid").is_visible() or page.locator("input#password").is_visible():
                if page.locator("input#userid").is_visible():
                    page.fill("input#userid", username)
                elif page.locator("text=Change user").is_visible():
                    if not page.locator(f"text={username}").is_visible():
                        page.click("text=Change user")
                        page.wait_for_selector("input#userid", timeout=5000)
                        page.fill("input#userid", username)
                page.fill("input#password", password)
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
                    inp_id = inp.get_attribute('id') or ""
                    inp_type = inp.get_attribute('type') or ""
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
                    elif pin:
                        totp_or_pin_input.fill(pin)
                        
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
                from urllib.parse import urlparse, parse_qs
                parsed = urlparse(page.url)
                params = parse_qs(parsed.query)
                if "request_token" in params:
                    request_token = params["request_token"][0]
                    
            if not request_token:
                from urllib.parse import urlparse, parse_qs
                # Final check on all captured URLs
                for url in captured_urls:
                    parsed = urlparse(url)
                    params = parse_qs(parsed.query)
                    if "request_token" in params:
                        request_token = params["request_token"][0]
                        break
                        
        if not request_token:
            raise ValueError("Failed to capture request_token from login redirect flow.")
            
        # Generate session
        session = kite.generate_session(request_token, api_secret=api_secret)
        access_token = session["access_token"]
        kite.set_access_token(access_token)
        
        # Cache token
        with open(TOKEN_CACHE_PATH, "w") as f:
            json.dump({
                "date": today_str,
                "access_token": access_token
            }, f, indent=2)
            
        print("[Order Tracker] Zerodha session generated and cached successfully.")
        return kite
    except Exception as e:
        print(f"[Order Tracker] Zerodha authentication failed: {e}")
        traceback.print_exc()
        return None

def is_fo_trade(symbol: str, segment: Optional[str] = None) -> bool:
    """
    Returns True if symbol or segment corresponds to a Futures & Options (F&O) contract.
    """
    sym = symbol.strip().upper()
    seg = segment.strip().upper() if segment else ""
    if seg in ["NFO", "BFO", "CDS", "MCX"]:
        return True
    if sym.endswith("CE") or sym.endswith("PE") or sym.endswith("FUT"):
        return True
    if any(x in sym for x in [" FUT", " OPT", " CALL", " PUT"]):
        return True
    return False

def fetch_zerodha_orders(kite: KiteConnect) -> List[dict]:
    """
    Fetches completed orders from Zerodha Kite for today.
    """
    orders = []
    try:
        # Fetch completed orders or trades
        raw_orders = kite.orders()
        for ord in raw_orders:
            # We only track executed (COMPLETE) orders
            if ord.get("status") != "COMPLETE":
                continue
                
            symbol = ord.get("tradingsymbol") or ""
            if is_fo_trade(symbol, segment=ord.get("segment")):
                continue
                
            qty = float(ord.get("quantity") or 0.0)
            price = float(ord.get("average_price") or ord.get("price") or 0.0)
            script = normalize_script_name(symbol, segment=ord.get("segment"), exchange=ord.get("exchange"))
            
            # Format time
            time_val = ord.get("order_timestamp")
            if isinstance(time_val, str):
                try:
                    exec_time = datetime.fromisoformat(time_val.replace("Z", "+00:00"))
                except Exception:
                    exec_time = pd.Timestamp(time_val).to_pydatetime()
            else:
                exec_time = datetime.now()

            orders.append({
                "broker": "Zerodha",
                "script": script,
                "buy_sell": ord.get("transaction_type", "BUY").upper(),
                "quantity": qty,
                "price": price,
                "amount": qty * price,
                "order_id": str(ord.get("order_id")),
                "execution_time": exec_time
            })
    except Exception as e:
        print(f"[Order Tracker] Error fetching Zerodha orders: {e}")
    return orders

def fetch_mstock_orders(broker: str = "MStock") -> List[dict]:
    """
    Fetches MStock trade book executions for today.
    """
    orders = []
    if broker == "Mstock_KA":
        creds = get_mstock_ka_credentials()
    else:
        creds = get_mstock_credentials()
        
    if not creds:
        return orders
        
    try:
        client = MStockClient(creds)
        mconnect = client.login()
        
        tb_resp = mconnect.get_trade_book()
        raw_trades = []
        if hasattr(tb_resp, "json"):
            resp_json = tb_resp.json()
            if isinstance(resp_json, dict):
                raw_trades = resp_json.get("data", [])
            elif isinstance(resp_json, list):
                raw_trades = resp_json
        else:
            raw_trades = tb_resp
            
        if not isinstance(raw_trades, list):
            raw_trades = []
            
        for t in raw_trades:
            symbol = t.get("SYMBOL") or ""
            if not symbol:
                continue
                
            segment = t.get("SEGMENT") or ""
            inst_name = t.get("INSTRUMENT_NAME") or ""
            if inst_name != "EQUITY" or segment == "D" or is_fo_trade(symbol):
                continue
                
            exch = t.get("EXCHANGE") or "NSE"
            script = normalize_script_name(symbol, exchange=exch)
            
            buy_sell = str(t.get("BUY_SELL") or "BUY").strip().upper()
            qty = float(t.get("QUANTITY") or 0.0)
            price = float(t.get("PRICE") or 0.0)
            trade_id = str(t.get("TRADE_NUMBER") or t.get("ORDER_NUMBER") or "")
            
            # Parse ORDER_DATE_TIME e.g. '06-07-2026 15:29:06'
            time_str = t.get("ORDER_DATE_TIME")
            if time_str:
                try:
                    exec_time = datetime.strptime(time_str, "%d-%m-%Y %H:%M:%S")
                except Exception:
                    exec_time = datetime.now()
            else:
                exec_time = datetime.now()
                
            orders.append({
                "broker": broker,
                "script": script,
                "buy_sell": buy_sell,
                "quantity": qty,
                "price": price,
                "amount": qty * price,
                "order_id": trade_id,
                "execution_time": exec_time
            })
    except Exception as e:
        print(f"[Order Tracker] Error fetching {broker} orders from trade book: {e}")
    return orders

def sync_executed_orders(force: bool = False) -> int:
    """
    Runs a single sync cycle to fetch executed orders for today.
    Updates the database and computes P&L against live Yahoo Finance prices.
    """
    if not force and not is_market_hours():
        print("[Order Tracker] Outside market hours and force=False. Skipping sync cycle.")
        return 0

    print(f"[Order Tracker] Starting order sync cycle at {datetime.now()}...")
    db = SessionLocal()
    # Prune existing F&O order records to clean database
    try:
        db.query(ExecutedOrder).filter(
            (ExecutedOrder.script.like("%CE")) |
            (ExecutedOrder.script.like("%PE")) |
            (ExecutedOrder.script.like("%FUT")) |
            (ExecutedOrder.script.like("%CE-EQ")) |
            (ExecutedOrder.script.like("%PE-EQ")) |
            (ExecutedOrder.script.like("%FUT-EQ"))
        ).delete(synchronize_session=False)
        db.commit()
    except Exception as ed:
        print(f"[Order Tracker] Error cleaning up F&O rows: {ed}")
        db.rollback()
        
    count = 0
    try:
        # 1. Fetch orders from both brokers
        all_orders = []
        
        # MStock
        mstock_orders = fetch_mstock_orders("MStock")
        all_orders.extend(mstock_orders)
        print(f"[Order Tracker] Fetched {len(mstock_orders)} MStock orders.")
        
        # Mstock_KA
        mstock_ka_orders = fetch_mstock_orders("Mstock_KA")
        all_orders.extend(mstock_ka_orders)
        print(f"[Order Tracker] Fetched {len(mstock_ka_orders)} Mstock_KA orders.")
        
        # Zerodha
        kite = get_zerodha_api_client()
        if kite:
            zerodha_orders = fetch_zerodha_orders(kite)
            all_orders.extend(zerodha_orders)
            print(f"[Order Tracker] Fetched {len(zerodha_orders)} Zerodha orders.")

        if not all_orders:
            print("[Order Tracker] No executed orders found for today.")
            return 0

        # 2. Batch fetch live prices from Yahoo Finance
        scrips = list(set(o["script"] for o in all_orders))
        live_prices = {}
        try:
            live_prices = fetch_live_prices(scrips)
        except Exception as ep:
            print(f"[Order Tracker] Failed to fetch live prices: {ep}")

        # 3. Write/Update orders in database
        for o in all_orders:
            # Check if this order_id is already registered
            exists = db.query(ExecutedOrder).filter_by(order_id=o["order_id"]).first()
            
            # Fetch LTP
            ltp = o["price"]
            if o["script"] in live_prices and live_prices[o["script"]]["price"] > 0:
                ltp = live_prices[o["script"]]["price"]

            # Calculate P&L
            # Buy P&L: (LTP - Entry Price) * Qty
            # Sell P&L: (Entry Price - LTP) * Qty (representing cash realization or short)
            if o["buy_sell"] == "BUY":
                pnl = (ltp - o["price"]) * o["quantity"]
                pnl_pct = ((ltp - o["price"]) / o["price"] * 100) if o["price"] > 0 else 0.0
            else:
                pnl = (o["price"] - ltp) * o["quantity"]
                pnl_pct = ((o["price"] - ltp) / o["price"] * 100) if o["price"] > 0 else 0.0

            if exists:
                # Update LTP and P&L dynamically
                exists.ltp = ltp
                exists.pnl = pnl
                exists.pnl_pct = pnl_pct
            else:
                # Insert new executed order
                new_ord = ExecutedOrder(
                    broker=o["broker"],
                    script=o["script"],
                    buy_sell=o["buy_sell"],
                    quantity=o["quantity"],
                    price=o["price"],
                    ltp=ltp,
                    amount=o["amount"],
                    pnl=pnl,
                    pnl_pct=pnl_pct,
                    order_id=o["order_id"],
                    execution_time=o["execution_time"]
                )
                db.add(new_ord)
        # 4. Fallback: Pull today's transactions from the transactions table
        # to ensure that files imported manually/scraped (e.g. for Mstock_KA) appear in the Order Book.
        from models.transaction import Transaction
        from datetime import time as dt_time
        today_start = datetime.combine(datetime.now().date(), dt_time.min)
        
        today_txs = db.query(Transaction).filter(
            Transaction.transaction_date >= today_start
        ).all()
        
        # Fetch live prices for today's transactions if not already fetched
        tx_scrips = [t.script for t in today_txs if t.script and t.script not in live_prices]
        if tx_scrips:
            try:
                live_prices.update(fetch_live_prices(tx_scrips))
            except Exception as ep:
                print(f"[Order Tracker] Failed to fetch live prices for today's transactions: {ep}")
                
        for tx in today_txs:
            order_id = tx.trade_id or tx.order_number or f"TX_{tx.id}"
            
            # Check if this order_id is already registered
            exists = db.query(ExecutedOrder).filter_by(order_id=str(order_id)).first()
            
            # Fetch LTP
            ltp = tx.price
            if tx.script in live_prices and live_prices[tx.script]["price"] > 0:
                ltp = live_prices[tx.script]["price"]
                
            # Calculate P&L
            if tx.buy_sell == "BUY":
                pnl = (ltp - tx.price) * tx.quantity
                pnl_pct = ((ltp - tx.price) / tx.price * 100) if tx.price > 0 else 0.0
            else:
                pnl = (tx.price - ltp) * tx.quantity
                pnl_pct = ((tx.price - ltp) / tx.price * 100) if tx.price > 0 else 0.0
                
            if exists:
                # Update LTP and P&L dynamically
                exists.ltp = ltp
                exists.pnl = pnl
                exists.pnl_pct = pnl_pct
            else:
                # Insert new executed order from transactions
                new_ord = ExecutedOrder(
                    broker=tx.broker,
                    script=tx.script,
                    buy_sell=tx.buy_sell,
                    quantity=tx.quantity,
                    price=tx.price,
                    ltp=ltp,
                    amount=tx.quantity * tx.price,
                    pnl=pnl,
                    pnl_pct=pnl_pct,
                    order_id=str(order_id),
                    execution_time=tx.transaction_date
                )
                db.add(new_ord)
                count += 1
                
        db.commit()
        print(f"[Order Tracker] Sync cycle completed. Added {count} new executed orders.")
        
        # Log successful sync audit
        if count > 0:
            audit = AuditLog(
                category="SYNC",
                description=f"Auto-synced {count} new executed orders/trades from Zerodha and MStock API."
            )
            db.add(audit)
            db.commit()

    except Exception as e:
        db.rollback()
        print(f"[Order Tracker] Sync cycle error: {e}")
        audit = AuditLog(
            category="SYSTEM_ERROR",
            description=f"Executed Order sync cycle failed: {str(e)}"
        )
        db.add(audit)
        db.commit()
    finally:
        db.close()
    return count

def run_scheduler_loop():
    """
    Main loop that runs every 10 minutes.
    """
    print("[Order Tracker] Starting executed orders background synchronizer thread...")
    # Run once immediately on startup
    try:
        sync_executed_orders(force=True)
    except Exception as startup_err:
        print(f"[Order Tracker] Startup initial sync failed: {startup_err}")

    while True:
        try:
            # Sleep 10 minutes (600 seconds)
            time.sleep(600)
            sync_executed_orders(force=False)
        except Exception as loop_err:
            print(f"[Order Tracker] Scheduler loop encountered error: {loop_err}")
            time.sleep(60)

def start_order_tracker_thread():
    """
    Starts the scheduler loop in a daemon thread.
    """
    t = threading.Thread(target=run_scheduler_loop, name="OrderTrackerThread", daemon=True)
    t.start()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Standalone Executed Orders Sync Tracker")
    parser.add_argument("--force", action="store_true", help="Force sync and bypass market hours check")
    args = parser.parse_args()
    
    # Run standalone sync
    sync_executed_orders(force=args.force)
