from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from services.database import Base

class WatchlistAction(Base):
    __tablename__ = "watchlist_actions"

    id = Column(Integer, primary_key=True, index=True)
    script = Column(String, index=True, nullable=False)
    section = Column(String, index=True, nullable=False)  # 'section1' or 'section2'
    checked_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

class WatchlistManualScript(Base):
    __tablename__ = "watchlist_manual_scripts"

    id = Column(Integer, primary_key=True, index=True)
    script = Column(String, index=True, nullable=False)
    tag_type = Column(String, default="MANUAL", nullable=False)
    created_at = Column(DateTime(timezone=True), default=func.now())
