import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from api.routes import get_stock_summary
from models.user import User

def main():
    db = SessionLocal()
    try:
        user = User(id=1, username="admin")
        print("Triggering get_stock_summary for PNB-EQ...")
        summary = get_stock_summary("PNB-EQ", current_user=user, db=db)
        print("\nSUCCESS!")
        print(f"Scrip: {summary['scrip']}")
        print(f"Current Quantity: {summary['current_quantity']}")
        print(f"Avg Price: {summary['avg_price']}")
        print(f"XIRR: {summary['xirr']}")
    except Exception as e:
        print("\n--- ERROR CAUGHT ---")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
