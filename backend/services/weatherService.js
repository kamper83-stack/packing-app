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

// Google Weather is the only live forecast provider in v2. A live response is
// used only when Google can cover the entire trip within its ten-day window;
// otherwise a single seasonal estimate avoids presenting mixed provenance as
// one forecast.
async function getForecast(destination, startDate, endDate) {
  const tripDays = Math.max(dayOffset(startDate, endDate) + 1, 1);
  const startOffset = Math.max(0, dayOffset(new Date(), startDate));

  if (
    googleWeatherService.isBeyondGoogleForecastHorizon(startDate) ||
    startOffset + tripDays > googleWeatherService.GOOGLE_FORECAST_MAX_DAYS
  ) {
    return climateService.getSeasonalEstimate(destination, startDate, endDate);
  }

  const weather = await googleWeatherService.getForecast(destination, startDate, endDate);
  if (weather.errorCode === "google_no_coverage") {
    return climateService.getSeasonalEstimate(destination, startDate, endDate);
  }

  return weather;
}

module.exports = {
  getForecast,
  LIVE_FORECAST_MAX_DAYS: googleWeatherService.GOOGLE_FORECAST_MAX_DAYS,
};
