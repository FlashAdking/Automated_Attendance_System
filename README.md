# 🎯 AttendSnap — AI-Powered Automated Attendance System

[![Docker Hub](https://img.shields.io/badge/docker%20hub-flashadking%2Fattendsnap-blue?logo=docker)](https://hub.docker.com/repository/docker/flashadking/attendsnap/general)

> A full-stack attendance management platform that uses **FaceNet + MTCNN** face recognition to automatically mark student attendance from group photos. Built with **FastAPI**, **React (Vite)**, and **MongoDB**, deployed via a **Jenkins CI/CD pipeline** to **Docker Hub** ([flashadking/attendsnap](https://hub.docker.com/repository/docker/flashadking/attendsnap/general)) and **Render**.

---

## ✨ Features

### 🤖 AI Attendance
- Upload a group photo and individual portrait — the system detects, aligns, and matches faces automatically
- MTCNN for face detection + FaceNet (ONNX Runtime) for 512-d embedding extraction & comparison
- Lightweight inference: **~50 MB** ONNX model vs 1.2 GB TensorFlow

### 📋 Manual Attendance
- Admins can create manual sessions and toggle each student's status (Present / Absent)
- Day-wise session format stored in MongoDB

### 👨‍🎓 Student Self-Service Portal
- Students look up their attendance by PRN + Date of Birth
- View attendance history, summary stats, and session-wise breakdown

### 📧 Email Notifications
- Automated email on attendance marking (SMTP via Gmail App Password)
- Premium HTML emails with Cloudinary-hosted matplotlib charts (donut + bar)
- Single SMTP connection for bulk sends — avoids Google rate-limiting

### 🔐 Security
- JWT-based admin authentication (login + register)
- bcrypt password hashing
- Per-route rate limiting via SlowAPI
- CORS restricted to configured frontend origin

### 🚀 CI/CD Pipeline (Jenkins)
- Automated: Checkout → Lint → Test → Docker Build → Push to Docker Hub → Trigger Render Deploy → Cleanup
- SCM polling every minute for automatic builds on push
- JUnit test report integration

---

## 🏗️ Architecture

```
┌─────────────────┐       API        ┌─────────────────────┐       DB        ┌───────────┐
│   React (Vite)  │ ───────────────► │   FastAPI Backend    │ ──────────────► │  MongoDB  │
│   Vercel CDN    │  HTTPS / JSON    │   Render / Docker    │   Motor async   │  Atlas    │
└─────────────────┘                  └─────────────────────┘                  └───────────┘
                                              │
                                    ┌─────────┴──────────┐
                                    │                    │
                               ┌────▼─────┐       ┌─────▼──────┐
                               │ FaceNet  │       │ Cloudinary │
                               │ ONNX +   │       │ (Charts +  │
                               │ MTCNN    │       │  Images)   │
                               └──────────┘       └────────────┘
```

---

## 🌊 Technical Flow

1. **Client Request:** The React (Vite) frontend captures a group photo or handles manual attendance actions, sending requests to the FastAPI backend.
2. **AI Processing:** For AI attendance, FastAPI receives the image. MTCNN detects faces, and FaceNet (ONNX Runtime) generates 512-d embeddings.
3. **Face Matching:** Generated embeddings are compared against registered student data to identify and mark students as Present.
4. **Data Persistence:** Attendance records and sessions are stored in MongoDB. Generated charts and images are uploaded to Cloudinary.
5. **Notifications:** Automated emails containing attendance summaries and charts are sent via Gmail SMTP.

---

## 📁 Project Structure

```
Automated_Attendance_System/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py             # App entrypoint, CORS, rate limiter
│   │   ├── routes/
│   │   │   ├── admin.py        # Admin endpoints (CRUD, attendance, sessions)
│   │   │   └── student.py      # Student lookup, history, AI attendance
│   │   ├── models/
│   │   │   ├── admin_db.py     # Admin MongoDB operations
│   │   │   ├── user_db.py      # Student MongoDB operations
│   │   │   └── attendance_db.py # Session-based attendance model
│   │   ├── face_recognition/
│   │   │   ├── MTCNN_compare.py      # Face comparison pipeline
│   │   │   ├── face_utils.py         # Embedding generation & matching
│   │   │   ├── preprocess_image.py   # Image preprocessing & face extraction
│   │   │   └── ML_models/            # ONNX model files
│   │   ├── middleware/
│   │   │   ├── auth.py         # JWT create / verify
│   │   │   └── rate_limiter.py # SlowAPI rate limit config
│   │   ├── utils/
│   │   │   ├── email_utils.py  # SMTP email sender + chart generation
│   │   │   └── cloudinary_helper.py  # Cloudinary image uploads
│   │   └── schemas/            # Pydantic request/response models
│   ├── tests/                  # Pytest suite (70 tests)
│   ├── Dockerfile              # Multi-stage build (builder + runtime)
│   ├── req.txt                 # Python dependencies
│   └── .env                    # Environment variables (not committed)
│
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx            # Landing page
│   │   │   ├── AdminAuth.jsx       # Login / Register toggle
│   │   │   ├── AdminDashboard.jsx  # Dashboard, sessions, student management
│   │   │   └── StudentPortal.jsx   # Student self-service lookup
│   │   ├── utils/api.js        # API base URL config
│   │   └── App.jsx             # Router setup
│   └── .env                    # VITE_API_URL (not committed)
│
├── Jenkinsfile                 # CI/CD pipeline definition
├── docker-compose.yml          # Local dev stack (MongoDB + Backend)
├── deploy.sh                   # Deployment helper script
└── README.md
```

---

## 🚀 Getting Started (Local Setup)

### Prerequisites

- **Python** 3.12+
- **Node.js** 18+ & npm
- **MongoDB** (local or Atlas)
- **Docker** (for containerized deployment)

### 1. Clone the Repository

```bash
git clone https://github.com/FlashAdking/Automated_Attendance_System.git
cd Automated_Attendance_System
```

### 2. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate     # Linux/Mac
# venv\Scripts\activate      # Windows

# Install dependencies
pip install -r req.txt
```

Create `backend/.env`:

```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/attend_snap
JWT_SECRET=your-secret-key-here
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>

# Gmail SMTP (generate at: myaccount.google.com/apppasswords)
EMAIL_SENDER=yourname@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx

FRONTEND_URL=http://localhost:5173
```

Run the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd client
npm install
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:8000
```

Run the frontend:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## 🧪 Running Tests

```bash
cd backend
pytest tests/ -v --tb=short
```

**70 tests** covering:
- Admin routes (login, register, CRUD, sessions, attendance toggle)
- Student routes (lookup, history, summary, trial endpoint validation)
- Auth middleware (JWT creation, expiry, tampering)
- Database models (User, Admin, Attendance session operations)

---

## 🐳 Docker

**Docker Hub Repository:** [flashadking/attendsnap/general](https://hub.docker.com/repository/docker/flashadking/attendsnap/general)

### Build & Run with Docker Compose

```bash
docker-compose up --build
```

This starts:
- **MongoDB** on port `27017`
- **FastAPI backend** on port `8000`

### Build Backend Image Only

```bash
cd backend
docker build -t attendsnap:latest .
docker run -p 8000:8000 --env-file .env attendsnap:latest
```

---

## ⚙️ CI/CD Pipeline (Jenkins)

The `Jenkinsfile` defines a fully automated pipeline:

| Stage                | Description                                          |
|----------------------|------------------------------------------------------|
| **Checkout**         | Clones the repo from GitHub                          |
| **Lint**             | Runs `flake8` on the backend code                    |
| **Test**             | Runs `pytest` with JUnit XML reporting               |
| **Build Docker**     | Builds multi-stage Docker image                      |
| **Push to Hub**      | Pushes versioned + latest tags to Docker Hub         |
| **Trigger Deploy**   | Hits Render deploy webhook for automatic redeploy    |
| **Cleanup**          | Prunes Docker images, build cache, and networks      |

**Trigger:** SCM polling every minute (`* * * * *`)

### Jenkins Credentials Required

| Credential ID              | Type              | Description             |
|----------------------------|-------------------|-------------------------|
| `dockerhub-credentials`    | Username/Password | Docker Hub login        |
| `cloud-deploy-webhook-url` | Secret text       | Render deploy hook URL  |

---

## 🌐 Deployment

| Component  | Platform     | URL                                                              |
|------------|--------------|------------------------------------------------------------------|
| **Frontend** | Vercel       | Deployed automatically on push                                  |
| **Backend**  | Render       | Docker image pulled from Docker Hub on deploy webhook trigger   |
| **Database** | MongoDB Atlas | Cloud-hosted cluster                                           |

---

## 🛠️ Tech Stack

| Layer          | Technology                                                |
|----------------|-----------------------------------------------------------|
| **Frontend**   | React 18, Vite, React Router                              |
| **Backend**    | FastAPI, Uvicorn, Motor (async MongoDB)                   |
| **AI/ML**      | MTCNN (face detection), FaceNet via ONNX Runtime          |
| **Database**   | MongoDB Atlas                                             |
| **Auth**       | JWT (PyJWT), bcrypt                                       |
| **Email**      | Gmail SMTP with App Password, matplotlib charts           |
| **Storage**    | Cloudinary (images & charts)                              |
| **CI/CD**      | Jenkins, Docker, Docker Hub                               |
| **Hosting**    | Vercel (frontend), Render (backend)                       |
| **Security**   | SlowAPI rate limiting, CORS, bcrypt hashing               |

---

## 📄 Environment Variables Reference

### Backend (`backend/.env`)

| Variable          | Description                              |
|-------------------|------------------------------------------|
| `MONGO_URI`       | MongoDB connection string                |
| `JWT_SECRET`      | Secret key for JWT token signing         |
| `CLOUDINARY_URL`  | Cloudinary auto-config URL               |
| `EMAIL_SENDER`    | Gmail address for sending notifications  |
| `EMAIL_PASSWORD`  | Gmail App Password (16 chars)            |
| `FRONTEND_URL`    | Allowed CORS origin                      |

### Frontend (`client/.env`)

| Variable       | Description                    |
|----------------|--------------------------------|
| `VITE_API_URL` | Backend API base URL           |

---

## 👤 Author

**Aditya Tiwade**

- GitHub: [@FlashAdking](https://github.com/FlashAdking)

---

## 📝 License

This project is for educational and portfolio purposes.
