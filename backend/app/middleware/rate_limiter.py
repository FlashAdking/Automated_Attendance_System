"""
app/middleware/rate_limiter.py
─────────────────────────────────────────────────────────────────────────────
Centralised rate-limit configuration for AttendSnap.

Uses slowapi (Starlette/FastAPI wrapper around the `limits` library).
All limits are stored here so they can be tuned in one place.

Usage in routes
---------------
from app.middleware.rate_limiter import limiter

@router.post("/login")
@limiter.limit("10/minute")        # ← decorate *after* @router.post
async def login(request: Request, ...):
    ...

The `request: Request` parameter MUST be present in every rate-limited
handler signature (slowapi uses it to extract the client IP).

Rate-limit keys
---------------
By default slowapi keys by client IP extracted from
`request.client.host`.  Behind a reverse proxy set the
`FORWARDED_ALLOW_IPS` env-var or pass `key_func=get_remote_address`
(already the default).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# ── Global limiter instance ───────────────────────────────────────────────────
limiter = Limiter(
    key_func=get_remote_address,
    # In-memory store – good for single-instance deployments.
    # For multi-instance / distributed, switch to Redis:
    #   storage_uri="redis://localhost:6379"
    default_limits=["200/minute"],      # global fallback for any undecorated route
)

# ── Per-category limits (used as decorator strings) ──────────────────────────
#
# AUTH endpoints – aggressive limit to block brute-force
LIMIT_AUTH_LOGIN    = "10/minute"       # POST /api/admin/login
LIMIT_AUTH_REGISTER = "5/minute"        # POST /api/admin/register

# PUBLIC / unauthenticated endpoints – moderate limit
LIMIT_STUDENT_LOOKUP = "20/minute"      # POST /api/student/lookup  (PRN + DOB)
LIMIT_TRIAL          = "6/minute"       # POST /api/student/trial   (heavy ML)

# ADMIN write operations – generous but not unlimited
LIMIT_ADMIN_WRITE  = "30/minute"        # add/update/delete students
LIMIT_ATTENDANCE   = "20/minute"        # mark_attendance/* endpoints

# ADMIN read operations – relaxed
LIMIT_ADMIN_READ   = "60/minute"        # GET students / sessions
