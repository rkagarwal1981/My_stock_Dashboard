from sqlalchemy import Column, Integer, String, Boolean
from services.database import Base

class SectorAllocationOverride(Base):
    __tablename__ = "sector_allocation_overrides"

    id = Column(Integer, primary_key=True, index=True)
    stock_symbol = Column(String, unique=True, index=True, nullable=False)
    is_excluded = Column(Boolean, default=False, nullable=False)
    custom_category = Column(String, nullable=True)
