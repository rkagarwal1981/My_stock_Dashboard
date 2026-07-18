import os
import sys
from datetime import datetime

# Adjust python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.database import SessionLocal
from models.holding import Holding
from models.transaction import Transaction

db = SessionLocal()
try:
    holdings = db.query(Holding).all()
    print(f"Total holdings in DB: {len(holdings)}")
    for h in holdings[:5]:  # print first 5
        # Get latest transaction for (script, broker)
        latest_tx = db.query(Transaction).filter(
            Transaction.script == h.script,
            Transaction.broker == h.broker
        ).order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).first()

        dip_pct = None
        latest_tx_date = None
        latest_tx_days = None
        latest_tx_type = None

        if latest_tx:
            tx_price = latest_tx.price
            if tx_price and tx_price > 0 and h.ltp is not None:
                dip_pct = ((h.ltp - tx_price) / tx_price) * 100
            
            latest_tx_date = latest_tx.transaction_date
            if latest_tx_date:
                today = datetime.now().date()
                tx_date = latest_tx_date.date()
                latest_tx_days = (today - tx_date).days
            
            latest_tx_type = "Buy" if latest_tx.buy_sell.upper() == "BUY" else "Sell"

        print(f"Holding: {h.script} ({h.broker}) - LTP: {h.ltp}")
        print(f"  Latest Tx Price: {latest_tx.price if latest_tx else None}")
        print(f"  Dip %age: {dip_pct}%")
        print(f"  Date: {latest_tx_date}")
        print(f"  # of Days: {latest_tx_days}")
        print(f"  Type: {latest_tx_type}")
        print("-" * 40)
finally:
    db.close()
