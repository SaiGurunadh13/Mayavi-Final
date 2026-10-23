"""
Mayavi Tech Club - Secure Authentication & Authorization Module
Uses Argon2id password hashing, cryptographically secure sessions,
and IP-based rate limiting on login attempts.
"""
import os
import time
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_db_connection

# Initialize Argon2id password hasher (RFC 9106 recommended parameters)
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    salt_len=16
)

# Rate limiting settings: 5 failed attempts within 300 seconds (5 minutes)
MAX_FAILED_ATTEMPTS = 5
RATE_LIMIT_WINDOW = 300  # seconds
SESSION_DURATION_DAYS = 7

optional_bearer = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    """Hashes a password with Argon2id."""
    return ph.hash(password)

def verify_password(password_hash: str, password: str) -> bool:
    """Verifies a password against an Argon2id hash."""
    try:
        return ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False

def check_rate_limit(ip_address: str) -> Tuple[bool, int]:
    """
    Checks if an IP has exceeded the failed login attempts threshold.
    Returns (is_limited, seconds_remaining).
    """
    conn = get_db_connection()
    c = conn.cursor()
    cutoff = time.time() - RATE_LIMIT_WINDOW
    
    # Clean up old records older than 1 hour to keep table lightweight
    c.execute("DELETE FROM login_attempts WHERE attempt_time < ?", (time.time() - 3600,))
    conn.commit()

    c.execute("""
        SELECT COUNT(*) as failed_count, MIN(attempt_time) as oldest_attempt
        FROM login_attempts
        WHERE ip_address = ? AND attempt_time >= ? AND success = 0
    """, (ip_address, cutoff))
    row = c.fetchone()
    conn.close()

    failed_count = row["failed_count"] if row else 0
    if failed_count >= MAX_FAILED_ATTEMPTS:
        oldest = row["oldest_attempt"] if row and row["oldest_attempt"] else cutoff
        remaining = int(RATE_LIMIT_WINDOW - (time.time() - oldest))
        return True, max(remaining, 1)
    return False, 0

def record_login_attempt(ip_address: str, success: bool):
    """Records a login attempt for rate limiting."""
    conn = get_db_connection()
    conn.execute(
        "INSERT INTO login_attempts (ip_address, attempt_time, success) VALUES (?, ?, ?)",
        (ip_address, time.time(), 1 if success else 0)
    )
    if success:
        # On success, clear past failed attempts for this IP
        conn.execute("DELETE FROM login_attempts WHERE ip_address = ? AND success = 0", (ip_address,))
    conn.commit()
    conn.close()

def create_admin_session(admin_id: int) -> Tuple[str, datetime]:
    """Generates a cryptographically secure token and stores it in the database."""
    token = secrets.token_urlsafe(48)
    expires_at = datetime.utcnow() + timedelta(days=SESSION_DURATION_DAYS)
    expires_str = expires_at.isoformat()

    conn = get_db_connection()
    conn.execute(
        "INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)",
        (token, admin_id, expires_str)
    )
    conn.commit()
    conn.close()
    return token, expires_at

def invalidate_session(token: str):
    """Deletes a session token from the database."""
    conn = get_db_connection()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def get_current_admin(
    request: Request,
    bearer_creds: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer)
) -> dict:
    """
    FastAPI dependency to authenticate administrative requests.
    Validates token from Authorization Bearer header or HttpOnly cookie 'mayavi_admin_session'.
    Returns the authenticated admin dictionary or raises 401.
    """
    token = None
    if bearer_creds:
        token = bearer_creds.credentials
    if not token:
        token = request.cookies.get("mayavi_admin_session")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to access the Admin Portal.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT a.id, a.username, a.email, a.role, s.expires_at, s.token
        FROM sessions s
        JOIN admin_users a ON a.id = s.admin_id
        WHERE s.token = ?
    """, (token,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or is invalid. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.utcnow() > expires_at:
        invalidate_session(token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "role": row["role"],
        "token": row["token"]
    }
