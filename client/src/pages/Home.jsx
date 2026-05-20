import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Zap, ArrowRight, Shield, RefreshCw, CheckCircle, XCircle, Users, User, ArrowLeftRight, Camera, Search, Cpu } from 'lucide-react';
import '../css/LandingPage.css';

/* ───────────────────────────────────────────────
   Mini 3-D canvas scene using plain WebGL / canvas
   (no heavy lib needed – just rotating nodes)
   (same, keeping node structure)
─────────────────────────────────────────────── */
function HeroCanvas({ darkMode }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Create floating nodes simulating face-embedding graph
    const NODE_COUNT = 24;
    const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: 4 + Math.random() * 5,
      phase: Math.random() * Math.PI * 2,
      isAnchor: i < 4,
    }));

    let t = 0;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      t += 0.012;

      // Update positions
      nodes.forEach(n => {
        if (!n.isAnchor) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > W) n.vx *= -1;
          if (n.y < 0 || n.y > H) n.vy *= -1;
        } else {
          // Anchor nodes pulse around fixed spots
          const centers = [
            { cx: W * 0.18, cy: H * 0.4 },
            { cx: W * 0.5, cy: H * 0.2 },
            { cx: W * 0.82, cy: H * 0.4 },
            { cx: W * 0.5, cy: H * 0.78 },
          ];
          const c = centers[nodes.indexOf(n)];
          n.x = c.cx + Math.sin(t + n.phase) * 14;
          n.y = c.cy + Math.cos(t * 0.7 + n.phase) * 10;
        }
      });

      // Draw edges
      const edgeColor = darkMode ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.2)';
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = edgeColor;
            ctx.lineWidth = 1;
            ctx.globalAlpha = (1 - dist / 140) * 0.8;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      // Draw nodes
      nodes.forEach((n, i) => {
        const pulse = 0.85 + 0.15 * Math.sin(t * 1.5 + n.phase);
        const radius = n.r * pulse;

        // Glow
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius * 3.5);
        grad.addColorStop(0, n.isAnchor ? 'rgba(16,185,129,0.35)' : 'rgba(99,102,241,0.2)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = n.isAnchor ? '#10b981' : (darkMode ? '#6366f1' : '#818cf8');
        ctx.fill();
      });

      // Labels on anchor nodes
      const labels = ['MTCNN', 'FaceNet', 'TensorFlow', 'Computer Vision'];
      const anchors = nodes.filter(n => n.isAnchor);
      anchors.forEach((n, i) => {
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.75)' : 'rgba(15,23,42,0.75)';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], n.x, n.y + n.r * 3.2);
      });

      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animId);
  }, [darkMode]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', borderRadius: '24px', display: 'block' }}
    />
  );
}

/* ───────────────────────────────────────────────
   Scroll reveal hook
─────────────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.12 }
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ───────────────────────────────────────────────
   Upload Zone sub-component
─────────────────────────────────────────────── */
function UploadZone({ label, icon, accept, multiple, maxFiles, previews, onChange }) {
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    const limited = Array.from(files).slice(0, maxFiles);
    onChange(limited);
  };

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={e => handleFiles(e.target.files)}
      />
      <div className="upload-zone-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>{icon}</div>
      <h4>{label}</h4>
      <p style={{ marginTop: '4px' }}>{multiple ? `Up to ${maxFiles} images` : 'One clear photo'}</p>
      {previews.length > 0 && (
        <div className="upload-preview">
          {previews.map((src, i) => <img key={i} src={src} alt={`preview-${i}`} />)}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────
   Main Home Page (Renamed from LandingPage)
─────────────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('attendsnap-theme') !== 'light'
  );

  // Trial state
  const [portraitFiles, setPortraitFiles] = useState([]);
  const [groupFiles, setGroupFiles] = useState([]);
  const [portraitPreviews, setPortraitPreviews] = useState([]);
  const [groupPreviews, setGroupPreviews] = useState([]);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState('');
  const [trialResult, setTrialResult] = useState(null);

  useReveal();

  // Theme toggle
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('attendsnap-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Build preview URLs
  const buildPreviews = (files) => files.map(f => URL.createObjectURL(f));

  const handlePortraitChange = (files) => {
    setPortraitFiles(files);
    setPortraitPreviews(buildPreviews(files));
    setTrialResult(null);
  };

  const handleGroupChange = (files) => {
    setGroupFiles(files);
    setGroupPreviews(buildPreviews(files));
    setTrialResult(null);
  };

  const runTrial = async () => {
    if (portraitFiles.length === 0) { setTrialError('Please upload a portrait photo.'); return; }
    if (groupFiles.length === 0) { setTrialError('Please upload at least one group photo.'); return; }

    setTrialError('');
    setTrialLoading(true);
    setTrialResult(null);

    const form = new FormData();
    portraitFiles.forEach(f => form.append('portraits', f));
    groupFiles.forEach(f => form.append('group_photos', f));

    try {
      const res = await fetch('http://localhost:8000/api/student/trial', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Processing failed');
      }
      const data = await res.json();
      setTrialResult(data);
    } catch (e) {
      setTrialError(e.message || 'An error occurred. Make sure the backend is running.');
    } finally {
      setTrialLoading(false);
    }
  };

  const steps = [
    { icon: <Camera size={28} className="text-emerald-500" />, title: 'Upload Photos', desc: 'Admin uploads 1–3 group photos per session. More photos = better accuracy for partially hidden faces.' },
    { icon: <Search size={28} className="text-emerald-500" />, title: 'MTCNN Detection', desc: 'Our MTCNN model locates every face in the photo with precise bounding boxes, even in crowd shots.' },
    { icon: <Cpu size={28} className="text-emerald-500" />, title: 'FaceNet Embeddings', desc: 'Each face is converted into a 128-dimensional vector that uniquely encodes facial geometry.' },
    { icon: <CheckCircle size={28} className="text-emerald-500" />, title: 'Cosine Matching', desc: 'Registered student embeddings are compared using cosine similarity. Attendance is marked instantly.' },
  ];

  const stats = [
    { value: '99.8%', label: 'Detection Accuracy' },
    { value: '<1s', label: 'Per Face Latency' },
    { value: '512D', label: 'Embedding Vector' },
    { value: '3×', label: 'Max Group Photos' },
  ];

  return (
    <div className="landing-root">

      {/* ── NAVBAR ── */}
      <nav className="lp-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => navigate('/')}>
          <img src="/logo.png" style={{ height: '36px', width: '36px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }} alt="Logo" />
          <span className="lp-nav-logo" style={{ border: 'none', padding: 0 }}>AttendSnap</span>
        </div>
        <ul className="lp-nav-links">
          <li><a href="#how">How It Works</a></li>
          <li><a href="#trial">Live Demo</a></li>
          <li><a href="#admin">Admin</a></li>
          <li><a href="/student" onClick={e => { e.preventDefault(); navigate('/student'); }}>Student Portal</a></li>
        </ul>
        <div className="lp-nav-actions">
          <button className="btn-theme" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle theme">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="btn-ghost" onClick={() => navigate('/student')}>Student Portal</button>
          <button className="btn-ghost" onClick={() => navigate('/admin/login')}>Sign In</button>
          <button className="btn-primary" onClick={() => navigate('/admin/register')}>Get Started</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="blob blob-1" />
        <div className="blob blob-2" />

        <div className="lp-hero-badge" style={{ position: 'relative', zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} className="text-emerald-500" /> AI-Powered Automated Attendance
        </div>

        <h1 style={{ position: 'relative', zIndex: 2 }}>
          Mark Attendance with<br />
          <span className="accent">Facial Recognition</span>
        </h1>

        <p style={{ position: 'relative', zIndex: 2 }}>
          Upload a group photo and let AttendSnap's AI detect, match, and record
          attendance in under a second — zero manual effort required.
        </p>

        <div className="lp-hero-actions" style={{ position: 'relative', zIndex: 2 }}>
          <button className="btn-primary" onClick={() => document.getElementById('trial').scrollIntoView({ behavior: 'smooth' })}>
            Try Live Demo <ArrowRight size={16} />
          </button>
          <button className="btn-ghost" onClick={() => document.getElementById('how').scrollIntoView({ behavior: 'smooth' })}>
            See How It Works
          </button>
        </div>

        <div className="hero-3d-scene" style={{ position: 'relative', zIndex: 2 }}>
          <HeroCanvas darkMode={darkMode} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how">
        <div className="lp-section">
          <p className="lp-section-label reveal">The Process</p>
          <h2 className="lp-section-title reveal">How AttendSnap Works</h2>
          <p className="lp-section-sub reveal">
            Four precise AI steps from photo to attendance record — all in real time.
          </p>

          <div className="steps-grid">
            {steps.map((s, i) => (
              <div key={i} className={`step-card reveal reveal-delay-${i + 1}`}>
                <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="stats-row reveal" style={{ marginTop: '3rem' }}>
            {stats.map((s, i) => (
              <div key={i} className="stat-item">
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE TRIAL DEMO ── */}
      <section className="trial-section" id="trial">
        <div className="trial-inner">
          <p className="lp-section-label reveal" style={{ textAlign: 'center' }}>Interactive Demo</p>
          <h2 className="lp-section-title reveal" style={{ textAlign: 'center' }}>Try It Yourself — No Account Needed</h2>
          <p className="lp-section-sub reveal" style={{ textAlign: 'center', margin: '0 auto 2.5rem' }}>
            Upload a portrait photo and up to 2 group photos. We'll detect faces,
            match the person, and show you the confidence scores live.
          </p>

          <div className="trial-upload-grid reveal">
            <UploadZone
              label="Portrait / Selfie (1–2 angles)"
              icon={<User size={36} className="text-emerald-500" />}
              accept="image/jpeg,image/png,image/webp"
              multiple={true}
              maxFiles={2}
              previews={portraitPreviews}
              onChange={handlePortraitChange}
            />
            <UploadZone
              label="Group Photos"
              icon={<Users size={36} className="text-emerald-500" />}
              accept="image/jpeg,image/png,image/webp"
              multiple={true}
              maxFiles={2}
              previews={groupPreviews}
              onChange={handleGroupChange}
            />
          </div>

          {trialError && (
            <div style={{
              textAlign: 'center', color: '#ef4444',
              fontSize: '0.9rem', marginBottom: '1rem',
              background: 'rgba(239,68,68,0.08)', borderRadius: '12px', padding: '0.75rem 1rem'
            }}>
              {trialError}
            </div>
          )}

          <div className="trial-btn-row reveal">
            <button
              className="btn-primary"
              onClick={runTrial}
              disabled={trialLoading}
              style={{ fontSize: '1rem', padding: '0.8rem 2rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              {trialLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <Cpu size={16} /> Run Face Match
                </>
              )}
            </button>
          </div>

          {/* Loading */}
          {trialLoading && (
            <div className="trial-spinner">
              <div className="spinner-ring" />
              <p style={{ fontSize: '0.9rem' }}>Running MTCNN detection & FaceNet embedding comparison…</p>
            </div>
          )}

          {/* Results */}
          {trialResult && !trialLoading && (
            <div className="trial-results reveal visible">

              {/* Left: portrait + verdict */}
              <div className="result-card">
                <h3>Match Result</h3>

                <div className="portrait-comparison">
                  <div className="portrait-face">
                    <img src={trialResult.portrait_face_b64} alt="Detected portrait face" />
                    <span>Your Photo</span>
                  </div>
                  <div className="match-arrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {trialResult.person_found ? <ArrowLeftRight size={24} className="text-emerald-500" /> : <XCircle size={24} className="text-red-500" />}
                  </div>
                  <div className="portrait-face">
                    {trialResult.face_cards?.[0] && (
                      <img src={trialResult.face_cards[0].face_b64} alt="Best matched face" />
                    )}
                    <span>Best Match</span>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '1.6rem' }}>
                  <div className={`confidence-badge ${trialResult.person_found ? 'found' : 'not-found'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '20px', fontWeight: 600 }}>
                    {trialResult.person_found ? <CheckCircle size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-500" />}
                    {trialResult.person_found
                      ? `Person Found — ${trialResult.best_confidence}% confidence`
                      : `No Match — ${trialResult.best_confidence}% best score`}
                  </div>
                </div>

                {/* All face cards */}
                <h3 style={{ marginTop: '1.5rem' }}>All Detected Faces</h3>
                <div className="face-cards-grid">
                  {trialResult.face_cards?.map((fc, i) => (
                    <div key={i} className={`face-card ${fc.is_match ? 'match' : ''}`}>
                      <img src={fc.face_b64} alt={`face-${i}`} />
                      <div className="face-card-score">{fc.confidence}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: annotated group photo */}
              <div className="result-card">
                <h3>Annotated Group Photo — {trialResult.faces_in_group} Face{trialResult.faces_in_group !== 1 ? 's' : ''} Detected</h3>
                <img src={trialResult.annotated_group_b64} alt="Annotated group" />
                <p style={{ fontSize: '0.78rem', opacity: 0.5, marginTop: '0.75rem' }}>
                  Green Box = matched &nbsp;|&nbsp; White Box = other faces detected
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        © {new Date().getFullYear()} AttendSnap · AI-Powered Attendance · Built with FaceNet & MTCNN
        &nbsp;·&nbsp;
        <a href="/student" onClick={e => { e.preventDefault(); navigate('/student'); }} style={{ color: '#10b981', textDecoration: 'none' }}>Student Portal</a>
      </footer>
    </div>
  );
}
