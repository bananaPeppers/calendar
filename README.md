# Flask Frontend Starter

This is a minimal Flask project that serves a front-end HTML page. Use it as a starting point for building your UI.

Quick start (Windows PowerShell):

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000/ in your browser.

## Deploy on Railway

This project is ready for Railway with:

- `Procfile` containing `web: gunicorn app:app`
- `gunicorn` added to `requirements.txt`
- Flask app binding to `0.0.0.0` and using Railway's `PORT`

### Option 1: Deploy from GitHub (recommended)

1. Push this project to a GitHub repository.
2. Go to Railway and create a new project.
3. Choose **Deploy from GitHub repo** and select your repo.
4. Railway will detect Python and install dependencies from `requirements.txt`.
5. Railway will run the web process from `Procfile`.
6. Open the generated Railway domain to access the app.

### Option 2: Deploy with Railway CLI

```powershell
npm i -g @railway/cli
railway login
railway init
railway up
```

Then run:

```powershell
railway open
```

### Notes

- You do not need to set `PORT` manually on Railway.
- If you later add secrets (API keys, DB URLs), set them in Railway Variables.
