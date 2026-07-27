import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from models.transaction import Transaction
from api.routes import get_stock_summary

db = SessionLocal()
try:
    # Find some scrips that have transactions
    scrips = [t.script for t in db.query(Transaction).distinct().all()]
    print("Found scrips:", scrips)
    for scrip in scrips[:5]:
        print(f"\n--- Summary for {scrip} ---")
        try:
            summary = get_stock_summary(scrip, current_user=None, db=db)
            print("Timeline sample (first 3):", summary["timeline"][:3])
            print("Settlement history sample (first 3):", summary["settlement_history"][:3])
        except Exception as e:
            print("Error:", e)
finally:
    db.close()
