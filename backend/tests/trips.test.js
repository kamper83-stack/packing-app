// Force mock mode for the weather and AI services so the suite never makes
// external network calls, and run against the in-memory test database.
process.env.USE_MOCKS = "true";

const request = require("supertest");
const app = require("../server");
const { sequelize, PackingItem } = require("../models");
const weatherService = require("../services/weatherService");
const geminiService = require("../services/geminiService");

jest.useFakeTimers().setSystemTime(new Date("2026-08-31T12:00:00Z"));

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

afterEach(() => {
  jest.restoreAllMocks();
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
  let editableTripId = "";
  let editableCustomItemId = "";
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

    // Audit finding C3: a non-string value for destination/airline/
    // vacationType previously passed the truthy check above and then hit an
    // unguarded `.trim()`, hanging the request instead of returning an error.
    it.each([
      { field: "destination", value: 5 },
      { field: "airline", value: { a: 1 } },
      { field: "vacationType", value: ["Beach"] },
    ])("should reject a non-string $field with a 400 instead of hanging", async ({ field, value }) => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...validTrip, [field]: value });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/must be text/i);
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

    // Audit finding M3: previously no upper bound existed on numPeople or
    // trip duration, so unrealistic values produced packing-item quantities
    // in the tens of thousands to millions.
    it("should reject a numPeople above the cap", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...validTrip, numPeople: 1000000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/up to 20|cannot exceed/i);
    });

    it("should reject a passengerComposition total above the cap", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Rome",
          startDate: "2026-10-01",
          endDate: "2026-10-05",
          airline: "EL AL",
          vacationType: "City",
          passengerComposition: { infants: 0, children: 0, women: 15, men: 10 },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot exceed/i);
    });

    it("should reject a trip duration above the cap", async () => {
      // Both years plausible (same year) so this isolates the 60-day span
      // cap from the year-plausibility check (Issue #121) below.
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...validTrip, startDate: "2026-09-01", endDate: "2026-12-01" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/duration cannot exceed/i);
    });

    it("rejects a trip whose start date has already passed", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...validTrip, startDate: "2026-07-31", endDate: "2026-08-02" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/startDate cannot be in the past/i);
    });

    // Issue #121: implausible years should be rejected with a dedicated,
    // field-specific message instead of slipping through and only being
    // (mis)reported as a duration-cap violation.
    describe("year plausibility (Issue #121)", () => {
      const currentYear = new Date().getUTCFullYear();

      it("rejects a startDate year that is too far in the past", async () => {
        const res = await request(app)
          .post("/api/trips")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({
            ...validTrip,
            startDate: `${currentYear - 1}-06-01`,
            endDate: `${currentYear - 1}-06-05`,
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/startDate year/i);
      });

      it("rejects an endDate year that is too far in the future", async () => {
        const res = await request(app)
          .post("/api/trips")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({
            ...validTrip,
            startDate: `${currentYear}-06-01`,
            endDate: `${currentYear + 3}-06-05`,
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/endDate year/i);
      });

      it("accepts a valid trip that crosses a New Year boundary within the 60-day span cap", async () => {
        const res = await request(app)
          .post("/api/trips")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({
            ...validTrip,
            startDate: `${currentYear}-12-28`,
            endDate: `${currentYear + 1}-01-03`,
          });

        expect(res.status).toBe(201);
      });
    });

    it("should reject creation with both numPeople and passengerComposition (Issue #22)", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          ...validTrip,
          numPeople: 2,
          passengerComposition: { infants: 0, children: 1, women: 1, men: 0 },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not both/i);
    });

    it("should accept a mixed passenger composition and derive the total (Issue #22)", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Rome",
          startDate: "2026-10-01",
          endDate: "2026-10-05",
          airline: "EL AL",
          vacationType: "City",
          passengerComposition: { infants: 1, children: 2, women: 1, men: 1 },
        });

      expect(res.status).toBe(201);
      expect(res.body.passengerComposition).toEqual({ infants: 1, children: 2, women: 1, men: 1 });
      expect(res.body.numPeople).toBe(5); // derived total
      expect(Array.isArray(res.body.PackingItems)).toBe(true);
      expect(res.body.PackingItems.length).toBeGreaterThan(0);
    });

    it.each([
      { description: "a fractional count", composition: { infants: 0, children: 1.5, women: 1, men: 0 } },
      { description: "a negative count", composition: { infants: -1, children: 1, women: 1, men: 1 } },
      { description: "an all-zero composition", composition: { infants: 0, children: 0, women: 0, men: 0 } },
      { description: "an unknown key", composition: { infants: 1, children: 1, women: 1, men: 1, pets: 2 } },
      { description: "a missing key", composition: { infants: 1, women: 1, men: 1 } },
      { description: "a non-object payload", composition: "5 people" },
    ])("should reject $description in passengerComposition", async ({ composition }) => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Rome",
          startDate: "2026-10-01",
          endDate: "2026-10-05",
          airline: "EL AL",
          vacationType: "City",
          passengerComposition: composition,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/passenger composition/i);
    });

    it("should reject a destination city that has no airport", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Atlantis",
          startDate: "2026-09-01",
          endDate: "2026-09-05",
          airline: "EL AL",
          numPeople: 1,
          vacationType: "Beach",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/airport/i);
    });

    it("accepts an airport city case-insensitively and stores canonical casing", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "  paris  ",
          startDate: "2026-09-01",
          endDate: "2026-09-03",
          airline: "EL AL",
          numPeople: 1,
          vacationType: "City",
        });

      expect(res.status).toBe(201);
      expect(res.body.destination).toBe("Paris"); // canonical catalog spelling
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
      // Explicit mock mode (USE_MOCKS=true) persists mock provenance (Issue #32).
      expect(res.body.weatherSource).toBe("mock");
      expect(res.body.weatherError).toBeNull();
      expect(Array.isArray(res.body.weatherData)).toBe(true);
      expect(res.body.weatherData.length).toBeGreaterThan(0);

      createdTripId = res.body.id;
      firstItemId = res.body.PackingItems[0].id;
    });

    it("still creates the trip when live weather fails, marked as mock fallback (Issue #32)", async () => {
      jest.spyOn(weatherService, "getForecast").mockResolvedValueOnce({
        forecast: [{ date: "2026-09-01", tempC: 20, condition: "Mild" }],
        isMock: true,
        error: "Request failed with status code 401",
      });

      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Athens",
          startDate: "2026-11-01",
          endDate: "2026-11-03",
          airline: "EL AL",
          numPeople: 1,
          vacationType: "City",
        });

      expect(res.status).toBe(201);
      expect(res.body.weatherSource).toBe("mock");
      expect(res.body.weatherError).toMatch(/401/);
      expect(res.body.weatherData).toEqual([
        { date: "2026-09-01", tempC: 20, condition: "Mild" },
      ]);
    });

    it("persists live provenance when WeatherAPI succeeds (Issue #32)", async () => {
      jest.spyOn(weatherService, "getForecast").mockResolvedValueOnce({
        forecast: [{ date: "2026-09-01", tempC: 18, condition: "Sunny" }],
        isMock: false,
      });

      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Lisbon",
          startDate: "2026-11-10",
          endDate: "2026-11-12",
          airline: "EL AL",
          numPeople: 1,
          vacationType: "City",
        });

      expect(res.status).toBe(201);
      expect(res.body.weatherSource).toBe("live");
      expect(res.body.weatherError).toBeNull();
      expect(res.body.weatherData).toEqual([
        { date: "2026-09-01", tempC: 18, condition: "Sunny" },
      ]);
    });

    it("still creates the trip when live AI fails, marked as mock fallback (Issue #30)", async () => {
      jest.spyOn(geminiService, "generatePackingList").mockResolvedValueOnce({
        items: [{ name: "Toothbrush", category: "Toiletries", quantity: 1, targetBag: "Backpack" }],
        isMock: true,
        error: "429 Resource Exhausted",
      });

      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Tokyo",
          startDate: "2026-11-20",
          endDate: "2026-11-22",
          airline: "EL AL",
          numPeople: 1,
          vacationType: "City",
        });

      expect(res.status).toBe(201);
      expect(res.body.aiSource).toBe("mock");
      expect(res.body.aiError).toMatch(/429/);
      expect(res.body.PackingItems).toHaveLength(1);
    });

    it("persists live AI provenance when Gemini succeeds (Issue #30)", async () => {
      jest.spyOn(geminiService, "generatePackingList").mockResolvedValueOnce({
        items: [
          { name: "Camera", category: "Electronics", quantity: 1, targetBag: "Backpack" },
          { name: "Kimono", category: "Clothing", quantity: 1, targetBag: "Suitcase" },
        ],
        isMock: false,
      });

      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Tokyo",
          startDate: "2026-11-25",
          endDate: "2026-11-28",
          airline: "EL AL",
          numPeople: 1,
          vacationType: "Cultural",
        });

      expect(res.status).toBe(201);
      expect(res.body.aiSource).toBe("live");
      expect(res.body.aiError).toBeNull();
      expect(res.body.PackingItems).toHaveLength(2);
    });

    it("marks a distant-future trip as a seasonal climate estimate (Issue #65)", async () => {
      const DAY = 24 * 60 * 60 * 1000;
      const iso = (d) => new Date(d).toISOString().split("T")[0];
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Rome",
          startDate: iso(Date.now() + 60 * DAY),
          endDate: iso(Date.now() + 63 * DAY),
          airline: "EL AL",
          numPeople: 1,
          vacationType: "City",
        });

      expect(res.status).toBe(201);
      expect(res.body.weatherSource).toBe("seasonal");
      expect(res.body.weatherError).toBeNull();
      expect(Array.isArray(res.body.weatherData)).toBe(true);
      expect(res.body.weatherData.length).toBeGreaterThan(0);
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

  describe("PUT /api/trips/:id", () => {
    const editedTrip = {
      destination: "Rome",
      startDate: "2026-10-15",
      endDate: "2026-10-15",
      airline: "Wizz Air",
      passengerComposition: { infants: 0, children: 2, women: 0, men: 2 },
      vacationType: "City Trip",
    };

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          destination: "Barcelona",
          startDate: "2026-10-10",
          endDate: "2026-10-12",
          airline: "EL AL",
          passengerComposition: { infants: 0, children: 0, women: 1, men: 0 },
          vacationType: "City Trip",
        });
      editableTripId = res.body.id;
      const customRes = await request(app)
        .post(`/api/trips/${editableTripId}/custom-item`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          name: "Medication",
          category: "Health",
          quantity: 1,
          targetBag: "Backpack",
        });
      editableCustomItemId = customRes.body.id;
    });

    it("updates the trip and regenerates weather and a duration-aware packing list", async () => {
      const generationSpy = jest.spyOn(geminiService, "generatePackingList");

      const res = await request(app)
        .put(`/api/trips/${editableTripId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send(editedTrip);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          id: editableTripId,
          destination: "Rome",
          startDate: "2026-10-15",
          endDate: "2026-10-15",
          airline: "Wizz Air",
          numPeople: 4,
          passengerComposition: editedTrip.passengerComposition,
          vacationType: "City Trip",
        })
      );
      expect(generationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: "Rome",
          days: 1,
          numPeople: 4,
          passengerComposition: editedTrip.passengerComposition,
          vacationType: "City Trip",
          airline: "Wizz Air",
          weatherSummary: expect.any(Array),
          baggageAllowance: expect.objectContaining({ cabin: expect.any(Object) }),
        })
      );
      const itemNames = res.body.PackingItems.map((item) => item.name);
      expect(itemNames).not.toContain("Underwear");
      expect(itemNames).toContain("Medication");
      expect(res.body.PackingItems).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: editableCustomItemId, isCustom: true })])
      );
    });

    it("does not allow another user to edit the trip", async () => {
      const res = await request(app)
        .put(`/api/trips/${editableTripId}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send(editedTrip);

      expect(res.status).toBe(404);
    });

    it("rolls back trip and item changes if regenerated items cannot be persisted", async () => {
      const before = await request(app)
        .get(`/api/trips/${editableTripId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      jest.spyOn(PackingItem, "bulkCreate").mockRejectedValueOnce(new Error("write failed"));

      const res = await request(app)
        .put(`/api/trips/${editableTripId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...editedTrip, destination: "Paris" });

      expect(res.status).toBe(500);
      const after = await request(app)
        .get(`/api/trips/${editableTripId}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(after.body.destination).toBe(before.body.destination);
      expect(after.body.PackingItems.map((item) => item.id).sort()).toEqual(
        before.body.PackingItems.map((item) => item.id).sort()
      );
    });
  });

  describe("POST /api/trips/:id/weather", () => {
    it("refreshes weather and regenerates the packing list from the new forecast", async () => {
      const forecast = [{ date: "2026-10-15", tempC: 9, condition: "Rain" }];
      const weatherSpy = jest.spyOn(weatherService, "getForecast").mockResolvedValueOnce({
        forecast,
        isMock: false,
      });
      const generationSpy = jest.spyOn(geminiService, "generatePackingList").mockResolvedValueOnce({
        items: [
          { name: "Rain Jacket", category: "Clothing", quantity: 4, targetBag: "Suitcase" },
        ],
        isMock: false,
      });

      const res = await request(app)
        .post(`/api/trips/${editableTripId}/weather`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(weatherSpy).toHaveBeenCalledWith("Rome", "2026-10-15", "2026-10-15");
      expect(generationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: "Rome",
          days: 1,
          numPeople: 4,
          passengerComposition: { infants: 0, children: 2, women: 0, men: 2 },
          vacationType: "City Trip",
          airline: "Wizz Air",
          weatherSummary: forecast,
          baggageAllowance: expect.objectContaining({ cabin: expect.any(Object) }),
        })
      );
      expect(res.body.weatherData).toEqual(forecast);
      expect(res.body.weatherSource).toBe("live");
      expect(res.body.aiSource).toBe("live");
      expect(res.body.PackingItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Rain Jacket", quantity: 4, isCustom: false }),
          expect.objectContaining({ id: editableCustomItemId, name: "Medication", isCustom: true }),
        ])
      );
    });

    it("does not allow another user to refresh the trip weather", async () => {
      const res = await request(app)
        .post(`/api/trips/${editableTripId}/weather`)
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

    // Audit finding M4: a non-string name/category previously threw inside
    // Sequelize and surfaced as a misleading 500 instead of a 400.
    it("should reject a non-string name with a 400 instead of a 500", async () => {
      const res = await request(app)
        .post(`/api/trips/${createdTripId}/custom-item`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: { evil: 1 }, category: "Electronics" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/name must be/i);
    });

    it("should reject an unsupported targetBag", async () => {
      const res = await request(app)
        .post(`/api/trips/${createdTripId}/custom-item`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Camera", category: "Electronics", targetBag: "Trunk" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/targetBag must be one of/i);
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

    // Audit finding H1: previously any value was persisted with no
    // validation at all.
    it("should reject a negative quantity", async () => {
      const res = await request(app)
        .put(`/api/trips/item/${firstItemId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ quantity: -999 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/positive integer/i);
    });

    it("should reject a targetBag outside the supported allowlist", async () => {
      const res = await request(app)
        .put(`/api/trips/item/${firstItemId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ targetBag: "<script>alert(1)</script>" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/targetBag must be one of/i);
    });

    it("should reject a non-boolean isPacked value", async () => {
      const res = await request(app)
        .put(`/api/trips/item/${firstItemId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ isPacked: "not-a-bool" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/isPacked must be a boolean/i);
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
