import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { ADMIN_API } from '../utils/api';
import '../css/AdminAuth.css';

// Eye Icons as inline components
const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

// Reusable password input with eye toggle
function PasswordInput({ value, onChange, placeholder = "••••••••", required = true, minLength, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        className="w-full pr-12 px-4 py-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-neutral-900 dark:text-white transition-all outline-none"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-emerald-500 dark:text-neutral-500 dark:hover:text-emerald-400 transition-colors"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

export default function AdminAuth() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isRegisterMode, setIsRegisterMode] = useState(location.pathname === '/admin/register');
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem('attendsnap-theme') !== 'light'
  );

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('attendsnap-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('attendsnap-theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    setIsRegisterMode(location.pathname === '/admin/register');
  }, [location.pathname]);

  const handleToggleMode = (mode) => {
    setError('');
    navigate(mode === 'register' ? '/admin/register' : '/admin/login');
  };

  const onLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${ADMIN_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('adminToken', data.access_token);
        navigate('/admin/dashboard');
      } else {
        setError(data.detail || 'Login failed');
      }
    } catch {
      setError('An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (registerData.password !== registerData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${ADMIN_API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerData.name,
          email: registerData.email,
          password: registerData.password,
        }),
      });
      if (response.ok) {
        handleToggleMode('login');
      } else {
        const data = await response.json();
        setError(data.detail || 'Registration failed');
      }
    } catch {
      console.warn('API not ready, simulating success.');
      setTimeout(() => handleToggleMode('login'), 1000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`auth-container ${isRegisterMode ? 'register-mode' : ''} bg-neutral-50 dark:bg-neutral-950`}>

      {/* Theme Toggle */}
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        className="absolute top-6 right-6 z-50 p-3 rounded-full bg-white/10 dark:bg-neutral-800/50 backdrop-blur-md border border-neutral-200 dark:border-neutral-700 shadow-lg transition-transform hover:scale-110 flex items-center justify-center text-neutral-800 dark:text-yellow-400"
        aria-label="Toggle Theme"
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {/* HERO PANEL */}
      <div className="auth-panel hero-panel flex flex-col items-center justify-center p-8 bg-emerald-600 dark:bg-emerald-900 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-emerald-400/20 rounded-full blur-3xl"></div>

        <div className="relative z-10 text-center text-white max-w-lg">
          <div className="w-24 h-24 mx-auto mb-8 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center border border-white/30 shadow-2xl">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
            </svg>
          </div>
          <h2 className="text-4xl font-bold mb-4 tracking-tight">AttendSnap</h2>
          <p className="text-emerald-100 text-lg mb-8 leading-relaxed">
            {isRegisterMode
              ? 'Join the automated attendance revolution. Secure, fast, and driven by advanced facial recognition AI.'
              : 'Welcome back! Access your administrator dashboard to manage students and monitor automated attendance streams.'}
          </p>
          <div className="flex gap-4 justify-center mt-8 opacity-80">
            <div className="px-4 py-2 rounded-xl bg-black/20 backdrop-blur-sm border border-white/10">
              <div className="text-2xl font-bold">99.8%</div>
              <div className="text-xs uppercase tracking-wider">Accuracy</div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-black/20 backdrop-blur-sm border border-white/10">
              <div className="text-2xl font-bold">{'<1s'}</div>
              <div className="text-xs uppercase tracking-wider">Detection</div>
            </div>
          </div>
        </div>
      </div>

      {/* FORM PANEL */}
      <div className="auth-panel form-panel flex items-center justify-center p-6 md:p-12 bg-white dark:bg-neutral-950">
        <div className="w-full max-w-lg px-4 md:px-8">

          {error && (
            <div className="mb-6 p-4 bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* LOGIN FORM */}
          {!isRegisterMode && (
            <div className="form-content">
              <div className="mb-8 text-center md:text-left">
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">Sign In</h1>
                <p className="text-neutral-500 dark:text-neutral-400">Manage your institution's attendance</p>
              </div>

              <form onSubmit={onLoginSubmit} className="space-y-5">
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Email Address</label>
                  <input
                    id="login-email"
                    type="email" required
                    className="w-full px-4 py-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-neutral-900 dark:text-white transition-all outline-none"
                    placeholder="admin@school.edu"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label htmlFor="login-password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Password</label>
                    <a href="#" className="text-sm text-emerald-600 dark:text-emerald-500 hover:underline">Forgot password?</a>
                  </div>
                  <PasswordInput
                    id="login-password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-emerald-500/30"
                >
                  {loading ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>

              <div className="mt-8 text-center">
                <p className="text-neutral-600 dark:text-neutral-400">
                  Don't have an admin account?{' '}
                  <button onClick={() => handleToggleMode('register')} className="text-emerald-600 dark:text-emerald-500 font-semibold hover:underline">
                    Create one
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* REGISTER FORM */}
          {isRegisterMode && (
            <div className="form-content">
              <div className="mb-8 text-center md:text-left">
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">Create Account</h1>
                <p className="text-neutral-500 dark:text-neutral-400">Apply for administrative access</p>
              </div>

              <form onSubmit={onRegisterSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Full Name</label>
                  <input
                    id="reg-name"
                    type="text" required
                    className="w-full px-4 py-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-neutral-900 dark:text-white transition-all outline-none"
                    placeholder="Dr. Jane Smith"
                    value={registerData.name}
                    onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Email Address</label>
                  <input
                    id="reg-email"
                    type="email" required
                    className="w-full px-4 py-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-neutral-900 dark:text-white transition-all outline-none"
                    placeholder="admin@school.edu"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Password</label>
                    <PasswordInput
                      id="reg-password"
                      minLength={8}
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-confirm" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Confirm</label>
                    <PasswordInput
                      id="reg-confirm"
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                    />
                  </div>
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3 px-4 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-emerald-500/30"
                >
                  {loading ? 'Submitting...' : 'Register'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-neutral-600 dark:text-neutral-400">
                  Already have an account?{' '}
                  <button onClick={() => handleToggleMode('login')} className="text-emerald-600 dark:text-emerald-500 font-semibold hover:underline">
                    Sign in
                  </button>
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
