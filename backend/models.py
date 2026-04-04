from sqlalchemy import Column, Integer, String, Boolean, Float, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    username   = Column(String, unique=True, index=True, nullable=True)
    email      = Column(String, unique=True, index=True, nullable=True)
    telegram_id = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    is_premium = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Message(Base):
    __tablename__ = "messages"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    role       = Column(String, index=True)   # "user" or "ai"
    content    = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Doctor(Base):
    __tablename__ = "doctors"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, index=True)
    specialty  = Column(String, index=True)
    email      = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=True)
    is_authorized = Column(Boolean, default=False, nullable=False)
    rating     = Column(Float)
    location   = Column(String)
    distance   = Column(Float)   # in km
    consultation_fee = Column(Integer) # in UZS


class Consultation(Base):
    __tablename__ = "consultations"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doctor_id  = Column(Integer, ForeignKey("doctors.id"), nullable=False, index=True)
    status     = Column(String, default="open", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ConsultationMessage(Base):
    __tablename__ = "consultation_messages"

    id              = Column(Integer, primary_key=True, index=True)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=False, index=True)
    sender_type     = Column(String, nullable=False, index=True)  # "user" or "doctor"
    sender_id       = Column(Integer, nullable=False, index=True)
    content         = Column(Text, nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
