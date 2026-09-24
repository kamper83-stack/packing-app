const axios = require("axios");
const coordinates = require("../config/destinationCoordinates.json").destinations;

const PLACEHOLDER_KEYS = new Set(["your_google_weather_api_key_here"]);
const GOOGLE_FORECAST_MAX_DAYS = 10;
const GOOGLE_REQUEST_TIMEOUT_MS = 8000;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function googleWeatherApiKey() {
  return (process.env.GOOGLE_WEATHER_API_KEY || "").trim();
}

function hasRealGoogleWeatherKey() {
  const key = googleWeatherApiKey();
  return key.length > 0 && !PLACEHOLDER_KEYS.has(key);
}

function isoDate(value) {
  return new Date(value).toISOString().split("T")[0];
}

function dayOffset(from, to) {
  const a = new Date(isoDate(from));
  const b = new Date(isoDate(to));
  return Math.round((b - a) / MS_PER_DAY);
}

// Google's ten-day response window includes the current day. A trip that
// starts ten or more days from now needs the seasonal fallback rather than a
// flat mock forecast that can never be backed by the provider response.
function isBeyondGoogleForecastHorizon(startDate, now = new Date()) {
  return dayOffset(now, startDate) >= GOOGLE_FORECAST_MAX_DAYS;
}

function tripDates(startDate, endDate) {
  const start = new Date(startDate);
  const tripDays = Math.min(Math.max(dayOffset(start, endDate) + 1, 1), GOOGLE_FORECAST_MAX_DAYS);
  return { start, tripDays, startIso: isoDate(start), endIso: isoDate(endDate) };
}

function mockForecast(start, tripDays) {
  return Array.from({ length: tripDays }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date: isoDate(date), tempC: 20, condition: "Mild" };
  });
}

function displayDateToIso(displayDate) {
  if (!displayDate || !displayDate.year || !displayDate.month || !displayDate.day) return null;
  return [displayDate.year, displayDate.month, displayDate.day]
    .map((part, index) => (index === 0 ? String(part).padStart(4, "0") : String(part).padStart(2, "0")))
    .join("-");
}

function mapForecastDay(day) {
  const date = displayDateToIso(day.displayDate);
  const minimum = Number(day.minTemperature?.degrees);
  const maximum = Number(day.maxTemperature?.degrees);
  const tempC = Number.isFinite(minimum) && Number.isFinite(maximum)
    ? Number(((minimum + maximum) / 2).toFixed(1))
    : Number.isFinite(maximum)
    ? maximum
    : minimum;

  return {
    date,
    tempC,
    condition:
      day.daytimeForecast?.weatherCondition?.description?.text ||
      day.nighttimeForecast?.weatherCondition?.description?.text ||
      "Unknown",
  };
}

async function getForecast(destination, startDate, endDate) {
  const { start, tripDays, startIso, endIso } = tripDates(startDate, endDate);
  const useMocks = process.env.USE_MOCKS === "true" || !hasRealGoogleWeatherKey();
  const location = coordinates[destination];

  if (useMocks || !location) {
    return { forecast: mockForecast(start, tripDays), isMock: true };
  }

  const offset = Math.max(0, dayOffset(new Date(), start));
  const days = Math.min(offset + tripDays, GOOGLE_FORECAST_MAX_DAYS);

  try {
    const response = await axios.get("https://weather.googleapis.com/v1/forecast/days:lookup", {
      params: {
        key: googleWeatherApiKey(),
        "location.latitude": location.latitude,
        "location.longitude": location.longitude,
        days,
        pageSize: days,
        unitsSystem: "METRIC",
      },
      timeout: GOOGLE_REQUEST_TIMEOUT_MS,
    });

    const aligned = (response.data?.forecastDays || [])
      .map(mapForecastDay)
      .filter((day) => day.date && day.date >= startIso && day.date <= endIso)
      .slice(0, tripDays);

    if (aligned.length > 0) return { forecast: aligned, isMock: false };
    return { forecast: mockForecast(start, tripDays), isMock: true };
  } catch (error) {
    return {
      forecast: mockForecast(start, tripDays),
      isMock: true,
      error: error.message,
    };
  }
}

module.exports = {
  getForecast,
  GOOGLE_FORECAST_MAX_DAYS,
  GOOGLE_REQUEST_TIMEOUT_MS,
  displayDateToIso,
  isBeyondGoogleForecastHorizon,
};
