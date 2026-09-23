const express = require("express");
const router = express.Router();
const { sequelize, Trip, PackingItem } = require("../models");
const authMiddleware = require("../middleware/auth");
const weatherService = require("../services/weatherService");
const geminiService = require("../services/geminiService");
const { SUPPORTED_TARGET_BAGS } = geminiService;
const flightsService = require("../services/flightsService");
const airlines = require("../config/airlines.json");
// Countries -> cities that have a commercial airport (derived from the
// OpenFlights dataset). Powers the create-trip destination picker: choose a
// country, then a city with an airport within it.
const { citiesByCountry: airportCities } = require("../config/airportCities.json");

// Protect all routes
router.use(authMiddleware);

// Flat, case-insensitive lookup of every airport city (across all countries):
// lowercased city -> canonical spelling. Used to validate a submitted
// destination and to store a consistent spelling. First occurrence wins for the
// rare case of the same city name appearing in more than one country.
const canonicalCityByKey = new Map();
for (const country of Object.keys(airportCities)) {
  for (const cityName of airportCities[country]) {
    const key = cityName.trim().toLowerCase();
    if (!canonicalCityByKey.has(key)) canonicalCityByKey.set(key, cityName);
  }
}

// Sorted, de-duplicated flat list of airport-city names (for the legacy
// type-ahead endpoint / Issue #38).
const allAirportCities = [...new Set(canonicalCityByKey.values())].sort((a, b) =>
  a.localeCompare(b)
);

// Resolve a submitted destination to its canonical airport-city spelling, or
// null when the city isn't a recognized airport city.
function canonicalCity(value) {
  if (typeof value !== "string") return null;
  return canonicalCityByKey.get(value.trim().toLowerCase()) || null;
}

// GET /api/trips/locations - Countries and their airport cities for the
// create-trip destination picker (choose a country, then a city with an
// airport). Declared before "/:id" so the literal path isn't read as a trip id.
router.get("/locations", (req, res) => {
  res.json({ citiesByCountry: airportCities });
});

// GET /api/trips/destinations - Flat list of airport cities for type-ahead
// hints (Issue #38). Declared before the "/:id" route so the literal path is
// not captured as a trip id.
router.get("/destinations", (req, res) => {
  res.json({ destinations: allAirportCities });
});

// Returns true when the value is a valid calendar date string (e.g. "2026-08-16").
const isValidDate = (value) => !Number.isNaN(new Date(value).getTime());

// Issue #121: a native <input type="date"> (or a direct API call) can carry
// a wildly implausible year — e.g. a stray old value, or a mistyped 5-digit
// year. Before this, such input was only *indirectly* rejected by the
// 60-day span cap below, with a message ("Trip duration cannot exceed 60
// days") that doesn't explain the real problem. This checks each date's
// year independently against a sane rolling window and reports which field
// failed.
//
// Deliberately NOT "both dates must be in the same calendar year" — that
// would wrongly reject a legitimate trip crossing a New Year boundary (e.g.
// depart 2026-12-28, return 2027-01-03). The 60-day span cap already
// rejects a genuinely year-apart range, so a same-year rule would be both
// redundant and harmful.
const YEAR_WINDOW_YEARS_AHEAD = 2; // currentYear .. currentYear + 2 (final window TBD by team)
function plausibleYearError(fieldLabel, dateStr) {
  const year = new Date(dateStr).getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  const maxYear = currentYear + YEAR_WINDOW_YEARS_AHEAD;
  if (year < currentYear || year > maxYear) {
    return `${fieldLabel} year (${year}) must be between ${currentYear} and ${maxYear}.`;
  }
  return null;
}

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function pastDateError(fieldLabel, dateStr) {
  if (dateStr < todayIsoDate()) {
    return `${fieldLabel} cannot be in the past.`;
  }
  return null;
}

// Audit finding M3: trip creation had no upper bound on trip length or
// number of travelers. A 100-year trip or numPeople: 1000000 was previously
// accepted and produced packing-item quantities in the tens of thousands to
// millions (these values feed directly into Gemini's prompt and the mock
// item generator, e.g. quantity = days * numPeople). These caps keep the
// data volume and any live Gemini calls proportional to an actual trip.
const MAX_TRIP_DAYS = 60;
const MAX_NUM_PEOPLE = 20;

// Shared validation for packing-item fields (audit findings H1 and M4).
// `name`/`category` must be non-empty strings within a sane length; `quantity`
// a positive integer; `targetBag` from the same allowlist Gemini output is
// validated against, so a client can never write a bag value the rest of the
// app doesn't understand. Returns an error message string, or null when the
// provided fields (only the ones present in `fields` are checked) are valid.
const MAX_TEXT_FIELD_LENGTH = 200;
function validateItemFields({ name, category, quantity, targetBag, isPacked }) {
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "" || name.length > MAX_TEXT_FIELD_LENGTH) {
      return "name must be a non-empty string.";
    }
  }
  if (category !== undefined) {
    if (
      typeof category !== "string" ||
      category.trim() === "" ||
      category.length > MAX_TEXT_FIELD_LENGTH
    ) {
      return "category must be a non-empty string.";
    }
  }
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {
    return "quantity must be a positive integer.";
  }
  if (targetBag !== undefined && !SUPPORTED_TARGET_BAGS.includes(targetBag)) {
    return `targetBag must be one of: ${SUPPORTED_TARGET_BAGS.join(", ")}.`;
  }
  if (isPacked !== undefined && typeof isPacked !== "boolean") {
    return "isPacked must be a boolean.";
  }
  return null;
}

// GET /api/trips/flights - Search real round-trip flight offers for a route and
// dates. Declared before "/:id" so the literal path isn't read as a trip id.
// Query: destination (required), departDate (required), returnDate (optional).
// The final project always departs from Tel Aviv.
router.get("/flights", async (req, res) => {
  const { destination, departDate, returnDate } = req.query;

  if (!destination || !departDate) {
    return res.status(400).json({ error: "destination and departDate are required." });
  }
  // Audit finding L3: trip creation requires the destination to be a
  // recognized airport city (see canonicalCity below), but this endpoint
  // previously accepted any string, returning mock flight offers for a
  // destination the user could never actually create a trip for. Apply the
  // same validation here for consistency.
  if (!canonicalCity(destination)) {
    return res
      .status(400)
      .json({ error: "Please choose a destination city that has an airport." });
  }
  if (!isValidDate(departDate) || (returnDate && !isValidDate(returnDate))) {
    return res.status(400).json({ error: "Invalid departDate or returnDate." });
  }
  const departYearError = plausibleYearError("departDate", departDate);
  if (departYearError) {
    return res.status(400).json({ error: departYearError });
  }
  if (returnDate) {
    const returnYearError = plausibleYearError("returnDate", returnDate);
    if (returnYearError) {
      return res.status(400).json({ error: returnYearError });
    }
  }
  const departPastError = pastDateError("departDate", departDate);
  if (departPastError) {
    return res.status(400).json({ error: departPastError });
  }
  if (returnDate) {
    const returnPastError = pastDateError("returnDate", returnDate);
    if (returnPastError) {
      return res.status(400).json({ error: returnPastError });
    }
  }
  if (returnDate && new Date(returnDate) < new Date(departDate)) {
    return res.status(400).json({ error: "returnDate cannot be before departDate." });
  }

  try {
    const result = await flightsService.searchFlights({ destination, departDate, returnDate });
    res.json(result);
  } catch (error) {
    console.error("Flight search error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Validates the passenger composition contract (Issue #22): exactly the four
// canonical keys, each a non-negative integer, with at least one passenger in
// total. Returns the validated object or null when invalid.
function validatePassengerComposition(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const keys = ["infants", "children", "women", "men"];
  const counts = {};
  let total = 0;
  for (const key of keys) {
    const count = value[key];
    if (!Number.isInteger(count) || count < 0) {
      return null;
    }
    counts[key] = count;
    total += count;
  }

  // Reject unknown keys so callers cannot smuggle extra fields into storage.
  if (Object.keys(value).length !== keys.length) {
    return null;
  }

  return total >= 1 ? counts : null;
}

// GET /api/trips - Fetch all trips of the user
router.get("/", async (req, res) => {
  try {
    const trips = await Trip.findAll({
      where: { userId: req.user.id },
      order: [["startDate", "ASC"]],
    });
    res.json(trips);
  } catch (error) {
    console.error("Fetch trips error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/trips/:id - Fetch details of a single trip with items
router.get("/:id", async (req, res) => {
  try {
    const trip = await Trip.findOne({
      where: { id: req.params.id, userId: req.user.id },
      include: [PackingItem],
    });
    if (!trip) {
      return res.status(404).json({ error: "Trip not found." });
    }
    res.json(trip);
  } catch (error) {
    console.error("Fetch single trip error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/trips - Create new trip & generate packing list
router.post("/", async (req, res) => {
  const { destination, startDate, endDate, airline, numPeople, passengerComposition, vacationType } = req.body;

  if (!destination || !startDate || !endDate || !airline || !vacationType) {
    return res.status(400).json({ error: "All required fields must be filled." });
  }

  // Audit finding C3: a non-string destination/airline/vacationType passed
  // the truthy check above (e.g. numbers, objects) and then reached
  // `.trim()` further down, unguarded by any try/catch. That threw
  // synchronously inside this async handler, which Express 4 does not turn
  // into an error response — the request just hangs until the client times
  // out, leaking the connection. Reject non-strings up front instead.
  if (
    typeof destination !== "string" ||
    typeof airline !== "string" ||
    typeof vacationType !== "string"
  ) {
    return res
      .status(400)
      .json({ error: "destination, airline, and vacationType must be text." });
  }

  // Validate dates: both must be real dates and the trip cannot end before it starts.
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return res.status(400).json({ error: "Invalid start or end date." });
  }
  const startYearError = plausibleYearError("startDate", startDate);
  if (startYearError) {
    return res.status(400).json({ error: startYearError });
  }
  const endYearError = plausibleYearError("endDate", endDate);
  if (endYearError) {
    return res.status(400).json({ error: endYearError });
  }
  const startPastError = pastDateError("startDate", startDate);
  if (startPastError) {
    return res.status(400).json({ error: startPastError });
  }
  const endPastError = pastDateError("endDate", endDate);
  if (endPastError) {
    return res.status(400).json({ error: endPastError });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ error: "End date cannot be before start date." });
  }
  // Audit finding M3: cap trip duration. Without this an unrealistic span
  // (e.g. 100 years) silently produced packing items with quantities in the
  // tens of thousands.
  const tripDurationDays =
    Math.ceil(Math.abs(new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
  if (tripDurationDays > MAX_TRIP_DAYS) {
    return res
      .status(400)
      .json({ error: `Trip duration cannot exceed ${MAX_TRIP_DAYS} days.` });
  }

  // The destination must be a city that has a commercial airport (in any
  // country). Users pick it from the country/city selector; we validate here
  // too so an unknown place name is rejected rather than silently degrading the
  // weather/flight lookup.
  const cityMatch = canonicalCity(destination);
  if (!cityMatch) {
    return res
      .status(400)
      .json({ error: "Please choose a destination city that has an airport." });
  }

  // Passenger mix (Issue #22): either an explicit valid passengerComposition,
  // or the legacy single numPeople field. Exactly one source of truth.
  let composition;
  let effectiveNumPeople;
  if (passengerComposition !== undefined && numPeople !== undefined) {
    return res.status(400).json({ error: "Provide either numPeople or passengerComposition, not both." });
  } else if (passengerComposition !== undefined) {
    composition = validatePassengerComposition(passengerComposition);
    if (!composition) {
      return res.status(400).json({ error: "Invalid passenger composition." });
    }
    effectiveNumPeople = Object.values(composition).reduce((sum, count) => sum + count, 0);
    // Audit finding M3: cap total travelers, same limit as the numPeople
    // branch below, so both paths into "how many people" enforce the same
    // bound.
    if (effectiveNumPeople > MAX_NUM_PEOPLE) {
      return res
        .status(400)
        .json({ error: `Number of people cannot exceed ${MAX_NUM_PEOPLE}.` });
    }
  } else if (
    numPeople !== undefined &&
    (!Number.isInteger(numPeople) || numPeople < 1 || numPeople > MAX_NUM_PEOPLE)
  ) {
    return res
      .status(400)
      .json({ error: `Number of people must be a positive integer up to ${MAX_NUM_PEOPLE}.` });
  }

  // Persist the canonical airport-city spelling so stored destinations stay
  // consistent regardless of the submitted casing/whitespace.
  const cleanDestination = cityMatch;
  const cleanVacationType = vacationType.trim();
  const cleanAirline = airline.trim();

  try {
    // 1. Fetch weather forecast
    const weatherInfo = await weatherService.getForecast(cleanDestination, startDate, endDate);

    // 2. Fetch baggage allowance for airline (fallback to estimating if not listed)
    const airlineInfo = airlines[cleanAirline] || {
      cabin: { weightKg: 8, dimensionsCm: "Unknown", count: 1 },
      checked: { weightKg: 23, dimensionsCm: "Unknown", count: 1 },
      isEstimated: true,
    };

    // Calculate length of trip
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

    // 3. Call Gemini to generate packing list
    const aiResult = await geminiService.generatePackingList({
      destination: cleanDestination,
      days,
      numPeople: effectiveNumPeople ?? numPeople ?? 1,
      ...(composition ? { passengerComposition: composition } : {}),
      vacationType: cleanVacationType,
      airline: cleanAirline,
      weatherSummary: weatherInfo.forecast,
      baggageAllowance: airlineInfo,
    });

    // 4. Create Trip in DB
    const trip = await Trip.create({
      destination: cleanDestination,
      startDate,
      endDate,
      airline: cleanAirline,
      numPeople: effectiveNumPeople ?? numPeople ?? 1,
      ...(composition ? { passengerComposition: composition } : {}),
      vacationType: cleanVacationType,
      weatherData: weatherInfo.forecast,
      // Issue #32 / #65: persist weather provenance. A distant-future trip is
      // a seasonal climate estimate rather than a live forecast or mock.
      weatherSource: weatherInfo.isSeasonal ? "seasonal" : weatherInfo.isMock ? "mock" : "live",
      weatherError: weatherInfo.error ? String(weatherInfo.error) : null,
      // Issue #30: persist AI generation provenance
      aiSource: aiResult.isMock ? "mock" : "live",
      aiError: aiResult.error ? String(aiResult.error) : null,
      userId: req.user.id,
    });

    // 5. Create Packing Items in DB
    const packingItemsData = aiResult.items.map((item) => ({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      targetBag: item.targetBag || "Suitcase",
      isPacked: false,
      isCustom: false,
      tripId: trip.id,
    }));

    await PackingItem.bulkCreate(packingItemsData);

    // 6. Return trip details with items
    const fullTrip = await Trip.findByPk(trip.id, { include: [PackingItem] });
    res.status(201).json(fullTrip);
  } catch (error) {
    console.error("Create trip & generate list error:", error);
    res.status(500).json({ error: "Failed to create trip and generate packing list." });
  }
});

// PUT /api/trips/:id - Edit trip details and regenerate weather + packing list.
router.put("/:id", async (req, res) => {
  const { destination, startDate, endDate, airline, passengerComposition, vacationType } = req.body;
  if (![destination, startDate, endDate, airline, vacationType].every((value) => typeof value === "string" && value.trim())) {
    return res.status(400).json({ error: "All trip fields must be filled." });
  }
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return res.status(400).json({ error: "Invalid start or end date." });
  }
  const startYearError = plausibleYearError("startDate", startDate);
  const endYearError = plausibleYearError("endDate", endDate);
  // Unlike creating a trip, editing one must not enforce pastDateError: the
  // trip may already be in progress or just finished, and the user should
  // still be able to tweak details and regenerate the packing list for it
  // (PR #124 review). Only implausible years and end-before-start are blocked.
  const dateError = startYearError || endYearError;
  if (dateError) return res.status(400).json({ error: dateError });
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ error: "End date cannot be before start date." });
  }
  const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
  if (days > MAX_TRIP_DAYS) {
    return res.status(400).json({ error: `Trip duration cannot exceed ${MAX_TRIP_DAYS} days.` });
  }
  const cityMatch = canonicalCity(destination);
  if (!cityMatch) return res.status(400).json({ error: "Please choose a destination city that has an airport." });
  const composition = validatePassengerComposition(passengerComposition);
  if (!composition) return res.status(400).json({ error: "Invalid passenger composition." });
  const numPeople = Object.values(composition).reduce((sum, count) => sum + count, 0);
  if (numPeople > MAX_NUM_PEOPLE) {
    return res.status(400).json({ error: `Number of people cannot exceed ${MAX_NUM_PEOPLE}.` });
  }

  try {
    const trip = await Trip.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!trip) return res.status(404).json({ error: "Trip not found." });
    const cleanDestination = cityMatch;
    const cleanAirline = airline.trim();
    const cleanVacationType = vacationType.trim();
    const weatherInfo = await weatherService.getForecast(cleanDestination, startDate, endDate);
    const airlineInfo = airlines[cleanAirline] || {
      cabin: { weightKg: 8, dimensionsCm: "Unknown", count: 1 },
      checked: { weightKg: 23, dimensionsCm: "Unknown", count: 1 },
      isEstimated: true,
    };
    const aiResult = await geminiService.generatePackingList({
      destination: cleanDestination,
      days,
      numPeople,
      passengerComposition: composition,
      vacationType: cleanVacationType,
      airline: cleanAirline,
      weatherSummary: weatherInfo.forecast,
      baggageAllowance: airlineInfo,
    });
    await sequelize.transaction(async (transaction) => {
      await trip.update({
        destination: cleanDestination,
        startDate,
        endDate,
        airline: cleanAirline,
        numPeople,
        passengerComposition: composition,
        vacationType: cleanVacationType,
        weatherData: weatherInfo.forecast,
        weatherSource: weatherInfo.isSeasonal ? "seasonal" : weatherInfo.isMock ? "mock" : "live",
        weatherError: weatherInfo.error ? String(weatherInfo.error) : null,
        aiSource: aiResult.isMock ? "mock" : "live",
        aiError: aiResult.error ? String(aiResult.error) : null,
      }, { transaction });
      await PackingItem.destroy({ where: { tripId: trip.id, isCustom: false }, transaction });
      await PackingItem.bulkCreate(aiResult.items.map((item) => ({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        targetBag: item.targetBag || "Suitcase",
        isPacked: false,
        isCustom: false,
        tripId: trip.id,
      })), { transaction });
    });
    res.json(await Trip.findByPk(trip.id, { include: [PackingItem] }));
  } catch (error) {
    console.error("Update and regenerate trip error:", error);
    res.status(500).json({ error: "Failed to update trip and regenerate packing list." });
  }
});

// POST /api/trips/:id/weather - Refresh weather and regenerate the dependent packing list.
router.post("/:id/weather", async (req, res) => {
  try {
    const trip = await Trip.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!trip) return res.status(404).json({ error: "Trip not found." });

    const weatherInfo = await weatherService.getForecast(trip.destination, trip.startDate, trip.endDate);
    const days = Math.ceil(
      (new Date(trip.endDate) - new Date(trip.startDate)) / (1000 * 60 * 60 * 24)
    ) + 1;
    const airlineInfo = airlines[trip.airline] || {
      cabin: { weightKg: 8, dimensionsCm: "Unknown", count: 1 },
      checked: { weightKg: 23, dimensionsCm: "Unknown", count: 1 },
      isEstimated: true,
    };
    const aiResult = await geminiService.generatePackingList({
      destination: trip.destination,
      days,
      numPeople: trip.numPeople,
      ...(trip.passengerComposition ? { passengerComposition: trip.passengerComposition } : {}),
      vacationType: trip.vacationType,
      airline: trip.airline,
      weatherSummary: weatherInfo.forecast,
      baggageAllowance: airlineInfo,
    });

    await sequelize.transaction(async (transaction) => {
      await trip.update({
        weatherData: weatherInfo.forecast,
        weatherSource: weatherInfo.isSeasonal ? "seasonal" : weatherInfo.isMock ? "mock" : "live",
        weatherError: weatherInfo.error ? String(weatherInfo.error) : null,
        aiSource: aiResult.isMock ? "mock" : "live",
        aiError: aiResult.error ? String(aiResult.error) : null,
      }, { transaction });
      await PackingItem.destroy({ where: { tripId: trip.id, isCustom: false }, transaction });
      await PackingItem.bulkCreate(aiResult.items.map((item) => ({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        targetBag: item.targetBag || "Suitcase",
        isPacked: false,
        isCustom: false,
        tripId: trip.id,
      })), { transaction });
    });

    res.json(await Trip.findByPk(trip.id, { include: [PackingItem] }));
  } catch (error) {
    console.error("Refresh weather error:", error);
    res.status(500).json({ error: "Failed to refresh weather and regenerate packing list." });
  }
});

// DELETE /api/trips/:id - Delete a trip
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Trip.destroy({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!deleted) {
      return res.status(404).json({ error: "Trip not found." });
    }
    res.json({ message: "Trip deleted successfully." });
  } catch (error) {
    console.error("Delete trip error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/trips/:id/custom-item - Add a custom item to a trip
router.post("/:id/custom-item", async (req, res) => {
  const { name, category, quantity, targetBag } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: "Name and category are required." });
  }

  // Audit finding M4: previously only truthiness was checked, so an
  // object/number for name or category slipped past validation and threw
  // inside Sequelize, surfacing as a misleading 500 instead of a 400.
  const validationError = validateItemFields({ name, category, quantity, targetBag });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const trip = await Trip.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!trip) {
      return res.status(404).json({ error: "Trip not found." });
    }

    const newItem = await PackingItem.create({
      name,
      category,
      quantity: quantity || 1,
      targetBag: targetBag || "Suitcase",
      isPacked: false,
      isCustom: true,
      tripId: trip.id,
    });

    res.status(201).json(newItem);
  } catch (error) {
    console.error("Add custom item error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// PUT /api/items/:itemId - Update packed status or details of packing item
router.put("/item/:itemId", async (req, res) => {
  const { isPacked, quantity, targetBag } = req.body;

  // Audit finding H1: this endpoint previously persisted whatever was sent
  // with no validation at all — negative quantities, arbitrary strings in
  // targetBag (including script tags), and non-boolean isPacked values were
  // all accepted and saved. Validate every provided field up front.
  const validationError = validateItemFields({ isPacked, quantity, targetBag });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const item = await PackingItem.findByPk(req.params.itemId, {
      include: [
        {
          model: Trip,
          where: { userId: req.user.id },
        },
      ],
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found." });
    }

    if (isPacked !== undefined) item.isPacked = isPacked;
    if (quantity !== undefined) item.quantity = quantity;
    if (targetBag !== undefined) item.targetBag = targetBag;

    await item.save();
    res.json(item);
  } catch (error) {
    console.error("Update item error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// DELETE /api/items/:itemId - Delete an item from packing list
router.delete("/item/:itemId", async (req, res) => {
  try {
    const item = await PackingItem.findByPk(req.params.itemId, {
      include: [
        {
          model: Trip,
          where: { userId: req.user.id },
        },
      ],
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found or unauthorized." });
    }

    await item.destroy();
    res.json({ message: "Item removed successfully." });
  } catch (error) {
    console.error("Delete item error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/airlines - Fetch airline limits
router.get("/config/airlines", (req, res) => {
  res.json(airlines);
});

module.exports = router;
