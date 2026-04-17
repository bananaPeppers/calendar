import os
from datetime import datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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


def _resolve_time_zone(time_zone_name: str | None):
    if not time_zone_name:
        return None
    try:
        return ZoneInfo(time_zone_name)
    except ZoneInfoNotFoundError as exc:
        raise GoogleIntegrationError(f"Unsupported time zone: {time_zone_name}") from exc


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


def normalize_google_event(
    raw_event: dict[str, Any], *, display_time_zone: str | None = None
) -> dict[str, Any]:
    start = raw_event.get("start", {})
    end = raw_event.get("end", {})
    all_day = "date" in start
    target_zone = _resolve_time_zone(display_time_zone)

    if all_day:
        date_value = start.get("date")
        end_date = end.get("date", date_value)
        time_value = "00:00"
        end_time = ""
    else:
        start_dt = _parse_google_datetime(start.get("dateTime"))
        if target_zone:
            start_dt = start_dt.astimezone(target_zone)

        end_dt = _parse_google_datetime(end.get("dateTime")) if end.get("dateTime") else None
        if end_dt and target_zone:
            end_dt = end_dt.astimezone(target_zone)

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


def list_upcoming_events(
    credentials: Credentials,
    *,
    max_results: int = 250,
    display_time_zone: str | None = None,
    lookback_minutes: int = 5,
) -> list[dict[str, Any]]:
    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
    safe_lookback = max(0, lookback_minutes)
    now = (datetime.now(timezone.utc) - timedelta(minutes=safe_lookback)).isoformat()
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
    return [normalize_google_event(item, display_time_zone=display_time_zone) for item in items]


def create_google_event(credentials: Credentials, payload: dict[str, Any]) -> dict[str, Any]:
    summary = (payload.get("summary") or "").strip()
    description = (payload.get("description") or "").strip()
    date_value = (payload.get("date") or "").strip()
    start_time = (payload.get("start_time") or "").strip()
    end_time = (payload.get("end_time") or "").strip()
    time_zone_name = (payload.get("time_zone") or "").strip()

    if not summary:
        raise GoogleIntegrationError("Event title is required.")
    if not date_value:
        raise GoogleIntegrationError("Event date is required.")
    if not start_time or not end_time:
        raise GoogleIntegrationError("Start and end time are required.")

    event_tz = _resolve_time_zone(time_zone_name)
    if event_tz is None:
        event_tz = datetime.now().astimezone().tzinfo or timezone.utc

    start_dt = datetime.combine(datetime.fromisoformat(date_value).date(), time.fromisoformat(start_time))
    end_dt = datetime.combine(datetime.fromisoformat(date_value).date(), time.fromisoformat(end_time))
    if end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)

    start_dt = start_dt.replace(tzinfo=event_tz)
    end_dt = end_dt.replace(tzinfo=event_tz)

    event_body = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start_dt.isoformat()},
        "end": {"dateTime": end_dt.isoformat()},
    }
    if time_zone_name:
        event_body["start"]["timeZone"] = time_zone_name
        event_body["end"]["timeZone"] = time_zone_name

    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
    created = service.events().insert(calendarId="primary", body=event_body).execute()
    return normalize_google_event(created, display_time_zone=time_zone_name or None)
