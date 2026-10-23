# Mayavi Technology Club — Admin Portal & Public Website Guide

## 1. Overview
The **Mayavi Technology Club** website has been upgraded to a full-stack, dynamic platform with two distinct access tiers:
- **Public Website (`/`)**: 100% public access with no login or registration requirement. Retains all original 3D Three.js VR headset animations, GSAP scroll triggers, audio/visual cues, cursor effects, and aesthetics.
- **Admin Portal (`/admin`)**: A secure, isolated administrative suite with Argon2id encrypted authentication, cryptographic session cookies, IP-based rate limiting, dynamic content management (Events, Members, Teams, Categories), image uploads, live website preview, and real-time dashboard analytics.

---

## 2. Default Administrator Credentials

| Parameter | Value |
| :--- | :--- |
| **Admin Portal URL** | `http://127.0.0.1:8000/admin` |
| **Username** | `admin` |
| **Email** | `admin@mayavi.tech` |
| **Password** | `MayaviAdmin2026!` |

> [!NOTE]
> No passwords or credentials are hardcoded in the frontend JavaScript. Authentication is executed strictly on the backend via RFC 9106 recommended Argon2id hashing.

### Managing or Resetting Admin Credentials via CLI
You can create or update administrator accounts at any time using the setup CLI:
```bash
python setup_admin.py --username admin --password "YourStrongPassword!" --email admin@mayavi.tech
```

---

## 3. How to Start the Server
Run the FastAPI backend server using either of the following methods:

**Method 1 (Command Line):**
```bash
python server.py
```

**Method 2 (Batch Script):**
Double-click `start_server.bat` in the project root.

Once started:
- **Public Website**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Events Listing**: [http://127.0.0.1:8000/events](http://127.0.0.1:8000/events)
- **Teams & Roster**: [http://127.0.0.1:8000/team-all.html](http://127.0.0.1:8000/team-all.html)
- **Admin Portal**: [http://127.0.0.1:8000/admin](http://127.0.0.1:8000/admin)

---

## 4. Admin Portal Features & Modules

### 4.1 Login & Security
- **Secure Authentication**: Backend validates Argon2id hashes with `argon2-cffi`.
- **Session Tokens**: Cryptographically random 48-byte tokens stored in SQLite with expiration and issued in `HttpOnly`, `SameSite=Lax` cookies as well as Bearer tokens.
- **Rate Limiting**: Protects against brute-force attacks by limiting failed logins to a maximum of 5 attempts within 5 minutes per IP address. Exceeding triggers HTTP 429 Too Many Requests.
- **Password Visibility**: Eye toggle button to reveal or mask passwords during login.
- **Safe Logout**: Immediately invalidates the token in the database and wipes the session cookie.

### 4.2 Dashboard Overview
- **Live Statistics Cards**: Dynamic counts for Total Events, Upcoming Events, Total Members, Total Teams, and Total Categories.
- **Quick Action Buttons**: Rapid shortcuts to add an Event, Member, Team, or Category.
- **Recent Activity Feed**: Real-time audit trail of administrator actions (creations, edits, deletions, uploads, logins).
- **Latest Events Snapshot**: Quick preview table of recent events.

### 4.3 Event Management (`/admin` -> Manage Events)
- **Full CRUD**: Create, view, edit, and delete events.
- **Publish / Unpublish Toggle**: Click the eye icon on any event to immediately publish or unpublish. Only published events appear on the public website.
- **Search & Filters**: Filter events by Category, Status (Upcoming, Completed, Cancelled), or Visibility (Published/Drafts).
- **Banner Upload & Preview**: Upload banners directly to `/uploads/` with instant image preview.
- **Form Fields**: Title, Category, Event Date, Venue/Location, Start Time, End Time, Registration URL, Banner Upload/URL, Description, Status, Featured flag, Published flag.

### 4.4 Member Management (`/admin` -> Manage Members)
- **Full CRUD**: Add, edit, reorder, and remove members.
- **Team & Category Assignment**: Assign members to primary teams and categories.
- **Profile Photo Upload**: Upload photographs directly with automatic preview.
- **Active Status Toggle**: Easily activate or deactivate members. Inactive members are automatically hidden from the public website.
- **Batch Filter**: Filter members by batch year (Y23, Y22, Y21, Y20, Y19).

### 4.5 Team Management (`/admin` -> Manage Teams)
- **Full CRUD**: Create teams, update logos, descriptions, and categories.
- **Team Leader Selection**: Select any member from the club roster to serve as Team Leader.
- **Member Assignment**: Multi-select checklist to assign members directly to teams.
- **Accidental Deletion Protection**: Warns the administrator if members are assigned to the team and provides safe disassociation upon deletion.

### 4.6 Category Management (`/admin` -> Manage Categories)
- **Full CRUD**: Add and edit categories with custom Bootstrap icons and hex color codes.
- **Duplicate Prevention**: Prevents duplicate category names with clear validation errors.
- **Usage Warning**: Warns if a category has teams assigned before deletion.

### 4.7 Website Live Preview
- **Integrated Browser View**: View changes immediately within the Admin Portal.
- **Device Switcher**: Switch between Desktop, Tablet, and Mobile viewport dimensions.
- **Reload View**: Refresh the embedded iframe with a single click.

### 4.8 Settings
- **Profile Summary**: Displays active administrator username, email, and role.
- **Change Password**: Form to update administrator password (requires current password and minimum 8 characters).
- **Environment Diagnostics**: Live summary of SQLite database, persistent storage, and cryptographic specs.

---

## 5. Public Website Integration
The public website is directly wired to the backend API:
- `events/index.html` and `events/info.html` fetch from `/api/events`, supporting live banners, dates, descriptions, categories, and registration links.
- `team-all.html` dynamically displays teams organized under their assigned categories with logos, leads, and member rosters via `/api/teams` and `/api/categories`.
- Changes made in the Admin Portal (adding events, changing team logos, assigning members, unpublishing events) reflect on the public website without editing source code.

---

## 6. Automated Testing Suite
A comprehensive automated test suite is included in `test_suite.py`:
```bash
python test_suite.py
```
This tests all 18 requirements including public access, auth rejection, valid login, Argon2id verification, session invalidation, CRUD operations, image uploads, rate limiting, and publish/unpublish visibility.
