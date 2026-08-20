# PackPlanner - AI-Powered Suitcase Packing Assistant

Welcome to **PackPlanner**, a collaborative graduation software project built by **Eran** (`kamper83-stack`) and **Shiri** (`shirikyky`). 

PackPlanner is a full-stack web application designed to eliminate packing stress. By analyzing a trip's destination, dates, airline baggage allowance, travel group size, and vacation type, PackPlanner uses **Gemini AI** and **WeatherAPI.com** to automatically generate a tailored, categorized checklist of items.

---

## 🌟 Key Features

* **User Authentication**: Secure user registration and login using JWT.
* **Smart Packing Calculator**: Dynamically generates packing checklists based on real-time weather forecasts and travel conditions.
* **Airline Baggage Warning**: Automated validation of checklist size/weight against baggage limits of major airlines (EL AL, Ryanair, EasyJet, Wizz Air, Delta, United).
* **Responsive Checklist**: Checklist grouped by item category and target bag type (Suitcase vs. Backpack) with real-time progress bars.
* **Offline Mock Mode**: Support for decoupled development using mock services when API keys are absent.

---

## 🛠️ Technology Stack

* **Frontend**: React, React Router, Tailwind CSS v3, Lucide Icons.
* **Backend**: Node.js, Express.js.
* **Database**: SQLite (local database file), Sequelize ORM.
* **Orchestration & Containerization**: Docker, Docker Compose, Nginx (Frontend server & API Reverse Proxy).
* **CI/CD**: GitHub Actions pipelines.
* **Deployment & Network**: Private VPS running Docker Compose, connected via Tailscale VPN and SSH.
* **APIs**: Google Gemini Pro (AI Packing List) & WeatherAPI.com (Forecasts).

---

## 📁 Repository Directory Structure

```text
packing_app/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # PR Verification pipeline
│       └── deploy.yml             # CD deployment pipeline via SSH & Tailscale
├── backend/
│   ├── config/
│   │   ├── database.js            # Sequelize SQLite config
│   │   └── airlines.json          # Predefined baggage rules
│   ├── models/
│   │   ├── index.js               # Model loader
│   │   ├── User.js                # User DB schema
│   │   ├── Trip.js                # Trip details DB schema
│   │   └── PackingItem.js         # Checklist items DB schema
│   ├── routes/
│   │   ├── auth.js                # Register / Login controllers
│   │   └── trips.js               # Trips CRUD & checklist controllers
│   ├── services/
│   │   ├── weatherService.js      # Weather forecast client (or mock)
│   │   └── geminiService.js       # Gemini API client (or mock)
│   ├── .env.example               # Backend config template
│   ├── Dockerfile                 # Backend Docker configuration
│   └── server.js                  # Entry server file
├── nginx/
│   └── default.conf               # Nginx reverse proxy configuration
├── src/
│   ├── components/                # Shared layout & UI components
│   ├── pages/                     # Full-page screens (Login, Signup, Dashboard, TripView)
│   ├── services/
│   │   └── api.js                 # Frontend API HTTP requests wrapper
│   ├── App.js                     # React router & App component
│   ├── index.css                  # CSS file with Tailwind directives
│   └── index.js                   # React app entry point
├── Dockerfile                     # Frontend Docker configuration
├── docker-compose.yml             # Orchestration configuration
├── tailwind.config.js             # Tailwind CSS settings
└── README.md                      # Project manual
```

---

## 🚀 Getting Started

### Prerequisites
* [Docker](https://www.docker.com/products/docker-desktop/) and Docker Compose installed.
* Or Node.js (v20+) installed for local non-containerized running.

### Option A: Running with Docker Compose (Recommended)
This runs the entire frontend, backend, Nginx proxy, and database locally:
1. Clone this repository:
   ```bash
   git clone https://github.com/kamper83-stack/packing-app.git
   cd packing-app
   ```
2. Set up backend environment variables in `backend/.env`:
   ```bash
   cp backend/.env.example backend/.env
   ```
   For **live** weather forecasts, edit `backend/.env` and set a real
   `WEATHER_API_KEY` (free key at https://www.weatherapi.com/) with
   `USE_MOCKS=false`. Leaving the placeholder key runs the app in mock mode.
   Never commit `backend/.env` — it is git-ignored on purpose.
3. Run the application:
   ```bash
   docker compose up --build
   ```
4. Open your browser and navigate to `http://localhost`.

### Option B: Running Locally (Manual Development Mode)
1. **Start the Backend**:
   ```bash
   cd backend
   cp .env.example .env
   # For live forecasts, set a real WEATHER_API_KEY in .env and keep USE_MOCKS=false.
   # Quick check that a real key works (prints `isMock: false` on success):
   #   node -e "require('dotenv').config(); require('./services/weatherService').getForecast('Tel Aviv','2026-08-21','2026-08-24').then(r=>console.log('isMock:',r.isMock, r.error||''))"
   npm install
   npm run dev
   ```
   The backend server runs on `http://localhost:5001`.
2. **Start the Frontend**:
   ```bash
   # In the root packing_app/ directory
   npm install
   npm start
   ```
   The frontend development server runs on `http://localhost:3000`.

---

## 🔌 Offline / Mock Mode for Decoupled Development
To support rapid independent progress between Frontend and Backend, the backend features a **Mock Toggle**. 
If you do not have active API keys, or if `USE_MOCKS=true` is set in your `backend/.env` file:
* The weather service generates random daily forecasts for the destination.
* The Gemini service generates structured, categorized item lists based on travel duration and vacation type.

> **Note:** The placeholder `WEATHER_API_KEY=your_weather_api_key_here` shipped in
> `.env.example` counts as "no real key" — the backend detects it and stays in
> mock mode instead of calling WeatherAPI with an invalid key. Set a real key to
> get live forecasts.

---

## 👥 GitHub Issues & Division of Labor

The project tasks are split vertically to give both developers full-stack experience:

### Eran's Focus (`kamper83-stack`)
* **Issue #2**: Backend skeleton, Sequelize, Express, and database config.
* **Issue #4**: Backend User Auth (JWT, hashing, registration, and login routes).
* **Issue #5**: Frontend Auth Screens (Login, Signup page, JWT storage, protected routes).
* **Issue #11**: CI Actions Pipeline setup.
* **Issue #12**: Dockerfiles & docker-compose configurations.
* **Issue #13**: CD Actions Deployment setup.

### Shiri's Focus (`shirikyky`)
* **Issue #3**: Tailwind CSS v3 integration and base theme settings on React.
* **Issue #6**: Backend Trip & Packing Item models, CRUD routes.
* **Issue #7**: Weather service integration and weather mocking logic.
* **Issue #8**: Gemini AI packing service and packing mock generator.
* **Issue #9**: Frontend Trip Dashboard screen & new trip planning form.
* **Issue #10**: Frontend Trip Packing Checklist page (categories, bag indicators, progress bars).

---

## 🔀 Branching & PR Guidelines

To protect the main branch and ensure mutual code review:
1. **No direct pushes to `main`**: All changes must go through Pull Requests.
2. **Feature branch naming**: Use the syntax `feature/issue-<num>-<description>` (e.g. `feature/issue-4-auth`).
3. **PR Approvals**: Any PR opened by Eran requires Shiri's approval, and vice-versa, before merging is allowed.

---

## 🏗️ CI/CD Deployment to VPS

### CI Pipeline
Triggers on any PR opened to `main`. It validates:
* Frontend and backend package compile/build successfully.
* Code passes dependency caching.
* Docker images build successfully.

### CD Pipeline & VPS setup
On push/merge to `main`, the CD pipeline:
1. Connects to your private Tailscale network (if credentials configured).
2. SSHes into your VPS host using port `22`.
3. Runs `git pull origin main`, `docker compose down`, and `docker compose up --build -d` to restart the app stack.

#### Required Repository Secrets:
Go to `Settings -> Secrets and variables -> Actions` and add:
* `VPS_SSH_HOST`: Tailscale IP of your VPS.
* `VPS_SSH_USERNAME`: Your SSH username (e.g. `root` or `ubuntu`).
* `VPS_SSH_KEY`: Private SSH Key.
* `JWT_SECRET`: A strong, random secret used to sign JWTs in production. The CD pipeline **refuses to deploy** if this is missing or still the dev placeholder.
* `TS_OAUTH_CLIENT_ID` & `TS_OAUTH_SECRET`: Tailscale Auth credentials (if using Tailscale action).
