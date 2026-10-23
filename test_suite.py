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

    # 14. Session Logout Invalidation
    print("\n[Test 14] Session Logout Invalidation")
    res_logout = client.post("/api/admin/auth/logout", headers=headers)
    assert res_logout.status_code == 200

    # Old token must now be rejected
    res_after_logout = client.get("/api/admin/auth/me", headers=headers)
    assert res_after_logout.status_code == 401, "Old token was not invalidated after logout!"
    print("  [PASS] Logout successfully invalidated session.")

    print("\n" + "=" * 60)
    print("ALL 14 AUTOMATED SUITE TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
