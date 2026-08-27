// Unit tests for the Gemini packing-list service (Issue #8).
//
// These run fully offline: "mock mode" is exercised directly, and the real
// Gemini API path is verified against a mocked @google/generative-ai SDK, so
// the suite never makes a network call or needs a real GEMINI_API_KEY.

// A single controllable stand-in for model.generateContent(). Referenced inside
// the jest.mock factory below (allowed because the name is `mock*`-prefixed).
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({ generateContent: mockGenerateContent }));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

const { generatePackingList, validatePackingItems } = require("../services/geminiService");

// The two env vars the service reads. Snapshot them so tests start clean and
// the surrounding process env is restored afterwards.
const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  // Keep the suite output quiet; the service logs on every call and on fallback.
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

beforeEach(() => {
  mockGenerateContent.mockReset();
  mockGetGenerativeModel.mockClear();
  // Default each test to deterministic mock mode; real-path tests opt out.
  delete process.env.GEMINI_API_KEY;
  process.env.USE_MOCKS = "true";
});

afterAll(() => {
  jest.restoreAllMocks();
  process.env = ORIGINAL_ENV;
});

const baseArgs = {
  destination: "Barcelona",
  days: 5,
  numPeople: 2,
  vacationType: "City Trip",
  airline: "EL AL",
  weatherSummary: [{ date: "2026-09-01", tempC: 22, condition: "Sunny" }],
  baggageAllowance: { cabin: { weightKg: 8 } },
};

describe("geminiService.generatePackingList - mock mode", () => {
  it("returns a non-empty array where every item matches the item schema", async () => {
    const result = await generatePackingList(baseArgs);

    expect(result.isMock).toBe(true);
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(typeof item.name).toBe("string");
      expect(typeof item.category).toBe("string");
      expect(Number.isInteger(item.quantity)).toBe(true);
      expect(["Suitcase", "Backpack"]).toContain(item.targetBag);
    }
    // Mock mode must never touch the real SDK.
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("scales quantities by days and number of people", async () => {
    const result = await generatePackingList({ ...baseArgs, days: 5, numPeople: 2 });
    const byName = Object.fromEntries(result.items.map((i) => [i.name, i]));

    expect(byName.Underwear.quantity).toBe(10); // days * numPeople = 5 * 2
    expect(byName.Socks.quantity).toBe(10);
    expect(byName.Shirts.quantity).toBe(Math.ceil(5 * 1.2) * 2); // 12
    expect(byName.Pants.quantity).toBe(Math.ceil(5 / 2) * 2); // 6
    expect(byName.Toothpaste.quantity).toBe(1); // fixed, independent of people
  });

  it("adds beach-specific gear for a beach vacation (case-insensitive)", async () => {
    const result = await generatePackingList({ ...baseArgs, vacationType: "BEACH Getaway" });
    const names = result.items.map((i) => i.name);

    expect(names).toEqual(
      expect.arrayContaining(["Swimsuit", "Sunscreen", "Sunglasses", "Beach Towel"])
    );
    expect(names).not.toContain("Winter Coat");
  });

  it("adds winter gear for a winter/snow vacation", async () => {
    const result = await generatePackingList({ ...baseArgs, vacationType: "Snow trip" });
    const names = result.items.map((i) => i.name);

    expect(names).toEqual(
      expect.arrayContaining(["Winter Coat", "Thermal Underwear", "Gloves & Beanie", "Lip Balm"])
    );
  });

  it("adds hiking gear for a hike/active vacation", async () => {
    const result = await generatePackingList({ ...baseArgs, vacationType: "Active hiking tour" });
    const names = result.items.map((i) => i.name);

    expect(names).toEqual(
      expect.arrayContaining(["Hiking Boots", "Water Bottle", "First Aid Kit", "Rain Jacket"])
    );
  });

  it("returns only the base list for a generic vacation type", async () => {
    const result = await generatePackingList({ ...baseArgs, vacationType: "City Trip" });
    const names = result.items.map((i) => i.name);

    expect(names).not.toContain("Swimsuit");
    expect(names).not.toContain("Winter Coat");
    expect(names).not.toContain("Hiking Boots");
    expect(result.items).toHaveLength(9); // the nine base items only
  });

  it("uses mock mode when no API key is set, even if USE_MOCKS is unset", async () => {
    delete process.env.USE_MOCKS;
    delete process.env.GEMINI_API_KEY;

    const result = await generatePackingList(baseArgs);

    expect(result.isMock).toBe(true);
    expect(result.items.map((i) => i.name)).toContain("Underwear");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe("geminiService.generatePackingList - real API path (mocked SDK)", () => {
  const enableRealPath = () => {
    process.env.USE_MOCKS = "false";
    process.env.GEMINI_API_KEY = "test-key";
  };

  it("parses and returns the JSON array from the model response", async () => {
    enableRealPath();
    const aiItems = [
      { name: "Camera", category: "Electronics", quantity: 1, targetBag: "Backpack" },
      { name: "Novel", category: "Leisure", quantity: 2, targetBag: "Suitcase" },
    ];
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(aiItems) },
    });

    const result = await generatePackingList(baseArgs);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: "gemini-3.5-flash-lite" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.isMock).toBe(false);
    expect(result.items).toEqual(aiItems);
  });

  it("falls back to the mock list when the Gemini API call throws", async () => {
    enableRealPath();
    mockGenerateContent.mockRejectedValue(new Error("network down"));

    const result = await generatePackingList(baseArgs);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.isMock).toBe(true);
    expect(result.error).toBe("network down");
    // Fallback returns the deterministic mock list, so the trip still gets items.
    expect(result.items.map((i) => i.name)).toContain("Underwear");
  });

  it("falls back to the mock list when the model returns invalid JSON", async () => {
    enableRealPath();
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "not-json{" },
    });

    const result = await generatePackingList(baseArgs);

    // JSON.parse throws -> caught -> mock fallback.
    expect(result.isMock).toBe(true);
    expect(typeof result.error).toBe("string");
    expect(result.items.map((i) => i.name)).toContain("Underwear");
  });

  // Issue #34: valid JSON that is not a valid packing list must not be
  // persisted — it is routed through the same mock fallback as a failed call.
  it.each([
    { label: "an empty array", output: [] },
    { label: "a non-array object", output: { name: "Camera" } },
    { label: "an item missing required fields", output: [{ name: "Camera" }] },
    {
      label: "a non-integer quantity",
      output: [{ name: "Camera", category: "Electronics", quantity: 1.5, targetBag: "Backpack" }],
    },
    {
      label: "a non-positive quantity",
      output: [{ name: "Camera", category: "Electronics", quantity: 0, targetBag: "Backpack" }],
    },
    {
      label: "an unsupported targetBag",
      output: [{ name: "Camera", category: "Electronics", quantity: 1, targetBag: "Trunk" }],
    },
  ])("falls back to the mock list when the model returns $label", async ({ output }) => {
    enableRealPath();
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(output) },
    });

    const result = await generatePackingList(baseArgs);

    expect(result.isMock).toBe(true);
    expect(typeof result.error).toBe("string");
    expect(result.items.map((i) => i.name)).toContain("Underwear"); // deterministic mock
  });
});

describe("geminiService.validatePackingItems (Issue #34)", () => {
  const validItems = [
    { name: "Camera", category: "Electronics", quantity: 1, targetBag: "Backpack" },
    { name: "Novel", category: "Leisure", quantity: 2, targetBag: "Suitcase" },
  ];

  it("returns the array unchanged when every item is valid", () => {
    expect(validatePackingItems(validItems)).toBe(validItems);
  });

  it.each([
    ["a non-array", "nope"],
    ["an empty array", []],
    ["a null item", [null]],
    ["a missing name", [{ category: "Electronics", quantity: 1, targetBag: "Backpack" }]],
    ["a blank name", [{ name: "  ", category: "Electronics", quantity: 1, targetBag: "Backpack" }]],
    ["a missing category", [{ name: "Camera", quantity: 1, targetBag: "Backpack" }]],
    ["a fractional quantity", [{ name: "Camera", category: "Electronics", quantity: 1.5, targetBag: "Backpack" }]],
    ["a zero quantity", [{ name: "Camera", category: "Electronics", quantity: 0, targetBag: "Backpack" }]],
    ["a negative quantity", [{ name: "Camera", category: "Electronics", quantity: -2, targetBag: "Backpack" }]],
    ["a string quantity", [{ name: "Camera", category: "Electronics", quantity: "1", targetBag: "Backpack" }]],
    ["an unsupported bag", [{ name: "Camera", category: "Electronics", quantity: 1, targetBag: "Trunk" }]],
  ])("throws for %s", (_label, input) => {
    expect(() => validatePackingItems(input)).toThrow();
  });
});
