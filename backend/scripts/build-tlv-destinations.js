#!/usr/bin/env node
/**
 * Regenerates backend/config/airportCities.json from real TLV (Ben Gurion)
 * flight-route data — replacing the previous approach, which listed every
 * city in the world with any airport (including private airstrips and air
 * force bases like Masada/MTZ and Nevatim/VTM) regardless of whether anyone
 * could actually fly there from Israel.
 *
 * Scope decision (course/capstone project, not a production travel booking
 * platform): only destinations reachable by a real route from Ben Gurion
 * Airport (TLV) are offered in the create-trip destination picker. This
 * keeps the catalog small (~60 cities instead of ~5,700), makes the flight
 * search feature's sample/mock data plausible for every listed destination,
 * and removes the city/country ambiguity bug the previous dataset had
 * (multiple countries sharing a city name — e.g. Albany, Australia vs.
 * Albany, USA — none of the TLV-only destinations collide).
 *
 * Data source: OpenFlights (https://openflights.org/data.html, public
 * domain), routes.dat + airports.dat. Trimmed, committed snapshots live in
 * backend/scripts/openflights-data/ (only TLV-origin routes and the airports
 * they resolve to — a few hundred lines instead of the ~68k/~7.7k originals)
 * so this script runs offline and reproducibly. To refresh from upstream,
 * download the full files from openflights/data on GitHub, re-filter to
 * src === "TLV", and replace the two files in openflights-data/.
 *
 * IMPORTANT — known staleness: OpenFlights' routes.dat has not been updated
 * since ~2014. Routes to Russia/Belarus/Ukraine are excluded below because
 * they have been suspended since February 2022, not because of a data
 * artifact. Conversely, real current EL AL routes opened after 2014 (e.g.
 * Lisbon, Tokyo) will NOT appear from the raw data and must be added to
 * MANUAL_ADD_CITIES below if/when verified. Re-review EXCLUDE_COUNTRIES and
 * MANUAL_ADD_CITIES periodically — this generator encodes a snapshot, not a
 * live feed.
 *
 * Usage: node backend/scripts/build-tlv-destinations.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "openflights-data");
const ROUTES_FILE = path.join(DATA_DIR, "routes-tlv.dat");
const AIRPORTS_FILE = path.join(DATA_DIR, "airports-tlv-subset.dat");
const OUTPUT_FILE = path.join(__dirname, "..", "config", "airportCities.json");

// Routes suspended since Feb 2022 (not a data-staleness artifact — a
// deliberate, current exclusion). Revisit if the situation changes.
const EXCLUDE_COUNTRIES = new Set(["Russia", "Belarus", "Ukraine"]);

// Spelling/consistency fixes applied to the raw OpenFlights city names.
const RENAME_CITY = {
  Elat: "Eilat", // OpenFlights' old spelling of the Israeli resort city
  Milano: "Milan",
  Duesseldorf: "Düsseldorf",
  "Cluj-napoca": "Cluj-Napoca",
  "Minsk 2": "Minsk",
};

// Real, current TLV routes verified by hand that are missing from the
// frozen-since-2014 OpenFlights snapshot. Keep this list small and only add
// entries you've actually confirmed (e.g. against the airline's own route
// map), since nothing here is checked against source data like the rest of
// this generator's output.
const MANUAL_ADD_CITIES = [
  // { country: "Portugal", city: "Lisbon" },
  // { country: "Japan", city: "Tokyo" },
];

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function loadTlvDestinationIataCodes() {
  const codes = new Set();
  const lines = fs.readFileSync(ROUTES_FILE, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // routes.dat columns: airline,airlineID,src,srcID,dst,dstID,codeshare,stops,equipment
    const fields = line.split(",");
    const [, , src, , dst] = fields;
    if (src === "TLV" && dst && dst !== "\\N") {
      codes.add(dst);
    }
  }
  return codes;
}

function loadAirportsByIata() {
  const byIata = new Map();
  const lines = fs.readFileSync(AIRPORTS_FILE, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // airports.dat columns: id,name,city,country,iata,icao,lat,lon,alt,tz,dst,tzdb,type,source
    const fields = parseCsvLine(line);
    const iata = fields[4];
    if (!iata || iata === "\\N") continue;
    byIata.set(iata, { name: fields[1], city: fields[2], country: fields[3] });
  }
  return byIata;
}

function build() {
  const destinationCodes = loadTlvDestinationIataCodes();
  const airportsByIata = loadAirportsByIata();

  const places = new Set(); // "Country|City" keys, de-duplicated
  const byKey = new Map();
  for (const code of destinationCodes) {
    const airport = airportsByIata.get(code);
    if (!airport) continue; // shouldn't happen given the committed subset file
    if (EXCLUDE_COUNTRIES.has(airport.country)) continue;
    const city = RENAME_CITY[airport.city] || airport.city;
    const key = `${airport.country}|${city}`;
    places.add(key);
    byKey.set(key, { country: airport.country, city });
  }

  for (const { country, city } of MANUAL_ADD_CITIES) {
    byKey.set(`${country}|${city}`, { country, city });
  }

  const citiesByCountry = {};
  for (const { country, city } of byKey.values()) {
    if (!citiesByCountry[country]) citiesByCountry[country] = [];
    if (!citiesByCountry[country].includes(city)) citiesByCountry[country].push(city);
  }
  for (const country of Object.keys(citiesByCountry)) {
    citiesByCountry[country].sort((a, b) => a.localeCompare(b));
  }
  const sortedCitiesByCountry = {};
  for (const country of Object.keys(citiesByCountry).sort((a, b) => a.localeCompare(b))) {
    sortedCitiesByCountry[country] = citiesByCountry[country];
  }

  const countryCount = Object.keys(sortedCitiesByCountry).length;
  const cityCount = Object.values(sortedCitiesByCountry).reduce((n, list) => n + list.length, 0);

  const output = {
    _comment:
      `Destinations reachable by a real flight route from Ben Gurion Airport ` +
      `(TLV), derived from OpenFlights route data (public domain, frozen ` +
      `~2014) plus a small hand-curated exclude/rename list. Regenerate with ` +
      `node backend/scripts/build-tlv-destinations.js — see that file for the ` +
      `known staleness caveat (routes suspended since 2022, and post-2014 ` +
      `routes not reflected in the source data). ${countryCount} countries, ` +
      `${cityCount} cities.`,
    citiesByCountry: sortedCitiesByCountry,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUTPUT_FILE}: ${countryCount} countries, ${cityCount} cities.`);
}

build();
