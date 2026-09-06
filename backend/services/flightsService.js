const axios = require("axios");

// Real flight search via the Sky-Scrapper API on RapidAPI. Kept behind the same
// mock/live pattern as weatherService: with no usable key (or USE_MOCKS=true) we
// return deterministic sample offers so the app and tests work offline; with a
// real RAPIDAPI_KEY we call the live API and fall back to a sample on any error
// so a flaky/quota-limited call never breaks trip planning.
//
// Flow (live): resolve the origin & destination cities to Sky-Scrapper
// airport identifiers (searchAirport -> skyId/entityId), then searchFlights for
// a round trip. Each itinerary's outbound leg gives the departure date and the
// return leg gives the return date, which is what lets the UI auto-fill both.

const RAPIDAPI_HOST = "sky-scrapper.p.rapidapi.com";

// The .env.example / docker default is a placeholder, so it must behave like
// "no key" — otherwise we call RapidAPI with a bad key and get a 401.
const PLACEHOLDER_KEYS = new Set(["your_rapidapi_key_here"]);

const DEFAULT_ORIGIN = "Tel Aviv";

function rapidApiKey() {
  return (process.env.RAPIDAPI_KEY || "").trim();
}

// True only when a usable RapidAPI key is configured.
function hasRealFlightsKey() {
  const key = rapidApiKey();
  return key.length > 0 && !PLACEHOLDER_KEYS.has(key);
}

// YYYY-MM-DD for a date value.
function isoDate(value) {
  return new Date(value).toISOString().split("T")[0];
}

// Deterministic sample round-trip offers, dated to the requested trip so the
// offline/fallback path still shows the right dates. No randomness so tests are
// stable.
function mockOffers({ origin, destination, departDate, returnDate }) {
  const depart = isoDate(departDate);
  const ret = returnDate ? isoDate(returnDate) : null;
  const options = [
    { airline: "EL AL", price: 289, depTime: "08:15", retTime: "19:40" },
    { airline: "Wizz Air", price: 205, depTime: "06:05", retTime: "22:10" },
    { airline: "Ryanair", price: 178, depTime: "13:30", retTime: "16:55" },
  ];
  return options.map((o, index) => ({
    id: `sample-${index}`,
    price: o.price,
    currency: "USD",
    departDate: depart,
    returnDate: ret,
    outbound: {
      from: origin,
      to: destination,
      airline: o.airline,
      departTime: `${depart}T${o.depTime}:00`,
    },
    inbound: ret
      ? {
          from: destination,
          to: origin,
          airline: o.airline,
          departTime: `${ret}T${o.retTime}:00`,
        }
      : null,
  }));
}

// Resolve a city/airport query to its Sky-Scrapper identifiers.
async function resolveEntity(query, headers) {
  const res = await axios.get(`https://${RAPIDAPI_HOST}/api/v1/flights/searchAirport`, {
    params: { query, locale: "en-US" },
    headers,
    timeout: 15000,
  });
  const first = Array.isArray(res.data?.data) ? res.data.data[0] : null;
  if (!first || !first.skyId || !first.entityId) {
    throw new Error(`No airport match for "${query}"`);
  }
  return { skyId: first.skyId, entityId: first.entityId };
}

// Map one Sky-Scrapper itinerary to our compact offer shape. Defensive about
// the exact field names since this is a third-party wrapper.
function normalizeItinerary(itinerary, origin, destination) {
  const legs = Array.isArray(itinerary?.legs) ? itinerary.legs : [];
  const outboundLeg = legs[0];
  const inboundLeg = legs[1];
  if (!outboundLeg?.departure) return null;

  const carrier = (leg) =>
    leg?.carriers?.marketing?.[0]?.name || leg?.carriers?.[0]?.name || "—";

  return {
    id: String(itinerary.id || `${outboundLeg.departure}-${itinerary.price?.raw ?? ""}`),
    price: itinerary.price?.raw ?? null,
    currency: "USD",
    departDate: isoDate(outboundLeg.departure),
    returnDate: inboundLeg?.departure ? isoDate(inboundLeg.departure) : null,
    outbound: {
      from: origin,
      to: destination,
      airline: carrier(outboundLeg),
      departTime: outboundLeg.departure,
    },
    inbound: inboundLeg?.departure
      ? {
          from: destination,
          to: origin,
          airline: carrier(inboundLeg),
          departTime: inboundLeg.departure,
        }
      : null,
  };
}

async function liveOffers({ origin, destination, departDate, returnDate, adults }) {
  const headers = {
    "X-RapidAPI-Key": rapidApiKey(),
    "X-RapidAPI-Host": RAPIDAPI_HOST,
  };

  const [from, to] = await Promise.all([
    resolveEntity(origin, headers),
    resolveEntity(destination, headers),
  ]);

  const params = {
    originSkyId: from.skyId,
    destinationSkyId: to.skyId,
    originEntityId: from.entityId,
    destinationEntityId: to.entityId,
    date: isoDate(departDate),
    adults: adults || 1,
    currency: "USD",
    market: "en-US",
    countryCode: "US",
  };
  if (returnDate) params.returnDate = isoDate(returnDate);

  const res = await axios.get(`https://${RAPIDAPI_HOST}/api/v2/flights/searchFlights`, {
    params,
    headers,
    timeout: 20000,
  });

  const itineraries = res.data?.data?.itineraries;
  const list = Array.isArray(itineraries) ? itineraries : [];
  return list
    .slice(0, 6)
    .map((it) => normalizeItinerary(it, origin, destination))
    .filter(Boolean);
}

// Search round-trip flight offers. Returns { offers, isMock, error? }.
async function searchFlights({ origin, destination, departDate, returnDate, adults = 1 } = {}) {
  const resolvedOrigin = (origin && String(origin).trim()) || DEFAULT_ORIGIN;
  const query = { origin: resolvedOrigin, destination, departDate, returnDate, adults };

  const useMocks = process.env.USE_MOCKS === "true" || !hasRealFlightsKey();
  if (useMocks) {
    console.log(`[FLIGHTS SERVICE] Using sample flights for ${resolvedOrigin} -> ${destination}`);
    return { offers: mockOffers(query), isMock: true };
  }

  try {
    console.log(
      `[FLIGHTS SERVICE] Searching live flights ${resolvedOrigin} -> ${destination} ` +
        `(${isoDate(departDate)}${returnDate ? ".." + isoDate(returnDate) : ""})`
    );
    const offers = await liveOffers(query);
    if (offers.length > 0) return { offers, isMock: false };
    // Provider answered but no itineraries — show samples rather than nothing.
    return { offers: mockOffers(query), isMock: true, error: "No live flights found." };
  } catch (error) {
    console.error("[FLIGHTS SERVICE] Live flight search failed; using samples:", error.message);
    return { offers: mockOffers(query), isMock: true, error: error.message };
  }
}

module.exports = { searchFlights, hasRealFlightsKey, DEFAULT_ORIGIN };
