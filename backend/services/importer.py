import os
import glob
from typing import List
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from models.transaction import Transaction
from models.import_history import ImportHistory
from models.audit_log import AuditLog
from services.lifo_engine import compute_lifo_settlement

# Folder to scan
SCAN_DIR = r"C:\Users\admin\OneDrive\01_MyGoal\Shares Market\Antigravity"
workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if not os.path.exists(SCAN_DIR) or not any(f.lower().endswith(('.csv', '.xlsx', '.xls')) for f in os.listdir(SCAN_DIR)):
    SCAN_DIR = workspace_root

def run_trade_pullers(force: bool = False):
    """
    Runs pull_zerodha_trades.py and pull_mstock_trades.py scripts in the workspace root.
    """
    import subprocess
    import sys
    
    workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    python_exe = sys.executable
    
    # Run MStock trade sync
    cmd_mstock = [python_exe, "pull_mstock_trades.py"]
    if force:
        cmd_mstock.append("--force")
    try:
        print("Running pull_mstock_trades.py...")
        subprocess.run(cmd_mstock, cwd=workspace_root, check=False)
    except Exception as e:
        print(f"Error running pull_mstock_trades.py: {e}")
        
    # Run Zerodha trade sync
    cmd_zerodha = [python_exe, "pull_zerodha_trades.py"]
    if force:
        cmd_zerodha.append("--force")
    try:
        print("Running pull_zerodha_trades.py...")
        subprocess.run(cmd_zerodha, cwd=workspace_root, check=False)
    except Exception as e:
        print(f"Error running pull_zerodha_trades.py: {e}")


def safe_parse_datetime(val, dayfirst=False):
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, pd.Timestamp):
        return val.to_pydatetime()
    
    val_str = str(val).strip()
    
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%Y/%m/%d",
        "%d/%m/%Y"
    ]
    
    if dayfirst:
        formats = [f for f in formats if "%d" in f[:2]] + [f for f in formats if "%d" not in f[:2]]
        
    for fmt in formats:
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            continue
            
    try:
        return pd.Timestamp(val_str).to_pydatetime()
    except Exception:
        pass
        
    raise ValueError(f"Could not parse datetime: {val}")


def normalize_script_name(name: str, segment: str = None, exchange: str = None) -> str:
    """
    Normalizes stock symbols by converting to uppercase, stripping spaces,
    and appending '-EQ' for equity instruments if not already present.
    """
    if not name:
        return ""
    
    name = str(name).strip().upper()
    
    # Check if segment or exchange indicates equity
    is_equity = False
    if segment and str(segment).strip().upper() in ["EQ", "EQUITY"]:
        is_equity = True
    elif exchange and str(exchange).strip().upper() in ["NSEEQ", "BSEEQ", "NSE_EQ", "BSE_EQ"]:
        is_equity = True
    elif "-EQ" in name:
        is_equity = True
    elif any(f in name for f in [" FUT", " CALL", " PUT", "MCX", "COMMODITY", "DERIVATIVE"]):
        is_equity = False
    else:
        # Fallback: if it's a single word without special futures/options terms, assume equity
        is_equity = True

    if is_equity:
        if name.endswith("-EQ"):
            return name
        elif name.endswith("-BE"):
            # sometimes trade series is BE, normalize to -EQ for settlement matching
            return name.replace("-BE", "-EQ")
        else:
            return f"{name}-EQ"
            
    return name

def clean_id_str(val) -> str:
    if pd.isna(val) or val is None:
        return ""
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s

def parse_dhan_file(file_path: str) -> List[dict]:
    """
    Parses Dhan CSV file.
    Columns: Date,Time,Name,Buy/Sell,Order,Exchange,Segment,Quantity/Lot,Trade Price,Trade Value,Status
    """
    df = pd.read_csv(file_path)
    
    # Verify columns
    required_cols = ["Date", "Name", "Buy/Sell", "Quantity/Lot", "Trade Price"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Dhan file missing column: {col}")
            
    transactions = []
    for _, row in df.iterrows():
        # Only import successful trades
        if str(row.get("Status", "")).strip().upper() != "TRADED":
            continue
            
        date_str = str(row["Date"]).strip()
        time_str = str(row.get("Time", "00:00:00")).strip()
        tx_date = safe_parse_datetime(f"{date_str} {time_str}")
        
        script = normalize_script_name(row["Name"], segment=row.get("Segment"), exchange=row.get("Exchange"))
        buy_sell = str(row["Buy/Sell"]).strip().upper()
        qty = float(row["Quantity/Lot"])
        price = float(row["Trade Price"])
        
        # Dhan CSV has no explicit charges column in this sheet. Default to 0.
        charges = 0.0
        net_amount = float(row.get("Trade Value", qty * price))
        
        transactions.append({
            "transaction_date": tx_date,
            "broker": "Dhan",
            "script": script,
            "buy_sell": buy_sell,
            "quantity": qty,
            "price": price,
            "charges": charges,
            "net_amount": net_amount,
            "exchange": str(row.get("Exchange", "NSE")).strip().upper(),
            "order_number": clean_id_str(row.get("Order", ""))
        })
        
    return transactions

def parse_zerodha_file(file_path: str) -> List[dict]:
    """
    Parses Zerodha Excel file.
    Finds header row containing 'Symbol' and 'Trade Date' and parses from there.
    """
    # Load with openpyxl engine
    df_raw = pd.read_excel(file_path, header=None)
    
    # Find the header row
    header_idx = None
    for idx, row in df_raw.iterrows():
        row_vals = [str(v).strip().lower() for v in row.values if pd.notna(v)]
        if "symbol" in row_vals and "trade date" in row_vals:
            header_idx = idx
            break
            
    if header_idx is None:
        raise ValueError("Could not find Zerodha header row in Excel file.")
        
    # Read sheet again with correct header
    df = pd.read_excel(file_path, skiprows=header_idx)
    
    # Map columns
    required_cols = ["Symbol", "Trade Date", "Trade Type", "Quantity", "Price"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Zerodha file missing column: {col}")
            
    transactions = []
    for _, row in df.iterrows():
        # skip rows with empty critical fields
        if pd.isna(row["Symbol"]) or pd.isna(row["Trade Date"]):
            continue
            
        # Parse date and execution time
        exec_time = row.get("Order Execution Time")
        if pd.notna(exec_time):
            tx_date = safe_parse_datetime(exec_time)
        else:
            tx_date = safe_parse_datetime(row["Trade Date"])
            
        script = normalize_script_name(row["Symbol"], segment=row.get("Segment"), exchange=row.get("Exchange"))
        buy_sell = str(row["Trade Type"]).strip().upper()
        qty = float(row["Quantity"])
        price = float(row["Price"])
        
        charges = 0.0  # default
        net_amount = qty * price
        
        transactions.append({
            "transaction_date": tx_date,
            "broker": "Zerodha",
            "script": script,
            "buy_sell": buy_sell,
            "quantity": qty,
            "price": price,
            "charges": charges,
            "net_amount": net_amount,
            "exchange": str(row.get("Exchange", "NSE")).strip().upper(),
            "order_number": clean_id_str(row.get("Order ID", "")),
            "trade_id": clean_id_str(row.get("Trade ID", ""))
        })
        
    return transactions

def parse_mstock_file(file_path: str) -> List[dict]:
    """
    Parses MStock Excel file.
    Finds header row containing 'Trade Date' and 'Scrip / Contract' and parses from there.
    """
    df_raw = pd.read_excel(file_path, header=None)
    
    header_idx = None
    for idx, row in df_raw.iterrows():
        row_vals = [str(v).strip().lower() for v in row.values if pd.notna(v)]
        if "trade date" in row_vals and "scrip / contract" in row_vals:
            header_idx = idx
            break
            
    if header_idx is None:
        raise ValueError("Could not find MStock header row in Excel file.")
        
    df = pd.read_excel(file_path, skiprows=header_idx)
    
    # Map columns
    required_cols = ["Trade Date", "Buy / Sell", "Scrip / Contract", "Qty", "Price"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"MStock file missing column: {col}")
            
    transactions = []
    for _, row in df.iterrows():
        if pd.isna(row["Scrip / Contract"]) or pd.isna(row["Trade Date"]):
            continue
            
        # Date format in MStock is usually DD-MM-YYYY
        tx_date = safe_parse_datetime(row["Trade Date"], dayfirst=True)
        
        # MStock exchange column contains things like NSEEQ, BSEEQ
        exch = str(row.get("Exchange", "NSE")).strip().upper()
        script = normalize_script_name(row["Scrip / Contract"], exchange=exch)
        
        buy_sell = str(row["Buy / Sell"]).strip().upper()
        qty = float(row["Qty"])
        price = float(row["Price"])
        
        charges = 0.0
        net_amount = qty * price
        
        transactions.append({
            "transaction_date": tx_date,
            "broker": "MStock",
            "script": script,
            "buy_sell": buy_sell,
            "quantity": qty,
            "price": price,
            "charges": charges,
            "net_amount": net_amount,
            "exchange": "NSE" if "NSE" in exch else ("BSE" if "BSE" in exch else exch),
            "order_number": clean_id_str(row.get("Trade Id", ""))
        })
        
    return transactions

def import_file(db: Session, file_path: str, broker: str = None) -> int:
    """
    Imports a transaction file. If broker is not specified, auto-detects based on filename.
    Saves to the database and logs in ImportHistory.
    """
    filename = os.path.basename(file_path)
    
    # Check if already imported
    existing = db.query(ImportHistory).filter_by(filename=filename).first()
    if existing:
        return 0  # Skip already imported files
        
    # Auto-detect broker if not provided
    if not broker:
        lower_name = filename.lower()
        if "dhan" in lower_name:
            broker = "Dhan"
        elif "zerodha" in lower_name:
            broker = "Zerodha"
        elif "mstock" in lower_name or "m-stock" in lower_name:
            broker = "MStock"
        else:
            raise ValueError(f"Could not auto-detect broker for file: {filename}")
            
    # Parse based on broker
    try:
        if broker == "Dhan":
            parsed_txs = parse_dhan_file(file_path)
        elif broker == "Zerodha":
            parsed_txs = parse_zerodha_file(file_path)
        elif broker == "MStock":
            parsed_txs = parse_mstock_file(file_path)
        else:
            raise ValueError(f"Unsupported broker: {broker}")
            
        # Write history entry
        history = ImportHistory(
            filename=filename,
            broker=broker,
            row_count=len(parsed_txs),
            status="SUCCESS"
        )
        db.add(history)
        db.commit()
        db.refresh(history)
        
        # Save transactions to DB
        count = 0
        for tx_data in parsed_txs:
            # Check if this exact transaction order/trade ID already exists to avoid duplicates
            # (only if trade_id or order_number is available)
            exists = False
            if tx_data.get("order_number") or tx_data.get("trade_id"):
                query = db.query(Transaction).filter_by(
                    broker=tx_data["broker"],
                    script=tx_data["script"],
                    buy_sell=tx_data["buy_sell"],
                    quantity=tx_data["quantity"],
                    price=tx_data["price"],
                    transaction_date=tx_data["transaction_date"]
                )
                if tx_data.get("order_number"):
                    query = query.filter_by(order_number=tx_data["order_number"])
                if tx_data.get("trade_id"):
                    query = query.filter_by(trade_id=tx_data["trade_id"])
                
                if query.first():
                    exists = True
                    
            if not exists:
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
                count += 1
                
        db.commit()
        
        # Log audit
        audit = AuditLog(
            category="IMPORT",
            description=f"Successfully imported {count} new transactions from {filename} for {broker}.",
            details=f"Total parsed: {len(parsed_txs)}"
        )
        db.add(audit)
        db.commit()
        
        return count
        
    except Exception as e:
        db.rollback()
        # Log failure
        history = ImportHistory(
            filename=filename,
            broker=broker or "Unknown",
            row_count=0,
            status="ERROR"
        )
        db.add(history)
        
        audit = AuditLog(
            category="SYSTEM_ERROR",
            description=f"Failed to import file {filename}: {str(e)}",
            details=f"Exception type: {type(e).__name__}"
        )
        db.add(audit)
        db.commit()
        raise e

def scan_and_import_directory(db: Session) -> dict:
    """
    Scans the SCAN_DIR folder for Dhan, MStock, and Zerodha files,
    and imports any that haven't been imported yet.
    """
    # Delete the ImportHistory record for dynamic sync files so they are always re-scanned and imported
    try:
        db.query(ImportHistory).filter(ImportHistory.filename.in_(["Trade History - Mstock.xlsx", "Trade History - Zerodha.xlsx"])).delete(synchronize_session=False)
        db.commit()
    except Exception as e:
        print(f"Error resetting dynamic sync file import history: {e}")
        db.rollback()

    if not os.path.exists(SCAN_DIR):
        os.makedirs(SCAN_DIR, exist_ok=True)
        return {"imported": 0, "errors": []}
        
    # Find all CSV and Excel files
    files = []
    for ext in ["*.csv", "*.xlsx", "*.xls"]:
        files.extend(glob.glob(os.path.join(SCAN_DIR, ext)))
        
    # Also scan mstock_tradebook_downloads subfolder for dynamically pulled backup excel files
    mstock_downloads_dir = os.path.join(SCAN_DIR, "mstock_tradebook_downloads")
    if os.path.exists(mstock_downloads_dir):
        for ext in ["*.xlsx", "*.xls"]:
            files.extend(glob.glob(os.path.join(mstock_downloads_dir, ext)))
        
    results = {"imported_files": [], "skipped_files": [], "errors": []}
    
    for f in files:
        filename = os.path.basename(f)
        
        # Check if already imported
        existing = db.query(ImportHistory).filter_by(filename=filename).first()
        if existing:
            results["skipped_files"].append(filename)
            continue
            
        try:
            # Detect broker
            lower_name = filename.lower()
            if "dhan" in lower_name:
                broker = "Dhan"
            elif "zerodha" in lower_name:
                broker = "Zerodha"
            elif "mstock" in lower_name or "m-stock" in lower_name:
                broker = "MStock"
            else:
                # If cannot auto-detect, ignore it silently or log it
                continue
                
            count = import_file(db, f, broker)
            results["imported_files"].append({"filename": filename, "broker": broker, "count": count})
        except Exception as e:
            results["errors"].append({"filename": filename, "error": str(e)})
            
    return results
