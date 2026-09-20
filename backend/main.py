import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from services.database import engine, Base, SessionLocal
from api.routes import router as api_router
from models.user import User
from models.executed_order import ExecutedOrder
from models.target import TargetSetting
from models.target_category import TargetCategory
from api.auth import get_password_hash
from services.importer import scan_and_import_directory, run_trade_pullers, run_holdings_pullers
from models.audit_log import AuditLog
from models.watchlist import WatchlistAction, WatchlistManualScript
from models.stock_research import StockNote, StockAttachment
from models.stock_metadata import StockMetadata

# Create the DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Unified Stock Trading Dashboard API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev, allow all. In production, lock down to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Seed initial admin user if not present
def seed_admin_user():
    db = SessionLocal()
    try:
        admin_exists = db.query(User).filter_by(username="admin").first()
        if not admin_exists:
            hashed_pw = get_password_hash("admin")
            admin = User(username="admin", hashed_password=hashed_pw)
            db.add(admin)
            db.commit()
            print("Seeded default admin user (username: admin, password: admin)")
            
            # Log seed activity
            audit = AuditLog(
                category="LOGIN",
                description="Database initialized. Default admin user created."
            )
            db.add(audit)
            db.commit()
    except Exception as e:
        print(f"Error seeding user: {e}")
    finally:
        db.close()

seed_admin_user()

# Seed default target categories
def seed_default_categories():
    db = SessionLocal()
    try:
        defaults = ['Technical', 'Fundamental', 'Target Change', 'News', 'General']
        for name in defaults:
            exists = db.query(TargetCategory).filter_by(name=name).first()
            if not exists:
                db.add(TargetCategory(name=name))
        db.commit()
    except Exception as e:
        print(f"Error seeding categories: {e}")
    finally:
        db.close()

seed_default_categories()

import threading

def run_startup_background_tasks():
    db = SessionLocal()
    try:
        print("Running startup trade & holdings sync...")
        try:
            run_trade_pullers()
            run_holdings_pullers()
        except Exception as ep:
            print("Error during startup pullers execution:", ep)
            
        print("Running startup directory transaction scan & reconcile...")
        results = scan_and_import_directory(db)
        print("Startup scan completed:", results)
    except Exception as e:
        print("Error during startup scan:", e)
    finally:
        db.close()

# Auto-scan directory on startup
@app.on_event("startup")
def startup_scan():
    try:
        # Start executed orders background tracker thread
        from services.order_book_tracker import start_order_tracker_thread
        start_order_tracker_thread()
    except Exception as es:
        print("Failed to start executed orders tracker thread:", es)

    # Run trade sync and directory scan in background so backend starts up immediately
    threading.Thread(target=run_startup_background_tasks, daemon=True).start()


# Mount API routes
app.include_router(api_router, prefix="/api")

# Mount research uploads directory as static files
uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "stock_research")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/static/research", StaticFiles(directory=uploads_dir), name="research")

@app.get("/")
def read_root():
    return {"message": "Unified Stock Trading Dashboard API is running."}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
