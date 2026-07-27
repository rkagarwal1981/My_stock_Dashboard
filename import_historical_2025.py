import os
import sys
from datetime import datetime

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
sys.path.append(backend_dir)

from services.database import SessionLocal
from models.transaction import Transaction
from models.import_history import ImportHistory
from models.audit_log import AuditLog
from services.importer import parse_zerodha_file, parse_mstock_file

def run_migration():
    db = SessionLocal()
    try:
        mstock_file = r"C:\My_work_RA\Antigravity\Mstock Trade History Jan 25 to Dec 25.xlsx"
        zerodha_file = r"C:\My_work_RA\Antigravity\Zerodha Trade History Apr 25 to Mar 26.xlsx"
        
        files_to_import = [
            {"path": mstock_file, "broker": "MStock", "parser": parse_mstock_file},
            {"path": zerodha_file, "broker": "Zerodha", "parser": parse_zerodha_file}
        ]
        
        for item in files_to_import:
            file_path = item["path"]
            broker = item["broker"]
            parser = item["parser"]
            filename = os.path.basename(file_path)
            
            print(f"\nProcessing {filename} for {broker}...")
            
            # Check if this file was already imported in ImportHistory
            existing_import = db.query(ImportHistory).filter_by(filename=filename).first()
            if existing_import:
                print(f"Skipping {filename}: Already recorded in ImportHistory.")
                continue
                
            # Parse transactions using the parser
            parsed_txs = parser(file_path)
            print(f"Parsed {len(parsed_txs)} transactions from Excel file.")
            
            # Create ImportHistory record for this baseline file
            history = ImportHistory(
                filename=filename,
                broker=broker,
                row_count=len(parsed_txs),
                status="SUCCESS"
            )
            db.add(history)
            db.commit()
            db.refresh(history)
            
            # Query existing transaction keys to avoid duplicates
            existing_txs = db.query(Transaction).filter_by(broker=broker).all()
            existing_keys = set()
            for tx in existing_txs:
                tx_date_str = tx.transaction_date.strftime("%Y-%m-%d") if tx.transaction_date else ""
                key = (
                    tx_date_str,
                    tx.script.upper() if tx.script else "",
                    tx.buy_sell.upper() if tx.buy_sell else "",
                    float(tx.quantity) if tx.quantity else 0.0,
                    float(tx.price) if tx.price else 0.0
                )
                existing_keys.add(key)
                
            # Filter and insert new records
            inserted_count = 0
            for tx_data in parsed_txs:
                tx_date_str = tx_data["transaction_date"].strftime("%Y-%m-%d") if tx_data["transaction_date"] else ""
                key = (
                    tx_date_str,
                    tx_data["script"].upper() if tx_data["script"] else "",
                    tx_data["buy_sell"].upper() if tx_data["buy_sell"] else "",
                    float(tx_data["quantity"]) if tx_data["quantity"] else 0.0,
                    float(tx_data["price"]) if tx_data["price"] else 0.0
                )
                
                if key not in existing_keys:
                    db_tx = Transaction(
                        transaction_date=tx_data["transaction_date"],
                        broker=tx_data["broker"],
                        script=tx_data["script"],
                        buy_sell=tx_data["buy_sell"],
                        quantity=tx_data["quantity"],
                        price=tx_data["price"],
                        charges=tx_data["charges"],
                        net_amount=tx_data["net_amount"],
                        exchange=tx_data["exchange"],
                        order_number=tx_data["order_number"],
                        trade_id=tx_data.get("trade_id"),
                        import_id=history.id
                    )
                    db.add(db_tx)
                    inserted_count += 1
                    existing_keys.add(key)
                    
            db.commit()
            print(f"Successfully merged {inserted_count} new historical transactions into DB.")
            
            # Log audit
            audit = AuditLog(
                category="IMPORT",
                description=f"Merged {inserted_count} 2025 historical transactions from {filename} for {broker}.",
                details=f"Total file rows: {len(parsed_txs)}"
            )
            db.add(audit)
            db.commit()
            
    except Exception as e:
        db.rollback()
        print(f"Migration error: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
