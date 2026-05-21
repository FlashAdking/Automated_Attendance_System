/**
 * useRateLimit.js
 * ────────────────────────────────────────────────────────────────────────────
 * Client-side rate-limit guard.
 *
 * Prevents the same user from hammering expensive endpoints by tracking
 * call timestamps in memory (localStorage-backed so refreshes don't reset it).
 *
 * Usage
 * ─────
 *  const { attempt, blocked, remainingMs } = useRateLimit('trial', 6, 60_000);
 *
 *  // In your submit handler:
 *  if (!attempt()) return;   // silently blocked
 *  await fetch(...)
 *
 * Parameters
 * ──────────
 *  key        – unique key per endpoint (stored in localStorage)
 *  maxCalls   – max number of calls allowed within windowMs
 *  windowMs   – sliding window size in milliseconds (default: 60 000 = 1 min)
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_PREFIX = 'attendsnap_rl_';

function getStoredTimestamps(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTimestamps(key, timestamps) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(timestamps));
  } catch { /* quota exceeded – silently skip */ }
}

/**
 * @param {string} key
 * @param {number} maxCalls
 * @param {number} windowMs
 * @returns {{ attempt: () => boolean, blocked: boolean, remainingMs: number }}
 */
export function useRateLimit(key, maxCalls, windowMs = 60_000) {
  const now = () => Date.now();

  // Returns fresh list of timestamps still inside the window
  const freshTimestamps = useCallback(() => {
    const cutoff = now() - windowMs;
    return getStoredTimestamps(key).filter(ts => ts > cutoff);
  }, [key, windowMs]);

  const [state, setState] = useState(() => {
    const ts = freshTimestamps();
    return { blocked: ts.length >= maxCalls, remainingMs: 0, count: ts.length };
  });

  // Recompute remaining cooldown every 500 ms while blocked
  useEffect(() => {
    if (!state.blocked) return;
    const interval = setInterval(() => {
      const ts = freshTimestamps();
      if (ts.length < maxCalls) {
        setState({ blocked: false, remainingMs: 0, count: ts.length });
        clearInterval(interval);
      } else {
        const oldest = Math.min(...ts);
        setState({ blocked: true, remainingMs: oldest + windowMs - now(), count: ts.length });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [state.blocked, freshTimestamps, maxCalls, windowMs]);

  /**
   * Call this before making the API request.
   * Returns `true` if the call is allowed, `false` if rate-limited.
   */
  const attempt = useCallback(() => {
    const ts = freshTimestamps();
    if (ts.length >= maxCalls) {
      const oldest = Math.min(...ts);
      setState({ blocked: true, remainingMs: oldest + windowMs - now(), count: ts.length });
      return false;
    }
    const updated = [...ts, now()];
    saveTimestamps(key, updated);
    setState({ blocked: updated.length >= maxCalls, remainingMs: 0, count: updated.length });
    return true;
  }, [key, maxCalls, windowMs, freshTimestamps]);

  return { attempt, blocked: state.blocked, remainingMs: state.remainingMs };
}

// ── Convenience: format ms → "X s" / "Xm Xs" ────────────────────────────────
export function formatCooldown(ms) {
  if (ms <= 0) return '0s';
  const secs = Math.ceil(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
