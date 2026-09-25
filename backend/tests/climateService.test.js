// Unit tests for the seasonal climate estimation service (Issue #65).
const {
  SEASONAL_THRESHOLD_DAYS,
  isBeyondLiveForecast,
  getSeasonalEstimate,
  conditionForTemp,
} = require("../services/climateService");

const DAY = 24 * 60 * 60 * 1000;
const iso = (d) => new Date(d).toISOString().split("T")[0];
const daysFromNow = (n) => iso(Date.now() + n * DAY);

describe("isBeyondLiveForecast", () => {
  it("is false inside the live-forecast window", () => {
    expect(isBeyondLiveForecast(daysFromNow(3))).toBe(false);
    expect(isBeyondLiveForecast(daysFromNow(SEASONAL_THRESHOLD_DAYS))).toBe(false);
  });

  it("is true beyond the threshold", () => {
    expect(isBeyondLiveForecast(daysFromNow(SEASONAL_THRESHOLD_DAYS + 1))).toBe(true);
    expect(isBeyondLiveForecast(daysFromNow(60))).toBe(true);
  });

  it("accepts an injected 'now' for determinism", () => {
    // Trip 2027-07-01 is far beyond a 2027-01-01 "now".
    expect(isBeyondLiveForecast("2027-07-01", new Date("2027-01-01"))).toBe(true);
    expect(isBeyondLiveForecast("2027-01-10", new Date("2027-01-01"))).toBe(false);
  });
});

describe("conditionForTemp", () => {
  it("maps temperature bands to labels", () => {
    expect(conditionForTemp(31)).toBe("Hot and Sunny");
    expect(conditionForTemp(24)).toBe("Warm and Sunny");
    expect(conditionForTemp(17)).toBe("Mild");
    expect(conditionForTemp(10)).toBe("Cool");
    expect(conditionForTemp(2)).toBe("Cold");
  });
});

describe("getSeasonalEstimate", () => {
  it("returns a trip-dated, seasonal forecast using monthly normals", () => {
    // Rome in July -> mediterranean profile, month index 6 (27°C).
    const result = getSeasonalEstimate("Rome", "2027-07-10", "2027-07-12");

    expect(result.isSeasonal).toBe(true);
    expect(result.isMock).toBe(false);
    expect(result.forecast.map((d) => d.date)).toEqual([
      "2027-07-10",
      "2027-07-11",
      "2027-07-12",
    ]);
    for (const day of result.forecast) {
      expect(day.tempC).toBe(27);
      expect(day.condition).toBe("Warm and Sunny");
    }
    expect(result.summary).toMatch(/Rome in July: 27°C/);
  });

  it("reflects a cold-winter destination realistically", () => {
    // London in December -> oceanic profile, month index 11 (4°C).
    const result = getSeasonalEstimate("London", "2027-12-20", "2027-12-21");
    expect(result.forecast[0].tempC).toBe(4);
    expect(result.forecast[0].condition).toBe("Cold");
    expect(result.summary).toMatch(/London in December: 4°C, Cold/);
  });

  it("uses the default profile for an unknown destination", () => {
    const result = getSeasonalEstimate("Atlantis", "2027-07-01", "2027-07-01");
    expect(result.isSeasonal).toBe(true);
    expect(typeof result.forecast[0].tempC).toBe("number");
  });

  it("dates each day by its own month across a month boundary", () => {
    // Barcelona (mediterranean): July=27, August=27; use a range that crosses
    // into a different-temperature month to confirm per-day month lookup.
    const result = getSeasonalEstimate("Stockholm", "2027-05-30", "2027-06-02");
    // Stockholm (nordic): May index 4 = 13, June index 5 = 17.
    const byDate = Object.fromEntries(result.forecast.map((d) => [d.date, d.tempC]));
    expect(byDate["2027-05-30"]).toBe(13);
    expect(byDate["2027-05-31"]).toBe(13);
    expect(byDate["2027-06-01"]).toBe(17);
    expect(byDate["2027-06-02"]).toBe(17);
  });

  it("covers a full 60-day trip without truncating (MAX_TRIP_DAYS alignment)", () => {
    // Trips can be up to MAX_TRIP_DAYS = 60 days (routes/trips.js); a
    // seasonal estimate must cover every day of a trip that long, not just
    // the first 30 (this cap previously didn't match MAX_TRIP_DAYS and
    // silently dropped the tail of any 31-60 day trip).
    const result = getSeasonalEstimate("Rome", "2027-01-01", "2027-03-01"); // 60 days inclusive
    expect(result.forecast).toHaveLength(60);
    expect(result.forecast[0].date).toBe("2027-01-01");
    expect(result.forecast[59].date).toBe("2027-03-01");
  });

  it("still bounds an absurdly long range so the array can't grow unbounded", () => {
    const result = getSeasonalEstimate("Rome", "2027-01-01", "2029-01-01"); // ~2 years
    expect(result.forecast.length).toBeLessThanOrEqual(60);
  });
});
