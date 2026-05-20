import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import AdminAuth from './pages/AdminAuth'
import AdminDashboard from './pages/AdminDashboard'
import Home from './pages/Home'
import StudentPortal from './pages/StudentPortal'
import './index.css'

function App() {
  return (
    <Router>
      <Routes>
        {/* Home page as root */}
        <Route path="/" element={<Home />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminAuth />} />
        <Route path="/admin/register" element={<AdminAuth />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />

        {/* Student self-service portal */}
        <Route path="/student" element={<StudentPortal />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
