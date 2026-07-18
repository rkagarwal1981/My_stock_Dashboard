import os
import sys
from datetime import datetime, timedelta

# Adjust python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.database import SessionLocal
from models.transaction import Transaction
from services.broker_api import get_mstock_credentials, MStockClient

db = SessionLocal()
try:
    print("--- Database Check (Today's Transactions) ---")
    today_str = datetime.now().strftime("%Y-%m-%d")
    db_txs = db.query(Transaction).filter(Transaction.transaction_date >= datetime.now().date()).all()
    print(f"Found {len(db_txs)} transactions in DB for today ({today_str}):")
    for tx in db_txs:
        print(f"Broker: {tx.broker}, Script: {tx.script}, Type: {tx.buy_sell}, Qty: {tx.quantity}, Price: {tx.price}, Date: {tx.transaction_date}")

    print("\n--- MStock API Query for Today ---")
    creds = get_mstock_credentials()
    if not creds:
        print("No MStock credentials found!")
    else:
        client = MStockClient(creds)
        client.login()
        
        # Query trade history for last 2 days
        print("Querying fetch_transactions(days_back=2)...")
        mstock_trades = client.fetch_transactions(days_back=2)
        print(f"Total trades returned by fetch_transactions: {len(mstock_trades)}")
        for idx, t in enumerate(mstock_trades):
            print(f"#{idx}: Date: {t['transaction_date']} ({type(t['transaction_date'])}), Script: {t['script']}, Type: {t['buy_sell']}, Qty: {t['quantity']}, Price: {t['price']}")

except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
