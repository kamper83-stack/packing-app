const User = require("./User");
const Trip = require("./Trip");
const PackingItem = require("./PackingItem");
const sequelize = require("../config/database");

// Define relationships
User.hasMany(Trip, { foreignKey: "userId", onDelete: "CASCADE" });
Trip.belongsTo(User, { foreignKey: "userId" });

Trip.hasMany(PackingItem, { foreignKey: "tripId", onDelete: "CASCADE" });
PackingItem.belongsTo(Trip, { foreignKey: "tripId" });

module.exports = {
  sequelize,
  User,
  Trip,
  PackingItem,
};
