import sys
import os
import json

# Add backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from api.routes import get_stock_summary

db = SessionLocal()
try:
    summary = get_stock_summary("INTERGLOBE AVIATION-EQ", current_user=None, db=db)
    
    # Run the exact JS calculation
    dateMap = {}
    
    def getDateStr(d):
        if not d: return ''
        # In Python, datetime object or string might come. 
        # But in FastAPI response, they are serialized as string e.g. "2026-04-16T00:00:00"
        d_str = str(d)
        return d_str.split('T')[0].split(' ')[0]

    for t in (summary.get("timeline") or []):
        dStr = getDateStr(t["date"])
        if not dStr: continue
        
        if dStr not in dateMap:
            dateMap[dStr] = {
                "date": dStr,
                "buyQty": 0.0,
                "sellQty": 0.0,
                "buyValue": 0.0,
                "sellValue": 0.0,
                "pnl": 0.0,
                "holdingDaysSum": 0.0,
                "holdingDaysCount": 0.0
            }
            
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
            dateMap[dStr] = {
                "date": dStr,
                "buyQty": 0.0,
                "sellQty": 0.0,
                "buyValue": 0.0,
                "sellValue": 0.0,
                "pnl": 0.0,
                "holdingDaysSum": 0.0,
                "holdingDaysCount": 0.0
            }
            
        if sh.get("pnl") is not None:
            dateMap[dStr]["pnl"] += float(sh["pnl"])
            
        if sh.get("holding_days") is not None:
            qty = sh.get("qty") or sh.get("sum_of_qty") or 1.0
            dateMap[dStr]["holdingDaysSum"] += float(sh["holding_days"]) * float(qty)
            dateMap[dStr]["holdingDaysCount"] += float(qty)

    print("Calculated chartData entries with non-zero P&L:")
    for d, val in sorted(dateMap.items()):
        if val["pnl"] != 0:
            print(f"Date: {d}, buyQty: {val['buyQty']}, buyValue: {val['buyValue']}, sellQty: {val['sellQty']}, sellValue: {val['sellValue']}, pnl: {val['pnl']}")
finally:
    db.close()
