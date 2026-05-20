from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
import shutil
import os
import base64
import numpy as np
import cv2
from tempfile import NamedTemporaryFile
from typing import List
from app.logger import logger
from app.middleware.auth import verify_token
from app.database import get_user_db
from app.models.user_db import UserDB

router = APIRouter(prefix="/api/student", tags=["Student"])


# ── Public Student Self-Service Endpoint ────────────────────────────────────
@router.post("/lookup")
async def student_lookup(
    prn: str,
    dob: str,
    db: UserDB = Depends(get_user_db),
):
    """
    Student self-service: verify identity by PRN + Date of Birth.
    Returns student profile + attendance history (no admin auth needed).
    DOB must match exactly as stored (YYYY-MM-DD).
    """
    logger.info(f"Student self-lookup for PRN: {prn}")
    student = await db.find_user_by_prn(prn)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Verify DOB as lightweight identity check
    stored_dob = student.get("dob", "")
    if stored_dob != dob:
        raise HTTPException(status_code=401, detail="PRN and Date of Birth do not match")

    # Strip internal fields
    student.pop("_id", None)
    student.pop("image_embeddings", None)

    # Compute summary
    history = student.get("attendance", [])
    total = len(history)
    present = sum(1 for r in history if r.get("status") == "present")
    absent = total - present
    percentage = round((present / total) * 100, 2) if total > 0 else 0.0

    return {
        "prn": student["prn"],
        "name": student.get("name"),
        "class": student.get("class"),
        "div": student.get("div"),
        "email": student.get("email"),
        "contact": student.get("contact"),
        "gender": student.get("gender"),
        "image_link": student.get("image_link", ""),
        "summary": {
            "total_sessions": total,
            "present_count": present,
            "absent_count": absent,
            "attendance_percentage": percentage,
        },
        "history": history,
    }




def euclidean_distance(a: np.ndarray, b: np.ndarray) -> float:
    """L2 (Euclidean) distance between two FaceNet 512-D embedding vectors.
    Lower = more similar. Same-person threshold: <= 1.0.
    """
    return float(np.linalg.norm(a - b))


def distance_to_confidence(distance: float) -> float:
    """Convert Euclidean distance to 0-100 confidence score."""
    return round(100.0 / (1.0 + distance), 2)


def encode_image_to_base64(img_bgr: np.ndarray) -> str:
    """Encode a BGR numpy image to a data-URI JPEG base64 string."""
    _, buffer = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
    b64 = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def crop_face_from_image(img_bgr: np.ndarray, box: tuple, padding: int = 10) -> np.ndarray:
    """Crop a face from the image using the bounding box with optional padding."""
    x, y, w, h = box
    h_img, w_img = img_bgr.shape[:2]
    x1 = max(0, x - padding)
    y1 = max(0, y - padding)
    x2 = min(w_img, x + w + padding)
    y2 = min(h_img, y + h + padding)
    return img_bgr[y1:y2, x1:x2]


def build_query_embedding(portrait_paths: list, get_image_embeddings, facenet_model, mtcnn_detector) -> tuple:
    """
    Build a single robust query embedding from 1 or more portrait photos.

    Strategy:
    - Extract the first (most prominent) face from each portrait image.
    - L2-normalise every individual embedding.
    - Average all embeddings together and L2-normalise the result.

    Averaging across multiple angles/lighting conditions produces a centroid
    in embedding space that is closer to all views of the same person,
    reducing false negatives caused by pose or lighting variance.

    Returns:
        (query_embedding, portrait_face_b64)  — the averaged embedding and
        a base64-encoded crop of the face from the first portrait.
    """
    all_embeddings = []
    first_face_b64 = None

    for i, path in enumerate(portrait_paths):
        embs = get_image_embeddings(path, facenet_model, mtcnn_detector)
        if not embs:
            continue

        # Use the most prominent face detected in this portrait
        box, emb, _ = embs[0]
        # L2-normalise before averaging (direction matters more than magnitude)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm
        all_embeddings.append(emb)

        # Keep a crop from the first portrait for display
        if i == 0 and first_face_b64 is None:
            img_bgr = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
            if img_bgr is not None:
                crop = crop_face_from_image(img_bgr, box)
                first_face_b64 = encode_image_to_base64(crop)

    if not all_embeddings:
        return None, None

    # Average and re-normalise → centroid embedding
    mean_emb = np.mean(all_embeddings, axis=0)
    norm = np.linalg.norm(mean_emb)
    if norm > 0:
        mean_emb = mean_emb / norm

    return mean_emb.astype(np.float32), first_face_b64


@router.get("/attendance/summary/{prn}")
async def get_attendance_summary(
    prn: str,
    db: UserDB = Depends(get_user_db),
):
    logger.info(f"Student {prn} fetching attendance summary")
    student = await db.find_user_by_prn(prn)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    attendance_records = student.get("attendance", [])
    
    total = len(attendance_records)
    present = sum(1 for r in attendance_records if r.get("status") == "present")
    absent = sum(1 for r in attendance_records if r.get("status") == "absent")
    
    percentage = round((present / total) * 100, 2) if total > 0 else 0.0
    
    return {
        "prn": prn,
        "name": student.get("name"),
        "total_sessions": total,
        "present_count": present,
        "absent_count": absent,
        "attendance_percentage": percentage
    }


@router.get("/attendance/history/{prn}")
async def get_attendance_history(
    prn: str,
    db: UserDB = Depends(get_user_db),
):
    logger.info(f"Student {prn} fetching detailed attendance history")
    student = await db.find_user_by_prn(prn)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    return {
        "prn": prn,
        "name": student.get("name"),
        "history": student.get("attendance", [])
    }


@router.post("/trial")
async def public_trial_face_recognition(
    portraits: List[UploadFile] = File(..., description="1 or 2 portrait/selfie images (different angles → better accuracy)"),
    group_photos: List[UploadFile] = File(..., description="1 or 2 group photos to search in"),
):
    """
    Public trial demo endpoint.

    Accepts:
      - 1–2 portrait images  (multiple angles produce an averaged embedding for robustness)
      - 1–2 group photos     (all faces extracted from all photos and compared)

    Pipeline:
      1. Portrait  → MTCNN detect → FaceNet embed → L2-normalise → average across portraits
      2. Each group photo → MTCNN detect all faces → FaceNet embed all
      3. Compare query embedding against every group face via Euclidean distance
      4. Annotate the best group photo and return all results

    No images are stored on disk.
    """
    logger.info("Public trial face recognition accessed")

    if len(portraits) > 2:
        raise HTTPException(status_code=400, detail="Maximum 2 portrait images allowed.")
    if len(group_photos) > 2:
        raise HTTPException(status_code=400, detail="Maximum 2 group photos allowed.")

    import app.face_recognition.face_utils as fu
    fu.load_models()

    from app.face_recognition.genrate_embedings import get_image_embeddings

    temp_files: list = []

    def save_temp(upload: UploadFile) -> str:
        ext = os.path.splitext(upload.filename or "")[1].lower() or ".jpg"
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            ext = ".jpg"
        tmp = NamedTemporaryFile(delete=False, suffix=ext)
        shutil.copyfileobj(upload.file, tmp)
        tmp.close()
        temp_files.append(tmp.name)
        return tmp.name

    try:
        # ── 1. Build averaged query embedding from all portrait images ────────
        portrait_paths = [save_temp(p) for p in portraits]

        query_embedding, portrait_face_b64 = build_query_embedding(
            portrait_paths, get_image_embeddings, fu.facenet_model, fu.mtcnn_detector
        )

        if query_embedding is None:
            raise HTTPException(
                status_code=400,
                detail="No face detected in any of the portrait images."
            )

        # ── 2. Process all group photos ───────────────────────────────────────
        best_group_embs = []
        best_group_img_bgr = None
        max_faces_seen = -1
        all_group_results = []

        for gp in group_photos:
            gp_path = save_temp(gp)
            gp_embs = get_image_embeddings(gp_path, fu.facenet_model, fu.mtcnn_detector)
            gp_img_bgr = cv2.imdecode(np.fromfile(gp_path, dtype=np.uint8), cv2.IMREAD_COLOR)

            if len(gp_embs) > max_faces_seen:
                max_faces_seen = len(gp_embs)
                best_group_embs = gp_embs
                best_group_img_bgr = gp_img_bgr.copy()

            for (box, emb, _) in gp_embs:
                dist = euclidean_distance(query_embedding, emb)
                conf = distance_to_confidence(dist)
                crop_bgr = crop_face_from_image(gp_img_bgr, box)
                all_group_results.append({
                    "box": box,
                    "distance": dist,
                    "confidence": conf,
                    "crop_bgr": crop_bgr,
                })

        if max_faces_seen <= 0:
            raise HTTPException(status_code=400, detail="No faces detected in the group photos.")

        # ── 3. Find best match ────────────────────────────────────────────────
        MATCH_THRESHOLD = 1.0
        all_group_results.sort(key=lambda r: r["distance"])

        best_match = all_group_results[0]
        person_found = best_match["distance"] <= MATCH_THRESHOLD

        # ── 4. Annotate best group image ──────────────────────────────────────
        annotated = best_group_img_bgr.copy()
        for (box, emb, _) in best_group_embs:
            x, y, w, h = box
            dist = euclidean_distance(query_embedding, emb)
            is_match = dist <= MATCH_THRESHOLD
            color = (0, 220, 100) if is_match else (180, 180, 180)
            thickness = 3 if is_match else 2
            cv2.rectangle(annotated, (x, y), (x + w, y + h), color, thickness)

        annotated_b64 = encode_image_to_base64(annotated)

        # ── 5. Build face cards ───────────────────────────────────────────────
        face_cards = [
            {
                "confidence": r["confidence"],
                "distance": round(r["distance"], 4),
                "is_match": r["distance"] <= MATCH_THRESHOLD,
                "face_b64": encode_image_to_base64(r["crop_bgr"]),
            }
            for r in all_group_results[:8]
        ]

        return JSONResponse({
            "person_found": person_found,
            "best_confidence": best_match["confidence"],
            "best_distance": round(best_match["distance"], 4),
            "portraits_used": len(portrait_paths),
            "faces_in_group": max_faces_seen,
            "portrait_face_b64": portrait_face_b64,
            "annotated_group_b64": annotated_b64,
            "face_cards": face_cards,
        })

    finally:
        for p in temp_files:
            if os.path.exists(p):
                os.unlink(p)
