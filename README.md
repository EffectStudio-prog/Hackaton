# MyDoctor 🩺

> Rule-based symptom triage assistant — reviews symptoms and recommends nearby doctors.  
> **Hackathon-ready MVP** · FastAPI + React · EN/RU/UZ

---

## ⚡ Quick Start (Recommended)

**Step 1 — Run the one-click setup script:**

Open PowerShell **as Administrator** in the `Hackaton` folder, then run:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup_and_run.ps1
```

This script will automatically:
- Install Python 3.12 (if not present)
- Install Node.js 20 (if not present)
- Create a Python virtual environment
- Install all Python and Node dependencies
- Seed the database with 11 sample doctors
- Launch the backend (port 8000) and frontend (port 5173)
- Open the app in your browser

---

## 🔧 Manual Setup (if you already have Python & Node)

### Backend

```powershell
# From the Hackaton folder:
python -m venv venv
.\venv\Scripts\activate
pip install -r backend/requirements.txt
python -m backend.seed
uvicorn backend.main:app --reload --port 8000
```

### Frontend (separate terminal)

```powershell
cd frontend
npm install
npm run dev
```

---

## 🌐 URLs

| Service     | URL                          |
|-------------|------------------------------|
| App         | http://localhost:5173         |
| API         | http://localhost:8000         |
| API Docs    | http://localhost:8000/docs    |
| Health      | http://localhost:8000/health  |

---

## ✨ Features

| Feature           | Details                                      |
|-------------------|----------------------------------------------|
| 🩺 Triage         | Grounded symptom-safety rules                |
| 🌍 Languages      | English, Russian, Uzbek (auto-detect + toggle)|
| 🚨 Emergency      | Rule-based red-flag detection → red alert banner |
| 👤 Guest mode     | 3 recommended doctors                        |
| ⭐ Premium mode   | 10 recommended doctors (click toggle)        |
| 🌙 Dark mode      | Toggle in header                             |
| 💬 Suggestions    | Quick-reply chips on welcome screen          |
| 📋 Typing dot     | Animated indicator while triage is processed |

---

## 🎯 Demo Tips

- Click **👤 Guest** in the header to toggle between Guest (3 doctors) and Premium (10 doctors)
- Click the **🌐 Globe** to switch language
- Test **emergency**: type *"I have severe chest pain and can't breathe"* → red alert appears
- Test **multilingual**: type your symptoms in Russian or Uzbek
- The triage assistant responds in the selected language

---

## 📁 Project Structure

```
Hackaton/
├── backend/
│   ├── __init__.py
│   ├── main.py          ← FastAPI app + /chat endpoint
│   ├── models.py        ← SQLAlchemy models
│   ├── database.py      ← SQLite connection
│   ├── seed.py          ← Seed doctors data
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx            ← Root layout, dark mode, language
│   │   ├── i18n.ts            ← EN / RU / UZ translations
│   │   ├── index.css          ← Tailwind + custom styles
│   │   └── components/
│   │       ├── ChatBox.tsx        ← Chat logic + API calls
│   │       ├── MessageBubble.tsx  ← User / assistant message bubbles
│   │       ├── DoctorCard.tsx     ← Doctor recommendation cards
│   │       └── AlertBanner.tsx    ← Emergency alert
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── setup_and_run.ps1    ← One-click launch script
└── README.md
```
