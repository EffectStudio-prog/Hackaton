# Vercel Deployment

This project can run on Vercel with:

- `frontend/` as the Vite frontend
- `backend/` as the FastAPI backend
- an external PostgreSQL database for production

## 1. Required environment variables

Set these in Vercel Project Settings:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
GEMINI_API_KEY=your_gemini_api_key_here
AUTO_SEED_DOCTORS=true
CLEAR_LEGACY_AI_MESSAGES=false
```

Optional for local frontend testing against a hosted backend:

```bash
VITE_API_BASE_URL=https://your-project.vercel.app/_/backend
```

## 2. Why PostgreSQL instead of SQLite

Vercel Functions are ephemeral, so local SQLite files like `medmap.db` are not reliable in production.
Use a hosted database such as:

- Neon
- Supabase Postgres
- Railway Postgres
- Render Postgres

## 3. Backend behavior

The backend now:

- uses `DATABASE_URL` automatically when it is provided
- falls back to local SQLite for development
- seeds demo doctors automatically on an empty database
- avoids SQLite-only `PRAGMA` migrations on PostgreSQL
- exposes `backend/app.py` so Vercel can discover the FastAPI app cleanly

## 4. Deploy flow

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Keep `vercel.json` in the repo root.
4. Add the environment variables above.
5. Deploy.

## 5. Local run

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

If you use a virtual environment on Windows:

```powershell
.\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```
