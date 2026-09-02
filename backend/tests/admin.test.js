process.env.USE_MOCKS = "true";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.WEATHER_API_KEY = "your_weather_api_key_here";
process.env.GEMINI_API_KEY = "";

const request = require("supertest");
const app = require("../server");
const { sequelize } = require("../models");

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

async function register(email) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!" });
  return res;
}

describe("Admin API (Issue #49)", () => {
  let adminToken = "";
  let userToken = "";

  beforeAll(async () => {
    const admin = await register("admin@example.com");
    const user = await register("member@example.com");
    adminToken = admin.body.token;
    userToken = user.body.token;
    expect(admin.body.user.isAdmin).toBe(true);
    expect(user.body.user.isAdmin).toBe(false);
  });

  it("rejects admin routes without a token", async () => {
    const res = await request(app).get("/api/admin/status");
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin user", async () => {
    const res = await request(app)
      .get("/api/admin/status")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin access required/i);
  });

  it("returns masked provider status for an admin", async () => {
    const res = await request(app)
      .get("/api/admin/status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.useMocks).toBe(true);
    expect(res.body.weather.configured).toBe(false);
    expect(res.body.weather.suffix).toBeNull();
    expect(res.body.weather.mode).toBe("mock");
    expect(res.body.gemini.configured).toBe(false);
    expect(res.body.gemini.mode).toBe("mock");
    expect(JSON.stringify(res.body)).not.toMatch(/Password123/i);
  });

  it("lists users without passwords and with trip counts", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    const emails = res.body.map((row) => row.email).sort();
    expect(emails).toEqual(["admin@example.com", "member@example.com"]);
    res.body.forEach((row) => {
      expect(row).not.toHaveProperty("password");
      expect(row).toHaveProperty("tripCount");
      expect(row).toHaveProperty("createdAt");
    });
  });

  it("returns recent trip logs for an admin", async () => {
    const res = await request(app)
      .get("/api/admin/logs")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
