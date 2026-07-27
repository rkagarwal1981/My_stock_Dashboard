import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from models.transaction import Transaction
from api.routes import get_stock_summary

db = SessionLocal()
try:
    scrips = [t.script for t in db.query(Transaction).distinct().all()]
    mismatch_found = False
    for scrip in scrips:
        summary = get_stock_summary(scrip, current_user=None, db=db)
        timeline_dates = {str(t["date"]).split('T')[0].split(' ')[0] for t in summary.get("timeline", [])}
        for sh in summary.get("settlement_history", []):
            sell_date_str = str(sh["sell_date"]).split('T')[0].split(' ')[0]
            if sell_date_str not in timeline_dates:
                print(f"Mismatch in {scrip}: settlement sell_date {sell_date_str} not in timeline!")
                mismatch_found = True
    if not mismatch_found:
        print("No date mismatches found between settlement history and timeline across all stocks.")
finally:
    db.close()
