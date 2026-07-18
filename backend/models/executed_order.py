from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from services.database import Base

class ExecutedOrder(Base):
    __tablename__ = "executed_orders"

    id = Column(Integer, primary_key=True, index=True)
    broker = Column(String, index=True, nullable=False)  # 'Zerodha' or 'MStock'
    script = Column(String, index=True, nullable=False)
    buy_sell = Column(String, nullable=False)  # 'BUY' or 'SELL'
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)  # Traded price
    ltp = Column(Float, default=0.0)
    amount = Column(Float, nullable=False)
    pnl = Column(Float, default=0.0)
    pnl_pct = Column(Float, default=0.0)
    order_id = Column(String, unique=True, index=True, nullable=False)
    execution_time = Column(DateTime(timezone=True), nullable=False)
    last_updated = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
