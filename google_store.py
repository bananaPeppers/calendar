import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class GoogleConnectionStore:
    def __init__(self, db_path: str) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS google_connections (
                    user_key TEXT PRIMARY KEY,
                    connected INTEGER NOT NULL DEFAULT 0,
                    credentials_json TEXT,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def get_connection_state(self, user_key: str) -> dict[str, Any]:
        with self._get_connection() as conn:
            row = conn.execute(
                """
                SELECT connected, credentials_json, updated_at
                FROM google_connections
                WHERE user_key = ?
                """,
                (user_key,),
            ).fetchone()

        if not row:
            return {"connected": False, "credentials": None}

        credentials = None
        if row["credentials_json"]:
            try:
                credentials = json.loads(row["credentials_json"])
            except json.JSONDecodeError:
                credentials = None

        return {
            "connected": bool(row["connected"]),
            "credentials": credentials,
            "updated_at": row["updated_at"],
        }

    def save_connection_state(
        self,
        user_key: str,
        *,
        connected: bool,
        credentials: dict[str, Any] | None = None,
    ) -> None:
        existing = self.get_connection_state(user_key)
        stored_credentials = credentials if credentials is not None else existing.get("credentials")
        credentials_json = json.dumps(stored_credentials) if stored_credentials else None
        updated_at = datetime.now(timezone.utc).isoformat()

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO google_connections (user_key, connected, credentials_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_key) DO UPDATE SET
                    connected = excluded.connected,
                    credentials_json = excluded.credentials_json,
                    updated_at = excluded.updated_at
                """,
                (user_key, int(connected), credentials_json, updated_at),
            )
            conn.commit()
