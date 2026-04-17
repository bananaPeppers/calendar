import os
from datetime import datetime, time, timedelta, timezone
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar"]


class GoogleIntegrationError(Exception):
    pass


def is_google_configured() -> bool:
    return bool(
        os.getenv("GOOGLE_CLIENT_ID")
        and os.getenv("GOOGLE_CLIENT_SECRET")
        and os.getenv("GOOGLE_REDIRECT_URI")
    )


def _get_google_client_config() -> dict[str, Any]:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise GoogleIntegrationError(
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, "
            "GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
        )

    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


def _parse_google_datetime(value: str) -> datetime:
    if value.endswith("Z"):
        value = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _to_local(dt: datetime) -> datetime:
    local_tz = datetime.now().astimezone().tzinfo
    if dt.tzinfo is None:
        return dt.replace(tzinfo=local_tz)
    return dt.astimezone(local_tz)


def build_oauth_flow(state: str | None = None) -> Flow:
    flow = Flow.from_client_config(_get_google_client_config(), scopes=GOOGLE_SCOPES, state=state)
    flow.redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    return flow


def credentials_to_dict(credentials: Credentials) -> dict[str, Any]:
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes,
        "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
    }


def dict_to_credentials(data: dict[str, Any] | None) -> Credentials:
    if not data:
        raise GoogleIntegrationError("Google credentials not found.")

    expiry = data.get("expiry")
    expiry_dt = datetime.fromisoformat(expiry) if expiry else None
    return Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes"),
        expiry=expiry_dt,
    )


def ensure_valid_credentials(credentials: Credentials) -> Credentials:
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    return credentials


def normalize_google_event(raw_event: dict[str, Any]) -> dict[str, Any]:
    start = raw_event.get("start", {})
    end = raw_event.get("end", {})
    all_day = "date" in start

    if all_day:
        date_value = start.get("date")
        end_date = end.get("date", date_value)
        time_value = "00:00"
        end_time = ""
    else:
        start_dt = _to_local(_parse_google_datetime(start.get("dateTime")))
        end_dt = _to_local(_parse_google_datetime(end.get("dateTime"))) if end.get("dateTime") else None
        date_value = start_dt.strftime("%Y-%m-%d")
        time_value = start_dt.strftime("%H:%M")
        end_date = end_dt.strftime("%Y-%m-%d") if end_dt else date_value
        end_time = end_dt.strftime("%H:%M") if end_dt else ""

    return {
        "id": raw_event.get("id"),
        "title": raw_event.get("summary") or "Untitled event",
        "description": raw_event.get("description") or "",
        "date": date_value,
        "time": time_value,
        "end_date": end_date,
        "end_time": end_time,
        "all_day": all_day,
    }


def list_upcoming_events(credentials: Credentials, *, max_results: int = 250) -> list[dict[str, Any]]:
    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
    now = datetime.now(timezone.utc).isoformat()
    response = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=now,
            singleEvents=True,
            orderBy="startTime",
            maxResults=max_results,
        )
        .execute()
    )
    items = response.get("items", [])
    return [normalize_google_event(item) for item in items]


def create_google_event(credentials: Credentials, payload: dict[str, Any]) -> dict[str, Any]:
    summary = (payload.get("summary") or "").strip()
    description = (payload.get("description") or "").strip()
    date_value = (payload.get("date") or "").strip()
    start_time = (payload.get("start_time") or "").strip()
    end_time = (payload.get("end_time") or "").strip()

    if not summary:
        raise GoogleIntegrationError("Event title is required.")
    if not date_value:
        raise GoogleIntegrationError("Event date is required.")
    if not start_time or not end_time:
        raise GoogleIntegrationError("Start and end time are required.")

    start_dt = datetime.combine(datetime.fromisoformat(date_value).date(), time.fromisoformat(start_time))
    end_dt = datetime.combine(datetime.fromisoformat(date_value).date(), time.fromisoformat(end_time))
    if end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)

    local_tz = datetime.now().astimezone().tzinfo
    start_dt = start_dt.replace(tzinfo=local_tz)
    end_dt = end_dt.replace(tzinfo=local_tz)

    event_body = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start_dt.isoformat()},
        "end": {"dateTime": end_dt.isoformat()},
    }

    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
    created = service.events().insert(calendarId="primary", body=event_body).execute()
    return normalize_google_event(created)
