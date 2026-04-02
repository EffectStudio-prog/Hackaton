from __future__ import annotations

import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    import joblib
    import pandas as pd
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.metrics import accuracy_score, classification_report, f1_score, precision_score, recall_score
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import LabelEncoder
except ImportError:  # pragma: no cover - optional until ML deps are installed
    joblib = None
    pd = None
    ColumnTransformer = None
    RandomForestClassifier = None
    SimpleImputer = None
    accuracy_score = None
    classification_report = None
    f1_score = None
    precision_score = None
    recall_score = None
    train_test_split = None
    Pipeline = None
    LabelEncoder = None


BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "data" / "symptom_disease_dataset.csv"
ARTIFACT_DIR = BASE_DIR / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "disease_model.joblib"
METADATA_PATH = ARTIFACT_DIR / "disease_model_metadata.json"

MEDICAL_DISCLAIMER = "This is not a medical diagnosis. Always consult a licensed clinician."

SYMPTOM_LABELS: Dict[str, Dict[str, str]] = {
    "fever": {"en": "Fever", "uz": "Isitma"},
    "cough": {"en": "Cough", "uz": "Yo'tal"},
    "sore_throat": {"en": "Sore throat", "uz": "Tomoq og'rig'i"},
    "runny_nose": {"en": "Runny nose", "uz": "Burun oqishi"},
    "headache": {"en": "Headache", "uz": "Bosh og'rig'i"},
    "fatigue": {"en": "Fatigue", "uz": "Holsizlik"},
    "nausea": {"en": "Nausea", "uz": "Ko'ngil aynishi"},
    "vomiting": {"en": "Vomiting", "uz": "Qusish"},
    "diarrhea": {"en": "Diarrhea", "uz": "Ich ketishi"},
    "abdominal_pain": {"en": "Abdominal pain", "uz": "Qorin og'rig'i"},
    "chest_pain": {"en": "Chest pain", "uz": "Ko'krak og'rig'i"},
    "shortness_of_breath": {"en": "Shortness of breath", "uz": "Nafas qisishi"},
    "rash": {"en": "Rash", "uz": "Toshma"},
    "itchy_skin": {"en": "Itchy skin", "uz": "Teri qichishi"},
    "joint_pain": {"en": "Joint pain", "uz": "Bo'g'im og'rig'i"},
    "dizziness": {"en": "Dizziness", "uz": "Bosh aylanishi"},
    "loss_of_taste_smell": {"en": "Loss of taste or smell", "uz": "Ta'm yoki hid yo'qolishi"},
    "frequent_urination": {"en": "Frequent urination", "uz": "Tez-tez siyish"},
    "increased_thirst": {"en": "Increased thirst", "uz": "Chanqash kuchayishi"},
}

SYMPTOM_SYNONYMS: Dict[str, List[str]] = {
    "fever": ["fever", "temperature", "high temperature", "isitma", "harorat"],
    "cough": ["cough", "coughing", "yo'tal", "yotal"],
    "sore_throat": ["sore throat", "throat pain", "tomoq og'rig'i", "tomoq ogrigi"],
    "runny_nose": ["runny nose", "stuffy nose", "burun oqishi", "burun bitishi"],
    "headache": ["headache", "migraine", "bosh og'rig'i", "bosh ogrigi"],
    "fatigue": ["fatigue", "tired", "weakness", "holsizlik", "charchoq"],
    "nausea": ["nausea", "queasy", "ko'ngil aynishi", "kongil aynishi"],
    "vomiting": ["vomit", "vomiting", "qusish"],
    "diarrhea": ["diarrhea", "loose stool", "ich ketishi"],
    "abdominal_pain": ["abdominal pain", "stomach pain", "belly pain", "qorin og'rig'i", "qorin ogrigi"],
    "chest_pain": ["chest pain", "ko'krak og'rig'i", "kokrak ogrigi"],
    "shortness_of_breath": [
        "shortness of breath",
        "can't breathe",
        "breathless",
        "difficult breathing",
        "nafas qisishi",
        "nafas yetmasligi",
        "nafas olish qiyin",
        "nafas olishim qiyin",
        "nafas olish qiyinlashdi",
    ],
    "rash": ["rash", "red spots", "toshma"],
    "itchy_skin": ["itching", "itchy skin", "qichishish", "teri qichishi"],
    "joint_pain": ["joint pain", "body ache", "bo'g'im og'rig'i", "bogim ogrigi"],
    "dizziness": ["dizziness", "lightheaded", "bosh aylanishi"],
    "loss_of_taste_smell": ["loss of taste", "loss of smell", "can't smell", "taste loss", "hid yo'qolishi", "tam yo'qolishi"],
    "frequent_urination": ["frequent urination", "urinate often", "tez-tez siyish"],
    "increased_thirst": ["increased thirst", "very thirsty", "chanqash", "ko'p suv ichish"],
}

DISEASE_LABELS: Dict[str, Dict[str, str]] = {
    "asthma": {"en": "Asthma", "uz": "Astma"},
    "common_cold": {"en": "Common cold", "uz": "Shamollash"},
    "covid_19": {"en": "COVID-19", "uz": "COVID-19"},
    "dermatitis": {"en": "Dermatitis", "uz": "Dermatit"},
    "food_poisoning": {"en": "Food poisoning", "uz": "Ovqatdan zaharlanish"},
    "gastroenteritis": {"en": "Gastroenteritis", "uz": "Gastroenterit"},
    "influenza": {"en": "Influenza", "uz": "Gripp"},
    "migraine": {"en": "Migraine", "uz": "Migren"},
    "type_2_diabetes": {"en": "Type 2 diabetes", "uz": "2-tip diabet"},
    "urinary_tract_infection": {"en": "Urinary tract infection", "uz": "Siydik yo'li infeksiyasi"},
}


def localize_label(mapping: Dict[str, Dict[str, str]], key: str, language: str) -> str:
    lang = language if language in {"en", "uz"} else "en"
    return mapping.get(key, {}).get(lang) or mapping.get(key, {}).get("en") or key.replace("_", " ").title()


def normalize_symptom_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def load_dataset_rows() -> List[Dict[str, str]]:
    with DATASET_PATH.open("r", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def available_symptoms() -> List[str]:
    if not DATASET_PATH.exists():
      return list(SYMPTOM_LABELS.keys())
    rows = load_dataset_rows()
    if not rows:
        return list(SYMPTOM_LABELS.keys())
    return [column for column in rows[0].keys() if column != "disease"]


def extract_symptoms_from_text(text: str) -> List[str]:
    lowered = text.lower()
    detected: List[str] = []
    for symptom, aliases in SYMPTOM_SYNONYMS.items():
        if any(alias in lowered for alias in aliases):
            detected.append(symptom)
    return detected


def build_feature_vector(symptoms: List[str]) -> Dict[str, int]:
    symptom_set = {normalize_symptom_name(symptom) for symptom in symptoms}
    return {
        symptom: int(symptom in symptom_set)
        for symptom in available_symptoms()
    }


def compute_fallback_profiles(rows: List[Dict[str, str]]) -> Dict[str, Dict[str, float]]:
    grouped: Dict[str, Dict[str, List[int]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        disease = row["disease"]
        for symptom, raw_value in row.items():
            if symptom == "disease":
                continue
            grouped[disease][symptom].append(int(raw_value or 0))

    profiles: Dict[str, Dict[str, float]] = {}
    for disease, symptom_values in grouped.items():
        profiles[disease] = {
            symptom: (sum(values) / len(values) if values else 0.0)
            for symptom, values in symptom_values.items()
        }
    return profiles


class DiseasePredictionService:
    def __init__(self) -> None:
        self.model = None
        self.label_encoder = None
        self.feature_columns = available_symptoms()
        self.feature_importances: Dict[str, float] = {}
        self.metrics: Dict[str, float] = {}
        self.model_name = "Random Forest"
        self.dataset_rows = load_dataset_rows() if DATASET_PATH.exists() else []
        self.fallback_profiles = compute_fallback_profiles(self.dataset_rows) if self.dataset_rows else {}
        self._load_artifacts_if_available()

    def _load_artifacts_if_available(self) -> None:
        if not MODEL_PATH.exists() or not METADATA_PATH.exists() or not joblib:
            return
        try:
            artifact = joblib.load(MODEL_PATH)
            metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        except Exception:
            return

        self.model = artifact.get("model")
        self.label_encoder = artifact.get("label_encoder")
        self.feature_columns = metadata.get("feature_columns", self.feature_columns)
        self.feature_importances = metadata.get("feature_importances", {})
        self.metrics = metadata.get("metrics", {})
        self.model_name = metadata.get("model_name", self.model_name)

    def predict(self, symptoms: List[str], text: Optional[str] = None, language: str = "en") -> Dict[str, object]:
        cleaned_symptoms = [normalize_symptom_name(symptom) for symptom in symptoms if normalize_symptom_name(symptom) in self.feature_columns]
        extracted = extract_symptoms_from_text(text or "")
        merged_symptoms = sorted(set(cleaned_symptoms + extracted))
        vector = build_feature_vector(merged_symptoms)

        if self.model and pd is not None and self.label_encoder is not None:
            frame = pd.DataFrame([vector], columns=self.feature_columns)
            probabilities = self.model.predict_proba(frame)[0]
            class_labels = self.label_encoder.inverse_transform(range(len(probabilities)))
            ranked = sorted(zip(class_labels, probabilities), key=lambda item: item[1], reverse=True)[:3]
        else:
            ranked = self._fallback_predict(vector)[:3]

        predictions = [
            {
                "disease_key": disease_key,
                "disease": localize_label(DISEASE_LABELS, disease_key, language),
                "probability": round(float(probability) * 100, 2),
                "confidence": self._confidence_bucket(probability),
                "reasons": self._build_explanations(disease_key, merged_symptoms, language),
            }
            for disease_key, probability in ranked
        ]

        return {
            "input_symptoms": [localize_label(SYMPTOM_LABELS, symptom, language) for symptom in merged_symptoms],
            "input_symptom_keys": merged_symptoms,
            "extracted_symptoms": [localize_label(SYMPTOM_LABELS, symptom, language) for symptom in extracted],
            "predictions": predictions,
            "model": {
                "name": self.model_name,
                "metrics": self.metrics,
                "uses_fallback": self.model is None,
            },
            "disclaimer": MEDICAL_DISCLAIMER,
        }

    def _fallback_predict(self, vector: Dict[str, int]) -> List[Tuple[str, float]]:
        if not self.fallback_profiles:
            return [("common_cold", 0.34), ("influenza", 0.33), ("covid_19", 0.33)]

        raw_scores: List[Tuple[str, float]] = []
        active_count = max(sum(vector.values()), 1)
        for disease, profile in self.fallback_profiles.items():
            overlap = sum(profile.get(symptom, 0.0) for symptom, active in vector.items() if active)
            penalty = sum(profile.get(symptom, 0.0) for symptom, active in vector.items() if not active) * 0.05
            score = max((overlap / active_count) - penalty, 0.001)
            raw_scores.append((disease, score))

        total = sum(score for _, score in raw_scores) or 1.0
        normalized = [(disease, score / total) for disease, score in raw_scores]
        return sorted(normalized, key=lambda item: item[1], reverse=True)

    def _build_explanations(self, disease_key: str, merged_symptoms: List[str], language: str) -> List[str]:
        reasons: List[str] = []
        profile = self.fallback_profiles.get(disease_key, {})
        important_symptoms = sorted(profile.items(), key=lambda item: item[1], reverse=True)[:5]
        overlap = [symptom for symptom, _ in important_symptoms if symptom in merged_symptoms]

        if overlap:
            reasons.append(
                {
                    "en": "Matched symptom pattern: " + ", ".join(localize_label(SYMPTOM_LABELS, symptom, "en") for symptom in overlap),
                    "uz": "Mos tushgan belgilar: " + ", ".join(localize_label(SYMPTOM_LABELS, symptom, "uz") for symptom in overlap),
                }["uz" if language == "uz" else "en"]
            )

        ranked_features = sorted(
            ((symptom, self.feature_importances.get(symptom, 0.0)) for symptom in merged_symptoms),
            key=lambda item: item[1],
            reverse=True,
        )
        top_features = [symptom for symptom, importance in ranked_features if importance > 0][:2]
        if top_features:
            reasons.append(
                {
                    "en": "High-impact symptoms for this prediction: "
                    + ", ".join(localize_label(SYMPTOM_LABELS, symptom, "en") for symptom in top_features),
                    "uz": "Bu taxmin uchun muhim belgilar: "
                    + ", ".join(localize_label(SYMPTOM_LABELS, symptom, "uz") for symptom in top_features),
                }["uz" if language == "uz" else "en"]
            )

        if not reasons:
            reasons.append(
                {
                    "en": "Prediction is based on overall similarity between the reported symptoms and learned disease patterns.",
                    "uz": "Taxmin kiritilgan belgilar va o‘rganilgan kasallik naqshlari o‘rtasidagi umumiy o‘xshashlikka asoslangan.",
                }["uz" if language == "uz" else "en"]
            )
        return reasons

    @staticmethod
    def _confidence_bucket(probability: float) -> str:
        if probability >= 0.65:
            return "high"
        if probability >= 0.4:
            return "medium"
        return "low"


def train_and_save_model(dataset_path: Path = DATASET_PATH, artifact_dir: Path = ARTIFACT_DIR) -> Dict[str, object]:
    if not all([pd, joblib, Pipeline, RandomForestClassifier, LabelEncoder, train_test_split, SimpleImputer]):
        raise RuntimeError("Training dependencies are not installed. Install backend/requirements.txt first.")

    dataframe = pd.read_csv(dataset_path)
    dataframe.columns = [normalize_symptom_name(column) for column in dataframe.columns]
    dataframe = dataframe.fillna(0)

    disease_column = "disease"
    feature_columns = [column for column in dataframe.columns if column != disease_column]
    for column in feature_columns:
        dataframe[column] = dataframe[column].astype(int)

    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(dataframe[disease_column])
    X = dataframe[feature_columns]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        random_state=42,
        stratify=y,
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("binary", Pipeline(steps=[("imputer", SimpleImputer(strategy="most_frequent"))]), feature_columns)
        ]
    )

    classifier = RandomForestClassifier(
        n_estimators=300,
        max_depth=10,
        min_samples_leaf=1,
        class_weight="balanced",
        random_state=42,
    )

    model = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", classifier),
        ]
    )

    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    metrics = {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision_macro": round(float(precision_score(y_test, y_pred, average="macro", zero_division=0)), 4),
        "recall_macro": round(float(recall_score(y_test, y_pred, average="macro", zero_division=0)), 4),
        "f1_macro": round(float(f1_score(y_test, y_pred, average="macro", zero_division=0)), 4),
    }

    trained_classifier = model.named_steps["classifier"]
    feature_importances = {
        feature_columns[index]: round(float(importance), 6)
        for index, importance in enumerate(trained_classifier.feature_importances_)
    }

    artifact_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {"model": model, "label_encoder": label_encoder},
        MODEL_PATH,
    )
    METADATA_PATH.write_text(
        json.dumps(
            {
                "model_name": "Random Forest",
                "feature_columns": feature_columns,
                "feature_importances": feature_importances,
                "metrics": metrics,
                "classification_report": classification_report(y_test, y_pred, output_dict=True, zero_division=0),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return {
        "metrics": metrics,
        "feature_columns": feature_columns,
        "saved_model": str(MODEL_PATH),
        "saved_metadata": str(METADATA_PATH),
    }


service = DiseasePredictionService()
