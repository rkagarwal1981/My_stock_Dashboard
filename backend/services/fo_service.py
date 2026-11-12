import os
import re
import json
import time
import calendar
from datetime import datetime, date
from typing import Dict, List, Optional, Tuple
import pandas as pd

from services.order_book_tracker import get_zerodha_api_client
from services.market_data import fetch_single_ticker_data
from automation.browser import get_cookie_path

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_DIR = os.path.join(WORKSPACE_ROOT, "backend", "database")
os.makedirs(DB_DIR, exist_ok=True)

POSITIONS_CACHE_PATH = os.path.join(DB_DIR, "zerodha_fo_positions_cache.json")
TODAY_TRADES_CACHE_PATH = os.path.join(DB_DIR, "zerodha_fo_today_trades_cache.json")
FO_PREV_FY_PATH = os.path.join(DB_DIR, "zerodha_fo_prev_fy.xlsx")
FO_CURR_FY_PATH = os.path.join(DB_DIR, "zerodha_fo_curr_fy.xlsx")

NIFTY_LOT_SIZE = 65

MONTH_MAP = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12
}
INV_MONTH_MAP = {v: k for k, v in MONTH_MAP.items()}
WEEKLY_MONTH_MAP = {
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
    "7": 7, "8": 8, "9": 9, "O": 10, "N": 11, "D": 12
}


def _last_weekday_of_month(year: int, month: int, weekday: int) -> date:
    """
    Returns the last occurrence of `weekday` (0=Mon, 1=Tue, 3=Thu) in a given year/month.
    NSE Nifty monthly expiry transitioned to last Tuesday (or Thursday historically).
    """
    last_day = calendar.monthrange(year, month)[1]
    dt = date(year, month, last_day)
    offset = (dt.weekday() - weekday) % 7
    return date(year, month, last_day - offset)


def parse_nifty_fo_symbol(symbol: str, known_expiry_date: Optional[str] = None) -> dict:
    """
    Parses a Zerodha NFO tradingsymbol for NIFTY options/futures.
    Examples:
      - NIFTY26DEC25500PE -> year=2026, month=DEC, strike=25500, option_type=PE
      - NIFTY27MAR27000PE -> year=2027, month=MAR, strike=27000, option_type=PE
      - NIFTY2543021500PE -> weekly 2025-04-30, strike=21500, option_type=PE
      - NIFTY25AUGFUT     -> year=2025, month=AUG, option_type=FUT
    """
    sym = (symbol or "").strip().upper()

    # 1. Monthly / Long-dated Options: NIFTY + YY + MMM + STRIKE + (CE|PE)
    m_monthly = re.match(r"^NIFTY(\d{2})([A-Z]{3})(\d+)(CE|PE)$", sym)
    if m_monthly:
        yy, mmm, strike_str, opt_type = m_monthly.groups()
        year = 2000 + int(yy)
        month = MONTH_MAP.get(mmm, 12)
        strike = int(strike_str)
        exp_code = f"{yy}{mmm}"
        exp_label = f"{mmm} {year}"
        if known_expiry_date:
            exp_date_str = str(known_expiry_date)[:10]
        else:
            # NSE Nifty contracts from late 2024/2025 onwards expire on last Tuesday of month
            exp_dt = _last_weekday_of_month(year, month, 1)  # 1 = Tuesday
            exp_date_str = exp_dt.isoformat()
        return {
            "symbol": sym,
            "underlying": "NIFTY",
            "expiry_code": exp_code,
            "expiry_label": exp_label,
            "expiry_date": exp_date_str,
            "expiry_sort": f"{year:04d}-{month:02d}",
            "strike": strike,
            "option_type": opt_type,
            "is_weekly": False,
        }

    # 2. Weekly Options: NIFTY + YY + M(1-9,O,N,D) + DD + STRIKE + (CE|PE)
    m_weekly = re.match(r"^NIFTY(\d{2})([1-9OND])(\d{2})(\d+)(CE|PE)$", sym)
    if m_weekly:
        yy, m_char, dd, strike_str, opt_type = m_weekly.groups()
        year = 2000 + int(yy)
        month = WEEKLY_MONTH_MAP.get(m_char, 1)
        day = int(dd)
        mmm = INV_MONTH_MAP.get(month, "JAN")
        strike = int(strike_str)
        try:
            exp_dt = date(year, month, day)
            exp_date_str = exp_dt.isoformat()
        except ValueError:
            exp_date_str = known_expiry_date or f"{year:04d}-{month:02d}-{day:02d}"
        return {
            "symbol": sym,
            "underlying": "NIFTY",
            "expiry_code": f"{day:02d}{mmm}{yy}",
            "expiry_label": f"{day:02d} {mmm} {year}",
            "expiry_date": exp_date_str,
            "expiry_sort": exp_date_str,
            "strike": strike,
            "option_type": opt_type,
            "is_weekly": True,
        }

    # 3. Futures: NIFTY + YY + MMM + FUT
    m_fut = re.match(r"^NIFTY(\d{2})([A-Z]{3})FUT$", sym)
    if m_fut:
        yy, mmm = m_fut.groups()
        year = 2000 + int(yy)
        month = MONTH_MAP.get(mmm, 12)
        exp_dt = _last_weekday_of_month(year, month, 1)
        exp_date_str = str(known_expiry_date)[:10] if known_expiry_date else exp_dt.isoformat()
        return {
            "symbol": sym,
            "underlying": "NIFTY",
            "expiry_code": f"{yy}{mmm}",
            "expiry_label": f"{mmm} {year}",
            "expiry_date": exp_date_str,
            "expiry_sort": f"{year:04d}-{month:02d}",
            "strike": 0,
            "option_type": "FUT",
            "is_weekly": False,
        }

    return {
        "symbol": sym,
        "underlying": "NIFTY" if sym.startswith("NIFTY") else sym,
        "expiry_code": "UNKNOWN",
        "expiry_label": "Unknown",
        "expiry_date": known_expiry_date or "9999-12-31",
        "expiry_sort": known_expiry_date or "9999-12-31",
        "strike": 0,
        "option_type": "PE" if sym.endswith("PE") else ("CE" if sym.endswith("CE") else "OTHER"),
        "is_weekly": False,
    }


def _read_single_fo_excel(path: str) -> List[dict]:
    """
    Reads a Zerodha Console FO Tradebook Excel file and returns normalized trade dicts.
    """
    if not os.path.exists(path):
        return []
    try:
        df_raw = pd.read_excel(path, header=None)
        header_idx = None
        for idx, row in df_raw.iterrows():
            vals = [str(v).strip().lower() for v in row.values if pd.notna(v)]
            if "symbol" in vals and "trade date" in vals:
                header_idx = idx
                break
        if header_idx is None:
            return []

        df = pd.read_excel(path, skiprows=header_idx)
        records = []
        # Check if 15th column (Unnamed: 14 or Expiry Date) exists for exact expiry date
        cols = list(df.columns)
        expiry_col = None
        for c in cols:
            if "expiry" in str(c).lower() or str(c) == "Unnamed: 14":
                expiry_col = c

        for _, row in df.iterrows():
            sym = row.get("Symbol")
            t_date = row.get("Trade Date")
            if pd.isna(sym) or pd.isna(t_date):
                continue
            sym_str = str(sym).strip().upper()
            if not sym_str.startswith("NIFTY"):
                continue
            if sym_str in ("NIFTYBEES", "NIFTYETF", "NIFTYBEES-EQ", "NIFTYETF-EQ"):
                continue

            trade_type = str(row.get("Trade Type", "")).strip().upper()
            qty = float(row.get("Quantity") or 0.0)
            price = float(row.get("Price") or 0.0)
            exec_time = str(row.get("Order Execution Time") or t_date).strip()
            trade_date_str = str(t_date).strip()[:10]
            trade_id = str(row.get("Trade ID") or "").strip()
            if trade_id.endswith(".0"):
                trade_id = trade_id[:-2]
            order_id = str(row.get("Order ID") or "").strip()
            if order_id.endswith(".0"):
                order_id = order_id[:-2]

            exp_val = None
            if expiry_col and pd.notna(row.get(expiry_col)):
                exp_val = str(row.get(expiry_col)).strip()[:10]

            records.append({
                "symbol": sym_str,
                "trade_date": trade_date_str,
                "execution_time": exec_time,
                "buy_sell": trade_type,
                "quantity": qty,
                "price": price,
                "value": round(qty * price, 2),
                "trade_id": trade_id,
                "order_id": order_id,
                "expiry_date": exp_val,
                "exchange": str(row.get("Exchange") or "NFO").strip().upper(),
            })
        return records
    except Exception as e:
        print(f"[FO Service] Error reading {path}: {e}")
        return []


def load_all_nifty_fo_transactions() -> Tuple[List[dict], Dict[str, str]]:
    """
    Loads all historical Nifty F&O transactions from:
      1. backend/database/zerodha_fo_prev_fy.xlsx
      2. backend/database/zerodha_fo_curr_fy.xlsx
      3. backend/database/zerodha_fo_today_trades_cache.json (intraday Kite trades)
    Deduplicates by (symbol, trade_date, buy_sell, quantity, price, trade_id).
    Returns: (all_trades_list, symbol_to_expiry_date_map)
    """
    raw_list = []
    raw_list.extend(_read_single_fo_excel(FO_PREV_FY_PATH))
    raw_list.extend(_read_single_fo_excel(FO_CURR_FY_PATH))

    # Also merge cached intraday trades if any aren't in the Excel yet
    if os.path.exists(TODAY_TRADES_CACHE_PATH):
        try:
            with open(TODAY_TRADES_CACHE_PATH, "r", encoding="utf-8") as f:
                today_cached = json.load(f)
            if isinstance(today_cached, list):
                raw_list.extend(today_cached)
        except Exception as e:
            print(f"[FO Service] Error reading today trades cache: {e}")

    deduped = []
    seen_keys = set()
    expiry_map: Dict[str, str] = {}

    for r in raw_list:
        sym = r["symbol"]
        if r.get("expiry_date") and len(str(r["expiry_date"])) == 10:
            expiry_map[sym] = str(r["expiry_date"])

        t_id = str(r.get("trade_id") or "").strip()
        if t_id:
            key = (sym, t_id)
        else:
            key = (
                sym,
                r["trade_date"],
                r["buy_sell"],
                round(float(r["quantity"]), 2),
                round(float(r["price"]), 2),
                str(r.get("execution_time") or "")
            )
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(r)

    # Backfill expiry_date on all records
    for r in deduped:
        sym = r["symbol"]
        if not r.get("expiry_date") and sym in expiry_map:
            r["expiry_date"] = expiry_map[sym]

    # Sort descending by execution_time / trade_date
    deduped.sort(key=lambda x: (x.get("execution_time") or x.get("trade_date") or ""), reverse=True)
    return deduped, expiry_map


FO_LTP_CACHE_TTL_SECONDS = 300  # 5 minutes
_FO_CONTRACT_LTP_CACHE: Dict[str, Tuple[float, float]] = {}  # symbol -> (ltp, timestamp)


def fetch_zerodha_nifty_positions(refresh: bool = False) -> Tuple[List[dict], Optional[str]]:
    """
    Fetches Zerodha F&O positions for NIFTY.
    If refresh=True, cache does not exist, or cache is older than 5 minutes (300s),
    connects to Zerodha KiteConnect API to pull live positions and today's F&O trades.
    Returns: (positions_list, last_synced_iso)
    """
    cache_expired = False
    if os.path.exists(POSITIONS_CACHE_PATH):
        try:
            age_seconds = time.time() - os.path.getmtime(POSITIONS_CACHE_PATH)
            if age_seconds >= FO_LTP_CACHE_TTL_SECONDS:
                cache_expired = True
        except Exception:
            pass

    should_pull_live = refresh or (not os.path.exists(POSITIONS_CACHE_PATH)) or cache_expired

    if should_pull_live:
        try:
            kite = get_zerodha_api_client()
            if kite:
                pos_resp = kite.positions()
                net_positions = pos_resp.get("net", []) if isinstance(pos_resp, dict) else []
                nifty_positions = [
                    p for p in net_positions
                    if str(p.get("tradingsymbol") or "").upper().startswith("NIFTY")
                    and (p.get("exchange") == "NFO" or p.get("segment") == "FO")
                ]
                now_iso = datetime.now().isoformat()
                cache_payload = {
                    "synced_at": now_iso,
                    "positions": nifty_positions
                }
                with open(POSITIONS_CACHE_PATH, "w", encoding="utf-8") as f:
                    json.dump(cache_payload, f, indent=2, default=str)

                # Also fetch today's trades from Kite so intraday fills are captured immediately
                try:
                    raw_trades = kite.trades() or []
                    today_fo_trades = []
                    for tr in raw_trades:
                        sym = str(tr.get("tradingsymbol") or "").strip().upper()
                        if not sym.startswith("NIFTY") or sym in ("NIFTYBEES", "NIFTYETF"):
                            continue
                        fill_ts = tr.get("fill_timestamp") or tr.get("order_timestamp") or datetime.now()
                        fill_str = str(fill_ts).replace(" ", "T")
                        t_date_str = fill_str[:10]
                        qty = float(tr.get("quantity") or 0.0)
                        price = float(tr.get("average_price") or tr.get("price") or 0.0)
                        today_fo_trades.append({
                            "symbol": sym,
                            "trade_date": t_date_str,
                            "execution_time": fill_str,
                            "buy_sell": str(tr.get("transaction_type") or "BUY").strip().upper(),
                            "quantity": qty,
                            "price": price,
                            "value": round(qty * price, 2),
                            "trade_id": str(tr.get("trade_id") or ""),
                            "order_id": str(tr.get("order_id") or ""),
                            "expiry_date": None,
                            "exchange": str(tr.get("exchange") or "NFO"),
                        })
                    with open(TODAY_TRADES_CACHE_PATH, "w", encoding="utf-8") as f:
                        json.dump(today_fo_trades, f, indent=2)
                except Exception as et:
                    print(f"[FO Service] Warning fetching today's Kite trades: {et}")

                return nifty_positions, now_iso
        except Exception as e:
            print(f"[FO Service] Live Kite positions fetch failed, falling back to cache: {e}")

    # Load from cache if available
    if os.path.exists(POSITIONS_CACHE_PATH):
        try:
            with open(POSITIONS_CACHE_PATH, "r", encoding="utf-8") as f:
                cached = json.load(f)
            return cached.get("positions", []), cached.get("synced_at")
        except Exception as e:
            print(f"[FO Service] Error reading positions cache: {e}")

    return [], None


def sync_zerodha_fo_console_tradebook() -> bool:
    """
    Uses headless Playwright to download the current FY F&O tradebook from Zerodha Console
    to `backend/database/zerodha_fo_curr_fy.xlsx`.
    """
    try:
        import asyncio
        import sys
        import pyotp
        from playwright.sync_api import sync_playwright
        from services.broker_api import get_zerodha_credentials

        if sys.platform == "win32":
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
            except Exception:
                pass

        creds = get_zerodha_credentials()
        username = creds.get("username")
        password = creds.get("password")
        totp_key = creds.get("totp_key")
        pin = creds.get("pin")
        cookie_path = os.path.join(DB_DIR, "cookies", "zerodha_session.json")

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context_args = {"accept_downloads": True}
            if os.path.exists(cookie_path):
                context_args["storage_state"] = cookie_path
            context = browser.new_context(**context_args)
            page = context.new_page()

            page.goto("https://console.zerodha.com/reports/tradebook", timeout=45000)
            time.sleep(3)

            if "kite.zerodha.com" in page.url or "login" in page.url or "twofa" in page.url:
                if page.locator("input#password").is_visible():
                    for inp in page.locator("input#userid").all():
                        if inp.is_visible():
                            inp.fill(username)
                            break
                    page.fill("input#password", password)
                    page.click("button[type='submit']")
                    time.sleep(3)

                for inp in page.locator("input").all():
                    if inp.is_visible() and inp.get_attribute("type") != "hidden" and inp.get_attribute("id") != "password":
                        if totp_key:
                            otp = pyotp.TOTP(totp_key.strip()).now()
                            inp.fill(otp)
                        elif pin:
                            inp.fill(pin)
                        break

                for _ in range(15):
                    time.sleep(1)
                    if "console.zerodha.com" in page.url:
                        break
                context.storage_state(path=cookie_path)
                if "tradebook" not in page.url:
                    page.goto("https://console.zerodha.com/reports/tradebook", timeout=30000)
                    time.sleep(3)

            # Select FO segment
            page.locator("select").first.select_option("FO")
            time.sleep(0.5)

            # Open date range and click current FY
            date_inp = page.locator("input[name='date']").first
            date_inp.click()
            time.sleep(0.8)
            page.locator(".mx-shortcuts:has-text('current FY')").first.click()
            time.sleep(0.8)

            # Click submit
            page.locator("button.btn-blue, button[type='submit']").first.click()
            time.sleep(4)

            with page.expect_download(timeout=25000) as download_info:
                page.locator("a:has-text('XLSX'), button:has-text('XLSX'), a[title*='XLSX'], a:has-text('xlsx')").first.click()
            dl = download_info.value
            dl.save_as(FO_CURR_FY_PATH)
            browser.close()
            return True
    except Exception as e:
        print(f"[FO Service] Console FO tradebook sync error: {e}")
        return False


def get_nifty_fo_dashboard_data(refresh: bool = False) -> dict:
    """
    Builds the complete Nifty F&O analysis payload for Zerodha:
      - Live Nifty 50 Spot Price & Change %
      - Open PE and CE Positions with Strike, Expiry, Lots, Avg Price, LTP, P&L, M2M, Moneyness
      - Today's Exited / Shifted Positions
      - Expiry-wise PE vs CE Matrix & Iron Condor Balance Metrics
      - Historical Contract Catalog
    """
    # 1. Fetch Nifty 50 Spot Price from Yahoo Finance (%5ENSEI)
    spot_price, spot_change_pct = fetch_single_ticker_data("%5ENSEI")

    # 2. Load historical transactions & expiry lookup
    all_txs, expiry_map = load_all_nifty_fo_transactions()
    tx_count_by_symbol: Dict[str, int] = {}
    tx_stats_by_symbol: Dict[str, dict] = {}
    for tx in all_txs:
        sym = tx["symbol"]
        tx_count_by_symbol[sym] = tx_count_by_symbol.get(sym, 0) + 1
        if sym not in tx_stats_by_symbol:
            tx_stats_by_symbol[sym] = {
                "buy_qty": 0.0,
                "buy_val": 0.0,
                "sell_qty": 0.0,
                "sell_val": 0.0,
                "first_date": tx["trade_date"],
                "last_date": tx["trade_date"],
                "trade_count": 0,
            }
        st = tx_stats_by_symbol[sym]
        st["trade_count"] += 1
        if tx["trade_date"] < st["first_date"]:
            st["first_date"] = tx["trade_date"]
        if tx["trade_date"] > st["last_date"]:
            st["last_date"] = tx["trade_date"]
        if tx["buy_sell"] == "BUY":
            st["buy_qty"] += tx["quantity"]
            st["buy_val"] += tx["value"]
        elif tx["buy_sell"] == "SELL":
            st["sell_qty"] += tx["quantity"]
            st["sell_val"] += tx["value"]

    # 3. Fetch Zerodha Nifty Positions
    raw_positions, last_synced = fetch_zerodha_nifty_positions(refresh=refresh)

    today_dt = date.today()
    pe_open: List[dict] = []
    ce_open: List[dict] = []
    closed_today: List[dict] = []

    for pos in raw_positions:
        sym = str(pos.get("tradingsymbol") or "").strip().upper()
        if not sym.startswith("NIFTY"):
            continue

        meta = parse_nifty_fo_symbol(sym, known_expiry_date=expiry_map.get(sym))
        exp_date_str = meta["expiry_date"]
        try:
            exp_dt = date.fromisoformat(exp_date_str)
            dte = max((exp_dt - today_dt).days, 0)
        except Exception:
            dte = None

        qty = int(round(float(pos.get("quantity") or 0)))
        abs_qty = abs(qty)
        lots = round(abs_qty / NIFTY_LOT_SIZE, 2)
        net_lots = round(qty / NIFTY_LOT_SIZE, 2)

        avg_price = float(pos.get("average_price") or 0.0)
        # When quantity is 0 (exited today), compute buy/sell prices from position fields
        buy_price = float(pos.get("buy_price") or 0.0)
        sell_price = float(pos.get("sell_price") or 0.0)
        if qty > 0 and avg_price == 0:
            avg_price = buy_price
        elif qty < 0 and avg_price == 0:
            avg_price = sell_price

        ltp = float(pos.get("last_price") or 0.0)
        close_price = float(pos.get("close_price") or 0.0)
        pnl = float(pos.get("pnl") or 0.0)
        m2m = float(pos.get("m2m") or 0.0)
        unrealised = float(pos.get("unrealised") or pnl)
        realised = float(pos.get("realised") or 0.0)

        strike = meta["strike"]
        opt_type = meta["option_type"]

        # Moneyness & Distance from Nifty Spot
        dist_pts = 0.0
        dist_pct = 0.0
        moneyness = "ATM"
        if spot_price and spot_price > 0 and strike > 0:
            dist_pts = round(strike - spot_price, 2)
            dist_pct = round(((strike - spot_price) / spot_price) * 100.0, 2)
            if opt_type == "PE":
                moneyness = "ITM" if strike > spot_price else "OTM"
            elif opt_type == "CE":
                moneyness = "ITM" if strike < spot_price else "OTM"

        # Calculate P&L % on premium
        invested_or_credit = abs_qty * avg_price
        pnl_pct = round((pnl / invested_or_credit) * 100.0, 2) if invested_or_credit > 0 else 0.0

        # Points captured / decayed per share
        pts_change = round(ltp - avg_price, 2) if qty > 0 else (round(avg_price - ltp, 2) if qty < 0 else round(sell_price - buy_price, 2))

        enriched = {
            "tradingsymbol": sym,
            "expiry_code": meta["expiry_code"],
            "expiry_label": meta["expiry_label"],
            "expiry_date": exp_date_str,
            "expiry_sort": meta["expiry_sort"],
            "days_to_expiry": dte,
            "strike": strike,
            "option_type": opt_type,
            "position_side": "LONG" if qty > 0 else ("SHORT" if qty < 0 else "EXITED"),
            "quantity": qty,
            "abs_quantity": abs_qty,
            "lots": lots,
            "net_lots": net_lots,
            "overnight_quantity": int(round(float(pos.get("overnight_quantity") or 0))),
            "day_buy_quantity": int(round(float(pos.get("day_buy_quantity") or 0))),
            "day_sell_quantity": int(round(float(pos.get("day_sell_quantity") or 0))),
            "average_price": round(avg_price, 2),
            "buy_price": round(buy_price, 2),
            "sell_price": round(sell_price, 2),
            "last_price": round(ltp, 2),
            "close_price": round(close_price, 2),
            "pts_captured": pts_change,
            "premium_value": round(abs_qty * avg_price, 2),
            "current_market_value": round(abs_qty * ltp, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": pnl_pct,
            "m2m": round(m2m, 2),
            "unrealised": round(unrealised, 2),
            "realised": round(realised, 2),
            "distance_from_spot": dist_pts,
            "distance_from_spot_pct": dist_pct,
            "moneyness": moneyness,
            "tx_count": tx_count_by_symbol.get(sym, 0),
        }

        if qty != 0:
            if opt_type == "PE":
                pe_open.append(enriched)
            elif opt_type == "CE":
                ce_open.append(enriched)
        else:
            closed_today.append(enriched)

    # Sort open positions by expiry_date asc, then strike asc
    pe_open.sort(key=lambda x: (x["expiry_date"], x["strike"]))
    ce_open.sort(key=lambda x: (x["expiry_date"], x["strike"]))
    closed_today.sort(key=lambda x: (x["expiry_date"], x["option_type"], x["strike"]))

    # 4. Build Expiry-wise PE vs CE Matrix (Iron Condor & Spread Tracker)
    expiry_buckets: Dict[str, dict] = {}
    for item in pe_open + ce_open:
        ec = item["expiry_code"]
        if ec not in expiry_buckets:
            expiry_buckets[ec] = {
                "expiry_code": ec,
                "expiry_label": item["expiry_label"],
                "expiry_date": item["expiry_date"],
                "days_to_expiry": item["days_to_expiry"],
                "pe_short_qty": 0,
                "pe_short_lots": 0.0,
                "pe_long_qty": 0,
                "pe_long_lots": 0.0,
                "pe_short_strikes": [],
                "pe_long_strikes": [],
                "pe_credit_val": 0.0,
                "pe_debit_val": 0.0,
                "pe_short_ltp_val": 0.0,
                "pe_long_ltp_val": 0.0,
                "pe_pnl": 0.0,
                "pe_m2m": 0.0,
                "ce_short_qty": 0,
                "ce_short_lots": 0.0,
                "ce_long_qty": 0,
                "ce_long_lots": 0.0,
                "ce_short_strikes": [],
                "ce_long_strikes": [],
                "ce_credit_val": 0.0,
                "ce_debit_val": 0.0,
                "ce_short_ltp_val": 0.0,
                "ce_long_ltp_val": 0.0,
                "ce_pnl": 0.0,
                "ce_m2m": 0.0,
            }
        b = expiry_buckets[ec]
        if item["option_type"] == "PE":
            b["pe_pnl"] += item["pnl"]
            b["pe_m2m"] += item["m2m"]
            if item["quantity"] < 0:
                b["pe_short_qty"] += item["abs_quantity"]
                b["pe_short_lots"] += item["lots"]
                b["pe_short_strikes"].append(f"{item['strike']} ({int(item['lots'])}L @ ₹{item['average_price']:.0f})")
                b["pe_credit_val"] += item["premium_value"]
                b["pe_short_ltp_val"] += item["current_market_value"]
            else:
                b["pe_long_qty"] += item["abs_quantity"]
                b["pe_long_lots"] += item["lots"]
                b["pe_long_strikes"].append(f"{item['strike']} ({int(item['lots'])}L @ ₹{item['average_price']:.0f})")
                b["pe_debit_val"] += item["premium_value"]
                b["pe_long_ltp_val"] += item["current_market_value"]
        elif item["option_type"] == "CE":
            b["ce_pnl"] += item["pnl"]
            b["ce_m2m"] += item["m2m"]
            if item["quantity"] < 0:
                b["ce_short_qty"] += item["abs_quantity"]
                b["ce_short_lots"] += item["lots"]
                b["ce_short_strikes"].append(f"{item['strike']} ({int(item['lots'])}L @ ₹{item['average_price']:.0f})")
                b["ce_credit_val"] += item["premium_value"]
                b["ce_short_ltp_val"] += item["current_market_value"]
            else:
                b["ce_long_qty"] += item["abs_quantity"]
                b["ce_long_lots"] += item["lots"]
                b["ce_long_strikes"].append(f"{item['strike']} ({int(item['lots'])}L @ ₹{item['average_price']:.0f})")
                b["ce_debit_val"] += item["premium_value"]
                b["ce_long_ltp_val"] += item["current_market_value"]

    expiry_breakdown = []
    for ec, b in sorted(expiry_buckets.items(), key=lambda kv: kv[1]["expiry_date"]):
        pe_net_credit = b["pe_credit_val"] - b["pe_debit_val"]
        ce_net_credit = b["ce_credit_val"] - b["ce_debit_val"]
        pe_net_pts = round(pe_net_credit / b["pe_short_qty"], 2) if b["pe_short_qty"] > 0 else 0.0
        ce_net_pts = round(ce_net_credit / b["ce_short_qty"], 2) if b["ce_short_qty"] > 0 else 0.0

        pe_net_ltp = b["pe_short_ltp_val"] - b["pe_long_ltp_val"]
        ce_net_ltp = b["ce_short_ltp_val"] - b["ce_long_ltp_val"]
        pe_net_ltp_pts = round(pe_net_ltp / b["pe_short_qty"], 2) if b["pe_short_qty"] > 0 else 0.0
        ce_net_ltp_pts = round(ce_net_ltp / b["ce_short_qty"], 2) if b["ce_short_qty"] > 0 else 0.0

        expiry_breakdown.append({
            **b,
            "pe_pnl": round(b["pe_pnl"], 2),
            "pe_m2m": round(b["pe_m2m"], 2),
            "ce_pnl": round(b["ce_pnl"], 2),
            "ce_m2m": round(b["ce_m2m"], 2),
            "pe_net_credit_val": round(pe_net_credit, 2),
            "ce_net_credit_val": round(ce_net_credit, 2),
            "pe_net_credit_pts": pe_net_pts,
            "ce_net_credit_pts": ce_net_pts,
            "pe_net_ltp_val": round(pe_net_ltp, 2),
            "ce_net_ltp_val": round(ce_net_ltp, 2),
            "pe_net_ltp_pts": pe_net_ltp_pts,
            "ce_net_ltp_pts": ce_net_ltp_pts,
            "total_net_credit_val": round(pe_net_credit + ce_net_credit, 2),
            "total_pnl": round(b["pe_pnl"] + b["ce_pnl"], 2),
            "total_m2m": round(b["pe_m2m"] + b["ce_m2m"], 2),
            "is_pe_hedged": b["pe_short_qty"] == b["pe_long_qty"],
            "is_ce_hedged": b["ce_short_qty"] == b["ce_long_qty"],
            "iron_condor_lots": min(b["pe_short_lots"], b["ce_short_lots"]),
            "imbalance_lots": round(b["pe_short_lots"] - b["ce_short_lots"], 2),
            "imbalance_qty": b["pe_short_qty"] - b["ce_short_qty"],
        })

    # 5. Overall Summary & PE vs CE Balance
    pe_short_qty = sum(x["abs_quantity"] for x in pe_open if x["quantity"] < 0)
    pe_long_qty = sum(x["abs_quantity"] for x in pe_open if x["quantity"] > 0)
    pe_short_lots = round(pe_short_qty / NIFTY_LOT_SIZE, 2)
    pe_long_lots = round(pe_long_qty / NIFTY_LOT_SIZE, 2)
    pe_pnl = round(sum(x["pnl"] for x in pe_open), 2)
    pe_m2m = round(sum(x["m2m"] for x in pe_open), 2)
    pe_net_credit_val = round(
        sum(x["premium_value"] for x in pe_open if x["quantity"] < 0) -
        sum(x["premium_value"] for x in pe_open if x["quantity"] > 0),
        2
    )

    ce_short_qty = sum(x["abs_quantity"] for x in ce_open if x["quantity"] < 0)
    ce_long_qty = sum(x["abs_quantity"] for x in ce_open if x["quantity"] > 0)
    ce_short_lots = round(ce_short_qty / NIFTY_LOT_SIZE, 2)
    ce_long_lots = round(ce_long_qty / NIFTY_LOT_SIZE, 2)
    ce_pnl = round(sum(x["pnl"] for x in ce_open), 2)
    ce_m2m = round(sum(x["m2m"] for x in ce_open), 2)
    ce_net_credit_val = round(
        sum(x["premium_value"] for x in ce_open if x["quantity"] < 0) -
        sum(x["premium_value"] for x in ce_open if x["quantity"] > 0),
        2
    )

    closed_today_pnl = round(sum(x["pnl"] for x in closed_today), 2)
    imbalance_lots = round(pe_short_lots - ce_short_lots, 2)
    imbalance_qty = pe_short_qty - ce_short_qty

    if imbalance_lots > 0:
        balance_status = "PE_HEAVY"
        recommendation = (
            f"PE has {int(pe_short_lots)} short lots vs "
            f"CE {int(ce_short_lots)} short lots. "
            f"Add {int(abs(imbalance_lots))} lots of CE spread to balance your Iron Condor."
        )
    elif imbalance_lots < 0:
        balance_status = "CE_HEAVY"
        recommendation = (
            f"CE has {int(ce_short_lots)} short lots vs "
            f"PE {int(pe_short_lots)} short lots. "
            f"Add {int(abs(imbalance_lots))} lots of PE spread to balance your Iron Condor."
        )
    else:
        balance_status = "BALANCED"
        recommendation = f"Perfectly balanced Iron Condor: {int(pe_short_lots)} PE spread lots and {int(ce_short_lots)} CE spread lots."

    # 6. Historical Contracts Catalog (for exploring any past or active contract)
    historical_contracts = []
    for sym, st in tx_stats_by_symbol.items():
        meta = parse_nifty_fo_symbol(sym, known_expiry_date=expiry_map.get(sym))
        net_q = round(st["buy_qty"] - st["sell_qty"], 2)
        historical_contracts.append({
            "symbol": sym,
            "expiry_code": meta["expiry_code"],
            "expiry_label": meta["expiry_label"],
            "expiry_date": meta["expiry_date"],
            "strike": meta["strike"],
            "option_type": meta["option_type"],
            "buy_qty": int(round(st["buy_qty"])),
            "sell_qty": int(round(st["sell_qty"])),
            "net_qty": int(round(net_q)),
            "buy_lots": round(st["buy_qty"] / NIFTY_LOT_SIZE, 2),
            "sell_lots": round(st["sell_qty"] / NIFTY_LOT_SIZE, 2),
            "net_lots": round(net_q / NIFTY_LOT_SIZE, 2),
            "trade_count": st["trade_count"],
            "first_date": st["first_date"],
            "last_date": st["last_date"],
        })
    historical_contracts.sort(key=lambda x: (x["last_date"], x["symbol"]), reverse=True)

    return {
        "broker": "Zerodha",
        "instrument": "NIFTY",
        "lot_size": NIFTY_LOT_SIZE,
        "spot_price": round(spot_price, 2) if spot_price else None,
        "spot_change_pct": round(spot_change_pct, 2) if spot_change_pct else 0.0,
        "last_synced": last_synced,
        "summary": {
            "open_pe_contracts": len(pe_open),
            "open_ce_contracts": len(ce_open),
            "pe_short_qty": pe_short_qty,
            "pe_short_lots": pe_short_lots,
            "pe_long_qty": pe_long_qty,
            "pe_long_lots": pe_long_lots,
            "pe_net_qty": pe_long_qty - pe_short_qty,
            "pe_pnl": pe_pnl,
            "pe_m2m": pe_m2m,
            "pe_net_credit_val": pe_net_credit_val,
            "ce_short_qty": ce_short_qty,
            "ce_short_lots": ce_short_lots,
            "ce_long_qty": ce_long_qty,
            "ce_long_lots": ce_long_lots,
            "ce_net_qty": ce_long_qty - ce_short_qty,
            "ce_pnl": ce_pnl,
            "ce_m2m": ce_m2m,
            "ce_net_credit_val": ce_net_credit_val,
            "total_open_pnl": round(pe_pnl + ce_pnl, 2),
            "total_day_m2m": round(pe_m2m + ce_m2m, 2),
            "closed_today_pnl": closed_today_pnl,
            "total_net_credit_val": round(pe_net_credit_val + ce_net_credit_val, 2),
            "matched_ic_lots": min(pe_short_lots, ce_short_lots),
            "imbalance_lots": imbalance_lots,
            "imbalance_qty": imbalance_qty,
            "balance_status": balance_status,
            "recommendation": recommendation,
        },
        "expiry_breakdown": expiry_breakdown,
        "pe_positions": pe_open,
        "ce_positions": ce_open,
        "closed_today_positions": closed_today,
        "historical_contracts": historical_contracts,
    }


def _get_contract_ltp_5min(sym: str) -> Optional[float]:
    """
    Returns the current LTP for a Nifty F&O contract `sym`, cached for 5 minutes (300 seconds).
    First checks the 5-minute cached positions; if not found there, queries Kite LTP and caches for 5 mins.
    """
    now_ts = time.time()
    cached_entry = _FO_CONTRACT_LTP_CACHE.get(sym)
    if cached_entry and (now_ts - cached_entry[1]) < FO_LTP_CACHE_TTL_SECONDS:
        return cached_entry[0]

    positions, _ = fetch_zerodha_nifty_positions(refresh=False)
    for p in positions:
        if str(p.get("tradingsymbol") or "").strip().upper() == sym:
            last_p = float(p.get("last_price") or 0.0)
            if last_p > 0:
                _FO_CONTRACT_LTP_CACHE[sym] = (last_p, now_ts)
                return last_p

    # Fallback: query Kite LTP directly if contract is not in open positions
    try:
        kite = get_zerodha_api_client()
        if kite:
            key = f"NFO:{sym}"
            resp = kite.ltp([key])
            if isinstance(resp, dict) and key in resp:
                last_p = float(resp[key].get("last_price") or 0.0)
                if last_p > 0:
                    _FO_CONTRACT_LTP_CACHE[sym] = (last_p, now_ts)
                    return last_p
    except Exception as e:
        print(f"[FO Service] Could not fetch Kite LTP for {sym}: {e}")

    return cached_entry[0] if cached_entry else None


def get_nifty_contract_history(symbol: str) -> dict:
    """
    Returns complete historical transactions, daily aggregated timeline, and
    bar-chart series (Buy Qty & Sell Qty by Date) for a specific Nifty F&O symbol.
    """
    sym = (symbol or "").strip().upper()
    all_txs, expiry_map = load_all_nifty_fo_transactions()
    meta = parse_nifty_fo_symbol(sym, known_expiry_date=expiry_map.get(sym))
    current_ltp = _get_contract_ltp_5min(sym)

    contract_txs = [t for t in all_txs if t["symbol"] == sym]
    # Sort ascending by execution_time for cumulative calculations
    contract_txs_asc = sorted(contract_txs, key=lambda x: (x.get("execution_time") or x.get("trade_date") or ""))

    date_map: Dict[str, dict] = {}
    total_buy_qty = 0.0
    total_buy_val = 0.0
    total_sell_qty = 0.0
    total_sell_val = 0.0

    individual_rows = []
    running_net_qty = 0.0

    for t in contract_txs_asc:
        d_str = t["trade_date"]
        qty = float(t["quantity"])
        price = float(t["price"])
        val = round(qty * price, 2)
        bs = t["buy_sell"].upper()

        if bs == "BUY":
            total_buy_qty += qty
            total_buy_val += val
            running_net_qty += qty
        elif bs == "SELL":
            total_sell_qty += qty
            total_sell_val += val
            running_net_qty -= qty

        if d_str not in date_map:
            date_map[d_str] = {
                "date": d_str,
                "buyQty": 0.0,
                "sellQty": 0.0,
                "buyValue": 0.0,
                "sellValue": 0.0,
                "buyTrades": 0,
                "sellTrades": 0,
                "cumulativeNetQty": 0.0,
            }
        dm = date_map[d_str]
        if bs == "BUY":
            dm["buyQty"] += qty
            dm["buyValue"] += val
            dm["buyTrades"] += 1
        elif bs == "SELL":
            dm["sellQty"] += qty
            dm["sellValue"] += val
            dm["sellTrades"] += 1
        dm["cumulativeNetQty"] = running_net_qty

        individual_rows.append({
            "trade_date": d_str,
            "execution_time": t.get("execution_time") or d_str,
            "buy_sell": bs,
            "quantity": int(round(qty)),
            "lots": round(qty / NIFTY_LOT_SIZE, 2),
            "price": round(price, 2),
            "value": val,
            "order_id": t.get("order_id") or "",
            "trade_id": t.get("trade_id") or "",
            "running_net_qty": int(round(running_net_qty)),
            "running_net_lots": round(running_net_qty / NIFTY_LOT_SIZE, 2),
        })

    # Reverse individual_rows so newest is at top of table
    individual_rows.reverse()

    # Build chart_data (chronological) and daily_timeline (newest first)
    chart_data = []
    daily_timeline = []

    for d_str in sorted(date_map.keys()):
        dm = date_map[d_str]
        b_qty = int(round(dm["buyQty"]))
        s_qty = int(round(dm["sellQty"]))
        b_val = round(dm["buyValue"], 2)
        s_val = round(dm["sellValue"], 2)
        b_price = round(b_val / b_qty, 2) if b_qty > 0 else 0.0
        s_price = round(s_val / s_qty, 2) if s_qty > 0 else 0.0
        cum_net = int(round(dm["cumulativeNetQty"]))

        chart_data.append({
            "date": d_str,
            "buyQty": b_qty,
            "sellQty": s_qty,
            "buyLots": round(b_qty / NIFTY_LOT_SIZE, 2),
            "sellLots": round(s_qty / NIFTY_LOT_SIZE, 2),
            "buyPrice": b_price,
            "sellPrice": s_price,
            "buyValue": b_val,
            "sellValue": s_val,
            "cumulativeNetQty": cum_net,
            "cumulativeNetLots": round(cum_net / NIFTY_LOT_SIZE, 2),
        })

        if b_qty > 0:
            b_diff = round(current_ltp - b_price, 2) if (current_ltp is not None and b_price > 0) else None
            b_diff_pct = round(((current_ltp - b_price) / b_price) * 100.0, 2) if (current_ltp is not None and b_price > 0) else None
            daily_timeline.append({
                "date": d_str,
                "buy_sell": "BUY",
                "quantity": b_qty,
                "lots": round(b_qty / NIFTY_LOT_SIZE, 2),
                "price": b_price,
                "value": b_val,
                "ltp": current_ltp,
                "diff": b_diff,
                "diff_pct": b_diff_pct,
                "trades_count": dm["buyTrades"],
            })
        if s_qty > 0:
            s_diff = round(current_ltp - s_price, 2) if (current_ltp is not None and s_price > 0) else None
            s_diff_pct = round(((current_ltp - s_price) / s_price) * 100.0, 2) if (current_ltp is not None and s_price > 0) else None
            daily_timeline.append({
                "date": d_str,
                "buy_sell": "SELL",
                "quantity": s_qty,
                "lots": round(s_qty / NIFTY_LOT_SIZE, 2),
                "price": s_price,
                "value": s_val,
                "ltp": current_ltp,
                "diff": s_diff,
                "diff_pct": s_diff_pct,
                "trades_count": dm["sellTrades"],
            })

    daily_timeline.sort(key=lambda x: (x["date"], x["buy_sell"]), reverse=True)

    # Build Net Consolidation (netting paired Sell & Buy hedge legs for same expiry_code & option_type by date)
    spread_date_map: Dict[str, dict] = {}
    target_exp_code = meta["expiry_code"]
    target_opt_type = meta["option_type"]

    for t in all_txs:
        t_meta = parse_nifty_fo_symbol(t["symbol"], known_expiry_date=expiry_map.get(t["symbol"]))
        if t_meta["expiry_code"] != target_exp_code or t_meta["option_type"] != target_opt_type:
            continue
        d_str = t["trade_date"]
        qty = float(t["quantity"])
        price = float(t["price"])
        bs = t["buy_sell"].upper()
        t_ltp = _get_contract_ltp_5min(t["symbol"])

        if d_str not in spread_date_map:
            spread_date_map[d_str] = {
                "sell_qty": 0.0,
                "sell_val": 0.0,
                "sell_ltp_num": 0.0,
                "sell_ltp_den": 0.0,
                "buy_qty": 0.0,
                "buy_val": 0.0,
                "buy_ltp_num": 0.0,
                "buy_ltp_den": 0.0,
            }
        sd = spread_date_map[d_str]
        if bs == "SELL":
            sd["sell_qty"] += qty
            sd["sell_val"] += qty * price
            if t_ltp is not None:
                sd["sell_ltp_num"] += qty * t_ltp
                sd["sell_ltp_den"] += qty
        elif bs == "BUY":
            sd["buy_qty"] += qty
            sd["buy_val"] += qty * price
            if t_ltp is not None:
                sd["buy_ltp_num"] += qty * t_ltp
                sd["buy_ltp_den"] += qty

    net_consolidation = []
    for d_str in sorted(spread_date_map.keys(), reverse=True):
        sd = spread_date_map[d_str]
        s_qty = sd["sell_qty"]
        b_qty = sd["buy_qty"]
        if s_qty <= 0 and b_qty <= 0:
            continue
        sell_avg = round(sd["sell_val"] / s_qty, 2) if s_qty > 0 else 0.0
        buy_avg = round(sd["buy_val"] / b_qty, 2) if b_qty > 0 else 0.0
        sell_ltp = round(sd["sell_ltp_num"] / sd["sell_ltp_den"], 2) if sd["sell_ltp_den"] > 0 else None
        buy_ltp = round(sd["buy_ltp_num"] / sd["buy_ltp_den"], 2) if sd["buy_ltp_den"] > 0 else None

        lots = round((s_qty if s_qty > 0 else b_qty) / NIFTY_LOT_SIZE, 2)
        net_avg = round(sell_avg - buy_avg, 2)
        net_ltp = (
            round((sell_ltp or 0.0) - (buy_ltp or 0.0), 2)
            if (sell_ltp is not None or buy_ltp is not None)
            else None
        )
        diff = round(net_avg - net_ltp, 2) if net_ltp is not None else None
        diff_pct = (
            round((diff / abs(net_avg)) * 100.0, 2)
            if (diff is not None and net_avg != 0)
            else None
        )
        net_consolidation.append({
            "date": d_str,
            "lots": lots,
            "sell_avg_price": sell_avg,
            "buy_avg_price": buy_avg,
            "net_avg_price": net_avg,
            "sell_ltp": sell_ltp,
            "buy_ltp": buy_ltp,
            "net_ltp": net_ltp,
            "diff": diff,
            "diff_pct": diff_pct,
        })

    avg_buy_price = round(total_buy_val / total_buy_qty, 2) if total_buy_qty > 0 else 0.0
    avg_sell_price = round(total_sell_val / total_sell_qty, 2) if total_sell_qty > 0 else 0.0
    net_qty = int(round(total_buy_qty - total_sell_qty))

    return {
        "symbol": sym,
        "expiry_code": meta["expiry_code"],
        "expiry_label": meta["expiry_label"],
        "expiry_date": meta["expiry_date"],
        "strike": meta["strike"],
        "option_type": meta["option_type"],
        "lot_size": NIFTY_LOT_SIZE,
        "current_ltp": current_ltp,
        "summary": {
            "total_buy_qty": int(round(total_buy_qty)),
            "total_buy_lots": round(total_buy_qty / NIFTY_LOT_SIZE, 2),
            "avg_buy_price": avg_buy_price,
            "total_buy_value": round(total_buy_val, 2),
            "total_sell_qty": int(round(total_sell_qty)),
            "total_sell_lots": round(total_sell_qty / NIFTY_LOT_SIZE, 2),
            "avg_sell_price": avg_sell_price,
            "total_sell_value": round(total_sell_val, 2),
            "net_qty": net_qty,
            "net_lots": round(net_qty / NIFTY_LOT_SIZE, 2),
            "net_cashflow": round(total_sell_val - total_buy_val, 2),
            "trade_count": len(individual_rows),
            "active_days": len(date_map),
            "first_trade_date": chart_data[0]["date"] if chart_data else None,
            "last_trade_date": chart_data[-1]["date"] if chart_data else None,
        },
        "chart_data": chart_data,
        "daily_timeline": daily_timeline,
        "net_consolidation": net_consolidation,
        "transactions": individual_rows,
    }

