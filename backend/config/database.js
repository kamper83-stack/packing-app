const { Sequelize } = require("sequelize");
const path = require("path");
const fs = require("fs");

const isTest = process.env.NODE_ENV === "test";

// In test mode use an isolated in-memory database so the suite never touches
// the real on-disk data. Otherwise persist to the SQLite file (created on demand).
let storage = ":memory:";
if (!isTest) {
  const dbDir = path.join(__dirname, "../data");
  // Create data directory if it doesn't exist (important for Docker volumes)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  storage = path.join(dbDir, "database.sqlite");
}

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage,
  logging: false,
});

module.exports = sequelize;
