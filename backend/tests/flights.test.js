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
});
