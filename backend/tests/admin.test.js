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

  it("rejects the operational system-logs endpoint for a non-admin (Issue #62)", async () => {
    const res = await request(app)
      .get("/api/admin/system-logs")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("returns operational runtime logs capturing API activity for an admin (Issue #62)", async () => {
    const res = await request(app)
      .get("/api/admin/system-logs")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);

    // Entries are well-formed and newest-first; the prior admin requests in
    // this suite must have been recorded by the request logger.
    const entry = res.body.logs[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("at");
    expect(["info", "warn", "error"]).toContain(entry.level);
    expect(res.body.logs.some((e) => String(e.path).includes("/api/admin"))).toBe(true);
  });

  it("supports filtering operational logs by level (Issue #62)", async () => {
    // The earlier non-admin 403s were recorded at warn level.
    const res = await request(app)
      .get("/api/admin/system-logs?level=warn")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.logs.every((e) => e.level === "warn")).toBe(true);
    expect(res.body.logs.some((e) => e.status === 403)).toBe(true);
  });
});
