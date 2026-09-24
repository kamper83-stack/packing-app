jest.mock("axios");
const axios = require("axios");
const { getForecast } = require("../services/weatherService");

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  axios.get.mockReset();
  process.env = { ...ORIGINAL_ENV };
});

test("weatherService selects Google Weather when GOOGLE_WEATHER_API_KEY is configured", async () => {
  process.env.USE_MOCKS = "false";
  process.env.GOOGLE_WEATHER_API_KEY = "test-google-key";
  delete process.env.WEATHER_PROVIDER;
  delete process.env.WEATHER_API_KEY;
  axios.get.mockResolvedValue({
    data: {
      forecastDays: [
        {
          displayDate: { year: 2026, month: 9, day: 23 },
          daytimeForecast: { weatherCondition: { description: { text: "Sunny" } } },
          minTemperature: { degrees: 18 },
          maxTemperature: { degrees: 26 },
        },
      ],
    },
  });

  const result = await getForecast("London", "2026-09-23", "2026-09-23", "United Kingdom");

  expect(result).toEqual({
    forecast: [{ date: "2026-09-23", tempC: 22, condition: "Sunny" }],
    isMock: false,
  });
  expect(axios.get.mock.calls[0][0]).toBe("https://weather.googleapis.com/v1/forecast/days:lookup");
});

test("weatherService uses a seasonal estimate when a Google trip starts outside its ten-day window", async () => {
  const DAY = 24 * 60 * 60 * 1000;
  const iso = (date) => new Date(date).toISOString().split("T")[0];
  const start = iso(Date.now() + 10 * DAY);
  const end = iso(Date.now() + 11 * DAY);

  process.env.USE_MOCKS = "false";
  process.env.GOOGLE_WEATHER_API_KEY = "test-google-key";
  process.env.WEATHER_PROVIDER = "google";

  const result = await getForecast("London", start, end, "United Kingdom");

  expect(axios.get).not.toHaveBeenCalled();
  expect(result.isSeasonal).toBe(true);
  expect(result.forecast.map((entry) => entry.date)).toEqual([start, end]);
});
