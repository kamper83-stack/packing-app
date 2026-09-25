const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Trip = sequelize.define("Trip", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  destination: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  airline: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  numPeople: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  passengerComposition: {
    type: DataTypes.JSON, // { infants, children, women, men } — Issue #22
    allowNull: true,
  },
  // How many trolley/checked suitcases the travelers are bringing on this
  // trip. A separate cabin backpack per traveler is a fixed working
  // assumption (not stored — always derived as numPeople), not a user input.
  // Both feed the packing-list quantity constraints in geminiService.
  trolleyCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  checkedSuitcaseCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  vacationType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  weatherData: {
    type: DataTypes.JSON, // forecast array — kept as-is for existing TripView
    allowNull: true,
  },
  // Distinguish live Google Weather, seasonal estimates, and mock/fallback
  // without changing the weatherData array shape (legacy trips stay readable).
  weatherSource: {
    type: DataTypes.STRING, // "live" | "seasonal" | "mixed" | "mock" | null (pre-#32 rows)
    allowNull: true,
  },
  weatherError: {
    type: DataTypes.STRING, // set only when a live call failed and we fell back
    allowNull: true,
  },
  weatherProvider: {
    type: DataTypes.STRING, // "google" | "seasonal" | "mixed" | "mock" | null for legacy rows
    allowNull: true,
  },
  weatherFetchedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Issue #30: distinguish live Gemini AI generation from mock/fallback template.
  aiSource: {
    type: DataTypes.STRING, // "live" | "mock" | null (pre-#30 rows)
    allowNull: true,
  },
  aiError: {
    type: DataTypes.STRING, // set only when a live AI call failed and we fell back
    allowNull: true,
  },
});

module.exports = Trip;
