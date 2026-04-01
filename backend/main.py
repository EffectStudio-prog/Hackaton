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
        "vision loss", "confusion", "stroke", "голов", "онем", "bosh",
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
        "knee", "bone", "neck pain", "спина", "сустав", "oyoq",
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
    "ko'krak og'rig'i", "nafas ololmayapman", "qon ketyapti",
    "hushini yo'qotdi", "talvasa", "insult",
]

EMERGENCY_PATTERNS = {
    "breathing": [
        "can't breathe", "cannot breathe", "not breathing", "difficulty breathing",
        "shortness of breath", "gasping", "turning blue", "choking",
        "не могу дышать", "трудно дышать", "не дышит", "задыхаюсь",
        "nafas ololmayapman", "nafas qisilishi", "bo'g'ilib qoldi",
    ],
    "cardiac": [
        "chest pain", "heart attack", "pressure in chest", "crushing chest pain",
        "pain spreading to arm", "jaw pain with chest pain",
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
    "isitma", "qusish", "qattiq og'riq", "yomonlashyapti",
]

TRIAGE_MODE = "grounded_rules"


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


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
    urgent = is_emergency(lowered)
    reason = emergency_reason(lowered)
    urgency = "high" if urgent else "low"

    if not urgent and any(hint in lowered for hint in MEDIUM_URGENCY_HINTS):
        urgency = "medium"

    specialty = "general practitioner"
    for candidate, hints in SPECIALTY_HINTS.items():
        if any(hint in lowered for hint in hints):
            specialty = candidate
            break

    next_steps = []
    if urgency == "high":
        next_steps.append(default_text(language, "urgent_step"))
    elif urgency == "medium":
        next_steps.append(default_text(language, "same_day_step"))
    else:
        next_steps.append(default_text(language, "routine_step"))

    follow_up_questions = [
        default_text(language, "question_duration"),
        default_text(language, "question_severity"),
        default_text(language, "question_red_flags"),
    ]

    return {
        "urgency": urgency,
        "specialty": specialty,
        "summary": emergency_summary(language, reason) if urgent else default_text(language, "fallback_summary"),
        "advice": emergency_advice(language, reason) if urgent else default_text(language, "fallback_reply"),
        "next_steps": next_steps,
        "follow_up_questions": follow_up_questions,
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

    specialty_extracted = normalize_specialty(triage.get("specialty"))
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
        specialty=specialty_extracted,
        urgency_level=urgency_level,
        next_steps=next_steps,
        follow_up_questions=follow_up_questions,
        doctors=doctors_list,
        urgent=is_urgent,
    )


@app.get("/health")
def health():
    return {"status": "ok", "triage_mode": TRIAGE_MODE}
