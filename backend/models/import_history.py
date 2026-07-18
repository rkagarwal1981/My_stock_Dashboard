from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from services.database import Base

class ImportHistory(Base):
    __tablename__ = "import_history"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, unique=True, nullable=False)
    broker = Column(String, nullable=False)  # 'MStock', 'Zerodha', 'Dhan'
    import_date = Column(DateTime(timezone=True), default=func.now())
    row_count = Column(Integer, default=0)
    status = Column(String, default="SUCCESS")  # 'SUCCESS', 'ERROR'
