/**
 * StudentPortal.test.jsx
 *
 * Tests for the Student self-service portal:
 * - Initial lookup form renders correctly
 * - Successful lookup renders profile card + history
 * - Wrong DOB shows error
 * - PRN not found shows error
 * - Server 429 rate-limit response shows friendly message
 * - Client-side rate-limit blocks button and shows countdown
 * - Client-side attempt() returning false prevents fetch
 * - Attendance summary metrics display correctly
 * - History filter (all / present / absent) works
 * - Search filter works
 * - "Look up another student" resets the form
 * - Low attendance warning appears when % < 75
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StudentPortal from '../pages/StudentPortal';

// ── Mock useRateLimit ─────────────────────────────────────────────────────────
// We mock the module once. Each beforeEach resets it to the "allow all" default
// so that mockReturnValue overrides from one suite don't bleed into another.
// (vi.clearAllMocks() clears call counts but NOT mockReturnValue overrides.)
vi.mock('../utils/useRateLimit', () => ({
  useRateLimit: vi.fn(),
  formatCooldown: vi.fn((ms) => `${Math.ceil(ms / 1000)}s`),
}));

import { useRateLimit } from '../utils/useRateLimit';

// Default rate-limit state: every call is allowed, button is enabled
const RL_ALLOW = {
  attempt: vi.fn(() => true),
  blocked: false,
  remainingMs: 0,
};

// ── Sample API response ───────────────────────────────────────────────────────
const MOCK_PROFILE = {
  prn: 'PRN001',
  name: 'Alice Smith',
  class: 'SE',
  div: 'A',
  email: 'alice@college.edu',
  contact: '9876543210',
  gender: 'Female',
  image_link: '',
  summary: {
    total_sessions: 5,
    present_count: 3,
    absent_count: 2,
    attendance_percentage: 60.0,
  },
  history: [
    { date: '2026-05-01', status: 'present', method: 'ai',     subject: 'Data Structures', time_from: '09:00', time_to: '10:00' },
    { date: '2026-05-02', status: 'absent',  method: 'manual', subject: 'Algorithms',      time_from: '10:00', time_to: '11:00' },
    { date: '2026-05-03', status: 'present', method: 'ai',     subject: 'Data Structures', time_from: '09:00', time_to: '10:00' },
    { date: '2026-05-04', status: 'absent',  method: 'manual', subject: 'OS',              time_from: '11:00', time_to: '12:00' },
    { date: '2026-05-05', status: 'present', method: 'ai',     subject: 'Data Structures', time_from: '09:00', time_to: '10:00' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockFetch(ok, data, status = ok ? 200 : 400) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  });
}

function renderPortal() {
  return render(
    <MemoryRouter initialEntries={['/student']}>
      <StudentPortal />
    </MemoryRouter>
  );
}

/**
 * Fill PRN + DOB and submit via the form element so it works regardless of
 * whatever text/icon the button currently shows.
 */
async function submitLookup(prn = 'PRN001', dob = '2002-05-15') {
  const prnInput = screen.getByLabelText(/prn/i);
  const dobInput = screen.getByLabelText(/date of birth/i);
  await userEvent.type(prnInput, prn);
  fireEvent.change(dobInput, { target: { value: dob } });
  fireEvent.submit(prnInput.closest('form'));
}

// ── Reset useRateLimit to "allow all" before every test ───────────────────────
// This ensures mockReturnValue overrides from one suite don't leak into the next.
beforeEach(() => {
  useRateLimit.mockReturnValue({ ...RL_ALLOW, attempt: vi.fn(() => true) });
});


// ═════════════════════════════════════════════════════════════════════════════
describe('StudentPortal — Initial Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useRateLimit.mockReturnValue({ ...RL_ALLOW, attempt: vi.fn(() => true) });
  });

  it('renders the heading', () => {
    renderPortal();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/student attendance portal/i);
  });

  it('renders PRN and DOB fields', () => {
    renderPortal();
    expect(screen.getByLabelText(/prn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
  });

  it('renders the lookup submit button', () => {
    renderPortal();
    expect(screen.getByRole('button', { name: /view my attendance/i })).toBeInTheDocument();
  });

  it('shows nav links to home and admin login', () => {
    renderPortal();
    expect(screen.getByText(/admin login/i)).toBeInTheDocument();
    expect(screen.getByText(/home/i)).toBeInTheDocument();
  });

  it('shows the identity-verification hint text', () => {
    renderPortal();
    expect(screen.getByText(/verified using prn/i)).toBeInTheDocument();
  });
});


// ═════════════════════════════════════════════════════════════════════════════
describe('StudentPortal — Successful Lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useRateLimit.mockReturnValue({ ...RL_ALLOW, attempt: vi.fn(() => true) });
    mockFetch(true, MOCK_PROFILE);
  });

  it('shows student name after lookup', async () => {
    renderPortal();
    await submitLookup();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /alice smith/i })).toBeInTheDocument();
    });
  });

  it('shows PRN badge', async () => {
    renderPortal();
    await submitLookup();
    await waitFor(() => {
      expect(screen.getByText('PRN001')).toBeInTheDocument();
    });
  });

  it('shows attendance percentage', async () => {
    renderPortal();
    await submitLookup();
    await waitFor(() => {
      expect(screen.getByText(/60%/)).toBeInTheDocument();
    });
  });

  it('shows total / present / absent counts', async () => {
    renderPortal();
    await submitLookup();
    await waitFor(() => {
      expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows low-attendance warning when pct < 75', async () => {
    renderPortal();
    await submitLookup();
    await waitFor(() => {
      expect(screen.getByText(/attendance below 75%/i)).toBeInTheDocument();
    });
  });

  it('does NOT show warning when attendance is high', async () => {
    mockFetch(true, {
      ...MOCK_PROFILE,
      summary: { ...MOCK_PROFILE.summary, attendance_percentage: 90 },
    });
    renderPortal();
    await submitLookup();
    await waitFor(() => {
      expect(screen.queryByText(/attendance below 75%/i)).not.toBeInTheDocument();
    });
  });

  it('shows session history rows (newest-first)', async () => {
    renderPortal();
    await submitLookup();
    await waitFor(() => {
      expect(screen.getByText('2026-05-05')).toBeInTheDocument();
    });
  });
});


// ═════════════════════════════════════════════════════════════════════════════
describe('StudentPortal — Error States', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useRateLimit.mockReturnValue({ ...RL_ALLOW, attempt: vi.fn(() => true) });
  });

  it('shows error for wrong DOB (401)', async () => {
    mockFetch(false, { detail: 'PRN and Date of Birth do not match' }, 401);
    renderPortal();
    await submitLookup('PRN001', '1990-01-01');
    await waitFor(() => {
      expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    });
  });

  it('shows error for unknown PRN (404)', async () => {
    mockFetch(false, { detail: 'Student not found' }, 404);
    renderPortal();
    await submitLookup('FAKE999', '2002-01-01');
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('shows network error message', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPortal();

    // Wrap in act so the rejected-promise state update is flushed cleanly
    await act(async () => {
      await submitLookup();
    });

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('shows rate-limit message on server 429', async () => {
    mockFetch(false, { detail: 'Rate limit exceeded' }, 429);
    renderPortal();
    await submitLookup();
    await waitFor(() => {
      expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
    });
  });
});


// ═════════════════════════════════════════════════════════════════════════════
describe('StudentPortal — Client-side Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Start each test from the "allow" default so state is deterministic
    useRateLimit.mockReturnValue({ ...RL_ALLOW, attempt: vi.fn(() => true) });
  });

  it('button is enabled when not blocked', () => {
    renderPortal();
    expect(screen.getByRole('button', { name: /view my attendance/i })).toBeEnabled();
  });

  it('button is disabled and shows countdown when rate-limited', () => {
    useRateLimit.mockReturnValue({
      attempt: vi.fn(() => false),
      blocked: true,
      remainingMs: 42_000,
    });

    renderPortal();

    const btn = screen.getByRole('button', { name: /wait/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/wait/i);
  });

  it('attempt() returning false prevents fetch call', async () => {
    const attemptSpy = vi.fn(() => false);
    // blocked: false so the button stays enabled and is clickable
    useRateLimit.mockReturnValue({ attempt: attemptSpy, blocked: false, remainingMs: 0 });

    global.fetch = vi.fn();
    renderPortal();

    const prnInput = screen.getByLabelText(/prn/i);
    await userEvent.type(prnInput, 'PRN001');
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: '2002-05-15' } });
    fireEvent.submit(prnInput.closest('form'));

    await waitFor(() => expect(attemptSpy).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows error text when attempt() returns false', async () => {
    const attemptSpy = vi.fn(() => false);
    useRateLimit.mockReturnValue({ attempt: attemptSpy, blocked: false, remainingMs: 5_000 });

    renderPortal();

    const prnInput = screen.getByLabelText(/prn/i);
    await userEvent.type(prnInput, 'PRN001');
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: '2002-05-15' } });
    fireEvent.submit(prnInput.closest('form'));

    await waitFor(() => {
      expect(screen.getByText(/too many lookups/i)).toBeInTheDocument();
    });
  });
});


// ═════════════════════════════════════════════════════════════════════════════
describe('StudentPortal — History Filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useRateLimit.mockReturnValue({ ...RL_ALLOW, attempt: vi.fn(() => true) });
    mockFetch(true, MOCK_PROFILE);
  });

  it('filter "present" shows only present rows', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => expect(screen.getByText('2026-05-05')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /✓ present/i }));

    const historyList = document.querySelector('.sp-history-list');
    await waitFor(() => {
      expect(historyList.querySelectorAll('.sp-badge-green').length).toBeGreaterThan(0);
      expect(historyList.querySelectorAll('.sp-badge-red').length).toBe(0);
    });
  });

  it('filter "absent" shows only absent rows', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => expect(screen.getByText('2026-05-05')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /✗ absent/i }));

    const historyList = document.querySelector('.sp-history-list');
    await waitFor(() => {
      expect(historyList.querySelectorAll('.sp-badge-red').length).toBeGreaterThan(0);
      expect(historyList.querySelectorAll('.sp-badge-green').length).toBe(0);
    });
  });

  it('filter "all" restores all rows after a filter', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => expect(screen.getByText('2026-05-05')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /✓ present/i }));
    fireEvent.click(screen.getByRole('button', { name: /^all/i }));

    const historyList = document.querySelector('.sp-history-list');
    await waitFor(() => {
      expect(historyList.querySelectorAll('.sp-badge-green').length).toBeGreaterThan(0);
      expect(historyList.querySelectorAll('.sp-badge-red').length).toBeGreaterThan(0);
    });
  });

  it('search by subject filters rows', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'Algorithms');

    await waitFor(() => {
      expect(screen.getByText('Algorithms')).toBeInTheDocument();
      expect(screen.queryByText('Data Structures')).not.toBeInTheDocument();
    });
  });
});


// ═════════════════════════════════════════════════════════════════════════════
describe('StudentPortal — Re-lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useRateLimit.mockReturnValue({ ...RL_ALLOW, attempt: vi.fn(() => true) });
    mockFetch(true, MOCK_PROFILE);
  });

  it('resets to form after clicking "Look up another student"', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /alice smith/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /look up another/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view my attendance/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/prn/i)).toHaveValue('');
  });
});
