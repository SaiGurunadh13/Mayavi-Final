"""
Mayavi Tech Club - Administrative Account Setup & Password Reset CLI
Usage:
    python setup_admin.py --username admin --email admin@mayavi.tech
    (prompts interactively for secure password entry)
"""
import sys
import getpass
import argparse
from auth import hash_password, ph
from database import init_db, get_db_connection, validate_password_strength

def setup_admin(username: str, password: str, email: str, role: str = "admin"):
    init_db()

    is_valid, err_msg = validate_password_strength(password)
    if not is_valid:
        print(f"[!] Error: Password does not meet security requirements: {err_msg}")
        sys.exit(1)

    pwd_hash = hash_password(password)
    conn = get_db_connection()
    try:
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
    except Exception as e:
        conn.rollback()
        print(f"[!] Database error setting up administrator: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mayavi Tech Club Admin Setup")
    parser.add_argument("--username", "-u", default="admin", help="Admin username")
    parser.add_argument("--password", "-p", default=None, help="Admin password (leave empty to enter securely)")
    parser.add_argument("--email", "-e", default="admin@mayavi.tech", help="Admin email")
    parser.add_argument("--role", "-r", default="admin", help="Admin role")
    args = parser.parse_args()

    password = args.password
    if not password:
        if sys.stdin.isatty():
            password = getpass.getpass("Enter administrator password: ")
            confirm = getpass.getpass("Confirm administrator password: ")
            if password != confirm:
                print("[!] Error: Passwords do not match.")
                sys.exit(1)
        else:
            print("[!] Error: Password is required. Provide --password or run interactively in a terminal.")
            sys.exit(1)

    setup_admin(args.username, password, args.email, args.role)
