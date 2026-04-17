import os
import tempfile
from datetime import timedelta
from uuid import uuid4

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

from google_calendar_service import (
    GoogleIntegrationError,
    build_oauth_flow,
    create_google_event,
    credentials_to_dict,
    dict_to_credentials,
    ensure_valid_credentials,
    is_google_configured,
    list_upcoming_events,
)
from google_store import GoogleConnectionStore

load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)
app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "change-this-dev-secret")
app.config["SESSION_PERMANENT"] = True
app.permanent_session_lifetime = timedelta(days=3650)


def _build_store() -> GoogleConnectionStore:
    configured_db = os.getenv("APP_STATE_DB")
    if configured_db:
        return GoogleConnectionStore(configured_db)

    primary_db = "data/app_state.db"
    try:
        return GoogleConnectionStore(primary_db)
    except Exception as exc:
        fallback_db = os.path.join(tempfile.gettempdir(), "app_state.db")
        print(f"Failed to open {primary_db}: {exc}. Falling back to {fallback_db}.")
        return GoogleConnectionStore(fallback_db)


store = _build_store()


def get_user_key() -> str:
    if "user_key" not in session:
        session["user_key"] = uuid4().hex
    session.permanent = True
    return session["user_key"]


def get_user_google_state() -> dict:
    return store.get_connection_state(get_user_key())


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify({"ok": True}), 200


@app.get("/google/connect")
def google_connect():
    try:
        flow = build_oauth_flow()
    except GoogleIntegrationError as exc:
        return redirect(url_for("index", google_error=str(exc)))

    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    session["google_oauth_state"] = state
    return redirect(auth_url)


@app.get("/google/callback")
def google_callback():
    oauth_error = request.args.get("error")
    oauth_error_description = request.args.get("error_description")
    if oauth_error:
        message = oauth_error_description or oauth_error
        return redirect(url_for("index", google_error=message))

    state = session.get("google_oauth_state")
    if not state:
        return redirect(url_for("index", google_error="Missing OAuth state"))

    try:
        flow = build_oauth_flow(state=state)
        authorization_response = request.url
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower()
        if forwarded_proto == "https" and authorization_response.startswith("http://"):
            authorization_response = "https://" + authorization_response[len("http://") :]

        flow.fetch_token(authorization_response=authorization_response)
        creds_dict = credentials_to_dict(flow.credentials)
    except Exception as exc:
        app.logger.exception("Failed to authorize Google Calendar callback")
        return redirect(url_for("index", google_error=f"Failed to authorize Google Calendar: {exc}"))

    user_key = get_user_key()
    existing = store.get_connection_state(user_key).get("credentials") or {}
    if not creds_dict.get("refresh_token") and existing.get("refresh_token"):
        creds_dict["refresh_token"] = existing["refresh_token"]

    store.save_connection_state(user_key, connected=True, credentials=creds_dict)
    session.pop("google_oauth_state", None)
    return redirect(url_for("index", google="connected"))


@app.get("/api/google/status")
def google_status():
    state = get_user_google_state()
    return jsonify(
        {
            "connected": bool(state.get("connected")),
            "configured": is_google_configured(),
        }
    )


@app.get("/api/google/events")
def google_events():
    state = get_user_google_state()
    if not state.get("connected") or not state.get("credentials"):
        return jsonify({"ok": False, "connected": False, "error": "Google Calendar is not connected."}), 401

    try:
        credentials = dict_to_credentials(state.get("credentials"))
        credentials = ensure_valid_credentials(credentials)
        store.save_connection_state(
            get_user_key(),
            connected=True,
            credentials=credentials_to_dict(credentials),
        )
        events = list_upcoming_events(credentials)
        return jsonify({"ok": True, "connected": True, "events": events})
    except Exception as exc:
        return jsonify({"ok": False, "connected": True, "error": f"Failed to fetch events: {exc}"}), 502


@app.post("/api/google/events")
def google_create_event():
    state = get_user_google_state()
    if not state.get("connected") or not state.get("credentials"):
        return jsonify({"ok": False, "error": "Google Calendar is not connected."}), 401

    payload = request.get_json(silent=True) or {}
    try:
        credentials = dict_to_credentials(state.get("credentials"))
        credentials = ensure_valid_credentials(credentials)
        created = create_google_event(credentials, payload)
        store.save_connection_state(
            get_user_key(),
            connected=True,
            credentials=credentials_to_dict(credentials),
        )
        return jsonify({"ok": True, "event": created}), 201
    except GoogleIntegrationError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except ValueError:
        return jsonify({"ok": False, "error": "Invalid date/time format."}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": f"Failed to create event: {exc}"}), 502


if __name__ == "__main__":
    app.run(debug=True)
