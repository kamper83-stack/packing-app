jest.mock("axios");
const axios = require("axios");
const { getForecast } = require("../services/weatherService");

const ORIGINAL_ENV = { ...process.env };
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (date) => new Date(date).toISOString().slice(0, 10);

afterEach(() => {
  axios.get.mockReset();
  process.env = { ...ORIGINAL_ENV };
});

describe("Google Weather v2 coverage policy", () => {
  beforeEach(() => {
    process.env.USE_MOCKS = "false";
    process.env.GOOGLE_WEATHER_API_KEY = "test-google-key";
    process.env.WEATHER_PROVIDER = "google";
  });

  it("uses a full-trip seasonal estimate instead of a partial live forecast for an 11-day trip", async () => {
    const start = new Date();
    const end = new Date(start.getTime() + 10 * DAY_MS);

    axios.get.mockResolvedValue({
      data: {
        forecastDays: [],
      },
    });

    const result = await getForecast("London", iso(start), iso(end), "United Kingdom");

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.isSeasonal).toBe(true);
    expect(result.isMock).toBe(false);
    expect(result.forecast).toHaveLength(11);
    expect(result.forecast.map((day) => day.date)).toEqual(
      Array.from({ length: 11 }, (_, index) => iso(new Date(start.getTime() + index * DAY_MS)))
    );
  });

  it("uses a seasonal estimate when a trip exceeds Google's ten-day coverage window", async () => {
    const start = new Date(Date.now() + 5 * DAY_MS);
    const end = new Date(start.getTime() + 5 * DAY_MS);

    axios.get.mockResolvedValue({ data: { forecastDays: [] } });

    const result = await getForecast("London", iso(start), iso(end), "United Kingdom");

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.isSeasonal).toBe(true);
    expect(result.isMock).toBe(false);
    expect(result.forecast).toHaveLength(6);
  });

  it("uses a seasonal estimate when Google returns no forecast coverage", async () => {
    const start = new Date();
    const end = new Date(start.getTime() + DAY_MS);

    axios.get.mockResolvedValue({ data: { forecastDays: [] } });

    const result = await getForecast("London", iso(start), iso(end), "United Kingdom");

    expect(result.isSeasonal).toBe(true);
    expect(result.isMock).toBe(false);
    expect(result.forecast).toHaveLength(2);
  });

  it("never falls back to legacy WeatherAPI when Google Weather is unavailable", async () => {
    delete process.env.GOOGLE_WEATHER_API_KEY;
    delete process.env.WEATHER_PROVIDER;
    process.env.WEATHER_API_KEY = "legacy-weatherapi-key";

    const start = new Date();
    axios.get.mockResolvedValue({ data: { forecast: { forecastday: [] } } });

    const result = await getForecast("London", iso(start), iso(start), "United Kingdom");

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.isMock).toBe(true);
    expect(result.forecast).toHaveLength(1);
  });
});
