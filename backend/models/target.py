from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from services.database import Base


class TargetSetting(Base):
    __tablename__ = "target_settings"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    script = Column(String, index=True, nullable=False)  # e.g. 'CONCOR-EQ'
    type = Column(String, nullable=False)  # 'Buy' or 'Sell'
    target_price = Column(Float, nullable=False)
    category = Column(String, nullable=True)  # 'Technical', 'Fundamental', etc.
    comment = Column(String, nullable=True)
    triggered = Column(Integer, default=0)  # 0=No, 1=Yes (SQLite boolean)
    bookmark = Column(String, nullable=True)  # 'red','orange','yellow','green','blue' or null
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
