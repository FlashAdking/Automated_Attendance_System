/**
 * StudentPortal.test.jsx
 *
 * Tests for the Student self-service portal:
 * - Initial lookup form renders correctly
 * - Successful lookup renders profile card + history
 * - Wrong DOB shows error
 * - PRN not found shows error
 * - Attendance summary metrics display correctly
 * - History filter (all / present / absent) works
 * - Search filter works
 * - "Look up another student" resets the form
 * - Low attendance warning appears when % < 75
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StudentPortal from '../pages/StudentPortal';

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
    { date: '2026-05-01', status: 'present', method: 'ai', subject: 'Data Structures', time_from: '09:00', time_to: '10:00' },
    { date: '2026-05-02', status: 'absent', method: 'manual', subject: 'Algorithms', time_from: '10:00', time_to: '11:00' },
    { date: '2026-05-03', status: 'present', method: 'ai', subject: 'Data Structures', time_from: '09:00', time_to: '10:00' },
    { date: '2026-05-04', status: 'absent', method: 'manual', subject: 'OS', time_from: '11:00', time_to: '12:00' },
    { date: '2026-05-05', status: 'present', method: 'ai', subject: 'Data Structures', time_from: '09:00', time_to: '10:00' },
  ],
};

function mockFetch(ok, data) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
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

// ── Helpers ────────────────────────────────────────────────────────────────────
async function submitLookup(prn = 'PRN001', dob = '2002-05-15') {
  const prnInput = screen.getByLabelText(/prn/i);
  const dobInput = screen.getByLabelText(/date of birth/i);
  await userEvent.type(prnInput, prn);
  fireEvent.change(dobInput, { target: { value: dob } });
  fireEvent.click(screen.getByRole('button', { name: /view my attendance/i }));
}


describe('StudentPortal — Initial Form', () => {
  beforeEach(() => vi.clearAllMocks());

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
});


describe('StudentPortal — Successful Lookup', () => {
  beforeEach(() => {
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
      expect(screen.getByText('5')).toBeInTheDocument(); // total
      expect(screen.getByText('3')).toBeInTheDocument(); // present
      expect(screen.getByText('2')).toBeInTheDocument(); // absent
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

  it('shows session history rows', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => {
      // Expect newest-first — 2026-05-05 should appear
      expect(screen.getByText('2026-05-05')).toBeInTheDocument();
    });
  });
});


describe('StudentPortal — Error States', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows error for wrong DOB (401)', async () => {
    mockFetch(false, { detail: 'PRN and Date of Birth do not match' });
    renderPortal();
    await submitLookup('PRN001', '1990-01-01');

    await waitFor(() => {
      expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    });
  });

  it('shows error for unknown PRN (404)', async () => {
    mockFetch(false, { detail: 'Student not found' });
    renderPortal();
    await submitLookup('FAKE999', '2002-01-01');

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('shows network error message', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPortal();
    await submitLookup();

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});


describe('StudentPortal — History Filters', () => {
  beforeEach(() => {
    mockFetch(true, MOCK_PROFILE);
  });

  it('filter "present" shows only present rows', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => {
      expect(screen.getByText('2026-05-05')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /✓ present/i }));

    // All visible rows should be "Present"
    const presentBadges = screen.getAllByText(/✓ Present/);
    const absentBadges = screen.queryAllByText(/✗ Absent/);
    expect(presentBadges.length).toBeGreaterThan(0);
    expect(absentBadges.length).toBe(0);
  });

  it('filter "absent" shows only absent rows', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => {
      expect(screen.getByText('2026-05-05')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /✗ absent/i }));

    const absentBadges = screen.getAllByText(/✗ Absent/);
    const presentBadges = screen.queryAllByText(/✓ Present/);
    expect(absentBadges.length).toBeGreaterThan(0);
    expect(presentBadges.length).toBe(0);
  });

  it('search by subject filters rows', async () => {
    renderPortal();
    await submitLookup();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'Algorithms');

    // Only the Algorithms session should remain visible
    await waitFor(() => {
      expect(screen.getByText('Algorithms')).toBeInTheDocument();
      expect(screen.queryByText('Data Structures')).not.toBeInTheDocument();
    });
  });
});


describe('StudentPortal — Re-lookup', () => {
  it('resets to form after clicking "Look up another student"', async () => {
    mockFetch(true, MOCK_PROFILE);
    renderPortal();
    await submitLookup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /alice smith/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /look up another/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view my attendance/i })).toBeInTheDocument();
    });
    // PRN field should be empty again
    expect(screen.getByLabelText(/prn/i)).toHaveValue('');
  });
});
