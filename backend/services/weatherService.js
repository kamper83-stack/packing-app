const climateService = require("./climateService");
const googleWeatherService = require("./googleWeatherService");

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function isoDate(value) {
  return new Date(value).toISOString().split("T")[0];
}

function dayOffset(from, to) {
  const a = new Date(isoDate(from));
  const b = new Date(isoDate(to));
  return Math.round((b - a) / MS_PER_DAY);
}

function addDays(startDate, amount) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + amount);
  return isoDate(date);
}

// Google Weather is the only live forecast provider in v2, and its response
// only covers today .. today+9 (a 10-day window). A trip that starts inside
// that window but runs past it (e.g. an 11-day trip starting tomorrow) is
// split at the boundary instead of discarding the live data entirely: the
// leading days that fall inside the window get a real Google forecast, the
// trailing days get a seasonal climate estimate. Each combined day is tagged
// with its own `provider` so the mix is visible per day, not just at the
// trip level. A trip that starts on/after day 10 has no live component at
// all and gets one full-trip seasonal estimate, same as before.
async function getForecast(destination, startDate, endDate) {
  const maxDays = googleWeatherService.GOOGLE_FORECAST_MAX_DAYS;
  const tripDays = Math.max(dayOffset(startDate, endDate) + 1, 1);
  const startOffset = Math.max(0, dayOffset(new Date(), startDate));

  if (googleWeatherService.isBeyondGoogleForecastHorizon(startDate)) {
    return climateService.getSeasonalEstimate(destination, startDate, endDate);
  }

  const liveDays = Math.min(tripDays, maxDays - startOffset);

  if (liveDays >= tripDays) {
    // Whole trip fits inside Google's window - unchanged single-provider path.
    const weather = await googleWeatherService.getForecast(destination, startDate, endDate);
    if (weather.errorCode === "google_no_coverage") {
      return climateService.getSeasonalEstimate(destination, startDate, endDate);
    }
    return weather;
  }

  // Trip extends past the window: only request the days Google can actually
  // cover, and get a seasonal estimate for the remainder.
  const liveEndDate = addDays(startDate, liveDays - 1);
  const seasonalStartDate = addDays(startDate, liveDays);

  const liveWeather = await googleWeatherService.getForecast(destination, startDate, liveEndDate);
  if (liveWeather.isMock) {
    // The days Google could have covered aren't reliably live either (no
    // coverage, no key, request failure, ...) - one coherent seasonal
    // estimate for the whole trip beats mixing a mock reading with a
    // seasonal one.
    return climateService.getSeasonalEstimate(destination, startDate, endDate);
  }

  const seasonalWeather = climateService.getSeasonalEstimate(destination, seasonalStartDate, endDate);

  return {
    forecast: [
      ...liveWeather.forecast.map((day) => ({ ...day, provider: "google" })),
      ...seasonalWeather.forecast.map((day) => ({ ...day, provider: "seasonal" })),
    ],
    isMock: false,
    // `isSeasonal: true` is accurate (part of this response genuinely is a
    // seasonal estimate) but incomplete on its own - `isMixed` is the field
    // that distinguishes this from a full-trip seasonal fallback, and every
    // consumer (routes/trips.js) checks `isMixed` first for that reason.
    isSeasonal: true,
    isMixed: true,
  };
}

module.exports = {
  getForecast,
  LIVE_FORECAST_MAX_DAYS: googleWeatherService.GOOGLE_FORECAST_MAX_DAYS,
};
