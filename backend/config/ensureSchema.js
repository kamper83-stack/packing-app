const { DataTypes } = require("sequelize");
const sequelize = require("./database");

// Lightweight, idempotent schema reconciliation for columns that were added
// after a database was first provisioned. `sequelize.sync({ force: false })`
// creates missing tables but never ALTERs existing ones, so on an already
// deployed SQLite file a newly added column (e.g. Issue #22's
// passengerComposition) would be absent and inserts would fail with
// "no such column". This runs after sync and adds only the missing columns.
//
// Each entry is safe to run repeatedly: we describe the table first and add a
// column only when it is not already present.
const COLUMNS_TO_ENSURE = [
  {
    table: "Trips",
    column: "passengerComposition",
    definition: { type: DataTypes.JSON, allowNull: true }, // Issue #22
  },
  {
    table: "Trips",
    column: "weatherSource",
    definition: { type: DataTypes.STRING, allowNull: true }, // Issue #32
  },
  {
    table: "Trips",
    column: "weatherError",
    definition: { type: DataTypes.STRING, allowNull: true }, // Issue #32
  },
];

async function ensureSchema() {
  const queryInterface = sequelize.getQueryInterface();

  for (const { table, column, definition } of COLUMNS_TO_ENSURE) {
    let described;
    try {
      described = await queryInterface.describeTable(table);
    } catch (error) {
      // Table does not exist yet (fresh DB) — sync() will have created it with
      // the column already, so there is nothing to reconcile here.
      continue;
    }

    if (!described[column]) {
      await queryInterface.addColumn(table, column, definition);
      console.log(`[DB] Added missing column ${table}.${column}.`);
    }
  }
}

module.exports = ensureSchema;
