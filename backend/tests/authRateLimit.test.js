// Issue #161 / StoreReadiness A7 / gap G6 — brute-force protection on the
// credential endpoints. Set an explicit low limit BEFORE requiring the app so
// this suite exercises the real /api/auth wiring deterministically, instead of
// the raised test-default ceiling the other suites run under.
const PREV_MAX = process.env.AUTH_RATE_LIMIT_MAX;
const PREV_WINDOW = process.env.AUTH_RATE_LIMIT_WINDOW_MS;
process.env.AUTH_RATE_LIMIT_MAX = "3";
process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";

const request = require("supertest");
const app = require("../server");
const { sequelize } = require("../models");
const logStore = require("../services/logStore");

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
  // process.env is process-global and not reset between test files under
  // --runInBand; restore it so the low limit can't leak into later suites.
  if (PREV_MAX === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
  else process.env.AUTH_RATE_LIMIT_MAX = PREV_MAX;
  if (PREV_WINDOW === undefined) delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
  else process.env.AUTH_RATE_LIMIT_WINDOW_MS = PREV_WINDOW;
});

describe("Auth rate limiting (Issue #161 / A7 / G6)", () => {
  // The limiter is shared across register + login and keyed by IP; supertest
  // calls all originate from the same loopback address, so the per-IP budget
  // (AUTH_RATE_LIMIT_MAX=3) is consumed in order across the assertions below.
  it("lets real attempts through up to the limit, then throttles with a readable 429", async () => {
    const creds = { email: "attacker@example.com", password: "wrong-password" };

    // The first 3 attempts reach the normal handler (400 invalid credentials),
    // proving the limiter does not block legitimate traffic under the ceiling.
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/auth/login").send(creds);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid email or password/i);
    }

    // The 4th within the window is throttled.
    const blocked = await request(app).post("/api/auth/login").send(creds);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many attempts/i);
    // Standard RateLimit headers are advertised so clients can back off.
    expect(blocked.headers).toHaveProperty("ratelimit-limit", "3");
  });

  it("shares one budget across register and login so alternating endpoints can't dodge it", async () => {
    // The budget was already exhausted by the previous test (same IP, same
    // 60s window), so switching to /register is throttled too.
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "evader@example.com", password: "abcdef" });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many attempts/i);
  });

  it("records throttled attempts in the operational log (Issue #62)", () => {
    const warned = logStore
      .list()
      .some((entry) => entry.level === "warn" && entry.status === 429);
    expect(warned).toBe(true);
  });
});
