# ── Stage 1: Builder ──────────────────────────────────────────────────────────
# Installs Python deps with no-cache to keep the layer lean.
# No TensorFlow — we use onnxruntime only (50 MB vs 1.2 GB).
FROM python:3.12-slim AS builder

WORKDIR /app

# Only libglib2.0-0 is needed at build time for opencv-python-headless
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY req.txt .
RUN pip install --no-cache-dir --prefix=/install -r req.txt


# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# Minimal runtime image — only what's needed to run the app.
# Render free tier: 512 MB RAM, 0.1 CPU.
FROM python:3.12-slim

WORKDIR /app

# Only runtime C libs needed by opencv-headless and onnxruntime
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source (includes the pre-converted .onnx model file)
# The .onnx file MUST be committed to git before building this image.
# Run scripts/convert_to_onnx.py on your dev machine first.
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Non-root user for security
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]