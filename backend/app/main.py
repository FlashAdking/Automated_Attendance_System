from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import os
import uvicorn

from app.logger import logger
from app.middleware.rate_limiter import limiter
from app.routes.admin import router as admin_router
from app.routes.student import router as student_router

load_dotenv()

app = FastAPI(title="AttendSnap API", description="Automated Attendance System using Face Recognition")

# ── Rate Limiter ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# ─────────────────────────────────────────────────────────────────────────────

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow the Vite dev server (and any localhost port during development).
# For production, replace allow_origins with your actual frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", ""),      # e.g. https://attendsnap.vercel.app
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ──────────────────────────────────────────────────────────────────────────────

app.include_router(admin_router)
app.include_router(student_router)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up AttendSnap application...")

@app.get("/")
def read_root():
    logger.info("Root endpoint accessed")
    return {"message": "Welcome to AttendSnap API"}

if __name__ == "__main__":
    uvicorn.run(app, host="localhost", port=8000, reload=True)