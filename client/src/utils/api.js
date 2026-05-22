// Dynamically detect API base URL
// When running locally via Vite dev server (port 5173), direct requests to the FastAPI backend (port 8000).
// Prioritize the URL from .env, fallback to localhost if in dev mode
export const BASE_URL = import.meta.env.VITE_API_URL;

export const ADMIN_API = `${BASE_URL}/api/admin`;
export const STUDENT_API = `${BASE_URL}/api/student`;
