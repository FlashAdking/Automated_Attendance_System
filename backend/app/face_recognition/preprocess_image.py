# File: preprocess_image.py
"""
Robust face preprocessing pipeline for FaceNet 512-D.

Key improvements over naive crop+resize:
1. Face alignment  — uses MTCNN eye landmarks to rotate the face so both
                     eyes are perfectly horizontal before embedding.
                     This is the single biggest accuracy booster for FaceNet.
2. Margin padding  — adds 20 % of face size around the bounding box so
                     FaceNet sees forehead/chin context (reduces border artefacts).
3. Confidence gate — skips MTCNN detections with confidence < 0.90 to
                     avoid embedding blurry/partial faces.
4. Safe cropping   — clamps coordinates to image bounds.
5. Format agnostic — uses np.fromfile + cv2.imdecode so WebP/PNG/JPEG
                     all decode correctly regardless of OS path characters.
"""

import cv2
import math
import numpy as np

FACE_CONFIDENCE_THRESHOLD = 0.90   # skip weak MTCNN detections
FACE_MARGIN_RATIO = 0.20           # 20 % margin around bounding box
TARGET_SIZE = (160, 160)           # FaceNet input size

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


# ─────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────

def _load_bgr(image_path: str):
    """Load image robustly (handles spaces, Unicode, WebP/PNG)."""
    raw = np.fromfile(image_path, dtype=np.uint8)
    img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    return img


def _align_face(img_bgr: np.ndarray, left_eye, right_eye) -> np.ndarray:
    """
    Rotate the image so the line joining both eyes is perfectly horizontal.
    Returns the rotated full image (same size as input).
    """
    lx, ly = left_eye
    rx, ry = right_eye

    # Angle between eye midpoints and horizontal axis
    dy = ry - ly
    dx = rx - lx
    angle = math.degrees(math.atan2(dy, dx))

    # Centre of rotation = midpoint between eyes
    eye_cx = int((lx + rx) / 2)
    eye_cy = int((ly + ry) / 2)

    M = cv2.getRotationMatrix2D((eye_cx, eye_cy), angle, scale=1.0)
    h, w = img_bgr.shape[:2]
    return cv2.warpAffine(img_bgr, M, (w, h), flags=cv2.INTER_LINEAR)


def _expand_box(x, y, w, h, img_w, img_h, margin: float = FACE_MARGIN_RATIO):
    """Add a percentage-based margin around an MTCNN bounding box."""
    pad_x = int(w * margin)
    pad_y = int(h * margin)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(img_w, x + w + pad_x)
    y2 = min(img_h, y + h + pad_y)
    return x1, y1, x2, y2


# ─────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────

def extract_and_prepare_faces(image_path: str, mtcnn_detector):
    """
    Detect all faces in image_path, align + crop each one, and return
    160×160 RGB arrays ready for FaceNet.

    Returns:
        prepared_faces : list of (160,160,3) float32 RGB arrays
        bounding_boxes : list of (x, y, w, h) ints (original box, no margin)
    """
    img_bgr = _load_bgr(image_path)
    if img_bgr is None:
        print(f"[preprocess] Could not load: {image_path}")
        return [], []

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    detections = mtcnn_detector.detect_faces(img_rgb)

    prepared_faces = []
    bounding_boxes = []
    h_img, w_img = img_bgr.shape[:2]

    for det in detections:
        # ── confidence gate ───────────────────────────────────────
        if det.get("confidence", 1.0) < FACE_CONFIDENCE_THRESHOLD:
            continue

        x, y, w, h = det["box"]
        x, y = abs(x), abs(y)           # MTCNN can return negative coords

        # ── align using eye landmarks ─────────────────────────────
        keypoints = det.get("keypoints", {})
        left_eye  = keypoints.get("left_eye")
        right_eye = keypoints.get("right_eye")

        if left_eye and right_eye:
            aligned_bgr = _align_face(img_bgr, left_eye, right_eye)
            aligned_rgb = cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2RGB)
        else:
            aligned_rgb = img_rgb   # fallback: no alignment

        # ── padded crop ───────────────────────────────────────────
        x1, y1, x2, y2 = _expand_box(x, y, w, h, w_img, h_img)
        face_crop = aligned_rgb[y1:y2, x1:x2]

        if face_crop.shape[0] < 20 or face_crop.shape[1] < 20:
            continue    # too small to be useful

        # ── resize to FaceNet input size ──────────────────────────
        face_resized = cv2.resize(face_crop, TARGET_SIZE, interpolation=cv2.INTER_LANCZOS4)

        prepared_faces.append(face_resized)
        bounding_boxes.append((x, y, w, h))

    return prepared_faces, bounding_boxes


def draw_boxes_on_faces(image_path: str, mtcnn_detector, output_path=None) -> str:
    """
    Detect faces and draw clean bounding boxes (uses same confidence gate).
    Returns path to the saved annotated image.
    """
    raw = np.fromfile(image_path, dtype=np.uint8)
    img_bgr = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError(f"Could not load image: {image_path}")

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    detections = mtcnn_detector.detect_faces(img_rgb)

    for det in detections:
        if det.get("confidence", 1.0) < FACE_CONFIDENCE_THRESHOLD:
            continue
        x, y, w, h = det["box"]
        cv2.rectangle(img_bgr, (x, y), (x + w, y + h), (0, 220, 100), 3)

    if output_path is None:
        output_path = image_path.replace(".jpg", "_boxed.jpg")

    cv2.imwrite(output_path, img_bgr)
    return output_path
