from sqlalchemy import Column, String, Float, DateTime, Boolean
from sqlalchemy.sql import func
from services.database import Base

class StockMetadata(Base):
    __tablename__ = "stock_metadata"

    symbol = Column(String, primary_key=True, index=True)
    company_name = Column(String, nullable=True)
    sector = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    market_cap = Column(Float, nullable=True)
    market_cap_category = Column(String, nullable=True)  # "Large", "Mid", "Small"
    beta = Column(Float, nullable=True)
    is_excluded = Column(Boolean, default=False, nullable=False, server_default="0")
    sector_override = Column(String, nullable=True)
    last_updated = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
