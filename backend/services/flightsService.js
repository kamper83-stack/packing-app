const axios = require("axios");

// Real flight search via the Skyscanner Flights API on RapidAPI. Kept behind the
// same mock/live pattern as weatherService: with no usable key (or USE_MOCKS=true)
// we return deterministic sample offers so the app and tests work offline; with a
// real RAPIDAPI_KEY we call the live API and fall back to a sample on any error so
// a flaky/quota-limited call never breaks trip planning.
//
// Flow (live): the API accepts city names or IATA codes directly for origin and
// destination, so no separate airport-resolution step is needed. We call
// /api/v1/roundtrip for a round trip (or /api/v1/search for a one-way when no
// return date is given). Each result's first leg gives the departure date and the
// second leg gives the return date, which is what lets the UI auto-fill both.

const RAPIDAPI_HOST = "skyscanner-api.p.rapidapi.com";

// The .env.example / docker default is a placeholder, so it must behave like
// "no key" — otherwise we call RapidAPI with a bad key and get a 403.
const PLACEHOLDER_KEYS = new Set(["your_rapidapi_key_here"]);

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

// Map one Skyscanner result to our compact offer shape. Defensive about the exact
// field names since this is a third-party wrapper. legs[0] is the outbound leg and
// legs[1] (when present) is the inbound/return leg.
function normalizeResult(result, currency) {
  const legs = Array.isArray(result?.legs) ? result.legs : [];
  const outboundLeg = legs[0];
  const inboundLeg = legs[1];
  if (!outboundLeg?.dep) return null;

  const airline =
    Array.isArray(result?.carriers) && result.carriers.length ? result.carriers[0] : "—";

  return {
    id: String(result.id || `${outboundLeg.dep}-${result.price_raw ?? ""}`),
    price: result.price_raw ?? null,
    currency: currency || "USD",
    departDate: isoDate(outboundLeg.dep),
    returnDate: inboundLeg?.dep ? isoDate(inboundLeg.dep) : null,
    outbound: {
      from: outboundLeg.from,
      to: outboundLeg.to,
      airline,
      departTime: outboundLeg.dep,
    },
    inbound: inboundLeg?.dep
      ? {
          from: inboundLeg.from,
          to: inboundLeg.to,
          airline,
          departTime: inboundLeg.dep,
        }
      : null,
  };
}

async function liveOffers({ origin, destination, departDate, returnDate, adults }) {
  const headers = {
    "X-RapidAPI-Key": rapidApiKey(),
    "X-RapidAPI-Host": RAPIDAPI_HOST,
  };

  const isRoundTrip = Boolean(returnDate);
  const path = isRoundTrip ? "/api/v1/roundtrip" : "/api/v1/search";

  const params = {
    origin,
    destination,
    date: isoDate(departDate),
    adults: adults || 1,
    currency: "USD",
    market: "US",
    locale: "en-US",
    limit: 15,
  };
  if (isRoundTrip) params.return_date = isoDate(returnDate);

  const res = await axios.get(`https://${RAPIDAPI_HOST}${path}`, {
    params,
    headers,
    timeout: 20000,
  });

  const data = res.data || {};
  const currency = data.currency || "USD";
  const results = Array.isArray(data.results) ? data.results : [];
  return results
    .slice(0, 6)
    .map((result) => normalizeResult(result, currency))
    .filter(Boolean);
}

// Search round-trip flight offers. Returns { offers, isMock, error? }.
async function searchFlights({ destination, departDate, returnDate, adults = 1 } = {}) {
  const query = { origin: "Tel Aviv", destination, departDate, returnDate, adults };

  const useMocks = process.env.USE_MOCKS === "true" || !hasRealFlightsKey();
  if (useMocks) {
    console.log(`[FLIGHTS SERVICE] Using sample flights for Tel Aviv -> ${destination}`);
    return { offers: mockOffers(query), isMock: true };
  }

  try {
    console.log(
      `[FLIGHTS SERVICE] Searching live flights Tel Aviv -> ${destination} ` +
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

module.exports = { searchFlights, hasRealFlightsKey };
