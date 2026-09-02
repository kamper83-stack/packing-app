require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { sequelize, User } = require("./models");
const ensureSchema = require("./config/ensureSchema");
const authRoutes = require("./routes/auth");
const tripRoutes = require("./routes/trips");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/admin", adminRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
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
