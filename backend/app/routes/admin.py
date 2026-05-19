from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from app.logger import logger
from app.middleware.auth import create_access_token, verify_token
from app.models.admin_db import AdminDB
from app.models.user_db import UserDB
from app.models.attendance_db import AttendanceDB
from app.database import get_admin_db, get_user_db, get_attendance_db
from app.face_recognition.face_utils import process_student_image, process_multiple_group_photos
from app.utils.cloudinary_helper import upload_image_to_cloudinary
from app.utils.email_utils import send_attendance_emails_bulk, send_attendance_email
from pydantic import BaseModel
from typing import List
import numpy as np
import bcrypt
import os

router = APIRouter(prefix="/api/admin", tags=["Admin"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def validate_image(file: UploadFile):
    """Raise 400 if the uploaded file is not an allowed image format."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    content_type = (file.content_type or "").lower()
    if ext not in ALLOWED_EXTENSIONS and content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.filename}'. Allowed: .jpg .jpeg .png .webp"
        )

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

@router.post("/login")
async def login(credentials: LoginRequest, db: AdminDB = Depends(get_admin_db)):
    logger.info(f"Admin login attempt for email: {credentials.email}")
    admin = await db.find_admin_by_email(credentials.email)

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    stored_hash = admin.get("password", "")

    # Support both bcrypt-hashed passwords and legacy plaintext (migrate on first login)
    try:
        password_valid = bcrypt.checkpw(
            credentials.password.encode("utf-8"),
            stored_hash.encode("utf-8") if isinstance(stored_hash, str) else stored_hash
        )
    except Exception:
        # Fallback: plaintext comparison for pre-bcrypt accounts
        password_valid = (stored_hash == credentials.password)
        if password_valid:
            # Silently migrate to hashed password
            new_hash = bcrypt.hashpw(credentials.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            await db.collection.update_one({"email": credentials.email}, {"$set": {"password": new_hash}})
            logger.info(f"Migrated plaintext password to bcrypt for {credentials.email}")

    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(data={"sub": credentials.email, "role": "admin"})
    logger.info("Admin logged in successfully")
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register", status_code=201)
async def register(payload: RegisterRequest, db: AdminDB = Depends(get_admin_db)):
    """Register a new admin account (password stored as bcrypt hash)."""
    logger.info(f"Admin registration attempt for email: {payload.email}")

    existing = await db.find_admin_by_email(payload.email)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An admin with this email already exists."
        )

    # Hash the password with bcrypt before storing
    hashed_pw = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    admin_data = {
        "name": payload.name,
        "email": payload.email,
        "password": hashed_pw,
        "group_photos_user": [],
    }
    await db.collection.insert_one(admin_data)
    logger.info(f"Admin registered successfully: {payload.email}")

    access_token = create_access_token(data={"sub": payload.email, "role": "admin"})
    return {"message": "Admin registered successfully", "access_token": access_token, "token_type": "bearer"}

@router.post("/students")
async def add_student(
    name: str = Form(...),
    prn: str = Form(...),
    academic_class: str = Form(..., alias="class"),
    div: str = Form(...),
    dob: str = Form(...),
    contact: str = Form(...),
    email: str = Form(...),
    gender: str = Form(...),
    image: UploadFile = File(...),
    admin_data: dict = Depends(verify_token),
    db: UserDB = Depends(get_user_db)
):
    logger.info(f"Adding new student PRN: {prn} manually by {admin_data['sub']}")

    validate_image(image)

    try:
        # Process image and extract embeddings
        embeddings = process_student_image(image)
        
        # Reset file pointer since process_student_image consumed the stream
        image.file.seek(0)
        
        # Real Cloudinary Upload
        logger.info(f"Uploading image to Cloudinary for PRN: {prn}")
        image_link = upload_image_to_cloudinary(image.file, folder_name="attendsnap_students")
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing face: {str(e)}")
        raise HTTPException(status_code=500, detail="Error generating face embeddings or uploading image")
        
    existing = await db.find_user_by_prn(prn)
    if existing:
        raise HTTPException(status_code=400, detail="Student with this PRN already exists")
        
    student_data = {
        "name": name,
        "prn": prn,
        "class": academic_class,
        "div": div,
        "dob": dob,
        "contact": contact,
        "email": email,
        "gender": gender,
        "image_link": image_link,
        "image_embeddings": embeddings,
        "attendance": []
    }
    await db.insert_user(student_data)
    return {"message": "Student added successfully", "prn": prn, "image_url": image_link}

@router.get("/students")
async def get_students(
    admin_data: dict = Depends(verify_token),
    db: UserDB = Depends(get_user_db)
):
    logger.info("Admin fetching student list")
    students = await db.find_all_users()
    # Remove internal fields before sending to frontend
    for s in students:
        s.pop("_id", None)
        s.pop("image_embeddings", None)   # large array, not needed in list view
    return students

@router.put("/students/{prn}")
async def update_student(
    prn: str,
    name: str = Form(None),
    academic_class: str = Form(None, alias="class"),
    div: str = Form(None),
    dob: str = Form(None),
    contact: str = Form(None),
    email: str = Form(None),
    gender: str = Form(None),
    admin_data: dict = Depends(verify_token),
    db: UserDB = Depends(get_user_db),
):
    """Update any subset of a student's fields. Only supplied fields are changed."""
    logger.info(f"Updating details for student PRN: {prn}")

    existing = await db.find_user_by_prn(prn)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Student {prn} not found")

    updates = {}
    if name           is not None: updates["name"]    = name
    if academic_class is not None: updates["class"]   = academic_class
    if div            is not None: updates["div"]     = div
    if dob            is not None: updates["dob"]     = dob
    if contact        is not None: updates["contact"] = contact
    if email          is not None: updates["email"]   = email
    if gender         is not None: updates["gender"]  = gender

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    await db.update_user(prn, updates)
    return {"message": f"Student {prn} updated successfully", "updated_fields": list(updates.keys())}

@router.delete("/students/{prn}")
async def remove_student(
    prn: str,
    admin_data: dict = Depends(verify_token),
    db: UserDB = Depends(get_user_db)
):
    logger.info(f"Removing student PRN: {prn}")
    existing = await db.find_user_by_prn(prn)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Student with PRN {prn} not found")
    await db.delete_user(prn)
    return {"message": f"Student {prn} removed successfully"}

@router.get("/attendance")
async def view_all_attendance(
    admin_data: dict = Depends(verify_token),
    att_db: AttendanceDB = Depends(get_attendance_db),
):
    """
    Returns all attendance sessions from the AttendanceDB model.
    """
    logger.info("Admin fetching all attendance sessions")
    sessions = await att_db.get_all_sessions()
    
    # Strip MongoDB _id to avoid serialization issues
    for s in sessions:
        s.pop("_id", None)
        
    return {"total": len(sessions), "records": sessions}


class ManualSessionRequest(BaseModel):
    date: str = None          # ISO date string; defaults to today if omitted
    time_from: str = None     # e.g. "09:00"
    time_to: str = None       # e.g. "10:00"
    subject: str = None       # optional subject/class label
    note: str = None


class ManualAttendanceRequest(BaseModel):
    prn: str
    status: str = "present"   # "present" | "absent"
    date: str = None          # ISO date string; defaults to today if omitted
    note: str = None


class ToggleAttendanceRequest(BaseModel):
    prn: str
    status: str               # "present" | "absent"


@router.post("/mark_attendance/manual/session")
async def create_manual_session(
    payload: ManualSessionRequest,
    admin_data: dict = Depends(verify_token),
    user_db: UserDB = Depends(get_user_db),
    att_db: AttendanceDB = Depends(get_attendance_db),
):
    """
    Create a new manual attendance session with all registered students.
    All students default to 'absent'. Admin then toggles individual students.
    """
    from datetime import datetime, timezone

    logger.info(f"Admin creating manual session by {admin_data['sub']}")

    date_str = payload.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    time_from = payload.time_from or "00:00"
    time_to = payload.time_to or "23:59"

    # Get all students
    all_students = await user_db.find_all_users()
    if not all_students:
        raise HTTPException(status_code=400, detail="No students registered in the database.")

    session_students = []
    for s in all_students:
        session_students.append({
            "prn": s["prn"],
            "name": s.get("name"),
            "class": s.get("class"),
            "div": s.get("div"),
            "email": s.get("email", ""),
            "image_link": s.get("image_link", ""),
            "status": "absent",  # default all absent
        })

    session_data = {
        "date": date_str,
        "time_from": time_from,
        "time_to": time_to,
        "subject": payload.subject or "",
        "marked_by": admin_data["sub"],
        "method": "manual",
        "photo_url": None,
        "total_students": len(session_students),
        "present_count": 0,
        "absent_count": len(session_students),
        "students": session_students,
        "note": payload.note or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    session_id = await att_db.insert_session(session_data)
    logger.info(f"Manual session created with ID: {session_id}")

    return {
        "message": f"Manual session created for {date_str} ({time_from} – {time_to})",
        "session_id": str(session_id),
        "total_students": len(session_students),
    }


@router.put("/mark_attendance/manual/toggle/{session_id}")
async def toggle_student_attendance(
    session_id: str,
    payload: ToggleAttendanceRequest,
    admin_data: dict = Depends(verify_token),
    user_db: UserDB = Depends(get_user_db),
    att_db: AttendanceDB = Depends(get_attendance_db),
):
    """Toggle a single student's attendance status within a manual session."""
    logger.info(f"Toggling {payload.prn} to {payload.status} in session {session_id}")

    if payload.status not in ("present", "absent"):
        raise HTTPException(status_code=400, detail="status must be 'present' or 'absent'")

    session = await att_db.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify student exists in this session
    student_in_session = next(
        (s for s in (session.get("students") or []) if s["prn"] == payload.prn), None
    )
    if not student_in_session:
        raise HTTPException(status_code=404, detail=f"Student {payload.prn} not in this session")

    # Skip if already in the requested status
    if student_in_session["status"] == payload.status:
        return {"message": f"Student {payload.prn} is already {payload.status}", "changed": False}

    await att_db.update_student_status_in_session(session_id, payload.prn, payload.status)

    # Also update the student's own attendance history
    from datetime import datetime, timezone
    attendance_record = {
        "date": session.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "status": payload.status,
        "method": "manual",
        "session_id": session_id,
        "marked_by": admin_data["sub"],
    }
    await user_db.mark_attendance(payload.prn, attendance_record)

    # Send email notification when student is marked present
    if payload.status == "present":
        student_doc = await user_db.find_user_by_prn(payload.prn)
        if student_doc and student_doc.get("email"):
            # Count current session stats
            updated_session = await att_db.get_session_by_id(session_id)
            p_count = updated_session.get("present_count", 0) if updated_session else 0
            a_count = updated_session.get("absent_count", 0) if updated_session else 0
            t_count = updated_session.get("total_students", 0) if updated_session else 0

            send_attendance_email(
                to_email=student_doc["email"],
                student_name=student_doc.get("name", "Student"),
                status="present",
                session_date=session.get("date", ""),
                time_from=session.get("time_from", ""),
                time_to=session.get("time_to", ""),
                subject_name=session.get("subject", ""),
                method="manual",
                attendance_history=student_doc.get("attendance", []),
                note=session.get("note", ""),
            )

    return {
        "message": f"Student {payload.prn} marked as {payload.status}",
        "changed": True,
        "prn": payload.prn,
        "status": payload.status,
    }


@router.get("/attendance/{session_id}")
async def get_session_by_id(
    session_id: str,
    admin_data: dict = Depends(verify_token),
    att_db: AttendanceDB = Depends(get_attendance_db),
):
    """Get a single attendance session by its ID."""
    session = await att_db.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session["_id"] = str(session["_id"])
    return session


@router.post("/mark_attendance/manual")
async def mark_manual_attendance(
    payload: ManualAttendanceRequest,
    admin_data: dict = Depends(verify_token),
    db: UserDB = Depends(get_user_db),
    att_db: AttendanceDB = Depends(get_attendance_db),
):
    """Manually mark a single student present or absent for a given date (legacy single-PRN endpoint)."""
    logger.info(f"Admin manually marking attendance for PRN: {payload.prn} as {payload.status}")

    if payload.status not in ("present", "absent"):
        raise HTTPException(status_code=400, detail="status must be 'present' or 'absent'")

    student = await db.find_user_by_prn(payload.prn)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {payload.prn} not found")

    from datetime import datetime, timezone
    date_str = payload.date or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # 1. Update the student document history
    attendance_record = {
        "date":   date_str,
        "status": payload.status,
        "method": "manual",
        "note":   payload.note or "",
        "marked_by": admin_data["sub"],
    }
    await db.mark_attendance(payload.prn, attendance_record)

    # 2. Update or Create the day-wise session in AttendanceDB
    student_record = {
        "prn": student["prn"],
        "name": student.get("name"),
        "class": student.get("class"),
        "div": student.get("div"),
        "status": payload.status,
    }

    session = await att_db.get_session_by_date(date_str)
    if session:
        await att_db.add_student_to_session(date_str, student_record)
    else:
        new_session = {
            "date": date_str,
            "marked_by": admin_data["sub"],
            "method": "manual",
            "photo_url": None,
            "total_students": 1,
            "present_count": 1 if payload.status == "present" else 0,
            "absent_count": 1 if payload.status == "absent" else 0,
            "students": [student_record]
        }
        await att_db.insert_session(new_session)

    # Send email notification when marked present
    if payload.status == "present" and student.get("email"):
        send_attendance_email(
            to_email=student["email"],
            student_name=student.get("name", "Student"),
            status="present",
            session_date=date_str,
            method="manual",
            attendance_history=student.get("attendance", []),
            note=payload.note or "",
        )

    return {
        "message": f"Attendance marked as '{payload.status}' for {student['name']} ({payload.prn})",
        "record": attendance_record,
    }


@router.post("/mark_attendance/image")
async def process_image_attendance(
    images: List[UploadFile] = File(...),
    date: str = Form(...),
    time_from: str = Form(...),
    time_to: str = Form(...),
    subject: str = Form(""),
    note: str = Form(""),
    admin_data: dict = Depends(verify_token),
    admin_db: AdminDB = Depends(get_admin_db),
    user_db: UserDB = Depends(get_user_db),
    att_db: AttendanceDB = Depends(get_attendance_db),
):
    """
    Core attendance marking pipeline:
    1. Upload up to 3 group photos.
    2. MTCNN detects every face; FaceNet generates a 512-D embedding per face.
    3. Each group-face embedding is compared (Euclidean distance) against every
       student's stored embedding from MongoDB.
    4. A student is marked PRESENT if any group face is within MATCH_THRESHOLD.
    5. The annotated group photo is uploaded to Cloudinary.
    6. Attendance records are appended to matched students in MongoDB.
    """
    logger.info(f"Processing {len(images)} group images for automated attendance")

    if len(images) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 images allowed")

    for img in images:
        validate_image(img)

    admin_email = admin_data["sub"]
    MATCH_THRESHOLD = 1.0   # Euclidean distance threshold for 512-D FaceNet

    try:
        # ── Step 1: detect faces & generate embeddings from all group photos ──
        boxed_image_path, all_group_embeddings = process_multiple_group_photos(images)

        logger.info(f"{len(all_group_embeddings)} face embeddings extracted from group photos")

        # ── Step 2: load all student embeddings + emails from MongoDB ─────────
        students = await user_db.get_all_embeddings()
        if not students:
            raise HTTPException(status_code=400, detail="No students registered in the database.")

        # Also fetch emails (get_all_embeddings only returns prn, name, embeddings)
        all_student_docs = await user_db.find_all_users()
        email_map = {s["prn"]: s.get("email", "") for s in all_student_docs}

        # ── Step 3: match each group face against every student ───────────────
        present_students = []   # [{prn, name, distance}]
        matched_prns = set()    # avoid double-marking

        for group_emb in all_group_embeddings:
            group_vec = np.array(group_emb, dtype=np.float32)

            for student in students:
                prn  = student["prn"]
                name = student["name"]
                stored_emb = student.get("image_embeddings")

                if not stored_emb or prn in matched_prns:
                    continue

                student_vec = np.array(stored_emb, dtype=np.float32)
                distance    = float(np.linalg.norm(group_vec - student_vec))

                if distance <= MATCH_THRESHOLD:
                    matched_prns.add(prn)
                    present_students.append({
                        "prn": prn,
                        "name": name,
                        "email": email_map.get(prn, ""),
                        "distance": round(distance, 4),
                        "confidence": round(100.0 / (1.0 + distance), 2),
                    })
                    logger.info(f"Match: {name} ({prn}) — dist={distance:.4f}")

        # ── Step 4: upload annotated photo to Cloudinary ──────────────────────
        logger.info("Uploading annotated group photo to Cloudinary")
        secure_url = upload_image_to_cloudinary(
            boxed_image_path, folder_name="attendsnap_group_photos"
        )
        os.remove(boxed_image_path)

        # ── Step 5: record the session URL on the admin document ──────────────
        from datetime import datetime, timezone
        created_at_str = datetime.now(timezone.utc).isoformat()

        await admin_db.collection.update_one(
            {"email": admin_email},
            {"$push": {"group_photos_user": secure_url}}
        )

        # ── Step 6: Save session to AttendanceDB first ─────────────────────────────
        present_prns = {ps["prn"] for ps in present_students}
        session_students = []
        for s in all_student_docs:
            status = "present" if s["prn"] in present_prns else "absent"
            session_students.append({
                "prn": s["prn"],
                "name": s.get("name"),
                "class": s.get("class"),
                "div": s.get("div"),
                "email": s.get("email", ""),
                "image_link": s.get("image_link", ""),
                "status": status
            })

        session_data = {
            "date": date,
            "time_from": time_from,
            "time_to": time_to,
            "subject": subject,
            "marked_by": admin_email,
            "method": "ai",
            "photo_url": secure_url,
            "total_students": len(students),
            "present_count": len(present_students),
            "absent_count": len(students) - len(present_students),
            "students": session_students,
            "note": note,
            "created_at": created_at_str,
        }
        session_id = await att_db.insert_session(session_data)

        # ── Step 6.5: mark attendance in each matched student's document ───────
        attendance_record = {
            "date": date,
            "time_from": time_from,
            "time_to": time_to,
            "subject": subject,
            "note": note,
            "photo_url": secure_url,
            "status": "present",
            "method": "ai",
            "marked_by": admin_email,
            "session_id": str(session_id),
        }
        for ps in present_students:
            await user_db.mark_attendance(ps["prn"], attendance_record)

        logger.info(f"Attendance marked for {len(present_students)}/{len(students)} students")

        # ── Step 7: send email notifications (non-blocking — never fails route) ─
        # Build per-student attendance history for chart generation
        all_attendance_records = {}
        for ps in present_students:
            student_doc = await user_db.find_user_by_prn(ps["prn"])
            if student_doc:
                all_attendance_records[ps["prn"]] = student_doc.get("attendance", [])

        email_summary = send_attendance_emails_bulk(
            students=present_students,
            session_date=date,
            time_from=time_from,
            time_to=time_to,
            subject_name=subject,
            method="ai",
            note=note,
            all_attendance_records=all_attendance_records,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing group photos: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process group photos")

    return {
        "message": f"Attendance marked for {len(present_students)} of {len(students)} students",
        "url": secure_url,
        "total_faces_detected": len(all_group_embeddings),
        "total_students": len(students),
        "present_count": len(present_students),
        "present_students": present_students,
        "session_date": date,
        "emails": email_summary,
    }
