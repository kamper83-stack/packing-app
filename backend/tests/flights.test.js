// Tests for GET /api/trips/flights: requires auth, validates input, and returns
// round-trip offers (sample offers in the test/mock environment).
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
  token = await registerAndGetToken("flights@example.com");
});

afterAll(async () => {
  await sequelize.close();
});

describe("GET /api/trips/flights", () => {
  it("requires authentication", async () => {
    const res = await request(app).get(
      "/api/trips/flights?destination=Rome&departDate=2026-09-01"
    );
    expect(res.status).toBe(401);
  });

  it("returns round-trip offers dated to the requested trip", async () => {
    const res = await request(app)
      .get("/api/trips/flights")
      .query({ origin: "Tel Aviv", destination: "Rome", departDate: "2026-09-01", returnDate: "2026-09-05" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.offers)).toBe(true);
    expect(res.body.offers.length).toBeGreaterThan(0);
    expect(res.body.offers[0].departDate).toBe("2026-09-01");
    expect(res.body.offers[0].returnDate).toBe("2026-09-05");
  });

  it("rejects a request without destination or departDate", async () => {
    const res = await request(app)
      .get("/api/trips/flights?origin=Tel Aviv")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("rejects a returnDate before the departDate", async () => {
    const res = await request(app)
      .get("/api/trips/flights")
      .query({ destination: "Rome", departDate: "2026-09-05", returnDate: "2026-09-01" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/before/i);
  });

  // Audit finding L3: previously this endpoint accepted any destination
  // string and returned mock flight offers for it, even though trip
  // creation (POST /api/trips) requires a recognized airport city — so a
  // user could get flight offers for a destination they could never
  // actually create a trip for.
  it("rejects a destination that is not a recognized airport city", async () => {
    const res = await request(app)
      .get("/api/trips/flights")
      .query({ destination: "NotARealCity123", departDate: "2026-09-01" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/airport/i);
  });

  // Issue #121: implausible years should be rejected with a dedicated,
  // field-specific message, mirroring POST /api/trips.
  describe("year plausibility (Issue #121)", () => {
    const currentYear = new Date().getUTCFullYear();

    it("rejects a departDate year that is too far in the past", async () => {
      const res = await request(app)
        .get("/api/trips/flights")
        .query({ destination: "Rome", departDate: `${currentYear - 1}-06-01` })
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/departDate year/i);
    });

    it("rejects a returnDate year that is too far in the future", async () => {
      const res = await request(app)
        .get("/api/trips/flights")
        .query({
          destination: "Rome",
          departDate: `${currentYear}-06-01`,
          returnDate: `${currentYear + 3}-06-05`,
        })
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/returnDate year/i);
    });

    it("accepts a valid search that crosses a New Year boundary", async () => {
      const res = await request(app)
        .get("/api/trips/flights")
        .query({
          destination: "Rome",
          departDate: `${currentYear}-12-28`,
          returnDate: `${currentYear + 1}-01-03`,
        })
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });
});
