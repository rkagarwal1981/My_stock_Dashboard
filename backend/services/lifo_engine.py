from datetime import datetime
import pandas as pd
from typing import List, Dict, Any

def compute_lifo_settlement(transactions: List[Any]) -> List[Dict[str, Any]]:
    """
    Computes LIFO settlement for a list of transactions.
    Each transaction object should have:
    - script: str
    - broker: str
    - transaction_date: datetime
    - buy_sell: str ('BUY' or 'SELL')
    - quantity: float
    - price: float
    - charges: float
    - net_amount: float
    - order_number: str
    """
    if not transactions:
        return []

    # Convert transactions to dicts for easier manipulation
    tx_list = []
    for tx in transactions:
        tx_list.append({
            "id": getattr(tx, "id", None),
            "script": tx.script,
            "broker": tx.broker,
            "transaction_date": tx.transaction_date,
            "buy_sell": tx.buy_sell.upper(),
            "quantity": float(tx.quantity),
            "price": float(tx.price),
            "charges": float(tx.charges or 0.0),
            "net_amount": float(tx.net_amount),
            "order_number": getattr(tx, "order_number", "") or "",
            "exchange": getattr(tx, "exchange", None)
        })

    # Group transactions by script, broker, date (ignoring time), and buy_sell
    grouped_txs = {}
    for tx in tx_list:
        date_only = tx["transaction_date"].date()
        key = (tx["script"], tx["broker"], date_only, tx["buy_sell"])
        if key not in grouped_txs:
            grouped_txs[key] = {
                "script": tx["script"],
                "broker": tx["broker"],
                "transaction_date": datetime.combine(date_only, datetime.min.time()),
                "buy_sell": tx["buy_sell"],
                "quantity": 0.0,
                "total_cost": 0.0,
                "charges": 0.0,
                "net_amount": 0.0,
                "exchanges": set(),
                "order_numbers": set(),
                "id": tx["id"]
            }
        g = grouped_txs[key]
        g["quantity"] += tx["quantity"]
        g["total_cost"] += tx["price"] * tx["quantity"]
        g["charges"] += tx["charges"]
        g["net_amount"] += tx["net_amount"]
        if tx.get("exchange"):
            g["exchanges"].add(tx["exchange"])
        if tx.get("order_number"):
            g["order_numbers"].add(tx["order_number"])

    # Reconstruct tx_list with grouped values
    tx_list = []
    for key, g in grouped_txs.items():
        qty = g["quantity"]
        price = g["total_cost"] / qty if qty > 0 else 0.0
        exchange_str = ", ".join(sorted(list(g["exchanges"]))) if g["exchanges"] else None
        order_str = ", ".join(sorted(list(g["order_numbers"]))) if g["order_numbers"] else ""
        tx_list.append({
            "id": g["id"],
            "script": g["script"],
            "broker": g["broker"],
            "transaction_date": g["transaction_date"],
            "buy_sell": g["buy_sell"],
            "quantity": qty,
            "price": price,
            "charges": g["charges"],
            "net_amount": g["net_amount"],
            "exchange": exchange_str,
            "order_number": order_str
        })

    # Group transactions by script
    scripts = sorted(list(set(tx["script"] for tx in tx_list)))
    settlement_rows = []

    for scrip in scripts:
        scrip_txs = [t for t in tx_list if t["script"] == scrip]
        # Sort chronologically by date and id/order_number to ensure stable sequence
        scrip_txs.sort(key=lambda x: (x["transaction_date"], x["id"] or 0))

        # Separate buys and sells
        buys = [t for t in scrip_txs if t["buy_sell"] == "BUY"]
        sells = [t for t in scrip_txs if t["buy_sell"] == "SELL"]

        # Track original quantities
        for b in buys:
            b["remaining_qty"] = b["quantity"]
            b["matched_qty"] = 0.0
            b["matches"] = []

        for s in sells:
            s["remaining_qty"] = s["quantity"]
            s["matched_qty"] = 0.0
            s["matches"] = []

        matches = []

        # Process each Sell chronologically
        for s in sells:
            # Under LIFO, scan the buys backwards (latest first) that occurred before or on the sell date
            # We look for buys with remaining_qty > 0
            while s["remaining_qty"] > 0:
                available_buys = [
                    b for b in buys 
                    if b["transaction_date"] <= s["transaction_date"] and b["remaining_qty"] > 0
                ]
                
                if not available_buys:
                    break  # No more buys available to match this sell (unsettled sell portion)

                # Get the most recent buy
                b = available_buys[-1]

                # Match quantity
                match_qty = min(s["remaining_qty"], b["remaining_qty"])

                # Update quantities
                s["remaining_qty"] -= match_qty
                b["remaining_qty"] -= match_qty
                s["matched_qty"] += match_qty
                b["matched_qty"] += match_qty

                # Record match
                match_record = {
                    "scrip": scrip,
                    "broker": b["broker"], # default to buy broker
                    "buy_date": b["transaction_date"],
                    "buy_price": b["price"],
                    "buy_qty_orig": b["quantity"],
                    "sell_date": s["transaction_date"],
                    "sell_price": s["price"],
                    "sell_qty_orig": s["quantity"],
                    "matched_qty": match_qty,
                    "buy_ref": b,
                    "sell_ref": s
                }
                
                b["matches"].append(match_record)
                s["matches"].append(match_record)
                matches.append(match_record)

        # Build output rows for this scrip
        scrip_rows = []

        # 1. Match rows and Unsettled Sells
        # We process matches and sells. Since a Sell may be split into multiple matches and an unsettled portion,
        # we can group them by Sell transaction to present them chronologically.
        for s in sells:
            # Add matches for this sell
            # For LIFO presentation, we want the most recent match first (sort matches by buy_date descending)
            s_matches = sorted(s["matches"], key=lambda x: x["buy_date"], reverse=True)
            for m in s_matches:
                b_ref = m["buy_ref"]
                # Determine comment status
                # Fully Settled if both Buy and Sell are fully matched
                buy_fully_matched = (b_ref["matched_qty"] == b_ref["quantity"])
                sell_fully_matched = (s["matched_qty"] == s["quantity"])
                
                if buy_fully_matched and sell_fully_matched:
                    comment = "Fully Settled"
                else:
                    comment = "Partially Settled"

                pnl = (m["sell_price"] - m["buy_price"]) * m["matched_qty"]
                holding_days = (m["sell_date"] - m["buy_date"]).days
                return_pct = (m["sell_price"] - m["buy_price"]) / m["buy_price"] if m["buy_price"] > 0 else 0.0

                scrip_rows.append({
                    "scrip": scrip,
                    "broker": m["broker"],
                    "buy_date": m["buy_date"],
                    "type": "Buy",
                    "qty": m["matched_qty"],
                    "price": m["buy_price"],
                    "sell_date": m["sell_date"],
                    "sum_of_qty": m["matched_qty"],
                    "average_of_price": m["sell_price"],
                    "comment": comment,
                    "pnl": pnl,
                    "holding_days": holding_days,
                    "return_pct": return_pct
                })

            # Add unsettled portion of this sell if any
            if s["remaining_qty"] > 0:
                scrip_rows.append({
                    "scrip": scrip,
                    "broker": s["broker"],
                    "buy_date": None,
                    "type": None,
                    "qty": None,
                    "price": None,
                    "sell_date": s["transaction_date"],
                    "sum_of_qty": s["remaining_qty"],
                    "average_of_price": s["price"],
                    "comment": "Unsettled",
                    "pnl": None,
                    "holding_days": None,
                    "return_pct": None
                })

        # 2. Add unsettled buys
        # Sorted chronologically by buy date
        unsettled_buys = [b for b in buys if b["remaining_qty"] > 0]
        unsettled_buys.sort(key=lambda x: x["transaction_date"])
        for b in unsettled_buys:
            # Note: A buy transaction that is partially settled is already represented in match rows.
            # Its unsettled portion is added here as an "Unsettled" row.
            scrip_rows.append({
                "scrip": scrip,
                "broker": b["broker"],
                "buy_date": b["transaction_date"],
                "type": "Buy",
                "qty": b["remaining_qty"],
                "price": b["price"],
                "sell_date": None,
                "sum_of_qty": None,
                "average_of_price": None,
                "comment": "Unsettled",
                "pnl": None,
                "holding_days": None,
                "return_pct": None
            })

        settlement_rows.extend(scrip_rows)

    return settlement_rows

def calculate_xirr(cash_flows: List[Dict[str, Any]]) -> float:
    """
    Calculates the XIRR for a list of cash flows.
    Each flow should be a dict: {"date": datetime, "amount": float}
    Returns rate as a decimal (e.g. 0.125 for 12.5%).
    """
    if not cash_flows:
        return 0.0
        
    # Sort chronologically
    cf = sorted([(c["date"], c["amount"]) for c in cash_flows], key=lambda x: x[0])
    
    # Check if we have both positive and negative cash flows
    has_pos = any(val > 0 for _, val in cf)
    has_neg = any(val < 0 for _, val in cf)
    if not (has_pos and has_neg):
        return 0.0
        
    t0 = cf[0][0]
    
    # Check time span
    days_diff = (cf[-1][0] - cf[0][0]).days
    if days_diff == 0:
        return 0.0
        
    def eq(r):
        val = 0.0
        for date, amount in cf:
            days = (date - t0).days
            if r <= -1.0:
                return float('inf')
            try:
                val += amount / ((1.0 + r) ** (days / 365.0))
            except (OverflowError, ValueError):
                return float('inf') if amount > 0 else float('-inf')
        return val

    # Secant Method solver
    r0 = 0.1
    r1 = 0.15
    try:
        f0 = eq(r0)
        f1 = eq(r1)
        for _ in range(100):
            if abs(f1 - f0) < 1e-12:
                break
            r_next = r1 - f1 * (r1 - r0) / (f1 - f0)
            if abs(r_next - r1) < 1e-6:
                # Limit return between -100% (-1.0) and 1000% (10.0)
                return max(-1.0, min(10.0, r_next))
            r0, r1 = r1, r_next
            f0 = f1
            f1 = eq(r1)
    except (ZeroDivisionError, OverflowError, ValueError):
        pass
        
    return 0.0


def compute_fifo_settlement(transactions: List[Any]) -> List[Dict[str, Any]]:
    """
    Computes FIFO (First-In, First-Out) settlement for a list of transactions.
    Identical pipeline to compute_lifo_settlement except the buy-matching loop
    picks the OLDEST available buy instead of the most recent one.
    Used exclusively for the LIFO vs FIFO tax-drag comparison.
    """
    if not transactions:
        return []

    # ── Build grouped tx_list (same pre-processing as LIFO) ────────────────
    tx_list = []
    for tx in transactions:
        tx_list.append({
            "id": getattr(tx, "id", None),
            "script": tx.script,
            "broker": tx.broker,
            "transaction_date": tx.transaction_date,
            "buy_sell": tx.buy_sell.upper(),
            "quantity": float(tx.quantity),
            "price": float(tx.price),
            "charges": float(tx.charges or 0.0),
            "net_amount": float(tx.net_amount),
            "order_number": getattr(tx, "order_number", "") or "",
            "exchange": getattr(tx, "exchange", None)
        })

    grouped_txs = {}
    for tx in tx_list:
        date_only = tx["transaction_date"].date()
        key = (tx["script"], tx["broker"], date_only, tx["buy_sell"])
        if key not in grouped_txs:
            grouped_txs[key] = {
                "script": tx["script"],
                "broker": tx["broker"],
                "transaction_date": datetime.combine(date_only, datetime.min.time()),
                "buy_sell": tx["buy_sell"],
                "quantity": 0.0,
                "total_cost": 0.0,
                "charges": 0.0,
                "net_amount": 0.0,
                "exchanges": set(),
                "order_numbers": set(),
                "id": tx["id"]
            }
        g = grouped_txs[key]
        g["quantity"] += tx["quantity"]
        g["total_cost"] += tx["price"] * tx["quantity"]
        g["charges"] += tx["charges"]
        g["net_amount"] += tx["net_amount"]
        if tx.get("exchange"):
            g["exchanges"].add(tx["exchange"])
        if tx.get("order_number"):
            g["order_numbers"].add(tx["order_number"])

    tx_list = []
    for key, g in grouped_txs.items():
        qty = g["quantity"]
        price = g["total_cost"] / qty if qty > 0 else 0.0
        exchange_str = ", ".join(sorted(list(g["exchanges"]))) if g["exchanges"] else None
        order_str = ", ".join(sorted(list(g["order_numbers"]))) if g["order_numbers"] else ""
        tx_list.append({
            "id": g["id"],
            "script": g["script"],
            "broker": g["broker"],
            "transaction_date": g["transaction_date"],
            "buy_sell": g["buy_sell"],
            "quantity": qty,
            "price": price,
            "charges": g["charges"],
            "net_amount": g["net_amount"],
            "exchange": exchange_str,
            "order_number": order_str
        })

    # ── Match sells to buys using FIFO (oldest buy first) ──────────────────
    scripts = sorted(list(set(tx["script"] for tx in tx_list)))
    settlement_rows = []

    for scrip in scripts:
        scrip_txs = [t for t in tx_list if t["script"] == scrip]
        scrip_txs.sort(key=lambda x: (x["transaction_date"], x["id"] or 0))

        buys = [t for t in scrip_txs if t["buy_sell"] == "BUY"]
        sells = [t for t in scrip_txs if t["buy_sell"] == "SELL"]

        for b in buys:
            b["remaining_qty"] = b["quantity"]
            b["matched_qty"] = 0.0
            b["matches"] = []

        for s in sells:
            s["remaining_qty"] = s["quantity"]
            s["matched_qty"] = 0.0
            s["matches"] = []

        for s in sells:
            while s["remaining_qty"] > 0:
                available_buys = [
                    b for b in buys
                    if b["transaction_date"] <= s["transaction_date"] and b["remaining_qty"] > 0
                ]
                if not available_buys:
                    break

                # FIFO: pick the OLDEST buy (index 0 instead of -1)
                b = available_buys[0]

                match_qty = min(s["remaining_qty"], b["remaining_qty"])
                s["remaining_qty"] -= match_qty
                b["remaining_qty"] -= match_qty
                s["matched_qty"] += match_qty
                b["matched_qty"] += match_qty

                match_record = {
                    "scrip": scrip,
                    "broker": b["broker"],
                    "buy_date": b["transaction_date"],
                    "buy_price": b["price"],
                    "sell_date": s["transaction_date"],
                    "sell_price": s["price"],
                    "matched_qty": match_qty,
                    "buy_ref": b,
                    "sell_ref": s
                }
                b["matches"].append(match_record)
                s["matches"].append(match_record)

        for s in sells:
            s_matches = sorted(s["matches"], key=lambda x: x["buy_date"])
            for m in s_matches:
                b_ref = m["buy_ref"]
                buy_fully = (b_ref["matched_qty"] == b_ref["quantity"])
                sell_fully = (s["matched_qty"] == s["quantity"])
                comment = "Fully Settled" if (buy_fully and sell_fully) else "Partially Settled"
                pnl = (m["sell_price"] - m["buy_price"]) * m["matched_qty"]
                holding_days = (m["sell_date"] - m["buy_date"]).days
                return_pct = (m["sell_price"] - m["buy_price"]) / m["buy_price"] if m["buy_price"] > 0 else 0.0

                settlement_rows.append({
                    "scrip": scrip,
                    "broker": m["broker"],
                    "buy_date": m["buy_date"],
                    "sell_date": m["sell_date"],
                    "qty": m["matched_qty"],
                    "price": m["buy_price"],
                    "average_of_price": m["sell_price"],
                    "comment": comment,
                    "pnl": pnl,
                    "holding_days": holding_days,
                    "return_pct": return_pct
                })

            if s["remaining_qty"] > 0:
                settlement_rows.append({
                    "scrip": scrip,
                    "broker": s["broker"],
                    "buy_date": None,
                    "sell_date": s["transaction_date"],
                    "qty": None,
                    "price": None,
                    "average_of_price": s["price"],
                    "comment": "Unsettled",
                    "pnl": None,
                    "holding_days": None,
                    "return_pct": None
                })

    return settlement_rows


