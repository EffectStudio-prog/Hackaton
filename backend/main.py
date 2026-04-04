import json
import http.client
import os
import re
import hashlib
import hmac
import secrets
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

try:
    from google import genai
except ImportError:  # pragma: no cover - optional dependency
    genai = None

try:
    from anthropic import Anthropic
except ImportError:  # pragma: no cover - optional dependency
    Anthropic = None

try:
    from . import database, models
    from .disease_prediction import SYMPTOM_LABELS, localize_label, service as disease_prediction_service
except ImportError:  # pragma: no cover - allows running as `uvicorn main:app`
    import database  # type: ignore
    import models  # type: ignore
    from disease_prediction import SYMPTOM_LABELS, localize_label, service as disease_prediction_service  # type: ignore


app = FastAPI(title="MyDoctor Triage API", version="1.1.0")
models.Base.metadata.create_all(bind=database.engine)


def is_truthy(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def ensure_schema() -> None:
    if not database.IS_SQLITE:
        return

    with database.engine.begin() as connection:
        user_columns = {
            row[1] for row in connection.exec_driver_sql("PRAGMA table_info(users)").fetchall()
        }
        doctor_columns = {
            row[1] for row in connection.exec_driver_sql("PRAGMA table_info(doctors)").fetchall()
        }
        if "username" not in user_columns:
            connection.exec_driver_sql("ALTER TABLE users ADD COLUMN username VARCHAR")
        if "password_hash" not in user_columns:
            connection.exec_driver_sql("ALTER TABLE users ADD COLUMN password_hash VARCHAR")
        connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)")
        if "email" not in doctor_columns:
            connection.exec_driver_sql("ALTER TABLE doctors ADD COLUMN email VARCHAR")
        if "password_hash" not in doctor_columns:
            connection.exec_driver_sql("ALTER TABLE doctors ADD COLUMN password_hash VARCHAR")
        if "is_authorized" not in doctor_columns:
            connection.exec_driver_sql("ALTER TABLE doctors ADD COLUMN is_authorized BOOLEAN NOT NULL DEFAULT 1")


def clear_legacy_ai_messages() -> None:
    if not is_truthy(os.getenv("CLEAR_LEGACY_AI_MESSAGES")):
        return

    with database.engine.begin() as connection:
        connection.exec_driver_sql("DELETE FROM messages WHERE role = 'ai'")


def maybe_seed_default_doctors() -> None:
    if os.getenv("AUTO_SEED_DOCTORS", "true").strip().lower() in {"0", "false", "no", "off"}:
        return

    with database.SessionLocal() as db:
        has_doctors = db.query(models.Doctor.id).first() is not None

    if has_doctors:
        return

    try:
        from .seed import seed_data
    except ImportError:  # pragma: no cover - allows running as `uvicorn main:app`
        from seed import seed_data  # type: ignore

    seed_data()


ensure_schema()
maybe_seed_default_doctors()
clear_legacy_ai_messages()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    user_id: Optional[int] = None
    language: str = "en"
    is_premium: bool = False


class TranslateRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)
    target_language: str = "en"


class TranslateResponse(BaseModel):
    translations: List[str] = Field(default_factory=list)


class AuthRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str


class PremiumUpdateRequest(BaseModel):
    user_id: int
    is_premium: bool


class DoctorAuthRequest(BaseModel):
    name: Optional[str] = None
    email: str
    password: str
    specialty: Optional[str] = None
    location: Optional[str] = None
    consultation_fee: Optional[int] = None


class DoctorAuthorizationRequest(BaseModel):
    doctor_id: int
    is_authorized: bool


class UserSchema(BaseModel):
    id: int
    username: str
    email: str
    is_premium: bool


class AuthResponse(BaseModel):
    user: UserSchema


class DoctorUserSchema(BaseModel):
    id: int
    name: str
    email: str
    specialty: str
    is_authorized: bool


class DoctorAuthResponse(BaseModel):
    doctor: DoctorUserSchema


class DoctorSchema(BaseModel):
    id: int
    name: str
    specialty: str
    is_authorized: bool = False
    rating: float
    location: str
    distance: float
    consultation_fee: int


class FacilitySchema(BaseModel):
    id: int
    name: str
    facility_type: str
    specialty_focus: str
    rating: float
    location: str
    distance: float
    reservation_fee: int
    description: str


class ChatResponse(BaseModel):
    reply: str
    summary: str = ""
    likely_condition: str = ""
    predictions: List[DiseasePredictionSchema] = Field(default_factory=list)
    prevention_tips: List[str] = Field(default_factory=list)
    emergency_warning: str = ""
    specialty: Optional[str] = None
    urgency_level: str = "low"
    next_steps: List[str] = Field(default_factory=list)
    follow_up_questions: List[str] = Field(default_factory=list)
    doctors: List[DoctorSchema] = Field(default_factory=list)
    clinics: List[FacilitySchema] = Field(default_factory=list)
    hospitals: List[FacilitySchema] = Field(default_factory=list)
    urgent: bool = False


class ConsultationCreateRequest(BaseModel):
    user_id: int
    doctor_id: int


class ConsultationMessageRequest(BaseModel):
    actor_type: str
    actor_id: int
    content: str


class ConsultationMessageSchema(BaseModel):
    id: int
    sender_type: str
    sender_id: int
    content: str
    created_at: str


class ConsultationSchema(BaseModel):
    id: int
    user_id: int
    doctor_id: int
    doctor_name: str
    doctor_specialty: str
    patient_email: str
    status: str
    created_at: str
    updated_at: str
    messages: List[ConsultationMessageSchema] = Field(default_factory=list)


class PredictRequest(BaseModel):
    symptoms: List[str] = Field(default_factory=list)
    text: str = ""
    language: str = "en"


class DiseasePredictionSchema(BaseModel):
    disease_key: str
    disease: str
    probability: float
    confidence: str
    reasons: List[str] = Field(default_factory=list)


class PredictResponse(BaseModel):
    input_symptoms: List[str] = Field(default_factory=list)
    input_symptom_keys: List[str] = Field(default_factory=list)
    extracted_symptoms: List[str] = Field(default_factory=list)
    predictions: List[DiseasePredictionSchema] = Field(default_factory=list)
    model: dict = Field(default_factory=dict)
    disclaimer: str = ""


LANG_MAP = {
    "en": "English",
    "ru": "Russian",
    "uz": "Uzbek",
}

SPECIAL_ADMIN_USERNAME = "mydoctor-admin"
RESERVED_USERNAMES = {"admin", SPECIAL_ADMIN_USERNAME}
USERNAME_PATTERN = re.compile(r"^[a-z0-9._-]{3,32}$")

SUPPORTED_SPECIALTIES = {
    "general practitioner",
    "cardiologist",
    "neurologist",
    "dermatologist",
    "pediatrician",
    "psychiatrist",
    "orthopedist",
}

UNSUPPORTED_SPECIALTY_HINTS = {
    "dentist": [
        "toothache", "tooth pain", "tooth", "teeth", "gum pain", "gum swelling",
        "tish", "tishim", "tish og'rig",
        "зуб", "зубная боль", "болит зуб", "десна", "болит десна",
    ],
    "ophthalmologist": [
        "eye pain", "eye infection", "blurry vision", "vision problem",
        "ko'z", "kozim", "ko'rishim", "ko'rmayapman",
        "глаз", "зрение", "не вижу", "боль в глазу",
    ],
    "ent": [
        "ear pain", "ear infection", "hearing loss", "nose bleed", "sinus",
        "quloq", "burun", "tomoq",
        "ухо", "нос", "горло",
    ],
}

SPECIALTY_SYNONYMS = {
    "gp": "general practitioner",
    "family doctor": "general practitioner",
    "family physician": "general practitioner",
    "internal medicine": "general practitioner",
    "therapist": "general practitioner",
    "primary care": "general practitioner",
    "cardiology": "cardiologist",
    "heart specialist": "cardiologist",
    "neurology": "neurologist",
    "brain specialist": "neurologist",
    "skin doctor": "dermatologist",
    "skin specialist": "dermatologist",
    "dermatology": "dermatologist",
    "child doctor": "pediatrician",
    "children doctor": "pediatrician",
    "paediatrician": "pediatrician",
    "mental health": "psychiatrist",
    "psychiatry": "psychiatrist",
    "bone doctor": "orthopedist",
    "orthopedic": "orthopedist",
    "orthopaedic": "orthopedist",
    "orthopedics": "orthopedist",
}

FACILITY_CATALOG = {
    "clinics": [
        {
            "id": 1,
            "name": "Mirabad Family Clinic",
            "specialties": ["general practitioner", "pediatrician"],
            "rating": 4.7,
            "location": "Mirabad district",
            "distance": 1.1,
            "reservation_fee": 120000,
        },
        {
            "id": 2,
            "name": "City Heart Clinic",
            "specialties": ["cardiologist", "general practitioner"],
            "rating": 4.9,
            "location": "Central avenue",
            "distance": 2.8,
            "reservation_fee": 220000,
        },
        {
            "id": 3,
            "name": "Neuro Care Clinic",
            "specialties": ["neurologist", "psychiatrist"],
            "rating": 4.8,
            "location": "Yunusabad",
            "distance": 3.6,
            "reservation_fee": 210000,
        },
        {
            "id": 4,
            "name": "Skin Health Clinic",
            "specialties": ["dermatologist", "general practitioner"],
            "rating": 4.6,
            "location": "Chilanzar",
            "distance": 4.2,
            "reservation_fee": 160000,
        },
    ],
    "hospitals": [
        {
            "id": 101,
            "name": "Tashkent Emergency Hospital",
            "specialties": ["general practitioner", "cardiologist", "orthopedist"],
            "rating": 4.9,
            "location": "Downtown medical zone",
            "distance": 2.4,
            "reservation_fee": 0,
        },
        {
            "id": 102,
            "name": "Central Multispecialty Hospital",
            "specialties": ["general practitioner", "neurologist", "dermatologist", "pediatrician"],
            "rating": 4.8,
            "location": "Shaykhantakhur",
            "distance": 3.1,
            "reservation_fee": 90000,
        },
        {
            "id": 103,
            "name": "Children and Family Hospital",
            "specialties": ["pediatrician", "general practitioner"],
            "rating": 4.7,
            "location": "Sergeli",
            "distance": 5.3,
            "reservation_fee": 80000,
        },
        {
            "id": 104,
            "name": "Trauma and Recovery Hospital",
            "specialties": ["orthopedist", "general practitioner"],
            "rating": 4.7,
            "location": "Yakkasaray",
            "distance": 4.7,
            "reservation_fee": 100000,
        },
    ],
}

SPECIALTY_HINTS = {
    "cardiologist": [
        "chest pain", "pressure in chest", "palpitations", "rapid heartbeat",
        "heart", "ko'krak", "болит сердце", "боль в груди", "сердце", "yurak",
    ],
    "neurologist": [
        "headache", "migraine", "dizziness", "numbness", "seizure",
        "vision loss", "confusion", "stroke", "голов", "головная боль", "мигрень",
        "онем", "bosh", "boshim", "kalla", "kallam",
    ],
    "dermatologist": [
        "rash", "itching", "itchy", "hives", "skin", "eczema",
        "acne", "toshma", "сыпь", "кожа",
    ],
    "pediatrician": [
        "child", "baby", "infant", "toddler", "daughter", "son",
        "ребен", "ребён", "малыш", "farzand", "bola",
    ],
    "psychiatrist": [
        "panic", "anxiety", "depressed", "depression", "suicidal",
        "self harm", "hallucination", "can't sleep", "не хочу жить", "vahima",
    ],
    "orthopedist": [
        "back pain", "joint", "ankle", "fracture", "sprain",
        "knee", "bone", "neck pain", "спина", "сустав", "oyoq", "bel", "belim",
    ],
}

EMERGENCY_KEYWORDS = [
    "chest pain", "heart attack", "can't breathe", "cannot breathe",
    "shortness of breath", "difficulty breathing", "bleeding profusely",
    "stroke", "unconscious", "not breathing", "suicide", "overdose",
    "severe allergic reaction", "anaphylaxis", "face drooping", "slurred speech",
    "seizure", "passed out", "severe bleeding", "collapsed", "unresponsive",
    "turning blue", "blue lips", "not waking up", "stopped breathing",
    "боль в груди", "инфаркт", "трудно дышать", "не могу дышать",
    "кровотечение", "инсульт", "потерял сознание", "судороги",
    "ko'krak og'rig'i", "nafas ololmayapman", "qon ketyapti",
    "hushini yo'qotdi", "talvasa", "insult",
]

EMERGENCY_CONTEXT_HINTS = [
    "help now", "urgent help", "emergency", "dying", "will die", "save him", "save her",
    "save my", "my dad", "my father", "my mom", "my mother", "my husband", "my wife",
    "my child", "my baby", "someone collapsed", "please hurry",
    "tez", "shoshiling", "yordam bering", "o'lyapti", "saqlab qoling",
]

EMERGENCY_PATTERNS = {
    "breathing": [
        "can't breathe", "cannot breathe", "not breathing", "difficulty breathing",
        "shortness of breath", "gasping", "turning blue", "choking", "blue lips",
        "stopped breathing", "cannot speak full sentences",
        "не могу дышать", "трудно дышать", "не дышит", "задыхаюсь",
        "nafas ololmayapman", "nafas qisilishi", "bo'g'ilib qoldi",
    ],
    "cardiac": [
        "chest pain", "heart attack", "pressure in chest", "crushing chest pain",
        "pain spreading to arm", "jaw pain with chest pain", "cold sweat with chest pain",
        "боль в груди", "инфаркт", "давит в груди",
        "ko'krak og'rig'i", "yurak xuruji",
    ],
    "stroke": [
        "stroke", "face drooping", "slurred speech", "one sided weakness",
        "can't move one arm", "sudden confusion", "sudden vision loss",
        "инсульт", "перекосило лицо", "невнятная речь", "онемела рука",
        "insult", "yuz qiyshaydi", "nutqi buzildi", "bir tomoni ishlamayapti",
    ],
    "bleeding": [
        "severe bleeding", "bleeding profusely", "won't stop bleeding",
        "vomiting blood", "coughing blood", "blood in large amounts",
        "кровотечение", "сильное кровотечение", "рвота кровью",
        "qon ketyapti", "qon to'xtamayapti", "qon qusdi",
    ],
    "neurologic": [
        "seizure", "passed out", "unconscious", "fainted and won't wake",
        "sudden collapse", "collapsed", "unresponsive", "not waking up",
        "судороги", "потерял сознание", "без сознания",
        "talvasa", "hushini yo'qotdi", "hushsiz",
    ],
    "allergy": [
        "anaphylaxis", "severe allergic reaction", "throat swelling", "tongue swelling",
        "lip swelling with breathing trouble",
        "анафилаксия", "отек горла", "отек языка",
        "allergiya xuruji", "tomoq shishdi", "til shishdi",
    ],
    "overdose": [
        "overdose", "took too many pills", "poisoning", "poisoned",
        "drug overdose", "suicide", "self harm", "want to kill myself",
        "передозировка", "отравление", "хочу умереть", "суицид",
        "zaharlanish", "dozani oshirib yubordi", "o'zimni o'ldirmoqchiman",
    ],
    "trauma": [
        "hit my head and fainted", "major accident", "car crash", "serious burn",
        "broken bone sticking out", "deep wound", "fell from height",
        "авария", "сильный ожог", "открытый перелом", "упал с высоты",
        "avariya", "kuchli kuyish", "ochiq siniq", "balanddan yiqildi",
    ],
    "pregnancy": [
        "pregnant and bleeding", "pregnancy bleeding", "severe abdominal pain pregnant",
        "ectopic", "heavy bleeding during pregnancy",
        "беременна и кровотечение", "кровотечение при беременности",
        "homilador va qon ketyapti", "homiladorlikda qon ketishi",
    ],
    "infant": [
        "baby not responding", "infant not feeding", "baby can't breathe",
        "newborn fever", "seizure in baby",
        "ребенок не реагирует", "младенец не ест", "температура у новорожденного",
        "chaqaloq javob bermayapti", "chaqaloq ovqat yemayapti", "yangi tug'ilgan isitma",
    ],
}

MEDIUM_URGENCY_HINTS = [
    "high fever", "vomiting", "severe headache", "dehydration", "infection",
    "persistent pain", "worsening", "can't sleep from pain", "can't eat",
    "cannot eat", "can't keep fluids", "rash with fever", "migraine",
    "высокая температура", "рвота", "сильная боль", "сильная головная боль",
    "ухудшается", "тошнота",
    "isitma", "qusish", "qattiq og'riq", "yomonlashyapti", "qattiq", "kuchli",
    "qus", "kuchayayapti", "zo'rayapti", "chidab bo'lmaydi",
]

GENERAL_SYMPTOM_HINTS = [
    "pain", "ache", "fever", "temperature", "cough", "cold", "flu", "rash", "itch",
    "dizzy", "dizziness", "nausea", "vomit", "vomiting", "diarrhea", "breath",
    "breathing", "shortness", "headache", "migraine", "weak", "weakness",
    "swelling", "burning", "urination", "urine", "chest", "stomach", "abdomen",
    "back", "joint", "throat", "runny nose", "sore throat", "fatigue", "tired",
    "og'ri", "isitma", "yo'tal", "shamoll", "tomoq", "ko'ngil ayn", "qus",
    "ich ket", "nafas", "bosh", "karaxt", "toshma", "qich", "qorin", "oshqozon",
    "bel", "bo'g'im", "siydik", "holsiz", "charch", "yurak", "ko'krak",
    "боль", "голов", "головная боль", "тошнота", "рвота", "температура", "кашель",
    "живот", "сыпь", "слабость", "головокружение", "дых", "груд",
]

VAGUE_INPUT_HINTS = [
    "help", "need help", "what should i do", "i am sick", "i feel sick", "not well",
    "feel bad", "feeling bad", "maslahat", "yordam", "nima qilay", "kasalman",
    "o'zimni yomon his qilyapman", "yaxshi emasman", "ahvolim yomon", "simptom yo'q",
]

SYMPTOM_BUCKET_HINTS = {
    "cardiac": [
        "chest pain", "pressure in chest", "palpitations", "rapid heartbeat", "heart",
        "ko'krak", "yurak", "боль в груди", "сердце",
    ],
    "headache": [
        "headache", "migraine", "dizziness", "numbness", "vision loss", "confusion",
        "bosh", "kalla", "karaxt", "ko'rish", "голов", "головная боль", "мигрень",
        "головокружение", "онем",
    ],
    "skin": [
        "rash", "itch", "itching", "itchy", "hives", "skin", "eczema", "acne",
        "toshma", "qich", "teri", "сыпь", "кожа", "зуд",
    ],
    "child": [
        "child", "baby", "infant", "toddler", "daughter", "son", "farzand",
        "bola", "chaqaloq", "ребен", "ребён", "малыш",
    ],
    "mental_health": [
        "panic", "anxiety", "depressed", "depression", "self harm", "can't sleep",
        "stress", "vahima", "xavotir", "tushkun", "uyqu yo'q", "паника", "тревога",
        "депресс", "не хочу жить",
    ],
    "back": [
        "back pain", "joint", "ankle", "fracture", "sprain", "knee", "bone", "neck pain",
        "bel", "belim", "bo'g'im", "oyoq", "suyak", "jarohat", "спина", "сустав", "перелом",
    ],
    "stomach": [
        "stomach", "abdomen", "nausea", "vomit", "vomiting", "diarrhea", "constipation",
        "abdominal", "qorin", "oshqozon", "ko'ngil ayn", "qus", "ich ket", "ich qot",
        "живот", "тошнота", "рвота", "диарея",
    ],
    "urinary": [
        "urine", "urination", "burning when i pee", "pain when i pee", "frequent urination",
        "bladder", "siydik", "tez-tez siyish", "achishish", "моч", "частое мочеиспускание",
    ],
    "cold_flu": [
        "cold", "flu", "cough", "runny nose", "sore throat", "congestion", "sneezing",
        "shamoll", "gripp", "yo'tal", "burun oq", "tomoq", "tumov", "кашель", "простуд",
        "горло", "насморк",
    ],
    "fever": [
        "fever", "temperature", "high temp", "hot body", "isitma", "harorat",
        "температура", "жар", "лихорадка",
    ],
}

BUCKET_TO_SPECIALTY = {
    "cardiac": "cardiologist",
    "headache": "neurologist",
    "skin": "dermatologist",
    "child": "pediatrician",
    "mental_health": "psychiatrist",
    "back": "orthopedist",
}

TRIAGE_MODE = "grounded_rules"
RAPIDAPI_HOST = os.getenv(
    "RAPIDAPI_DOCTOR_HOST",
    "ai-doctor-api-ai-medical-chatbot-healthcare-ai-assistant.p.rapidapi.com",
)
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def contains_any(lowered: str, hints: List[str]) -> bool:
    return any(hint in lowered for hint in hints)


def has_specific_symptom_details(lowered: str) -> bool:
    if contains_any(lowered, GENERAL_SYMPTOM_HINTS):
        return True
    if contains_any(lowered, EMERGENCY_KEYWORDS):
        return True
    if contains_any(lowered, MEDIUM_URGENCY_HINTS):
        return True
    if any(contains_any(lowered, hints) for hints in SPECIALTY_HINTS.values()):
        return True
    return any(contains_any(lowered, hints) for hints in SYMPTOM_BUCKET_HINTS.values())


def needs_more_symptom_details(lowered: str) -> bool:
    if not lowered:
        return True
    if emergency_reason(lowered) or contains_any(lowered, EMERGENCY_CONTEXT_HINTS):
        return False
    if has_specific_symptom_details(lowered):
        return False

    token_count = len(re.findall(r"\w+", lowered, flags=re.UNICODE))
    if contains_any(lowered, VAGUE_INPUT_HINTS):
        return True
    return token_count < 4


def extract_severity_score(lowered: str) -> Optional[int]:
    match = re.search(r"\b(10|[1-9])\s*/\s*10\b", lowered)
    if match:
        return int(match.group(1))
    return None


def detect_symptom_bucket(lowered: str, specialty: str) -> str:
    ordered_buckets = [
        "cardiac",
        "mental_health",
        "child",
        "headache",
        "skin",
        "stomach",
        "urinary",
        "back",
        "cold_flu",
        "fever",
    ]
    for bucket in ordered_buckets:
        if contains_any(lowered, SYMPTOM_BUCKET_HINTS[bucket]):
            return bucket

    for bucket, mapped_specialty in BUCKET_TO_SPECIALTY.items():
        if specialty == mapped_specialty:
            return bucket

    return "general"


def detail_request_payload(language: str) -> dict:
    texts = {
        "en": {
            "summary": "There is not enough symptom detail yet to give a targeted triage answer.",
            "advice": "Please write the main symptom first, such as headache, fever, cough, stomach pain, rash, or chest pain.",
            "steps": [
                "Mention where the problem is in the body.",
                "Add how long it has been going on and whether it feels mild, moderate, or severe.",
            ],
            "questions": [
                "What is the main symptom?",
                "How long has it been going on?",
                "Is it mild, moderate, or severe right now?",
            ],
        },
        "ru": {
            "summary": "Пока недостаточно данных о симптомах, чтобы дать точный триаж-ответ.",
            "advice": "Сначала напишите основной симптом, например головная боль, температура, кашель, боль в животе, сыпь или боль в груди.",
            "steps": [
                "Укажите, где именно беспокоит.",
                "Добавьте, как давно это длится и насколько сильно ощущается.",
            ],
            "questions": [
                "Какой основной симптом?",
                "Как давно это продолжается?",
                "Сейчас это легкое, среднее или сильное состояние?",
            ],
        },
        "uz": {
            "summary": "Aniq triage javobi berish uchun hozircha simptom tafsiloti yetarli emas.",
            "advice": "Avval asosiy belgini yozing: masalan bosh og'rig'i, isitma, yo'tal, qorin og'rig'i, toshma yoki ko'krak og'rig'i.",
            "steps": [
                "Belgi qayerda ekanini yozing.",
                "Qachondan beri davom etayotgani va yengilmi, o'rtachami yoki kuchlimi yozing.",
            ],
            "questions": [
                "Asosiy belgi nima?",
                "Bu qachondan beri davom etyapti?",
                "Hozir yengilmi, o'rtachami yoki kuchlimi?",
            ],
        },
    }
    lang = language if language in texts else "en"
    selected = texts[lang]
    return {
        "urgency": "low",
        "specialty": None,
        "summary": selected["summary"],
        "advice": selected["advice"],
        "next_steps": selected["steps"],
        "follow_up_questions": selected["questions"],
        "needs_more_detail": True,
        "likely_condition": "",
        "prevention_tips": [],
    }


def symptom_bucket_summary(language: str, bucket: str) -> str:
    summaries = {
        "en": {
            "cardiac": "Chest or heart-related symptoms were detected and need careful review.",
            "headache": "Headache or neurologic-type symptoms were detected.",
            "skin": "Skin-related symptoms were detected.",
            "child": "This looks like a child health concern and should be monitored carefully.",
            "mental_health": "Mental health or stress-related symptoms were detected.",
            "back": "Back, joint, or injury-related symptoms were detected.",
            "stomach": "Stomach or digestive symptoms were detected.",
            "urinary": "Urinary symptoms were detected.",
            "cold_flu": "Cold, cough, throat, or flu-like symptoms were detected.",
            "fever": "Fever-related symptoms were detected.",
        },
        "uz": {
            "cardiac": "Ko'krak yoki yurak bilan bog'liq belgilar aniqlandi.",
            "headache": "Bosh og'rig'i yoki asab tizimi bilan bog'liq belgilar aniqlandi.",
            "skin": "Teri bilan bog'liq belgilar aniqlandi.",
            "child": "Bu bola salomatligi bilan bog'liq holatga o'xshaydi va diqqat bilan kuzatilishi kerak.",
            "mental_health": "Ruhiy zo'riqish yoki xavotirga o'xshash belgilar aniqlandi.",
            "back": "Bel, bo'g'im yoki jarohat bilan bog'liq belgilar aniqlandi.",
            "stomach": "Qorin yoki hazm tizimi bilan bog'liq belgilar aniqlandi.",
            "urinary": "Siydik yo'li bilan bog'liq belgilar aniqlandi.",
            "cold_flu": "Shamollash, tomoq yoki grippga o'xshash belgilar aniqlandi.",
            "fever": "Isitma bilan bog'liq belgilar aniqlandi.",
        },
    }
    if language not in summaries:
        return ""
    return summaries[language].get(bucket, "")


def symptom_bucket_advice(language: str, bucket: str, urgency: str) -> str:
    advice = {
        "en": {
            "cardiac": "Chest or heart-like symptoms should be checked promptly, especially if they are new, worsening, or come with dizziness or shortness of breath.",
            "headache": "Headache or dizziness can sometimes be simple, but sudden, severe, or worsening symptoms need earlier medical review.",
            "skin": "Rash or itching is often less urgent, but spreading rash, swelling, pain, or fever should be checked sooner.",
            "child": "Symptoms in a child can change faster than in adults, so fluids, breathing, activity, and fever should be watched closely.",
            "mental_health": "Anxiety, panic, or low mood deserves early support, especially if sleep, safety, or daily function is affected.",
            "back": "Back or joint pain often improves with rest, but weakness, numbness, swelling, or pain after injury needs medical review.",
            "stomach": "Stomach symptoms can lead to dehydration, so fluids matter now and worsening pain, vomiting, or diarrhea needs earlier care.",
            "urinary": "Painful or frequent urination can fit a urinary problem and should be checked sooner if there is fever, back pain, or blood in urine.",
            "cold_flu": "Cough, sore throat, or flu-like symptoms are often viral, but breathing trouble, chest pain, or worsening fever should be checked sooner.",
            "fever": "Fever often comes from infection and may improve with rest and fluids, but persistent high fever or marked weakness needs review.",
        },
        "uz": {
            "cardiac": "Ko'krak yoki yurakka o'xshash belgilar, ayniqsa yangi bo'lsa, kuchaysa yoki bosh aylanishi va nafas qisilishi bilan kelsa, tezroq ko'rikni talab qiladi.",
            "headache": "Bosh og'rig'i yoki bosh aylanishi ba'zan yengil bo'lishi mumkin, lekin to'satdan boshlangan, kuchli yoki kuchayib borayotgan holat erta ko'rikni talab qiladi.",
            "skin": "Toshma yoki qichishish ko'pincha kamroq shoshilinch bo'ladi, lekin tarqalsa, shishsa, og'risa yoki isitma qo'shilsa tezroq tekshiruv kerak.",
            "child": "Boladagi belgilar kattalarnikiga qaraganda tez o'zgarishi mumkin, shuning uchun suyuqlik ichishi, nafasi, faolligi va isitmasini diqqat bilan kuzatish kerak.",
            "mental_health": "Xavotir, vahima yoki tushkunlikni erta qo'llab-quvvatlash kerak, ayniqsa uyqu, xavfsizlik yoki kundalik holatga ta'sir qilsa.",
            "back": "Bel yoki bo'g'im og'rig'i ko'pincha dam bilan kamayadi, lekin karaxtlik, holsizlik, shish yoki jarohatdan keyingi og'riq ko'rikni talab qiladi.",
            "stomach": "Qorin bilan bog'liq belgilar suvsizlanishga olib kelishi mumkin, shuning uchun hozir suyuqlik muhim, og'riq, qusish yoki ich ketishi kuchaysa erta ko'rik kerak.",
            "urinary": "Siyganda achishish yoki tez-tez siyish siydik yo'li bilan bog'liq muammoni ko'rsatishi mumkin, isitma, bel og'rig'i yoki siydikda qon bo'lsa tezroq ko'rik zarur.",
            "cold_flu": "Yo'tal, tomoq og'rig'i yoki grippga o'xshash belgilar ko'pincha virusli bo'ladi, lekin nafas qisilishi, ko'krak og'rig'i yoki kuchayib borayotgan isitma bo'lsa tezroq tekshiruv kerak.",
            "fever": "Isitma ko'pincha infeksiya bilan bog'liq bo'ladi va dam hamda suyuqlik bilan yengillashi mumkin, lekin baland yoki davomli isitma va kuchli holsizlik ko'rikni talab qiladi.",
        },
    }
    if language not in advice:
        return ""

    text = advice[language].get(bucket, "")
    if not text:
        return ""
    if urgency == "medium":
        return f"{text} {default_text(language, 'same_day_step')}"
    return text


def symptom_follow_up_questions(language: str, bucket: str) -> List[str]:
    questions = {
        "en": {
            "cardiac": [
                "Is the chest symptom pressure, pain, tightness, or a racing heartbeat?",
                "Do you also have shortness of breath, dizziness, or pain spreading to the arm or jaw?",
                default_text("en", "question_duration"),
            ],
            "headache": [
                "Did the headache or dizziness start suddenly or build up gradually?",
                "Is there vomiting, vision change, numbness, or weakness too?",
                default_text("en", "question_severity"),
            ],
            "skin": [
                "Where is the rash or itching, and is it spreading?",
                "Is there swelling, pain, or a new food, medicine, or skin product involved?",
                default_text("en", "question_duration"),
            ],
            "child": [
                "How old is the child, and what is the main symptom?",
                "Is the child drinking fluids, active, and breathing normally?",
                default_text("en", "question_red_flags"),
            ],
            "mental_health": [
                "Is this mainly anxiety, panic, low mood, or inability to sleep?",
                "Is safety affected, or are you feeling at risk of harming yourself?",
                default_text("en", "question_duration"),
            ],
            "back": [
                "Did the pain start after lifting, strain, or an injury?",
                "Is there numbness, weakness, swelling, or pain going down the leg or arm?",
                default_text("en", "question_severity"),
            ],
            "stomach": [
                "Where is the pain: upper abdomen, lower abdomen, or all over?",
                "Do you also have vomiting, diarrhea, or fever?",
                "Can you keep fluids down?",
            ],
            "urinary": [
                "Is there burning with urination, frequency, blood in urine, or lower abdominal pain?",
                "Do you also have fever or back pain?",
                default_text("en", "question_duration"),
            ],
            "cold_flu": [
                "Is it mainly cough, sore throat, runny nose, or fever?",
                "Do you also have shortness of breath or chest pain?",
                default_text("en", "question_duration"),
            ],
            "fever": [
                "What is the approximate temperature?",
                "How many days has the fever been going on?",
                "Are cough, weakness, or breathing symptoms also present?",
            ],
        },
        "uz": {
            "cardiac": [
                "Ko'krakdagi belgi siqishmi, sanchishmi yoki yurak tez urishidekmi?",
                "Nafas qisilishi, bosh aylanishi yoki og'riq qo'lga va jag'ga tarqalishi ham bormi?",
                default_text("uz", "question_duration"),
            ],
            "headache": [
                "Bosh og'rig'i yoki bosh aylanishi to'satdan boshlandimi yoki asta kuchaydimi?",
                "Qusish, ko'rish o'zgarishi, karaxtlik yoki holsizlik ham bormi?",
                default_text("uz", "question_severity"),
            ],
            "skin": [
                "Toshma yoki qichishish qayerda va tarqalayaptimi?",
                "Shish, og'riq yoki yangi ovqat, dori yoki krem bilan bog'liqligi bormi?",
                default_text("uz", "question_duration"),
            ],
            "child": [
                "Bolaning yoshi nechada va asosiy belgi nima?",
                "Bola suyuqlik ichyaptimi, faolmi va nafasi odatiymi?",
                default_text("uz", "question_red_flags"),
            ],
            "mental_health": [
                "Bu ko'proq xavotir, vahima, tushkunlik yoki uxlay olmaslikmi?",
                "Xavfsizlikka ta'sir qilyaptimi yoki o'zingizga zarar fikri bormi?",
                default_text("uz", "question_duration"),
            ],
            "back": [
                "Og'riq ko'tarish, zo'riqish yoki jarohatdan keyin boshlandimi?",
                "Karaxtlik, holsizlik, shish yoki oyoq-qo'lga tarqalish ham bormi?",
                default_text("uz", "question_severity"),
            ],
            "stomach": [
                "Og'riq qayerda: yuqori qorin, pastki qorin yoki butun qorinmi?",
                "Qusish, ich ketishi yoki isitma ham bormi?",
                "Suyuqlik ichib tura olyapsizmi?",
            ],
            "urinary": [
                "Siyganda achishish, tez-tez siyish, pastki qorin og'rig'i yoki siydikda qon bormi?",
                "Isitma yoki bel og'rig'i ham qo'shilganmi?",
                default_text("uz", "question_duration"),
            ],
            "cold_flu": [
                "Asosiy belgi yo'talmi, tomoq og'rig'imi, tumovmi yoki isitmami?",
                "Nafas qisilishi yoki ko'krak og'rig'i ham bormi?",
                default_text("uz", "question_duration"),
            ],
            "fever": [
                "Harorat taxminan necha?",
                "Isitma necha kundan beri davom etyapti?",
                "Yo'tal, holsizlik yoki nafas bilan belgi ham bormi?",
            ],
        },
    }
    if language not in questions:
        return [
            default_text(language, "question_duration"),
            default_text(language, "question_severity"),
            default_text(language, "question_red_flags"),
        ]
    return questions[language].get(
        bucket,
        [
            default_text(language, "question_duration"),
            default_text(language, "question_severity"),
            default_text(language, "question_red_flags"),
        ],
    )


def symptom_bucket_likely_condition(language: str, bucket: str) -> str:
    conditions = {
        "en": {
            "cardiac": "A heart or chest-related condition",
            "headache": "A headache, migraine, or neurologic-type condition",
            "skin": "A skin or allergy-related condition",
            "child": "A child health condition needing closer monitoring",
            "mental_health": "An anxiety, panic, or other mental health condition",
            "back": "A back, joint, or injury-related condition",
            "stomach": "A stomach or digestive condition",
            "urinary": "A urinary tract-related condition",
            "cold_flu": "A cold, throat infection, or flu-like condition",
            "fever": "An infection or inflammation-related fever condition",
        },
        "uz": {
            "cardiac": "Yurak yoki ko'krak bilan bog'liq holat",
            "headache": "Bosh og'rig'i, migren yoki asab tizimi bilan bog'liq holat",
            "skin": "Teri yoki allergik holat",
            "child": "Bolaga oid diqqatli ko'rikni talab qiladigan holat",
            "mental_health": "Xavotir, stress yoki boshqa ruhiy salomatlik holati",
            "back": "Bel, bo'g'im yoki jarohat bilan bog'liq holat",
            "stomach": "Oshqozon-ichak yoki qorin bilan bog'liq holat",
            "urinary": "Siydik yo'li bilan bog'liq holat",
            "cold_flu": "Shamollash, tomoq infeksiyasi yoki grippga o'xshash holat",
            "fever": "Isitma bilan kechayotgan infeksiya yoki yallig'lanish holati",
        },
    }
    if language not in conditions:
        return ""
    return conditions[language].get(bucket, "")


def shorten_advice(text: str, max_sentences: int = 2, max_chars: int = 180) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return cleaned

    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    shortened = " ".join(sentence.strip() for sentence in sentences if sentence.strip()[:1])[:]
    if sentences:
        shortened = " ".join(sentence.strip() for sentence in sentences[:max_sentences] if sentence.strip())
    else:
        shortened = cleaned

    if len(shortened) > max_chars:
        shortened = shortened[: max_chars - 1].rstrip(" ,;:") + "…"

    return shortened


def pick_variant(seed: str, options: List[str]) -> str:
    if not options:
        return ""
    index = int(hashlib.sha256(seed.encode("utf-8")).hexdigest(), 16) % len(options)
    return options[index]


def compose_reply(
    language: str,
    message: str,
    summary: str,
    advice: str,
    next_steps: List[str],
    follow_up_questions: List[str],
    urgent: bool,
) -> str:
    lang = language if language in {"en", "uz"} else "en"
    seed_base = normalize_text(message)

    intros = {
        "en": {
            "urgent": [
                "This needs immediate action.",
                "This should be treated as urgent right now.",
                "This sounds serious and needs action now.",
            ],
            "standard": [
                "Here is the safest next plan based on what you wrote.",
                "Based on your message, this is the clearest next-step guidance.",
                "From the symptoms you described, this is the safest answer I can give.",
            ],
            "steps": [
                "What to do now:",
                "Next actions:",
                "Do this now:",
            ],
            "questions": [
                "If you want a more exact next step, reply with:",
                "To make the next answer more precise, send:",
                "If you want the answer narrowed further, tell me:",
            ],
        },
        "uz": {
            "urgent": [
                "Bu holatda darhol harakat qilish kerak.",
                "Buni hozirning o'zida shoshilinch holat deb qabul qiling.",
                "Bu jiddiy ko'rinadi va darhol choraga o'tish kerak.",
            ],
            "standard": [
                "Yozganingizga qarab eng xavfsiz keyingi yo'l mana shu.",
                "Siz bergan belgilarga qarab eng aniq keyingi tavsiya shu.",
                "Ta'riflagan belgilar bo'yicha eng xavfsiz javob mana shu.",
            ],
            "steps": [
                "Hozir nima qilish kerak:",
                "Keyingi qadamlar:",
                "Hozir shularni qiling:",
            ],
            "questions": [
                "Javobni yanada aniqroq qilish uchun shularni yozing:",
                "Keyingi javobni toraytirish uchun quyidagilarni yuboring:",
                "Aniqroq yo'naltirish uchun mana bularni ayting:",
            ],
        },
    }

    labels = lang if lang in intros else "en"
    intro = pick_variant(f"{seed_base}:intro:{'urgent' if urgent else 'standard'}", intros[labels]["urgent" if urgent else "standard"])
    step_label = pick_variant(f"{seed_base}:steps", intros[labels]["steps"])
    question_label = pick_variant(f"{seed_base}:questions", intros[labels]["questions"])

    sections: List[str] = []
    for text in [intro, summary, advice]:
        cleaned = re.sub(r"\s+", " ", (text or "").strip())
        if cleaned and cleaned not in sections:
            sections.append(cleaned)

    if next_steps:
        step_lines = [f"{idx + 1}. {step}" for idx, step in enumerate(next_steps[:4])]
        sections.append(f"{step_label}\n" + "\n".join(step_lines))

    if follow_up_questions and not urgent:
        question_lines = [f"- {question}" for question in follow_up_questions[:2]]
        sections.append(f"{question_label}\n" + "\n".join(question_lines))

    return "\n\n".join(sections)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    if not stored_hash or "$" not in stored_hash:
        return False
    salt, digest = stored_hash.split("$", 1)
    expected = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return hmac.compare_digest(expected, digest)


def normalize_username(username: Optional[str]) -> str:
    return (username or "").strip().lower()


def is_valid_username(username: str) -> bool:
    return bool(USERNAME_PATTERN.fullmatch(username))


def build_username_base(value: Optional[str], fallback_prefix: str = "user") -> str:
    cleaned = normalize_username(value)
    cleaned = re.sub(r"[^a-z0-9._-]", "", cleaned)
    if len(cleaned) >= 3:
        return cleaned[:32]

    fallback = re.sub(r"[^a-z0-9._-]", "", fallback_prefix.lower()) or "user"
    if len(cleaned) == 0:
        return fallback[:32]
    return f"{fallback}{cleaned}"[:32]


def make_unique_username(value: Optional[str], taken: set[str], fallback_prefix: str = "user") -> str:
    base = build_username_base(value, fallback_prefix)
    candidate = base
    counter = 2

    while candidate in taken or candidate in RESERVED_USERNAMES or not is_valid_username(candidate):
        suffix = f"_{counter}"
        trimmed_base = base[: max(3, 32 - len(suffix))]
        candidate = f"{trimmed_base}{suffix}"
        counter += 1

    taken.add(candidate)
    return candidate


def backfill_user_accounts() -> None:
    with database.SessionLocal() as db:
        users = db.query(models.User).order_by(models.User.id.asc()).all()
        taken = set(RESERVED_USERNAMES)
        updated = False

        for user in users:
            current_username = normalize_username(user.username)
            desired_username = user.username or (
                (user.email or "").split("@", 1)[0] if user.email else f"user{user.id}"
            )

            if current_username and is_valid_username(current_username) and current_username not in taken:
                taken.add(current_username)
                if user.username != current_username:
                    user.username = current_username
                    updated = True
                continue

            next_username = make_unique_username(desired_username, taken, fallback_prefix=f"user{user.id}")
            if user.username != next_username:
                user.username = next_username
                updated = True

        if updated:
            db.commit()


def backfill_doctor_accounts() -> None:
    with database.SessionLocal() as db:
        doctors = db.query(models.Doctor).all()
        updated = False
        for doctor in doctors:
            if not doctor.email:
                doctor.email = f"doctor{doctor.id}@mydoctor.app"
                updated = True
            if not doctor.password_hash:
                doctor.password_hash = hash_password("doctor123")
                updated = True
        if updated:
            db.commit()


backfill_user_accounts()
backfill_doctor_accounts()


def serialize_user(user: models.User) -> UserSchema:
    return UserSchema(
        id=user.id,
        username=user.username or "",
        email=user.email or "",
        is_premium=bool(user.is_premium),
    )


def serialize_doctor_user(doctor: models.Doctor) -> DoctorUserSchema:
    return DoctorUserSchema(
        id=doctor.id,
        name=doctor.name or "",
        email=doctor.email or "",
        specialty=doctor.specialty or "general practitioner",
        is_authorized=bool(doctor.is_authorized),
    )


def serialize_consultation_message(message: models.ConsultationMessage) -> ConsultationMessageSchema:
    return ConsultationMessageSchema(
        id=message.id,
        sender_type=message.sender_type,
        sender_id=message.sender_id,
        content=message.content,
        created_at=message.created_at.isoformat() if message.created_at else "",
    )


def serialize_consultation(
    consultation: models.Consultation,
    doctor: models.Doctor,
    user: models.User,
    messages: List[models.ConsultationMessage],
) -> ConsultationSchema:
    return ConsultationSchema(
        id=consultation.id,
        user_id=consultation.user_id,
        doctor_id=consultation.doctor_id,
        doctor_name=doctor.name or "",
        doctor_specialty=doctor.specialty or "general practitioner",
        patient_email=user.email or "",
        status=consultation.status or "open",
        created_at=consultation.created_at.isoformat() if consultation.created_at else "",
        updated_at=consultation.updated_at.isoformat() if consultation.updated_at else "",
        messages=[serialize_consultation_message(message) for message in messages],
    )


def is_emergency(text: str) -> bool:
    lowered = normalize_text(text)
    if emergency_reason(lowered):
        return True
    if any(keyword in lowered for keyword in EMERGENCY_KEYWORDS):
        return True

    if contains_any(lowered, EMERGENCY_CONTEXT_HINTS):
        danger_terms = [
            "pain", "breath", "bleed", "bleeding", "collapse", "collapsed",
            "unconscious", "seizure", "chest", "ko'krak", "nafas", "qon", "hush",
        ]
        return any(term in lowered for term in danger_terms)

    return False


def emergency_reason(text: str) -> Optional[str]:
    lowered = normalize_text(text)
    for group_name, patterns in EMERGENCY_PATTERNS.items():
        if any(pattern in lowered for pattern in patterns):
            return group_name
    return None


def emergency_summary(language: str, reason: Optional[str]) -> str:
    summaries = {
        "en": {
            "breathing": "Possible life-threatening breathing emergency detected.",
            "cardiac": "Possible life-threatening heart emergency detected.",
            "stroke": "Possible life-threatening stroke symptoms detected.",
            "bleeding": "Possible life-threatening bleeding emergency detected.",
            "neurologic": "Possible life-threatening seizure or unconsciousness emergency detected.",
            "allergy": "Possible life-threatening allergic reaction detected.",
            "overdose": "Possible life-threatening overdose or self-harm emergency detected.",
            "trauma": "Possible life-threatening major injury detected.",
            "pregnancy": "Possible life-threatening pregnancy emergency detected.",
            "infant": "Possible life-threatening infant emergency detected.",
            "default": "Possible life-threatening medical emergency detected.",
        },
        "ru": {
            "breathing": "Обнаружены признаки возможной опасной для жизни дыхательной неотложной ситуации.",
            "cardiac": "Обнаружены признаки возможной опасной для жизни сердечной неотложной ситуации.",
            "stroke": "Обнаружены возможные опасные для жизни симптомы инсульта.",
            "bleeding": "Обнаружены признаки возможного опасного для жизни кровотечения.",
            "neurologic": "Обнаружены признаки возможной опасной для жизни потери сознания или судорог.",
            "allergy": "Обнаружены признаки возможной опасной для жизни аллергической реакции.",
            "overdose": "Обнаружены признаки возможной опасной для жизни передозировки или самоповреждения.",
            "trauma": "Обнаружены признаки возможной опасной для жизни тяжелой травмы.",
            "pregnancy": "Обнаружены признаки возможной опасной для жизни ситуации при беременности.",
            "infant": "Обнаружены признаки возможной опасной для жизни неотложной ситуации у младенца.",
            "default": "Обнаружены признаки возможной опасной для жизни медицинской ситуации.",
        },
        "uz": {
            "breathing": "Hayot uchun xavfli nafas bilan bog'liq shoshilinch holat ehtimoli aniqlandi.",
            "cardiac": "Hayot uchun xavfli yurakka oid shoshilinch holat ehtimoli aniqlandi.",
            "stroke": "Hayot uchun xavfli insult belgilariga o'xshash holat aniqlandi.",
            "bleeding": "Hayot uchun xavfli kuchli qon ketish ehtimoli aniqlandi.",
            "neurologic": "Hayot uchun xavfli hushdan ketish yoki talvasa bilan bog'liq holat ehtimoli aniqlandi.",
            "allergy": "Hayot uchun xavfli og'ir allergik reaksiya ehtimoli aniqlandi.",
            "overdose": "Hayot uchun xavfli doza oshishi yoki o'ziga zarar yetkazish holati ehtimoli aniqlandi.",
            "trauma": "Hayot uchun xavfli og'ir jarohat ehtimoli aniqlandi.",
            "pregnancy": "Hayot uchun xavfli homiladorlik shoshilinch holati ehtimoli aniqlandi.",
            "infant": "Hayot uchun xavfli chaqaloq shoshilinch holati ehtimoli aniqlandi.",
            "default": "Hayot uchun xavfli shoshilinch tibbiy holat ehtimoli aniqlandi.",
        },
    }
    lang = language if language in summaries else "en"
    key = reason if reason in summaries[lang] else "default"
    return summaries[lang][key]


def emergency_dispatch_steps(language: str, reason: Optional[str]) -> List[str]:
    steps = {
        "en": {
            "default": [
                "Call emergency services now.",
                "Unlock the door and keep the phone on speaker if you can.",
                "Do not give food, drink, or medicine unless a clinician tells you to.",
            ],
            "breathing": [
                "Call emergency services now.",
                "Sit the person upright or clear anything blocking the airway.",
                "If they stop breathing, start CPR if you know how.",
            ],
            "cardiac": [
                "Call emergency services now.",
                "Stop activity and keep the person seated and still.",
                "If they become unresponsive and stop breathing, start CPR if you know how.",
            ],
            "stroke": [
                "Call emergency services now.",
                "Note the exact time the symptoms started or when the person was last normal.",
                "Keep them safe and do not give food, drink, or pills.",
            ],
            "bleeding": [
                "Call emergency services now.",
                "Press firmly on the bleeding area with a clean cloth.",
                "If possible, raise the injured area above heart level.",
            ],
            "neurologic": [
                "Call emergency services now.",
                "If there is a seizure, protect the head and turn the person onto their side after it stops.",
                "Do not put anything in their mouth.",
            ],
            "allergy": [
                "Call emergency services now.",
                "Use an epinephrine auto-injector immediately if one is available.",
                "Keep the person lying down unless breathing is easier sitting up.",
            ],
            "overdose": [
                "Call emergency services now.",
                "Stay with the person and remove nearby pills, alcohol, weapons, or sharp objects.",
                "If they are sleepy but breathing, place them on their side.",
            ],
            "trauma": [
                "Call emergency services now.",
                "Keep the person still and do not move the neck or back unless there is immediate danger.",
                "Apply firm pressure to heavy bleeding with a clean cloth.",
            ],
            "pregnancy": [
                "Call emergency services now.",
                "Heavy bleeding, fainting, or severe pain in pregnancy needs immediate care.",
                "Lie on the left side while waiting if the person feels faint.",
            ],
            "infant": [
                "Call emergency services now.",
                "If the baby is not breathing normally or not responding, start infant CPR if you know how.",
                "Keep the baby warm and do not force feeds.",
            ],
        },
        "uz": {
            "default": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Iloji bo'lsa eshikni oching va telefonni ovoz kuchaytirgichga qo'ying.",
                "Shifokor aytmaguncha ovqat, ichimlik yoki dori bermang.",
            ],
            "breathing": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Odamni tik o'tqazing yoki nafas yo'lini to'sayotgan narsani olib tashlang.",
                "Agar nafas to'xtasa, bilsangiz CPR boshlang.",
            ],
            "cardiac": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Harakatni to'xtating va odamni o'tqizib tinch tuting.",
                "Agar hushsiz bo'lib nafas olmay qolsa, bilsangiz CPR boshlang.",
            ],
            "stroke": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Belgilar qachon boshlanganini yoki oxirgi marta qachon normal bo'lganini eslab qoling.",
                "Ovqat, ichimlik yoki dori bermang.",
            ],
            "bleeding": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Qon ketayotgan joyni toza mato bilan qattiq bosib turing.",
                "Iloji bo'lsa jarohatlangan joyni yurakdan balandroq tuting.",
            ],
            "neurologic": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Talvasa bo'lsa boshini himoya qiling va tugagach yonboshiga o'giring.",
                "Og'ziga hech narsa solmang.",
            ],
            "allergy": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Agar epinefrin auto-inyektori bo'lsa, darhol ishlating.",
                "Nafas olish yomonlashmasa, yotqizib turing.",
            ],
            "overdose": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Odam bilan birga qoling va dorilar, alkogol, qurol yoki o'tkir buyumlarni olib tashlang.",
                "Agar uyquchan bo'lsa-yu nafas olayotgan bo'lsa, yonboshiga yotqizing.",
            ],
            "trauma": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Odamni qimirlatmang, ayniqsa bo'yin yoki bel jarohati bo'lishi mumkin bo'lsa.",
                "Kuchli qon ketayotgan bo'lsa, toza mato bilan qattiq bosib turing.",
            ],
            "pregnancy": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Homiladorlikda kuchli og'riq, hushdan ketish yoki qon ketish zudlik bilan yordam talab qiladi.",
                "Agar holsiz bo'lsa, kutayotganda chap yonboshiga yotqizing.",
            ],
            "infant": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Agar chaqaloq normal nafas olmayotgan yoki javob bermayotgan bo'lsa, bilsangiz infant CPR boshlang.",
                "Chaqaloqni issiq tuting va majburlab ovqat bermang.",
            ],
        },
    }
    lang = language if language in steps else "en"
    key = reason if reason in steps[lang] else "default"
    return steps[lang][key]


def emergency_advice(language: str, reason: Optional[str]) -> str:
    lead = {
        "en": "This may be life-threatening. Act now:",
        "ru": "Это может быть опасно для жизни. Действуйте немедленно:",
        "uz": "Bu hayot uchun xavfli bo'lishi mumkin. Darhol shunday qiling:",
    }
    lang = language if language in lead else "en"
    return f"{lead[lang]} " + " ".join(emergency_dispatch_steps(lang, reason))

    advice = {
        "en": {
            "default": (
                "This may be life-threatening. Call emergency services now or go to the nearest emergency department immediately. "
                "Do not wait for an online consultation if symptoms are happening right now."
            ),
            "overdose": (
                "This may be life-threatening and may involve overdose or self-harm risk. Call emergency services now and stay with the person if possible. "
                "Do not leave them alone."
            ),
            "stroke": (
                "This may be a life-threatening stroke emergency. Call emergency services immediately and note the time symptoms started. "
                "Do not wait to see if it passes."
            ),
            "breathing": (
                "This may be a life-threatening breathing emergency. Call emergency services now and seek immediate in-person help. "
                "If the person stops breathing, begin emergency first aid if you can."
            ),
        },
        "ru": {
            "default": (
                "Это может быть опасная для жизни неотложная ситуация. Немедленно вызовите скорую помощь или срочно езжайте в ближайшее отделение неотложной помощи. "
                "Не ждите онлайн-консультации, если симптомы происходят сейчас."
            ),
            "overdose": (
                "Это может быть опасная для жизни ситуация, связанная с передозировкой или риском самоповреждения. Немедленно вызовите скорую помощь и по возможности оставайтесь рядом с человеком. "
                "Не оставляйте его одного."
            ),
            "stroke": (
                "Это может быть опасный для жизни инсульт. Немедленно вызовите скорую помощь и запомните время начала симптомов. "
                "Не ждите, что это пройдет само."
            ),
            "breathing": (
                "Это может быть опасная для жизни дыхательная неотложная ситуация. Немедленно вызовите скорую помощь и срочно обратитесь за очной помощью. "
                "Если человек перестал дышать, начните неотложную помощь, если умеете."
            ),
        },
        "uz": {
            "default": (
                "Bu hayot uchun xavfli shoshilinch holat bo'lishi mumkin. Hozirning o'zida tez yordam chaqiring yoki eng yaqin shoshilinch bo'limga boring. "
                "Agar belgilar hozir bo'layotgan bo'lsa, onlayn konsultatsiyani kutmang."
            ),
            "overdose": (
                "Bu hayot uchun xavfli doza oshishi yoki o'ziga zarar yetkazish xavfi bilan bog'liq holat bo'lishi mumkin. Hozir tez yordam chaqiring va imkon bo'lsa odamning yonida qoling. "
                "Uni yolg'iz qoldirmang."
            ),
            "stroke": (
                "Bu hayot uchun xavfli insult bo'lishi mumkin. Tez yordamni darhol chaqiring va belgilar qachon boshlanganini eslab qoling. "
                "O'tib ketishini kutmang."
            ),
            "breathing": (
                "Bu hayot uchun xavfli nafas bilan bog'liq shoshilinch holat bo'lishi mumkin. Hozir tez yordam chaqiring va darhol shifokor ko'rigiga boring. "
                "Agar odam nafas olmay qolsa, bilsangiz birinchi yordamni boshlang."
            ),
        },
    }
    lang = language if language in advice else "en"
    if reason in advice[lang]:
        return advice[lang][reason]
    return advice[lang]["default"]


def likely_condition_text(language: str, specialty: str, reason: Optional[str], urgent: bool) -> str:
    if urgent and reason:
        urgent_map = {
            "en": {
                "breathing": "Possible severe breathing emergency",
                "cardiac": "Possible heart emergency",
                "stroke": "Possible stroke",
                "bleeding": "Possible severe bleeding emergency",
                "neurologic": "Possible seizure or unconsciousness emergency",
                "allergy": "Possible severe allergic reaction",
                "overdose": "Possible overdose or self-harm emergency",
                "trauma": "Possible major injury",
                "pregnancy": "Possible pregnancy emergency",
                "infant": "Possible infant emergency",
            },
            "ru": {
                "breathing": "Возможная тяжелая дыхательная неотложная ситуация",
                "cardiac": "Возможная сердечная неотложная ситуация",
                "stroke": "Возможный инсульт",
                "bleeding": "Возможное сильное кровотечение",
                "neurologic": "Возможный приступ или потеря сознания",
                "allergy": "Возможная тяжелая аллергическая реакция",
                "overdose": "Возможная передозировка или риск самоповреждения",
                "trauma": "Возможная серьезная травма",
                "pregnancy": "Возможная неотложная ситуация при беременности",
                "infant": "Возможная неотложная ситуация у младенца",
            },
            "uz": {
                "breathing": "Og'ir nafas bilan bog'liq shoshilinch holat bo'lishi mumkin",
                "cardiac": "Yurak bilan bog'liq shoshilinch holat bo'lishi mumkin",
                "stroke": "Insult bo'lishi mumkin",
                "bleeding": "Kuchli qon ketish bo'lishi mumkin",
                "neurologic": "Talvasa yoki hushdan ketish holati bo'lishi mumkin",
                "allergy": "Kuchli allergik reaksiya bo'lishi mumkin",
                "overdose": "Doza oshishi yoki o'ziga zarar xavfi bo'lishi mumkin",
                "trauma": "Jiddiy jarohat bo'lishi mumkin",
                "pregnancy": "Homiladorlikdagi shoshilinch holat bo'lishi mumkin",
                "infant": "Chaqaloqdagi shoshilinch holat bo'lishi mumkin",
            },
        }
        lang = language if language in urgent_map else "en"
        return urgent_map[lang].get(reason, urgent_map[lang].get("cardiac", "Possible emergency"))

    by_specialty = {
        "general practitioner": {
            "en": "A general medical condition that needs in-person evaluation",
            "ru": "Общее состояние, требующее очного осмотра",
            "uz": "Ko'rikni talab qiladigan umumiy holat",
        },
        "cardiologist": {
            "en": "A heart-related condition",
            "ru": "Состояние, связанное с сердцем",
            "uz": "Yurak bilan bog'liq holat",
        },
        "neurologist": {
            "en": "A brain, nerve, or severe headache-related condition",
            "ru": "Состояние, связанное с мозгом, нервами или сильной головной болью",
            "uz": "Miya, asab yoki kuchli bosh og'rig'i bilan bog'liq holat",
        },
        "dermatologist": {
            "en": "A skin-related condition",
            "ru": "Состояние, связанное с кожей",
            "uz": "Teri bilan bog'liq holat",
        },
        "pediatrician": {
            "en": "A child health condition",
            "ru": "Состояние, связанное со здоровьем ребенка",
            "uz": "Bola salomatligi bilan bog'liq holat",
        },
        "psychiatrist": {
            "en": "A mental health condition",
            "ru": "Состояние, связанное с психическим здоровьем",
            "uz": "Ruhiy salomatlik bilan bog'liq holat",
        },
        "orthopedist": {
            "en": "A bone, joint, or injury-related condition",
            "ru": "Состояние, связанное с костями, суставами или травмой",
            "uz": "Suyak, bo'g'im yoki jarohat bilan bog'liq holat",
        },
    }
    lang = language if language in {"en", "ru", "uz"} else "en"
    return by_specialty.get(specialty, by_specialty["general practitioner"])[lang]


def prevention_tips_text(language: str, specialty: str, urgent: bool) -> List[str]:
    tips = {
        "en": {
            "general practitioner": ["Stay hydrated and rest well.", "Seek early medical review if symptoms return or worsen."],
            "cardiologist": ["Avoid smoking and control blood pressure.", "Get urgent care early for chest pain or palpitations."],
            "neurologist": ["Sleep regularly and avoid dehydration.", "Get checked early if headaches, weakness, or numbness return."],
            "dermatologist": ["Avoid known skin triggers and irritants.", "Keep the affected area clean and monitored."],
            "pediatrician": ["Monitor temperature and fluid intake closely.", "Keep vaccinations and routine child checkups up to date."],
            "psychiatrist": ["Reduce stress and keep a stable sleep routine.", "Seek help early if anxiety, panic, or low mood returns."],
            "orthopedist": ["Avoid overuse and protect the injured area.", "Use early assessment for swelling, severe pain, or limited movement."],
            "urgent": ["Do not delay urgent care for severe warning signs.", "Get medical help early if the same warning signs happen again."],
        },
        "ru": {
            "general practitioner": ["Пейте достаточно воды и отдыхайте.", "Обратитесь к врачу раньше, если симптомы вернутся или усилятся."],
            "cardiologist": ["Избегайте курения и контролируйте давление.", "При боли в груди или сердцебиении обращайтесь за помощью раньше."],
            "neurologist": ["Соблюдайте режим сна и избегайте обезвоживания.", "Раннее обследование нужно при повторении головной боли, слабости или онемения."],
            "dermatologist": ["Избегайте известных раздражителей кожи.", "Держите пораженную область в чистоте и наблюдайте за ней."],
            "pediatrician": ["Следите за температурой и питьем у ребенка.", "Соблюдайте вакцинацию и плановые осмотры ребенка."],
            "psychiatrist": ["Снижайте стресс и поддерживайте стабильный сон.", "Обращайтесь за помощью раньше при возвращении тревоги или подавленности."],
            "orthopedist": ["Избегайте перегрузки и защищайте травмированную область.", "Рано обследуйтесь при отеке, сильной боли или ограничении движений."],
            "urgent": ["Не откладывайте срочную помощь при опасных симптомах.", "Обращайтесь раньше, если такие признаки повторятся."],
        },
        "uz": {
            "general practitioner": ["Ko'proq suyuqlik iching va yaxshi dam oling.", "Belgilar qaytsa yoki kuchaysa, ertaroq ko'rikka boring."],
            "cardiologist": ["Chekishdan saqlaning va qon bosimini nazorat qiling.", "Ko'krak og'rig'i yoki yurak urishi bo'lsa, tezroq yordam oling."],
            "neurologist": ["Uyqu rejimini saqlang va suvsizlanmang.", "Bosh og'rig'i, karaxtlik yoki holsizlik qaytsa, erta tekshiruvdan o'ting."],
            "dermatologist": ["Teri uchun zararli triggerlardan saqlaning.", "Ta'sirlangan joyni toza saqlang va kuzating."],
            "pediatrician": ["Bola harorati va suyuqlik ichishini kuzating.", "Vaksina va reja asosidagi ko'riklarni o'tkazib yubormang."],
            "psychiatrist": ["Stressni kamaytiring va uyquni me'yorida saqlang.", "Vahima yoki tushkunlik qaytsa, ertaroq yordam so'rang."],
            "orthopedist": ["Shikastlangan joyni asrang va ortiqcha zo'riqtirmang.", "Shish, kuchli og'riq yoki harakat cheklansa, erta tekshiruvdan o'ting."],
            "urgent": ["Xavfli belgilar bo'lsa yordamni kechiktirmang.", "Shu belgilar qayta bo'lsa, darhol tibbiy yordamga murojaat qiling."],
        },
    }
    lang = language if language in tips else "en"
    key = "urgent" if urgent else specialty
    return tips[lang].get(key, tips[lang]["general practitioner"])


def detect_instruction_scenario(lowered: str) -> Optional[str]:
    ordered_patterns = [
        ("stroke", ["face drooping", "slurred speech", "one sided weakness", "can't move one arm", "yuz qiyshaydi", "nutqi buzildi"]),
        ("cardiac", ["chest pain", "pressure in chest", "pain spreading to arm", "jaw pain with chest pain", "cold sweat with chest pain", "ko'krak og'rig'i"]),
        ("breathing", ["can't breathe", "cannot breathe", "not breathing", "shortness of breath", "gasping", "choking", "nafas ololmayapman", "nafas qisilishi"]),
        ("anaphylaxis", ["anaphylaxis", "severe allergic reaction", "throat swelling", "tongue swelling", "lip swelling with breathing trouble", "tomoq shishdi", "til shishdi"]),
        ("seizure", ["seizure", "talvasa", "unconscious", "collapsed", "unresponsive", "not waking up", "hushini yo'qotdi", "hushsiz"]),
        ("overdose", ["overdose", "took too many pills", "poisoning", "suicide", "self harm", "want to kill myself", "zaharlanish", "dozani oshirib yubordi"]),
        ("severe_bleeding", ["severe bleeding", "bleeding profusely", "won't stop bleeding", "deep wound", "qon to'xtamayapti", "qon ketyapti"]),
        ("head_injury", ["hit my head", "head injury", "concussion", "fell and hit head", "boshini urdi", "boshidan urilgan"]),
        ("fracture", ["fracture", "broken bone", "cannot bear weight", "deformed limb", "open fracture", "siniq", "ochiq siniq"]),
        ("burn", ["burn", "serious burn", "kuyish", "kuchli kuyish"]),
        ("stomach_severe", ["severe abdominal pain", "right lower abdomen", "appendix", "appendicitis", "qattiq qorin og'rig'i", "qorin og'rig'i kuchli"]),
        ("vomiting", ["vomiting", "can't keep fluids", "cannot keep fluids", "diarrhea", "qusish", "ich ket"]),
        ("urinary", ["burning when i pee", "pain when i pee", "frequent urination", "blood in urine", "siyganda achishish", "tez-tez siyish"]),
        ("rash", ["rash", "itching", "hives", "toshma", "qichishish"]),
        ("fever", ["fever", "high fever", "temperature", "isitma", "harorat"]),
        ("headache", ["headache", "migraine", "dizziness", "bosh og'rig'i", "bosh aylanishi"]),
        ("back_strain", ["back pain", "neck pain", "joint pain", "sprain", "bel og'rig'i", "bo'g'im og'rig'i"]),
        ("cold_flu", ["cough", "sore throat", "runny nose", "flu", "yo'tal", "tomoq og'rig'i", "tumov"]),
    ]
    for scenario, patterns in ordered_patterns:
        if any(pattern in lowered for pattern in patterns):
            return scenario
    return None


def scenario_urgency(scenario: Optional[str]) -> Optional[str]:
    if not scenario:
        return None
    if scenario in {
        "stroke", "cardiac", "breathing", "anaphylaxis", "seizure",
        "overdose", "severe_bleeding", "head_injury",
    }:
        return "high"
    if scenario in {"fracture", "burn", "stomach_severe", "vomiting", "urinary"}:
        return "medium"
    return "low"


def scenario_specific_advice(language: str, scenario: Optional[str]) -> str:
    texts = {
        "en": {
            "stroke": "Possible stroke symptoms were recognized. Time matters, so treat this as an emergency and act immediately.",
            "cardiac": "This sounds like a possible heart emergency, especially if the pain is heavy, spreading, or comes with sweating or shortness of breath.",
            "breathing": "This sounds like a breathing emergency and should be treated as urgent right now.",
            "anaphylaxis": "This sounds like a severe allergic reaction, which can worsen quickly and block breathing.",
            "seizure": "This sounds like a seizure or collapse emergency and the person needs immediate in-person help.",
            "overdose": "This may be an overdose or self-harm emergency and should be treated as life-threatening.",
            "severe_bleeding": "Heavy bleeding needs immediate first aid and urgent emergency help.",
            "head_injury": "A head injury needs close attention, especially if there is fainting, vomiting, confusion, or worsening headache.",
            "fracture": "This sounds like a possible fracture or serious limb injury and should be immobilized and checked promptly.",
            "burn": "Burn care depends on size, depth, and location, and serious burns need urgent in-person care.",
            "stomach_severe": "Severe abdominal pain can signal a surgical emergency if it is intense, localized, or getting worse.",
            "vomiting": "Vomiting or diarrhea needs dehydration prevention and earlier care if fluids cannot be kept down.",
            "urinary": "This sounds like a urinary problem and needs quicker review if there is fever, back pain, or blood in urine.",
            "rash": "Skin symptoms should be handled differently depending on whether there is itching alone or swelling, pain, or fever.",
            "fever": "Fever care depends on temperature, duration, and the presence of breathing trouble, weakness, or poor fluid intake.",
            "headache": "Headache instructions depend on whether this is gradual and typical, or sudden, severe, and unusual.",
            "back_strain": "Muscle or joint strain is usually managed with protection and reduced strain, not only rest.",
            "cold_flu": "Cold or flu-like symptoms usually need symptom relief and monitoring for breathing or chest warning signs.",
        },
        "uz": {
            "stroke": "Insultga o'xshash belgilar aniqlandi. Vaqt juda muhim, shuning uchun buni favqulodda holat deb qabul qiling.",
            "cardiac": "Bu yurak bilan bog'liq favqulodda holat bo'lishi mumkin, ayniqsa og'riq kuchli, tarqalayotgan yoki nafas qisilishi bilan bo'lsa.",
            "breathing": "Bu nafas bilan bog'liq favqulodda holatga o'xshaydi va hozirning o'zida yordam kerak.",
            "anaphylaxis": "Bu og'ir allergik reaksiya bo'lishi mumkin va tez yomonlashishi mumkin.",
            "seizure": "Bu talvasa yoki hushdan ketish bilan bog'liq favqulodda holatga o'xshaydi.",
            "overdose": "Bu doza oshishi yoki o'ziga zarar yetkazish bilan bog'liq xavfli holat bo'lishi mumkin.",
            "severe_bleeding": "Kuchli qon ketishda darhol birinchi yordam va tez yordam kerak.",
            "head_injury": "Bosh jarohati hushdan ketish, qusish, chalkashlik yoki og'riq kuchayishi bo'lsa xavfli bo'lishi mumkin.",
            "fracture": "Bu siniq yoki jiddiy qo'l-oyoq jarohatiga o'xshaydi va qimirlatmasdan tez tekshirtirish kerak.",
            "burn": "Kuyishda yordam kuyishning kattaligi, chuqurligi va joyiga qarab farq qiladi.",
            "stomach_severe": "Kuchli qorin og'rig'i jiddiy ichki muammo belgisi bo'lishi mumkin.",
            "vomiting": "Qusish yoki ich ketishda asosiy xavf suvsizlanish bo'ladi.",
            "urinary": "Bu siydik yo'li muammosiga o'xshaydi, isitma yoki bel og'rig'i bo'lsa tezroq ko'rik kerak.",
            "rash": "Teri belgilarida qichishishning o'zi bilan shish yoki isitma qo'shilgan holat bir xil emas.",
            "fever": "Isitmada yordam harorat, davomiylik va qo'shimcha xavfli belgilariga qarab farq qiladi.",
            "headache": "Bosh og'rig'ida yordam uning odatiy yoki to'satdan juda kuchli ekaniga qarab o'zgaradi.",
            "back_strain": "Mushak yoki bo'g'im zo'riqishida faqat dam emas, balki himoya va yuklamani kamaytirish kerak.",
            "cold_flu": "Shamollash yoki grippga o'xshash holatda simptomni yengillashtirish va xavfli belgilarni kuzatish kerak.",
        },
    }
    lang = language if language in texts else "en"
    if not scenario:
        return ""
    return texts[lang].get(scenario, "")


def scenario_specific_steps(language: str, scenario: Optional[str]) -> List[str]:
    steps = {
        "en": {
            "stroke": [
                "Call emergency services immediately.",
                "Note the exact time symptoms started or when the person was last acting normal.",
                "Do not give food, drink, or pills while waiting.",
            ],
            "cardiac": [
                "Stop all activity and sit the person down.",
                "Call emergency services now if chest pain is heavy, spreading, or comes with sweating, nausea, or shortness of breath.",
                "If the person becomes unresponsive and stops breathing, start CPR if you know how.",
            ],
            "breathing": [
                "Call emergency services now.",
                "Sit the person upright and loosen tight clothing.",
                "If they stop breathing, begin CPR if you know how.",
            ],
            "anaphylaxis": [
                "Use an epinephrine auto-injector immediately if available.",
                "Call emergency services now even if symptoms start to improve.",
                "Keep the person lying down unless breathing is easier sitting up.",
            ],
            "seizure": [
                "Move hard objects away and protect the person's head.",
                "Do not hold them down and do not put anything in their mouth.",
                "Call emergency services if the seizure lasts more than 5 minutes, repeats, or the person does not wake properly.",
            ],
            "overdose": [
                "Call emergency services now.",
                "Stay with the person and remove pills, alcohol, sharp objects, or weapons nearby.",
                "If they are breathing but sleepy, place them on their side.",
            ],
            "severe_bleeding": [
                "Press firmly on the wound with a clean cloth or bandage.",
                "Keep steady pressure without repeatedly checking the wound.",
                "Call emergency services now if bleeding is heavy or does not stop.",
            ],
            "head_injury": [
                "Keep the person resting and avoid sports, alcohol, and driving.",
                "Go for urgent in-person care now if there was fainting, repeated vomiting, confusion, seizure, or worsening headache.",
                "If neck injury is possible, keep the head and neck still.",
            ],
            "fracture": [
                "Keep the injured area still and do not try to straighten it.",
                "Apply a cold pack wrapped in cloth for 15 to 20 minutes.",
                "Seek urgent in-person care, and call emergency services if the bone is exposed or the limb is cold, blue, or numb.",
            ],
            "burn": [
                "Cool the burn under cool running water for 20 minutes.",
                "Remove rings or tight items early, but do not peel stuck clothing off the burn.",
                "Cover loosely with a clean non-fluffy cloth and get urgent care for large, deep, facial, hand, foot, genital, or electrical burns.",
            ],
            "stomach_severe": [
                "Do not eat a heavy meal while pain is severe.",
                "Use small sips of water only if you are not vomiting.",
                "Get urgent in-person care now if pain is severe, one-sided, or getting worse.",
            ],
            "vomiting": [
                "Take small frequent sips of water or oral rehydration solution.",
                "Avoid alcohol, greasy food, and large meals for now.",
                "Seek same-day care if you cannot keep fluids down, are getting weak, or notice blood.",
            ],
            "urinary": [
                "Drink water unless a clinician told you to limit fluids.",
                "Do not ignore fever, back pain, or blood in urine.",
                "Arrange a same-day visit if those warning signs are present.",
            ],
            "rash": [
                "Stop any new cream, cosmetic, soap, or medicine that may have triggered it.",
                "Keep the skin clean and avoid scratching.",
                "Seek urgent care if rash comes with facial swelling, trouble breathing, fever, or severe pain.",
            ],
            "fever": [
                "Drink extra fluids and rest in a cool room.",
                "Check the temperature and note how long the fever has been present.",
                "Seek same-day care if fever is high, lasts more than 48 hours, or comes with breathing trouble, confusion, or dehydration.",
            ],
            "headache": [
                "Rest in a quiet dark room and drink water.",
                "Avoid driving if you feel dizzy, weak, or your vision is affected.",
                "Get urgent care now if this is the worst headache of your life, started suddenly, or comes with weakness, confusion, or vomiting.",
            ],
            "back_strain": [
                "Reduce lifting, bending, and twisting today.",
                "Use ice for a new injury and heat later for stiffness.",
                "Seek care earlier if there is weakness, numbness, loss of bladder control, or major trauma.",
            ],
            "cold_flu": [
                "Rest, drink fluids, and manage fever or throat discomfort.",
                "Avoid smoking and monitor cough and breathing.",
                "Get checked sooner if breathing becomes difficult, chest pain starts, or fever keeps rising.",
            ],
        },
        "uz": {
            "stroke": [
                "Darhol tez yordam chaqiring.",
                "Belgilar qachon boshlanganini yoki oxirgi marta qachon normal bo'lganini eslab qoling.",
                "Kutayotganda ovqat, ichimlik yoki dori bermang.",
            ],
            "cardiac": [
                "Har qanday jismoniy harakatni to'xtating va odamni o'tqizing.",
                "Og'riq kuchli, tarqalayotgan yoki nafas qisilishi bilan bo'lsa, hozir tez yordam chaqiring.",
                "Agar hushsiz bo'lib nafas olmay qolsa, bilsangiz CPR boshlang.",
            ],
            "breathing": [
                "Hozirning o'zida tez yordam chaqiring.",
                "Odamni tik o'tqazing va siqib turgan kiyimlarini bo'shating.",
                "Agar nafas to'xtasa, bilsangiz CPR boshlang.",
            ],
            "anaphylaxis": [
                "Agar epinefrin auto-inyektori bo'lsa, darhol ishlating.",
                "Aholi yaxshilangandek tuyulsa ham tez yordam chaqiring.",
                "Nafas olishi yomon bo'lmasa, yotqizib turing.",
            ],
            "seizure": [
                "Atrofdagi qattiq buyumlarni uzoqlashtirib, boshini himoya qiling.",
                "Uni ushlab turmang va og'ziga hech narsa solmang.",
                "Talvasa 5 daqiqadan oshsa, qaytalansa yoki to'liq o'ziga kelmasa tez yordam chaqiring.",
            ],
            "overdose": [
                "Darhol tez yordam chaqiring.",
                "Odam bilan birga qoling va dorilar, alkogol, o'tkir buyumlar yoki qurollarni olib tashlang.",
                "Agar nafas olayotgan bo'lsa-yu uyquchan bo'lsa, yonboshiga yotqizing.",
            ],
            "severe_bleeding": [
                "Jarohatni toza mato yoki bint bilan qattiq bosing.",
                "Bosimni ushlab turing va tez-tez ochib tekshirmang.",
                "Qon ko'p bo'lsa yoki to'xtamasa, hozir tez yordam chaqiring.",
            ],
            "head_injury": [
                "Dam oldiring, sport, alkogol va mashina haydashni to'xtating.",
                "Hushdan ketish, qayta-qayta qusish, chalkashlik yoki og'riq kuchaysa zudlik bilan shifokorga olib boring.",
                "Bo'yin jarohati ehtimoli bo'lsa, bosh va bo'yinni qimirlatmang.",
            ],
            "fracture": [
                "Jarohatlangan joyni qimirlatmang va to'g'rilashga urinmang.",
                "Mato bilan o'ralgan sovuq kompressni 15-20 daqiqa qo'ying.",
                "Shoshilinch ko'rikka boring, suyak chiqib turgan, joy ko'kargan yoki uvishgan bo'lsa tez yordam chaqiring.",
            ],
            "burn": [
                "Kuygan joyni 20 daqiqa davomida salqin oqar suv ostida sovuting.",
                "Uzuk yoki qattiq buyumlarni erta yeching, lekin yopishib qolgan kiyimni tortmang.",
                "Katta, chuqur, yuz, qo'l, oyoq, jinsiy a'zo yoki elektr kuyishida zudlik bilan yordam oling.",
            ],
            "stomach_severe": [
                "Og'riq kuchli bo'lsa og'ir ovqat yemang.",
                "Qusmayotgan bo'lsangiz oz-ozdan suv iching.",
                "Og'riq kuchli, bir tomonda yoki kuchayib borayotgan bo'lsa darhol ko'rikka boring.",
            ],
            "vomiting": [
                "Oz-ozdan tez-tez suv yoki rehidratatsiya eritmasi iching.",
                "Hozircha yog'li ovqat, alkogol va katta porsiyadan saqlaning.",
                "Suyuqlikni ushlab turolmasangiz, juda holsiz bo'lsangiz yoki qon ko'rinsa shu kunning o'zida ko'rikka boring.",
            ],
            "urinary": [
                "Agar suyuqlik cheklovi aytilmagan bo'lsa, suv iching.",
                "Isitma, bel og'rig'i yoki siydikda qon bo'lsa kutmang.",
                "Shunday belgilar bo'lsa shu kunning o'zida ko'rikka boring.",
            ],
            "rash": [
                "Tetiklagan bo'lishi mumkin bo'lgan yangi krem, sovun, kosmetika yoki dorini to'xtating.",
                "Terini toza saqlang va qashimang.",
                "Yuz shishi, nafas qisilishi, isitma yoki kuchli og'riq bo'lsa zudlik bilan yordam oling.",
            ],
            "fever": [
                "Ko'proq suyuqlik iching va salqin xonada dam oling.",
                "Haroratni va necha kundan beri borligini kuzating.",
                "Isitma baland bo'lsa, 48 soatdan oshsa yoki nafas qisilishi, chalkashlik, suvsizlanish bilan kelsa shu kunning o'zida ko'rikka boring.",
            ],
            "headache": [
                "Tinch va qorong'i joyda dam oling, suv iching.",
                "Bosh aylanishi yoki ko'rish buzilishi bo'lsa mashina haydamang.",
                "Hayotingizdagi eng kuchli bosh og'rig'i bo'lsa, to'satdan boshlangan bo'lsa yoki holsizlik, qusish, chalkashlik bilan bo'lsa darhol yordam oling.",
            ],
            "back_strain": [
                "Bugun ko'tarish, egilish va burilishni kamaytiring.",
                "Yangi jarohatda sovuq, keyinroq qotishishda issiq qo'llang.",
                "Holsizlik, karaxtlik, siyishni ushlay olmaslik yoki katta travma bo'lsa tezroq ko'rikka boring.",
            ],
            "cold_flu": [
                "Dam oling, suyuqlik iching va isitma hamda tomoq bezovtaligini yengillashtiring.",
                "Chekishdan saqlaning va yo'tal hamda nafasni kuzating.",
                "Nafas qisilsa, ko'krak og'risa yoki isitma kuchaysa tezroq ko'rikka boring.",
            ],
        },
    }
    lang = language if language in steps else "en"
    if not scenario:
        return []
    return steps[lang].get(scenario, [])


def symptom_specific_advice(language: str, specialty: str, lowered: str, urgency: str) -> str:
    scenario = detect_instruction_scenario(lowered)
    scenario_text = scenario_specific_advice(language, scenario)
    if scenario_text:
        if urgency == "medium":
            return f"{scenario_text} {default_text(language, 'same_day_step')}"
        return scenario_text

    advice = {
        "en": {
            "cardiologist": "Chest symptoms need prompt medical assessment, especially if they are new, stronger than usual, or come with shortness of breath.",
            "neurologist": "Headache, dizziness, numbness, or confusion should be monitored closely because worsening neurologic symptoms need urgent evaluation.",
            "dermatologist": "Skin symptoms like rash or itching should be kept clean and observed, especially if they are spreading or becoming painful.",
            "pediatrician": "Symptoms in a child should be watched carefully because dehydration, fever, or breathing changes can worsen faster than in adults.",
            "psychiatrist": "Strong anxiety, panic, or emotional distress deserves support early, especially if you feel unsafe or unable to calm down.",
            "orthopedist": "Back, neck, joint, or injury-related pain often improves with rest, but weakness, numbness, or limited movement needs medical review.",
            "general practitioner": "These symptoms need a general medical review if they keep going, spread, or start affecting normal eating, drinking, sleep, or movement.",
            "fever": "Fever often improves with rest and fluids, but high fever that persists or comes with breathing trouble should be checked soon.",
            "stomach": "Stomach symptoms can lead to dehydration, so fluids matter now and worsening pain or vomiting should be checked earlier.",
            "cold_flu": "Cold or flu-like symptoms often improve with rest and fluids, but worsening cough, weakness, or fever should be reviewed.",
        },
        "ru": {
            "cardiologist": "Симптомы со стороны груди требуют быстрого осмотра врача, особенно если они новые, усиливаются или сопровождаются одышкой.",
            "neurologist": "Головную боль, головокружение, онемение или спутанность нужно внимательно отслеживать, потому что усиление неврологических симптомов требует срочной оценки.",
            "dermatologist": "Сыпь, зуд и другие кожные изменения нужно держать в чистоте и наблюдать, особенно если они распространяются или становятся болезненными.",
            "pediatrician": "Симптомы у ребенка нужно наблюдать особенно внимательно, потому что обезвоживание, температура или проблемы с дыханием могут усилиться быстрее.",
            "psychiatrist": "Сильную тревогу, панику или эмоциональный стресс важно воспринимать серьезно, особенно если вы чувствуете небезопасность или не можете успокоиться.",
            "orthopedist": "Боль в спине, шее, суставах или после травмы часто уменьшается в покое, но слабость, онемение или ограничение движений требуют осмотра.",
            "general practitioner": "Эти симптомы требуют общего медицинского осмотра, если они не проходят, распространяются или начинают мешать обычной жизни.",
            "fever": "Температура часто уменьшается после отдыха и жидкости, но стойкая высокая температура или проблемы с дыханием требуют скорого осмотра.",
            "stomach": "Симптомы со стороны живота могут быстро привести к обезвоживанию, поэтому сейчас важна жидкость, а усиление боли или рвоты требует более раннего осмотра.",
            "cold_flu": "Симптомы простуды или гриппа часто уменьшаются после отдыха и жидкости, но усиление кашля, слабости или температуры требует осмотра.",
        },
        "uz": {
            "cardiologist": "Ko'krak bilan bog'liq belgilar, ayniqsa yangi bo'lsa, kuchaysa yoki nafas qisilishi bilan kelsa, tez ko'rikni talab qiladi.",
            "neurologist": "Bosh og'rig'i, bosh aylanishi, karaxtlik yoki chalkashlikni diqqat bilan kuzatish kerak, chunki kuchayib borayotgan nevrologik belgilar tez baholanishi kerak.",
            "dermatologist": "Toshma, qichishish yoki boshqa teri belgilarini toza saqlab kuzatish kerak, ayniqsa ular tarqalayotgan yoki og'riqli bo'lsa.",
            "pediatrician": "Boladagi belgilarni kattalarnikiga qaraganda diqqat bilan kuzatish kerak, chunki suvsizlanish, isitma yoki nafas o'zgarishi tez kuchayishi mumkin.",
            "psychiatrist": "Kuchli xavotir, vahima yoki ruhiy bosimni jiddiy qabul qilish kerak, ayniqsa o'zingizni xavfsiz his qilmasangiz.",
            "orthopedist": "Bel, bo'yin, bo'g'im yoki shikast bilan bog'liq og'riq ko'pincha dam bilan kamayadi, lekin karaxtlik, holsizlik yoki harakat cheklanishi ko'rikni talab qiladi.",
            "general practitioner": "Bu belgilar o'tmayotgan bo'lsa, tarqalsa yoki ovqatlanish, ichish, uyqu yoki harakatga halaqit bera boshlasa umumiy ko'rik kerak.",
            "fever": "Isitma ko'pincha dam va suyuqlik bilan pasayadi, lekin baland harorat saqlansa yoki nafas bilan muammo qo'shilsa tez ko'rik kerak.",
            "stomach": "Qorin bilan bog'liq belgilar suvsizlanishga olib kelishi mumkin, shuning uchun hozir suyuqlik muhim, og'riq yoki qusish kuchaysa tezroq ko'rik zarur.",
            "cold_flu": "Shamollash yoki grippga o'xshash belgilar ko'pincha dam va suyuqlik bilan yengillashadi, lekin yo'tal, holsizlik yoki isitma kuchaysa ko'rik kerak.",
        },
    }

    lang = language if language in advice else "en"
    bucket = specialty if specialty in advice[lang] else "general practitioner"

    if "fever" in lowered or "temperature" in lowered or "isitma" in lowered or "темпера" in lowered:
        bucket = "fever"
    elif "stomach" in lowered or "abdomen" in lowered or "nausea" in lowered or "vomit" in lowered or "qorin" in lowered or "живот" in lowered:
        bucket = "stomach"
    elif "cold" in lowered or "flu" in lowered or "cough" in lowered or "shamoll" in lowered or "gripp" in lowered or "простуд" in lowered:
        bucket = "cold_flu"

    text = advice[lang].get(bucket, advice[lang]["general practitioner"])
    if urgency == "medium":
        return f"{text} {default_text(language, 'same_day_step')}"
    return text


def symptom_specific_steps(language: str, specialty: str, lowered: str, urgency: str) -> List[str]:
    scenario = detect_instruction_scenario(lowered)
    scenario_steps = scenario_specific_steps(language, scenario)
    if scenario_steps:
        return scenario_steps

    steps = {
        "en": {
            "cardiologist": [
                "Stop physical activity and sit upright while monitoring chest discomfort or palpitations.",
                "Avoid caffeine, nicotine, and heavy meals until you are checked.",
            ],
            "neurologist": [
                "Rest in a quiet, dark place and avoid driving if you feel dizzy, weak, or confused.",
                "Drink water and seek urgent care quickly if headache, numbness, or vision changes worsen.",
            ],
            "dermatologist": [
                "Avoid scratching the area and gently wash the skin with mild soap and water.",
                "Do not apply new cosmetic or irritating skin products until the rash is assessed.",
            ],
            "pediatrician": [
                "Check the child's temperature, fluids, and activity level closely.",
                "Keep the child hydrated and seek same-day care if they are unusually sleepy or breathing poorly.",
            ],
            "psychiatrist": [
                "Move to a safe, calm place and contact a trusted person now.",
                "Avoid being alone if panic, self-harm thoughts, or severe distress are happening.",
            ],
            "orthopedist": [
                "Rest the painful area and reduce weight-bearing or strain.",
                "Use a cold pack for 15 to 20 minutes if there is swelling or recent injury.",
            ],
            "back": [
                "Avoid heavy lifting, repeated bending, or twisting for now and change positions slowly.",
                "Use warmth for stiffness or a cold pack if the pain started after strain or a recent injury.",
            ],
            "general practitioner": [
                "Rest, hydrate, and monitor whether the symptoms are improving or getting worse.",
                "Book an in-person evaluation if symptoms persist, spread, or interfere with eating, drinking, or sleeping.",
            ],
            "fever": [
                "Drink extra fluids and rest while checking your temperature regularly.",
                "Seek same-day care if fever stays high, lasts more than a day or two, or comes with breathing trouble.",
            ],
            "stomach": [
                "Take small sips of water and avoid heavy, greasy, or spicy foods for now.",
                "Get checked sooner if pain becomes severe, you cannot keep fluids down, or vomiting continues.",
            ],
        },
        "ru": {
            "cardiologist": [
                "Прекратите физическую нагрузку и присядьте, наблюдая за болью в груди или сердцебиением.",
                "Избегайте кофеина, никотина и тяжелой еды, пока вас не осмотрит врач.",
            ],
            "neurologist": [
                "Отдохните в тихом темном месте и не садитесь за руль при головокружении, слабости или спутанности.",
                "Пейте воду и срочно обращайтесь за помощью, если головная боль, онемение или нарушение зрения усиливаются.",
            ],
            "dermatologist": [
                "Не расчесывайте участок и аккуратно промойте кожу мягким мылом и водой.",
                "Не наносите новые косметические или раздражающие средства, пока сыпь не оценит врач.",
            ],
            "pediatrician": [
                "Внимательно следите за температурой, питьем и активностью ребенка.",
                "Поддерживайте питьевой режим и обращайтесь в тот же день, если ребенок сонливый или плохо дышит.",
            ],
            "psychiatrist": [
                "Перейдите в безопасное спокойное место и свяжитесь с доверенным человеком прямо сейчас.",
                "Не оставайтесь одни, если есть паника, мысли о самоповреждении или сильный дистресс.",
            ],
            "orthopedist": [
                "Дайте болезненной области покой и уменьшите нагрузку.",
                "При отеке или недавней травме приложите холод на 15-20 минут.",
            ],
            "general practitioner": [
                "Отдыхайте, пейте воду и наблюдайте, уменьшаются ли симптомы или усиливаются.",
                "Запишитесь на очный осмотр, если симптомы сохраняются, распространяются или мешают есть, пить или спать.",
            ],
            "fever": [
                "Пейте больше жидкости, отдыхайте и регулярно измеряйте температуру.",
                "Обратитесь в тот же день, если температура остается высокой, держится дольше 1-2 дней или сочетается с проблемами дыхания.",
            ],
            "stomach": [
                "Пейте воду маленькими глотками и пока избегайте жирной, тяжелой и острой пищи.",
                "Обратитесь раньше, если боль становится сильной, жидкость не удерживается или рвота продолжается.",
            ],
        },
        "uz": {
            "cardiologist": [
                "Jismoniy faollikni to'xtatib, o'tirib turing va ko'krak og'rig'i yoki yurak urishini kuzating.",
                "Tekshiruvgacha kofein, sigaret va og'ir ovqatdan saqlaning.",
            ],
            "neurologist": [
                "Tinch va qorong'i joyda dam oling, bosh aylanishi yoki karaxtlik bo'lsa mashina haydamang.",
                "Suv iching va bosh og'rig'i, karaxtlik yoki ko'rish buzilishi kuchaysa tez yordam oling.",
            ],
            "dermatologist": [
                "Joyni qashimang va terini yengil sovun hamda suv bilan ehtiyotkor tozalang.",
                "Toshma ko'rikdan o'tmaguncha yangi krem yoki bezovta qiluvchi mahsulot surtmay turing.",
            ],
            "pediatrician": [
                "Bolaning harorati, suyuqlik ichishi va holatini diqqat bilan kuzating.",
                "Bolani suvsizlantirmang va juda lanj bo'lsa yoki nafas olishi yomonlashsa shu kunning o'zida ko'rikka olib boring.",
            ],
            "psychiatrist": [
                "Xavfsiz va tinch joyga o'ting hamda ishonchli odam bilan hozir bog'laning.",
                "Vahima, o'ziga zarar fikri yoki kuchli bezovtalik bo'lsa yolg'iz qolmang.",
            ],
            "orthopedist": [
                "Og'riyotgan joyni dam oldiring va zo'riqishni kamaytiring.",
                "Shish yoki yangi jarohat bo'lsa 15-20 daqiqa sovuq kompress qo'ying.",
            ],
            "back": [
                "Hozircha og'ir ko'tarmang, qayta-qayta egilmang yoki burilmang, holatni sekin o'zgartiring.",
                "Qotish bo'lsa iliq kompress, yangi zo'riqish yoki jarohatdan keyin esa sovuq kompress qo'llang.",
            ],
            "general practitioner": [
                "Dam oling, ko'proq suyuqlik iching va belgilar kamayadimi yoki kuchayadimi kuzating.",
                "Belgilar davom etsa, tarqalsa yoki ovqatlanish, ichish, uyquga xalaqit bersa ko'rikka boring.",
            ],
            "fever": [
                "Ko'proq suyuqlik iching, dam oling va haroratni tekshirib boring.",
                "Isitma baland bo'lib qolsa, 1-2 kundan oshsa yoki nafas bilan muammo qo'shilsa shu kunning o'zida ko'rikka boring.",
            ],
            "stomach": [
                "Hozircha suvni oz-ozdan iching va yog'li, og'ir yoki achchiq ovqat yemang.",
                "Og'riq kuchaysa, suyuqlikni ushlab turolmasangiz yoki qusish davom etsa tezroq tekshiruvdan o'ting.",
            ],
        },
    }

    lang = language if language in steps else "en"
    bucket = specialty if specialty in steps[lang] else "general practitioner"

    if "fever" in lowered or "temperature" in lowered or "isitma" in lowered or "темпера" in lowered:
        bucket = "fever"
    elif "stomach" in lowered or "abdomen" in lowered or "nausea" in lowered or "qorin" in lowered or "живот" in lowered:
        bucket = "stomach"
    elif "back pain" in lowered or "lower back" in lowered or "upper back" in lowered or "waist pain" in lowered or "belim" in lowered or "bel og'" in lowered or "спин" in lowered:
        bucket = "back"
    elif "back pain" in lowered or "lower back" in lowered or "upper back" in lowered or "waist pain" in lowered or "belim" in lowered or "bel og'" in lowered or "спин" in lowered:
        bucket = "back"

    selected = list(steps[lang].get(bucket, steps[lang]["general practitioner"]))

    if urgency == "medium":
        selected.insert(0, default_text(language, "same_day_step"))
    elif urgency == "low":
        selected.insert(0, default_text(language, "routine_step"))

    return selected


def normalize_specialty(raw_specialty: Optional[str]) -> str:
    if not raw_specialty:
        return "general practitioner"

    lowered = normalize_text(raw_specialty)
    if lowered in SUPPORTED_SPECIALTIES:
        return lowered

    if lowered in SPECIALTY_SYNONYMS:
        return SPECIALTY_SYNONYMS[lowered]

    for alias, normalized in SPECIALTY_SYNONYMS.items():
        if alias in lowered:
            return normalized

    for specialty in SUPPORTED_SPECIALTIES:
        if specialty in lowered:
            return specialty

    return "general practitioner"


def detect_unsupported_specialty(message: str) -> Optional[str]:
    lowered = normalize_text(message)
    for specialty, hints in UNSUPPORTED_SPECIALTY_HINTS.items():
        if any(hint in lowered for hint in hints):
            return specialty
    return None


def default_text(language: str, key: str) -> str:
    messages = {
        "en": {
            "fallback_reply": (
                "I can share general triage guidance based on symptom safety rules and doctor records in this app, but this is not a diagnosis. "
                "If symptoms are severe, rapidly worsening, or you feel unsafe, seek urgent medical care now."
            ),
            "fallback_summary": "Symptoms were reviewed with the app's safety rules. The recommended specialty below is the safest place to start.",
            "urgent_step": "Call emergency services or go to the nearest emergency department now.",
            "same_day_step": "Arrange an in-person medical evaluation as soon as possible, ideally today.",
            "routine_step": "Monitor symptoms, rest, hydrate, and book a clinic visit if symptoms persist.",
            "question_duration": "How long have these symptoms been going on?",
            "question_severity": "What is the symptom severity from 1 to 10?",
            "question_red_flags": "Do you also have fever, breathing trouble, fainting, or severe pain?",
        },
        "ru": {
            "fallback_reply": (
                "Я могу дать только общие рекомендации по сортировке симптомов на основе правил приложения, а не диагноз. "
                "Если симптомы сильные, быстро усиливаются или вы чувствуете опасность, срочно обратитесь за помощью."
            ),
            "fallback_summary": "Симптомы проверены по правилам сортировки. Указанная ниже специальность — самый безопасный старт.",
            "urgent_step": "Немедленно вызовите скорую помощь или поезжайте в ближайшее отделение неотложной помощи.",
            "same_day_step": "Организуйте очный медицинский осмотр как можно скорее, желательно сегодня.",
            "routine_step": "Наблюдайте за симптомами, отдыхайте, пейте воду и запишитесь к врачу, если состояние не проходит.",
            "question_duration": "Как давно у вас появились эти симптомы?",
            "question_severity": "Насколько сильны симптомы по шкале от 1 до 10?",
            "question_red_flags": "Есть ли температура, проблемы с дыханием, обморок или сильная боль?",
        },
        "uz": {
            "fallback_reply": (
                "Men faqat ilovadagi qoidalarga asoslangan umumiy triaj tavsiyasi bera olaman, bu tashxis emas. "
                "Agar belgilar kuchli bo'lsa, tez yomonlashsa yoki o'zingizni xavfda his qilsangiz, zudlik bilan shoshilinch yordam oling."
            ),
            "fallback_summary": "Belgilar triaj qoidalari bo'yicha tekshirildi. Quyida ko'rsatilgan mutaxassislik eng xavfsiz boshlanish nuqtasi.",
            "urgent_step": "Hozirning o'zida tez yordam chaqiring yoki eng yaqin shoshilinch bo'limga boring.",
            "same_day_step": "Imkon qadar tez, yaxshisi bugunoq, shifokor ko'rigini tashkil qiling.",
            "routine_step": "Belgilarni kuzating, dam oling, suyuqlik iching va davom etsa klinikaga yoziling.",
            "question_duration": "Bu belgilar qachondan beri davom etmoqda?",
            "question_severity": "Belgilar kuchini 1 dan 10 gacha baholaysizmi?",
            "question_red_flags": "Isitma, nafas qisilishi, hushdan ketish yoki kuchli og'riq ham bormi?",
        },
    }
    lang = language if language in messages else "en"
    return messages[lang][key]


def demo_unavailable_summary(language: str) -> str:
    messages = {
        "en": "This request likely needs a specialty that is not available in the current demo database.",
        "ru": "Похоже, для этого запроса нужен специалист, которого пока нет в текущей demo-базе.",
        "uz": "Bu so'rov uchun hozirgi demo bazada mavjud bo'lmagan yo'nalishdagi mutaxassis kerak bo'lishi mumkin.",
    }
    return messages.get(language, messages["en"])


def demo_unavailable_reply(language: str) -> str:
    messages = {
        "en": "This site is currently a demo in development, and there is no matching specialist for this request in the app database yet. For a more complete search, please use an official healthcare system or contact a licensed clinic directly.",
        "ru": "Сайт сейчас работает как demo в разработке, и в базе приложения пока нет подходящего специалиста по этому запросу. Для более полного поиска используйте официальную систему здравоохранения или обратитесь напрямую в лицензированную клинику.",
        "uz": "Bu sayt hozir demo rivojlantirish bosqichida va ilova bazasida bu so'rovga mos mutaxassis hali yo'q. To'liqroq qidiruv uchun rasmiy sog'liqni saqlash tizimidan foydalaning yoki litsenziyalangan klinikaga bevosita murojaat qiling.",
    }
    return messages.get(language, messages["en"])


def heuristic_triage(message: str, language: str) -> dict:
    lowered = normalize_text(message)
    if needs_more_symptom_details(lowered):
        return detail_request_payload(language)

    urgent = is_emergency(lowered)
    reason = emergency_reason(lowered)
    scenario = detect_instruction_scenario(lowered)
    urgency = "high" if urgent else "low"
    scenario_level = scenario_urgency(scenario)
    if scenario_level == "high":
        urgency = "high"
    elif scenario_level == "medium" and urgency != "high":
        urgency = "medium"
    severity_score = extract_severity_score(lowered)

    if not urgent and (any(hint in lowered for hint in MEDIUM_URGENCY_HINTS) or (severity_score is not None and severity_score >= 7)):
        urgency = "medium"

    specialty = "general practitioner"
    for candidate, hints in SPECIALTY_HINTS.items():
        if any(hint in lowered for hint in hints):
            specialty = candidate
            break

    unsupported_specialty = detect_unsupported_specialty(lowered)
    if unsupported_specialty:
        specialty = unsupported_specialty

    bucket = detect_symptom_bucket(lowered, specialty)
    specialty = BUCKET_TO_SPECIALTY.get(bucket, specialty)

    next_steps = symptom_specific_steps(language, specialty, lowered, urgency)
    if urgency == "high":
        next_steps = emergency_dispatch_steps(language, reason) + next_steps

    follow_up_questions = symptom_follow_up_questions(language, bucket)
    summary = emergency_summary(language, reason) if urgent else (symptom_bucket_summary(language, bucket) or default_text(language, "fallback_summary"))
    advice = emergency_advice(language, reason) if urgent else (symptom_bucket_advice(language, bucket, urgency) or symptom_specific_advice(language, specialty, lowered, urgency))
    likely_condition = symptom_bucket_likely_condition(language, bucket)

    return {
        "urgency": urgency,
        "specialty": specialty,
        "summary": summary,
        "advice": advice,
        "next_steps": next_steps,
        "follow_up_questions": follow_up_questions,
        "needs_more_detail": False,
        "likely_condition": likely_condition,
        "prevention_tips": [],
    }


def rapidapi_specialization(specialty: str) -> str:
    normalized = normalize_specialty(specialty)
    mapping = {
        "general practitioner": "general",
        "cardiologist": "cardiology",
        "neurologist": "neurology",
        "dermatologist": "dermatology",
        "pediatrician": "pediatrics",
        "psychiatrist": "psychiatry",
        "orthopedist": "orthopedics",
    }
    return mapping.get(normalized, "general")


def build_first_aid_message(message: str, language: str, urgency_level: str, specialty: str) -> str:
    language_name = LANG_MAP.get(language, "English")
    return (
        f"Patient symptoms: {message}\n"
        f"Language for reply: {language_name}.\n"
        f"Specialty focus: {specialty or 'general'}.\n"
        f"Assessed urgency: {urgency_level}.\n"
        "Your PRIMARY role is to provide a very brief, helpful response.\n"
        "Follow these rules STRICTLY:\n"
        "1. Give ONLY 1-2 short sentences of advice or first-aid.\n"
        "2. DO NOT use bullet points, lists, or multiple paragraphs.\n"
        "3. DO NOT include any other information besides the 1-2 sentences."
    )


def request_gemini_doctor(message: str, language: str, urgency_level: str, specialty: str) -> str:
    if genai is None or not GEMINI_API_KEY:
        return ""

    prompt = build_first_aid_message(message, language, urgency_level, specialty)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
    except Exception:
        return ""

    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()
    return ""


def extract_anthropic_reply(payload: object) -> str:
    if isinstance(payload, str):
        return payload.strip()

    if isinstance(payload, list):
        parts: List[str] = []
        for item in payload:
            text = extract_anthropic_reply(item)
            if text:
                parts.append(text)
        return "\n".join(parts).strip()

    if isinstance(payload, dict):
        for key in ("text", "content", "value"):
            value = payload.get(key)
            text = extract_anthropic_reply(value)
            if text:
                return text
        return ""

    text = getattr(payload, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()

    content = getattr(payload, "content", None)
    if content is not None:
        return extract_anthropic_reply(content)

    return ""


def request_anthropic_doctor(message: str, language: str, urgency_level: str, specialty: str) -> str:
    if Anthropic is None or not ANTHROPIC_API_KEY:
        return ""

    prompt = build_first_aid_message(message, language, urgency_level, specialty)

    try:
        client = Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=180,
            temperature=0.4,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )
    except Exception:
        return ""

    return extract_anthropic_reply(response)


def extract_rapidapi_reply(payload: object) -> str:
    if isinstance(payload, str):
        return payload.strip()

    if isinstance(payload, list):
        for item in payload:
            text = extract_rapidapi_reply(item)
            if text:
                return text
        return ""

    if isinstance(payload, dict):
        for key in (
            "response",
            "reply",
            "message",
            "output",
            "answer",
            "text",
            "result",
            "content",
        ):
            value = payload.get(key)
            text = extract_rapidapi_reply(value)
            if text:
                return text
    return ""


def request_rapidapi_doctor(message: str, language: str, urgency_level: str, specialty: str) -> str:
    if not RAPIDAPI_KEY:
        return ""

    payload = json.dumps(
        {
            "message": build_first_aid_message(message, language, urgency_level, specialty),
            "specialization": rapidapi_specialization(specialty),
            "language": language if language in LANG_MAP else "en",
        }
    )

    connection = http.client.HTTPSConnection(RAPIDAPI_HOST, timeout=45)
    try:
        connection.request(
            "POST",
            "/chat?noqueue=1",
            payload,
            {
                "x-rapidapi-host": RAPIDAPI_HOST,
                "x-rapidapi-key": RAPIDAPI_KEY,
                "Content-Type": "application/json",
            },
        )
        response = connection.getresponse()
        body = response.read().decode("utf-8", errors="ignore")
    except OSError:
        return ""
    finally:
        connection.close()

    if response.status >= 400:
        return ""

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return body.strip()

    return extract_rapidapi_reply(parsed)


def parse_translation_payload(raw_text: str, expected_count: int) -> List[str]:
    raw_text = raw_text.strip()
    if not raw_text:
        return []

    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            translations = parsed.get("translations", [])
        else:
            translations = parsed
        if isinstance(translations, list):
            normalized = [str(item).strip() for item in translations]
            if len(normalized) == expected_count:
                return normalized
    except json.JSONDecodeError:
        pass

    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(raw_text[start : end + 1])
            translations = parsed.get("translations", [])
            if isinstance(translations, list):
                normalized = [str(item).strip() for item in translations]
                if len(normalized) == expected_count:
                    return normalized
        except json.JSONDecodeError:
            return []

    return []


def request_anthropic_translation(texts: List[str], target_language: str) -> List[str]:
    if Anthropic is None or not ANTHROPIC_API_KEY or not texts:
        return []

    language_name = LANG_MAP.get(target_language, "English")
    payload = json.dumps({"texts": texts}, ensure_ascii=False)
    prompt = (
        f"Translate each string in the JSON payload into {language_name}.\n"
        "Return ONLY valid JSON with this exact shape: {\"translations\": [\"...\"]}\n"
        "Keep the same order, preserve meaning, and do not add explanations.\n"
        f"Payload: {payload}"
    )

    try:
        client = Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1200,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception:
        return []

    return parse_translation_payload(extract_anthropic_reply(response), len(texts))


def request_gemini_translation(texts: List[str], target_language: str) -> List[str]:
    if genai is None or not GEMINI_API_KEY or not texts:
        return []

    language_name = LANG_MAP.get(target_language, "English")
    payload = json.dumps({"texts": texts}, ensure_ascii=False)
    prompt = (
        f"Translate each string in the JSON payload into {language_name}.\n"
        "Return ONLY valid JSON with this exact shape: {\"translations\": [\"...\"]}\n"
        "Keep the same order, preserve meaning, and do not add explanations.\n"
        f"Payload: {payload}"
    )

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
    except Exception:
        return []

    text = getattr(response, "text", None)
    if not isinstance(text, str):
        return []
    return parse_translation_payload(text, len(texts))


def rank_doctors(doctors: List[models.Doctor], specialty: str, urgency_level: str) -> List[models.Doctor]:
    normalized = normalize_specialty(specialty)

    def score(doctor: models.Doctor) -> float:
        doctor_specialty = normalize_specialty(doctor.specialty)
        specialty_bonus = 2.5 if doctor_specialty == normalized else 0.0
        if urgency_level == "high":
            return specialty_bonus + (10 - min(doctor.distance, 10)) + doctor.rating
        return specialty_bonus + (doctor.rating * 1.5) + (5 - min(doctor.distance, 5))

    return sorted(doctors, key=score, reverse=True)


def localized_specialty_name(language: str, specialty: str) -> str:
    labels = {
        "en": {
            "general practitioner": "General Practitioner",
            "cardiologist": "Cardiologist",
            "neurologist": "Neurologist",
            "dermatologist": "Dermatologist",
            "pediatrician": "Pediatrician",
            "psychiatrist": "Psychiatrist",
            "orthopedist": "Orthopedist",
        },
        "ru": {
            "general practitioner": "Врач общей практики",
            "cardiologist": "Кардиолог",
            "neurologist": "Невролог",
            "dermatologist": "Дерматолог",
            "pediatrician": "Педиатр",
            "psychiatrist": "Психиатр",
            "orthopedist": "Ортопед",
        },
        "uz": {
            "general practitioner": "Umumiy amaliyot shifokori",
            "cardiologist": "Kardiolog",
            "neurologist": "Nevrolog",
            "dermatologist": "Dermatolog",
            "pediatrician": "Pediatr",
            "psychiatrist": "Psixiatr",
            "orthopedist": "Ortoped",
        },
    }
    lang = language if language in labels else "en"
    return labels[lang].get(specialty, specialty.title())


def facility_description(language: str, facility_type: str, specialty: str, location: str, rating: float) -> str:
    specialty_label = localized_specialty_name(language, specialty)
    texts = {
        "en": {
            "clinic": f"Good for {specialty_label.lower()} visits near {location}. Average patient rating is {rating:.1f}.",
            "hospital": f"Strong option for {specialty_label.lower()} care near {location} with a {rating:.1f} rating.",
        },
        "ru": {
            "clinic": f"Подходит для визита к {specialty_label.lower()} рядом с {location}. Средняя оценка пациентов {rating:.1f}.",
            "hospital": f"Надёжный вариант для помощи по направлению {specialty_label.lower()} рядом с {location}, рейтинг {rating:.1f}.",
        },
        "uz": {
            "clinic": f"{location} yaqinida {specialty_label.lower()} qabuliga mos klinika. Bemorlar reytingi {rating:.1f}.",
            "hospital": f"{location} yaqinida {specialty_label.lower()} yo'nalishi uchun kuchli shifoxona, reytingi {rating:.1f}.",
        },
    }
    lang = language if language in texts else "en"
    return texts[lang][facility_type]


def rank_facilities(facilities: List[dict], specialty: str, urgency_level: str) -> List[dict]:
    normalized = normalize_specialty(specialty)

    def score(item: dict) -> float:
        specialties = item.get("specialties", [])
        specialty_bonus = 2.5 if normalized in specialties else 0.0
        distance = float(item.get("distance", 0))
        rating = float(item.get("rating", 0))
        if urgency_level == "high":
            return specialty_bonus + (10 - min(distance, 10)) + rating
        return specialty_bonus + rating + (5 - min(distance, 5))

    return sorted(facilities, key=score, reverse=True)


def build_facility_recommendations(language: str, specialty: str, urgency_level: str, is_premium: bool) -> tuple[List[FacilitySchema], List[FacilitySchema]]:
    limit = 4 if is_premium else 2
    clinics = rank_facilities(FACILITY_CATALOG["clinics"], specialty, urgency_level)[:limit]
    hospitals = rank_facilities(FACILITY_CATALOG["hospitals"], specialty, urgency_level)[:limit]

    def to_schema(item: dict, facility_type: str) -> FacilitySchema:
        return FacilitySchema(
            id=int(item["id"]),
            name=str(item["name"]),
            facility_type=facility_type,
            specialty_focus=localized_specialty_name(language, specialty),
            rating=float(item["rating"]),
            location=str(item["location"]),
            distance=float(item["distance"]),
            reservation_fee=int(item["reservation_fee"]),
            description=facility_description(language, facility_type, specialty, str(item["location"]), float(item["rating"])),
        )

    return (
        [to_schema(item, "clinic") for item in clinics],
        [to_schema(item, "hospital") for item in hospitals],
    )


def apply_premium_limits(next_steps: List[str], follow_up_questions: List[str], is_premium: bool) -> tuple[List[str], List[str]]:
    if is_premium:
        return next_steps[:5], follow_up_questions[:3]
    return next_steps[:3], follow_up_questions[:2]


@app.post("/auth/signup", response_model=AuthResponse)
def signup(req: AuthRequest, db: Session = Depends(database.get_db)):
    username = normalize_username(req.username)
    email = (req.email or "").strip().lower()
    password = req.password.strip()

    if not username:
        raise HTTPException(status_code=400, detail="Enter a username.")
    if not is_valid_username(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-32 characters and use letters, numbers, dots, underscores, or dashes.",
        )
    if username in RESERVED_USERNAMES:
        raise HTTPException(status_code=409, detail="This username is reserved for admin access.")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")

    existing_user = db.query(models.User).filter(models.User.username == username).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="This username is already taken.")

    existing_email = db.query(models.User).filter(models.User.email == email).first()
    if existing_email:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = models.User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        is_premium=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthResponse(user=serialize_user(user))


@app.post("/auth/login", response_model=AuthResponse)
def login(req: AuthRequest, db: Session = Depends(database.get_db)):
    username = normalize_username(req.username)
    password = req.password.strip()

    if not username:
        raise HTTPException(status_code=400, detail="Enter your username.")

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    return AuthResponse(user=serialize_user(user))


@app.post("/auth/premium", response_model=AuthResponse)
def update_premium(req: PremiumUpdateRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.is_premium = req.is_premium
    db.commit()
    db.refresh(user)
    return AuthResponse(user=serialize_user(user))


@app.post("/doctor-auth/signup", response_model=DoctorAuthResponse)
def doctor_signup(req: DoctorAuthRequest, db: Session = Depends(database.get_db)):
    email = req.email.strip().lower()
    password = req.password.strip()
    name = (req.name or "").strip()
    specialty = normalize_specialty(req.specialty)
    location = (req.location or "MyDoctor Clinic").strip() or "MyDoctor Clinic"
    consultation_fee = req.consultation_fee or 0

    if not name:
        raise HTTPException(status_code=400, detail="Enter the doctor's full name.")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid doctor email address.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")
    if not (req.specialty or "").strip():
        raise HTTPException(status_code=400, detail="Enter the doctor's specialty.")
    if not (req.location or "").strip():
        raise HTTPException(status_code=400, detail="Enter the clinic location.")

    existing_doctor = db.query(models.Doctor).filter(models.Doctor.email == email).first()
    if existing_doctor:
        raise HTTPException(status_code=409, detail="A doctor account with this email already exists.")

    doctor = models.Doctor(
        name=name,
        email=email,
        password_hash=hash_password(password),
        specialty=specialty.title(),
        location=location,
        consultation_fee=consultation_fee,
        rating=5.0,
        distance=0.1,
        is_authorized=False,
    )
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return DoctorAuthResponse(doctor=serialize_doctor_user(doctor))


@app.post("/doctor-auth/login", response_model=DoctorAuthResponse)
def doctor_login(req: DoctorAuthRequest, db: Session = Depends(database.get_db)):
    email = req.email.strip().lower()
    password = req.password.strip()

    doctor = db.query(models.Doctor).filter(models.Doctor.email == email).first()
    if not doctor or not verify_password(password, doctor.password_hash):
        raise HTTPException(status_code=401, detail="Invalid doctor email or password.")

    return DoctorAuthResponse(doctor=serialize_doctor_user(doctor))


@app.post("/doctors/authorize", response_model=DoctorSchema)
def update_doctor_authorization(req: DoctorAuthorizationRequest, db: Session = Depends(database.get_db)):
    doctor = db.query(models.Doctor).filter(models.Doctor.id == req.doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    doctor.is_authorized = req.is_authorized
    db.commit()
    db.refresh(doctor)

    return DoctorSchema(
        id=doctor.id,
        name=doctor.name,
        specialty=doctor.specialty,
        is_authorized=doctor.is_authorized,
        rating=doctor.rating,
        location=doctor.location,
        distance=doctor.distance,
        consultation_fee=doctor.consultation_fee,
    )


def get_consultation_or_404(consultation_id: int, db: Session) -> models.Consultation:
    consultation = db.query(models.Consultation).filter(models.Consultation.id == consultation_id).first()
    if not consultation:
        raise HTTPException(status_code=404, detail="Consultation not found.")
    return consultation


def validate_consultation_access(
    consultation: models.Consultation,
    actor_type: str,
    actor_id: int,
    db: Session,
) -> tuple[models.Doctor, models.User]:
    actor = actor_type.strip().lower()
    if actor not in {"user", "doctor"}:
        raise HTTPException(status_code=400, detail="actor_type must be user or doctor.")

    if actor == "user" and consultation.user_id != actor_id:
        raise HTTPException(status_code=403, detail="This consultation does not belong to the user.")
    if actor == "doctor" and consultation.doctor_id != actor_id:
        raise HTTPException(status_code=403, detail="This consultation does not belong to the doctor.")

    doctor = db.query(models.Doctor).filter(models.Doctor.id == consultation.doctor_id).first()
    user = db.query(models.User).filter(models.User.id == consultation.user_id).first()
    if not doctor or not user:
        raise HTTPException(status_code=404, detail="Consultation participants not found.")
    return doctor, user


@app.post("/consultations", response_model=ConsultationSchema)
def create_consultation(req: ConsultationCreateRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    doctor = db.query(models.Doctor).filter(models.Doctor.id == req.doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found.")
    if not doctor.is_authorized:
        raise HTTPException(status_code=403, detail="Doctor is not authorized for recommendations yet.")

    consultation = (
        db.query(models.Consultation)
        .filter(models.Consultation.user_id == req.user_id)
        .filter(models.Consultation.doctor_id == req.doctor_id)
        .filter(models.Consultation.status == "open")
        .first()
    )

    if not consultation:
        consultation = models.Consultation(user_id=req.user_id, doctor_id=req.doctor_id, status="open")
        db.add(consultation)
        db.commit()
        db.refresh(consultation)

    messages = (
        db.query(models.ConsultationMessage)
        .filter(models.ConsultationMessage.consultation_id == consultation.id)
        .order_by(models.ConsultationMessage.created_at.asc(), models.ConsultationMessage.id.asc())
        .all()
    )
    return serialize_consultation(consultation, doctor, user, messages)


@app.get("/consultations/{consultation_id}", response_model=ConsultationSchema)
def get_consultation(
    consultation_id: int,
    actor_type: str,
    actor_id: int,
    db: Session = Depends(database.get_db),
):
    consultation = get_consultation_or_404(consultation_id, db)
    doctor, user = validate_consultation_access(consultation, actor_type, actor_id, db)
    messages = (
        db.query(models.ConsultationMessage)
        .filter(models.ConsultationMessage.consultation_id == consultation.id)
        .order_by(models.ConsultationMessage.created_at.asc(), models.ConsultationMessage.id.asc())
        .all()
    )
    return serialize_consultation(consultation, doctor, user, messages)


@app.post("/consultations/{consultation_id}/messages", response_model=ConsultationSchema)
def send_consultation_message(
    consultation_id: int,
    req: ConsultationMessageRequest,
    db: Session = Depends(database.get_db),
):
    consultation = get_consultation_or_404(consultation_id, db)
    doctor, user = validate_consultation_access(consultation, req.actor_type, req.actor_id, db)

    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    message = models.ConsultationMessage(
        consultation_id=consultation.id,
        sender_type=req.actor_type.strip().lower(),
        sender_id=req.actor_id,
        content=content,
    )
    db.add(message)
    db.flush()
    consultation.updated_at = func.now()
    db.commit()
    db.refresh(consultation)

    messages = (
        db.query(models.ConsultationMessage)
        .filter(models.ConsultationMessage.consultation_id == consultation.id)
        .order_by(models.ConsultationMessage.created_at.asc(), models.ConsultationMessage.id.asc())
        .all()
    )
    return serialize_consultation(consultation, doctor, user, messages)


@app.get("/doctor-consultations", response_model=List[ConsultationSchema])
def list_doctor_consultations(doctor_id: int, db: Session = Depends(database.get_db)):
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    consultations = (
        db.query(models.Consultation)
        .filter(models.Consultation.doctor_id == doctor_id)
        .order_by(models.Consultation.updated_at.desc(), models.Consultation.id.desc())
        .all()
    )

    serialized: List[ConsultationSchema] = []
    for consultation in consultations:
        user = db.query(models.User).filter(models.User.id == consultation.user_id).first()
        if not user:
            continue
        messages = (
            db.query(models.ConsultationMessage)
            .filter(models.ConsultationMessage.consultation_id == consultation.id)
            .order_by(models.ConsultationMessage.created_at.asc(), models.ConsultationMessage.id.asc())
            .all()
        )
        serialized.append(serialize_consultation(consultation, doctor, user, messages))

    return serialized


@app.get("/predict/metadata")
def predict_metadata(language: str = "en"):
    normalized_language = language if language in {"en", "uz"} else "en"
    symptoms = [
        {
            "key": symptom_key,
            "label": localize_label(SYMPTOM_LABELS, symptom_key, normalized_language),
        }
        for symptom_key in disease_prediction_service.feature_columns
    ]

    return {
        "symptoms": symptoms,
        "supported_languages": ["en", "uz"],
        "model_name": disease_prediction_service.model_name,
        "metrics": disease_prediction_service.metrics,
    }


@app.post("/predict", response_model=PredictResponse)
def predict_disease(req: PredictRequest):
    if not req.symptoms and not req.text.strip():
        raise HTTPException(status_code=400, detail="Provide at least one symptom or a free-text description.")

    normalized_language = req.language if req.language in {"en", "uz"} else "en"
    result = disease_prediction_service.predict(req.symptoms, req.text, normalized_language)
    return PredictResponse(**result)


@app.post("/translate", response_model=TranslateResponse)
def translate_texts(req: TranslateRequest):
    normalized_language = req.target_language if req.target_language in LANG_MAP else "en"
    cleaned_texts = [text.strip() for text in req.texts if text and text.strip()]

    if not cleaned_texts:
        return TranslateResponse(translations=[])

    translations = request_anthropic_translation(cleaned_texts, normalized_language)
    if not translations:
        translations = request_gemini_translation(cleaned_texts, normalized_language)
    if not translations:
        translations = cleaned_texts

    return TranslateResponse(translations=translations)


@app.post("/chat", response_model=ChatResponse)
def handle_chat(req: ChatRequest, db: Session = Depends(database.get_db)):
    print(f"[Chat] mode={TRIAGE_MODE} lang={req.language} premium={req.is_premium} msg={req.message[:80]}")

    if req.user_id:
        db.add(models.Message(user_id=req.user_id, role="user", content=req.message))
        db.commit()

    hard_urgent = is_emergency(req.message)
    hard_urgent_reason = emergency_reason(req.message)
    triage = heuristic_triage(req.message, req.language)
    needs_more_detail = bool(triage.get("needs_more_detail"))
    unsupported_specialty = detect_unsupported_specialty(req.message)

    raw_specialty = triage.get("specialty")
    specialty_extracted = "" if needs_more_detail or not raw_specialty else normalize_specialty(raw_specialty)
    urgency_level = str(triage.get("urgency", "low")).strip().lower()
    if urgency_level not in {"low", "medium", "high"}:
        urgency_level = "high" if hard_urgent else "low"

    is_urgent = hard_urgent or urgency_level == "high"
    if hard_urgent:
        urgency_level = "high"
        if hard_urgent_reason in {"trauma", "overdose", "pregnancy", "infant"} or not specialty_extracted:
            specialty_extracted = "general practitioner"

    summary = str(triage.get("summary", "")).strip() or default_text(req.language, "fallback_summary")
    advice = str(triage.get("advice", "")).strip() or default_text(req.language, "fallback_reply")
    likely_condition = str(triage.get("likely_condition", "")).strip()
    prediction_result = disease_prediction_service.predict([], req.message, req.language)
    predictions = prediction_result.get("predictions", [])
    if not likely_condition and specialty_extracted:
        likely_condition = likely_condition_text(req.language, specialty_extracted, hard_urgent_reason, is_urgent)
    if not likely_condition and predictions:
        likely_condition = str(predictions[0].get("disease", "")).strip()

    prevention_tips = triage.get("prevention_tips") or []
    if not prevention_tips and specialty_extracted:
        prevention_tips = prevention_tips_text(req.language, specialty_extracted, is_urgent)

    emergency_warning = emergency_advice(req.language, hard_urgent_reason) if is_urgent else ""
    next_steps = triage.get("next_steps") or []
    follow_up_questions = triage.get("follow_up_questions") or []
    if is_urgent:
        dispatch_steps = emergency_dispatch_steps(req.language, hard_urgent_reason)
        next_steps = dispatch_steps + [step for step in next_steps if step not in dispatch_steps]

    limit = 6 if req.is_premium else 2
    next_steps, follow_up_questions = apply_premium_limits(next_steps, follow_up_questions, req.is_premium)
    doctors_list: List[DoctorSchema] = []
    clinics_list: List[FacilitySchema] = []
    hospitals_list: List[FacilitySchema] = []
    no_matching_recommendation = False

    if unsupported_specialty and not is_urgent:
        specialty_extracted = ""
        summary = demo_unavailable_summary(req.language)
        advice = demo_unavailable_reply(req.language)
        likely_condition = ""
        prevention_tips = []
        next_steps = []
        follow_up_questions = []
        no_matching_recommendation = True
    elif specialty_extracted and not is_urgent:
        specialty_matches = (
            db.query(models.Doctor)
            .filter(models.Doctor.is_authorized.is_(True))
            .filter(models.Doctor.specialty.ilike(f"%{specialty_extracted}%"))
            .all()
        )

        if specialty_matches:
            ranked_doctors = rank_doctors(specialty_matches, specialty_extracted, urgency_level)[:limit]

            doctors_list = [
                DoctorSchema(
                    id=doctor.id,
                    name=doctor.name,
                    specialty=doctor.specialty,
                    is_authorized=doctor.is_authorized,
                    rating=doctor.rating,
                    location=doctor.location,
                    distance=doctor.distance,
                    consultation_fee=doctor.consultation_fee,
                )
                for doctor in ranked_doctors
            ]
            clinics_list, hospitals_list = build_facility_recommendations(
                req.language,
                specialty_extracted,
                urgency_level,
                req.is_premium,
            )
        else:
            summary = demo_unavailable_summary(req.language)
            advice = demo_unavailable_reply(req.language)
            likely_condition = ""
            prevention_tips = []
            next_steps = []
            follow_up_questions = []
            no_matching_recommendation = True

    reply = ""
    if not no_matching_recommendation:
        reply = request_anthropic_doctor(
            req.message,
            req.language,
            urgency_level,
            specialty_extracted or "general practitioner",
        )
        if not reply:
            reply = request_gemini_doctor(
                req.message,
                req.language,
                urgency_level,
                specialty_extracted or "general practitioner",
            )
        if not reply:
            reply = request_rapidapi_doctor(
                req.message,
                req.language,
                urgency_level,
                specialty_extracted or "general practitioner",
            )
    if not reply:
        reply = compose_reply(
            req.language,
            req.message,
            summary,
            advice,
            next_steps,
            follow_up_questions,
            is_urgent,
        )

    if req.user_id:
        db.add(models.Message(user_id=req.user_id, role="ai", content=reply))
        db.commit()

    return ChatResponse(
        reply=reply,
        summary=summary,
        likely_condition=likely_condition,
        predictions=[DiseasePredictionSchema(**prediction) for prediction in predictions],
        prevention_tips=prevention_tips,
        emergency_warning=emergency_warning,
        specialty=specialty_extracted or None,
        urgency_level=urgency_level,
        next_steps=next_steps,
        follow_up_questions=follow_up_questions,
        doctors=doctors_list,
        clinics=clinics_list,
        hospitals=hospitals_list,
        urgent=is_urgent,
    )


@app.get("/health")
def health():
    return {"status": "ok", "triage_mode": TRIAGE_MODE}
