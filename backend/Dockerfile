# ── Stage 1: Builder ──────────────────────────────────────────────────────────
# Install heavy ML dependencies in a separate layer so they are cached
FROM python:3.12-slim AS builder

WORKDIR /app

# System packages required for OpenCV, TensorFlow, face libs
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender-dev \
        libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

COPY req.txt .
RUN pip install --no-cache-dir --prefix=/install -r req.txt


# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Runtime system libs (no build tools needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender-dev \
        libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Non-root user for security
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Start Uvicorn (no --reload in production)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]