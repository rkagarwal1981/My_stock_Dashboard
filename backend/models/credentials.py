from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from services.database import Base

class BrokerCredentials(Base):
    __tablename__ = "broker_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    broker_name = Column(String, index=True, nullable=False)  # 'mstock', 'zerodha', 'dhan'
    encrypted_username = Column(String, nullable=False)
    encrypted_password = Column(String, nullable=False)
    encrypted_pin = Column(String, nullable=True)  # Zerodha PIN, Dhan PIN, Mstock details
    encrypted_totp_key = Column(String, nullable=True)  # Key for generating 2FA TOTP automatically
    encrypted_api_key = Column(String, nullable=True)  # Added for API key integrations
    encrypted_api_secret = Column(String, nullable=True)  # Added for API secret integrations
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), default=func.now())
