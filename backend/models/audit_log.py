from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from services.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=func.now())
    category = Column(String, index=True, nullable=False)  # 'LOGIN', 'IMPORT', 'SETTLEMENT', 'REFRESH', 'SYSTEM_ERROR'
    description = Column(String, nullable=False)
    details = Column(Text, nullable=True)  # Store JSON or tracebacks
