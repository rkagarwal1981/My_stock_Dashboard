import sys
import os
import traceback


# Add workspace backend to path
sys.path.insert(0, r"c:\My_work_RA\Antigravity\backend")

from services.database import SessionLocal
from api.routes import export_settlement

class MockUser:
    id = 1
    username = "testuser"

db = SessionLocal()
try:
    print("Testing export_settlement format=excel...")
    res_excel = export_settlement(format="excel", current_user=MockUser(), db=db)
    print("Excel export response type:", type(res_excel))

    print("\nTesting export_settlement format=csv...")
    res_csv = export_settlement(format="csv", current_user=MockUser(), db=db)
    print("CSV export response type:", type(res_csv))

except Exception as e:
    print("Error during test:")
    traceback.print_exc()
finally:
    db.close()
