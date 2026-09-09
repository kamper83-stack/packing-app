// Unit tests for the flight search service (Sky-Scrapper / RapidAPI) with the
// mock/live fallback pattern.
const axios = require("axios");
const flightsService = require("../services/flightsService");

jest.mock("axios");

const iso = (d) => new Date(d).toISOString().split("T")[0];

describe("flightsService.searchFlights - mock mode (no key)", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
    delete process.env.RAPIDAPI_KEY;
    process.env.USE_MOCKS = "true";
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns sample round-trip offers dated to the requested trip, without any network call", async () => {
    const result = await flightsService.searchFlights({
      origin: "Tel Aviv",
      destination: "Rome",
      departDate: "2026-09-01",
      returnDate: "2026-09-05",
    });

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.isMock).toBe(true);
    expect(result.offers.length).toBeGreaterThan(0);
    for (const offer of result.offers) {
      expect(offer.departDate).toBe("2026-09-01");
      expect(offer.returnDate).toBe("2026-09-05");
      expect(offer.outbound).toMatchObject({ from: "Tel Aviv", to: "Rome" });
      expect(offer.inbound).toMatchObject({ from: "Rome", to: "Tel Aviv" });
    }
  });

  it("defaults the origin to Tel Aviv when none is given", async () => {
    const result = await flightsService.searchFlights({
      destination: "Paris",
      departDate: "2026-10-10",
      returnDate: "2026-10-14",
    });
    expect(result.offers[0].outbound.from).toBe("Tel Aviv");
  });
});

describe("flightsService.searchFlights - live mode (mocked axios)", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
    process.env.USE_MOCKS = "false";
    process.env.RAPIDAPI_KEY = "real-key";
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("resolves airports, searches, and normalizes live itineraries to trip-dated offers", async () => {
    // searchAirport (origin, then destination), then searchFlights.
    axios.get
      .mockResolvedValueOnce({ data: { data: [{ skyId: "TLV", entityId: "e-tlv" }] } })
      .mockResolvedValueOnce({ data: { data: [{ skyId: "ROM", entityId: "e-rom" }] } })
      .mockResolvedValueOnce({
        data: {
          data: {
            itineraries: [
              {
                id: "it1",
                price: { raw: 312.5, formatted: "$312" },
                legs: [
                  { departure: "2026-09-01T08:15:00", carriers: { marketing: [{ name: "EL AL" }] } },
                  { departure: "2026-09-05T19:40:00", carriers: { marketing: [{ name: "EL AL" }] } },
                ],
              },
            ],
          },
        },
      });

    const result = await flightsService.searchFlights({
      origin: "Tel Aviv",
      destination: "Rome",
      departDate: "2026-09-01",
      returnDate: "2026-09-05",
    });

    expect(result.isMock).toBe(false);
    expect(result.offers).toHaveLength(1);
    const [offer] = result.offers;
    expect(offer.price).toBe(312.5);
    expect(offer.departDate).toBe("2026-09-01");
    expect(offer.returnDate).toBe("2026-09-05");
    expect(offer.outbound.airline).toBe("EL AL");

    // The live searchFlights call carries the resolved sky/entity ids and dates.
    const searchCall = axios.get.mock.calls[2];
    expect(searchCall[0]).toMatch(/searchFlights/);
    expect(searchCall[1].params).toMatchObject({
      originSkyId: "TLV",
      destinationSkyId: "ROM",
      date: "2026-09-01",
      returnDate: "2026-09-05",
    });
    expect(searchCall[1].headers["X-RapidAPI-Key"]).toBe("real-key");
  });

  it("falls back to sample offers when the live call fails", async () => {
    axios.get.mockRejectedValue(new Error("429 Too Many Requests"));

    const result = await flightsService.searchFlights({
      destination: "Rome",
      departDate: "2026-09-01",
      returnDate: "2026-09-05",
    });

    expect(result.isMock).toBe(true);
    expect(result.error).toMatch(/429/);
    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.offers[0].departDate).toBe("2026-09-01");
  });

  it("falls back to samples when the provider returns no itineraries", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { data: [{ skyId: "TLV", entityId: "e-tlv" }] } })
      .mockResolvedValueOnce({ data: { data: [{ skyId: "ROM", entityId: "e-rom" }] } })
      .mockResolvedValueOnce({ data: { data: { itineraries: [] } } });

    const result = await flightsService.searchFlights({
      destination: "Rome",
      departDate: "2026-09-01",
      returnDate: "2026-09-05",
    });

    expect(result.isMock).toBe(true);
    expect(result.error).toMatch(/no live flights/i);
    expect(result.offers.length).toBeGreaterThan(0);
  });
});
