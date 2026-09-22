// Tests for the destination autocomplete endpoint (Issue #38):
// GET /api/trips/destinations returns { destinations: string[] } and requires auth.
process.env.USE_MOCKS = "true";

const request = require("supertest");
const app = require("../server");
const { sequelize } = require("../models");

async function registerAndGetToken(email) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!" });
  return res.body.token;
}

let token = "";

beforeAll(async () => {
  await sequelize.sync({ force: true });
  token = await registerAndGetToken("dest@example.com");
});

afterAll(async () => {
  await sequelize.close();
});

describe("GET /api/trips/destinations (Issue #38)", () => {
  it("returns a destinations array including Barcelona for an authenticated user", async () => {
    const res = await request(app)
      .get("/api/trips/destinations")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.destinations)).toBe(true);
    expect(res.body.destinations.length).toBeGreaterThan(0);
    expect(res.body.destinations).toContain("Barcelona");
  });

  it("is not captured by the /:id route (returns the list, not a 404 trip lookup)", async () => {
    const res = await request(app)
      .get("/api/trips/destinations")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("destinations");
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/trips/destinations");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/trips/locations (country -> airport cities)", () => {
  it("returns countries mapped to their airport cities for an authenticated user", async () => {
    const res = await request(app)
      .get("/api/trips/locations")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.citiesByCountry && typeof res.body.citiesByCountry).toBe("object");
    // A well-known country lists its airport cities.
    expect(Array.isArray(res.body.citiesByCountry.France)).toBe(true);
    expect(res.body.citiesByCountry.France).toContain("Paris");
    // Scope decision: only destinations reachable by a real route from Ben
    // Gurion (TLV) are offered, not every airport city in the world (see
    // backend/scripts/build-tlv-destinations.js). This keeps the catalog
    // small and every listed destination realistic for flight search.
    const countryCount = Object.keys(res.body.citiesByCountry).length;
    expect(countryCount).toBeGreaterThan(20);
    expect(countryCount).toBeLessThan(80);
  });

  it("golden list: known real TLV destinations are present, known-bad entries are excluded (Regression guard for future regenerations)", async () => {
    const res = await request(app)
      .get("/api/trips/locations")
      .set("Authorization", `Bearer ${token}`);

    const allCities = Object.values(res.body.citiesByCountry).flat();

    // Must exist: well-known real TLV routes, including ones a stale
    // (frozen-since-2014) data source would have missed — Dubai, Lisbon and
    // Tokyo are current El Al routes that an earlier version of this catalog
    // incorrectly excluded. See build-tlv-destinations.js history note.
    for (const city of [
      "Paris", "Rome", "Barcelona", "Larnaca", "Tbilisi", "Athens",
      "Dubai", "Lisbon", "Tokyo",
    ]) {
      expect(allCities).toContain(city);
    }

    // Must NOT exist: general-aviation/private airstrips and air force bases
    // that slipped into the old "any airport in the world" dataset (Masada,
    // Nevatim, Ramon), plus routes suspended since Feb 2022 (Russia,
    // Belarus, Ukraine).
    for (const city of ["Metzada", "Masada", "Nevatim", "Moscow", "Kiev", "Donetsk", "Minsk"]) {
      expect(allCities).not.toContain(city);
    }
    expect(Object.keys(res.body.citiesByCountry)).not.toEqual(
      expect.arrayContaining(["Russia", "Belarus", "Ukraine"])
    );
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/trips/locations");
    expect(res.status).toBe(401);
  });
});
