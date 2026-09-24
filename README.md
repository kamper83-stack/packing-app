# PackPlanner

PackPlanner is a full-stack travel packing assistant. Users create a trip, provide the destination, dates, group size and vacation type, and receive a weather-aware packing checklist tailored to the trip. Airline is no longer a user-chosen field — the client always sends a fixed default (`EL AL`, `src/utils/luggage.js`) so the backend's baggage-allowance calculation stays constant.

## Features

- JWT-based registration and login.
- Trip creation and per-user trip listing.
- Weather-aware packing inputs from Google Weather API through the backend, with legacy WeatherAPI compatibility.
- Gemini-powered packing-list generation with a JSON item contract.
- Current live model: `gemini-3.5-flash` (configurable via `GEMINI_MODEL`).
- Offline Mock mode for development and tests when live credentials are unavailable.
- Checklist items grouped by category and bag (`Suitcase` or `Backpack`).
- Packing progress, item completion, custom items, item deletion, and trip deletion.
- Airline baggage configuration and a baggage-constraints display.
- Responsive React UI with Tailwind CSS.

> **Weather forecast scope:** Google Weather provides a current-day-inclusive window of up to 10 daily forecasts. The backend requests at most 10 days, uses a seasonal estimate for trips starting outside that window, and never presents a mock fallback as live data.

## Architecture

```text
packing-app/
├── backend/
│   ├── config/              # SQLite, airline baggage, and destination coordinates
│   ├── middleware/          # Authentication middleware
│   ├── models/              # Sequelize models for users, trips, and items
│   ├── routes/              # Auth, trips, checklist, and item endpoints
│   ├── services/            # Google Weather, legacy WeatherAPI, and Gemini integrations
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

The browser talks to the PackPlanner backend. The backend owns authentication, SQLite persistence, Google Weather API calls, legacy WeatherAPI compatibility, Gemini calls, and Mock fallback behavior. Provider keys must remain server-side.

## Requirements

- Node.js 20+
- npm
- Docker and Docker Compose for the containerized stack
- A Google Weather API key for live weather
- A WeatherAPI.com key only if the legacy provider is needed
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

> **Google Weather:** set `GOOGLE_WEATHER_API_KEY` and `WEATHER_PROVIDER=google`. Google Weather returns up to 10 daily forecast days and the backend uses a checked-in coordinate catalog, so no geocoding request is made at runtime.
>
> The Google Maps Geocoding API can resolve city names to coordinates, but it requires billing for this project; the coordinate catalog was generated offline and is validated by tests.
>
> The legacy `WEATHER_API_KEY` remains supported for compatibility when `WEATHER_PROVIDER=weatherapi`.

> Live weather failures do **not** block trip creation. The trip is saved with a
> mock forecast, `weatherSource: "mock"`, and `weatherError` describing the
> failure so the UI can show fallback state. Legacy trips without these fields
> remain readable (`weatherSource` / `weatherError` are null).
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
WEATHER_PROVIDER=google
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
- `WEATHER_API_KEY` — WeatherAPI.com key.
- `GEMINI_API_KEY` — Gemini API key.
- `USE_MOCKS` — set to `true` for deterministic offline provider paths.

Keep secrets in local/VPS environment files. The application backend calls external providers; the browser never receives these keys.

## Deployment

The repository contains one Compose file: `docker-compose.yml`. It is used for
local runs and by `.github/workflows/deploy.yml` for the VPS deployment:

- Frontend: `80:80`
- Backend: `5001:5001`
- SQLite: named `sqlite-data` volume

The workflow connects to the VPS over SSH after a push to `main`, pulls the
repository, writes the deployment environment, and runs the same Compose stack.
Any host-level reverse proxy, firewall, or additional port mapping on the VPS
is operational state outside this repository and must be documented only after
checking the live VPS.
