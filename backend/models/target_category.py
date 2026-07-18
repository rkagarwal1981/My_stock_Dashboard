from sqlalchemy import Column, Integer, String
from services.database import Base


class TargetCategory(Base):
    __tablename__ = "target_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
