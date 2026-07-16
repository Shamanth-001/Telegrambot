# StreamBreaker Frontend

This directory contains the static frontend files for StreamBreaker.

## Deployment on Netlify (Free & No Account Required)

1. **Configure the API URL**:
   - Open [index.html](file:///c:/telegrambot/streambreaker-frontend/index.html) and search for `API_BASE_URL` (around line 650).
   - Replace `'https://streambreaker-api.onrender.com'` with your actual Render API URL.

2. **Deploy via Netlify Drop**:
   - Go to **[Netlify Drop](https://app.netlify.com/drop)** in your web browser.
   - Drag and drop this entire `streambreaker-frontend` folder onto the page.
   - In less than 10 seconds, Netlify will generate a live URL for your app (e.g., `https://streambreaker.netlify.app`).

## Testing Locally

- Simply double-click `index.html` to open it in a web browser, or run a local static server:
  ```bash
  npx serve .
  ```
- If your backend is running locally at `http://localhost:8000`, the frontend will automatically connect to it.
