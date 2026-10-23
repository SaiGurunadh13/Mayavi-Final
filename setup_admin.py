"""
Mayavi Tech Club - Administrative Account Setup & Password Reset CLI
Usage:
    python setup_admin.py --username admin --password MySecurePassword123! --email admin@mayavi.tech
"""
import sys
import argparse
from auth import hash_password, ph
from database import init_db, get_db_connection

def setup_admin(username: str, password: str, email: str, role: str = "admin"):
    init_db()
    if len(password) < 8:
        print("[!] Error: Password must be at least 8 characters long.")
        sys.exit(1)

    pwd_hash = hash_password(password)
    conn = get_db_connection()
    c = conn.cursor()

    c.execute("SELECT id FROM admin_users WHERE username = ? OR email = ?", (username, email))
    existing = c.fetchone()

    if existing:
        c.execute("""
            UPDATE admin_users
            SET username = ?, email = ?, password_hash = ?, role = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (username, email, pwd_hash, role, existing["id"]))
        conn.commit()
        print(f"[+] Administrator '{username}' updated successfully.")
    else:
        c.execute("""
            INSERT INTO admin_users (username, email, password_hash, role)
            VALUES (?, ?, ?, ?)
        """, (username, email, pwd_hash, role))
        conn.commit()
        print(f"[+] Administrator '{username}' ({email}) created successfully.")

    conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mayavi Tech Club Admin Setup")
    parser.add_argument("--username", "-u", default="admin", help="Admin username")
    parser.add_argument("--password", "-p", default="MayaviAdmin2026!", help="Admin password")
    parser.add_argument("--email", "-e", default="admin@mayavi.tech", help="Admin email")
    parser.add_argument("--role", "-r", default="admin", help="Admin role")
    args = parser.parse_args()

    setup_admin(args.username, args.password, args.email, args.role)
