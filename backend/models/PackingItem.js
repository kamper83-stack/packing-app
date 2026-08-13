const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PackingItem = sequelize.define("PackingItem", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  isPacked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  targetBag: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Suitcase",
  },
  isCustom: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

module.exports = PackingItem;
