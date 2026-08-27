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

describe("ensureSchema (Issue #22 / #32 migration)", () => {
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

  it("adds weatherSource and weatherError to a legacy Trips table (Issue #32)", async () => {
    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.removeColumn("Trips", "weatherSource");
    await queryInterface.removeColumn("Trips", "weatherError");
    let described = await queryInterface.describeTable("Trips");
    expect(described.weatherSource).toBeUndefined();
    expect(described.weatherError).toBeUndefined();

    await ensureSchema();

    described = await queryInterface.describeTable("Trips");
    expect(described.weatherSource).toBeDefined();
    expect(described.weatherError).toBeDefined();
  });

  it("adds aiSource and aiError to a legacy Trips table (Issue #30)", async () => {
    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.removeColumn("Trips", "aiSource");
    await queryInterface.removeColumn("Trips", "aiError");
    let described = await queryInterface.describeTable("Trips");
    expect(described.aiSource).toBeUndefined();
    expect(described.aiError).toBeUndefined();

    await ensureSchema();

    described = await queryInterface.describeTable("Trips");
    expect(described.aiSource).toBeDefined();
    expect(described.aiError).toBeDefined();
  });

  it("is a safe no-op when the columns already exist", async () => {
    await expect(ensureSchema()).resolves.toBeUndefined();

    const described = await sequelize.getQueryInterface().describeTable("Trips");
    expect(described.passengerComposition).toBeDefined();
    expect(described.weatherSource).toBeDefined();
    expect(described.weatherError).toBeDefined();
    expect(described.aiSource).toBeDefined();
    expect(described.aiError).toBeDefined();
  });
});
