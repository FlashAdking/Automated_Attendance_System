import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, UserPlus, Camera, FileText, CalendarRange, LogOut, Home as HomeIcon, Sun, Moon, CheckCircle2, XCircle, Trash2, Edit2, AlertCircle, Sparkles, Check, X, Clock, HelpCircle, Mail, Phone, BookOpen, ChevronRight, FileSpreadsheet, Loader2
} from 'lucide-react';
import '../css/AdminDashboard.css';

/* ─── API base ─── */
import { ADMIN_API as API } from '../utils/api';


/* ─── Tiny hook to keep auth header ready ─── */
function useAuth() {
  const navigate = useNavigate();
  const token = localStorage.getItem('adminToken');
  useEffect(() => {
    if (!token) navigate('/admin/login');
  }, [token, navigate]);
  return {
    headers: { Authorization: `Bearer ${token || ''}` },
    token: token || '',
  };
}

/* ─── Toast system ─── */
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {t.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ─── Sidebar item list ─── */
const NAV = [
  { id: 'overview', icon: <LayoutDashboard size={18} />, label: 'Overview' },
  { id: 'students', icon: <Users size={18} />, label: 'Students' },
  { id: 'add_student', icon: <UserPlus size={18} />, label: 'Add Student' },
  { id: 'attendance', icon: <Camera size={18} />, label: 'AI Attendance' },
  { id: 'manual', icon: <FileText size={18} />, label: 'Manual Entry' },
  { id: 'records', icon: <CalendarRange size={18} />, label: 'Attendance Records' },
];

/* ═══════════════════════════════════════════════
   OVERVIEW TAB
═══════════════════════════════════════════════ */
function OverviewTab({ authHeaders, toast }) {
  const [stats, setStats] = useState({ students: 0, sessions: 0, presentToday: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/students`, { headers: authHeaders }).then(r => r.json()),
      fetch(`${API}/attendance`, { headers: authHeaders }).then(r => r.json())
    ]).then(([stData, attData]) => {
      const stList = Array.isArray(stData) ? stData : stData.students || [];
      const sessionsArray = attData.records || [];
      
      const sessionsCount = sessionsArray.length;
      
      const todayStr = new Date().toISOString().split('T')[0];
      const presentToday = sessionsArray
        .filter(s => s.date && s.date.startsWith(todayStr))
        .reduce((sum, s) => sum + (s.present_count || 0), 0);

      setStats({ students: stList.length, sessions: sessionsCount, presentToday });
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [authHeaders]);

  const cards = [
    { icon: <Users size={20} className="text-emerald-500" />, label: 'Total Students', value: loading ? <div className="skeleton skeleton-text short" style={{ height: '32px', marginTop: '6px' }} /> : stats.students, sub: 'Registered in system' },
    { icon: <CalendarRange size={20} className="text-emerald-500" />, label: 'Total Sessions', value: loading ? <div className="skeleton skeleton-text short" style={{ height: '32px', marginTop: '6px' }} /> : stats.sessions, sub: 'Historical records' },
    { icon: <CheckCircle2 size={20} className="text-emerald-500" />, label: 'Present Today', value: loading ? <div className="skeleton skeleton-text short" style={{ height: '32px', marginTop: '6px' }} /> : stats.presentToday, sub: 'Marked today' },
    { icon: <Sparkles size={20} className="text-emerald-500" />, label: 'AI Model', value: 'FaceNet', sub: '512-D embeddings' },
  ];

  return (
    <>
      <div className="stat-cards-grid">
        {cards.map((c, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-icon">{c.icon}</div>
            <div className="stat-card-label">{c.label}</div>
            <div className="stat-card-value">{c.value}</div>
            <div className="stat-card-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 700 }}>System Status</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
          {[
            { label: 'MTCNN Face Detector', status: 'Online', color: 'badge-green' },
            { label: 'FaceNet Embedding Model', status: 'Online', color: 'badge-green' },
            { label: 'MongoDB Database', status: 'Connected', color: 'badge-green' },
            { label: 'Cloudinary Storage', status: 'Ready', color: 'badge-blue' },
            { label: 'Email Notifications (SMTP)', status: 'Active', color: 'badge-green' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.75 }}>{s.label}</span>
              <span className={`badge ${s.color}`}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════
   STUDENTS LIST TAB
═══════════════════════════════════════════════ */
function StudentsTab({ authHeaders, toast }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingPrn, setDeletingPrn] = useState(null);
  
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchStudents = useCallback(() => {
    setLoading(true);
    fetch(`${API}/students`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => setStudents(Array.isArray(data) ? data : data.students || []))
      .catch(() => toast('Failed to load students', 'error'))
      .finally(() => setLoading(false));
  }, [authHeaders, toast]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const handleDelete = async (prn) => {
    if (!window.confirm(`Remove student PRN: ${prn}?`)) return;
    setDeletingPrn(prn);
    try {
      const res = await fetch(`${API}/students/${prn}`, { method: 'DELETE', headers: authHeaders });
      const d = await res.json();
      if (res.ok) { toast(d.message || 'Student removed'); fetchStudents(); }
      else toast(d.detail || 'Delete failed', 'error');
    } catch { toast('Network error', 'error'); }
    finally { setDeletingPrn(null); }
  };
  
  const handleEditOpen = (student) => {
    setEditingStudent(student);
    setEditForm({
      name: student.name || '',
      class: student.class || '',
      div: student.div || '',
      contact: student.contact || '',
      email: student.email || '',
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    
    const fd = new FormData();
    Object.entries(editForm).forEach(([k, v]) => fd.append(k, v));
    
    try {
      const res = await fetch(`${API}/students/${editingStudent.prn}`, {
        method: 'PUT',
        headers: authHeaders,
        body: fd
      });
      const d = await res.json();
      if (res.ok) {
        toast('Student updated successfully');
        setEditingStudent(null);
        fetchStudents();
      } else {
        toast(d.detail || 'Update failed', 'error');
      }
    } catch {
      toast('Network error', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const filtered = students.filter(s =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.prn || '').toLowerCase().includes(search.toLowerCase())
  );

  const initials = (name = '') => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="panel" style={{ position: 'relative' }}>
      <div className="section-header">
        <h2>Registered Students ({students.length})</h2>
        <input
          className="form-input"
          style={{ maxWidth: 220 }}
          placeholder="Search name / PRN…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {!loading && filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <Users size={48} className="text-neutral-500" />
          </div>
          <p>No students found</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th><th>PRN</th><th>Class / Div</th>
                <th>Gender</th><th>Contact</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? [...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td>
                    <div className="avatar-cell">
                      <div className="skeleton skeleton-avatar" />
                      <div style={{ width: '100%', maxWidth: '150px' }}>
                        <div className="skeleton skeleton-text" style={{ width: '80%', marginBottom: '6px' }} />
                        <div className="skeleton skeleton-text" style={{ width: '50%', height: '10px', marginBottom: 0 }} />
                      </div>
                    </div>
                  </td>
                  <td><div className="skeleton skeleton-text" style={{ width: '80px' }} /></td>
                  <td><div className="skeleton skeleton-text short" /></td>
                  <td><div className="skeleton skeleton-text" style={{ width: '40px' }} /></td>
                  <td><div className="skeleton skeleton-text" style={{ width: '90px' }} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <div className="skeleton skeleton-text" style={{ width: '60px', height: '28px', borderRadius: '8px', marginBottom: 0 }} />
                      <div className="skeleton skeleton-text" style={{ width: '30px', height: '28px', borderRadius: '8px', marginBottom: 0 }} />
                    </div>
                  </td>
                </tr>
              )) : filtered.map((s, i) => (
                <tr key={i}>
                  <td>
                    <div className="avatar-cell">
                      {s.image_link
                        ? <img className="avatar" src={s.image_link} alt={s.name} />
                        : <div className="avatar-initials">{initials(s.name)}</div>
                      }
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="badge badge-blue">{s.prn}</span></td>
                  <td>{s.class} — {s.div}</td>
                  <td><span className={`badge ${s.gender === 'Male' ? 'badge-blue' : 'badge-green'}`}>{s.gender}</span></td>
                  <td style={{ fontSize: '0.82rem', opacity: 0.7 }}>{s.contact}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-sm"
                        style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => handleEditOpen(s)}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        className="btn btn-sm btn-red"
                        onClick={() => handleDelete(s.prn)}
                        disabled={deletingPrn === s.prn}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {deletingPrn === s.prn ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Edit Modal */}
      {editingStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, borderRadius: '12px' }}>
          <div style={{ background: 'var(--panel-bg)', padding: '2rem', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Edit Student: {editingStudent.prn}</h3>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div><label style={{ fontSize: '0.85rem', opacity: 0.7 }}>Name</label><input className="form-input" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} required /></div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: '0.85rem', opacity: 0.7 }}>Class</label><input className="form-input" value={editForm.class} onChange={e => setEditForm({...editForm, class: e.target.value})} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: '0.85rem', opacity: 0.7 }}>Div</label><input className="form-input" value={editForm.div} onChange={e => setEditForm({...editForm, div: e.target.value})} /></div>
              </div>
              <div><label style={{ fontSize: '0.85rem', opacity: 0.7 }}>Email</label><input type="email" className="form-input" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} /></div>
              <div><label style={{ fontSize: '0.85rem', opacity: 0.7 }}>Contact</label><input className="form-input" value={editForm.contact} onChange={e => setEditForm({...editForm, contact: e.target.value})} /></div>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-green" style={{ flex: 1 }} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save'}</button>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingStudent(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ADD STUDENT TAB
═══════════════════════════════════════════════ */
function AddStudentTab({ authHeaders, toast }) {
  const initForm = { name: '', prn: '', class: '', div: '', dob: '', contact: '', email: '', gender: 'Male' };
  const [form, setForm] = useState(initForm);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);

  const handleImage = (files) => {
    const f = files[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile) { toast('Please upload a student photo', 'error'); return; }

    setLoading(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append('image', imageFile);

    try {
      const res = await fetch(`${API}/students`, {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        toast(`✅ ${data.message} — PRN: ${data.prn}`);
        setForm(initForm);
        setImageFile(null);
        setImagePreview(null);
      } else {
        toast(data.detail || 'Failed to add student', 'error');
      }
    } catch {
      toast('Network error — is the backend running?', 'error');
    } finally {
      setLoading(false);
    }
  };

  const field = (label, key, type = 'text', placeholder = '') => (
    <div className="form-group">
      <label>{label}</label>
      <input
        className="form-input"
        type={type}
        placeholder={placeholder || label}
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        required
      />
    </div>
  );

  return (
    <div className="panel">
      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1rem', fontWeight: 700 }}>Add New Student</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {field('Full Name', 'name', 'text', 'Dr. Jane Smith')}
          {field('PRN / Roll Number', 'prn', 'text', 'PRN123456')}
          {field('Class', 'class', 'text', 'SE / TE / BE')}
          {field('Division', 'div', 'text', 'A / B / C')}
          {field('Date of Birth', 'dob', 'date')}
          {field('Contact Number', 'contact', 'tel', '+91 9999999999')}
          {field('Email', 'email', 'email', 'student@college.edu')}

          {/* Gender select */}
          <div className="form-group">
            <label>Gender</label>
            <select
              className="form-input"
              value={form.gender}
              onChange={e => setForm({ ...form, gender: e.target.value })}
            >
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </div>

          {/* Photo upload */}
          <div className="form-group form-full">
            <label>Student Photo (for face embeddings)</label>
            <div
              className={`dash-upload-zone ${drag ? 'drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); handleImage(e.dataTransfer.files); }}
            >
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => handleImage(e.target.files)} />
              <div className="icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                <Camera size={32} className="text-emerald-500" />
              </div>
              <h4>{imageFile ? imageFile.name : 'Drop photo or click to browse'}</h4>
              <p style={{ marginTop: '4px' }}>Clear frontal face photo required for AI embedding</p>
              {imagePreview && (
                <div className="thumb-strip">
                  <img src={imagePreview} alt="preview" />
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button type="submit" className="btn btn-green" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Processing…</>
            ) : (
              <>
                <UserPlus size={16} /> Add Student
              </>
            )}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => { setForm(initForm); setImageFile(null); setImagePreview(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MANUAL ATTENDANCE TAB (Session-Based with Toggles)
═══════════════════════════════════════════════ */
function ManualAttendanceTab({ authHeaders, toast }) {
  // ── Session creation form state ──
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('10:00');
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);

  // ── Active session state ──
  const [sessionId, setSessionId] = useState(null);
  const [sessionStudents, setSessionStudents] = useState([]);
  const [sessionMeta, setSessionMeta] = useState(null);
  const [search, setSearch] = useState('');
  const [togglingPrn, setTogglingPrn] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'present' | 'absent'

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setCreatingSession(true);

    const payload = { date, time_from: timeFrom, time_to: timeTo, subject, note };

    try {
      const res = await fetch(`${API}/mark_attendance/manual/session`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`✅ ${data.message}`);
        setSessionId(data.session_id);
        // Fetch the full session to get student list
        await fetchSession(data.session_id);
      } else {
        toast(data.detail || 'Failed to create session', 'error');
      }
    } catch {
      toast('Network error — is the backend running?', 'error');
    } finally {
      setCreatingSession(false);
    }
  };

  const fetchSession = async (sid) => {
    try {
      const res = await fetch(`${API}/attendance/${sid}`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setSessionStudents(data.students || []);
        setSessionMeta(data);
      }
    } catch {
      toast('Failed to fetch session details', 'error');
    }
  };

  const handleToggle = async (prn, currentStatus) => {
    const newStatus = currentStatus === 'present' ? 'absent' : 'present';
    setTogglingPrn(prn);

    try {
      const res = await fetch(`${API}/mark_attendance/manual/toggle/${sessionId}`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prn, status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        // Update local state optimistically
        setSessionStudents(prev =>
          prev.map(s => s.prn === prn ? { ...s, status: newStatus } : s)
        );
        if (data.changed) {
          // Update meta counts locally
          setSessionMeta(prev => prev ? {
            ...prev,
            present_count: prev.present_count + (newStatus === 'present' ? 1 : -1),
            absent_count: prev.absent_count + (newStatus === 'absent' ? 1 : -1),
          } : prev);
        }
      } else {
        toast(data.detail || 'Toggle failed', 'error');
      }
    } catch {
      toast('Network error', 'error');
    } finally {
      setTogglingPrn(null);
    }
  };

  const markAllPresent = async () => {
    const absentStudents = sessionStudents.filter(s => s.status === 'absent');
    for (const s of absentStudents) {
      await handleToggle(s.prn, 'absent');
    }
    toast(`✅ All students marked present`);
  };

  const markAllAbsent = async () => {
    const presentStudents = sessionStudents.filter(s => s.status === 'present');
    for (const s of presentStudents) {
      await handleToggle(s.prn, 'present');
    }
    toast('All students marked absent');
  };

  const presentCount = sessionStudents.filter(s => s.status === 'present').length;
  const absentCount = sessionStudents.filter(s => s.status === 'absent').length;

  const filtered = sessionStudents.filter(s => {
    const matchSearch =
      (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.prn || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filterStatus === 'all' || s.status === filterStatus;
    return matchSearch && matchFilter;
  });

  const initials = (name = '') => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  // ── No active session: show creation form ──
  if (!sessionId) {
    return (
      <div className="panel" style={{ maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={20} className="text-emerald-500" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Create Manual Session</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.5 }}>Set up a session, then toggle individual students</p>
          </div>
        </div>

        <form onSubmit={handleCreateSession} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Date *</label>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Subject / Class</label>
              <input className="form-input" placeholder="e.g. Data Structures" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Time From *</label>
              <input className="form-input" type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Time To *</label>
              <input className="form-input" type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} required />
            </div>
            <div className="form-group form-full">
              <label>Note (Optional)</label>
              <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Guest lecture, Lab session" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-green" disabled={creatingSession} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {creatingSession ? (
                <><Loader2 size={16} className="animate-spin" /> Creating…</>
              ) : (
                <>
                  <FileText size={16} /> Create Session & Load Students
                </>
              )}
            </button>
          </div>
        </form>

        <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: 12, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', fontSize: '0.82rem', opacity: 0.7 }}>
          <strong>How it works:</strong> Create a session → all registered students appear with toggles set to "Absent" → flip each student to "Present" → changes save instantly.
        </div>
      </div>
    );
  }

  // ── Active session: show student toggle list ──
  return (
    <div>
      {/* Session Header */}
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 700 }}>
              Manual Session — {sessionMeta?.date}
            </h2>
            <p style={{ margin: 0, fontSize: '0.82rem', opacity: 0.55 }}>
              {sessionMeta?.time_from} – {sessionMeta?.time_to}
              {sessionMeta?.subject && ` · ${sessionMeta.subject}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-green">{presentCount} Present</span>
            <span className="badge badge-red">{absentCount} Absent</span>
            <span className="badge badge-blue">{sessionStudents.length} Total</span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.08)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
          <div style={{
            width: `${sessionStudents.length > 0 ? (presentCount / sessionStudents.length) * 100 : 0}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #10b981, #059669)',
            borderRadius: 999,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <p style={{ fontSize: '0.75rem', opacity: 0.45, marginTop: '0.35rem', marginBottom: 0 }}>
          {sessionStudents.length > 0 ? Math.round((presentCount / sessionStudents.length) * 100) : 0}% attendance
        </p>
      </div>

      {/* Controls Row */}
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ maxWidth: 260, flex: 1 }}
            placeholder="Search name / PRN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {['all', 'present', 'absent'].map(f => (
              <button
                key={f}
                className={`btn btn-sm ${filterStatus === f ? 'btn-green' : 'btn-outline'}`}
                onClick={() => setFilterStatus(f)}
                style={{ textTransform: 'capitalize' }}
              >
                {f === 'all' ? 'All' : f === 'present' ? 'Present' : 'Absent'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', marginLeft: 'auto' }}>
            <button className="btn btn-sm btn-green" onClick={markAllPresent}>Mark All Present</button>
            <button className="btn btn-sm btn-red" onClick={markAllAbsent}>Mark All Absent</button>
            <button className="btn btn-sm btn-outline" onClick={() => { setSessionId(null); setSessionStudents([]); setSessionMeta(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
      </div>

      {/* Student Toggle Table */}
      <div className="panel">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <Users size={48} className="text-neutral-500" />
            </div>
            <p>No students match the filter</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Student</th>
                  <th>PRN</th>
                  <th>Class / Div</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Toggle</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const isPresent = s.status === 'present';
                  const isToggling = togglingPrn === s.prn;
                  return (
                    <tr key={s.prn} style={{ opacity: isToggling ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                      <td style={{ opacity: 0.4, fontSize: '0.8rem' }}>{i + 1}</td>
                      <td>
                        <div className="avatar-cell">
                          {s.image_link
                            ? <img className="avatar" src={s.image_link} alt={s.name} />
                            : <div className="avatar-initials">{initials(s.name)}</div>
                          }
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</div>
                            {s.email && <div style={{ fontSize: '0.72rem', opacity: 0.45 }}>{s.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td><span className="badge badge-blue">{s.prn}</span></td>
                      <td>{s.class} — {s.div}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${isPresent ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.78rem', minWidth: 80, justifyContent: 'center' }}>
                          {isPresent ? 'Present' : 'Absent'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="attendance-toggle-btn"
                          onClick={() => handleToggle(s.prn, s.status)}
                          disabled={isToggling}
                          aria-label={`Toggle ${s.name} attendance`}
                          style={{
                            width: 52,
                            height: 28,
                            borderRadius: 999,
                            border: 'none',
                            cursor: isToggling ? 'wait' : 'pointer',
                            position: 'relative',
                            background: isPresent ? '#10b981' : 'rgba(120,120,120,0.3)',
                            transition: 'background 0.3s ease',
                            padding: 0,
                          }}
                        >
                          <span style={{
                            position: 'absolute',
                            top: 3,
                            left: isPresent ? 27 : 3,
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                            transition: 'left 0.3s ease',
                          }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MARK ATTENDANCE (IMAGE) TAB
═══════════════════════════════════════════════ */
function AttendanceTab({ authHeaders, toast }) {
  // Session details state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('10:00');
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const [allStudents, setAllStudents] = useState([]);
  const [resultSearch, setResultSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');

  // Fetch all students on mount so we can show absent students too
  useEffect(() => {
    fetch(`${API}/students`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => setAllStudents(Array.isArray(data) ? data : data.students || []))
      .catch(() => {});
  }, [authHeaders]);

  const handleFiles = (incoming) => {
    const limited = Array.from(incoming).slice(0, 3);
    setFiles(limited);
    setPreviews(limited.map(f => URL.createObjectURL(f)));
    setResult(null);
  };

  const submit = async () => {
    if (!date) { toast('Please select a Date', 'error'); return; }
    if (!timeFrom) { toast('Please select a Time From', 'error'); return; }
    if (!timeTo) { toast('Please select a Time To', 'error'); return; }
    if (files.length === 0) { toast('Upload at least 1 group photo', 'error'); return; }
    setLoading(true);
    setResult(null);

    const fd = new FormData();
    files.forEach(f => fd.append('images', f));
    fd.append('date', date);
    fd.append('time_from', timeFrom);
    fd.append('time_to', timeTo);
    fd.append('subject', subject);
    fd.append('note', note);

    try {
      const res = await fetch(`${API}/mark_attendance/image`, {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        toast(`✅ ${data.message} — ${data.total_faces_detected} faces detected`);
        setResult(data);
      } else {
        toast(data.detail || 'Processing failed', 'error');
      }
    } catch {
      toast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Build full student attendance list from result
  const buildAttendanceTable = () => {
    if (!result) return [];
    const presentPrns = new Set((result.present_students || []).map(s => s.prn));
    const presentMap = {};
    (result.present_students || []).forEach(s => { presentMap[s.prn] = s; });

    return allStudents.map(s => ({
      prn: s.prn,
      name: s.name,
      class: s.class,
      div: s.div,
      email: s.email,
      image_link: s.image_link,
      status: presentPrns.has(s.prn) ? 'present' : 'absent',
      confidence: presentMap[s.prn]?.confidence || null,
      distance: presentMap[s.prn]?.distance || null,
    }));
  };

  const attendanceList = buildAttendanceTable();
  const filteredResults = attendanceList.filter(s => {
    const matchSearch =
      (s.name || '').toLowerCase().includes(resultSearch.toLowerCase()) ||
      (s.prn || '').toLowerCase().includes(resultSearch.toLowerCase());
    const matchFilter = resultFilter === 'all' || s.status === resultFilter;
    return matchSearch && matchFilter;
  });

  const initials = (name = '') => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div>
      <div className="panel">
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700 }}>Mark Attendance via AI</h2>
        <p style={{ fontSize: '0.85rem', opacity: 0.55, marginBottom: '1.5rem' }}>
          Upload up to 3 group photos and specify the session details. Attendance will be matched automatically.
        </p>

        <div className="form-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="form-group">
            <label>Date *</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Subject / Class</label>
            <input className="form-input" placeholder="e.g. Data Structures" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Time From *</label>
            <input className="form-input" type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Time To *</label>
            <input className="form-input" type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} required />
          </div>
          <div className="form-group form-full">
            <label>Note (Optional)</label>
            <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Guest lecture, Lab session" />
          </div>
        </div>

        <div
          className={`dash-upload-zone ${drag ? 'drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
        >
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => handleFiles(e.target.files)} />
          <div className="icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
            <Camera size={32} className="text-emerald-500" />
          </div>
          <h4>Drop group photos here (up to 3)</h4>
          <p style={{ marginTop: '4px' }}>More photos = better accuracy for partially hidden faces</p>
          {previews.length > 0 && (
            <div className="thumb-strip">
              {previews.map((p, i) => <img key={i} src={p} alt={`prev-${i}`} />)}
            </div>
          )}
        </div>

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn btn-green" onClick={submit} disabled={loading || files.length === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Processing AI Pipeline…</>
            ) : (
              <>
                <Sparkles size={16} /> Mark Attendance
              </>
            )}
          </button>
          {files.length > 0 && (
            <span style={{ fontSize: '0.82rem', opacity: 0.55 }}>{files.length} photo{files.length > 1 ? 's' : ''} selected</span>
          )}
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '0.75rem', opacity: 0.8 }}>
            <Loader2 size={32} className="text-emerald-500 animate-spin" />
            <p style={{ fontSize: '0.85rem' }}>Running MTCNN detection &amp; FaceNet embedding matching…</p>
          </div>
        )}

        {result && !loading && (
          <div style={{ marginTop: '1.5rem', animation: 'fadeIn 0.4s ease' }}>
            {/* Summary badges */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <span className="badge badge-green">{result.total_faces_detected} Faces Detected</span>
              <span className="badge badge-blue">{result.present_count} / {result.total_students} Present</span>
              <span className="badge badge-red">{result.total_students - result.present_count} Absent</span>
              {result.emails && (
                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Mail size={12} /> Emails: {result.emails.sent} sent, {result.emails.failed} failed
                </span>
              )}
            </div>

            {/* Annotated Group Photo */}
            {result.url && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', opacity: 0.8 }}>Annotated Group Photo</h3>
                <img src={result.url} alt="annotated group" style={{ width: '100%', maxWidth: 600, borderRadius: '12px', border: '2px solid rgba(16,185,129,0.3)' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Attendance Results Table (shown after AI processing) ── */}
      {result && !loading && attendanceList.length > 0 && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="section-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2>Attendance Results — {result.session_date}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="form-input"
                style={{ maxWidth: 220 }}
                placeholder="🔍 Search…"
                value={resultSearch}
                onChange={e => setResultSearch(e.target.value)}
              />
              {['all', 'present', 'absent'].map(f => (
                <button
                  key={f}
                  className={`btn btn-sm ${resultFilter === f ? 'btn-green' : 'btn-outline'}`}
                  onClick={() => setResultFilter(f)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {f === 'all' ? `All (${attendanceList.length})` : f === 'present' ? `Present (${attendanceList.filter(s => s.status === 'present').length})` : `Absent (${attendanceList.filter(s => s.status === 'absent').length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ margin: '1rem 0', background: 'rgba(0,0,0,0.08)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{
              width: `${attendanceList.length > 0 ? (result.present_count / attendanceList.length) * 100 : 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #10b981, #059669)',
              borderRadius: 999,
              transition: 'width 0.4s ease',
            }} />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th>Student</th>
                  <th>PRN</th>
                  <th>Class / Div</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((s, i) => {
                  const isPresent = s.status === 'present';
                  return (
                    <tr key={s.prn}>
                      <td style={{ opacity: 0.4, fontSize: '0.8rem' }}>{i + 1}</td>
                      <td>
                        <div className="avatar-cell">
                          {s.image_link
                            ? <img className="avatar" src={s.image_link} alt={s.name} />
                            : <div className="avatar-initials">{initials(s.name)}</div>
                          }
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</div>
                            {s.email && <div style={{ fontSize: '0.72rem', opacity: 0.45 }}>{s.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td><span className="badge badge-blue">{s.prn}</span></td>
                      <td>{s.class} — {s.div}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${isPresent ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.78rem', minWidth: 80, justifyContent: 'center' }}>
                          {isPresent ? 'Present' : 'Absent'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isPresent ? (
                          <div>
                            <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 700 }}>{s.confidence}%</div>
                            <div style={{ fontSize: '0.68rem', opacity: 0.4 }}>dist: {s.distance}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.78rem', opacity: 0.35 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ATTENDANCE RECORDS TAB
═══════════════════════════════════════════════ */
function RecordsTab({ authHeaders, toast }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchSessions = useCallback(() => {
    setLoading(true);
    fetch(`${API}/attendance`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => setSessions(Array.isArray(data) ? data : data.records || []))
      .catch(() => toast('Could not fetch records', 'error'))
      .finally(() => setLoading(false));
  }, [authHeaders, toast]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleDelete = async (session, e) => {
    e.stopPropagation();
    const sessionKey = session._id || session.session_id;
    if (!sessionKey) { toast('Cannot identify session ID', 'error'); return; }
    if (!window.confirm(`Delete session on ${session.date} (${session.subject || 'No subject'})? This cannot be undone.`)) return;
    setDeletingId(sessionKey);
    try {
      const res = await fetch(`${API}/attendance/${sessionKey}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const d = await res.json();
      if (res.ok) {
        toast(d.message || 'Session deleted');
        fetchSessions();
        if (expandedSession === sessionKey) setExpandedSession(null);
      } else {
        toast(d.detail || 'Delete failed', 'error');
      }
    } catch { toast('Network error', 'error'); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="panel">
      <div className="section-header">
        <h2>Attendance Sessions</h2>
        <span className="badge badge-blue">{sessions.length} sessions</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '75px', borderRadius: '8px', width: '100%' }} />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <FileSpreadsheet size={48} className="text-neutral-500" />
          </div>
          <p>No attendance records yet. Mark attendance to see data here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sessions.map((session, i) => {
            // Use a unique key per session — supports multiple sessions on the same date
            const sessionKey = session._id || session.session_id || `${session.date}-${session.time_from}-${i}`;
            const isExpanded = expandedSession === sessionKey;
            const isDeleting = deletingId === sessionKey;
            return (
              <div key={sessionKey} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', opacity: isDeleting ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                {/* Session Header */}
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-main)', cursor: 'pointer' }}
                  onClick={() => setExpandedSession(isExpanded ? null : sessionKey)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <ChevronRight size={18} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', opacity: 0.6 }} />
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {session.date}
                        {session.subject && <span style={{ fontWeight: 400, opacity: 0.7 }}>· {session.subject}</span>}
                        <span className={`badge ${session.method === 'ai' ? 'badge-blue' : 'badge-yellow'}`} style={{ fontSize: '0.65rem' }}>
                          {session.method === 'ai' ? '🤖 AI' : '✍ Manual'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                        {session.time_from && session.time_to && `${session.time_from} – ${session.time_to} · `}
                        Total: {session.total_students || (session.students?.length || 0)} students
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge badge-green">{session.present_count} Present</span>
                    {session.absent_count > 0 && <span className="badge badge-red">{session.absent_count} Absent</span>}
                    {session.photo_url && (
                      <a href={session.photo_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#3b82f6', fontSize: '0.82rem' }}>Photo ↗</a>
                    )}
                    <button
                      className="btn btn-sm btn-red"
                      onClick={e => handleDelete(session, e)}
                      disabled={isDeleting}
                      title="Delete this session"
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}
                    >
                      {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Student List */}
                {isExpanded && session.students && (
                  <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table" style={{ margin: 0 }}>
                        <thead>
                          <tr><th>Student</th><th>PRN</th><th>Class / Div</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {session.students.map((r, idx) => (
                            <tr key={idx}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {r.image_link
                                    ? <img src={r.image_link} alt={r.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                                    : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#10b981' }}>
                                        {(r.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)}
                                      </div>
                                  }
                                  <span style={{ fontWeight: 500 }}>{r.name || '—'}</span>
                                </div>
                              </td>
                              <td><span className="badge badge-blue">{r.prn}</span></td>
                              <td>{r.class} — {r.div}</td>
                              <td>
                                <span className={`badge ${r.status === 'present' ? 'badge-green' : 'badge-red'}`}>
                                  {r.status === 'present' ? '✓ Present' : '✗ Absent'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROOT DASHBOARD
═══════════════════════════════════════════════ */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { headers: authHeaders, token } = useAuth();
  const { toasts, add: toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('attendsnap-theme') !== 'light'
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const adminEmail = (() => {
    try { return JSON.parse(atob(token.split('.')[1])).sub; } catch { return 'Admin'; }
  })();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('attendsnap-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const logout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const tabProps = { authHeaders, toast };

  const tabMap = {
    overview: <OverviewTab {...tabProps} />,
    students: <StudentsTab {...tabProps} />,
    add_student: <AddStudentTab {...tabProps} />,
    attendance: <AttendanceTab {...tabProps} />,
    manual: <ManualAttendanceTab {...tabProps} />,
    records: <RecordsTab {...tabProps} />,
  };

  const activeLabel = NAV.find(n => n.id === activeTab)?.label || 'Dashboard';

  return (
    <div className="dash-shell">

      {/* ── SIDEBAR ── */}
      <aside className={`dash-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '1rem 1.5rem' }}>
          <img src="/logo.png" style={{ height: '32px', width: '32px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.2)' }} alt="Logo" />
          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>AttendSnap</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize: '0.78rem', opacity: 0.45, padding: '0 0.5rem 0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {adminEmail}
          </div>
          <button className="sidebar-item" onClick={logout} style={{ color: '#ef4444', opacity: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LogOut size={16} /> Sign Out
          </button>
          <button className="sidebar-item" onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HomeIcon size={16} /> Home
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="dash-main">

        {/* Topbar */}
        <div className="dash-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <span className="topbar-title">{activeLabel}</span>
          </div>
          <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => setDarkMode(!darkMode)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s', color: 'var(--text-main)' }}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="badge badge-green">● Live</span>
          </div>
        </div>

        {/* Content */}
        <div className="dash-content">
          {tabMap[activeTab]}
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
