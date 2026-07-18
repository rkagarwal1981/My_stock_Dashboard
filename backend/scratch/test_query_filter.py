import os
import sys
from datetime import datetime, time
# Adjust python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.database import SessionLocal
from models.executed_order import ExecutedOrder

db = SessionLocal()

# Try filtering by date
today_start = datetime.combine(datetime.now().date(), time.min)
print("today_start:", today_start)

# Naive comparison
orders_naive = db.query(ExecutedOrder).filter(ExecutedOrder.execution_time >= today_start).all()
print("Count of orders (naive):", len(orders_naive))

db.close()
