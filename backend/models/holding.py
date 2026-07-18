from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from services.database import Base

class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    broker = Column(String, index=True, nullable=False)  # 'MStock', 'Zerodha', 'Dhan'
    script = Column(String, index=True, nullable=False)
    quantity = Column(Float, nullable=False)
    avg_price = Column(Float, nullable=False)
    ltp = Column(Float, default=0.0)
    current_value = Column(Float, default=0.0)
    pnl = Column(Float, default=0.0)
    last_updated = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
