// Dynamically detect API base URL
// When running locally via Vite dev server, direct requests to the FastAPI backend (port 8000).
// Prioritize localhost during local development, fallback to the .env URL or production domain.
const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (import.meta.env.DEV) {
    // If envUrl is set and is explicitly a local/localhost address, use it; otherwise default to local FastAPI server
    if (envUrl && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1') || envUrl.includes('192.168.'))) {
      return envUrl;
    }
    return 'http://localhost:8000';
  }
  return envUrl || '';
};

export const BASE_URL = getBaseUrl();

export const ADMIN_API = `${BASE_URL}/api/admin`;
export const STUDENT_API = `${BASE_URL}/api/student`;
