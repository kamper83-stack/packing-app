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
  vacationType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  weatherData: {
    type: DataTypes.JSON, // SQLite supports JSON columns in modern versions
    allowNull: true,
  },
});

module.exports = Trip;
