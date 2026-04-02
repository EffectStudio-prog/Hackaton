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

from . import database, models


app = FastAPI(title="MyDoctor Triage API", version="1.1.0")
models.Base.metadata.create_all(bind=database.engine)


def ensure_schema() -> None:
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


ensure_schema()

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


class ChatResponse(BaseModel):
    reply: str
    summary: str = ""
    likely_condition: str = ""
    prevention_tips: List[str] = Field(default_factory=list)
    emergency_warning: str = ""
    specialty: Optional[str] = None
    urgency_level: str = "low"
    next_steps: List[str] = Field(default_factory=list)
    follow_up_questions: List[str] = Field(default_factory=list)
    doctors: List[DoctorSchema] = Field(default_factory=list)
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

SPECIALTY_HINTS = {
    "cardiologist": [
        "chest pain", "pressure in chest", "palpitations", "rapid heartbeat",
        "heart", "ko'krak", "болит сердце", "боль в груди", "yurak",
    ],
    "neurologist": [
        "headache", "migraine", "dizziness", "numbness", "seizure",
        "vision loss", "confusion", "stroke", "голов", "онем", "bosh", "boshim", "kalla", "kallam",
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
    "seizure", "passed out", "severe bleeding",
    "боль в груди", "инфаркт", "трудно дышать", "не могу дышать",
    "кровотечение", "инсульт", "потерял сознание", "судороги",
    "ko'krak og'rig'i", "ko'kragim og'riyapti", "nafas ololmayapman", "nafasim qisilyapti", "qon ketyapti",
    "hushini yo'qotdi", "talvasa", "insult",
]

EMERGENCY_PATTERNS = {
    "breathing": [
        "can't breathe", "cannot breathe", "not breathing", "difficulty breathing",
        "shortness of breath", "gasping", "turning blue", "choking",
        "не могу дышать", "трудно дышать", "не дышит", "задыхаюсь",
        "nafas ololmayapman", "nafas qisilishi", "nafasim qisilyapti", "nafasim qisildi", "bo'g'ilib qoldi",
    ],
    "cardiac": [
        "chest pain", "heart attack", "pressure in chest", "crushing chest pain",
        "pain spreading to arm", "jaw pain with chest pain",
        "боль в груди", "инфаркт", "давит в груди",
        "ko'krak og'rig'i", "ko'kragim og'riyapti", "yurak xuruji",
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
        "sudden collapse",
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
    "высокая температура", "рвота", "сильная боль", "ухудшается",
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
    "bel", "bo'g'im", "siydik", "siyganda", "achish", "holsiz", "charch", "yurak", "ko'krak",
]

VAGUE_INPUT_HINTS = [
    "help", "need help", "what should i do", "i am sick", "i feel sick", "not well",
    "feel bad", "feeling bad", "maslahat", "yordam", "nima qilay", "kasalman",
    "o'zimni yomon his qilyapman", "yaxshi emasman", "ahvolim yomon", "simptom yo'q",
]

SYMPTOM_BUCKET_HINTS = {
    "cardiac": [
        "chest pain", "pressure in chest", "palpitations", "rapid heartbeat", "heart",
        "ko'krak", "ko'krag", "yurak",
    ],
    "headache": [
        "headache", "migraine", "dizziness", "numbness", "vision loss", "confusion",
        "bosh", "kalla", "karaxt", "ko'rish",
    ],
    "skin": [
        "rash", "itch", "itching", "itchy", "hives", "skin", "eczema", "acne",
        "toshma", "qich", "teri",
    ],
    "child": [
        "child", "baby", "infant", "toddler", "daughter", "son", "farzand",
        "bola", "chaqaloq",
    ],
    "mental_health": [
        "panic", "anxiety", "depressed", "depression", "self harm", "can't sleep",
        "stress", "vahima", "xavotir", "tushkun", "uyqu yo'q",
    ],
    "back": [
        "back pain", "joint", "ankle", "fracture", "sprain", "knee", "bone", "neck pain",
        "bel", "belim", "bo'g'im", "oyoq", "suyak", "jarohat",
    ],
    "stomach": [
        "stomach", "abdomen", "nausea", "vomit", "vomiting", "diarrhea", "constipation",
        "abdominal", "qorin", "oshqozon", "ko'ngil ayn", "qus", "ich ket", "ich qot",
    ],
    "urinary": [
        "urine", "urination", "burning when i pee", "pain when i pee", "frequent urination",
        "bladder", "siydik", "siyganda", "siyish", "tez-tez siyish", "achish", "achishish",
    ],
    "cold_flu": [
        "cold", "flu", "cough", "runny nose", "sore throat", "congestion", "sneezing",
        "shamoll", "gripp", "yo'tal", "burun oq", "tomoq", "tumov",
    ],
    "fever": [
        "fever", "temperature", "high temp", "hot body", "isitma", "harorat",
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


def extract_duration_category(lowered: str) -> Optional[str]:
    if re.search(r"\b\d+\s*(month|months|year|years|oy|oydan|yil|yildan)\b", lowered):
        return "long"
    if re.search(r"\b\d+\s*(week|weeks|hafta|haftadan)\b", lowered):
        return "weeks"
    if re.search(r"\b\d+\s*(day|days|kun|kundan)\b", lowered):
        return "days"

    if contains_any(lowered, ["month", "months", "year", "years", "oy", "yil"]):
        return "long"
    if contains_any(lowered, ["week", "weeks", "hafta"]):
        return "weeks"
    if contains_any(lowered, ["day", "days", "today", "yesterday", "kun", "bugun", "kecha"]):
        return "days"
    return None


def extract_severity_level(lowered: str, score: Optional[int], urgency: str) -> Optional[str]:
    severe_hints = [
        "severe", "intense", "worst", "unbearable", "qattiq", "kuchli", "chidab bo'lmaydi",
        "сил", "сильн", "резк",
    ]
    mild_hints = [
        "mild", "slight", "light", "yengil", "biroz", "ozroq", "небольш",
    ]

    if score is not None:
        if score >= 8:
            return "severe"
        if score >= 4:
            return "moderate"
        return "mild"

    if contains_any(lowered, severe_hints) or urgency == "high":
        return "severe"
    if urgency == "medium":
        return "moderate"
    if contains_any(lowered, mild_hints):
        return "mild"
    return None


def contextualize_summary(language: str, base_summary: str, severity_level: Optional[str], duration_category: Optional[str]) -> str:
    extras = {
        "en": {
            "severity": {
                "mild": "The description sounds milder right now.",
                "moderate": "The description suggests a moderate level of symptoms.",
                "severe": "The description suggests stronger symptoms.",
            },
            "duration": {
                "days": "It also sounds like this has been going on for at least part of the day or several days.",
                "weeks": "It also sounds like this has been going on for weeks.",
                "long": "It also sounds like this has been ongoing for a longer time.",
            },
        },
        "uz": {
            "severity": {
                "mild": "Ta'rifga ko'ra belgi hozircha yengilroq ko'rinadi.",
                "moderate": "Ta'rifga ko'ra belgi o'rtacha darajada ko'rinadi.",
                "severe": "Ta'rifga ko'ra belgi kuchliroq ko'rinadi.",
            },
            "duration": {
                "days": "Bu kamida bir necha soat yoki bir necha kundan beri davom etayotganga o'xshaydi.",
                "weeks": "Bu bir necha haftadan beri davom etayotganga o'xshaydi.",
                "long": "Bu ancha uzoq davom etayotgan holatga o'xshaydi.",
            },
        },
    }

    lang = language if language in extras else "en"
    parts = [base_summary.strip()]

    severity_text = extras[lang]["severity"].get(severity_level or "", "")
    duration_text = extras[lang]["duration"].get(duration_category or "", "")

    if severity_text:
        parts.append(severity_text)
    if duration_text:
        parts.append(duration_text)

    return " ".join(part for part in parts if part).strip()


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
    if any(keyword in lowered for keyword in EMERGENCY_KEYWORDS):
        return True

    matched_groups = 0
    for patterns in EMERGENCY_PATTERNS.values():
        if any(pattern in lowered for pattern in patterns):
            matched_groups += 1

    return matched_groups > 0


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


def emergency_advice(language: str, reason: Optional[str]) -> str:
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


def symptom_specific_advice(language: str, specialty: str, lowered: str, urgency: str) -> str:
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


def heuristic_triage(message: str, language: str) -> dict:
    lowered = normalize_text(message)
    if needs_more_symptom_details(lowered):
        return detail_request_payload(language)

    urgent = is_emergency(lowered)
    reason = emergency_reason(lowered)
    urgency = "high" if urgent else "low"
    severity_score = extract_severity_score(lowered)
    duration_category = extract_duration_category(lowered)

    if not urgent and (any(hint in lowered for hint in MEDIUM_URGENCY_HINTS) or (severity_score is not None and severity_score >= 7)):
        urgency = "medium"

    specialty = "general practitioner"
    for candidate, hints in SPECIALTY_HINTS.items():
        if any(hint in lowered for hint in hints):
            specialty = candidate
            break

    bucket = detect_symptom_bucket(lowered, specialty)
    specialty = BUCKET_TO_SPECIALTY.get(bucket, specialty)

    next_steps = symptom_specific_steps(language, specialty, lowered, urgency)
    if urgency == "high":
        next_steps = [default_text(language, "urgent_step"), *next_steps]

    follow_up_questions = symptom_follow_up_questions(language, bucket)
    severity_level = extract_severity_level(lowered, severity_score, urgency)
    summary = emergency_summary(language, reason) if urgent else contextualize_summary(
        language,
        symptom_bucket_summary(language, bucket) or default_text(language, "fallback_summary"),
        severity_level,
        duration_category,
    )
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


def rank_doctors(doctors: List[models.Doctor], specialty: str, urgency_level: str) -> List[models.Doctor]:
    normalized = normalize_specialty(specialty)

    def score(doctor: models.Doctor) -> float:
        doctor_specialty = normalize_specialty(doctor.specialty)
        specialty_bonus = 2.5 if doctor_specialty == normalized else 0.0
        if urgency_level == "high":
            return specialty_bonus + (10 - min(doctor.distance, 10)) + doctor.rating
        return specialty_bonus + (doctor.rating * 1.5) + (5 - min(doctor.distance, 5))

    return sorted(doctors, key=score, reverse=True)


def apply_premium_limits(next_steps: List[str], follow_up_questions: List[str], is_premium: bool) -> tuple[List[str], List[str]]:
    if is_premium:
        return next_steps[:4], follow_up_questions[:3]
    return next_steps[:2], follow_up_questions[:1]


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

    raw_specialty = triage.get("specialty")
    specialty_extracted = "" if needs_more_detail or not raw_specialty else normalize_specialty(raw_specialty)
    urgency_level = str(triage.get("urgency", "low")).strip().lower()
    if urgency_level not in {"low", "medium", "high"}:
        urgency_level = "high" if hard_urgent else "low"

    summary = str(triage.get("summary", "")).strip() or default_text(req.language, "fallback_summary")
    advice = shorten_advice(str(triage.get("advice", "")).strip() or default_text(req.language, "fallback_reply"))
    next_steps = triage.get("next_steps") or []
    follow_up_questions = triage.get("follow_up_questions") or []

    is_urgent = hard_urgent or urgency_level == "high"
    if hard_urgent:
        summary = emergency_summary(req.language, hard_urgent_reason)
        advice = shorten_advice(emergency_advice(req.language, hard_urgent_reason))
        urgency_level = "high"
        specialty_extracted = "general practitioner" if hard_urgent_reason in {"trauma", "overdose", "pregnancy", "infant"} else specialty_extracted
        follow_up_questions = []
    if is_urgent and default_text(req.language, "urgent_step") not in next_steps:
        next_steps = [default_text(req.language, "urgent_step"), *next_steps]

    limit = 6 if req.is_premium else 2
    next_steps, follow_up_questions = apply_premium_limits(next_steps, follow_up_questions, req.is_premium)
    likely_condition = str(triage.get("likely_condition", "")).strip()
    if not likely_condition and specialty_extracted:
        likely_condition = likely_condition_text(req.language, specialty_extracted, hard_urgent_reason, is_urgent)

    prevention_tips = triage.get("prevention_tips") or []
    if not prevention_tips and specialty_extracted:
        prevention_tips = prevention_tips_text(req.language, specialty_extracted, is_urgent)

    emergency_warning = emergency_advice(req.language, hard_urgent_reason) if is_urgent else ""
    doctors_list: List[DoctorSchema] = []

    if specialty_extracted:
        specialty_matches = (
            db.query(models.Doctor)
            .filter(models.Doctor.is_authorized.is_(True))
            .filter(models.Doctor.specialty.ilike(f"%{specialty_extracted}%"))
            .all()
        )

        if not specialty_matches:
            specialty_matches = (
                db.query(models.Doctor)
                .filter(models.Doctor.is_authorized.is_(True))
                .filter(models.Doctor.specialty.ilike("%general practitioner%"))
                .all()
            )

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

    reply = advice

    if req.user_id:
        db.add(models.Message(user_id=req.user_id, role="ai", content=reply))
        db.commit()

    return ChatResponse(
        reply=reply,
        summary=summary,
        likely_condition=likely_condition,
        prevention_tips=prevention_tips,
        emergency_warning=emergency_warning,
        specialty=specialty_extracted or None,
        urgency_level=urgency_level,
        next_steps=next_steps,
        follow_up_questions=follow_up_questions,
        doctors=doctors_list,
        urgent=is_urgent,
    )


@app.get("/health")
def health():
    return {"status": "ok", "triage_mode": TRIAGE_MODE}
