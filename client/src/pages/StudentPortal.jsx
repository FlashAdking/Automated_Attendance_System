import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sun, Moon, User, Search, CheckCircle2, XCircle, CalendarRange,
  ArrowLeft, BookOpen, Phone, Mail, ChevronDown, ChevronUp, Percent
} from 'lucide-react';
import '../css/StudentPortal.css';

const API = 'http://localhost:8000/api/student';

/* ── Tiny donut SVG drawn in-browser ── */
function DonutChart({ percentage }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (percentage / 100) * circ;
  const color = percentage >= 75 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="sp-donut-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        {/* Track */}
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
        {/* Progress */}
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 8px ${color}80)` }}
        />
        {/* Center text */}
        <text x="70" y="64" textAnchor="middle" fill={color} fontSize="26" fontWeight="700" fontFamily="Inter,sans-serif">
          {percentage.toFixed(0)}%
        </text>
        <text x="70" y="82" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11" fontFamily="Inter,sans-serif">
          Attendance
        </text>
      </svg>
    </div>
  );
}

/* ── History row (accordion per session) ── */
function HistoryRow({ record, index }) {
  const isPresent = record.status === 'present';
  const dateStr = record.date ? record.date.slice(0, 10) : '—';
  const method = record.method === 'ai' ? '🤖 AI' : '✍ Manual';

  return (
    <div className={`sp-history-row ${isPresent ? 'present' : 'absent'}`}>
      <div className="sp-history-num">{index + 1}</div>
      <div className="sp-history-date">
        <span className="sp-history-datestr">{dateStr}</span>
        {record.subject && <span className="sp-history-subject">{record.subject}</span>}
      </div>
      <div className="sp-history-time">
        {record.time_from && record.time_to
          ? `${record.time_from} – ${record.time_to}`
          : '—'}
      </div>
      <div className="sp-history-method">{method}</div>
      <div className="sp-history-status">
        <span className={`sp-badge ${isPresent ? 'sp-badge-green' : 'sp-badge-red'}`}>
          {isPresent ? '✓ Present' : '✗ Absent'}
        </span>
      </div>
    </div>
  );
}

export default function StudentPortal() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('attendsnap-theme') !== 'light'
  );

  /* Form state */
  const [prn, setPrn] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* Result state */
  const [profile, setProfile] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('attendsnap-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleLookup = async (e) => {
    e.preventDefault();
    setError('');
    setProfile(null);
    if (!prn.trim() || !dob) { setError('Both PRN and Date of Birth are required.'); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ prn: prn.trim(), dob });
      const res = await fetch(`${API}/lookup?${params}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setProfile(data);
        setHistoryFilter('all');
        setHistorySearch('');
        setShowAll(false);
      } else {
        setError(data.detail || 'Could not find your record. Check PRN and Date of Birth.');
      }
    } catch {
      setError('Network error — make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  /* Filtered history */
  const filteredHistory = profile
    ? profile.history
        .filter(r => {
          const matchFilter = historyFilter === 'all' || r.status === historyFilter;
          const matchSearch =
            !historySearch ||
            (r.subject || '').toLowerCase().includes(historySearch.toLowerCase()) ||
            (r.date || '').includes(historySearch);
          return matchFilter && matchSearch;
        })
        .slice()
        .reverse() // newest first
    : [];

  const visibleHistory = showAll ? filteredHistory : filteredHistory.slice(0, 10);

  const summary = profile?.summary || {};
  const pct = summary.attendance_percentage || 0;
  const pctColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="sp-root">
      {/* Nav */}
      <nav className="sp-nav">
        <div className="sp-nav-logo" onClick={() => navigate('/')}>
          <img src="/logo.png" alt="Logo" style={{ height: 32, width: 32, borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)' }} />
          <span>AttendSnap</span>
        </div>
        <div className="sp-nav-actions">
          <button className="sp-btn-theme" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle theme">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="sp-btn-ghost" onClick={() => navigate('/admin/login')}>Admin Login</button>
          <button className="sp-btn-ghost" onClick={() => navigate('/')}>← Home</button>
        </div>
      </nav>

      <main className="sp-main">
        {/* Page header */}
        <div className="sp-page-header">
          <div className="sp-page-icon"><User size={28} /></div>
          <div>
            <h1>Student Attendance Portal</h1>
            <p>Enter your PRN and Date of Birth to view your attendance records.</p>
          </div>
        </div>

        {/* Lookup form */}
        {!profile && (
          <div className="sp-card sp-lookup-card">
            <form onSubmit={handleLookup} className="sp-lookup-form">
              <div className="sp-field">
                <label htmlFor="sp-prn">PRN / Roll Number</label>
                <input
                  id="sp-prn"
                  className="sp-input"
                  placeholder="e.g. PRN123456"
                  value={prn}
                  onChange={e => setPrn(e.target.value)}
                  required
                />
              </div>
              <div className="sp-field">
                <label htmlFor="sp-dob">Date of Birth</label>
                <input
                  id="sp-dob"
                  type="date"
                  className="sp-input"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="sp-error">{error}</div>
              )}
              <button type="submit" className="sp-btn-primary" disabled={loading}>
                {loading
                  ? <><span className="sp-spinner" /> Looking up…</>
                  : <><Search size={16} /> View My Attendance</>}
              </button>
            </form>
            <div className="sp-lookup-hint">
              <span>🔒</span> Your identity is verified using PRN + Date of Birth. No password required.
            </div>
          </div>
        )}

        {/* Profile result */}
        {profile && (
          <>
            {/* Student card */}
            <div className="sp-card sp-profile-card">
              <div className="sp-profile-left">
                {profile.image_link
                  ? <img src={profile.image_link} alt={profile.name} className="sp-avatar" />
                  : (
                    <div className="sp-avatar-initials">
                      {(profile.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )
                }
                <div className="sp-profile-info">
                  <h2>{profile.name}</h2>
                  <div className="sp-profile-meta">
                    <span className="sp-badge sp-badge-blue">{profile.prn}</span>
                    <span className="sp-badge sp-badge-neutral">{profile.class} · {profile.div}</span>
                    <span className="sp-badge sp-badge-neutral">{profile.gender}</span>
                  </div>
                  <div className="sp-profile-contacts">
                    {profile.email && <span><Mail size={13} /> {profile.email}</span>}
                    {profile.contact && <span><Phone size={13} /> {profile.contact}</span>}
                  </div>
                </div>
              </div>

              {/* Right: donut + stats */}
              <div className="sp-profile-right">
                <DonutChart percentage={pct} />
                <div className="sp-stat-row">
                  <div className="sp-stat-box">
                    <div className="sp-stat-val" style={{ color: '#60a5fa' }}>{summary.total_sessions || 0}</div>
                    <div className="sp-stat-label">Total</div>
                  </div>
                  <div className="sp-stat-box">
                    <div className="sp-stat-val" style={{ color: '#10b981' }}>{summary.present_count || 0}</div>
                    <div className="sp-stat-label">Present</div>
                  </div>
                  <div className="sp-stat-box">
                    <div className="sp-stat-val" style={{ color: '#ef4444' }}>{summary.absent_count || 0}</div>
                    <div className="sp-stat-label">Absent</div>
                  </div>
                </div>
                {pct < 75 && (
                  <div className="sp-warning">
                    ⚠️ Attendance below 75% — contact your administrator.
                  </div>
                )}
              </div>
            </div>

            {/* History table */}
            <div className="sp-card">
              <div className="sp-history-header">
                <h3><CalendarRange size={18} /> Session History</h3>
                <div className="sp-history-controls">
                  <input
                    className="sp-input sp-search"
                    placeholder="Search subject / date…"
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                  />
                  <div className="sp-filter-group">
                    {['all', 'present', 'absent'].map(f => (
                      <button
                        key={f}
                        className={`sp-filter-btn ${historyFilter === f ? 'active' : ''}`}
                        onClick={() => setHistoryFilter(f)}
                        style={historyFilter === f ? { background: f === 'absent' ? '#ef4444' : '#10b981' } : {}}
                      >
                        {f === 'all' ? `All (${profile.history.length})`
                          : f === 'present' ? `✓ Present (${summary.present_count || 0})`
                          : `✗ Absent (${summary.absent_count || 0})`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="sp-empty">
                  <CalendarRange size={40} opacity={0.3} />
                  <p>No records match the filter.</p>
                </div>
              ) : (
                <>
                  <div className="sp-history-table-head">
                    <div className="sp-history-num">#</div>
                    <div className="sp-history-date">Date · Subject</div>
                    <div className="sp-history-time">Time</div>
                    <div className="sp-history-method">Method</div>
                    <div className="sp-history-status">Status</div>
                  </div>
                  <div className="sp-history-list">
                    {visibleHistory.map((r, i) => (
                      <HistoryRow key={i} record={r} index={i} />
                    ))}
                  </div>
                  {filteredHistory.length > 10 && (
                    <button className="sp-show-more" onClick={() => setShowAll(!showAll)}>
                      {showAll
                        ? <><ChevronUp size={16} /> Show less</>
                        : <><ChevronDown size={16} /> Show all {filteredHistory.length} records</>}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Back / re-lookup */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button className="sp-btn-ghost" onClick={() => { setProfile(null); setPrn(''); setDob(''); setError(''); }}>
                <ArrowLeft size={16} /> Look up another student
              </button>
            </div>
          </>
        )}
      </main>

      <footer className="sp-footer">
        © {new Date().getFullYear()} AttendSnap · Student Self-Service Portal
      </footer>
    </div>
  );
}
