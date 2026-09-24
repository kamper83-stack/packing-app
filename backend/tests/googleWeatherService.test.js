jest.mock("axios");
const axios = require("axios");
const { getForecast } = require("../services/googleWeatherService");

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  axios.get.mockReset();
  process.env = { ...ORIGINAL_ENV };
});

describe("googleWeatherService.getForecast", () => {
  beforeEach(() => {
    process.env.USE_MOCKS = "false";
    process.env.GOOGLE_WEATHER_API_KEY = "test-google-key";
  });

  it("requests a coordinate forecast and maps Google daily data to the app shape", async () => {
    axios.get.mockResolvedValue({
      data: {
        forecastDays: [
          {
            displayDate: { year: 2026, month: 9, day: 23 },
            daytimeForecast: {
              weatherCondition: { description: { text: "Partly cloudy" } },
            },
            minTemperature: { degrees: 14.2 },
            maxTemperature: { degrees: 24.6 },
          },
          {
            displayDate: { year: 2026, month: 9, day: 24 },
            daytimeForecast: {
              weatherCondition: { description: { text: "Light rain" } },
            },
            minTemperature: { degrees: 13 },
            maxTemperature: { degrees: 20 },
          },
        ],
        timeZone: { id: "Europe/London" },
      },
    });

    const result = await getForecast("London", "2026-09-23", "2026-09-24", "United Kingdom");

    expect(axios.get).toHaveBeenCalledWith(
      "https://weather.googleapis.com/v1/forecast/days:lookup",
      expect.objectContaining({
        params: expect.objectContaining({
          key: "test-google-key",
          "location.latitude": expect.any(Number),
          "location.longitude": expect.any(Number),
          days: 2,
          pageSize: 2,
          unitsSystem: "METRIC",
        }),
        timeout: 8000,
      })
    );
    expect(result).toEqual({
      forecast: [
        { date: "2026-09-23", tempC: 19.4, condition: "Partly cloudy" },
        { date: "2026-09-24", tempC: 16.5, condition: "Light rain" },
      ],
      isMock: false,
    });
  });

  it("aligns a future trip to the requested dates instead of returning today", async () => {
    axios.get.mockResolvedValue({
      data: {
        forecastDays: [
          { displayDate: { year: 2026, month: 9, day: 23 }, daytimeForecast: { weatherCondition: { description: { text: "Today" } } }, minTemperature: { degrees: 10 }, maxTemperature: { degrees: 20 } },
          { displayDate: { year: 2026, month: 9, day: 24 }, daytimeForecast: { weatherCondition: { description: { text: "Tomorrow" } } }, minTemperature: { degrees: 11 }, maxTemperature: { degrees: 21 } },
          { displayDate: { year: 2026, month: 9, day: 25 }, daytimeForecast: { weatherCondition: { description: { text: "Trip day" } } }, minTemperature: { degrees: 12 }, maxTemperature: { degrees: 22 } },
        ],
        timeZone: { id: "Europe/London" },
      },
    });

    const result = await getForecast("London", "2026-09-25", "2026-09-25", "United Kingdom");

    expect(result.forecast).toEqual([{ date: "2026-09-25", tempC: 17, condition: "Trip day" }]);
  });

  it("falls back to a dated mock when Google returns no coverage", async () => {
    axios.get.mockResolvedValue({ data: { forecastDays: [] } });

    const result = await getForecast("London", "2026-09-23", "2026-09-24", "United Kingdom");

    expect(result.isMock).toBe(true);
    expect(result.forecast.map((entry) => entry.date)).toEqual(["2026-09-23", "2026-09-24"]);
  });

  it("uses the nighttime condition when Google has no daytime forecast", async () => {
    axios.get.mockResolvedValue({
      data: {
        forecastDays: [
          {
            displayDate: { year: 2026, month: 9, day: 23 },
            nighttimeForecast: {
              weatherCondition: { description: { text: "Clear night" } },
            },
            minTemperature: { degrees: 10 },
            maxTemperature: { degrees: 16 },
          },
        ],
      },
    });

    const result = await getForecast("London", "2026-09-23", "2026-09-23");

    expect(result).toEqual({
      forecast: [{ date: "2026-09-23", tempC: 13, condition: "Clear night" }],
      isMock: false,
    });
  });
});
