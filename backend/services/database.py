import os
import urllib.parse
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Load environment variables from .env file (if present)
load_dotenv()

# Path to the local SQLite fallback database file
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_DIR = os.path.join(BASE_DIR, "database")
os.makedirs(DB_DIR, exist_ok=True)

_SQLITE_FALLBACK = f"sqlite:///{os.path.join(DB_DIR, 'portfolio.db')}"

def normalize_db_url(url: str) -> str:
    """
    Normalizes and URL-encodes credentials (username/password) in the database URL
    to prevent special character parsing issues in SQLAlchemy/urllib.
    """
    if not url or '://' not in url:
        return url
    
    dialect, rest = url.split('://', 1)
    
    # Split path/database name
    if '/' in rest:
        conn_info, path = rest.split('/', 1)
        path = '/' + path
    else:
        conn_info, path = rest, ''
        
    # Extract credentials if present (split by last '@')
    if '@' in conn_info:
        creds, host = conn_info.rsplit('@', 1)
        if ':' in creds:
            user, password = creds.split(':', 1)
            user = urllib.parse.quote_plus(urllib.parse.unquote_plus(user))
            password = urllib.parse.quote_plus(urllib.parse.unquote_plus(password))
            creds = f"{user}:{password}"
        else:
            creds = urllib.parse.quote_plus(urllib.parse.unquote_plus(creds))
        conn_info = f"{creds}@{host}"
        
    return f"{dialect}://{conn_info}{path}"

raw_url = os.getenv("DATABASE_URL", _SQLITE_FALLBACK)
DATABASE_URL = normalize_db_url(raw_url)

from sqlalchemy import event

# SQLite requires check_same_thread=False; PostgreSQL does not support it.
if DATABASE_URL.startswith("postgresql"):
    engine = create_engine(DATABASE_URL)
else:
    engine = create_engine(
        DATABASE_URL, connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA cache_size=-64000")  # 64MB memory cache
            cursor.execute("PRAGMA temp_store=MEMORY")
            cursor.close()
        except Exception:
            pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
