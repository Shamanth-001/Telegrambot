# StreamBreaker Backend (API + Telegram Bot)

This directory contains the Python backend for StreamBreaker. It runs a FastAPI server and a Telegram bot simultaneously.

## Deployment on Render (Free Tier)

1. **Create a GitHub Repository**:
   - Push this entire folder (`streambreaker-backend`) to a new repository on GitHub.
   
2. **Deploy to Render**:
   - Log in to **[Render](https://render.com/)** using your GitHub account.
   - Click **New +** and select **Web Service**.
   - Select your newly created `streambreaker-backend` repository.

3. **Configure the Web Service**:
   - **Name**: `streambreaker-api` (or any name you prefer)
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python start.py`
   - **Instance Type**: `Free`

4. **Add Environment Variables**:
   Under the **Environment** tab, click **Add Environment Variable** and add the keys from your `.env` file:
   - `TMDB_API_KEY`: Your TMDB API key
   - `GEMINI_API_KEY`: Your Gemini API key
   - `BOT1_TOKEN`: Your Telegram Bot token
   - `ADMIN_USER_ID`: Your Telegram User ID
   - `CHANNEL_ID`: Your Telegram Channel ID
   - `SYNC_SECRET`: Your sync secret key
   - `SITE_URL`: The URL of your frontend (e.g. `https://streambreaker.netlify.app` - you can update this after deploying to Netlify)

5. **Deploy**:
   - Click **Deploy Web Service**.
   - Render will build and start your application. It will provide a URL like `https://streambreaker-api.onrender.com`.

## Running Locally

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the application:
   ```bash
   python start.py
   ```
