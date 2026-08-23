const axios = require("axios");

// Values that look like a key but aren't one. The docker-compose / .env.example
// default is a placeholder, so it must behave like "no key" — otherwise we call
// WeatherAPI with a bad key, get a 401, and silently fall back to mock, which
// looks exactly like a real key that "doesn't work".
const PLACEHOLDER_KEYS = new Set(["your_weather_api_key_here"]);

// WeatherAPI's Free plan (and this project's demo policy) only serves up to a
// 3-day forecast, so never request more — otherwise the live call fails and we
// silently present mock data as if it were real.
const MAX_FORECAST_DAYS = 3;

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

async function getForecast(destination, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const days = Math.min(Math.max(diffDays, 1), MAX_FORECAST_DAYS);

  const useMocks = process.env.USE_MOCKS === "true" || !hasRealWeatherKey();

  if (useMocks) {
    console.log(`[WEATHER SERVICE] Using mock weather for ${destination}`);
    // Mock weather payload
    return {
      forecast: Array.from({ length: days }).map((_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return {
          date: date.toISOString().split("T")[0],
          tempC: 22 + Math.floor(Math.random() * 6) - 3, // Random temp between 19 and 25
          condition: index % 3 === 0 ? "Sunny" : index % 3 === 1 ? "Partly Cloudy" : "Rainy",
        };
      }),
      isMock: true,
    };
  }

  try {
    const apiKey = weatherApiKey();
    console.log(`[WEATHER SERVICE] Fetching live forecast for ${destination} (${days} days)`);
    const response = await axios.get(`https://api.weatherapi.com/v1/forecast.json`, {
      params: {
        key: apiKey,
        q: destination,
        days: days,
      },
    });

    const forecastDays = response.data.forecast.forecastday;
    return {
      forecast: forecastDays.map((day) => ({
        date: day.date,
        tempC: day.day.avgtemp_c,
        condition: day.day.condition.text,
      })),
      isMock: false,
    };
  } catch (error) {
    // Make a misconfigured/failing live call loud instead of silently mocking,
    // so a bad key or network issue is obvious during API testing.
    console.warn(
      `[WEATHER SERVICE] Live WeatherAPI call failed (${error.response?.status || error.message}); ` +
        "falling back to mock data. Check WEATHER_API_KEY and network."
    );
    return {
      forecast: Array.from({ length: days }).map((_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return {
          date: date.toISOString().split("T")[0],
          tempC: 20,
          condition: "Mild",
        };
      }),
      isMock: true,
      error: error.message,
    };
  }
}

module.exports = { getForecast };
