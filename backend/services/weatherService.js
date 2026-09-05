const axios = require("axios");

// Values that look like a key but aren't one. The docker-compose / .env.example
// default is a placeholder, so it must behave like "no key" — otherwise we call
// WeatherAPI with a bad key, get a 401, and silently fall back to mock, which
// looks exactly like a real key that "doesn't work".
const PLACEHOLDER_KEYS = new Set(["your_weather_api_key_here"]);

// WeatherAPI's /forecast.json horizon is up to 14 days. Trips scheduled beyond
// this window can't get a daily forecast and are handled by seasonal climate
// estimation (Issue #65). Within the window we align the returned days to the
// actual trip dates instead of "today" (Issue #63).
const LIVE_FORECAST_MAX_DAYS = 14;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// The configured WeatherAPI key, normalized (trimmed) so a padded value in the
// environment is validated and sent consistently.
function weatherApiKey() {
  return (process.env.WEATHER_API_KEY || "").trim();
}

// True only when a usable WeatherAPI key is configured.
function hasRealWeatherKey() {
  const key = weatherApiKey();
  return key.length > 0 && !PLACEHOLDER_KEYS.has(key);
}

// YYYY-MM-DD for a date, matching the format WeatherAPI uses for forecastday.
function isoDate(value) {
  return new Date(value).toISOString().split("T")[0];
}

// Whole calendar days from `from` to `to`, comparing date-only (time-of-day is
// ignored) so an afternoon "now" and a midnight startDate don't skew the count.
function dayOffset(from, to) {
  const a = new Date(isoDate(from));
  const b = new Date(isoDate(to));
  return Math.round((b - a) / MS_PER_DAY);
}

// One synthetic forecast entry per trip day, always dated from the trip start
// (never from "today"), so the offline/fallback path still shows trip dates.
function mockForecast(start, tripDays, { mild = false } = {}) {
  return Array.from({ length: tripDays }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: isoDate(date),
      tempC: mild ? 20 : 22 + Math.floor(Math.random() * 6) - 3, // 19..24
      condition: mild
        ? "Mild"
        : index % 3 === 0
        ? "Sunny"
        : index % 3 === 1
        ? "Partly Cloudy"
        : "Rainy",
    };
  });
}

async function getForecast(destination, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Inclusive trip length, capped at the live-forecast horizon.
  const tripDays = Math.min(
    Math.max(dayOffset(start, end) + 1, 1),
    LIVE_FORECAST_MAX_DAYS
  );

  const useMocks = process.env.USE_MOCKS === "true" || !hasRealWeatherKey();

  if (useMocks) {
    console.log(`[WEATHER SERVICE] Using mock weather for ${destination}`);
    return { forecast: mockForecast(start, tripDays), isMock: true };
  }

  // WeatherAPI numbers forecast days from *today*, not from an arbitrary start
  // date, so to reach a future trip we request enough days to span from today
  // through the trip's end, then keep only the days inside the trip window
  // (Issue #63). A past or same-day start clamps the offset to 0.
  const offset = Math.max(0, dayOffset(new Date(), start));
  const days = Math.min(offset + tripDays, LIVE_FORECAST_MAX_DAYS);

  const tripStartIso = isoDate(start);
  const tripEndIso = isoDate(end);

  try {
    const apiKey = weatherApiKey();
    console.log(
      `[WEATHER SERVICE] Fetching live forecast for ${destination} ` +
        `(${days} days, trip ${tripStartIso}..${tripEndIso})`
    );
    const response = await axios.get(`https://api.weatherapi.com/v1/forecast.json`, {
      params: {
        key: apiKey,
        q: destination,
        days: days,
      },
    });

    const forecastDays = response.data?.forecast?.forecastday || [];
    // Align to the trip: drop the leading "today..startDate-1" days WeatherAPI
    // returns so the displayed dates are the scheduled trip's, not today's.
    const aligned = forecastDays
      .filter((day) => day.date >= tripStartIso && day.date <= tripEndIso)
      .map((day) => ({
        date: day.date,
        tempC: day.day.avgtemp_c,
        condition: day.day.condition.text,
      }));

    if (aligned.length > 0) {
      return { forecast: aligned, isMock: false };
    }

    // The provider answered, but nothing covered the trip window — e.g. a
    // free-plan key that only serves the next few days for a trip a week out.
    // Show a trip-dated mock rather than a misleading "today" forecast.
    console.warn(
      `[WEATHER SERVICE] Live forecast did not cover trip window ` +
        `${tripStartIso}..${tripEndIso}; using trip-dated mock.`
    );
    return { forecast: mockForecast(start, tripDays, { mild: true }), isMock: true };
  } catch (error) {
    // Make a misconfigured/failing live call loud instead of silently mocking,
    // so a bad key or network issue is obvious during API testing.
    console.warn(
      `[WEATHER SERVICE] Live WeatherAPI call failed (${error.response?.status || error.message}); ` +
        "falling back to mock data. Check WEATHER_API_KEY and network."
    );
    return {
      forecast: mockForecast(start, tripDays, { mild: true }),
      isMock: true,
      error: error.message,
    };
  }
}

module.exports = { getForecast, LIVE_FORECAST_MAX_DAYS };
