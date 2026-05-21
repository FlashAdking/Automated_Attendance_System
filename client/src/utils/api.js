// Dynamically detect API base URL
// When running locally via Vite dev server (port 5173), direct requests to the FastAPI backend (port 8000).
// When built and running in the production Docker/Nginx container, direct relative requests via the Nginx reverse proxy.
export const BASE_URL = window.location.port === '5173' ? 'http://localhost:8000' : '';

export const ADMIN_API = `${BASE_URL}/api/admin`;
export const STUDENT_API = `${BASE_URL}/api/student`;
