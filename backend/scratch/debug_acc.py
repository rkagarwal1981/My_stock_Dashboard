import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.database import SessionLocal
from models.transaction import Transaction

db = SessionLocal()
try:
    txs = db.query(Transaction).filter(Transaction.script.like('%ACC%')).all()
    print("Found", len(txs), "transactions for %ACC%")
    for t in txs:
        print(f"ID: {t.id}, Date: {t.transaction_date} (Type: {type(t.transaction_date)}), Buy/Sell: {t.buy_sell}, Qty: {t.quantity}, Price: {t.price}, Broker: {t.broker}, Script: {t.script}")
finally:
    db.close()
