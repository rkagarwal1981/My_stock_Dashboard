import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from models.transaction import Transaction

db = SessionLocal()
try:
    zeros = db.query(Transaction).filter(
        (Transaction.price == 0) | 
        (Transaction.quantity == 0) | 
        (Transaction.net_amount == 0)
    ).all()
    print(f"Found {len(zeros)} transactions with zero price, quantity, or net_amount.")
    for z in zeros:
        print(f"ID: {z.id}, Scrip: {z.script}, Type: {z.buy_sell}, Qty: {z.quantity}, Price: {z.price}, Net: {z.net_amount}")
finally:
    db.close()
