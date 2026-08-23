// Verifies the idempotent schema reconciliation added for Issue #22: on a
// database provisioned before the passengerComposition column existed,
// ensureSchema() must add it, and it must be a no-op when already present.
process.env.USE_MOCKS = "true";

const { sequelize } = require("../models");
const ensureSchema = require("../config/ensureSchema");

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe("ensureSchema (Issue #22 migration)", () => {
  it("adds passengerComposition to a legacy Trips table that lacks it", async () => {
    const queryInterface = sequelize.getQueryInterface();

    // Simulate a pre-#22 database by dropping the column.
    await queryInterface.removeColumn("Trips", "passengerComposition");
    let described = await queryInterface.describeTable("Trips");
    expect(described.passengerComposition).toBeUndefined();

    await ensureSchema();

    described = await queryInterface.describeTable("Trips");
    expect(described.passengerComposition).toBeDefined();
  });

  it("is a safe no-op when the column already exists", async () => {
    await expect(ensureSchema()).resolves.toBeUndefined();

    const described = await sequelize.getQueryInterface().describeTable("Trips");
    expect(described.passengerComposition).toBeDefined();
  });
});
