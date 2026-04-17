# Flask Calendar App (Google Calendar Integration)

This project is a Flask + vanilla JS calendar UI with Google Calendar OAuth integration.

## Quick start (Windows PowerShell)

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Set environment variables from `.env.example`, then run:

```powershell
python app.py
```

Open http://127.0.0.1:5000/ in your browser.

## Required environment variables

- `FLASK_SECRET_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (example: `http://127.0.0.1:5000/google/callback`)
- Optional: `APP_STATE_DB` (default: `data/app_state.db`)

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable the Google Calendar API.
3. Create OAuth client credentials (Web application).
4. Add an authorized redirect URI that matches `GOOGLE_REDIRECT_URI`.
5. Put the client ID/secret in your environment variables.

## Persistent connect-button behavior

After successful OAuth, the backend stores:
- `connected = true`
- OAuth credentials

in SQLite (`data/app_state.db`) keyed by a long-lived Flask session user key.

On page load, frontend calls `GET /api/google/status`:
- if connected: connect button stays hidden and events are loaded from Google
- if not connected: connect button is shown

This persisted server-side state survives normal server restarts.
