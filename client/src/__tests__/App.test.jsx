/**
 * App.test.jsx — Router and routing integration tests
 *
 * Verifies that:
 * - / renders the Home page
 * - /student renders the Student Portal
 * - /admin/login renders the login form
 * - /admin/register renders the register form
 * - Unknown routes redirect to /
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

// Heavy pages — only verify routing (shallow checks)
vi.mock('../pages/Home', () => ({
  default: () => <div data-testid="home-page">Home Page</div>,
}));
vi.mock('../pages/AdminAuth', () => ({
  default: () => <div data-testid="admin-auth-page">Admin Auth</div>,
}));
vi.mock('../pages/AdminDashboard', () => ({
  default: () => <div data-testid="dashboard-page">Dashboard</div>,
}));
vi.mock('../pages/StudentPortal', () => ({
  default: () => <div data-testid="student-portal-page">Student Portal</div>,
}));

function renderAt(path) {
  // We wrap App in a custom MemoryRouter that overrides its internal BrowserRouter
  vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      BrowserRouter: ({ children }) => (
        <actual.MemoryRouter initialEntries={[path]}>
          {children}
        </actual.MemoryRouter>
      ),
    };
  });
  return render(<App />);
}


describe('App Router', () => {
  it('/ renders the Home page', async () => {
    renderAt('/');
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
  });

  it('/admin/login renders AdminAuth', async () => {
    renderAt('/admin/login');
    await waitFor(() => {
      expect(screen.getByTestId('admin-auth-page')).toBeInTheDocument();
    });
  });

  it('/admin/register renders AdminAuth', async () => {
    renderAt('/admin/register');
    await waitFor(() => {
      expect(screen.getByTestId('admin-auth-page')).toBeInTheDocument();
    });
  });

  it('/admin/dashboard renders AdminDashboard', async () => {
    renderAt('/admin/dashboard');
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });
  });

  it('/student renders StudentPortal', async () => {
    renderAt('/student');
    await waitFor(() => {
      expect(screen.getByTestId('student-portal-page')).toBeInTheDocument();
    });
  });

  it('unknown route falls back to /', async () => {
    renderAt('/does-not-exist');
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
  });
});
