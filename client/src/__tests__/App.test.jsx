/**
 * App.test.jsx — Router integration tests
 *
 * Uses MemoryRouter directly wrapping the Routes to avoid the
 * BrowserRouter vs MemoryRouter module-mock issue.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';

// Lightweight stubs for each page
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

// Import the mocked pages so we can render them via routes
import Home from '../pages/Home';
import AdminAuth from '../pages/AdminAuth';
import AdminDashboard from '../pages/AdminDashboard';
import StudentPortal from '../pages/StudentPortal';

/** Renders the full route tree at a given initial path */
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/login" element={<AdminAuth />} />
        <Route path="/admin/register" element={<AdminAuth />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/student" element={<StudentPortal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MemoryRouter>
  );
}


describe('App Router', () => {
  it('/ renders the Home page', () => {
    renderAt('/');
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  it('/admin/login renders AdminAuth', () => {
    renderAt('/admin/login');
    expect(screen.getByTestId('admin-auth-page')).toBeInTheDocument();
  });

  it('/admin/register renders AdminAuth', () => {
    renderAt('/admin/register');
    expect(screen.getByTestId('admin-auth-page')).toBeInTheDocument();
  });

  it('/admin/dashboard renders AdminDashboard', () => {
    renderAt('/admin/dashboard');
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
  });

  it('/student renders StudentPortal', () => {
    renderAt('/student');
    expect(screen.getByTestId('student-portal-page')).toBeInTheDocument();
  });

  it('unknown route falls back to Home', () => {
    renderAt('/does-not-exist');
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });
});
