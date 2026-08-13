require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { sequelize } = require("./models");
const authRoutes = require("./routes/auth");
const tripRoutes = require("./routes/trips");

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});

// Start DB & Server
async function startServer() {
  try {
    // Sync Database
    await sequelize.sync({ force: false }); // Change to true to reset database schema
    console.log("[DB] SQLite database synchronized successfully.");

    app.listen(PORT, () => {
      console.log(`[SERVER] Express server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("[SERVER] Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
