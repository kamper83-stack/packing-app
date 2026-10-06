const request = require("supertest");
const app = require("../server");
const { sequelize, User, Trip, PackingItem } = require("../models");

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

// Self-service account deletion — Issue #160 / StoreReadiness A5 / gap G4.
describe("DELETE /api/auth/me — self-service account deletion", () => {
  const password = "Password123!";

  async function registerUser(email) {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password });
    expect(res.status).toBe(201);
    return { token: res.body.token, id: res.body.user.id };
  }

  async function seedTripWithItem(userId) {
    const trip = await Trip.create({
      destination: "Rome",
      startDate: "2026-07-01",
      endDate: "2026-07-10",
      airline: "ElAl",
      vacationType: "City",
      userId,
    });
    const item = await PackingItem.create({
      name: "Passport",
      category: "Documents",
      tripId: trip.id,
    });
    return { tripId: trip.id, itemId: item.id };
  }

  it("deletes the account and cascades to the user's trips and items", async () => {
    const { token, id } = await registerUser("delete-me@example.com");
    const { tripId, itemId } = await seedTripWithItem(id);

    const res = await request(app)
      .delete("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ password });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);

    expect(await User.findByPk(id)).toBeNull();
    expect(await Trip.findByPk(tripId)).toBeNull();
    expect(await PackingItem.findByPk(itemId)).toBeNull();
  });

  it("rejects deletion when the password is wrong and keeps the data intact", async () => {
    const { token, id } = await registerUser("keep-me@example.com");
    const { tripId } = await seedTripWithItem(id);

    const res = await request(app)
      .delete("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "WrongPassword!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid password/i);

    expect(await User.findByPk(id)).not.toBeNull();
    expect(await Trip.findByPk(tripId)).not.toBeNull();
  });

  it("rejects deletion when no password is supplied", async () => {
    const { token } = await registerUser("needs-password@example.com");

    const res = await request(app)
      .delete("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password is required/i);
  });

  it("rejects deletion without an authentication token", async () => {
    const res = await request(app)
      .delete("/api/auth/me")
      .send({ password });

    expect(res.status).toBe(401);
  });

  it("only deletes the caller's own account, never another user's data", async () => {
    const victim = await registerUser("victim@example.com");
    const { tripId: victimTripId } = await seedTripWithItem(victim.id);

    const attacker = await registerUser("attacker@example.com");

    // The endpoint acts on the authenticated user only; there is no id to
    // target, so the attacker can only ever delete themselves.
    const res = await request(app)
      .delete("/api/auth/me")
      .set("Authorization", `Bearer ${attacker.token}`)
      .send({ password });

    expect(res.status).toBe(200);

    // The victim and their data are untouched.
    expect(await User.findByPk(victim.id)).not.toBeNull();
    expect(await Trip.findByPk(victimTripId)).not.toBeNull();
    expect(await User.findByPk(attacker.id)).toBeNull();
  });
});
