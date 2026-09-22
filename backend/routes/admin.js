const express = require("express");
const { Op } = require("sequelize");
const { User, Trip, sequelize } = require("../models");
const authMiddleware = require("../middleware/auth");
const adminMiddleware = require("../middleware/admin");
const logStore = require("../services/logStore");

const router = express.Router();
router.use(authMiddleware);
router.use(adminMiddleware);

const WEATHER_PLACEHOLDERS = new Set(["your_weather_api_key_here"]);
const GEMINI_PLACEHOLDERS = new Set(["your_gemini_api_key_here"]);

function keyStatus(raw, placeholders) {
  const key = (raw || "").trim();
  if (!key || placeholders.has(key)) {
    return { configured: false, suffix: null };
  }
  return { configured: true, suffix: key.slice(-4) };
}

// GET /api/admin/status — provider config (never the full key) and last trip provenance.
router.get("/status", async (req, res) => {
  try {
    const useMocks = process.env.USE_MOCKS === "true";
    const weather = keyStatus(process.env.WEATHER_API_KEY, WEATHER_PLACEHOLDERS);
    const gemini = keyStatus(process.env.GEMINI_API_KEY, GEMINI_PLACEHOLDERS);

    const recent = await Trip.findAll({
      attributes: ["weatherSource", "weatherError", "aiSource", "aiError", "updatedAt"],
      order: [["updatedAt", "DESC"]],
      limit: 50,
    });

    const lastWeather = recent.find((trip) => trip.weatherSource);
    const lastWeatherError = recent.find((trip) => trip.weatherError);
    const lastAi = recent.find((trip) => trip.aiSource);
    const lastAiError = recent.find((trip) => trip.aiError);

    res.json({
      useMocks,
      weather: {
        ...weather,
        mode: useMocks || !weather.configured ? "mock" : "live",
        lastSource: lastWeather ? lastWeather.weatherSource : null,
        lastError: lastWeatherError ? lastWeatherError.weatherError : null,
        lastAt: lastWeather ? lastWeather.updatedAt : null,
      },
      gemini: {
        ...gemini,
        mode: useMocks || !gemini.configured ? "mock" : "live",
        lastSource: lastAi ? lastAi.aiSource : null,
        lastError: lastAiError ? lastAiError.aiError : null,
        lastAt: lastAi ? lastAi.updatedAt : null,
      },
    });
  } catch (error) {
    console.error("Admin status error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/admin/users — email, createdAt, trip count. Never passwords.
router.get("/users", async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "email", "isAdmin", "isActive", "createdAt"],
      order: [["createdAt", "ASC"]],
    });
    const counts = await Trip.findAll({
      attributes: ["userId", [sequelize.fn("COUNT", sequelize.col("id")), "tripCount"]],
      group: ["userId"],
      raw: true,
    });
    const countByUser = Object.fromEntries(
      counts.map((row) => [row.userId, Number(row.tripCount)])
    );

    res.json(
      users.map((user) => ({
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        tripCount: countByUser[user.id] || 0,
      }))
    );
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// PATCH /api/admin/users/:id/status — activate or deactivate a user
// (soft-delete: the account and its trips are kept, login and API access
// are just blocked). Body: { isActive: boolean }.
router.patch("/users/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive (boolean) is required." });
    }

    if (!isActive && req.params.id === req.adminUser.id) {
      return res.status(400).json({ error: "You cannot deactivate your own account." });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await user.update({ isActive });
    res.json({ id: user.id, email: user.email, isAdmin: user.isAdmin, isActive: user.isActive });
  } catch (error) {
    console.error("Admin user status error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// DELETE /api/admin/users/:id — permanently remove a user and their trips.
// Intentionally irreversible (explicit product decision, PR #124): this is a
// distinct action from PATCH /users/:id/status above, which stays available
// for a reversible temporary deactivation (blocks login without losing the
// account/trips). Delete is for "remove this user for good".
router.delete("/users/:id", async (req, res) => {
  try {
    if (req.params.id === req.adminUser.id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await Trip.destroy({ where: { userId: user.id } });
    await user.destroy();
    res.json({ message: "User deleted successfully.", id: req.params.id });
  } catch (error) {
    console.error("Admin user delete error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/admin/logs — recent trip provenance / fallback errors.
router.get("/logs", async (req, res) => {
  try {
    const trips = await Trip.findAll({
      where: {
        [Op.or]: [
          { weatherSource: { [Op.ne]: null } },
          { aiSource: { [Op.ne]: null } },
          { weatherError: { [Op.ne]: null } },
          { aiError: { [Op.ne]: null } },
        ],
      },
      attributes: [
        "id",
        "destination",
        "createdAt",
        "weatherSource",
        "weatherError",
        "aiSource",
        "aiError",
      ],
      include: [{ model: User, attributes: ["email"] }],
      order: [["createdAt", "DESC"]],
      limit: 20,
    });

    res.json(
      trips.map((trip) => ({
        id: trip.id,
        destination: trip.destination,
        createdAt: trip.createdAt,
        email: trip.User ? trip.User.email : null,
        weatherSource: trip.weatherSource,
        weatherError: trip.weatherError,
        aiSource: trip.aiSource,
        aiError: trip.aiError,
      }))
    );
  } catch (error) {
    console.error("Admin logs error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/admin/system-logs — operational runtime log (Issue #62): recent API
// request statuses and errors captured in-process. Supports an optional
// ?limit=N and ?level=info|warn|error filter.
router.get("/system-logs", (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100;
    let logs = logStore.list(limit);

    const level = typeof req.query.level === "string" ? req.query.level : "";
    if (["info", "warn", "error"].includes(level)) {
      logs = logs.filter((entry) => entry.level === level);
    }

    res.json({ logs, count: logs.length });
  } catch (error) {
    console.error("Admin system-logs error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
