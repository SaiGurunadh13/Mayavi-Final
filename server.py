"""
Mayavi Tech Club - High Performance FastAPI Backend Server
Provides Public API endpoints, Administrative CRUD endpoints, Secure Session Auth,
Image Upload Handling, and Static Website Hosting.
"""
import os
import re
import json
import uuid
import time
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import FastAPI, Request, Response, HTTPException, status, Depends, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from PIL import Image

from database import (
    init_db, seed_data_if_empty, get_db_connection, log_activity, DB_DIR, DB_PATH
)
from auth import (
    ph, hash_password, verify_password, check_rate_limit, record_login_attempt,
    create_admin_session, invalidate_session, get_current_admin
)

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", str(BASE_DIR / "uploads")))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ADMIN_DIR = BASE_DIR / "admin"
ADMIN_DIR.mkdir(parents=True, exist_ok=True)

# Initialize Database and seed initial data
init_db()
seed_data_if_empty(ph)

app = FastAPI(
    title="Mayavi Tech Club API",
    description="Backend API and Administrative Portal for Mayavi Technology Club",
    version="2.0.0"
)

# CORS Middleware - Production and Development Safe
allowed_origins_env = os.getenv("CORS_ORIGINS", "")
if allowed_origins_env.strip():
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allowed_origins = [
        "https://klmayavi.in",
        "https://www.klmayavi.in",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to get client IP for rate limiting
def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# ============================================================================
# PYDANTIC SCHEMAS
# ============================================================================

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    icon_url: Optional[str] = ""
    color: Optional[str] = "#a855f7"
    display_order: Optional[int] = 0
    is_active: Optional[bool] = True

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon_url: Optional[str] = None
    color: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    logo_url: Optional[str] = ""
    banner_url: Optional[str] = ""
    category_id: Optional[int] = None
    team_lead_id: Optional[int] = None
    display_order: Optional[int] = 0
    is_active: Optional[bool] = True
    member_ids: Optional[List[int]] = []

class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    category_id: Optional[int] = None
    team_lead_id: Optional[int] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    member_ids: Optional[List[int]] = None

class MemberCreate(BaseModel):
    full_name: str
    profile_image_url: Optional[str] = ""
    designation: Optional[str] = ""
    biography: Optional[str] = ""
    team_id: Optional[int] = None
    category_id: Optional[int] = None
    batch_year: Optional[str] = "Y23"
    skills: Optional[str] = ""
    social_links: Optional[Dict[str, str]] = {}
    display_order: Optional[int] = 0
    is_active: Optional[bool] = True

class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    profile_image_url: Optional[str] = None
    designation: Optional[str] = None
    biography: Optional[str] = None
    team_id: Optional[int] = None
    category_id: Optional[int] = None
    batch_year: Optional[str] = None
    skills: Optional[str] = None
    social_links: Optional[Dict[str, str]] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    event_date: str
    start_time: Optional[str] = ""
    end_time: Optional[str] = ""
    location: Optional[str] = ""
    category_id: Optional[int] = None
    banner_url: Optional[str] = ""
    image_urls: Optional[List[str]] = []
    registration_url: Optional[str] = ""
    status: Optional[str] = "Upcoming"
    is_featured: Optional[bool] = False
    is_published: Optional[bool] = True

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    category_id: Optional[int] = None
    banner_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    registration_url: Optional[str] = None
    status: Optional[str] = None
    is_featured: Optional[bool] = None
    is_published: Optional[bool] = None


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.post("/api/admin/auth/login")
async def admin_login(payload: LoginRequest, request: Request, response: Response):
    ip = get_client_ip(request)
    is_limited, remaining_sec = check_rate_limit(ip)
    if is_limited:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Account temporarily locked for security. Please try again in {remaining_sec} seconds."
        )

    identifier = payload.username_or_email.strip()
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "SELECT id, username, email, password_hash, role FROM admin_users WHERE username = ? OR email = ?",
        (identifier, identifier)
    )
    admin = c.fetchone()
    conn.close()

    if not admin or not verify_password(admin["password_hash"], payload.password):
        record_login_attempt(ip, success=False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your username/email and password."
        )

    # Login successful
    record_login_attempt(ip, success=True)
    token, expires_at = create_admin_session(admin["id"])

    # Set secure HttpOnly cookie
    cookie_secure_env = os.getenv("COOKIE_SECURE", "auto").lower()
    if cookie_secure_env == "auto":
        is_secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    else:
        is_secure = cookie_secure_env in ("true", "1", "yes")

    samesite_env = os.getenv("COOKIE_SAMESITE", "lax").lower()
    if samesite_env not in ("lax", "strict", "none"):
        samesite_env = "lax"

    response.set_cookie(
        key="mayavi_admin_session",
        value=token,
        httponly=True,
        max_age=7 * 24 * 3600,
        expires=expires_at.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        samesite=samesite_env,
        secure=is_secure
    )

    log_activity("LOGIN", "ADMIN", admin["id"], f"Successful login from {ip}", admin["username"])

    return {
        "status": "success",
        "message": "Authentication successful",
        "token": token,
        "admin": {
            "id": admin["id"],
            "username": admin["username"],
            "email": admin["email"],
            "role": admin["role"]
        }
    }

@app.post("/api/admin/auth/logout")
async def admin_logout(request: Request, response: Response, admin: dict = Depends(get_current_admin)):
    invalidate_session(admin["token"])
    response.delete_cookie(key="mayavi_admin_session")
    log_activity("LOGOUT", "ADMIN", admin["id"], "Logged out", admin["username"])
    return {"status": "success", "message": "Successfully logged out"}

@app.get("/api/admin/auth/me")
async def admin_me(admin: dict = Depends(get_current_admin)):
    return {
        "id": admin["id"],
        "username": admin["username"],
        "email": admin["email"],
        "role": admin["role"]
    }

@app.post("/api/admin/auth/change-password")
async def change_password(payload: PasswordChangeRequest, admin: dict = Depends(get_current_admin)):
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long.")

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT password_hash FROM admin_users WHERE id = ?", (admin["id"],))
    row = c.fetchone()

    if not row or not verify_password(row["password_hash"], payload.current_password):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    new_hash = hash_password(payload.new_password)
    c.execute("UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_hash, admin["id"]))
    conn.commit()
    conn.close()

    log_activity("UPDATE", "ADMIN_PASSWORD", admin["id"], "Changed admin password", admin["username"])
    return {"status": "success", "message": "Password updated successfully"}


# ============================================================================
# IMAGE UPLOAD SYSTEM
# ============================================================================

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

@app.post("/api/admin/upload")
async def upload_image(
    file: UploadFile = File(...),
    admin: dict = Depends(get_current_admin)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension '{ext}'. Allowed types: JPG, PNG, WebP, GIF, SVG."
        )

    # Read content
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds the 10MB limit.")

    # Validate image file integrity (skip SVG since it is XML)
    if ext != ".svg":
        try:
            import io
            img = Image.open(io.BytesIO(contents))
            img.verify()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image file or corrupted data.")

    # Safe unique filename
    safe_stem = re.sub(r'[^a-zA-Z0-9_-]', '_', Path(file.filename).stem)[:30]
    unique_name = f"{safe_stem}_{int(time.time())}_{uuid.uuid4().hex[:6]}{ext}"
    dest_path = UPLOADS_DIR / unique_name

    with open(dest_path, "wb") as f:
        f.write(contents)

    file_url = f"/uploads/{unique_name}"
    log_activity("UPLOAD", "IMAGE", None, f"Uploaded {unique_name} ({len(contents)} bytes)", admin["username"])

    return {
        "status": "success",
        "url": file_url,
        "filename": unique_name,
        "size": len(contents)
    }


# ============================================================================
# DASHBOARD OVERVIEW
# ============================================================================

@app.get("/api/admin/dashboard")
async def get_dashboard_data(admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()

    total_events = c.execute("SELECT COUNT(*) as c FROM events").fetchone()["c"]
    upcoming_events = c.execute("SELECT COUNT(*) as c FROM events WHERE status = 'Upcoming'").fetchone()["c"]
    total_members = c.execute("SELECT COUNT(*) as c FROM members").fetchone()["c"]
    active_members = c.execute("SELECT COUNT(*) as c FROM members WHERE is_active = 1").fetchone()["c"]
    total_teams = c.execute("SELECT COUNT(*) as c FROM teams").fetchone()["c"]
    total_categories = c.execute("SELECT COUNT(*) as c FROM categories").fetchone()["c"]

    # Recent activities
    recent_activity = [
        dict(row) for row in c.execute(
            "SELECT id, action, entity_type, entity_id, details, admin_username, created_at FROM activity_logs ORDER BY id DESC LIMIT 10"
        ).fetchall()
    ]

    # Recent 5 events
    recent_events = [
        dict(row) for row in c.execute(
            "SELECT id, title, event_date, status, is_published, location FROM events ORDER BY id DESC LIMIT 5"
        ).fetchall()
    ]

    # Recent 5 members
    recent_members = [
        dict(row) for row in c.execute(
            "SELECT id, full_name, designation, batch_year, is_active FROM members ORDER BY id DESC LIMIT 5"
        ).fetchall()
    ]

    conn.close()

    return {
        "stats": {
            "total_events": total_events,
            "upcoming_events": upcoming_events,
            "total_members": total_members,
            "active_members": active_members,
            "total_teams": total_teams,
            "total_categories": total_categories
        },
        "recent_activity": recent_activity,
        "recent_events": recent_events,
        "recent_members": recent_members
    }


# ============================================================================
# CATEGORIES ENDPOINTS (Public & Admin)
# ============================================================================

@app.get("/api/categories")
async def get_public_categories():
    conn = get_db_connection()
    c = conn.cursor()
    rows = c.execute(
        "SELECT id, name, description, icon_url, color, display_order FROM categories WHERE is_active = 1 ORDER BY display_order ASC, name ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/categories/{category_id}")
async def get_public_category(category_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    row = c.execute(
        "SELECT id, name, description, icon_url, color FROM categories WHERE id = ? AND is_active = 1",
        (category_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    return dict(row)

@app.get("/api/admin/categories")
async def get_admin_categories(admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    rows = c.execute("""
        SELECT c.*, COUNT(t.id) as team_count
        FROM categories c
        LEFT JOIN teams t ON t.category_id = c.id
        GROUP BY c.id
        ORDER BY c.display_order ASC, c.id ASC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/admin/categories")
async def create_category(payload: CategoryCreate, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    # Check duplicate
    c.execute("SELECT id FROM categories WHERE LOWER(name) = LOWER(?)", (payload.name.strip(),))
    if c.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Category with name '{payload.name}' already exists.")

    c.execute("""
        INSERT INTO categories (name, description, icon_url, color, display_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        payload.name.strip(),
        payload.description,
        payload.icon_url,
        payload.color,
        payload.display_order,
        1 if payload.is_active else 0
    ))
    cat_id = c.lastrowid
    conn.commit()
    conn.close()

    log_activity("CREATE", "CATEGORY", cat_id, f"Created category '{payload.name}'", admin["username"])
    return {"status": "success", "id": cat_id, "message": "Category created successfully"}

@app.put("/api/admin/categories/{category_id}")
async def update_category(category_id: int, payload: CategoryUpdate, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM categories WHERE id = ?", (category_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.name:
        c.execute("SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?", (payload.name.strip(), category_id))
        if c.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail=f"Another category with name '{payload.name}' already exists.")

    name = payload.name.strip() if payload.name is not None else current["name"]
    desc = payload.description if payload.description is not None else current["description"]
    icon = payload.icon_url if payload.icon_url is not None else current["icon_url"]
    color = payload.color if payload.color is not None else current["color"]
    order = payload.display_order if payload.display_order is not None else current["display_order"]
    active = (1 if payload.is_active else 0) if payload.is_active is not None else current["is_active"]

    c.execute("""
        UPDATE categories
        SET name = ?, description = ?, icon_url = ?, color = ?, display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (name, desc, icon, color, order, active, category_id))
    conn.commit()
    conn.close()

    log_activity("UPDATE", "CATEGORY", category_id, f"Updated category '{name}'", admin["username"])
    return {"status": "success", "message": "Category updated successfully"}

@app.delete("/api/admin/categories/{category_id}")
async def delete_category(
    category_id: int,
    force: bool = Query(False, description="Force delete and unassign teams"),
    admin: dict = Depends(get_current_admin)
):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM categories WHERE id = ?", (category_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found")

    # Check if teams are using this category
    c.execute("SELECT COUNT(*) as team_count FROM teams WHERE category_id = ?", (category_id,))
    team_count = c.fetchone()["team_count"]

    if team_count > 0 and not force:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"Category is currently used by {team_count} team(s). Reassign or use force=true to proceed."
        )

    # Disassociate teams and members before deleting
    c.execute("UPDATE teams SET category_id = NULL WHERE category_id = ?", (category_id,))
    c.execute("UPDATE members SET category_id = NULL WHERE category_id = ?", (category_id,))
    c.execute("UPDATE events SET category_id = NULL WHERE category_id = ?", (category_id,))
    c.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    conn.commit()
    conn.close()

    log_activity("DELETE", "CATEGORY", category_id, f"Deleted category '{current['name']}'", admin["username"])
    return {"status": "success", "message": f"Category '{current['name']}' deleted successfully"}


# ============================================================================
# TEAMS ENDPOINTS (Public & Admin)
# ============================================================================

@app.get("/api/teams")
async def get_public_teams(category_id: Optional[int] = None):
    conn = get_db_connection()
    c = conn.cursor()

    query = """
        SELECT t.*, c.name as category_name, c.color as category_color,
               m.full_name as team_lead_name, m.profile_image_url as team_lead_image, m.designation as team_lead_designation
        FROM teams t
        LEFT JOIN categories c ON c.id = t.category_id
        LEFT JOIN members m ON m.id = t.team_lead_id
        WHERE t.is_active = 1
    """
    params = []
    if category_id:
        query += " AND t.category_id = ?"
        params.append(category_id)
    query += " ORDER BY t.display_order ASC, t.name ASC"

    teams = [dict(r) for r in c.execute(query, params).fetchall()]

    # Fetch associated active members for each team
    for team in teams:
        members = c.execute("""
            SELECT m.id, m.full_name, m.profile_image_url, m.designation, m.skills, m.social_links, mt.role_in_team
            FROM member_teams mt
            JOIN members m ON m.id = mt.member_id
            WHERE mt.team_id = ? AND m.is_active = 1
            ORDER BY m.display_order ASC, m.full_name ASC
        """, (team["id"],)).fetchall()
        
        # If no member_teams rows, fallback to members having team_id = team.id
        if not members:
            members = c.execute("""
                SELECT id, full_name, profile_image_url, designation, skills, social_links, designation as role_in_team
                FROM members
                WHERE team_id = ? AND is_active = 1
                ORDER BY display_order ASC, full_name ASC
            """, (team["id"],)).fetchall()

        team_members_list = []
        for m in members:
            item = dict(m)
            try:
                item["social_links"] = json.loads(item.get("social_links") or "{}")
            except Exception:
                item["social_links"] = {}
            team_members_list.append(item)

        team["members"] = team_members_list

    conn.close()
    return teams

@app.get("/api/teams/{team_id}")
async def get_public_team(team_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    row = c.execute("""
        SELECT t.*, c.name as category_name, c.color as category_color,
               m.full_name as team_lead_name, m.profile_image_url as team_lead_image
        FROM teams t
        LEFT JOIN categories c ON c.id = t.category_id
        LEFT JOIN members m ON m.id = t.team_lead_id
        WHERE t.id = ? AND t.is_active = 1
    """, (team_id,)).fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Team not found")

    team = dict(row)
    members = c.execute("""
        SELECT m.id, m.full_name, m.profile_image_url, m.designation, m.skills, m.social_links
        FROM member_teams mt
        JOIN members m ON m.id = mt.member_id
        WHERE mt.team_id = ? AND m.is_active = 1
        ORDER BY m.display_order ASC
    """, (team_id,)).fetchall()

    team["members"] = [dict(m) for m in members]
    conn.close()
    return team

@app.get("/api/admin/teams")
async def get_admin_teams(admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    rows = c.execute("""
        SELECT t.*, c.name as category_name,
               m.full_name as team_lead_name,
               (SELECT COUNT(*) FROM members WHERE team_id = t.id) as direct_member_count,
               (SELECT COUNT(*) FROM member_teams WHERE team_id = t.id) as assigned_member_count
        FROM teams t
        LEFT JOIN categories c ON c.id = t.category_id
        LEFT JOIN members m ON m.id = t.team_lead_id
        ORDER BY t.display_order ASC, t.id ASC
    """).fetchall()

    result = []
    for r in rows:
        team_data = dict(r)
        # Fetch assigned member IDs
        member_ids = [m["member_id"] for m in c.execute("SELECT member_id FROM member_teams WHERE team_id = ?", (team_data["id"],)).fetchall()]
        if not member_ids:
            member_ids = [m["id"] for m in c.execute("SELECT id FROM members WHERE team_id = ?", (team_data["id"],)).fetchall()]
        team_data["member_ids"] = member_ids
        team_data["member_count"] = max(team_data["direct_member_count"], team_data["assigned_member_count"], len(member_ids))
        result.append(team_data)

    conn.close()
    return result

@app.post("/api/admin/teams")
async def create_team(payload: TeamCreate, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO teams (name, description, logo_url, banner_url, category_id, team_lead_id, display_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        payload.name.strip(),
        payload.description,
        payload.logo_url,
        payload.banner_url,
        payload.category_id,
        payload.team_lead_id,
        payload.display_order,
        1 if payload.is_active else 0
    ))
    team_id = c.lastrowid

    # Assign members if provided
    if payload.member_ids:
        for mid in payload.member_ids:
            c.execute("INSERT OR IGNORE INTO member_teams (member_id, team_id) VALUES (?, ?)", (mid, team_id))
            c.execute("UPDATE members SET team_id = ? WHERE id = ? AND team_id IS NULL", (team_id, mid))

    conn.commit()
    conn.close()

    log_activity("CREATE", "TEAM", team_id, f"Created team '{payload.name}'", admin["username"])
    return {"status": "success", "id": team_id, "message": "Team created successfully"}

@app.put("/api/admin/teams/{team_id}")
async def update_team(team_id: int, payload: TeamUpdate, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM teams WHERE id = ?", (team_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Team not found")

    name = payload.name.strip() if payload.name is not None else current["name"]
    desc = payload.description if payload.description is not None else current["description"]
    logo = payload.logo_url if payload.logo_url is not None else current["logo_url"]
    banner = payload.banner_url if payload.banner_url is not None else current["banner_url"]
    cid = payload.category_id if payload.category_id is not None else current["category_id"]
    lead = payload.team_lead_id if payload.team_lead_id is not None else current["team_lead_id"]
    order = payload.display_order if payload.display_order is not None else current["display_order"]
    active = (1 if payload.is_active else 0) if payload.is_active is not None else current["is_active"]

    c.execute("""
        UPDATE teams
        SET name = ?, description = ?, logo_url = ?, banner_url = ?, category_id = ?,
            team_lead_id = ?, display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (name, desc, logo, banner, cid, lead, order, active, team_id))

    if payload.member_ids is not None:
        c.execute("DELETE FROM member_teams WHERE team_id = ?", (team_id,))
        for mid in payload.member_ids:
            c.execute("INSERT OR IGNORE INTO member_teams (member_id, team_id) VALUES (?, ?)", (mid, team_id))

    conn.commit()
    conn.close()

    log_activity("UPDATE", "TEAM", team_id, f"Updated team '{name}'", admin["username"])
    return {"status": "success", "message": "Team updated successfully"}

@app.delete("/api/admin/teams/{team_id}")
async def delete_team(
    team_id: int,
    force: bool = Query(False, description="Force delete and unassign members"),
    admin: dict = Depends(get_current_admin)
):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM teams WHERE id = ?", (team_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Team not found")

    # Check members
    c.execute("SELECT COUNT(*) as c FROM members WHERE team_id = ?", (team_id,))
    direct_cnt = c.fetchone()["c"]
    c.execute("SELECT COUNT(*) as c FROM member_teams WHERE team_id = ?", (team_id,))
    rel_cnt = c.fetchone()["c"]
    total_assigned = max(direct_cnt, rel_cnt)

    if total_assigned > 0 and not force:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"This team has {total_assigned} member(s) assigned. Reassign them first or confirm force deletion to unassign them automatically."
        )

    c.execute("UPDATE members SET team_id = NULL WHERE team_id = ?", (team_id,))
    c.execute("DELETE FROM member_teams WHERE team_id = ?", (team_id,))
    c.execute("DELETE FROM teams WHERE id = ?", (team_id,))
    conn.commit()
    conn.close()

    log_activity("DELETE", "TEAM", team_id, f"Deleted team '{current['name']}'", admin["username"])
    return {"status": "success", "message": f"Team '{current['name']}' deleted successfully"}


# ============================================================================
# MEMBERS ENDPOINTS (Public & Admin)
# ============================================================================

@app.get("/api/members")
async def get_public_members(
    team_id: Optional[int] = None,
    category_id: Optional[int] = None,
    batch_year: Optional[str] = None
):
    conn = get_db_connection()
    c = conn.cursor()
    query = """
        SELECT m.id, m.full_name, m.profile_image_url, m.designation, m.biography,
               m.team_id, m.category_id, m.batch_year, m.skills, m.social_links, m.display_order,
               t.name as team_name, c.name as category_name
        FROM members m
        LEFT JOIN teams t ON t.id = m.team_id
        LEFT JOIN categories c ON c.id = m.category_id
        WHERE m.is_active = 1
    """
    params = []
    if team_id:
        query += " AND (m.team_id = ? OR m.id IN (SELECT member_id FROM member_teams WHERE team_id = ?))"
        params.extend([team_id, team_id])
    if category_id:
        query += " AND m.category_id = ?"
        params.append(category_id)
    if batch_year:
        query += " AND LOWER(m.batch_year) = LOWER(?)"
        params.append(batch_year)

    query += " ORDER BY m.display_order ASC, m.full_name ASC"
    rows = c.execute(query, params).fetchall()
    conn.close()

    members = []
    for r in rows:
        item = dict(r)
        try:
            item["social_links"] = json.loads(item.get("social_links") or "{}")
        except Exception:
            item["social_links"] = {}
        members.append(item)

    return members

@app.get("/api/members/{member_id}")
async def get_public_member(member_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    row = c.execute("""
        SELECT m.*, t.name as team_name, c.name as category_name
        FROM members m
        LEFT JOIN teams t ON t.id = m.team_id
        LEFT JOIN categories c ON c.id = m.category_id
        WHERE m.id = ? AND m.is_active = 1
    """, (member_id,)).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Member not found")
    item = dict(row)
    try:
        item["social_links"] = json.loads(item.get("social_links") or "{}")
    except Exception:
        item["social_links"] = {}
    return item

@app.get("/api/admin/members")
async def get_admin_members(
    search: Optional[str] = None,
    team_id: Optional[int] = None,
    category_id: Optional[int] = None,
    batch_year: Optional[str] = None,
    is_active: Optional[bool] = None,
    admin: dict = Depends(get_current_admin)
):
    conn = get_db_connection()
    c = conn.cursor()
    query = """
        SELECT m.*, t.name as team_name, c.name as category_name
        FROM members m
        LEFT JOIN teams t ON t.id = m.team_id
        LEFT JOIN categories c ON c.id = m.category_id
        WHERE 1=1
    """
    params = []
    if search:
        query += " AND (m.full_name LIKE ? OR m.designation LIKE ? OR m.skills LIKE ?)"
        term = f"%{search.strip()}%"
        params.extend([term, term, term])
    if team_id:
        query += " AND (m.team_id = ? OR m.id IN (SELECT member_id FROM member_teams WHERE team_id = ?))"
        params.extend([team_id, team_id])
    if category_id:
        query += " AND m.category_id = ?"
        params.append(category_id)
    if batch_year:
        query += " AND LOWER(m.batch_year) = LOWER(?)"
        params.append(batch_year)
    if is_active is not None:
        query += " AND m.is_active = ?"
        params.append(1 if is_active else 0)

    query += " ORDER BY m.display_order ASC, m.id DESC"
    rows = c.execute(query, params).fetchall()
    conn.close()

    members = []
    for r in rows:
        item = dict(r)
        try:
            item["social_links"] = json.loads(item.get("social_links") or "{}")
        except Exception:
            item["social_links"] = {}
        members.append(item)
    return members

@app.post("/api/admin/members")
async def create_member(payload: MemberCreate, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()

    social_json = json.dumps(payload.social_links or {})
    c.execute("""
        INSERT INTO members (full_name, profile_image_url, designation, biography, team_id, category_id, batch_year, skills, social_links, display_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        payload.full_name.strip(),
        payload.profile_image_url,
        payload.designation,
        payload.biography,
        payload.team_id,
        payload.category_id,
        payload.batch_year or "Y23",
        payload.skills,
        social_json,
        payload.display_order,
        1 if payload.is_active else 0
    ))
    member_id = c.lastrowid

    if payload.team_id:
        c.execute("INSERT OR IGNORE INTO member_teams (member_id, team_id, role_in_team) VALUES (?, ?, ?)", (member_id, payload.team_id, payload.designation))

    conn.commit()
    conn.close()

    log_activity("CREATE", "MEMBER", member_id, f"Added member '{payload.full_name}'", admin["username"])
    return {"status": "success", "id": member_id, "message": "Member created successfully"}

@app.put("/api/admin/members/{member_id}")
async def update_member(member_id: int, payload: MemberUpdate, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM members WHERE id = ?", (member_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Member not found")

    full_name = payload.full_name.strip() if payload.full_name is not None else current["full_name"]
    img = payload.profile_image_url if payload.profile_image_url is not None else current["profile_image_url"]
    desig = payload.designation if payload.designation is not None else current["designation"]
    bio = payload.biography if payload.biography is not None else current["biography"]
    tid = payload.team_id if payload.team_id is not None else current["team_id"]
    cid = payload.category_id if payload.category_id is not None else current["category_id"]
    batch = payload.batch_year if payload.batch_year is not None else current["batch_year"]
    skills = payload.skills if payload.skills is not None else current["skills"]
    social = json.dumps(payload.social_links) if payload.social_links is not None else current["social_links"]
    order = payload.display_order if payload.display_order is not None else current["display_order"]
    active = (1 if payload.is_active else 0) if payload.is_active is not None else current["is_active"]

    c.execute("""
        UPDATE members
        SET full_name = ?, profile_image_url = ?, designation = ?, biography = ?,
            team_id = ?, category_id = ?, batch_year = ?, skills = ?, social_links = ?,
            display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (full_name, img, desig, bio, tid, cid, batch, skills, social, order, active, member_id))

    if tid:
        c.execute("INSERT OR IGNORE INTO member_teams (member_id, team_id, role_in_team) VALUES (?, ?, ?)", (member_id, tid, desig))

    conn.commit()
    conn.close()

    log_activity("UPDATE", "MEMBER", member_id, f"Updated member '{full_name}'", admin["username"])
    return {"status": "success", "message": "Member updated successfully"}

@app.delete("/api/admin/members/{member_id}")
async def delete_member(member_id: int, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT full_name FROM members WHERE id = ?", (member_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Member not found")

    c.execute("UPDATE teams SET team_lead_id = NULL WHERE team_lead_id = ?", (member_id,))
    c.execute("DELETE FROM member_teams WHERE member_id = ?", (member_id,))
    c.execute("DELETE FROM members WHERE id = ?", (member_id,))
    conn.commit()
    conn.close()

    log_activity("DELETE", "MEMBER", member_id, f"Deleted member '{current['full_name']}'", admin["username"])
    return {"status": "success", "message": f"Member '{current['full_name']}' deleted successfully"}


# ============================================================================
# EVENTS ENDPOINTS (Public & Admin)
# ============================================================================

@app.get("/api/events")
async def get_public_events(category_id: Optional[int] = None, status: Optional[str] = None):
    conn = get_db_connection()
    c = conn.cursor()
    query = """
        SELECT e.*, c.name as category_display_name, c.color as category_color
        FROM events e
        LEFT JOIN categories c ON c.id = e.category_id
        WHERE e.is_published = 1
    """
    params = []
    if category_id:
        query += " AND e.category_id = ?"
        params.append(category_id)
    if status:
        query += " AND LOWER(e.status) = LOWER(?)"
        params.append(status)

    query += " ORDER BY e.is_featured DESC, e.id DESC"
    rows = c.execute(query, params).fetchall()
    conn.close()

    events = []
    for r in rows:
        item = dict(r)
        # Parse image_urls json list
        try:
            item["image_urls"] = json.loads(item.get("image_urls") or "[]")
        except Exception:
            item["image_urls"] = []
        # Compatibility with legacy events.js format
        item["name"] = item["title"]
        item["des"] = item["description"]
        item["date"] = item["event_date"]
        item["venue"] = item["location"]
        item["category"] = item["category_name"] or item.get("category_display_name") or "Technology"
        item["poster"] = item["banner_url"]
        item["img"] = item["image_urls"]
        events.append(item)

    return events

@app.get("/api/events/{event_id}")
async def get_public_event(event_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    row = c.execute("""
        SELECT e.*, c.name as category_display_name, c.color as category_color
        FROM events e
        LEFT JOIN categories c ON c.id = e.category_id
        WHERE e.id = ? AND e.is_published = 1
    """, (event_id,)).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    item = dict(row)
    try:
        item["image_urls"] = json.loads(item.get("image_urls") or "[]")
    except Exception:
        item["image_urls"] = []
    item["name"] = item["title"]
    item["des"] = item["description"]
    item["date"] = item["event_date"]
    item["venue"] = item["location"]
    item["category"] = item["category_name"] or item.get("category_display_name") or "Technology"
    item["poster"] = item["banner_url"]
    item["img"] = item["image_urls"]
    return item

@app.get("/api/admin/events")
async def get_admin_events(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    status: Optional[str] = None,
    is_published: Optional[bool] = None,
    admin: dict = Depends(get_current_admin)
):
    conn = get_db_connection()
    c = conn.cursor()
    query = """
        SELECT e.*, c.name as category_display_name, c.color as category_color
        FROM events e
        LEFT JOIN categories c ON c.id = e.category_id
        WHERE 1=1
    """
    params = []
    if search:
        query += " AND (e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?)"
        term = f"%{search.strip()}%"
        params.extend([term, term, term])
    if category_id:
        query += " AND e.category_id = ?"
        params.append(category_id)
    if status:
        query += " AND LOWER(e.status) = LOWER(?)"
        params.append(status)
    if is_published is not None:
        query += " AND e.is_published = ?"
        params.append(1 if is_published else 0)

    query += " ORDER BY e.id DESC"
    rows = c.execute(query, params).fetchall()
    conn.close()

    events = []
    for r in rows:
        item = dict(r)
        try:
            item["image_urls"] = json.loads(item.get("image_urls") or "[]")
        except Exception:
            item["image_urls"] = []
        item["name"] = item["title"]
        events.append(item)
    return events

@app.post("/api/admin/events")
async def create_event(payload: EventCreate, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()

    cat_name = ""
    if payload.category_id:
        row = c.execute("SELECT name FROM categories WHERE id = ?", (payload.category_id,)).fetchone()
        if row:
            cat_name = row["name"]

    img_urls_json = json.dumps(payload.image_urls or [])
    c.execute("""
        INSERT INTO events (title, description, event_date, start_time, end_time, location, category_id, category_name, banner_url, image_urls, registration_url, status, is_featured, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        payload.title.strip(),
        payload.description,
        payload.event_date.strip(),
        payload.start_time,
        payload.end_time,
        payload.location,
        payload.category_id,
        cat_name,
        payload.banner_url,
        img_urls_json,
        payload.registration_url,
        payload.status or "Upcoming",
        1 if payload.is_featured else 0,
        1 if payload.is_published else 0
    ))
    event_id = c.lastrowid
    conn.commit()
    conn.close()

    log_activity("CREATE", "EVENT", event_id, f"Created event '{payload.title}'", admin["username"])
    return {"status": "success", "id": event_id, "message": "Event created successfully"}

@app.put("/api/admin/events/{event_id}")
async def update_event(event_id: int, payload: EventUpdate, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    current = c.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found")

    title = payload.title.strip() if payload.title is not None else current["title"]
    desc = payload.description if payload.description is not None else current["description"]
    date_str = payload.event_date.strip() if payload.event_date is not None else current["event_date"]
    start = payload.start_time if payload.start_time is not None else current["start_time"]
    end = payload.end_time if payload.end_time is not None else current["end_time"]
    loc = payload.location if payload.location is not None else current["location"]
    cid = payload.category_id if payload.category_id is not None else current["category_id"]
    banner = payload.banner_url if payload.banner_url is not None else current["banner_url"]
    imgs = json.dumps(payload.image_urls) if payload.image_urls is not None else current["image_urls"]
    reg = payload.registration_url if payload.registration_url is not None else current["registration_url"]
    stat = payload.status if payload.status is not None else current["status"]
    feat = (1 if payload.is_featured else 0) if payload.is_featured is not None else current["is_featured"]
    pub = (1 if payload.is_published else 0) if payload.is_published is not None else current["is_published"]

    cat_name = current["category_name"]
    if payload.category_id is not None:
        cat_row = c.execute("SELECT name FROM categories WHERE id = ?", (payload.category_id,)).fetchone()
        cat_name = cat_row["name"] if cat_row else ""

    c.execute("""
        UPDATE events
        SET title = ?, description = ?, event_date = ?, start_time = ?, end_time = ?, location = ?,
            category_id = ?, category_name = ?, banner_url = ?, image_urls = ?, registration_url = ?,
            status = ?, is_featured = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (title, desc, date_str, start, end, loc, cid, cat_name, banner, imgs, reg, stat, feat, pub, event_id))
    conn.commit()
    conn.close()

    log_activity("UPDATE", "EVENT", event_id, f"Updated event '{title}'", admin["username"])
    return {"status": "success", "message": "Event updated successfully"}

@app.patch("/api/admin/events/{event_id}/publish")
async def toggle_event_publish(event_id: int, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, title, is_published FROM events WHERE id = ?", (event_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found")

    new_pub = 0 if row["is_published"] == 1 else 1
    c.execute("UPDATE events SET is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_pub, event_id))
    conn.commit()
    conn.close()

    status_word = "published" if new_pub == 1 else "unpublished"
    log_activity("PUBLISH", "EVENT", event_id, f"{status_word.capitalize()} event '{row['title']}'", admin["username"])
    return {"status": "success", "is_published": new_pub == 1, "message": f"Event {status_word} successfully"}

@app.delete("/api/admin/events/{event_id}")
async def delete_event(event_id: int, admin: dict = Depends(get_current_admin)):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT title FROM events WHERE id = ?", (event_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found")

    c.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()

    log_activity("DELETE", "EVENT", event_id, f"Deleted event '{row['title']}'", admin["username"])
    return {"status": "success", "message": f"Event '{row['title']}' deleted successfully"}


# ============================================================================
# STATIC AND PUBLIC PAGE ROUTES
# ============================================================================

# Dedicated /admin route
@app.get("/admin")
@app.get("/admin/")
async def serve_admin_portal():
    admin_index = BASE_DIR / "admin" / "index.html"
    if admin_index.exists():
        return FileResponse(admin_index)
    raise HTTPException(status_code=404, detail="Admin Portal index.html not found")

@app.get("/admin.css")
async def serve_admin_css_fallback():
    return FileResponse(BASE_DIR / "admin" / "admin.css", media_type="text/css")

@app.get("/admin.js")
async def serve_admin_js_fallback():
    return FileResponse(BASE_DIR / "admin" / "admin.js", media_type="application/javascript")

# Events section routes
@app.get("/events")
@app.get("/events/")
async def serve_events_index():
    events_index = BASE_DIR / "events" / "index.html"
    return FileResponse(events_index)

@app.get("/events/info.html")
async def serve_events_info():
    return FileResponse(BASE_DIR / "events" / "info.html")

# Serve root index.html
@app.get("/")
async def serve_root_index():
    return FileResponse(BASE_DIR / "index.html")

# Mount directory static folders
app.mount("/admin", StaticFiles(directory=str(BASE_DIR / "admin")), name="admin_static")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/events", StaticFiles(directory=str(BASE_DIR / "events")), name="events_static")
app.mount("/css", StaticFiles(directory=str(BASE_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(BASE_DIR / "js")), name="js")
app.mount("/assets", StaticFiles(directory=str(BASE_DIR / "assets")), name="assets")
app.mount("/core", StaticFiles(directory=str(BASE_DIR / "core")), name="core")

# Mount remaining root static files fallback (e.g. *.html, .glb)
app.mount("/", StaticFiles(directory=str(BASE_DIR), html=True), name="root_static")

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload_env = os.getenv("RELOAD", "true").lower() in ("true", "1", "yes")
    uvicorn.run("server:app", host=host, port=port, reload=reload_env)
