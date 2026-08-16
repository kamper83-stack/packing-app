// Force mock mode for the weather and AI services so the suite never makes
// external network calls, and run against the in-memory test database.
process.env.USE_MOCKS = "true";

const request = require("supertest");
const app = require("../server");
const { sequelize } = require("../models");

// Helper: register a user and return a valid Bearer token.
async function registerAndGetToken(email) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Password123!" });
  return res.body.token;
}

let tokenA = "";
let tokenB = "";

beforeAll(async () => {
  await sequelize.sync({ force: true });
  tokenA = await registerAndGetToken("owner@example.com");
  tokenB = await registerAndGetToken("other@example.com");
});

afterAll(async () => {
  await sequelize.close();
});

describe("Trips API Endpoints (Issue #6)", () => {
  const validTrip = {
    destination: "  Barcelona  ",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
    airline: "EL AL",
    numPeople: 2,
    vacationType: "Beach",
  };

  let createdTripId = "";
  let firstItemId = "";

  describe("POST /api/trips", () => {
    it("should reject creation without an auth token", async () => {
      const res = await request(app).post("/api/trips").send(validTrip);
      expect(res.status).toBe(401);
    });

    it("should reject creation when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ destination: "Rome" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it("should reject creation when end date is before start date", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...validTrip, startDate: "2026-09-05", endDate: "2026-09-01" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/end date cannot be before/i);
    });

    it("should reject creation with an invalid date", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...validTrip, startDate: "not-a-date" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid start or end date/i);
    });

    it("should reject creation with a non-positive number of people", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...validTrip, numPeople: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/positive integer/i);
    });

    it("should create a trip, trim the destination, and generate a packing list", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send(validTrip);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.destination).toBe("Barcelona"); // trimmed
      expect(Array.isArray(res.body.PackingItems)).toBe(true);
      expect(res.body.PackingItems.length).toBeGreaterThan(0);

      createdTripId = res.body.id;
      firstItemId = res.body.PackingItems[0].id;
    });
  });

  describe("GET /api/trips", () => {
    it("should return the current user's trips", async () => {
      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((t) => t.id === createdTripId)).toBe(true);
    });

    it("should not leak another user's trips", async () => {
      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe("GET /api/trips/:id", () => {
    it("should return a single trip with its packing items for the owner", async () => {
      const res = await request(app)
        .get(`/api/trips/${createdTripId}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdTripId);
      expect(Array.isArray(res.body.PackingItems)).toBe(true);
    });

    it("should return 404 when another user requests the trip", async () => {
      const res = await request(app)
        .get(`/api/trips/${createdTripId}`)
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/trips/:id/custom-item", () => {
    it("should reject a custom item without name or category", async () => {
      const res = await request(app)
        .post(`/api/trips/${createdTripId}/custom-item`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Camera" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it("should reject a custom item with an invalid quantity", async () => {
      const res = await request(app)
        .post(`/api/trips/${createdTripId}/custom-item`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Camera", category: "Electronics", quantity: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/positive integer/i);
    });

    it("should add a valid custom item marked as custom", async () => {
      const res = await request(app)
        .post(`/api/trips/${createdTripId}/custom-item`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Camera", category: "Electronics", quantity: 1, targetBag: "Backpack" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Camera");
      expect(res.body.isCustom).toBe(true);
    });
  });

  describe("PUT /api/trips/item/:itemId", () => {
    it("should update the packed status of an item", async () => {
      const res = await request(app)
        .put(`/api/trips/item/${firstItemId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ isPacked: true });

      expect(res.status).toBe(200);
      expect(res.body.isPacked).toBe(true);
    });

    it("should not allow another user to update the item", async () => {
      const res = await request(app)
        .put(`/api/trips/item/${firstItemId}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ isPacked: false });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/trips/item/:itemId", () => {
    it("should delete an item belonging to the user's trip", async () => {
      const res = await request(app)
        .delete(`/api/trips/item/${firstItemId}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/removed/i);
    });
  });

  describe("DELETE /api/trips/:id", () => {
    it("should delete the trip for its owner", async () => {
      const res = await request(app)
        .delete(`/api/trips/${createdTripId}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);
    });

    it("should return 404 when deleting an already-removed trip", async () => {
      const res = await request(app)
        .delete(`/api/trips/${createdTripId}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
    });
  });
});
