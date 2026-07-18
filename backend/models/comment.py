from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from services.database import Base

class StockComment(Base):
    __tablename__ = "stock_comments"

    id = Column(Integer, primary_key=True, index=True)
    script = Column(String, index=True, nullable=False)
    comment_date = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    category = Column(String, nullable=False)
    comment_text = Column(String, nullable=False)
    target_price = Column(Float, nullable=True)
