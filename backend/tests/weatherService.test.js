// Unit tests for the v2 weather facade. Google Weather request/response mapping
// is covered separately by googleWeatherService.test.js; these tests protect
// provider policy and fallback selection without making network calls.
jest.mock("axios");
const axios = require("axios");
const { getForecast, LIVE_FORECAST_MAX_DAYS } = require("../services/weatherService");

const ORIGINAL_ENV = { ...process.env };
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (date) => new Date(date).toISOString().slice(0, 10);

function googleForecastDay(date, condition = "Sunny") {
  return {
    displayDate: {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    },
    daytimeForecast: { weatherCondition: { description: { text: condition } } },
    minTemperature: { degrees: 18 },
    maxTemperature: { degrees: 26 },
  };
}

afterEach(() => {
  axios.get.mockReset();
  process.env = { ...ORIGINAL_ENV };
});

describe("weatherService.getForecast", () => {
  beforeEach(() => {
    process.env.USE_MOCKS = "false";
    process.env.GOOGLE_WEATHER_API_KEY = "test-google-key";
  });

  it("returns a Google live forecast for a fully covered trip", async () => {
    const start = new Date();
    const end = new Date(start.getTime() + DAY_MS);
    axios.get.mockResolvedValue({
      data: { forecastDays: [googleForecastDay(start), googleForecastDay(end, "Light rain")] },
    });

    const result = await getForecast("London", iso(start), iso(end));

    expect(axios.get.mock.calls[0][0]).toBe("https://weather.googleapis.com/v1/forecast/days:lookup");
    expect(result).toEqual({
      forecast: [
        { date: iso(start), tempC: 22, condition: "Sunny" },
        { date: iso(end), tempC: 22, condition: "Light rain" },
      ],
      isMock: false,
    });
  });

  it("returns mock data without a network call when mock mode is enabled", async () => {
    process.env.USE_MOCKS = "true";
    const today = new Date();

    const result = await getForecast("London", iso(today), iso(today));

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.isMock).toBe(true);
    expect(result.errorCode).toBe("mock_mode");
    expect(result.forecast).toHaveLength(1);
  });

  it("returns mock data without a network call when no Google key is configured", async () => {
    delete process.env.GOOGLE_WEATHER_API_KEY;
    const today = new Date();

    const result = await getForecast("London", iso(today), iso(today));

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.isMock).toBe(true);
    expect(result.errorCode).toBe("google_key_missing");
  });

  it("returns a seasonal estimate when the trip begins outside Google's horizon", async () => {
    const start = new Date(Date.now() + LIVE_FORECAST_MAX_DAYS * DAY_MS);
    const end = new Date(start.getTime() + DAY_MS);

    const result = await getForecast("London", iso(start), iso(end));

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.isSeasonal).toBe(true);
    expect(result.isMock).toBe(false);
  });

  it("returns a mock result with a safe error code when Google request fails", async () => {
    const today = new Date();
    axios.get.mockRejectedValue(new Error("timeout"));

    const result = await getForecast("London", iso(today), iso(today));

    expect(result.isMock).toBe(true);
    expect(result.errorCode).toBe("google_request_failed");
    expect(result.error).toBe("timeout");
  });
});
