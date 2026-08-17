# OpenLiveLink

A premium, custom-built React dashboard and automated extraction pipeline for visualizing JCB LiveLink telematics data.

## Features

- ??? **Automated Extraction:** A Node.js script safely interfaces with JCB's internal APIs (bypassing AES encryption) to automatically extract machine telemetry data.
- ?? **GitHub Actions:** Fully automated cloud workflow runs every 6 hours to keep the database constantly updated.
- ??? **Supabase Backend:** Uses PostgreSQL to safely store, organize, and deduplicate thousands of GPS tracking logs.
- ??? **Interactive Google Maps:** A gorgeous, responsive React dashboard powered by Leaflet and native Google Maps tiles.
- ?? **Mobile Responsive:** The dashboard layout automatically optimizes for both desktop monitors and small mobile screens.

## Getting Started

### 1. Environment Setup
Rename `.env.example` to `.env` and fill in your credentials:

```ini
VITE_SUPABASE_URL="your-supabase-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
JCB_TOKEN_ID="your-jcb-session-token"
JCB_SERIAL_NUMBER="your-machine-serial"
JCB_TENANCY_ID="your-tenancy-id"
```

> ?? **IMPORTANT:** Never commit your `.env` file to version control.

### 2. Run Locally
Install the dependencies and start the Vite development server:
```bash
npm install
npm run dev
```
Navigate to `http://localhost:5173` to view the dashboard.

### 3. Backfill Historical Data
To pull historical data into your database (instead of just today's data), run the extraction script manually and specify the number of days you want to fetch:
```bash
node scripts/extract.js 30
```
*(The above command will fetch the last 30 days of telemetry data and save it to your Supabase database).*

## Cloud Automation

The included GitHub Action (`.github/workflows/extract.yml`) automatically runs the `extract.js` script every 6 hours to grab the latest data for the current day. 

If your session token (`JCB_TOKEN_ID`) expires, the workflow is configured to automatically open a GitHub Issue, triggering an email and push notification to alert you.
