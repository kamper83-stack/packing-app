const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const express = require("express");
const { sequelize, User } = require("../models");
const authRoutes = require("../routes/auth");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

let server;
let baseUrl;

describe("Authentication Routes Tests", () => {
  before(async () => {
    // Sync DB with clean state for tests
    await sequelize.sync({ force: true });
    
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/auth`;
  });

  after(async () => {
    if (server) server.close();
  });

  test("Registration fails on missing email or password", async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  test("Registration fails on invalid email format", async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "password123" }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "Invalid email format.");
  });

  test("Registration fails on password shorter than 6 characters", async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "valid@example.com", password: "123" }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "Password must be at least 6 characters long.");
  });

  let authToken = "";

  test("Registration succeeds with valid input and hashes password", async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "testuser@example.com", password: "SecretPassword123" }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.user.email, "testuser@example.com");
    authToken = data.token;

    // Verify in DB that password is not stored plaintext
    const dbUser = await User.findOne({ where: { email: "testuser@example.com" } });
    assert.notStrictEqual(dbUser.password, "SecretPassword123");
    assert.ok(dbUser.password.startsWith("$2"));
  });

  test("Registration fails on duplicate email", async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "testuser@example.com", password: "AnotherPassword123" }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "User already exists with this email.");
  });

  test("Login fails with incorrect password", async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "testuser@example.com", password: "WrongPassword" }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "Invalid email or password.");
  });

  test("Login succeeds with correct password", async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "testuser@example.com", password: "SecretPassword123" }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.user.email, "testuser@example.com");
  });

  test("GET /me fails without token (401)", async () => {
    const res = await fetch(`${baseUrl}/me`);
    assert.strictEqual(res.status, 401);
  });

  test("GET /me fails with invalid token (403)", async () => {
    const res = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: "Bearer invalid_token_12345" },
    });
    assert.strictEqual(res.status, 403);
  });

  test("GET /me succeeds with valid token (200)", async () => {
    const res = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.email, "testuser@example.com");
  });
});
