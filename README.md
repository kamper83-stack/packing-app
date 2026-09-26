# PackPlanner

PackPlanner is a full-stack travel packing assistant. Users create a trip, provide the destination, dates, group size and vacation type, and receive a weather-aware packing checklist tailored to the trip. Airline is no longer a user-chosen field — the client always sends a fixed default (`EL AL`, `src/utils/luggage.js`) so the backend's baggage-allowance calculation stays constant.

## Features

- JWT-based registration and login.
- Trip creation and per-user trip listing.
- Weather-aware packing inputs from Google Weather API through the backend.
- Gemini-powered packing-list generation with a JSON item contract.
- Current live model: `gemini-3.5-flash` (configurable via `GEMINI_MODEL`).
- Offline Mock mode for development and tests when live credentials are unavailable.
- Checklist items grouped by category and bag (`Suitcase` or `Backpack`).
- Packing progress, item completion, custom items, item deletion, and trip deletion.
- Airline baggage configuration and a baggage-constraints display.
- Responsive React UI with Tailwind CSS.

> **Weather forecast scope:** Google Weather provides a current-day-inclusive window of up to 10 daily forecasts. A trip that starts inside that window but runs past it is split at the boundary: the leading days get a real Google forecast and the trailing days get a seasonal estimate (`weatherSource: "mixed"`, each forecast day tagged with its own `provider`). A trip that starts entirely outside the window uses a full seasonal estimate. A mock fallback is never presented as live data.

## Architecture

```text
packing-app/
├── backend/
│   ├── config/              # SQLite, airline baggage, and destination coordinates
│   ├── middleware/          # Authentication middleware
│   ├── models/              # Sequelize models for users, trips, and items
│   ├── routes/              # Auth, trips, checklist, and item endpoints
│   ├── services/            # Google Weather, seasonal climate, and Gemini integrations
│   └── tests/               # Jest + Supertest backend tests
├── src/
│   ├── pages/               # Login, Signup, Dashboard, and TripView
│   ├── services/api.js      # Frontend API wrapper
│   └── App.js                # React routes
├── nginx/                   # Production reverse proxy configuration
├── Dockerfile               # Multi-stage frontend image
├── docker-compose.yml       # Local and workflow-driven VPS stack
└── .github/workflows/       # CI and deployment workflows
```

The browser talks to the PackPlanner backend. The backend owns authentication, SQLite persistence, Google Weather API calls, seasonal fallback, Gemini calls, and Mock fallback behavior. Provider keys must remain server-side.

## Requirements

- Node.js 20+
- npm
- Docker and Docker Compose for the containerized stack
- A Google Weather API key for live weather
- A Gemini API key and available model quota for live packing-list generation

## Local development

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

The backend listens on `http://localhost:5001` by default. Set `USE_MOCKS=true` for fully offline weather and Gemini development, or provide real keys and set `USE_MOCKS=false`.

> **Google Weather:** set `GOOGLE_WEATHER_API_KEY`. Google Weather returns up to 10 daily forecasts including today; a trip that only partially overlaps that window gets a mixed forecast (live for the covered days, seasonal for the rest), and a trip entirely outside the window uses a full seasonal estimate. The backend uses a checked-in coordinate catalog, so no geocoding request is made at runtime.
>
> The Google Maps Geocoding API can resolve city names to coordinates, but it requires billing for this project; the coordinate catalog was generated offline and is validated by tests.

> Live weather failures do **not** block trip creation. The trip is saved with a
> mock forecast, `weatherSource: "mock"`, `weatherProvider: "mock"`, and a
> safe `weatherError` code. Trips entirely beyond Google's live window are saved as
> `weatherSource: "seasonal"`. Trips that only partially overlap the window are
> saved as `weatherSource: "mixed"` / `weatherProvider: "mixed"`, with each day in
> `weatherData` tagged `provider: "google"` or `provider: "seasonal"`. Legacy trips
> without these fields remain readable.
>
> Similarly, live Gemini AI generation failures save the trip with fallback items,
> `aiSource: "mock"`, and `aiError` describing the failure. Live successes record
> `aiSource: "live"`. Legacy trips remain readable (`aiSource` / `aiError` are null).

After installing dependencies, you can confirm a real key works. The command uses `London` from the checked-in coordinate catalog and a current date; it exits non-zero unless the Google provider returns live data (`isMock: false`):

```bash
cd backend
node -e "require('dotenv').config(); const today = new Date().toISOString().slice(0,10); require('./services/weatherService').getForecast('London', today, today, 'United Kingdom').then(r => { console.log('isMock:', r.isMock, r.error || ''); if (r.isMock) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });"
```

### Frontend

In a second terminal from the repository root:

```bash
npm install
npm start
```

The frontend uses `REACT_APP_API_URL` when set; otherwise it defaults to `http://localhost:5001/api`.

### Docker Compose

Docker Compose reads environment interpolation from the project-root `.env`. For a live containerized run, create that file with the required values:

```env
JWT_SECRET=replace-with-a-long-random-secret
GOOGLE_WEATHER_API_KEY=replace-with-a-google-weather-key
GEMINI_API_KEY=replace-with-a-real-gemini-key
USE_MOCKS=false
```

Then start the stack:

```bash
docker compose up --build
```

Open `http://localhost` when the containers are ready.

Do not commit `.env` or provider keys.

## Quality commands

### Backend

```bash
cd backend
npm test
```

### Frontend

```bash
npm test -- --watchAll=false
npm run build
```

The backend test suite runs offline by mocking external providers. Live provider smoke tests should be run separately and must never print credentials.

## API overview

Backend routes include; authentication is required where noted:

- `POST /api/auth/register` — public user registration.
- `POST /api/auth/login` — public login and JWT issuance.
- `GET /api/auth/me` — authenticated user profile.
- `GET /api/trips` — authenticated user's trips.
- `POST /api/trips` — authenticated trip creation and checklist generation.
- `GET /api/trips/:id` — authenticated trip details with packing items.
- `DELETE /api/trips/:id` — authenticated trip deletion.
- `POST /api/trips/:id/custom-item` — authenticated custom checklist item.
- `PUT /api/trips/item/:itemId` — authenticated packing-item update.
- `DELETE /api/trips/item/:itemId` — authenticated item deletion.

The packing-item response contract is:

```json
{
  "name": "Rain Jacket",
  "category": "Clothing",
  "quantity": 1,
  "targetBag": "Suitcase"
}
```

## Environment variables

The backend reads:

- `PORT` — server port, default `5001`.
- `JWT_SECRET` — JWT signing secret.
- `GOOGLE_WEATHER_API_KEY` — Google Weather API key for live forecasts.
- `GEMINI_API_KEY` — Gemini API key.
- `USE_MOCKS` — set to `true` for deterministic offline provider paths.

Keep secrets in local/VPS environment files. The application backend calls external providers; the browser never receives these keys.

## Deployment

The repository contains one Compose file: `docker-compose.yml`. It is used for
local runs and for production deployments on the VPS:

- Frontend: `127.0.0.1:3025:80` (host nginx terminates TLS and proxies to it)
- Backend: `127.0.0.1:3026:5001`
- SQLite: named `sqlite-data` volume

Production deployment is **manual, not automatic**. The former GitHub Actions
CD workflow (SSH into the VPS after a push to `main`, `git pull`, rewrite the
deploy environment) is disabled — see `.github/workflows/deploy.yml`, which now
refuses to run. Deployments follow the SHA-pinned manual procedure in
`AGENTS.md` ("Manual production deploy — controlled procedure"): a current
independent `expert` APPROVE naming the exact full SHA, a fresh database
backup, a clean detached build worktree, and post-deploy smoke checks.
Any host-level reverse proxy, firewall, or additional port mapping on the VPS
is operational state outside this repository and must be documented only after
checking the live VPS.
