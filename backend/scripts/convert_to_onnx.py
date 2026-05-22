"""
convert_to_onnx.py
──────────────────────────────────────────────────────────────
One-time offline conversion: facenet_embedder_model.h5 → facenet_embedder_model.onnx

Run this ONCE on your dev machine (which has tensorflow installed):
    python scripts/convert_to_onnx.py

Then commit the generated .onnx file to the repo (or upload to a model store).
After this, you can drop tensorflow-cpu from req.txt entirely.

Requirements for this script only (not for production):
    pip install tensorflow tf2onnx
"""

import os
import tensorflow as tf
import tf2onnx
import numpy as np

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H5_PATH    = os.path.join(BASE_DIR, "app", "face_recognition", "ML_models", "facenet_embedder_model.h5")
ONNX_PATH  = os.path.join(BASE_DIR, "app", "face_recognition", "ML_models", "facenet_embedder_model.onnx")

# ── Custom objects (identical to face_utils.py) ───────────────────────────────
def scaling(x, scale=1.0 / 255):
    return x * scale

def l2_normalize(x, axis=None, epsilon=1e-12):
    return tf.math.l2_normalize(x, axis=axis, epsilon=epsilon)

# ── Load .h5 ──────────────────────────────────────────────────────────────────
print(f"Loading model from: {H5_PATH}")
model = tf.keras.models.load_model(
    H5_PATH,
    custom_objects={"scaling": scaling, "l2_normalize": l2_normalize},
)
print(f"Model input shape : {model.input_shape}")
print(f"Model output shape: {model.output_shape}")

# ── Verify with a dummy forward pass ─────────────────────────────────────────
dummy = np.zeros((1, 160, 160, 3), dtype=np.float32)
out   = model.predict(dummy, verbose=0)
print(f"Dummy forward pass output shape: {out.shape}  ✓")

# ── Convert to ONNX ───────────────────────────────────────────────────────────
print(f"\nConverting to ONNX → {ONNX_PATH}")
input_signature = [tf.TensorSpec(shape=(None, 160, 160, 3), dtype=tf.float32, name="input")]

model_proto, _ = tf2onnx.convert.from_keras(
    model,
    input_signature=input_signature,
    opset=13,           # opset 13 is broadly supported by onnxruntime
    output_path=ONNX_PATH,
)

size_mb = os.path.getsize(ONNX_PATH) / 1024 / 1024
print(f"\n✅ Saved: {ONNX_PATH}  ({size_mb:.1f} MB)")
print("   You can now remove tensorflow-cpu from req.txt and use onnxruntime instead.")
