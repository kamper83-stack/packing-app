const express = require("express");
const router = express.Router();
const { Trip, PackingItem } = require("../models");
const authMiddleware = require("../middleware/auth");
const weatherService = require("../services/weatherService");
const geminiService = require("../services/geminiService");
const airlines = require("../config/airlines.json");

// Protect all routes
router.use(authMiddleware);

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
  const { destination, startDate, endDate, airline, numPeople, vacationType } = req.body;

  if (!destination || !startDate || !endDate || !airline || !vacationType) {
    return res.status(400).json({ error: "All required fields must be filled." });
  }

  try {
    // 1. Fetch weather forecast
    const weatherInfo = await weatherService.getForecast(destination, startDate, endDate);

    // 2. Fetch baggage allowance for airline (fallback to estimating if not listed)
    const airlineInfo = airlines[airline] || {
      cabin: { weightKg: 8, dimensionsCm: "Unknown", count: 1 },
      checked: { weightKg: 23, dimensionsCm: "Unknown", count: 1 },
      isEstimated: true,
    };

    // Calculate length of trip
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

    // 3. Call Gemini to generate packing list
    const generatedItems = await geminiService.generatePackingList({
      destination,
      days,
      numPeople: numPeople || 1,
      vacationType,
      airline,
      weatherSummary: weatherInfo.forecast,
      baggageAllowance: airlineInfo,
    });

    // 4. Create Trip in DB
    const trip = await Trip.create({
      destination,
      startDate,
      endDate,
      airline,
      numPeople: numPeople || 1,
      vacationType,
      weatherData: weatherInfo.forecast,
      userId: req.user.id,
    });

    // 5. Create Packing Items in DB
    const packingItemsData = generatedItems.map((item) => ({
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
