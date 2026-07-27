import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from models.transaction import Transaction
from api.routes import get_stock_summary

db = SessionLocal()
try:
    scrips = [t.script for t in db.query(Transaction).distinct().all()]
    found_any = False
    
    def getDateStr(d):
        if not d: return ''
        d_str = str(d)
        return d_str.split('T')[0].split(' ')[0]

    for scrip in scrips:
        summary = get_stock_summary(scrip, current_user=None, db=db)
        
        dateMap = {}
        for t in (summary.get("timeline") or []):
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

        for sh in (summary.get("settlement_history") or []):
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
