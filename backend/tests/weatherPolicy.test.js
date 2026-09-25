jest.mock("axios");
const axios = require("axios");
const { getForecast } = require("../services/weatherService");

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

describe("Google Weather v2 coverage policy", () => {
  beforeEach(() => {
    process.env.USE_MOCKS = "false";
    process.env.GOOGLE_WEATHER_API_KEY = "test-google-key";
    process.env.WEATHER_PROVIDER = "google";
  });

  it("splits an 11-day trip: live for the 10 days Google covers, seasonal for the rest", async () => {
    const start = new Date();
    const end = new Date(start.getTime() + 10 * DAY_MS); // 11 days total, offsets 0..10

    axios.get.mockResolvedValue({
      data: {
        // Only the first 10 days (offsets 0..9) are requested/covered by Google.
        forecastDays: Array.from({ length: 10 }, (_, index) =>
          googleForecastDay(new Date(start.getTime() + index * DAY_MS))
        ),
      },
    });

    const result = await getForecast("London", iso(start), iso(end), "United Kingdom");

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get.mock.calls[0][1].params.days).toBe(10);
    expect(result.isMock).toBe(false);
    expect(result.isSeasonal).toBe(true);
    expect(result.isMixed).toBe(true);
    expect(result.forecast).toHaveLength(11);
    expect(result.forecast.map((day) => day.date)).toEqual(
      Array.from({ length: 11 }, (_, index) => iso(new Date(start.getTime() + index * DAY_MS)))
    );
    // First 10 days are real Google data, the 11th is the seasonal tail.
    expect(result.forecast.slice(0, 10).every((day) => day.provider === "google")).toBe(true);
    expect(result.forecast[10].provider).toBe("seasonal");
  });

  it("splits a trip that starts within the window but ends past it", async () => {
    const start = new Date(Date.now() + 5 * DAY_MS); // offset 5
    const end = new Date(start.getTime() + 5 * DAY_MS); // 6-day trip, offsets 5..10

    axios.get.mockResolvedValue({
      data: {
        // Google can only cover offsets 5..9 (5 days) before day 10 is exceeded.
        forecastDays: Array.from({ length: 5 }, (_, index) =>
          googleForecastDay(new Date(start.getTime() + index * DAY_MS))
        ),
      },
    });

    const result = await getForecast("London", iso(start), iso(end), "United Kingdom");

    // Google's "days" param always counts from today, not from the trip
    // start, so it lands on the window boundary (offset 5 + 5 live days = 10)
    // even though only 5 of those days actually belong to this trip.
    expect(axios.get.mock.calls[0][1].params.days).toBe(10);
    expect(result.isMock).toBe(false);
    expect(result.isMixed).toBe(true);
    expect(result.forecast).toHaveLength(6);
    expect(result.forecast.slice(0, 5).every((day) => day.provider === "google")).toBe(true);
    expect(result.forecast[5].provider).toBe("seasonal");
  });

  it("falls back to a full-trip seasonal estimate when the live-eligible portion has no coverage", async () => {
    const start = new Date();
    const end = new Date(start.getTime() + 10 * DAY_MS); // 11-day trip

    axios.get.mockResolvedValue({ data: { forecastDays: [] } });

    const result = await getForecast("London", iso(start), iso(end), "United Kingdom");

    expect(result.isSeasonal).toBe(true);
    expect(result.isMock).toBe(false);
    expect(result.isMixed).toBeUndefined();
    expect(result.forecast).toHaveLength(11);
  });

  it("uses a seasonal estimate when the trip starts entirely beyond Google's horizon", async () => {
    const start = new Date(Date.now() + 30 * DAY_MS);
    const end = new Date(start.getTime() + DAY_MS);

    const result = await getForecast("London", iso(start), iso(end), "United Kingdom");

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.isSeasonal).toBe(true);
    expect(result.isMock).toBe(false);
    expect(result.forecast).toHaveLength(2);
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
