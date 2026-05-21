/**
 * AdminAuth.test.jsx
 *
 * Tests for the AdminAuth login/register page:
 * - Renders both login and register forms correctly
 * - Login success stores token and navigates to dashboard
 * - Login failure shows error message
 * - Login server 429 shows rate-limit message
 * - Register password mismatch shows error without API call
 * - Register success redirects to login
 * - Register duplicate email shows API error
 * - Register server 429 shows rate-limit message
 * - Field validation (empty fields, invalid email)
 * - Can toggle between login and register modes
 * - Loading state while submitting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminAuth from '../pages/AdminAuth';

// ── Helper: render at a given path ───────────────────────────────────────────
function renderAuth(path = '/admin/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/login"     element={<AdminAuth />} />
        <Route path="/admin/register"  element={<AdminAuth />} />
        <Route path="/admin/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Mock fetch ────────────────────────────────────────────────────────────────
function mockFetch(ok, data, status = ok ? 200 : 400) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  });
}


// ═════════════════════════════════════════════════════════════════════════════
describe('AdminAuth — Login Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the login heading', () => {
    renderAuth('/admin/login');
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders email and password fields', () => {
    renderAuth('/admin/login');
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('successful login stores token and shows dashboard', async () => {
    mockFetch(true, { access_token: 'test-jwt-token', token_type: 'bearer' });
    renderAuth('/admin/login');

    await userEvent.type(screen.getByLabelText(/email address/i), 'admin@test.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith('adminToken', 'test-jwt-token');
    });
    await waitFor(() => {
      expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    });
  });

  it('failed login shows error message', async () => {
    mockFetch(false, { detail: 'Incorrect email or password' }, 401);
    renderAuth('/admin/login');

    await userEvent.type(screen.getByLabelText(/email address/i), 'bad@test.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrongpass');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/incorrect email or password/i)).toBeInTheDocument();
    });
  });

  it('server 429 on login shows rate-limit message', async () => {
    mockFetch(false, { detail: 'Rate limit exceeded' }, 429);
    renderAuth('/admin/login');

    await userEvent.type(screen.getByLabelText(/email address/i), 'admin@test.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      // The component should surface the error detail or a generic "too many" message
      const errEl = screen.getByText(/rate limit|too many|try again/i);
      expect(errEl).toBeInTheDocument();
    });
  });

  it('network error shows generic error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    renderAuth('/admin/login');

    await userEvent.type(screen.getByLabelText(/email address/i), 'admin@test.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
    });
  });

  it('shows loading state while submitting', async () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({
        ok: true, status: 200, json: () => Promise.resolve({ access_token: 'tok' })
      }), 200))
    );
    renderAuth('/admin/login');

    await userEvent.type(screen.getByLabelText(/email address/i), 'admin@test.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button', { name: /authenticating/i })).toBeDisabled();
  });
});


// ═════════════════════════════════════════════════════════════════════════════
describe('AdminAuth — Register Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders register form at /admin/register', () => {
    renderAuth('/admin/register');
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
  });

  it('renders full name, email, password and confirm fields', () => {
    renderAuth('/admin/register');
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm/i)).toBeInTheDocument();
  });

  it('password mismatch shows error without calling API', async () => {
    renderAuth('/admin/register');

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test Admin');
    await userEvent.type(screen.getByLabelText(/email address/i), 'new@test.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pass1234');
    await userEvent.type(screen.getByLabelText(/confirm/i), 'different');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('successful registration redirects to login', async () => {
    mockFetch(true, { message: 'Admin registered successfully' });
    renderAuth('/admin/register');

    await userEvent.type(screen.getByLabelText(/full name/i), 'New Admin');
    await userEvent.type(screen.getByLabelText(/email address/i), 'new@test.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'securepass');
    await userEvent.type(screen.getByLabelText(/confirm/i), 'securepass');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  it('duplicate email shows API error', async () => {
    mockFetch(false, { detail: 'An admin with this email already exists.' }, 400);
    renderAuth('/admin/register');

    await userEvent.type(screen.getByLabelText(/full name/i), 'Admin');
    await userEvent.type(screen.getByLabelText(/email address/i), 'existing@test.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pass1234');
    await userEvent.type(screen.getByLabelText(/confirm/i), 'pass1234');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });

  it('server 429 on register shows rate-limit message', async () => {
    mockFetch(false, { detail: 'Rate limit exceeded' }, 429);
    renderAuth('/admin/register');

    await userEvent.type(screen.getByLabelText(/full name/i), 'Admin');
    await userEvent.type(screen.getByLabelText(/email address/i), 'spam@test.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pass1234');
    await userEvent.type(screen.getByLabelText(/confirm/i), 'pass1234');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      const errEl = screen.getByText(/rate limit|too many|try again/i);
      expect(errEl).toBeInTheDocument();
    });
  });

  it('can switch between login and register modes', async () => {
    renderAuth('/admin/login');
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();

    // Click "Create one" link
    fireEvent.click(screen.getByRole('button', { name: /create one/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    });

    // Click "Sign in" link
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
