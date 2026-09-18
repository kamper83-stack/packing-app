require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { sequelize, User } = require("./models");
const ensureSchema = require("./config/ensureSchema");
const authRoutes = require("./routes/auth");
const tripRoutes = require("./routes/trips");
const adminRoutes = require("./routes/admin");
const requestLogger = require("./middleware/requestLogger");

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());
// Issue #62: capture runtime API activity for the Admin operational log viewer.
app.use(requestLogger);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/admin", adminRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});

// Global error handler (audit finding C3): Express 4 does not automatically
// catch a rejection/throw from an async route handler, so without this a
// bug in a handler (e.g. calling .trim() on a non-string) hangs the request
// and its socket forever instead of returning a response. Any error that
// reaches here (via next(err), or one Express itself catches synchronously)
// gets a clean 500 instead of leaking internals or leaving the client
// hanging. Must be registered last, after all routes.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[SERVER] Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error." });
});

// Issue #49: promote ADMIN_EMAIL to isAdmin on boot if that user already exists.
async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) return;
  const user = await User.findOne({ where: { email } });
  if (user && !user.isAdmin) {
    await user.update({ isAdmin: true });
    console.log(`[AUTH] Promoted ${email} to admin.`);
  }
}

// Start DB & Server
async function startServer() {
  try {
    // Sync Database
    await sequelize.sync({ force: false }); // Change to true to reset database schema
    // sync({ force: false }) creates missing tables but never ALTERs existing
    // ones, so reconcile columns added after the DB was first provisioned.
    await ensureSchema();
    await seedAdmin();
    console.log("[DB] SQLite database synchronized successfully.");

    app.listen(PORT, () => {
      console.log(`[SERVER] Express server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("[SERVER] Failed to start server:", error);
    process.exit(1);
  }
}

// Only auto-start when run directly (e.g. `node server.js`), so tests can
// import the Express app without opening a listening socket.
if (require.main === module) {
  startServer();
}

module.exports = app;
