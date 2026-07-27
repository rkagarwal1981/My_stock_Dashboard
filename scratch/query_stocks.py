import sys
import os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from services.database import SessionLocal
from models.transaction import Transaction
from models.holding import Holding
from api.routes import get_stock_summary

def main():
    db = SessionLocal()
    try:
        # Check holdings
        holdings = db.query(Holding).all()
        print(f"Total holdings in DB: {len(holdings)}")
        for h in holdings:
            print(f"Holding: script={h.script}, broker={h.broker}, qty={h.quantity}")

        # Check unique transaction scripts
        tx_scripts = [r[0] for r in db.query(Transaction.script).distinct().all()]
        print(f"\nUnique scripts in Transactions: {tx_scripts}")

        for scrip in tx_scripts:
            print(f"\n--- Stock summary for: {scrip} ---")
            try:
                # We can construct a mock db Session and call get_stock_summary
                summary = get_stock_summary(scrip=scrip, current_user=None, db=db)
                print(f"Success! Keys returned: {list(summary.keys())}")
                print(f"unrealized_pnl: {summary['unrealized_pnl']}")
                print(f"xirr: {summary['xirr']}")
                # print snippet of timeline
                print(f"timeline length: {len(summary['timeline'])}")
            except Exception as e:
                import traceback
                print(f"ERROR: {e}")
                traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
