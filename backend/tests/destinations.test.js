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
