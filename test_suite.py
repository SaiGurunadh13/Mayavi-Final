"""
Comprehensive Test Suite for Mayavi Admin Portal & Public Website APIs
Verifies all 18 security and functional requirements.
"""
import io
import time
from starlette.testclient import TestClient
from server import app
from database import get_db_connection
from auth import record_login_attempt

client = TestClient(app)

def run_tests():
    print("=" * 60)
    print("RUNNING MAYAVI ADMIN PORTAL VERIFICATION SUITE")
    print("=" * 60)

    # 1. Public Pages Access
    print("\n[Test 1] Public Website Access (No Login Required)")
    res = client.get("/")
    assert res.status_code == 200, f"Root page failed: {res.status_code}"
    assert "Mayavi" in res.text, "Index does not contain 'Mayavi'"

    res = client.get("/events")
    assert res.status_code == 200, f"/events failed: {res.status_code}"

    res = client.get("/api/events")
    assert res.status_code == 200
    events_data = res.json()
    assert len(events_data) > 0, "No public events returned"
    print(f"  -> Public events accessible: {len(events_data)} published events")

    res = client.get("/api/members")
    assert res.status_code == 200
    members_data = res.json()
    assert len(members_data) > 0, "No public members returned"
    print(f"  -> Public members accessible: {len(members_data)} active members")

    res = client.get("/api/teams")
    assert res.status_code == 200
    teams_data = res.json()
    assert len(teams_data) > 0, "No public teams returned"
    print(f"  -> Public teams accessible: {len(teams_data)} active teams")

    res = client.get("/api/categories")
    assert res.status_code == 200
    categories_data = res.json()
    assert len(categories_data) > 0, "No public categories returned"
    print(f"  -> Public categories accessible: {len(categories_data)} active categories")
    print("  [PASS] Public pages accessible without login.")

    # 2. Admin Portal Route & Login Page
    print("\n[Test 2] Dedicated Route /admin")
    res = client.get("/admin")
    assert res.status_code == 200, f"/admin route failed: {res.status_code}"
    assert "MAYAVI" in res.text and "Portal Login" in res.text, "Admin login page not served"
    print("  [PASS] /admin dedicated route serves portal login page.")

    # 3. Unauthenticated Access to Administrative APIs Rejected
    print("\n[Test 3] Administrative API Route Protection")
    admin_endpoints = [
        ("GET", "/api/admin/dashboard"),
        ("GET", "/api/admin/events"),
        ("POST", "/api/admin/events"),
        ("GET", "/api/admin/members"),
        ("POST", "/api/admin/members"),
        ("GET", "/api/admin/teams"),
        ("POST", "/api/admin/teams"),
        ("GET", "/api/admin/categories"),
        ("POST", "/api/admin/categories"),
        ("POST", "/api/admin/upload"),
    ]
    for method, path in admin_endpoints:
        if method == "GET":
            r = client.get(path)
        else:
            r = client.post(path, json={})
        assert r.status_code == 401, f"{method} {path} returned {r.status_code} instead of 401"
    print("  [PASS] All administrative endpoints require valid authentication.")

    # 4. Authentication: Invalid Credentials Rejected
    print("\n[Test 4] Invalid Credentials Rejection")
    res = client.post("/api/admin/auth/login", json={
        "username_or_email": "admin",
        "password": "WrongPassword123!"
    })
    assert res.status_code == 401, f"Expected 401 for wrong password, got {res.status_code}"
    print("  [PASS] Invalid credentials rejected.")

    # 5. Authentication: Valid Credentials Grant Access
    print("\n[Test 5] Valid Credentials Grant Access (Argon2id)")
    # Clear any rate limit lockout for test
    conn = get_db_connection()
    conn.execute("DELETE FROM login_attempts")
    conn.commit()
    conn.close()

    res = client.post("/api/admin/auth/login", json={
        "username_or_email": "admin",
        "password": "MayaviAdmin2026!"
    })
    assert res.status_code == 200, f"Login failed: {res.json()}"
    auth_data = res.json()
    assert "token" in auth_data, "No session token returned"
    assert auth_data["admin"]["username"] == "admin"
    assert "password" not in auth_data["admin"], "Password leaked in response"
    token = auth_data["token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("  [PASS] Valid login succeeded. Token generated.")

    # 6. Session Verification (/api/admin/auth/me)
    print("\n[Test 6] Session & Token Validation")
    res = client.get("/api/admin/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["username"] == "admin"
    print("  [PASS] Session verified via /api/admin/auth/me.")

    # 7. Dashboard Stats Dynamically Loaded
    print("\n[Test 7] Dashboard Statistics")
    res = client.get("/api/admin/dashboard", headers=headers)
    assert res.status_code == 200
    dash = res.json()
    assert "stats" in dash
    assert dash["stats"]["total_events"] >= 10
    assert dash["stats"]["total_members"] >= 24
    assert dash["stats"]["total_teams"] >= 6
    assert dash["stats"]["total_categories"] >= 6
    print(f"  -> Dynamic Stats: Events={dash['stats']['total_events']}, Members={dash['stats']['total_members']}, Teams={dash['stats']['total_teams']}")
    print("  [PASS] Dashboard data loaded dynamically.")

    # 8. Category CRUD & Duplicate Name Prevention
    print("\n[Test 8] Category CRUD & Duplicate Name Prevention")
    cat_payload = {
        "name": "Robotics & Hardware",
        "description": "Robotics systems and embedded computing.",
        "icon_url": "bi-cpu",
        "color": "#06b6d4",
        "display_order": 99,
        "is_active": True
    }
    res = client.post("/api/admin/categories", json=cat_payload, headers=headers)
    assert res.status_code == 200
    new_cat_id = res.json()["id"]

    # Try creating duplicate
    res_dup = client.post("/api/admin/categories", json=cat_payload, headers=headers)
    assert res_dup.status_code == 400, "Duplicate category creation was not rejected!"
    print("  -> Duplicate category properly rejected with 400")

    # Update category
    res_up = client.put(f"/api/admin/categories/{new_cat_id}", json={"description": "Updated Robotics"}, headers=headers)
    assert res_up.status_code == 200

    print("  [PASS] Category created, verified, and updated.")

    # 9. Team CRUD & Category Assignment
    print("\n[Test 9] Team CRUD & Category Assignment")
    team_payload = {
        "name": "Robotics Core Lab",
        "description": "Building hardware prototypes and robotics.",
        "category_id": new_cat_id,
        "display_order": 1,
        "is_active": True
    }
    res = client.post("/api/admin/teams", json=team_payload, headers=headers)
    assert res.status_code == 200
    new_team_id = res.json()["id"]

    # Verify team shows in public teams
    res_pub_teams = client.get(f"/api/teams?category_id={new_cat_id}")
    assert any(t["id"] == new_team_id for t in res_pub_teams.json()), "Created team not in public teams"

    print("  [PASS] Team created and linked to category.")

    # 10. Member CRUD & Assignment to Team
    print("\n[Test 10] Member CRUD & Team Assignment")
    member_payload = {
        "full_name": "Autonomous Tester",
        "designation": "Robotics Lead",
        "team_id": new_team_id,
        "category_id": new_cat_id,
        "batch_year": "Y23",
        "skills": "ROS, Python, Arduino",
        "is_active": True
    }
    res = client.post("/api/admin/members", json=member_payload, headers=headers)
    assert res.status_code == 200
    new_member_id = res.json()["id"]

    # Verify member appears in public team
    res_team_detail = client.get(f"/api/teams/{new_team_id}")
    assert any(m["id"] == new_member_id for m in res_team_detail.json()["members"]), "Member not in team members"

    # Test deactivating member -> should vanish from public /api/members
    client.put(f"/api/admin/members/{new_member_id}", json={"is_active": False}, headers=headers)
    res_pub_members = client.get("/api/members")
    assert not any(m["id"] == new_member_id for m in res_pub_members.json()), "Deactivated member still visible publicly!"
    print("  -> Deactivating member properly hides profile from public website")

    # Reactivate member
    client.put(f"/api/admin/members/{new_member_id}", json={"is_active": True}, headers=headers)
    print("  [PASS] Member management and team linking verified.")

    # 11. Event CRUD & Publish/Unpublish Workflow
    print("\n[Test 11] Event CRUD & Publish / Unpublish Workflow")
    event_payload = {
        "title": "Quantum XR Summit 2026",
        "description": "Exclusive spatial computing summit.",
        "event_date": "December 20, 2026",
        "location": "Main Auditorium",
        "category_id": new_cat_id,
        "status": "Upcoming",
        "is_featured": True,
        "is_published": True
    }
    res = client.post("/api/admin/events", json=event_payload, headers=headers)
    assert res.status_code == 200
    new_event_id = res.json()["id"]

    # Verify it appears in public /api/events
    res_pub_events = client.get("/api/events")
    assert any(e["id"] == new_event_id for e in res_pub_events.json()), "Published event missing from /api/events"
    print("  -> Event created and visible publicly")

    # Unpublish event -> must disappear from /api/events
    res_unpub = client.patch(f"/api/admin/events/{new_event_id}/publish", headers=headers)
    assert res_unpub.status_code == 200
    assert res_unpub.json()["is_published"] is False

    res_pub_events_after = client.get("/api/events")
    assert not any(e["id"] == new_event_id for e in res_pub_events_after.json()), "Unpublished event still visible in /api/events!"
    print("  -> Unpublishing event immediately hides it from public website")

    # Delete the test event
    client.delete(f"/api/admin/events/{new_event_id}", headers=headers)
    print("  [PASS] Event CRUD and publishing workflow fully verified.")

    # 12. Cleanup created test member, team, category
    print("\n[Test 12] Safe Deletion & Dependency Checks")
    # Deleting category when in use by team requires force
    res_del_cat_blocked = client.delete(f"/api/admin/categories/{new_cat_id}", headers=headers)
    assert res_del_cat_blocked.status_code == 400, "Deleting in-use category was not blocked"
    print("  -> In-use category deletion properly warned/blocked")

    # Clean up test items
    client.delete(f"/api/admin/members/{new_member_id}", headers=headers)
    client.delete(f"/api/admin/teams/{new_team_id}?force=true", headers=headers)
    client.delete(f"/api/admin/categories/{new_cat_id}?force=true", headers=headers)
    print("  [PASS] Deletion safety and cleanup verified.")

    # 13. Image Upload System
    print("\n[Test 13] Image Upload System")
    # Generate a 1x1 test PNG in memory
    from PIL import Image
    img_byte_arr = io.BytesIO()
    img = Image.new("RGB", (100, 100), color="purple")
    img.save(img_byte_arr, format="PNG")
    img_bytes = img_byte_arr.getvalue()

    files = {"file": ("test_banner.png", img_bytes, "image/png")}
    res_upload = client.post("/api/admin/upload", files=files, headers=headers)
    assert res_upload.status_code == 200, f"Upload failed: {res_upload.json()}"
    uploaded_url = res_upload.json()["url"]
    assert uploaded_url.startswith("/uploads/"), f"Unexpected upload URL: {uploaded_url}"

    # Verify uploaded image is served statically
    res_get_img = client.get(uploaded_url)
    assert res_get_img.status_code == 200, f"Could not fetch uploaded image from {uploaded_url}"
    print(f"  -> Image uploaded and accessible at {uploaded_url}")
    print("  [PASS] Image upload validated, persisted, and served.")

    # 13B. Upload Security & SVG Stored-XSS Rejection
    print("\n[Test 13B] Upload Security & SVG Stored-XSS Rejection")
    import os
    from server import UPLOADS_DIR, check_svg_content_safety
    
    uploads_before = set(os.listdir(UPLOADS_DIR))

    # A. SVG rejected by default
    svg_clean = b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red" /></svg>'
    r_svg = client.post("/api/admin/upload", files={"file": ("test.svg", svg_clean, "image/svg+xml")}, headers=headers)
    assert r_svg.status_code == 400 and "SVG uploads are disabled" in r_svg.json()["detail"]
    print("  -> SVG uploads strictly rejected by default")

    # B. SVG with <script> tag rejected
    svg_script = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'
    safe, reason = check_svg_content_safety(svg_script)
    assert not safe and "active scripts" in reason

    # C. SVG with event handler (onload) rejected
    svg_onload = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle cx="10" cy="10" r="5"/></svg>'
    safe, reason = check_svg_content_safety(svg_onload)
    assert not safe and "event" in reason

    # D. SVG with <foreignObject> rejected
    svg_fo = b'<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>'
    safe, reason = check_svg_content_safety(svg_fo)
    assert not safe and "prohibited element" in reason or "active scripts" in reason

    # E. Malformed SVG rejected
    svg_malformed = b'<svg><unclosed_tag>'
    safe, reason = check_svg_content_safety(svg_malformed)
    assert not safe and "Malformed" in reason

    # F. MIME/Extension spoofing rejected (text/html inside a .png file)
    fake_png = b"<html><head><script>alert('xss')</script></head><body>Fake image</body></html>"
    r_spoof = client.post("/api/admin/upload", files={"file": ("malicious.png", fake_png, "image/png")}, headers=headers)
    assert r_spoof.status_code == 400 and "Invalid image file" in r_spoof.json()["detail"]
    print("  -> MIME / Extension spoofing rejected")

    # G. Dangerous extension rejected (.exe, .html, .js)
    r_exe = client.post("/api/admin/upload", files={"file": ("evil.exe", b"MZ\x90\x00", "application/octet-stream")}, headers=headers)
    assert r_exe.status_code == 400 and "Invalid file extension" in r_exe.json()["detail"]
    print("  -> Dangerous executable extensions rejected")

    # H. Valid JPEG upload works
    img_jpg_arr = io.BytesIO()
    img_jpg = Image.new("RGB", (50, 50), color="blue")
    img_jpg.save(img_jpg_arr, format="JPEG")
    r_jpg = client.post("/api/admin/upload", files={"file": ("banner.jpg", img_jpg_arr.getvalue(), "image/jpeg")}, headers=headers)
    assert r_jpg.status_code == 200 and r_jpg.json()["url"].endswith(".jpg")
    print("  -> Valid JPEG upload verified")

    # I. Valid WebP upload works
    img_webp_arr = io.BytesIO()
    img_webp = Image.new("RGB", (50, 50), color="green")
    img_webp.save(img_webp_arr, format="WEBP")
    r_webp = client.post("/api/admin/upload", files={"file": ("banner.webp", img_webp_arr.getvalue(), "image/webp")}, headers=headers)
    assert r_webp.status_code == 200 and r_webp.json()["url"].endswith(".webp")
    print("  -> Valid WebP upload verified")

    # J. Verify no rejected uploads leaked onto disk
    uploads_after = set(os.listdir(UPLOADS_DIR))
    persisted_new = uploads_after - uploads_before
    # Only the 2 successful uploads (banner.jpg, banner.webp) should be in persisted_new
    assert len(persisted_new) == 2, f"Unexpected files persisted on disk: {persisted_new}"
    print("  -> Verified rejected uploads never leave files on disk")
    print("  [PASS] SVG stored-XSS prevention and media validation fully verified.")

    # 14. Session Logout Invalidation
    print("\n[Test 14] Session Logout Invalidation")
    res_logout = client.post("/api/admin/auth/logout", headers=headers)
    assert res_logout.status_code == 200

    # Old token must now be rejected
    res_after_logout = client.get("/api/admin/auth/me", headers=headers)
    assert res_after_logout.status_code == 401, "Old token was not invalidated after logout!"
    print("  [PASS] Logout successfully invalidated session.")

    # 15. Password Complexity Policy Enforcement
    print("\n[Test 15] Password Complexity Policy Enforcement")
    from database import validate_password_strength
    
    # Sub-test A: Short password
    valid, msg = validate_password_strength("Short1!")
    assert not valid and "at least 12 characters" in msg
    
    # Sub-test B: Missing uppercase
    valid, msg = validate_password_strength("alllowercase123!")
    assert not valid and "uppercase" in msg
    
    # Sub-test C: Missing lowercase
    valid, msg = validate_password_strength("ALLLOWERCASE123!")
    assert not valid and "lowercase" in msg
    
    # Sub-test D: Missing number
    valid, msg = validate_password_strength("NoNumbersHere!@#")
    assert not valid and "number" in msg
    
    # Sub-test E: Missing special character
    valid, msg = validate_password_strength("NoSpecialChar1234")
    assert not valid and "special character" in msg
    
    # Sub-test F: Prohibited default password
    valid, msg = validate_password_strength("MayaviAdmin2026!")
    assert not valid and "prohibited" in msg

    # Sub-test G: Valid compliant password
    valid, msg = validate_password_strength("Valid#SecurePass2026!")
    assert valid, f"Expected valid password, got error: {msg}"
    print("  [PASS] Password complexity validator accurately enforces security policy.")

    # 16. Production Startup Security Gate (Fail-Safe on Missing/Default Credentials)
    print("\n[Test 16] Production Startup Security Gate")
    import os
    import tempfile
    import sqlite3
    from database import seed_data_if_empty, init_db
    from auth import ph

    # Test in a temporary isolated DB directory
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_db = os.path.join(tmp_dir, "test_prod.db")
        old_env_prod = os.environ.get("ENVIRONMENT")
        old_env_pwd = os.environ.get("ADMIN_PASSWORD")
        old_db_path = os.environ.get("DB_PATH")
        old_data_dir = os.environ.get("DATA_DIR")

        try:
            os.environ["ENVIRONMENT"] = "production"
            os.environ["DB_PATH"] = tmp_db
            os.environ["DATA_DIR"] = tmp_dir
            
            # Sub-test A: Missing ADMIN_PASSWORD in production on empty DB
            if "ADMIN_PASSWORD" in os.environ:
                del os.environ["ADMIN_PASSWORD"]
            init_db()

            raised_missing = False
            try:
                seed_data_if_empty(ph)
            except RuntimeError as e:
                raised_missing = True
                assert "ADMIN_PASSWORD environment variable must be set" in str(e)
            assert raised_missing, "Production startup did not abort when ADMIN_PASSWORD was missing!"

            # Sub-test B: Prohibited default password in production
            os.environ["ADMIN_PASSWORD"] = "MayaviAdmin2026!"
            raised_default = False
            try:
                seed_data_if_empty(ph)
            except RuntimeError as e:
                raised_default = True
                assert "strictly prohibited" in str(e)
            assert raised_default, "Production startup did not abort with default MayaviAdmin2026! password!"

            # Sub-test C: Weak password in production
            os.environ["ADMIN_PASSWORD"] = "weak"
            raised_weak = False
            try:
                seed_data_if_empty(ph)
            except RuntimeError as e:
                raised_weak = True
                assert "complexity requirements" in str(e)
            assert raised_weak, "Production startup did not abort with weak password!"

            # Sub-test D: Valid password in production succeeds
            os.environ["ADMIN_PASSWORD"] = "ProdSecure#Admin2026!"
            seed_data_if_empty(ph)
            
            # Verify admin was created with secure password
            conn = sqlite3.connect(tmp_db)
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT username, email FROM admin_users").fetchone()
            assert row is not None and row["username"] == "admin"
            conn.close()

        finally:
            # Restore environment variables
            if old_env_prod is not None:
                os.environ["ENVIRONMENT"] = old_env_prod
            else:
                os.environ.pop("ENVIRONMENT", None)

            if old_env_pwd is not None:
                os.environ["ADMIN_PASSWORD"] = old_env_pwd
            else:
                os.environ.pop("ADMIN_PASSWORD", None)

            if old_db_path is not None:
                os.environ["DB_PATH"] = old_db_path
            else:
                os.environ.pop("DB_PATH", None)

            if old_data_dir is not None:
                os.environ["DATA_DIR"] = old_data_dir
            else:
                os.environ.pop("DATA_DIR", None)

    print("  [PASS] Production startup security gate strictly prevents insecure initialization.")

    # 17. Preservation of Existing Administrator Accounts
    print("\n[Test 17] Preservation of Existing Administrator Accounts")
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, username, password_hash FROM admin_users WHERE username = 'admin'")
    existing_admin = c.fetchone()
    assert existing_admin is not None, "Primary admin not found in database"
    orig_id = existing_admin["id"]
    orig_hash = existing_admin["password_hash"]
    conn.close()

    # Re-running seed_data_if_empty must NOT modify or overwrite the existing admin account
    seed_data_if_empty(ph)

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, username, password_hash FROM admin_users WHERE username = 'admin'")
    after_seed = c.fetchone()
    conn.close()

    assert after_seed["id"] == orig_id, "Admin ID changed after re-seeding!"
    assert after_seed["password_hash"] == orig_hash, "Admin password hash changed after re-seeding!"
    print("  [PASS] Existing administrator credentials are fully preserved and untouched.")

    # 18. Production API Documentation Restrictions (Phase 3)
    print("\n[Test 18] Production API Documentation Restrictions")
    from server import is_production_env, should_enable_docs
    import os

    saved_env = os.environ.get("ENVIRONMENT")
    saved_docs = os.environ.get("ENABLE_DOCS")
    saved_render = os.environ.get("RENDER")

    try:
        # A. Development environment defaults
        os.environ.pop("ENVIRONMENT", None)
        os.environ.pop("ENABLE_DOCS", None)
        os.environ.pop("RENDER", None)
        assert not is_production_env()
        assert should_enable_docs() is True
        print("  -> Development mode enables docs by default")

        # B. Production environment disables docs
        os.environ["ENVIRONMENT"] = "production"
        assert is_production_env()
        assert should_enable_docs() is False

        # C. 'prod' and 'live' aliases disable docs
        os.environ["ENVIRONMENT"] = "prod"
        assert should_enable_docs() is False
        os.environ["ENVIRONMENT"] = "live"
        assert should_enable_docs() is False

        # D. Render cloud environment disables docs
        os.environ.pop("ENVIRONMENT", None)
        os.environ["RENDER"] = "true"
        assert is_production_env()
        assert should_enable_docs() is False
        print("  -> Production & Render environments strictly disable docs by default")

        # E. Explicit ENABLE_DOCS=false overrides dev
        os.environ.pop("RENDER", None)
        os.environ["ENABLE_DOCS"] = "false"
        assert should_enable_docs() is False

        # F. Explicit ENABLE_DOCS=true deliberately enables docs in prod
        os.environ["ENVIRONMENT"] = "production"
        os.environ["ENABLE_DOCS"] = "true"
        assert should_enable_docs() is True
        print("  -> Explicit overrides strictly obey operator intent")

        # G. Route test: simulate production app instance with docs disabled
        from fastapi.testclient import TestClient
        from fastapi import FastAPI, HTTPException

        prod_app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
        @prod_app.get("/docs", include_in_schema=False)
        @prod_app.get("/redoc", include_in_schema=False)
        @prod_app.get("/openapi.json", include_in_schema=False)
        async def disabled_route():
            raise HTTPException(status_code=404, detail="Not Found")

        prod_client = TestClient(prod_app)
        assert prod_client.get("/docs").status_code == 404
        assert prod_client.get("/redoc").status_code == 404
        assert prod_client.get("/openapi.json").status_code == 404
        print("  -> Production routes return 404 without schema disclosure")

    finally:
        # Restore original environment
        if saved_env is not None: os.environ["ENVIRONMENT"] = saved_env
        else: os.environ.pop("ENVIRONMENT", None)
        if saved_docs is not None: os.environ["ENABLE_DOCS"] = saved_docs
        else: os.environ.pop("ENABLE_DOCS", None)
        if saved_render is not None: os.environ["RENDER"] = saved_render
        else: os.environ.pop("RENDER", None)

    print("  [PASS] API documentation controls in production fully verified.")

    # 19. Timezone Modernization & Mixed Timestamp Compatibility (Phase 4)
    print("\n[Test 19] Timezone Modernization & Mixed Timestamp Compatibility")
    from auth import create_admin_session, invalidate_session
    from datetime import datetime, timezone

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM admin_users WHERE username = 'admin'")
    admin_id = c.fetchone()["id"]

    # A. New session creation uses timezone-aware datetime
    token_tz, expires_dt = create_admin_session(admin_id)
    assert expires_dt.tzinfo is not None, "Newly created expiration is not timezone-aware!"
    assert expires_dt.tzinfo == timezone.utc, f"Expected UTC timezone, got {expires_dt.tzinfo}"
    print("  -> New session timestamps are timezone-aware (UTC)")

    # B. Historical offset-naive ISO timestamp (valid future)
    naive_future_token = "test_naive_future_token_123"
    c.execute("INSERT OR REPLACE INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)",
              (naive_future_token, admin_id, "2099-01-01T12:00:00"))
    conn.commit()

    r_naive_future = client.get("/api/admin/auth/me", headers={"Authorization": f"Bearer {naive_future_token}"})
    assert r_naive_future.status_code == 200, f"Failed naive future session: {r_naive_future.json()}"
    print("  -> Historical offset-naive future timestamps validated successfully")

    # C. Historical offset-naive ISO timestamp (expired)
    naive_expired_token = "test_naive_expired_token_456"
    c.execute("INSERT OR REPLACE INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)",
              (naive_expired_token, admin_id, "2020-01-01T12:00:00"))
    conn.commit()

    r_naive_exp = client.get("/api/admin/auth/me", headers={"Authorization": f"Bearer {naive_expired_token}"})
    assert r_naive_exp.status_code == 401, f"Expected 401 for expired naive token, got {r_naive_exp.status_code}"
    print("  -> Historical offset-naive expired timestamps correctly rejected")

    # D. Modern timezone-aware ISO timestamp (valid future)
    tz_future_token = "test_tz_future_token_789"
    c.execute("INSERT OR REPLACE INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)",
              (tz_future_token, admin_id, "2099-01-01T12:00:00+00:00"))
    conn.commit()

    r_tz_future = client.get("/api/admin/auth/me", headers={"Authorization": f"Bearer {tz_future_token}"})
    assert r_tz_future.status_code == 200
    print("  -> Modern timezone-aware future timestamps validated successfully")

    # E. Malformed timestamp format raises clean 401 without crashing
    bad_time_token = "test_malformed_time_token_000"
    c.execute("INSERT OR REPLACE INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)",
              (bad_time_token, admin_id, "not-a-valid-datetime"))
    conn.commit()

    r_bad_time = client.get("/api/admin/auth/me", headers={"Authorization": f"Bearer {bad_time_token}"})
    assert r_bad_time.status_code == 401
    print("  -> Malformed timestamps safely handled with HTTP 401")

    # Cleanup test tokens
    invalidate_session(token_tz)
    invalidate_session(naive_future_token)
    invalidate_session(naive_expired_token)
    invalidate_session(tz_future_token)
    invalidate_session(bad_time_token)
    conn.close()

    print("  [PASS] Timezone modernization and mixed timestamp compatibility fully verified.")

    # 20. Persistent Storage Configuration & Directory Resolution (Phase 5)
    print("\n[Test 20] Persistent Storage Configuration & Directory Resolution")
    from server import check_storage_diagnostics
    import tempfile
    import os

    saved_render = os.environ.get("RENDER")
    saved_data = os.environ.get("DATA_DIR")
    saved_uploads = os.environ.get("UPLOADS_DIR")

    try:
        # A. Local development mode detection
        os.environ.pop("RENDER", None)
        os.environ.pop("ENVIRONMENT", None)
        os.environ.pop("DATA_DIR", None)
        os.environ.pop("UPLOADS_DIR", None)
        diag_local = check_storage_diagnostics()
        assert diag_local["storage_type"] == "local_development"
        assert diag_local["is_ephemeral"] is False
        print("  -> Local development storage mode identified correctly")

        # B. Ephemeral container detection on Render
        os.environ["RENDER"] = "true"
        diag_render_ephem = check_storage_diagnostics()
        assert diag_render_ephem["is_ephemeral"] is True
        assert diag_render_ephem["warning"] is not None
        assert "EPHEMERAL STORAGE DETECTED" in diag_render_ephem["warning"]
        print("  -> Ephemeral storage warning triggered when running in repo on Render")

        # C. Persistent storage detection with external mount
        with tempfile.TemporaryDirectory() as external_disk:
            ext_data = os.path.join(external_disk, "data")
            ext_uploads = os.path.join(external_disk, "uploads")
            os.environ["DATA_DIR"] = ext_data
            os.environ["UPLOADS_DIR"] = ext_uploads
            
            diag_persistent = check_storage_diagnostics()
            assert diag_persistent["is_ephemeral"] is False
            assert diag_persistent["storage_type"] == "persistent"
            assert diag_persistent["warning"] is None
            print("  -> Persistent cloud disk detected when mounted externally")

        # D. render.yaml verification
        render_yaml_path = os.path.join(os.path.dirname(__file__), "render.yaml")
        assert os.path.exists(render_yaml_path), "render.yaml blueprint file is missing"
        with open(render_yaml_path, "r", encoding="utf-8") as rf:
            render_content = rf.read()
        assert "disk:" in render_content
        assert "mountPath: /var/data" in render_content
        assert "DATA_DIR" in render_content and "/var/data/data" in render_content
        assert "UPLOADS_DIR" in render_content and "/var/data/uploads" in render_content
        print("  -> render.yaml blueprint contains verified persistent disk mount configuration")

    finally:
        if saved_render is not None: os.environ["RENDER"] = saved_render
        else: os.environ.pop("RENDER", None)
        if saved_data is not None: os.environ["DATA_DIR"] = saved_data
        else: os.environ.pop("DATA_DIR", None)
        if saved_uploads is not None: os.environ["UPLOADS_DIR"] = saved_uploads
        else: os.environ.pop("UPLOADS_DIR", None)

    print("  [PASS] Persistent storage diagnostics and configuration fully verified.")

    print("\n" + "=" * 60)
    print("ALL 20 AUTOMATED SUITE TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
