// src/__tests__/setup.js — Vitest global test setup
import '@testing-library/jest-dom';

// Mock CSS imports so tests don't fail on stylesheet parsing
vi.mock('../css/AdminDashboard.css', () => ({}));
vi.mock('../css/AdminAuth.css', () => ({}));
vi.mock('../css/LandingPage.css', () => ({}));
vi.mock('../css/StudentPortal.css', () => ({}));

// Mock window.matchMedia (not available in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn(key => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Suppress act() warnings in React 19 during tests
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
