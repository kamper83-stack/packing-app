# PackPlanner

PackPlanner is a full-stack travel packing assistant. Users create a trip, provide the destination, dates, airline, group size, and vacation type, and receive a weather-aware packing checklist tailored to the trip.

## Features

- JWT-based registration and login.
- Trip creation and per-user trip listing.
- Weather-aware packing inputs from WeatherAPI.com through the backend.
- Gemini-powered packing-list generation with a JSON item contract.
- Current live model: `gemini-3.5-flash-lite`.
- Offline Mock mode for development and tests when live credentials are unavailable.
- Checklist items grouped by category and bag (`Suitcase` or `Backpack`).
- Packing progress, item completion, custom items, item deletion, and trip deletion.
- Airline baggage configuration and a baggage-constraints display.
- Responsive React UI with Tailwind CSS.

> **Demo scope:** the team decision is to use a 3-day daily weather forecast for the demonstration. The service alignment is tracked in GitHub.

## Architecture

```text
packing-app/
├── backend/
│   ├── config/              # SQLite and airline baggage configuration
│   ├── middleware/          # Authentication middleware
│   ├── models/              # Sequelize models for users, trips, and items
│   ├── routes/              # Auth, trips, checklist, and item endpoints
│   ├── services/            # WeatherAPI and Gemini integrations
│   └── tests/               # Jest + Supertest backend tests
├── src/
│   ├── pages/               # Login, Signup, Dashboard, and TripView
│   ├── services/api.js      # Frontend API wrapper
│   └── App.js                # React routes
├── nginx/                   # Production reverse proxy configuration
├── Dockerfile               # Multi-stage frontend image
├── docker-compose.yml       # Development stack
├── docker-compose.prod.yml  # Production backend/frontend stack
└── .github/workflows/       # CI and deployment workflows
```

The browser talks to the PackPlanner backend. The backend owns authentication, SQLite persistence, WeatherAPI calls, Gemini calls, and Mock fallback behavior. Provider keys must remain server-side.

## Requirements

- Node.js 20+
- npm
- Docker and Docker Compose for the containerized stack
- A WeatherAPI.com key for live weather
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
WEATHER_API_KEY=replace-with-a-real-weatherapi-key
GEMINI_API_KEY=replace-with-a-real-gemini-key
USE_MOCKS=false
```

Then start the stack:

```bash
docker compose up --build
```

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

Authenticated backend routes include:

- `POST /api/auth/register` — create a user.
- `POST /api/auth/login` — issue a JWT.
- `GET /api/auth/me` — return the authenticated user.
- `GET /api/trips` — list the current user's trips.
- `POST /api/trips` — create a trip and generate its checklist.
- `GET /api/trips/:id` — return one trip with packing items.
- `DELETE /api/trips/:id` — delete a trip.
- `POST /api/trips/:id/custom-item` — add a custom checklist item.
- `PUT /api/trips/item/:itemId` — update packing state or item details.
- `DELETE /api/trips/item/:itemId` — delete an item.

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

The production Compose file binds the frontend and backend to loopback ports for the reverse-proxy layer:

- Frontend: `127.0.0.1:3025`
- Backend: `127.0.0.1:3026`

The deployment workflow is defined in `.github/workflows/deploy.yml`. Production deployments should use the production Compose file and preserve the SQLite volume.
