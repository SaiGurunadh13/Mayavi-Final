"""
Mayavi Tech Club - SQLite Database Management & Seeding
"""
import os
import json
import sqlite3
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

DB_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DB_DIR, "mayavi.db")

def get_db_connection() -> sqlite3.Connection:
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()

    # Admin Users
    c.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Sessions
    c.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        admin_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE CASCADE
    );
    """)

    # Login Attempts (Rate Limiting)
    c.execute("""
    CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        attempt_time REAL NOT NULL,
        success INTEGER NOT NULL DEFAULT 0
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts (ip_address, attempt_time);")

    # Categories
    c.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        icon_url TEXT DEFAULT '',
        color TEXT DEFAULT '#a855f7',
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Teams
    c.execute("""
    CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        logo_url TEXT DEFAULT '',
        banner_url TEXT DEFAULT '',
        category_id INTEGER,
        team_lead_id INTEGER,
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
        FOREIGN KEY (team_lead_id) REFERENCES members (id) ON DELETE SET NULL
    );
    """)

    # Members
    c.execute("""
    CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        profile_image_url TEXT DEFAULT '',
        designation TEXT DEFAULT '',
        biography TEXT DEFAULT '',
        team_id INTEGER,
        category_id INTEGER,
        batch_year TEXT DEFAULT 'Y23',
        skills TEXT DEFAULT '',
        social_links TEXT DEFAULT '{}',
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );
    """)

    # Member Teams (many-to-many relationship)
    c.execute("""
    CREATE TABLE IF NOT EXISTS member_teams (
        member_id INTEGER NOT NULL,
        team_id INTEGER NOT NULL,
        role_in_team TEXT DEFAULT '',
        PRIMARY KEY (member_id, team_id),
        FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE,
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
    );
    """)

    # Events
    c.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        event_date TEXT NOT NULL,
        start_time TEXT DEFAULT '',
        end_time TEXT DEFAULT '',
        location TEXT DEFAULT '',
        category_id INTEGER,
        category_name TEXT DEFAULT '',
        banner_url TEXT DEFAULT '',
        image_urls TEXT DEFAULT '[]',
        registration_url TEXT DEFAULT '',
        status TEXT DEFAULT 'Upcoming',
        is_featured INTEGER DEFAULT 0,
        is_published INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );
    """)

    # Activity Logs
    c.execute("""
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        details TEXT DEFAULT '',
        admin_username TEXT DEFAULT 'admin',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # System Settings
    c.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    conn.commit()
    conn.close()

def log_activity(action: str, entity_type: str, entity_id: Optional[int], details: str = "", username: str = "admin"):
    conn = get_db_connection()
    conn.execute(
        "INSERT INTO activity_logs (action, entity_type, entity_id, details, admin_username) VALUES (?, ?, ?, ?, ?)",
        (action, entity_type, entity_id, details, username)
    )
    conn.commit()
    conn.close()

def seed_data_if_empty(password_hasher):
    conn = get_db_connection()
    c = conn.cursor()

    # 1. Admin User
    c.execute("SELECT COUNT(*) as cnt FROM admin_users")
    if c.fetchone()["cnt"] == 0:
        admin_user = os.environ.get("ADMIN_USERNAME", "admin")
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@mayavi.tech")
        admin_pwd = os.environ.get("ADMIN_PASSWORD", "MayaviAdmin2026!")
        pwd_hash = password_hasher.hash(admin_pwd)
        c.execute(
            "INSERT INTO admin_users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
            (admin_user, admin_email, pwd_hash)
        )
        print(f"[*] Created default admin account: {admin_user} ({admin_email})")

    # 2. Categories
    c.execute("SELECT COUNT(*) as cnt FROM categories")
    cat_map = {}
    if c.fetchone()["cnt"] == 0:
        initial_cats = [
            ("Game Development", "Engine architecture, gameplay programming, physics and mechanics.", "bi-controller", "#ec4899", 1),
            ("Extended Reality", "Augmented Reality, Virtual Reality and Mixed Reality experiences.", "bi-badge-ar-fill", "#3b82f6", 2),
            ("3D Modelling & Animations", "Blender pipelines, 3D assets, character rigging and motion graphics.", "bi-boxes", "#10b981", 3),
            ("UI/UX Design", "Spatial interface design, human computer interaction and rapid prototyping.", "bi-bezier", "#f59e0b", 4),
            ("Leadership & Operations", "Club management, PR, sponsorship, marketing and logistics.", "bi-people-fill", "#8b5cf6", 5),
            ("Skill Development", "Workshops, training sessions and student career development.", "bi-mortarboard-fill", "#06b6d4", 6)
        ]
        for name, desc, icon, color, order in initial_cats:
            c.execute(
                "INSERT INTO categories (name, description, icon_url, color, display_order, is_active) VALUES (?, ?, ?, ?, ?, 1)",
                (name, desc, icon, color, order)
            )
            cat_map[name] = c.lastrowid
        print(f"[*] Seeded {len(initial_cats)} categories")
    else:
        for row in c.execute("SELECT id, name FROM categories").fetchall():
            cat_map[row["name"]] = row["id"]

    # 3. Teams
    c.execute("SELECT COUNT(*) as cnt FROM teams")
    team_map = {}
    if c.fetchone()["cnt"] == 0:
        initial_teams = [
            ("Game Dev Studio", "Focuses on Unity, Unreal Engine 5, C++, and game mechanics design.", "assets/img/1.jpg", "assets/img/1.jpg", cat_map.get("Game Development"), 1),
            ("XR Immersive Lab", "Focuses on WebXR, Spark AR, Lens Studio, Quest headsets and spatial apps.", "assets/img/2.jpg", "assets/img/2.jpg", cat_map.get("Extended Reality"), 2),
            ("3D Animation Crew", "Focuses on Blender asset pipeline, character modelling and lighting.", "assets/img/3.jpg", "assets/img/3.jpg", cat_map.get("3D Modelling & Animations"), 3),
            ("Spatial UI/UX Wing", "Focuses on spatial interfaces, accessibility, wireframes and prototypes.", "assets/img/4.jpg", "assets/img/4.jpg", cat_map.get("UI/UX Design"), 4),
            ("Core Leadership & PR", "Executive board, public relations, content creation and club management.", "assets/img/projects/marathon.jpg", "assets/img/projects/marathon.jpg", cat_map.get("Leadership & Operations"), 5),
            ("Events & Logistics", "Operations, event staging, hackathons and tech marathon coordination.", "assets/img/projects/craftyourvr.jpg", "assets/img/projects/craftyourvr.jpg", cat_map.get("Skill Development"), 6)
        ]
        for name, desc, logo, banner, cid, order in initial_teams:
            c.execute(
                "INSERT INTO teams (name, description, logo_url, banner_url, category_id, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
                (name, desc, logo, banner, cid, order)
            )
            team_map[name] = c.lastrowid
        print(f"[*] Seeded {len(initial_teams)} teams")
    else:
        for row in c.execute("SELECT id, name FROM teams").fetchall():
            team_map[row["name"]] = row["id"]

    # 4. Members
    exec_team_id = team_map.get("Core Leadership & PR")
    gamedev_team_id = team_map.get("Game Dev Studio")
    xr_team_id = team_map.get("XR Immersive Lab")
    anim_team_id = team_map.get("3D Animation Crew")
    ux_team_id = team_map.get("Spatial UI/UX Wing")
    logistics_team_id = team_map.get("Events & Logistics")

    c.execute("SELECT COUNT(*) as cnt FROM members")
    if c.fetchone()["cnt"] == 0:

        initial_members = [
            ("Dr VIJAY KUMAR BURUGARI", "assets/img/core/18.jpg", "FACULTY-INCHARGE", "Faculty Mentor & Advisor for Mayavi Technology Club", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Leadership, Mentorship, Academic Advisory", 1),
            ("Sukumar Pilli", "assets/img/core/2023/Sukumar Pilli.jpeg", "President", "Leading Mayavi's technical projects and student community initiatives.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Leadership, Project Management, Strategy", 2),
            ("Manohar", "assets/img/core/2023/Manohar.jpeg", "Advisor", "Former President & Advisor guiding strategic club growth and tech roadmap.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Advisory, Strategic Planning, Outreach", 3),
            ("E. Sai Eswar", "assets/img/core/2023/Sai Eswar.jpg", "Vice President", "Coordinating technical wings and inter-departmental collaborations.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Operations, Technical Coordination", 4),
            ("Kambhampati Sai Sandeep", "assets/img/core/2023/Sai Sandeep Kambhampati.jpg", "Director of Technology", "Overseeing system architecture, workshop modules and game engines.", gamedev_team_id, cat_map.get("Game Development"), "Y23", "Unreal Engine, C++, Systems Architecture", 5),
            ("K. Shanmukha Siri Chandana", "assets/img/core/2023/Siri Kathi.jpg", "Lead for Tech", "Leading technical curriculum and hands-on developer training.", gamedev_team_id, cat_map.get("Game Development"), "Y23", "Unity 3D, C#, Shader Programming", 6),
            ("Alapati Divya Srivalli Chowdary", "assets/img/core/2023/divya sri.jpeg", "Developer", "Specializing in full-stack web and spatial interactive experiences.", gamedev_team_id, cat_map.get("Game Development"), "Y23", "JavaScript, WebXR, Game Logic", 7),
            ("Chunduru Hemanth", "assets/img/core/2023/Hemanth Ch.jpg", "Logistics", "Managing event operations, hardware resources and venue coordination.", logistics_team_id, cat_map.get("Skill Development"), "Y23", "Event Staging, Hardware Ops, Logistics", 8),
            ("G. Amara Nageswari", "assets/img/core/2023/Gadupudi Amara nageswari2.jpg", "Non-Tech Director", "Directing communications, outreach and membership drives.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Community Management, Public Speaking", 9),
            ("N. Nutana", "assets/img/core/2023/Nutana Nandamuri.jpeg", "Non-Tech Lead", "Coordinating creative campaigns and student engagement programs.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Team Coordination, Content, Outreach", 10),
            ("Sasmita", "assets/img/core/2023/Sasmita Vinayanath.jpg", "Finance & Sponsorship", "Managing club sponsorships, finances and external partnerships.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Budgeting, Sponsorship, Partnerships", 11),
            ("Likith Satya", "assets/img/core/2023/likith satya.jpg", "Marketing Core", "Managing digital marketing, announcements and social broadcasts.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Social Marketing, Brand Strategy", 12),
            ("Sanjana", "assets/img/core/2023/N SANJANA.jpeg", "PR Head", "Head of Public Relations and university media relations.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Public Relations, Media, Press", 13),
            ("Abhi Pulavarthi", "assets/img/core/2023/Abhi Pulavarthi.jpeg", "PR Member", "Public relations and promotional campaign coordination.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Communications, Event Promo", 14),
            ("Shaik Mohammad Shanawaz", "assets/img/core/2023/shaik Shanawaz.jpg", "Blogs Contributor", "Technical writer documenting workshops, tutorials and club tech.", exec_team_id, cat_map.get("Leadership & Operations"), "Y23", "Technical Writing, Documentation, Blogs", 15),
            # Y22 Notable Members
            ("Varun Chand", "assets/img/core/2022/varun.jpg", "Advisor", "Senior club advisor and mentor for game production.", exec_team_id, cat_map.get("Leadership & Operations"), "Y22", "Game Design, Advisory", 16),
            ("Naga Teja Navaneetham", "assets/img/core/2022/Teja.jpg", "Director of Community", "Fostering cross-club collaborations and hackathons.", exec_team_id, cat_map.get("Leadership & Operations"), "Y22", "Community Engagement, Mentorship", 17),
            ("Kantamneni Hrushikesh", "assets/img/core/2022/Hrushikesh.jpg", "Director of Technology", "Director of technology for Y22 batch.", gamedev_team_id, cat_map.get("Game Development"), "Y22", "Game Engines, Systems", 18),
            ("Venkata Revanth", "assets/img/core/2022/Revanth.jpg", "Chief Designer", "Chief 3D visual designer and animator.", anim_team_id, cat_map.get("3D Modelling & Animations"), "Y22", "Blender, 3D Art, Animation", 19),
            ("Sappa Sanjeev Ganesh Krishna", "assets/img/core/2022/Sanjeev.jpg", "AR/VR Developer", "Creator of VR Cardboard and Spark AR interactive modules.", xr_team_id, cat_map.get("Extended Reality"), "Y22", "Spark AR, VR Development, Unity", 20),
            ("Harsha Sai", "assets/img/core/2022/Harsha.jpg", "Director of Non-Tech", "Director of non-technical affairs for Y22.", exec_team_id, cat_map.get("Leadership & Operations"), "Y22", "Operations, Leadership", 21),
            ("Bhavya Vaka", "assets/img/core/2022/Bhavya.jpg", "Non-Tech Lead", "Non-tech operations lead for Y22.", exec_team_id, cat_map.get("Leadership & Operations"), "Y22", "Event Coordination, Student Outreach", 22),
            ("Duddu Pavithra", "assets/img/core/2022/Pavithra3.jpg", "Finance & Sponsorship", "Finance lead for Y22 batch.", exec_team_id, cat_map.get("Leadership & Operations"), "Y22", "Finance, Sponsorship Relations", 23),
            ("Sindhu Pasupuleti", "assets/img/core/2022/Sindhu.jpg", "Public Relations", "Public relations coordinator for Y22 batch.", exec_team_id, cat_map.get("Leadership & Operations"), "Y22", "PR, Networking", 24)
        ]

        for name, img, desig, bio, tid, cid, batch, skills, order in initial_members:
            social = json.dumps({
                "linkedin": "https://www.linkedin.com/company/mayavi-technology-club/",
                "github": "https://github.com",
                "email": "support@klefmayavi.tech"
            })
            c.execute("""
                INSERT INTO members (full_name, profile_image_url, designation, biography, team_id, category_id, batch_year, skills, social_links, display_order, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (name, img, desig, bio, tid, cid, batch, skills, social, order))
            mid = c.lastrowid
            if tid:
                c.execute("INSERT OR IGNORE INTO member_teams (member_id, team_id, role_in_team) VALUES (?, ?, ?)", (mid, tid, desig))
        print(f"[*] Seeded {len(initial_members)} members")

    # Update team leads
    sukumar = c.execute("SELECT id FROM members WHERE full_name = 'Sukumar Pilli'").fetchone()
    if sukumar and exec_team_id:
        c.execute("UPDATE teams SET team_lead_id = ? WHERE id = ?", (sukumar["id"], exec_team_id))

    sandeep = c.execute("SELECT id FROM members WHERE full_name LIKE '%Sai Sandeep%'").fetchone()
    if sandeep and gamedev_team_id:
        c.execute("UPDATE teams SET team_lead_id = ? WHERE id = ?", (sandeep["id"], gamedev_team_id))

    sanjeev = c.execute("SELECT id FROM members WHERE full_name LIKE '%Sanjeev%'").fetchone()
    if sanjeev and xr_team_id:
        c.execute("UPDATE teams SET team_lead_id = ? WHERE id = ?", (sanjeev["id"], xr_team_id))

    revanth = c.execute("SELECT id FROM members WHERE full_name LIKE '%Revanth%'").fetchone()
    if revanth and anim_team_id:
        c.execute("UPDATE teams SET team_lead_id = ? WHERE id = ?", (revanth["id"], anim_team_id))

    # 5. Events (import directly from events/data.json)
    c.execute("SELECT COUNT(*) as cnt FROM events")
    if c.fetchone()["cnt"] == 0:
        events_json_path = os.path.join(os.path.dirname(__file__), "events", "data.json")
        if os.path.exists(events_json_path):
            with open(events_json_path, "r", encoding="utf-8") as f:
                event_items = json.load(f)

            for idx, item in enumerate(event_items):
                cat_name = item.get("category", "Technology")
                cid = cat_map.get(cat_name)
                # If category doesn't exist, map or fallback
                if not cid:
                    if "Game" in cat_name:
                        cid = cat_map.get("Game Development")
                    elif "Reality" in cat_name or "AR" in cat_name or "VR" in cat_name:
                        cid = cat_map.get("Extended Reality")
                    elif "Graphics" in cat_name or "Design" in cat_name:
                        cid = cat_map.get("3D Modelling & Animations")
                    else:
                        cid = cat_map.get("Skill Development")

                title = item.get("name", "Mayavi Event")
                desc = item.get("des", "")
                date_str = item.get("date", "2023-01-01")
                venue = item.get("venue", "K L University Campus")
                poster = item.get("poster", "")
                img_list = json.dumps(item.get("img", []))

                c.execute("""
                    INSERT INTO events (title, description, event_date, start_time, end_time, location, category_id, category_name, banner_url, image_urls, registration_url, status, is_featured, is_published)
                    VALUES (?, ?, ?, '10:00 AM', '05:00 PM', ?, ?, ?, ?, ?, 'https://klefmayavi.tech', 'Completed', ?, 1)
                """, (title, desc, date_str, venue, cid, cat_name, poster, img_list, 1 if idx < 2 else 0))

            print(f"[*] Seeded {len(event_items)} events from events/data.json")

    # Add at least one Upcoming Featured Event to showcase the filter dynamically
    c.execute("SELECT COUNT(*) as cnt FROM events WHERE status = 'Upcoming'")
    if c.fetchone()["cnt"] == 0:
        xr_cat_id = cat_map.get("Extended Reality")
        c.execute("""
            INSERT INTO events (title, description, event_date, start_time, end_time, location, category_id, category_name, banner_url, image_urls, registration_url, status, is_featured, is_published)
            VALUES (?, ?, ?, '09:30 AM', '04:30 PM', ?, ?, 'Extended Reality', 'assets/img/projects/craftyourvr.jpg', '["assets/img/projects/craftyourvr1.jpg","assets/img/projects/craftyourvr2.jpg"]', 'https://forms.gle/mayavi-hack-2026', 'Upcoming', 1, 1)
        """, (
            "VisionX Global Hackathon 2026",
            "An international 36-hour hackathon focused on Spatial Computing, Apple Vision Pro, WebXR and AI-driven 3D Worlds. Join teams across institutions and compete for top prizes, developer kits and industry mentorship.",
            "November 15 - 16, 2026",
            "R&D Auditorium & Virtual Stream",
            xr_cat_id
        ))
        print("[*] Added upcoming featured event: VisionX Global Hackathon 2026")

    conn.commit()
    conn.close()
