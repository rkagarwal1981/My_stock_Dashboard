from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from services.database import Base

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_date = Column(DateTime, index=True, nullable=False)
    broker = Column(String, index=True, nullable=False)  # 'MStock', 'Zerodha', 'Dhan'
    script = Column(String, index=True, nullable=False)  # e.g., 'UNOMINDA-EQ'
    buy_sell = Column(String, nullable=False)  # 'BUY' or 'SELL'
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    charges = Column(Float, default=0.0)
    net_amount = Column(Float, nullable=False)
    exchange = Column(String, nullable=True)  # 'NSE', 'BSE', 'MCX'
    order_number = Column(String, nullable=True)
    trade_id = Column(String, nullable=True)
    import_id = Column(Integer, ForeignKey("import_history.id"), nullable=True)
