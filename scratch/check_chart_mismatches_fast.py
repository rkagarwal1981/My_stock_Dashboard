import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from models.transaction import Transaction
from services.lifo_engine import compute_lifo_settlement
from datetime import datetime

db = SessionLocal()
try:
    # Get all distinct scrips
    scrips = [t.script for t in db.query(Transaction).distinct().all()]
    found_any = False
    
    def getDateStr(d):
        if not d: return ''
        d_str = str(d)
        return d_str.split('T')[0].split(' ')[0]

    for scrip in scrips:
        txs = db.query(Transaction).filter(Transaction.script == scrip).all()
        settlement = compute_lifo_settlement(txs)
        settlement_history = [r for r in settlement if r["pnl"] is not None]
        
        # Build timeline
        grouped_timeline = {}
        for t in txs:
            date_only = t.transaction_date.date()
            key = (date_only, t.buy_sell.upper(), t.broker)
            if key not in grouped_timeline:
                grouped_timeline[key] = {
                    "date": datetime.combine(date_only, datetime.min.time()),
                    "broker": t.broker,
                    "buy_sell": t.buy_sell.upper(),
                    "quantity": 0.0,
                    "total_cost": 0.0
                }
            g = grouped_timeline[key]
            g["quantity"] += t.quantity
            g["total_cost"] += t.price * t.quantity

        timeline = []
        for key, g in grouped_timeline.items():
            qty = g["quantity"]
            price = g["total_cost"] / qty if qty > 0 else 0.0
            timeline.append({
                "date": g["date"],
                "broker": g["broker"],
                "buy_sell": g["buy_sell"],
                "quantity": qty,
                "price": price
            })

        dateMap = {}
        for t in timeline:
            dStr = getDateStr(t["date"])
            if not dStr: continue
            if dStr not in dateMap:
                dateMap[dStr] = {"buyQty": 0.0, "sellQty": 0.0, "buyValue": 0.0, "sellValue": 0.0, "pnl": 0.0}
            if t["buy_sell"] == "BUY":
                dateMap[dStr]["buyQty"] += float(t["quantity"])
                dateMap[dStr]["buyValue"] += float(t["quantity"]) * float(t["price"])
            elif t["buy_sell"] == "SELL":
                dateMap[dStr]["sellQty"] += float(t["quantity"])
                dateMap[dStr]["sellValue"] += float(t["quantity"]) * float(t["price"])

        for sh in settlement_history:
            dStr = getDateStr(sh["sell_date"])
            if not dStr: continue
            if dStr not in dateMap:
                dateMap[dStr] = {"buyQty": 0.0, "sellQty": 0.0, "buyValue": 0.0, "sellValue": 0.0, "pnl": 0.0}
            if sh.get("pnl") is not None:
                dateMap[dStr]["pnl"] += float(sh["pnl"])

        for d, val in dateMap.items():
            if val["pnl"] != 0 and (val["sellQty"] == 0 or val["sellValue"] == 0):
                print(f"Mismatch in {scrip} on date {d}: P&L is {val['pnl']} but sellQty={val['sellQty']}, sellValue={val['sellValue']}")
                found_any = True
                
    if not found_any:
        print("No matches with sellQty=0 or sellValue=0 on non-zero P&L dates across all stocks.")
finally:
    db.close()
