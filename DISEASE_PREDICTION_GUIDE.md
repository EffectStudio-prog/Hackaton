# AI Disease Prediction System

## Overview
This implementation adds a beginner-friendly but scalable disease prediction workflow to the project:

- Structured symptom input via checkbox-style selection
- Unstructured text input with NLP-based symptom extraction
- Top-3 disease predictions with probabilities
- Confidence visualization
- Explainable AI reasons
- Saved local prediction history
- Uzbek + English support
- FastAPI `/predict` API endpoint

Medical safety note:
`This is not a medical diagnosis. Always consult a licensed clinician.`

## Suggested Public Datasets
These are realistic public sources you can use when you want to grow beyond the bundled demo dataset:

1. Kaggle: Disease Prediction Using Machine Learning
   Link: https://www.kaggle.com/datasets/kaushil268/disease-prediction-using-machine-learning
   Why use it:
   Binary symptom matrix with 132 symptom columns and 42 prognosis classes. Good for first-pass supervised classification.

2. Kaggle: Prognosis Disease Symptoms
   Link: https://www.kaggle.com/datasets/noeyislearning/disease-prediction-based-on-symptoms
   Why use it:
   Similar symptom-to-disease structure with a permissive CC0 license, helpful for demos and classroom-friendly prototypes.

3. PhysioNet: MIMIC-IV-ED
   Link: https://www.physionet.org/content/mimic-iv-ed/2.2/
   Why use it:
   Real emergency department data with triage, vitals, medications, and diagnosis fields. Better for production-grade risk models, though it needs much heavier preprocessing and compliance review.

4. PhysioNet: MIMIC-IV-Ext-MDS-ED
   Link: https://www.physionet.org/content/multimodal-emergency-benchmark/
   Why use it:
   More advanced benchmark for diagnosis and deterioration prediction using multimodal emergency data.

Inference:
The Kaggle datasets are better for a symptom-checkbox MVP, while the PhysioNet datasets are stronger candidates for future clinical-grade modeling.

## Current Folder Structure
```text
backend/
  artifacts/
    .gitkeep
  data/
    symptom_disease_dataset.csv
  disease_prediction.py
  train_disease_model.py
  main.py
  requirements.txt
frontend/
  src/
    components/
      DiseasePredictorPage.tsx
```

## Data Pipeline
### Bundled demo dataset
The project now includes a compact CSV:

- File: `backend/data/symptom_disease_dataset.csv`
- Format: one row per patient pattern
- Target column: `disease`
- Feature columns: binary symptom indicators

### Preprocessing steps
The training code in `backend/disease_prediction.py` does the following:

1. Normalizes column names to snake_case
2. Fills missing values with `0`
3. Casts symptom columns to binary integer values
4. Label-encodes the disease target
5. Splits train/test using stratified sampling
6. Applies a `SimpleImputer(strategy="most_frequent")` inside the training pipeline

### Handling missing values
- Dataset blanks are converted to `0` for this MVP
- During training, `SimpleImputer` protects the model from missing binary features
- In a larger clinical dataset, you should distinguish between:
  - symptom absent
  - symptom unknown
  - symptom not asked

### Symptom normalization
- User-selected symptoms are normalized to canonical keys
- Free text is processed with synonym matching
- English and Uzbek symptom aliases are supported

## Model Choice
### Chosen model
`RandomForestClassifier`

### Why Random Forest is a good fit here
- Works well on tabular binary symptom features
- Handles nonlinear symptom interactions
- Produces class probabilities
- Gives feature importances for explainability
- Easy to retrain and maintain
- More forgiving than logistic regression on small heterogeneous datasets

## Training and Evaluation
Training script:
```bash
python -m backend.train_disease_model
```

Saved artifacts:
- `backend/artifacts/disease_model.joblib`
- `backend/artifacts/disease_model_metadata.json`

Tracked metrics:
- Accuracy
- Precision (macro)
- Recall (macro)
- F1 score (macro)

If ML dependencies are not installed yet, the system still responds using a safe fallback similarity scorer derived from the dataset profiles. That keeps the UI usable while preserving a clean upgrade path to the trained model.

## NLP Layer
Free-text input is supported through simple keyword and synonym extraction.

Current approach:
- Regex-friendly string matching
- English + Uzbek symptom aliases
- Canonical symptom mapping

Example:
- Input: `I have fever, cough, and I cannot smell well`
- Extracted symptoms:
  - `fever`
  - `cough`
  - `loss_of_taste_smell`

Scalable upgrade options:
- TF-IDF + linear classifier for symptom phrase detection
- Clinical NER models
- Transformer-based biomedical encoders

## Backend API
### `GET /predict/metadata`
Returns:
- available symptoms
- model name
- metrics
- supported languages

### `POST /predict`
Input example:
```json
{
  "symptoms": ["fever", "cough"],
  "text": "I also lost my sense of smell yesterday",
  "language": "en"
}
```

Output example:
```json
{
  "input_symptoms": ["Fever", "Cough", "Loss of taste or smell"],
  "input_symptom_keys": ["cough", "fever", "loss_of_taste_smell"],
  "extracted_symptoms": ["Loss of taste or smell"],
  "predictions": [
    {
      "disease_key": "covid_19",
      "disease": "COVID-19",
      "probability": 72.4,
      "confidence": "high",
      "reasons": [
        "Matched symptom pattern: Fever, Cough, Loss of taste or smell"
      ]
    }
  ],
  "model": {
    "name": "Random Forest",
    "metrics": {
      "accuracy": 0.91
    },
    "uses_fallback": false
  },
  "disclaimer": "This is not a medical diagnosis. Always consult a licensed clinician."
}
```

## Frontend
The prediction page provides:

- Structured symptom selection
- Free-text symptom description
- Top-3 ranked disease cards
- Confidence bars
- Explainable reasons
- Local history persistence
- Uzbek + English labels

## Explainable AI
Each prediction includes simple, understandable reasons:

- symptom overlap with disease profile
- top matching symptoms
- feature-importance-driven symptom cues when a trained model exists

This is intentionally lightweight and human-readable rather than opaque.

## Save User History
Prediction requests are stored in browser local storage:
- key: `mydoctor-disease-prediction-history`

That makes the feature easy to demo without changing the existing SQL schema.

## Setup Instructions
### Backend
```bash
cd backend
pip install -r requirements.txt
python -m backend.train_disease_model
uvicorn backend.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Deployment
### Render
1. Create a new Web Service for the FastAPI backend
2. Build command:
   `pip install -r backend/requirements.txt`
3. Start command:
   `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. Deploy the frontend separately as a static site or Vite app

### Railway
1. Connect the repo
2. Set backend root or monorepo build commands
3. Install backend dependencies
4. Run `python -m backend.train_disease_model` during build if you want the artifact pre-generated
5. Start with Uvicorn

### AWS
Recommended path:
- Backend: ECS/Fargate or Elastic Beanstalk
- Frontend: S3 + CloudFront
- Model artifact: store in EFS, S3, or bake into the image

## Recommended Next Improvements
1. Replace keyword extraction with a proper clinical NER pipeline
2. Add more diverse datasets and stronger class balancing
3. Store prediction history in the backend for multi-device sync
4. Add doctor review workflow for unsafe predictions
5. Introduce threshold-based escalation for emergency symptoms
