import hashlib
import secrets

try:
    from .database import SessionLocal, engine
    from .models import Base, Doctor
except ImportError:  # pragma: no cover - allows running as a top-level module
    from database import SessionLocal, engine  # type: ignore
    from models import Base, Doctor  # type: ignore


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"

def seed_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Check if doctors already exist
    if db.query(Doctor).count() > 0:
        print("Database already seeded with doctors.")
        db.close()
        return

    doctors = [
        {"name": "Dr. Sarah Jenkins", "email": "doctor1@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "General Practitioner", "is_authorized": True, "rating": 4.8, "location": "123 Main St, Clinic A", "distance": 1.2, "consultation_fee": 150000},
        {"name": "Dr. Marcus Cole", "email": "doctor2@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "Cardiologist", "is_authorized": True, "rating": 4.9, "location": "City Heart Center", "distance": 3.4, "consultation_fee": 300000},
        {"name": "Dr. Emily Chen", "email": "doctor3@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "Neurologist", "is_authorized": True, "rating": 4.7, "location": "Metro Brain Clinic", "distance": 2.1, "consultation_fee": 250000},
        {"name": "Dr. Rustam Aliev", "email": "doctor4@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "General Practitioner", "is_authorized": True, "rating": 4.6, "location": "Tashkent MedCenter", "distance": 1.0, "consultation_fee": 100000},
        {"name": "Dr. Maria Garcia", "email": "doctor5@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "Dermatologist", "is_authorized": True, "rating": 4.8, "location": "Skin Care Pro", "distance": 4.5, "consultation_fee": 200000},
        {"name": "Dr. Liam Patel", "email": "doctor6@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "Pediatrician", "is_authorized": True, "rating": 4.9, "location": "Kids Health Hub", "distance": 2.8, "consultation_fee": 150000},
        {"name": "Dr. Alisher Karim", "email": "doctor7@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "Cardiologist", "is_authorized": True, "rating": 5.0, "location": "Tashkent Central", "distance": 0.5, "consultation_fee": 350000},
        {"name": "Dr. Ivan Sokolov", "email": "doctor8@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "Orthopedist", "is_authorized": True, "rating": 4.5, "location": "Bone & Joint Health", "distance": 5.2, "consultation_fee": 200000},
        {"name": "Dr. Elena Popova", "email": "doctor9@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "Psychiatrist", "is_authorized": True, "rating": 4.8, "location": "Mind Wellness", "distance": 3.1, "consultation_fee": 250000},
        {"name": "Dr. Jonathan Swift", "email": "doctor10@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "General Practitioner", "is_authorized": True, "rating": 4.4, "location": "Family Care", "distance": 6.8, "consultation_fee": 120000},
        {"name": "Dr. Azizbek Yusupov", "email": "doctor11@mydoctor.app", "password_hash": hash_password("doctor123"), "specialty": "General Practitioner", "is_authorized": True, "rating": 4.7, "location": "Mirabad Health", "distance": 1.5, "consultation_fee": 100000},
    ]

    for d in doctors:
        doc = Doctor(**d)
        db.add(doc)

    db.commit()
    db.close()
    print("Database successfully seeded with doctor records.")

if __name__ == "__main__":
    seed_data()
