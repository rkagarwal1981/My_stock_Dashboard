import sys
import os

# Add backend directory to sys.path so we can import services
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from api.routes import get_stock_summary
from models.user import User

def main():
    db = SessionLocal()
    try:
        # Mock current user
        user = User(id=1, username="admin")
        print("Fetching stock summary for PIIND-EQ...")
        summary = get_stock_summary("PIIND-EQ", current_user=user, db=db)
        print("\n--- STOCK SUMMARY ---")
        print(f"Scrip: {summary['scrip']}")
        print(f"Current Quantity: {summary['current_quantity']}")
        print(f"Avg Price: {summary['avg_price']}")
        print(f"Current Value: {summary['current_value']}")
        print(f"LTP: {summary['ltp']}")
        print(f"Unrealized P&L: {summary['unrealized_pnl']}")
        print(f"Realized Profit: {summary['realized_profit']}")
        print(f"Realized Loss: {summary['realized_loss']}")
        print(f"Timeline entries count: {len(summary['timeline'])}")
        
        print("\n--- TIMELINE DETAIL FOR 22/07/2026 ---")
        for tx in summary['timeline']:
            tx_date_str = tx['date'].strftime('%Y-%m-%d')
            if tx_date_str == '2026-07-22':
                print(tx)
                
        print("\n--- SETTLEMENT HISTORY DETAIL ---")
        for sh in summary['settlement_history']:
            sell_date_str = sh['sell_date'].strftime('%Y-%m-%d') if sh['sell_date'] else ""
            if sell_date_str == '2026-07-22':
                print(sh)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
