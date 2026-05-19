import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import AdminAuth from './pages/AdminAuth'
import AdminDashboard from './pages/AdminDashboard'
import Home from './pages/Home'
import './index.css'

// Temporary placeholder for dashboard
const DashboardPlaceholder = () => (
  <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
    <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px]"></div>
    <div className="z-10 text-center bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 p-12 rounded-3xl shadow-2xl">
      <h1 className="text-4xl font-bold text-white mb-4">Admin Dashboard</h1>
      <p className="text-emerald-500 text-lg">Welcome to AttendSnap Control Center!</p>
    </div>
  </div>
);

function App() {
  return (
    <Router>
      <Routes>
        {/* Home page as root */}
        <Route path="/" element={<Home />} />
        
        {/* Admin Routes - Both point to the unified component that handles sliding */}
        <Route path="/admin/login" element={<AdminAuth />} />
        <Route path="/admin/register" element={<AdminAuth />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </Router>
  )
}

export default App
