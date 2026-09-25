const climate = require("../config/climate.json");

// Live weather providers can't give daily forecasts far into the future, so
// trips whose start is more than this many days out get a seasonal climate
// estimate instead of a live forecast (Issue #65). Kept in sync with the
// live-forecast horizon.
const SEASONAL_THRESHOLD_DAYS = 14;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Kept in sync with MAX_TRIP_DAYS in routes/trips.js (the longest trip a user
// can create). A seasonal estimate is computed locally (no API call), so
// there's no cost reason to cap it lower than that - but an explicit bound
// still guards against an unbounded array if that invariant ever breaks.
const MAX_FORECAST_DAYS = 60;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isoDate(value) {
  return new Date(value).toISOString().split("T")[0];
}

// Whole calendar days from `from` to `to`, date-only (time-of-day ignored).
function dayOffset(from, to) {
  const a = new Date(isoDate(from));
  const b = new Date(isoDate(to));
  return Math.round((b - a) / MS_PER_DAY);
}

// True when the trip starts beyond the live-forecast window and should use a
// seasonal estimate. `now` is injectable for testing.
function isBeyondLiveForecast(startDate, now = new Date()) {
  return dayOffset(now, startDate) > SEASONAL_THRESHOLD_DAYS;
}

// Human-readable condition derived from a monthly average temperature. Kept
// deliberately simple (temperature bands) since we only have monthly normals.
function conditionForTemp(tempC) {
  if (tempC >= 28) return "Hot and Sunny";
  if (tempC >= 22) return "Warm and Sunny";
  if (tempC >= 15) return "Mild";
  if (tempC >= 8) return "Cool";
  return "Cold";
}

// Resolve the 12-month temperature curve for a destination, falling back to the
// default profile for anything not in the catalog.
function monthlyTempsFor(destination) {
  const key = climate.destinations[destination];
  const profileName = key || climate.default;
  return climate.profiles[profileName] || climate.profiles[climate.default];
}

// Seasonal climate estimate for a trip, shaped like a weather forecast so the
// rest of the pipeline (Gemini prompt, TripView widget) is unchanged. Each trip
// day is dated correctly and carries that day's month's climate normal, so a
// trip spanning a month boundary reflects both months.
function getSeasonalEstimate(destination, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const temps = monthlyTempsFor(destination);

  // Inclusive trip length, bounded so a very long range can't produce a huge
  // array. Must cover every day up to MAX_TRIP_DAYS so a full-length trip's
  // forecast array is never silently shorter than the trip itself (this also
  // matters for the "mixed" live+seasonal path in weatherService.js, which
  // relies on this array covering its full requested sub-range).
  const rawDays = dayOffset(start, end) + 1;
  const tripDays = Math.min(Math.max(rawDays, 1), MAX_FORECAST_DAYS);

  const forecast = Array.from({ length: tripDays }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const tempC = temps[date.getMonth()];
    return {
      date: isoDate(date),
      tempC,
      condition: conditionForTemp(tempC),
    };
  });

  const startMonth = start.getMonth();
  const startTemp = temps[startMonth];
  const summary =
    `${destination} in ${MONTH_NAMES[startMonth]}: ` +
    `${startTemp}°C, ${conditionForTemp(startTemp)}`;

  return { forecast, isSeasonal: true, isMock: false, month: startMonth, summary };
}

module.exports = {
  SEASONAL_THRESHOLD_DAYS,
  isBeyondLiveForecast,
  getSeasonalEstimate,
  conditionForTemp,
};
