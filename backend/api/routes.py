import os
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
import io
import pandas as pd
from typing import List, Optional
from pydantic import BaseModel

from services.database import get_db, engine
from services.lifo_engine import compute_lifo_settlement, compute_fifo_settlement, calculate_xirr
from services.importer import scan_and_import_directory, import_file, SCAN_DIR, run_trade_pullers
from services.market_data import fetch_live_prices, fetch_pe_info
from models.user import User
from models.credentials import BrokerCredentials
from models.transaction import Transaction
from models.holding import Holding
from models.import_history import ImportHistory
from models.audit_log import AuditLog
from models.comment import StockComment
from models.executed_order import ExecutedOrder
from models.target import TargetSetting
from models.target_category import TargetCategory
from models.sector_override import SectorAllocationOverride
from models.watchlist import WatchlistAction, WatchlistManualScript
from services.mutual_fund_engine import MutualFundEngine

from api.auth import (
    get_current_user,
    verify_password,
    get_password_hash,
    create_access_token,
    encrypt_value,
    decrypt_value
)

router = APIRouter()

mf_engine = MutualFundEngine()

# --- Auth Endpoints ---

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str

@router.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        # Log failed login attempt
        audit = AuditLog(
            category="LOGIN",
            description=f"Failed login attempt for username: {req.username}."
        )
        db.add(audit)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    # Log successful login
    audit = AuditLog(
        category="LOGIN",
        description=f"User {req.username} logged in successfully."
    )
    db.add(audit)
    db.commit()
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    hashed = get_password_hash(req.password)
    user = User(username=req.username, hashed_password=hashed)
    db.add(user)
    db.commit()
    return {"message": "User registered successfully"}

# --- Broker Credentials Endpoints ---

class CredentialsRequest(BaseModel):
    broker_name: str  # 'mstock', 'zerodha', 'dhan'
    username: str
    password: str
    pin: Optional[str] = None
    totp_key: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None

@router.post("/credentials")
def save_credentials(req: CredentialsRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    broker = req.broker_name.lower()
    if broker not in ["mstock", "zerodha", "dhan"]:
        raise HTTPException(status_code=400, detail="Invalid broker name")
        
    encrypted_user = encrypt_value(req.username)
    encrypted_pass = encrypt_value(req.password)
    encrypted_pin = encrypt_value(req.pin) if req.pin else None
    encrypted_totp = encrypt_value(req.totp_key) if req.totp_key else None
    encrypted_api_key = encrypt_value(req.api_key) if req.api_key else None
    encrypted_api_secret = encrypt_value(req.api_secret) if req.api_secret else None
    
    existing = db.query(BrokerCredentials).filter_by(user_id=current_user.id, broker_name=broker).first()
    
    if existing:
        existing.encrypted_username = encrypted_user
        existing.encrypted_password = encrypted_pass
        existing.encrypted_pin = encrypted_pin
        existing.encrypted_totp_key = encrypted_totp
        existing.encrypted_api_key = encrypted_api_key
        existing.encrypted_api_secret = encrypted_api_secret
    else:
        cred = BrokerCredentials(
            user_id=current_user.id,
            broker_name=broker,
            encrypted_username=encrypted_user,
            encrypted_password=encrypted_pass,
            encrypted_pin=encrypted_pin,
            encrypted_totp_key=encrypted_totp,
            encrypted_api_key=encrypted_api_key,
            encrypted_api_secret=encrypted_api_secret
        )
        db.add(cred)
        
    db.commit()
    
    audit = AuditLog(
        category="LOGIN",
        description=f"Credentials updated for broker: {broker}."
    )
    db.add(audit)
    db.commit()
    
    return {"message": f"Credentials saved for {broker}."}

@router.get("/credentials")
def get_credentials(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    creds = db.query(BrokerCredentials).filter_by(user_id=current_user.id).all()
    # Decrypt only usernames, api_key to display, keep password/secret hidden/encrypted
    return [
        {
            "broker_name": c.broker_name,
            "username": decrypt_value(c.encrypted_username),
            "has_password": bool(c.encrypted_password),
            "has_pin": bool(c.encrypted_pin),
            "has_totp": bool(c.encrypted_totp_key),
            "api_key": decrypt_value(c.encrypted_api_key) if c.encrypted_api_key else "",
            "api_secret": "********" if c.encrypted_api_secret else "",
            "updated_at": c.updated_at
        } for c in creds
    ]

# --- Transaction Endpoints ---

@router.get("/transactions")
def get_transactions(
    broker: Optional[str] = None, 
    script: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Transaction)
    if broker:
        query = query.filter(Transaction.broker.ilike(broker))
    if script:
        query = query.filter(Transaction.script.ilike(f"%{script}%"))
        
    txs = query.order_by(Transaction.script, Transaction.transaction_date).all()
    return txs

@router.post("/transactions/scan")
def scan_directory(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        # Load credentials, decrypt them, and pass to subprocess via environment variables
        creds = db.query(BrokerCredentials).filter_by(user_id=current_user.id).all()
        for c in creds:
            bname = c.broker_name.upper()
            os.environ[f"{bname}_USERNAME"] = decrypt_value(c.encrypted_username) or ""
            os.environ[f"{bname}_PASSWORD"] = decrypt_value(c.encrypted_password) or ""
            if c.encrypted_pin:
                os.environ[f"{bname}_PIN"] = decrypt_value(c.encrypted_pin) or ""
            if c.encrypted_totp_key:
                os.environ[f"{bname}_TOTP_KEY"] = decrypt_value(c.encrypted_totp_key) or ""
            if c.encrypted_api_key:
                os.environ[f"{bname}_API_KEY"] = decrypt_value(c.encrypted_api_key) or ""
            if c.encrypted_api_secret:
                os.environ[f"{bname}_API_SECRET"] = decrypt_value(c.encrypted_api_secret) or ""
                
        # Run background trade sync puller scripts
        try:
            run_trade_pullers()
        except Exception as ep:
            print("Error running trade pullers during scan:", ep)
            
        res = scan_and_import_directory(db)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/transactions/import-file")
async def import_uploaded_file(
    broker: str, 
    file: UploadFile = File(...), 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Save the upload file temporarily
    temp_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, file.filename)
    
    with open(temp_path, "wb") as f:
        f.write(await file.read())
        
    try:
        count = import_file(db, temp_path, broker)
        return {"message": f"Successfully imported {count} transactions.", "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary file
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.get("/transactions/history")
def get_import_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(ImportHistory).order_by(ImportHistory.import_date.desc()).all()

# --- LIFO Settlement Endpoints ---

@router.get("/settlement")
def get_settlement(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    txs = db.query(Transaction).all()
    settlement = compute_lifo_settlement(txs)
    return settlement

@router.get("/settlement/export")
def export_settlement(
    format: str = "excel", 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    txs = db.query(Transaction).all()
    settlement = compute_lifo_settlement(txs)
    df = pd.DataFrame(settlement)
    
    # Rename columns to match template headers
    if not df.empty:
        # Columns in dataframe: scrip, broker, buy_date, type, qty, price, sell_date, sum_of_qty, average_of_price, comment, pnl, holding_days, return_pct
        col_mapping = {
            "scrip": "Scrip",
            "buy_date": "Buy Date",
            "type": "Type",
            "qty": "Qty",
            "price": "Price",
            "sell_date": "Sell Date",
            "sum_of_qty": "Sum of Qty",
            "average_of_price": "Average of Price",
            "comment": "Comments",
            "pnl": "P&L",
            "holding_days": "Holding Days",
            "return_pct": "Return %"
        }
        df = df.rename(columns=col_mapping)
        # Reorder columns to match template
        cols_to_keep = ["Scrip", "Buy Date", "Type", "Qty", "Price", "Sell Date", "Sum of Qty", "Average of Price", "Comments", "P&L", "Holding Days", "Return %"]
        df = df[[c for c in cols_to_keep if c in df.columns]]
        
    if format.lower() == "csv":
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = "attachment; filename=LIFO_Settlement.csv"
        return response
    else:
        # Default to Excel
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Output', index=False)
        output.seek(0)
        
        response = StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response.headers["Content-Disposition"] = "attachment; filename=LIFO_Settlement.xlsx"
        return response

@router.get("/holdings/export")
def export_holdings(
    format: str = "excel", 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holdings = db.query(Holding).all()
    
    holdings = db.query(Holding).all()

    # Format data for export
    export_data = []
    for h in holdings:
        # calculate P&L %
        cost = h.quantity * h.avg_price
        pnl_pct = (h.pnl / cost) * 100 if cost else 0.0

        # fetch latest tx
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

        # format date for export
        date_str = latest_tx_date.strftime("%Y-%m-%d") if latest_tx_date else None

        export_data.append({
            "Broker": h.broker,
            "Script": h.script,
            "Quantity": h.quantity,
            "Avg Price": h.avg_price,
            "LTP": h.ltp,
            "Current Value": h.current_value,
            "P&L": h.pnl,
            "P&L %": pnl_pct,
            "Dip %age": dip_pct,
            "Date": date_str,
            "# of Days": latest_tx_days,
            "Type": latest_tx_type
        })
        
    df = pd.DataFrame(export_data)
    
    if format.lower() == "csv":
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = "attachment; filename=Live_Holdings.csv"
        return response
    else:
        # Default to Excel
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Holdings', index=False)
        output.seek(0)
        
        response = StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response.headers["Content-Disposition"] = "attachment; filename=Live_Holdings.xlsx"
        return response

# --- Holdings Dashboard Endpoints ---

@router.get("/holdings")
def get_holdings(refresh_prices: bool = False, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(Holding).all()
    
    holdings = db.query(Holding).all()
        
    live_prices = {}
    if refresh_prices and holdings:
        # Fetch live prices from Yahoo Finance
        scrips = list(set(h.script for h in holdings))
        live_prices = fetch_live_prices(scrips)
        
        for h in holdings:
            if h.script in live_prices and live_prices[h.script]["price"] > 0:
                h.ltp = live_prices[h.script]["price"]
                h.current_value = h.quantity * h.ltp
                h.pnl = h.current_value - (h.quantity * h.avg_price)
        db.commit()
        
    # For each holding, fetch matching mutual funds details
    live_holdings_dicts = []
    for h in holdings:
        live_holdings_dicts.append({
            "script": h.script,
            "broker": h.broker,
            "quantity": h.quantity,
            "avg_price": h.avg_price,
            "ltp": h.ltp
        })
    mf_matches = mf_engine.get_matching_funds_for_holdings(live_holdings_dicts)

    # For each holding, fetch latest comment details and target setting data
    result = []
    for h in holdings:
        # Get latest comment
        latest_comment = db.query(StockComment).filter(StockComment.script == h.script).order_by(StockComment.comment_date.desc()).first()
        
        # Get target setting data (latest target for this scrip)
        latest_target_setting = db.query(TargetSetting).filter(TargetSetting.script == h.script).order_by(TargetSetting.date.desc()).first()
        
        # Determine target price: prefer TargetSetting, fallback to StockComment
        tp = None
        target_type = None
        target_category = None
        target_comment = None
        target_bookmark = None
        
        if latest_target_setting:
            tp = latest_target_setting.target_price
            target_type = latest_target_setting.type
            target_category = latest_target_setting.category
            target_comment = latest_target_setting.comment
            target_bookmark = latest_target_setting.bookmark
        else:
            # Fallback to comment-based target price
            latest_target_comment = db.query(StockComment).filter(StockComment.script == h.script, StockComment.target_price.isnot(None)).order_by(StockComment.comment_date.desc()).first()
            tp = latest_target_comment.target_price if latest_target_comment else None
        
        # Compute distance from target using correct formula based on type
        dist = None
        if tp and h.ltp and h.ltp > 0 and tp > 0:
            if target_type == "Buy":
                dist = ((tp - h.ltp) / h.ltp) * 100
            elif target_type == "Sell":
                dist = ((h.ltp - tp) / tp) * 100
            else:
                # Default formula (no type specified) — same as before
                dist = ((tp - h.ltp) / h.ltp) * 100
            
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

        # Match with mutual funds
        scrip_matches = mf_matches.get(h.script, [])
        order_map = {"H": 0, "P": 1, "Q": 2, "J": 3}
        scrip_matches.sort(key=lambda x: order_map.get(x["fund_code"], 99))
        
        # Clean numpy types
        cleaned_matches = []
        for m in scrip_matches:
            cleaned_matches.append({
                "fund_code": m["fund_code"],
                "fund_name": m["fund_name"],
                "latest_value": float(m["latest_value"]) if (pd.notna(m["latest_value"]) and m["latest_value"] == m["latest_value"]) else 0.0,
                "change_1m": float(m["change_1m"]) if (pd.notna(m["change_1m"]) and m["change_1m"] == m["change_1m"]) else 0.0,
                "change_1m_pct": float(m["change_1m_pct"]) if (pd.notna(m["change_1m_pct"]) and m["change_1m_pct"] == m["change_1m_pct"]) else 0.0,
                "change_2m": float(m["change_2m"]) if (pd.notna(m["change_2m"]) and m["change_2m"] == m["change_2m"]) else 0.0,
                "change_2m_pct": float(m["change_2m_pct"]) if (pd.notna(m["change_2m_pct"]) and m["change_2m_pct"] == m["change_2m_pct"]) else 0.0,
                "change_3m": float(m["change_3m"]) if (pd.notna(m["change_3m"]) and m["change_3m"] == m["change_3m"]) else 0.0,
                "change_3m_pct": float(m["change_3m_pct"]) if (pd.notna(m["change_3m_pct"]) and m["change_3m_pct"] == m["change_3m_pct"]) else 0.0,
                "trend_3m": m["trend_3m"],
                "portfolio_signal": m.get("portfolio_signal", "Active")
            })

        result.append({
            "id": h.id,
            "broker": h.broker,
            "script": h.script,
            "quantity": h.quantity,
            "avg_price": h.avg_price,
            "ltp": h.ltp,
            "current_value": h.current_value,
            "pnl": h.pnl,
            "last_updated": h.last_updated,
            "latest_comment_date": latest_comment.comment_date if latest_comment else None,
            "latest_comment_category": target_category or (latest_comment.category if latest_comment else None),
            "target_price": tp,
            "target_type": target_type,
            "target_comment": target_comment,
            "target_bookmark": target_bookmark,
            "distance_from_target": dist,
            "change_in_ltp_pct": live_prices[h.script]["change_pct"] if h.script in live_prices else 0.0,
            "dip_pct": dip_pct,
            "latest_tx_date": latest_tx_date,
            "latest_tx_days": latest_tx_days,
            "latest_tx_type": latest_tx_type,
            "mutual_funds": cleaned_matches
        })
    return result


# --- Stock Summary Endpoint ---

@router.get("/stock/{scrip}")
def get_stock_summary(scrip: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    txs = db.query(Transaction).filter(Transaction.script == scrip).all()
    
    # Fetch live price & PE info
    live_prices = {}
    try:
        live_prices = fetch_live_prices([scrip])
    except Exception as e:
        print(f"Error fetching live prices: {e}")
        
    current_pe = None
    avg_pe_3y = None
    try:
        current_pe, avg_pe_3y = fetch_pe_info(scrip)
    except Exception as e:
        print(f"Error fetching PE info for {scrip}: {e}")

    # Helper function to sanitize float values (preventing NaN/Inf JSON issues)
    def clean_val(v):
        if v is None:
            return None
        import math
        import pandas as pd
        try:
            if pd.isna(v) or math.isnan(v) or math.isinf(v) or v != v:
                return None
            return float(v)
        except Exception:
            return None

    current_pe = clean_val(current_pe)
    avg_pe_3y = clean_val(avg_pe_3y)

    if not txs:
        # Fallback to holdings table data if no transaction history is found
        holding = db.query(Holding).filter(Holding.script == scrip).first()
        if not holding:
            raise HTTPException(status_code=404, detail="Stock not found in transactions or holdings")
            
        ltp = holding.avg_price
        if scrip in live_prices and live_prices[scrip]["price"] > 0:
            ltp = live_prices[scrip]["price"]
            
        current_value = holding.quantity * ltp
        unrealized_pnl = current_value - (holding.quantity * holding.avg_price)
        
        return {
            "scrip": scrip,
            "current_quantity": clean_val(holding.quantity) or 0.0,
            "avg_price": clean_val(holding.avg_price) or 0.0,
            "current_value": clean_val(current_value) or 0.0,
            "ltp": clean_val(ltp) or 0.0,
            "unrealized_pnl": clean_val(unrealized_pnl) or 0.0,
            "realized_profit": 0.0,
            "realized_loss": 0.0,
            "broker_holdings": [{
                "broker": holding.broker,
                "quantity": clean_val(holding.quantity) or 0.0,
                "avg_price": clean_val(holding.avg_price) or 0.0,
                "current_value": clean_val(current_value) or 0.0,
                "pnl": clean_val(unrealized_pnl) or 0.0
            }],
            "timeline": [],
            "settlement_history": [],
            "xirr": 0.0,
            "current_pe": current_pe,
            "avg_pe_3y": avg_pe_3y,
            "highlight_date": None,
            "action_checked": False
        }
        
    settlement = compute_lifo_settlement(txs)
    
    # Calculate stats
    total_qty = 0.0
    total_cost = 0.0
    
    # Live holdings (unsettled buys)
    unsettled_buys = [r for r in settlement if r["comment"] == "Unsettled" and r["buy_date"] is not None]
    for b in unsettled_buys:
        total_qty += b["qty"]
        total_cost += b["qty"] * b["price"]
        
    avg_price = total_cost / total_qty if total_qty > 0 else 0.0
    
    # Fetch live price
    ltp = avg_price
    if scrip in live_prices and live_prices[scrip]["price"] > 0:
        ltp = live_prices[scrip]["price"]
    
    current_value = total_qty * ltp
    unrealized_pnl = current_value - total_cost
    
    # Realized profits/losses from settled matches
    realized_profit = 0.0
    realized_loss = 0.0
    for row in settlement:
        if row["pnl"] is not None:
            if row["pnl"] > 0:
                realized_profit += row["pnl"]
            else:
                realized_loss += abs(row["pnl"])
                
    # Broker-wise holdings
    broker_holdings = {}
    for b in unsettled_buys:
        br = b["broker"]
        if br not in broker_holdings:
            broker_holdings[br] = {"qty": 0.0, "cost": 0.0}
        broker_holdings[br]["qty"] += b["qty"]
        broker_holdings[br]["cost"] += b["qty"] * b["price"]
        
    broker_stats = []
    for br, data in broker_holdings.items():
        br_avg = data["cost"] / data["qty"] if data["qty"] > 0 else 0.0
        br_val = data["qty"] * ltp
        broker_stats.append({
            "broker": br,
            "quantity": clean_val(data["qty"]) or 0.0,
            "avg_price": clean_val(br_avg) or 0.0,
            "current_value": clean_val(br_val) or 0.0,
            "pnl": clean_val(br_val - data["cost"]) or 0.0
        })
        
    # Transaction timeline (grouped by date, buy_sell, broker)
    grouped_timeline = {}
    for t in txs:
        date_only = t.transaction_date.date()
        key = (date_only, t.buy_sell.upper(), t.broker)
        if key not in grouped_timeline:
            grouped_timeline[key] = {
                "date": datetime.combine(date_only, datetime.min.time()),
                "broker": t.broker,
                "buy_sell": t.buy_sell.upper(),
                "quantity": 0.0,
                "total_cost": 0.0,
                "exchanges": set(),
                "order_numbers": set()
            }
        g = grouped_timeline[key]
        g["quantity"] += t.quantity
        g["total_cost"] += t.price * t.quantity
        if t.exchange:
            g["exchanges"].add(t.exchange)
        if t.order_number:
            g["order_numbers"].add(t.order_number)

    timeline = []
    for key, g in grouped_timeline.items():
        qty = g["quantity"]
        price = g["total_cost"] / qty if qty > 0 else 0.0
        exchange_str = ", ".join(sorted(list(g["exchanges"]))) if g["exchanges"] else None
        order_str = ", ".join(sorted(list(g["order_numbers"]))) if g["order_numbers"] else ""
        timeline.append({
            "date": g["date"],
            "broker": g["broker"],
            "buy_sell": g["buy_sell"],
            "quantity": clean_val(qty) or 0.0,
            "price": clean_val(price) or 0.0,
            "exchange": exchange_str,
            "order_number": order_str
        })
    # Sort timeline by date desc
    timeline.sort(key=lambda x: x["date"], reverse=True)

    # Calculate XIRR cash flows
    cash_flows = []
    for t in txs:
        val = t.price * t.quantity
        if t.buy_sell.upper() == "BUY":
            cash_flows.append({"date": t.transaction_date, "amount": -val})
        elif t.buy_sell.upper() == "SELL":
            cash_flows.append({"date": t.transaction_date, "amount": val})
            
    if total_qty > 0:
        cash_flows.append({"date": datetime.now(), "amount": total_qty * ltp})
        
    xirr_val = calculate_xirr(cash_flows) * 100.0
    xirr_val = clean_val(xirr_val) or 0.0

    # Calculate highlight date for most recent open buy transaction picked for LIFO Section 1
    highlight_date = None
    if txs:
        open_buys = [r for r in settlement if r.get("comment") == "Unsettled" and r.get("type") == "Buy" and r.get("buy_date") is not None]
        if open_buys:
            most_recent_open_buy = max(open_buys, key=lambda x: x["buy_date"])
            highlight_date = most_recent_open_buy["buy_date"].isoformat() if most_recent_open_buy["buy_date"] else None

    # Check action checked (expires in 24 hours)
    action_record = db.query(WatchlistAction).filter(
        WatchlistAction.script == scrip,
        WatchlistAction.section == 'section1'
    ).first()
    
    action_checked = False
    if action_record:
        time_diff = datetime.now() - action_record.checked_at.replace(tzinfo=None)
        if time_diff.total_seconds() < 24 * 60 * 60:
            action_checked = True
        else:
            db.delete(action_record)
            db.commit()

    return {
        "scrip": scrip,
        "current_quantity": clean_val(total_qty) or 0.0,
        "avg_price": clean_val(avg_price) or 0.0,
        "highlight_date": highlight_date,
        "action_checked": action_checked,
        "current_value": clean_val(current_value) or 0.0,
        "ltp": clean_val(ltp) or 0.0,
        "unrealized_pnl": clean_val(unrealized_pnl) or 0.0,
        "realized_profit": clean_val(realized_profit) or 0.0,
        "realized_loss": clean_val(realized_loss) or 0.0,
        "broker_holdings": broker_stats,
        "timeline": timeline,
        "settlement_history": [
            {
                "scrip": r["scrip"],
                "broker": r["broker"],
                "buy_date": r["buy_date"],
                "type": r["type"],
                "qty": clean_val(r["qty"]),
                "price": clean_val(r["price"]),
                "sell_date": r["sell_date"],
                "sum_of_qty": clean_val(r["sum_of_qty"]),
                "average_of_price": clean_val(r["average_of_price"]),
                "comment": r["comment"],
                "pnl": clean_val(r["pnl"]),
                "holding_days": r["holding_days"],
                "return_pct": clean_val(r["return_pct"])
            }
            for r in settlement if r["pnl"] is not None
        ],
        "xirr": xirr_val,
        "current_pe": current_pe,
        "avg_pe_3y": avg_pe_3y
    }

# --- Analytics Dashboard Endpoint ---

@router.get("/analytics")
def get_analytics(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    txs = db.query(Transaction).all()
    settlement = compute_lifo_settlement(txs)
    holdings = db.query(Holding).all()
    
    # 1. Portfolio Allocation
    allocation = []
    total_val = sum(h.current_value for h in holdings)
    for h in holdings:
        if h.quantity > 0:
            allocation.append({
                "name": h.script,
                "value": h.current_value,
                "pct": (h.current_value / total_val * 100) if total_val > 0 else 0.0
            })
            
    # Sort allocation by value desc
    allocation.sort(key=lambda x: x["value"], reverse=True)
    
    # 2. Broker Allocation
    broker_alloc = {}
    for h in holdings:
        broker_alloc[h.broker] = broker_alloc.get(h.broker, 0.0) + h.current_value
    broker_allocation = [{"name": k, "value": v} for k, v in broker_alloc.items()]
    
    # 3. Monthly Profit/Loss (Realized)
    monthly_pnl = {}
    for row in settlement:
        if row["pnl"] is not None and row["sell_date"] is not None:
            # key as 'YYYY-MM'
            month_key = row["sell_date"].strftime("%Y-%m")
            monthly_pnl[month_key] = monthly_pnl.get(month_key, 0.0) + row["pnl"]
            
    monthly_stats = [{"month": k, "pnl": v} for k, v in sorted(monthly_pnl.items())]
    
    # 4. Top Gainers & Losers (Unrealized P&L)
    gainers_losers = []
    for h in holdings:
        gainers_losers.append({
            "scrip": h.script,
            "pnl": h.pnl,
            "pnl_pct": (h.pnl / (h.quantity * h.avg_price) * 100) if h.avg_price > 0 else 0.0
        })
        
    gainers = sorted([x for x in gainers_losers if x["pnl"] > 0], key=lambda x: x["pnl"], reverse=True)[:5]
    losers = sorted([x for x in gainers_losers if x["pnl"] < 0], key=lambda x: x["pnl"])[:5]
    
    # 5. Holding Duration Analysis
    duration_stats = {"1-30 days": 0, "31-90 days": 0, "91-180 days": 0, "180+ days": 0}
    for row in settlement:
        if row["holding_days"] is not None:
            d = row["holding_days"]
            if d <= 30:
                duration_stats["1-30 days"] += 1
            elif d <= 90:
                duration_stats["31-90 days"] += 1
            elif d <= 180:
                duration_stats["91-180 days"] += 1
            else:
                duration_stats["180+ days"] += 1
                
    holding_duration = [{"range": k, "count": v} for k, v in duration_stats.items()]
    
    # Summary Cards
    total_investment = sum(h.quantity * h.avg_price for h in holdings)
    total_market_value = total_val
    unrealized_pnl = total_market_value - total_investment
    realized_pnl = sum(r["pnl"] for r in settlement if r["pnl"] is not None)
    
    return {
        "summary": {
            "total_investment": total_investment,
            "total_market_value": total_market_value,
            "unrealized_pnl": unrealized_pnl,
            "realized_pnl": realized_pnl
        },
        "portfolio_allocation": allocation,
        "broker_allocation": broker_allocation,
        "monthly_pnl": monthly_stats,
        "gainers": gainers,
        "losers": losers,
        "holding_duration": holding_duration
    }

# --- Audit Logs Endpoint ---

@router.get("/logs")
def get_audit_logs(category: Optional[str] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(AuditLog)
    if category:
        query = query.filter_by(category=category)
    return query.order_by(AuditLog.timestamp.desc()).all()

# --- Interactive Automation Endpoints ---

from fastapi import BackgroundTasks
from automation.browser import automation_states, run_zerodha_scraper, run_mstock_scraper, run_dhan_scraper

class OtpRequest(BaseModel):
    otp: str

def bg_scrape(broker: str, cred_id: int, db_session_factory):
    db = db_session_factory()
    try:
        automation_states[broker]["status"] = "SCRAPING"
        automation_states[broker]["error"] = None
        
        cred = db.query(BrokerCredentials).filter_by(id=cred_id).first()
        if not cred:
            raise ValueError("Credentials not found")
            
        username = decrypt_value(cred.encrypted_username)
        password = decrypt_value(cred.encrypted_password)
        pin = decrypt_value(cred.encrypted_pin) if cred.encrypted_pin else None
        totp_key = decrypt_value(cred.encrypted_totp_key) if cred.encrypted_totp_key else None
        api_key = decrypt_value(cred.encrypted_api_key) if cred.encrypted_api_key else None
        api_secret = decrypt_value(cred.encrypted_api_secret) if cred.encrypted_api_secret else None
        
        if broker == "zerodha":
            holdings = run_zerodha_scraper(username, password, pin, totp_key, api_key, api_secret)
        elif broker == "mstock":
            holdings = run_mstock_scraper(username, password, pin, totp_key, api_key, api_secret)
        elif broker == "dhan":
            holdings = run_dhan_scraper(username, password, pin, totp_key, api_key, api_secret)
        else:
            holdings = []
            
        if automation_states[broker]["status"] == "SUCCESS" and holdings:
            # Clear previous holdings for this broker (using exact database capitalization)
            broker_mapping = {"mstock": "MStock", "zerodha": "Zerodha", "dhan": "Dhan"}
            db_broker = broker_mapping.get(broker.lower(), broker.capitalize())
            db.query(Holding).filter(Holding.broker == db_broker).delete()
            for h in holdings:
                db_holding = Holding(
                    broker=h["broker"],
                    script=h["script"],
                    quantity=h["quantity"],
                    avg_price=h["avg_price"],
                    ltp=h["ltp"],
                    current_value=h["current_value"],
                    pnl=h["pnl"]
                )
                db.add(db_holding)
            db.commit()
            
            audit = AuditLog(
                category="REFRESH",
                description=f"Successfully synchronized holdings for {broker.capitalize()}. Total rows: {len(holdings)}."
            )
            db.add(audit)
            db.commit()
    except Exception as e:
        automation_states[broker]["status"] = "FAILED"
        automation_states[broker]["error"] = str(e)
        
        audit = AuditLog(
            category="SYSTEM_ERROR",
            description=f"Holdings synchronization failed for {broker.capitalize()}: {str(e)}"
        )
        db.add(audit)
        db.commit()
    finally:
        db.close()

@router.post("/automation/scrape/{broker}")
def trigger_scrape(
    broker: str, 
    background_tasks: BackgroundTasks, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    broker = broker.lower()
    if broker not in ["mstock", "zerodha", "dhan"]:
        raise HTTPException(status_code=400, detail="Invalid broker")
        
    cred = db.query(BrokerCredentials).filter_by(user_id=current_user.id, broker_name=broker).first()
    if not cred:
        raise HTTPException(status_code=400, detail=f"No credentials configured for {broker}")
        
    # Run in background task to avoid blocking API thread
    from services.database import SessionLocal
    background_tasks.add_task(bg_scrape, broker, cred.id, SessionLocal)
    return {"message": f"Scrape triggered for {broker}."}

@router.get("/automation/status/{broker}")
def get_automation_status(broker: str, current_user: User = Depends(get_current_user)):
    broker = broker.lower()
    if broker not in automation_states:
        raise HTTPException(status_code=400, detail="Invalid broker")
    return automation_states[broker]

@router.post("/automation/otp/{broker}")
def submit_otp(broker: str, req: OtpRequest, current_user: User = Depends(get_current_user)):
    broker = broker.lower()
    if broker not in automation_states:
        raise HTTPException(status_code=400, detail="Invalid broker")
    
    automation_states[broker]["otp"] = req.otp
    return {"message": f"OTP submitted for {broker}."}


# --- Comments Endpoints ---

class CommentCreateRequest(BaseModel):
    script: str
    category: str
    comment_text: str
    target_price: Optional[float] = None

@router.get("/comments/{scrip}")
def get_comments(scrip: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comments = db.query(StockComment).filter(StockComment.script == scrip).order_by(StockComment.comment_date.desc()).all()
    return comments

@router.post("/comments")
def add_comment(req: CommentCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = StockComment(
        script=req.script,
        category=req.category,
        comment_text=req.comment_text,
        target_price=req.target_price
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    # Audit log entry for adding comment
    audit = AuditLog(
        category="COMMENT",
        description=f"Added comment for {req.script} (Category: {req.category}, Target Price: {req.target_price or 'N/A'})."
    )
    db.add(audit)
    db.commit()
    return comment

@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = db.query(StockComment).filter(StockComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Audit log entry for deleting comment
    audit = AuditLog(
        category="COMMENT",
        description=f"Deleted comment ID {comment_id} for {comment.script}."
    )
    db.delete(comment)
    db.add(audit)
    db.commit()
    return {"message": "Comment deleted successfully"}


# --- Executed Orders Endpoints ---

@router.get("/executed-orders")
def get_executed_orders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from datetime import datetime, time
    today_start = datetime.combine(datetime.now().date(), time.min)
    orders = db.query(ExecutedOrder).filter(ExecutedOrder.execution_time >= today_start).order_by(ExecutedOrder.execution_time.desc()).all()
    if not orders:
        return []
        
    # Batch update LTPs on the fly
    scrips = list(set(o.script for o in orders))
    live_prices = {}
    try:
        live_prices = fetch_live_prices(scrips)
    except Exception as ep:
        print(f"Error fetching live prices in routes.py: {ep}")

    # Commit updates to database so that they are saved
    for o in orders:
        if o.script in live_prices and live_prices[o.script]["price"] > 0:
            o.ltp = live_prices[o.script]["price"]
            if o.buy_sell == "BUY":
                o.pnl = (o.ltp - o.price) * o.quantity
                o.pnl_pct = ((o.ltp - o.price) / o.price * 100) if o.price > 0 else 0.0
            else:
                o.pnl = (o.price - o.ltp) * o.quantity
                o.pnl_pct = ((o.price - o.ltp) / o.price * 100) if o.price > 0 else 0.0
    db.commit()

    return [
        {
            "id": o.id,
            "broker": o.broker,
            "script": o.script,
            "buy_sell": o.buy_sell,
            "quantity": o.quantity,
            "price": o.price,
            "ltp": o.ltp,
            "amount": o.amount,
            "pnl": o.pnl,
            "pnl_pct": o.pnl_pct,
            "order_id": o.order_id,
            "execution_time": o.execution_time,
            "last_updated": o.last_updated
        }
        for o in orders
    ]


# --- Mutual Fund Endpoints ---

def safe_float(v) -> float:
    if pd.isna(v) or v is None:
        return 0.0
    try:
        s = str(v).strip().replace('%', '')
        return float(s)
    except ValueError:
        return 0.0

@router.get("/mutual-funds/summary")
def get_mutual_funds_summary(
    current_user: User = Depends(get_current_user)
):
    try:
        return mf_engine.get_summary()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mutual-funds/data")
def get_mutual_funds_data(
    fund_code: Optional[str] = None,
    month: Optional[str] = None,
    stock: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    try:
        df = mf_engine.get_raw_dataframe()
        if fund_code and fund_code != "ALL":
            df = df[df["Fund Code"] == fund_code]
        if month:
            df = df[df["Month"] == month]
        if stock:
            df = df[df["Stock Name"].str.contains(stock, case=False) | df["Stock Name.1"].str.contains(stock, case=False)]
        
        # Convert df to dictionary to return
        records = []
        for _, r in df.iterrows():
            records.append({
                "mutual_fund": r.get("Mutual Fund"),
                "fund_code": r.get("Fund Code"),
                "month": r.get("Month"),
                "isin": r.get("ISIN"),
                "stock_name": r.get("Stock Name"),
                "industry": r.get("Industry"),
                "quantity": int(r.get("Quantity")) if pd.notna(r.get("Quantity")) else 0,
                "pct_nav": safe_float(r.get("% to NAV")),
                "symbol": r.get("Stock Name.1") if pd.notna(r.get("Stock Name.1")) else None,
                "ltp": float(r.get("LTP")) if pd.notna(r.get("LTP")) else 0.0,
                "value_crore": float(r.get("Holding Value Crore")) if pd.notna(r.get("Holding Value Crore")) else 0.0
            })
        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mutual-funds/analytics")
def get_mutual_funds_analytics(
    fund_code: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    try:
        analytics = mf_engine.compute_analytics(fund_code)
        # Handle NaN values to prevent JSON errors
        for a in analytics:
            if isinstance(a["pct_nav"], list):
                a["pct_nav"] = [safe_float(v) for v in a["pct_nav"]]
            else:
                a["pct_nav"] = safe_float(a["pct_nav"])
            
            # Helper check function for pandas nan values
            def check_val(x) -> float:
                if pd.isna(x) or x != x:
                    return 0.0
                return float(x)

            def clean_str(s) -> Optional[str]:
                if pd.isna(s) or s is None or s != s:
                    return None
                return str(s)

            a["symbol"] = clean_str(a.get("symbol"))
            a["isin"] = clean_str(a.get("isin"))
            a["stock_name"] = clean_str(a.get("stock_name"))
            a["industry"] = clean_str(a.get("industry"))

            a["latest_quantity"] = check_val(a["latest_quantity"])
            a["latest_value_crore"] = check_val(a["latest_value_crore"])
            a["latest_ltp"] = check_val(a["latest_ltp"])
            
            a["change_1m_crore"] = check_val(a["change_1m_crore"])
            a["change_1m_pct"] = check_val(a["change_1m_pct"])
            a["change_2m_crore"] = check_val(a["change_2m_crore"])
            a["change_2m_pct"] = check_val(a["change_2m_pct"])
            a["change_3m_crore"] = check_val(a["change_3m_crore"])
            a["change_3m_pct"] = check_val(a["change_3m_pct"])
            
            for m in a["month_values"]:
                mv = a["month_values"][m]
                mv["quantity"] = check_val(mv.get("quantity"))
                mv["value_crore"] = check_val(mv.get("value_crore"))
                mv["ltp"] = check_val(mv.get("ltp"))
                if isinstance(mv["pct_nav"], list):
                    mv["pct_nav"] = [safe_float(v) for v in mv["pct_nav"]]
                else:
                    mv["pct_nav"] = safe_float(mv["pct_nav"])
                    
        return analytics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MutualFundsExportRequest(BaseModel):
    rows: Optional[List[dict]] = None
    fund_code: Optional[str] = "ALL"
    filter: Optional[str] = "ALL"
    format: Optional[str] = "excel"

@router.post("/mutual-funds/export")
@router.get("/mutual-funds/export")
def export_mutual_funds(
    req: Optional[MutualFundsExportRequest] = None,
    fund_code: Optional[str] = None,
    format: str = "excel",
    current_user: User = Depends(get_current_user)
):
    try:
        months = mf_engine.get_available_months()
        
        rows_data = None
        export_format = format
        target_fund_code = fund_code

        if req:
            if req.rows is not None:
                rows_data = req.rows
            if req.format:
                export_format = req.format
            if req.fund_code:
                target_fund_code = req.fund_code

        if rows_data is None:
            rows_data = mf_engine.compute_analytics(target_fund_code)

        export_data = []
        for a in rows_data:
            m_vals = a.get("month_values", {})
            mf_name = a.get("mutual_fund")

            row = {
                "Portfolio Signal": a.get("portfolio_signal"),
                "Mutual Fund": mf_name or "",
                "Symbol": a.get("symbol") or "",
                "Stock Name": a.get("stock_name") or "",
                "Industry": a.get("industry") or "",
                "Status": a.get("status") or "",
            }

            for m in months:
                mv = m_vals.get(m, {}) if isinstance(m_vals, dict) else {}
                val = mv.get("value_crore", 0.0) if isinstance(mv, dict) else 0.0
                row[m] = round(val, 2) if val else 0.0

            row["1M Change (Cr)"] = round(a.get("change_1m_crore", 0.0), 2)
            row["1M Change (%)"] = round(a.get("change_1m_pct", 0.0), 2)
            row["2M Change (Cr)"] = round(a.get("change_2m_crore", 0.0), 2)
            row["2M Change (%)"] = round(a.get("change_2m_pct", 0.0), 2)
            row["3M Change (Cr)"] = round(a.get("change_3m_crore", 0.0), 2)
            row["3M Change (%)"] = round(a.get("change_3m_pct", 0.0), 2)

            export_data.append(row)

        df = pd.DataFrame(export_data)

        if (export_format or "excel").lower() == "csv":
            stream = io.StringIO()
            df.to_csv(stream, index=False)
            response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
            response.headers["Content-Disposition"] = "attachment; filename=Mutual_Funds_Holdings_Filtered.csv"
            return response
        else:
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Mutual_Funds_Holdings', index=False)
            output.seek(0)
            response = StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            response.headers["Content-Disposition"] = "attachment; filename=Mutual_Funds_Holdings_Filtered.xlsx"
            return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mutual-funds/unmatched")
def get_mutual_funds_unmatched(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        live_holdings = db.query(Holding).all()
        # Convert model instances to dictionary for the engine
        live_holdings_dicts = []
        for h in live_holdings:
            live_holdings_dicts.append({
                "script": h.script,
                "broker": h.broker,
                "quantity": h.quantity,
                "avg_price": h.avg_price,
                "ltp": h.ltp
            })
        return mf_engine.get_unmatched_stocks_report(live_holdings_dicts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Target Setting Endpoints ---

class TargetCreateRequest(BaseModel):
    script: str
    type: str  # 'Buy' or 'Sell'
    target_price: float
    category: Optional[str] = None
    comment: Optional[str] = None
    bookmark: Optional[str] = None
    date: Optional[str] = None  # ISO format string, defaults to now


class TargetUpdateRequest(BaseModel):
    type: Optional[str] = None
    target_price: Optional[float] = None
    category: Optional[str] = None
    comment: Optional[str] = None
    bookmark: Optional[str] = None
    triggered: Optional[int] = None
    date: Optional[str] = None


@router.get("/targets")
def get_targets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all targets with live LTP, distance %, and triggered status computed on the fly."""
    targets = db.query(TargetSetting).order_by(TargetSetting.date.desc()).all()
    if not targets:
        return []

    # Batch-fetch LTPs for all unique scrips
    scrips = list(set(t.script for t in targets))
    live_prices = {}
    try:
        live_prices = fetch_live_prices(scrips)
    except Exception as e:
        print(f"Error fetching live prices for targets: {e}")

    import math

    def safe_float(v):
        if v is None:
            return None
        try:
            f = float(v)
            if math.isnan(f) or math.isinf(f):
                return None
            return f
        except Exception:
            return None

    result = []
    for t in targets:
        ltp = None
        if t.script in live_prices and live_prices[t.script]["price"] > 0:
            ltp = live_prices[t.script]["price"]

        # Compute distance %
        distance_pct = None
        if ltp is not None and t.target_price is not None and t.target_price > 0:
            if t.type == "Buy":
                distance_pct = ((t.target_price - ltp) / ltp) * 100
            elif t.type == "Sell":
                distance_pct = ((ltp - t.target_price) / t.target_price) * 100

        # Compute triggered status
        triggered = False
        if ltp is not None and t.target_price is not None:
            if t.type == "Buy" and ltp <= t.target_price:
                triggered = True
            elif t.type == "Sell" and ltp >= t.target_price:
                triggered = True

        # Auto-update triggered flag in DB if state changed
        new_triggered_val = 1 if triggered else 0
        if t.triggered != new_triggered_val:
            t.triggered = new_triggered_val

        result.append({
            "id": t.id,
            "date": t.date,
            "script": t.script,
            "type": t.type,
            "target_price": safe_float(t.target_price),
            "ltp": safe_float(ltp),
            "distance_pct": safe_float(distance_pct),
            "category": t.category,
            "comment": t.comment,
            "triggered": triggered,
            "bookmark": t.bookmark,
            "created_at": t.created_at,
            "updated_at": t.updated_at
        })

    db.commit()  # persist any triggered flag updates
    return result


@router.post("/targets")
def create_target(req: TargetCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new target setting row."""
    if req.type not in ("Buy", "Sell"):
        raise HTTPException(status_code=400, detail="Type must be 'Buy' or 'Sell'")

    target_date = datetime.now()
    if req.date:
        try:
            target_date = datetime.fromisoformat(req.date.replace("Z", "+00:00"))
        except Exception:
            target_date = datetime.now()

    target = TargetSetting(
        date=target_date,
        script=req.script,
        type=req.type,
        target_price=req.target_price,
        category=req.category,
        comment=req.comment,
        bookmark=req.bookmark,
        triggered=0
    )
    db.add(target)
    db.commit()
    db.refresh(target)

    # Two-way sync: also upsert a StockComment entry
    if req.comment or req.target_price:
        comment = StockComment(
            script=req.script,
            category=req.category or "General",
            comment_text=req.comment or f"Target {req.type} @ ₹{req.target_price}",
            target_price=req.target_price
        )
        db.add(comment)
        db.commit()

    # Audit log
    audit = AuditLog(
        category="TARGET",
        description=f"Created {req.type} target for {req.script} @ ₹{req.target_price} (Category: {req.category or 'N/A'})."
    )
    db.add(audit)
    db.commit()

    return {
        "id": target.id,
        "date": target.date,
        "script": target.script,
        "type": target.type,
        "target_price": target.target_price,
        "category": target.category,
        "comment": target.comment,
        "triggered": False,
        "bookmark": target.bookmark,
        "created_at": target.created_at,
        "updated_at": target.updated_at
    }


@router.put("/targets/{target_id}")
def update_target(target_id: int, req: TargetUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update an existing target setting row."""
    target = db.query(TargetSetting).filter(TargetSetting.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    # Track whether any substantive field is being edited
    substantive_update = False

    if req.type is not None:
        if req.type not in ("Buy", "Sell"):
            raise HTTPException(status_code=400, detail="Type must be 'Buy' or 'Sell'")
        target.type = req.type
        substantive_update = True
    if req.target_price is not None:
        target.target_price = req.target_price
        substantive_update = True
    if req.category is not None:
        target.category = req.category
        substantive_update = True
    if req.comment is not None:
        target.comment = req.comment
        substantive_update = True
    if req.bookmark is not None:
        target.bookmark = req.bookmark
    if req.triggered is not None:
        target.triggered = req.triggered
    if req.date is not None:
        try:
            target.date = datetime.fromisoformat(req.date.replace("Z", "+00:00"))
        except Exception:
            pass
    elif substantive_update:
        # Auto-overwrite creation_date with modification timestamp on edit
        target.date = datetime.now()

    db.commit()
    db.refresh(target)

    # Audit log
    audit = AuditLog(
        category="TARGET",
        description=f"Updated target ID {target_id} for {target.script}."
    )
    db.add(audit)
    db.commit()

    return {
        "id": target.id,
        "date": target.date,
        "script": target.script,
        "type": target.type,
        "target_price": target.target_price,
        "category": target.category,
        "comment": target.comment,
        "triggered": bool(target.triggered),
        "bookmark": target.bookmark,
        "created_at": target.created_at,
        "updated_at": target.updated_at
    }


@router.delete("/targets/{target_id}")
def delete_target(target_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a target setting row."""
    target = db.query(TargetSetting).filter(TargetSetting.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    script_name = target.script
    db.delete(target)

    # Audit log
    audit = AuditLog(
        category="TARGET",
        description=f"Deleted target ID {target_id} for {script_name}."
    )
    db.add(audit)
    db.commit()
    return {"message": "Target deleted successfully"}


@router.get("/targets/scrips")
def get_target_scrips(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return all unique scrip names from holdings + transactions for autocomplete."""
    holding_scrips = db.query(Holding.script).distinct().all()
    tx_scrips = db.query(Transaction.script).distinct().all()

    all_scrips = set()
    for (s,) in holding_scrips:
        if s:
            all_scrips.add(s)
    for (s,) in tx_scrips:
        if s:
            all_scrips.add(s)

    return sorted(list(all_scrips))


# --- Target Category Endpoints ---

@router.get("/target-categories")
def get_target_categories(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all target categories."""
    cats = db.query(TargetCategory).order_by(TargetCategory.id).all()
    return [c.name for c in cats]


@router.post("/target-categories")
def add_target_category(req: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Add a new custom category."""
    name = req.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    existing = db.query(TargetCategory).filter_by(name=name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")

    cat = TargetCategory(name=name)
    db.add(cat)
    db.commit()
    return {"name": cat.name, "id": cat.id}


# ════════════════════════════════════════════════════════════════════════════
# --- Analytics Endpoints ---
# All endpoints accept an optional ?broker= query param for global filtering.
# ════════════════════════════════════════════════════════════════════════════

import math as _math
import statistics as _statistics

# NSE sector classification map (script suffix stripped to base ticker)
_SECTOR_MAP = {
    # Financials
    "HDFCBANK": "Financials", "ICICIBANK": "Financials", "SBIN": "Financials",
    "AXISBANK": "Financials", "KOTAKBANK": "Financials", "BAJFINANCE": "Financials",
    "BAJAJFINSV": "Financials", "HDFC": "Financials", "SHRIRAMFIN": "Financials",
    "CHOLAFIN": "Financials", "MUTHOOTFIN": "Financials", "LTFH": "Financials",
    "MANAPPURAM": "Financials", "FEDERALBNK": "Financials", "IDFCFIRSTB": "Financials",
    "BANDHANBNK": "Financials", "RBLBANK": "Financials", "CANBK": "Financials",
    "BANKBARODA": "Financials", "PNB": "Financials", "UNIONBANK": "Financials",
    # IT
    "TCS": "Information Technology", "INFY": "Information Technology",
    "WIPRO": "Information Technology", "HCLTECH": "Information Technology",
    "TECHM": "Information Technology", "LTIM": "Information Technology",
    "MPHASIS": "Information Technology", "PERSISTENT": "Information Technology",
    "COFORGE": "Information Technology", "KPITTECH": "Information Technology",
    # Energy
    "RELIANCE": "Energy", "ONGC": "Energy", "IOC": "Energy", "BPCL": "Energy",
    "HINDPETRO": "Energy", "GAIL": "Energy", "MGL": "Energy", "IGL": "Energy",
    "ATGL": "Energy", "PETRONET": "Energy", "ADANIGREEN": "Energy",
    "TATAPOWER": "Energy", "NTPC": "Energy", "POWERGRID": "Energy",
    # Auto
    "MARUTI": "Automobile", "TATAMOTORS": "Automobile", "M&M": "Automobile",
    "HEROMOTOCO": "Automobile", "BAJAJ-AUTO": "Automobile", "EICHERMOT": "Automobile",
    "TVSMOTOR": "Automobile", "ASHOKLEY": "Automobile", "MOTHERSON": "Automobile",
    "UNOMINDA": "Automobile", "BOSCHLTD": "Automobile",
    # FMCG
    "HINDUNILVR": "FMCG", "ITC": "FMCG", "NESTLEIND": "FMCG", "BRITANNIA": "FMCG",
    "DABUR": "FMCG", "MARICO": "FMCG", "COLPAL": "FMCG", "GODREJCP": "FMCG",
    "EMAMILTD": "FMCG", "TATACONSUM": "FMCG", "VBL": "FMCG",
    # Pharma
    "SUNPHARMA": "Pharma", "DRREDDY": "Pharma", "CIPLA": "Pharma",
    "DIVISLAB": "Pharma", "BIOCON": "Pharma", "LUPIN": "Pharma",
    "AUROPHARMA": "Pharma", "ALKEM": "Pharma", "TORNTPHARM": "Pharma",
    "IPCALAB": "Pharma", "ABBOTINDIA": "Pharma",
    # Metals
    "TATASTEEL": "Metals & Mining", "JSWSTEEL": "Metals & Mining",
    "HINDALCO": "Metals & Mining", "VEDL": "Metals & Mining",
    "COALINDIA": "Metals & Mining", "NMDC": "Metals & Mining",
    "SAIL": "Metals & Mining", "JINDALSTEL": "Metals & Mining",
    # Infra/Construction
    "LT": "Infrastructure", "ULTRACEMCO": "Infrastructure", "SHREECEM": "Infrastructure",
    "ACC": "Infrastructure", "AMBUJACEMENT": "Infrastructure", "DLF": "Infrastructure",
    "GODREJPROP": "Infrastructure", "PRESTIGE": "Infrastructure",
    "OBEROIRLTY": "Infrastructure", "PHOENIXLTD": "Infrastructure",
    # Telecom
    "BHARTIARTL": "Telecom", "IDEA": "Telecom",
    # Consumer Discretionary
    "TITAN": "Consumer Discretionary", "DMART": "Consumer Discretionary",
    "ZOMATO": "Consumer Discretionary", "NYKAA": "Consumer Discretionary",
    "TRENT": "Consumer Discretionary", "ABFRL": "Consumer Discretionary",
    "PAGEIND": "Consumer Discretionary", "VEDANT": "Consumer Discretionary",
    # Chemicals
    "PIDILITIND": "Chemicals", "ASIANPAINT": "Chemicals", "BERGERPAINTS": "Chemicals",
    "SRF": "Chemicals", "AAVAS": "Chemicals", "DEEPAKNITRITE": "Chemicals",
    # Healthcare Services
    "APOLLOHOSP": "Healthcare", "MAXHEALTH": "Healthcare", "FORTIS": "Healthcare",
    "NARAYANNHC": "Healthcare", "METROPOLIS": "Healthcare", "THYROCARE": "Healthcare",
    # Capital Goods
    "SIEMENS": "Capital Goods", "ABB": "Capital Goods", "BHEL": "Capital Goods",
    "HAVELLS": "Capital Goods", "CUMMINSIND": "Capital Goods", "THERMAX": "Capital Goods",
    "BEL": "Capital Goods", "HAL": "Capital Goods",
}

def _get_sector(script: str) -> str:
    """Map a script name (e.g. 'BHARTIARTL-EQ') to its NSE sector."""
    base = script.replace("-EQ", "").replace("-BE", "").replace("-BL", "").upper()
    return _SECTOR_MAP.get(base, "Others")


def _apply_broker_filter(query, broker: Optional[str]):
    if broker and broker.lower() != "all":
        return query.filter(Transaction.broker.ilike(broker))
    return query


@router.get("/analytics/monthly-pnl")
def analytics_monthly_pnl(
    broker: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Monthly Realized P&L using LIFO settlement.
    Returns: [{month: 'YYYY-MM', gains: float, losses: float, net: float}]
    """
    query = db.query(Transaction)
    if broker and broker.lower() != "all":
        query = query.filter(Transaction.broker.ilike(broker))
    txs = query.all()

    settlement = compute_lifo_settlement(txs)

    month_map: dict = {}
    for row in settlement:
        if row.get("pnl") is None or row.get("sell_date") is None:
            continue
        sd = row["sell_date"]
        if isinstance(sd, str):
            sd = datetime.fromisoformat(sd)
        month_key = sd.strftime("%Y-%m")
        if month_key not in month_map:
            month_map[month_key] = {"gains": 0.0, "losses": 0.0}
        pnl = float(row["pnl"])
        if pnl >= 0:
            month_map[month_key]["gains"] += pnl
        else:
            month_map[month_key]["losses"] += pnl

    result = sorted([
        {
            "month": k,
            "gains": round(v["gains"], 2),
            "losses": round(v["losses"], 2),
            "net": round(v["gains"] + v["losses"], 2)
        }
        for k, v in month_map.items()
    ], key=lambda x: x["month"])

    return result


@router.get("/analytics/churn")
def analytics_churn(
    broker: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Stock Churn / Holding Period Histogram.
    Returns binned holding_days frequencies from LIFO-settled closed positions.
    [{bin_label: str, count: int, min_days: int, max_days: int}]
    """
    bins = [
        ("0-7d",   0,    7),
        ("8-15d",  8,   15),
        ("16-30d", 16,  30),
        ("1m",     31,  60),
        ("2m",     61,  90),
        ("3m",     91, 120),
        (">4mnth", 121, 99999),
    ]

    dt_from = None
    dt_to = None
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
        except Exception:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
        except Exception:
            pass

    # 1. Fetch only the unique scripts that have SELL transactions in the date range [dt_from, dt_to] and broker
    sell_query = db.query(Transaction.script).filter(Transaction.buy_sell == "SELL")
    if broker and broker.lower() != "all":
        sell_query = sell_query.filter(Transaction.broker.ilike(broker))
    if dt_from:
        sell_query = sell_query.filter(Transaction.transaction_date >= dt_from)
    if dt_to:
        sell_query = sell_query.filter(Transaction.transaction_date <= dt_to)

    scripts = [r[0] for r in sell_query.distinct().all()]

    if not scripts:
        return {
            "bins": [{"bin_label": label, "count": 0, "min_days": lo, "max_days": hi if hi < 99999 else None} for label, lo, hi in bins],
            "total": 0
        }

    # 2. Fetch all transactions for these scripts up to dt_to, using with_entities to avoid ORM instantiation overhead
    query = db.query(Transaction).filter(Transaction.script.in_(scripts))
    if broker and broker.lower() != "all":
        query = query.filter(Transaction.broker.ilike(broker))
    if dt_to:
        query = query.filter(Transaction.transaction_date <= dt_to)
    
    txs = query.with_entities(
        Transaction.id,
        Transaction.script,
        Transaction.broker,
        Transaction.transaction_date,
        Transaction.buy_sell,
        Transaction.quantity,
        Transaction.price,
        Transaction.charges,
        Transaction.net_amount,
        Transaction.order_number,
        Transaction.exchange
    ).all()

    # 3. Compute LIFO settlement for these transactions
    settlement = compute_lifo_settlement(txs)

    # 4. Filter settlement rows to match the sell date range
    holding_days_list = []
    for row in settlement:
        if row.get("holding_days") is None:
            continue
        sd = row.get("sell_date")
        if sd:
            if isinstance(sd, str):
                sd = datetime.fromisoformat(sd)
            if dt_from and sd < dt_from:
                continue
            if dt_to and sd > dt_to:
                continue
        holding_days_list.append(int(row["holding_days"]))

    result = []
    for label, lo, hi in bins:
        count = sum(1 for d in holding_days_list if lo <= d <= hi)
        result.append({"bin_label": label, "count": count, "min_days": lo, "max_days": hi if hi < 99999 else None})

    return {"bins": result, "total": len(holding_days_list)}


@router.get("/analytics/monthly-return")
def analytics_monthly_return(
    broker: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Monthly Weighted Portfolio Return.
    Uses same formula as Details page weightedAverageReturn:
      rowReturn = ((sellPrice - buyPrice) / buyPrice) * (30 / holdingDays) * 100
      monthReturn = sum(rowReturn * buyAmount) / sum(buyAmount)
    Returns: [{month: 'YYYY-MM', weighted_return: float}]
    """
    query = db.query(Transaction)
    if broker and broker.lower() != "all":
        query = query.filter(Transaction.broker.ilike(broker))
    txs = query.all()

    settlement = compute_lifo_settlement(txs)

    month_map: dict = {}
    for row in settlement:
        if (
            row.get("pnl") is None
            or row.get("sell_date") is None
            or row.get("holding_days") is None
            or not row.get("price")
            or not row.get("qty")
        ):
            continue
        hd = float(row["holding_days"])
        if hd <= 0:
            continue
        buy_price = float(row["price"])
        sell_price = float(row.get("average_of_price") or 0.0)
        qty = float(row["qty"])
        if buy_price <= 0:
            continue
        row_return = ((sell_price - buy_price) / buy_price) * (30.0 / hd) * 100.0
        buy_amount = buy_price * qty

        sd = row["sell_date"]
        if isinstance(sd, str):
            sd = datetime.fromisoformat(sd)
        month_key = sd.strftime("%Y-%m")
        if month_key not in month_map:
            month_map[month_key] = {"weighted_sum": 0.0, "total_amount": 0.0, "total_profit": 0.0}
        month_map[month_key]["weighted_sum"] += row_return * buy_amount
        month_map[month_key]["total_amount"] += buy_amount
        month_map[month_key]["total_profit"] += (sell_price - buy_price) * qty

    result = sorted([
        {
            "month": k,
            "weighted_return": round(v["weighted_sum"] / v["total_amount"], 4) if v["total_amount"] > 0 else 0.0,
            "normal_return": round(v["total_profit"] / v["total_amount"] * 100.0, 4) if v["total_amount"] > 0 else 0.0
        }
        for k, v in month_map.items()
    ], key=lambda x: x["month"])

    return result


class SectorOverridePayload(BaseModel):
    stock_symbol: str
    is_excluded: bool
    custom_category: Optional[str] = None


@router.get("/analytics/sector-overrides")
def get_sector_overrides(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    overrides = db.query(SectorAllocationOverride).all()
    return [
        {
            "stock_symbol": o.stock_symbol,
            "is_excluded": o.is_excluded,
            "custom_category": o.custom_category
        }
        for o in overrides
    ]


@router.post("/analytics/sector-overrides")
def save_sector_override(
    payload: SectorOverridePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    override = db.query(SectorAllocationOverride).filter(
        SectorAllocationOverride.stock_symbol == payload.stock_symbol
    ).first()
    
    if override:
        override.is_excluded = payload.is_excluded
        override.custom_category = payload.custom_category
    else:
        override = SectorAllocationOverride(
            stock_symbol=payload.stock_symbol,
            is_excluded=payload.is_excluded,
            custom_category=payload.custom_category
        )
        db.add(override)
    
    db.commit()
    db.refresh(override)
    return {
        "stock_symbol": override.stock_symbol,
        "is_excluded": override.is_excluded,
        "custom_category": override.custom_category
    }


@router.get("/analytics/sector-allocation")
def analytics_sector_allocation(
    broker: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sector Allocation Treemap data.
    Groups active holdings by sector with total value and allocation %.
    Returns: [{sector: str, value: float, pct: float, stocks: [{script, value}]}]
    """
    query = db.query(Holding)
    if broker and broker.lower() != "all":
        query = query.filter(Holding.broker.ilike(broker))
    holdings = query.all()

    # Fetch all overrides
    overrides = db.query(SectorAllocationOverride).all()
    overrides_dict = {o.stock_symbol: o for o in overrides}

    sector_map: dict = {}
    total_value = 0.0

    # Ensure "Others" is always present in the map
    sector_map["Others"] = {"value": 0.0, "stocks": []}

    for h in holdings:
        cv = float(h.current_value or 0.0)
        if cv <= 0:
            continue

        base_symbol = h.script.replace("-EQ", "").replace("-BE", "").replace("-BL", "").upper()
        override = overrides_dict.get(h.script) or overrides_dict.get(base_symbol)

        std_sector = _get_sector(h.script)
        target_sector = std_sector
        is_excluded = False

        if override:
            is_excluded = override.is_excluded
            if override.custom_category:
                target_sector = override.custom_category

        # Add to total value if not excluded
        if not is_excluded:
            if target_sector not in sector_map:
                sector_map[target_sector] = {"value": 0.0, "stocks": []}
            sector_map[target_sector]["value"] += cv
            total_value += cv
            
            # If not standard "Others", add to target sector's stock list
            if std_sector != "Others":
                sector_map[target_sector]["stocks"].append({"script": h.script, "value": round(cv, 2)})

        # If standard sector is "Others", always add to "Others" stocks list for drill-down management
        if std_sector == "Others":
            sector_map["Others"]["stocks"].append({
                "script": h.script,
                "value": round(cv, 2),
                "is_excluded": is_excluded,
                "custom_category": override.custom_category if override else None
            })

    result = []
    for sector, data in sorted(sector_map.items(), key=lambda x: x[1]["value"], reverse=True):
        if data["value"] <= 0 and sector != "Others":
            continue
        pct = (data["value"] / total_value * 100) if total_value > 0 else 0.0
        result.append({
            "sector": sector,
            "value": round(data["value"], 2),
            "pct": round(pct, 2),
            "stocks": sorted(data["stocks"], key=lambda s: s.get("value", 0), reverse=True)
        })

    return {"sectors": result, "total_value": round(total_value, 2)}


@router.get("/analytics/tax-drag")
def analytics_tax_drag(
    broker: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    LIFO vs FIFO Tax Drag Delta.
    Applies Indian equity tax rates: 15% STCG (<365 days), 10% LTCG (>=365 days).
    Returns: [{month, lifo_tax, fifo_tax, delta}]
    """
    query = db.query(Transaction)
    if broker and broker.lower() != "all":
        query = query.filter(Transaction.broker.ilike(broker))
    txs = query.all()

    def _tax(pnl: float, holding_days: int) -> float:
        if pnl <= 0:
            return 0.0
        rate = 0.10 if holding_days >= 365 else 0.15
        return round(pnl * rate, 2)

    def _monthly_taxes(settlement):
        month_map: dict = {}
        for row in settlement:
            if row.get("pnl") is None or row.get("sell_date") is None:
                continue
            hd = row.get("holding_days") or 0
            sd = row["sell_date"]
            if isinstance(sd, str):
                sd = datetime.fromisoformat(sd)
            month_key = sd.strftime("%Y-%m")
            tax = _tax(float(row["pnl"]), int(hd))
            month_map[month_key] = month_map.get(month_key, 0.0) + tax
        return month_map

    lifo_settlement = compute_lifo_settlement(txs)
    fifo_settlement = compute_fifo_settlement(txs)

    lifo_taxes = _monthly_taxes(lifo_settlement)
    fifo_taxes = _monthly_taxes(fifo_settlement)

    all_months = sorted(set(list(lifo_taxes.keys()) + list(fifo_taxes.keys())))
    result = [
        {
            "month": m,
            "lifo_tax": round(lifo_taxes.get(m, 0.0), 2),
            "fifo_tax": round(fifo_taxes.get(m, 0.0), 2),
            "delta": round(fifo_taxes.get(m, 0.0) - lifo_taxes.get(m, 0.0), 2)
        }
        for m in all_months
    ]
    return result


@router.get("/analytics/volatility")
def analytics_volatility(
    broker: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Portfolio Volatility Metrics: Beta and Sharpe Ratio.
    Beta = cov(port, nifty) / var(nifty) approximated from monthly return series.
    Sharpe = (mean_monthly_return / std_monthly_return) * sqrt(12)
    Uses LIFO monthly-return series as portfolio return proxy.
    Returns: {beta: float, sharpe: float, monthly_returns: [{month, portfolio_return}],
              data_months: int, sufficient_data: bool}
    """
    # Get LIFO monthly returns for portfolio
    query = db.query(Transaction)
    if broker and broker.lower() != "all":
        query = query.filter(Transaction.broker.ilike(broker))
    txs = query.all()
    settlement = compute_lifo_settlement(txs)

    month_map: dict = {}
    for row in settlement:
        if (
            row.get("pnl") is None
            or row.get("sell_date") is None
            or not row.get("holding_days")
            or not row.get("price")
            or not row.get("qty")
        ):
            continue
        hd = float(row["holding_days"])
        if hd <= 0:
            continue
        buy_price = float(row["price"])
        sell_price = float(row.get("average_of_price") or 0.0)
        qty = float(row["qty"])
        if buy_price <= 0:
            continue
        row_return = ((sell_price - buy_price) / buy_price) * (30.0 / hd) * 100.0
        buy_amount = buy_price * qty

        sd = row["sell_date"]
        if isinstance(sd, str):
            sd = datetime.fromisoformat(sd)
        mk = sd.strftime("%Y-%m")
        if mk not in month_map:
            month_map[mk] = {"ws": 0.0, "ta": 0.0}
        month_map[mk]["ws"] += row_return * buy_amount
        month_map[mk]["ta"] += buy_amount

    monthly_series = sorted([
        {"month": k, "portfolio_return": round(v["ws"] / v["ta"], 4) if v["ta"] > 0 else 0.0}
        for k, v in month_map.items()
    ], key=lambda x: x["month"])

    port_returns = [r["portfolio_return"] for r in monthly_series]

    sufficient = len(port_returns) >= 3

    sharpe = 0.0
    beta = 1.0  # default neutral beta

    if sufficient:
        mean_r = sum(port_returns) / len(port_returns)
        if len(port_returns) >= 2:
            std_r = _statistics.stdev(port_returns)
            sharpe = round((mean_r / std_r) * _math.sqrt(12), 4) if std_r > 0 else 0.0

        # Approximate beta: use Nifty50 long-run monthly return ~1.0% as benchmark
        # beta = cov(port, bench) / var(bench)
        # Simplified: use correlation-based proxy since we don't pull live Nifty data
        # beta = mean(port_returns) / 1.0 (normalised to Nifty ~1%/month baseline)
        nifty_monthly_baseline = 1.0  # %
        try:
            port_variance = _statistics.variance(port_returns) if len(port_returns) >= 2 else 1.0
            # Rough beta: how much does this portfolio move vs a 1% Nifty baseline
            beta = round(mean_r / nifty_monthly_baseline, 4) if nifty_monthly_baseline != 0 else 1.0
            beta = max(-5.0, min(5.0, beta))  # clamp to reasonable range
        except Exception:
            beta = 1.0

    return {
        "beta": beta,
        "sharpe": sharpe,
        "monthly_returns": monthly_series,
        "data_months": len(port_returns),
        "sufficient_data": sufficient
    }


# --- Watchlist Feature Module Endpoints ---

class WatchlistActionToggleRequest(BaseModel):
    script: str
    section: str
    checked: bool

class WatchlistManualAddRequest(BaseModel):
    script: str

@router.post("/watchlist/action")
def toggle_watchlist_action(
    req: WatchlistActionToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(WatchlistAction).filter(
        WatchlistAction.script == req.script,
        WatchlistAction.section == req.section
    ).first()
    
    if req.checked:
        if existing:
            existing.checked_at = datetime.now()
        else:
            action = WatchlistAction(
                script=req.script,
                section=req.section,
                checked_at=datetime.now()
            )
            db.add(action)
    else:
        if existing:
            db.delete(existing)
    
    db.commit()
    return {"success": True, "checked": req.checked}

@router.post("/watchlist/manual")
def add_watchlist_manual(
    req: WatchlistManualAddRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(WatchlistManualScript).filter(
        WatchlistManualScript.script == req.script
    ).first()
    
    if not existing:
        manual = WatchlistManualScript(
            script=req.script,
            tag_type="MANUAL",
            created_at=datetime.now()
        )
        db.add(manual)
        db.commit()
        
        audit = AuditLog(
            category="WATCHLIST",
            description=f"Script {req.script} manually moved to Watchlist."
        )
        db.add(audit)
        db.commit()
        
    return {"success": True, "script": req.script}

@router.delete("/watchlist/manual/{script}")
def delete_watchlist_manual(
    script: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(WatchlistManualScript).filter(
        WatchlistManualScript.script == script
    ).first()
    
    if existing:
        db.delete(existing)
        db.commit()
        
        audit = AuditLog(
            category="WATCHLIST",
            description=f"Script {script} removed from manual Watchlist."
        )
        db.add(audit)
        db.commit()
        
        return {"success": True, "deleted": True}
    return {"success": True, "deleted": False}

@router.get("/watchlist/section1")
def get_watchlist_section1(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holdings = db.query(Holding).all()
    if not holdings:
        return []
        
    manual_scripts = {m.script for m in db.query(WatchlistManualScript).all()}
    
    scrips = [h.script for h in holdings]
    live_prices = {}
    try:
        live_prices = fetch_live_prices(scrips)
    except Exception as e:
        print(f"Error fetching live prices for section1 watchlist: {e}")
        
    results = []
    for h in holdings:
        script = h.script
        is_manual = script in manual_scripts
        
        ltp = live_prices[script]["price"] if (script in live_prices and live_prices[script]["price"] > 0) else h.ltp
        if ltp is None or ltp == 0:
            ltp = h.avg_price
            
        # Get all transactions for script
        txs = db.query(Transaction).filter(Transaction.script == script).all()
        
        open_buys = []
        if txs:
            settlement = compute_lifo_settlement(txs)
            open_buys = [r for r in settlement if r.get("comment") == "Unsettled" and r.get("type") == "Buy" and r.get("buy_date") is not None]
            
        if not open_buys:
            if not is_manual:
                # Skip if no open buys exist and it's not manually watchlisted
                continue
            # Fallback for manually added scripts with no open buys or no transactions
            buying_date = None
            buying_price = h.avg_price
            remaining_qty = h.quantity
            is_partial = False
        else:
            # Pick the most recent open buy transaction (maximum buy_date)
            most_recent_open_buy = max(open_buys, key=lambda x: x["buy_date"])
            buying_date = most_recent_open_buy["buy_date"]
            buying_price = most_recent_open_buy["price"]
            remaining_qty = most_recent_open_buy["qty"]
            
            # Find the original grouped lot quantity for this open buy to check if it's partially settled
            orig_lot_qty = sum(
                t.quantity for t in txs 
                if t.buy_sell.upper() == 'BUY' 
                and t.transaction_date.date() == buying_date.date() 
                and abs(t.price - buying_price) < 0.01
            )
                    
            is_partial = False
            if orig_lot_qty > 0 and remaining_qty < orig_lot_qty:
                is_partial = True

        gain = 0.0
        if buying_price and buying_price > 0:
            gain = ((ltp - buying_price) / buying_price) * 100.0
            
        if gain >= 4.0 or is_manual:
            value = remaining_qty * ltp
            potential_profit = remaining_qty * (ltp - buying_price) if buying_price else 0.0
            
            action_record = db.query(WatchlistAction).filter(
                WatchlistAction.script == script,
                WatchlistAction.section == 'section1'
            ).first()
            
            action_checked = False
            if action_record:
                time_diff = datetime.now() - action_record.checked_at.replace(tzinfo=None)
                if time_diff.total_seconds() < 24 * 60 * 60:
                    action_checked = True
                else:
                    db.delete(action_record)
                    db.commit()
                    
            results.append({
                "buying_date": buying_date,
                "script": script,
                "buying_price": buying_price,
                "ltp": ltp,
                "gain_pct": gain,
                "quantity": remaining_qty,
                "value": value,
                "potential_profit": potential_profit,
                "action_checked": action_checked,
                "tag_type": "MANUAL" if is_manual else "AUTOMATED",
                "is_partial": is_partial
            })
            
    return results

@router.get("/watchlist/section2")
def get_watchlist_section2(
    N: int = 5,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holdings = db.query(Holding).all()
    if not holdings:
        return {"top_movers": [], "bottom_movers": []}
        
    scrips = [h.script for h in holdings]
    live_prices = {}
    try:
        live_prices = fetch_live_prices(scrips)
    except Exception as e:
        print(f"Error fetching live prices for section2 watchlist: {e}")
        
    movers = []
    for h in holdings:
        script = h.script
        ltp = live_prices[script]["price"] if (script in live_prices and live_prices[script]["price"] > 0) else h.ltp
        change_pct = live_prices[script]["change_pct"] if (script in live_prices) else 0.0
        
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
            if tx_price and tx_price > 0 and ltp is not None:
                dip_pct = ((ltp - tx_price) / tx_price) * 100
            
            latest_tx_date = latest_tx.transaction_date
            if latest_tx_date:
                today = datetime.now().date()
                tx_date = latest_tx_date.date()
                latest_tx_days = (today - tx_date).days
            
            latest_tx_type = "Buy" if latest_tx.buy_sell.upper() == "BUY" else "Sell"

        cost = h.quantity * h.avg_price
        pnl_val = (ltp * h.quantity) - cost
        pnl_pct = (pnl_val / cost) * 100 if cost else 0.0
        
        action_record = db.query(WatchlistAction).filter(
            WatchlistAction.script == script,
            WatchlistAction.section == 'section2'
        ).first()
        
        action_checked = False
        if action_record:
            time_diff = datetime.now() - action_record.checked_at.replace(tzinfo=None)
            if time_diff.total_seconds() < 24 * 60 * 60:
                action_checked = True
            else:
                db.delete(action_record)
                db.commit()
                
        movers.append({
            "id": h.id,
            "broker": h.broker,
            "script": script,
            "quantity": h.quantity,
            "avg_price": h.avg_price,
            "ltp": ltp,
            "current_value": h.quantity * ltp,
            "pnl": pnl_val,
            "pnl_pct": pnl_pct,
            "change_in_ltp_pct": change_pct,
            "dip_pct": dip_pct,
            "latest_tx_date": latest_tx_date,
            "latest_tx_days": latest_tx_days,
            "latest_tx_type": latest_tx_type,
            "action_checked": action_checked,
            "last_updated": h.last_updated
        })
        
    pos_movers = [m for m in movers if m["change_in_ltp_pct"] > 0]
    pos_movers.sort(key=lambda x: x["change_in_ltp_pct"], reverse=True)
    
    neg_movers = [m for m in movers if m["change_in_ltp_pct"] < 0]
    neg_movers.sort(key=lambda x: x["change_in_ltp_pct"])
    
    top_n = pos_movers[:N]
    bottom_n = neg_movers[:N]
    
    return {
        "top_movers": top_n,
        "bottom_movers": bottom_n
    }

@router.get("/watchlist/section3")
def get_watchlist_section3(
    N: int = 5,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holdings = db.query(Holding).all()
    if not holdings:
        return {"top_movers": [], "bottom_movers": []}
        
    scrips = [h.script for h in holdings]
    live_prices = {}
    try:
        live_prices = fetch_live_prices(scrips)
    except Exception as e:
        print(f"Error fetching live prices for section3 watchlist: {e}")
        
    movers = []
    for h in holdings:
        script = h.script
        ltp = live_prices[script]["price"] if (script in live_prices and live_prices[script]["price"] > 0) else h.ltp
        change_pct = live_prices[script]["change_pct"] if (script in live_prices) else 0.0
        
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
            if tx_price and tx_price > 0 and ltp is not None:
                dip_pct = ((ltp - tx_price) / tx_price) * 100
            
            latest_tx_date = latest_tx.transaction_date
            if latest_tx_date:
                today = datetime.now().date()
                tx_date = latest_tx_date.date()
                latest_tx_days = (today - tx_date).days
            
            latest_tx_type = "Buy" if latest_tx.buy_sell.upper() == "BUY" else "Sell"

        if dip_pct is None:
            continue

        cost = h.quantity * h.avg_price
        pnl_val = (ltp * h.quantity) - cost
        pnl_pct = (pnl_val / cost) * 100 if cost else 0.0
        
        action_record = db.query(WatchlistAction).filter(
            WatchlistAction.script == script,
            WatchlistAction.section == 'section3'
        ).first()
        
        action_checked = False
        if action_record:
            time_diff = datetime.now() - action_record.checked_at.replace(tzinfo=None)
            if time_diff.total_seconds() < 24 * 60 * 60:
                action_checked = True
            else:
                db.delete(action_record)
                db.commit()
                
        movers.append({
            "id": h.id,
            "broker": h.broker,
            "script": script,
            "quantity": h.quantity,
            "avg_price": h.avg_price,
            "ltp": ltp,
            "current_value": h.quantity * ltp,
            "pnl": pnl_val,
            "pnl_pct": pnl_pct,
            "change_in_ltp_pct": change_pct,
            "dip_pct": dip_pct,
            "latest_tx_date": latest_tx_date,
            "latest_tx_days": latest_tx_days,
            "latest_tx_type": latest_tx_type,
            "action_checked": action_checked,
            "last_updated": h.last_updated
        })
        
    pos_movers = sorted(movers, key=lambda x: x["dip_pct"], reverse=True)
    neg_movers = sorted(movers, key=lambda x: x["dip_pct"])
    
    top_n = pos_movers[:N]
    bottom_n = neg_movers[:N]
    
    return {
        "top_movers": top_n,
        "bottom_movers": bottom_n
    }

