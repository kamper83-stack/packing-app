const request = require("supertest");
const app = require("../server");
const { sequelize, User } = require("../models");

beforeAll(async () => {
  // Sync in-memory SQLite / test database
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe("Authentication API Endpoints (Issue #4)", () => {
  const testUser = {
    email: "testuser@example.com",
    password: "Password123!",
  };

  describe("POST /api/auth/register", () => {
    it("should register a new user and return a JWT token", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("token");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.email).toBe(testUser.email.toLowerCase());
      expect(res.body.user).not.toHaveProperty("password");
    });

    it("should reject registration with an existing email", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toMatch(/already exists/i);
    });

    it("should reject registration with missing fields", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "incomplete@example.com" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it("should reject registration with an invalid email format", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "invalid-email-format", password: "Password123!" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid email/i);
    });

    it("should reject registration with a password shorter than 6 characters", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "shortpwd@example.com", password: "123" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 6 characters/i);
    });
  });

  describe("POST /api/auth/login", () => {
    it("should login with correct credentials and return a token", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send(testUser);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(res.body.user.email).toBe(testUser.email.toLowerCase());
    });

    it("should reject login with wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: "WrongPassword!",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it("should reject login with non-existing email", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "SomePassword123!",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });
  });

  describe("GET /api/auth/me", () => {
    let token = "";

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send(testUser);
      token = res.body.token;
    });

    it("should return current user profile when valid token is provided", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(testUser.email.toLowerCase());
    });

    it("should reject access when token is missing", async () => {
      const res = await request(app)
        .get("/api/auth/me");

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/no token provided/i);
    });

    it("should reject access when token is invalid", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.fake.token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/invalid token/i);
    });
  });
});
