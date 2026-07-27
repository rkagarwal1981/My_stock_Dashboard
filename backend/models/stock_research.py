from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from services.database import Base


class StockNote(Base):
    """Stores the persistent research notes for a given stock (one row per scrip)."""
    __tablename__ = "stock_notes"

    id = Column(Integer, primary_key=True, index=True)
    script = Column(String, index=True, nullable=False, unique=True)
    note_text = Column(Text, nullable=True, default="")
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())


class StockAttachment(Base):
    """Stores metadata for PDF attachments (up to 3) associated with a stock."""
    __tablename__ = "stock_attachments"

    id = Column(Integer, primary_key=True, index=True)
    script = Column(String, index=True, nullable=False)
    filename = Column(String, nullable=False)          # original filename shown to user
    stored_filename = Column(String, nullable=False)   # unique filename on disk
    uploaded_at = Column(DateTime(timezone=True), default=func.now())
