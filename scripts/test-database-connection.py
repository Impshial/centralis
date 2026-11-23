"""Interactive, read-only connection check. Never saves or prints credentials."""
import getpass
from pathlib import Path
import sys

cached_dependencies = Path(__file__).resolve().parents[1] / "node_modules/.cache/backup-python"
if cached_dependencies.is_dir():
    sys.path.insert(0, str(cached_dependencies))


def main():
    try:
        import psycopg
    except ImportError:
        print("The Python PostgreSQL driver is unavailable. Ask for help installing psycopg.")
        return 1
    print("Copy the Session pooler URI from Supabase > Connect.")
    print("Paste the complete URI below; the URI will be visible.")
    print("Leave [YOUR-PASSWORD] in the URI. Enter the real password separately.")
    uri = input("Connection URI: ").strip()
    if not uri.startswith(("postgresql://", "postgres://")):
        print("Use the connection URI beginning with postgresql://.")
        return 1
    password = getpass.getpass("Database password (hidden): ")
    try:
        with psycopg.connect(uri, password=password, sslmode="require",
                             connect_timeout=15, options="-c default_transaction_read_only=on") as db:
            result = db.execute("SELECT 1").fetchone()
            if result != (1,):
                print("The connection returned an unexpected result.")
                return 1
        print("SUCCESS: Your database password and connection work. No data was changed.")
        return 0
    except psycopg.Error as error:
        # Do not echo driver messages: connection errors can contain user input.
        if error.sqlstate in ("28P01", "28000") or "password authentication failed" in str(error).lower():
            print("Authentication failed. Check your database password and the URI username.")
        else:
            print("Connection failed. Check the copied URI and use Session pooler, port 5432.")
            print("A network or connection failure does not necessarily mean the password is wrong.")
        return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled. Nothing was changed.")
        raise SystemExit(1)
