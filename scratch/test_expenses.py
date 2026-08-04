import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(root_dir, 'backend'))

from services.database import SessionLocal
from api.routes import analytics_expenses_interest

class MockUser:
    id = 1
    username = "testuser"

db = SessionLocal()
try:
    res = analytics_expenses_interest(broker="MStock", current_user=MockUser(), db=db)
    print("Files Missing:", res.get("files_missing"))
    if not res.get("files_missing"):
        print("\nParsed months count:", len(res["months"]))
        for m_data in res["months"]:
            print(f"Month: {m_data['month']}")
            print(f"  Realized PnL: Rs. {m_data['realized_pnl']:,.2f}")
            print(f"  MTF Interest: Rs. {m_data['mtf_interest']:,.2f}")
            print(f"  DP Charges  : Rs. {m_data['dp_charges']:,.2f}")
            print(f"  Brokerage   : Rs. {m_data['brokerage']:,.2f}")
            print(f"  Tax/STT     : Rs. {m_data['tax_other_stt']:,.2f}")
            print(f"  Actual Net  : Rs. {m_data['actual_net_pnl']:,.2f}")
            print(f"  MTF Position: Rs. {m_data['mtf_position']:,.2f}")
finally:
    db.close()
