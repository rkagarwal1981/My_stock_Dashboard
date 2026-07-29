import sys
import os

# Add backend directory to sys.path so we can import services
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from services.database import SessionLocal
from services.importer import scan_and_import_directory

def main():
    print("Initializing DB session...")
    db = SessionLocal()
    try:
        print("Running scan_and_import_directory...")
        results = scan_and_import_directory(db)
        print("Scan results:")
        print(results)
    except Exception as e:
        print(f"Error during scan: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
