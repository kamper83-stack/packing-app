// Unit tests for the Weather service (Issue #7).
//
// Fully offline: mock mode is exercised directly, and the real WeatherAPI path
// is verified against a mocked axios, so the suite never makes a network call
// or needs a real WEATHER_API_KEY.

jest.mock("axios");
const axios = require("axios");
const { getForecast } = require("../services/weatherService");

const VALID_CONDITIONS = ["Sunny", "Partly Cloudy", "Rainy"];
const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

beforeEach(() => {
  axios.get.mockReset();
  // Default each test to deterministic mock mode; real-path tests opt out.
  delete process.env.WEATHER_API_KEY;
  process.env.USE_MOCKS = "true";
});

afterAll(() => {
  jest.restoreAllMocks();
  process.env = ORIGINAL_ENV;
});

describe("weatherService.getForecast - mock mode", () => {
  it("returns one forecast entry per day of the (inclusive) range", async () => {
    const result = await getForecast("Barcelona", "2026-09-01", "2026-09-05");

    expect(result.isMock).toBe(true);
    expect(Array.isArray(result.forecast)).toBe(true);
    expect(result.forecast).toHaveLength(5); // 01..05 inclusive
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("produces well-formed entries within the expected temp range", async () => {
    const result = await getForecast("Barcelona", "2026-09-01", "2026-09-03");

    for (const entry of result.forecast) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.tempC).toBe("number");
      expect(entry.tempC).toBeGreaterThanOrEqual(19); // 22 + [0..5] - 3
      expect(entry.tempC).toBeLessThanOrEqual(24);
      expect(VALID_CONDITIONS).toContain(entry.condition);
    }
  });

  it("clamps ranges longer than 14 days down to 14 entries", async () => {
    const result = await getForecast("Barcelona", "2026-09-01", "2026-09-30");
    expect(result.forecast).toHaveLength(14);
  });

  it("returns a single entry for a same-day trip", async () => {
    const result = await getForecast("Barcelona", "2026-09-01", "2026-09-01");
    expect(result.forecast).toHaveLength(1);
  });

  it("uses mock mode when no API key is set, even if USE_MOCKS is unset", async () => {
    delete process.env.USE_MOCKS;
    delete process.env.WEATHER_API_KEY;

    const result = await getForecast("Barcelona", "2026-09-01", "2026-09-02");

    expect(result.isMock).toBe(true);
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe("weatherService.getForecast - real API path (mocked axios)", () => {
  const enableRealPath = () => {
    process.env.USE_MOCKS = "false";
    process.env.WEATHER_API_KEY = "test-key";
  };

  it("maps the WeatherAPI response into the internal forecast shape", async () => {
    enableRealPath();
    axios.get.mockResolvedValue({
      data: {
        forecast: {
          forecastday: [
            { date: "2026-09-01", day: { avgtemp_c: 27.4, condition: { text: "Sunny" } } },
            { date: "2026-09-02", day: { avgtemp_c: 21.1, condition: { text: "Cloudy" } } },
          ],
        },
      },
    });

    const result = await getForecast("Barcelona", "2026-09-01", "2026-09-02");

    expect(axios.get).toHaveBeenCalledTimes(1);
    // Sends the destination and computed day count to WeatherAPI.
    const [url, config] = axios.get.mock.calls[0];
    expect(url).toContain("api.weatherapi.com");
    expect(config.params).toMatchObject({ q: "Barcelona", days: 2, key: "test-key" });

    expect(result.isMock).toBe(false);
    expect(result.forecast).toEqual([
      { date: "2026-09-01", tempC: 27.4, condition: "Sunny" },
      { date: "2026-09-02", tempC: 21.1, condition: "Cloudy" },
    ]);
  });

  it("falls back to a mild mock forecast when the API call fails", async () => {
    enableRealPath();
    axios.get.mockRejectedValue(new Error("timeout"));

    const result = await getForecast("Barcelona", "2026-09-01", "2026-09-03");

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(result.isMock).toBe(true);
    expect(result.error).toBe("timeout");
    expect(result.forecast).toHaveLength(3);
    for (const entry of result.forecast) {
      expect(entry.tempC).toBe(20);
      expect(entry.condition).toBe("Mild");
    }
  });
});
