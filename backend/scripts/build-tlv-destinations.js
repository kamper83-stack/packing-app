#!/usr/bin/env node
/**
 * Regenerates backend/config/airportCities.json from
 * backend/scripts/tlv-destinations-source.json — a hand-maintained allow-list
 * of real, currently-bookable destinations from Ben Gurion Airport (TLV).
 *
 * Scope decision (course/capstone project, not a production travel booking
 * platform): only destinations reachable by a real route from Ben Gurion
 * Airport (TLV) are offered in the create-trip destination picker. This
 * keeps the catalog small, makes the flight search feature's sample/mock
 * data plausible for every listed destination, and removes the city/country
 * ambiguity bug an earlier "every airport city in the world" dataset had
 * (e.g. Albany, Australia vs. Albany, USA — none of the TLV-only
 * destinations collide).
 *
 * HISTORY — why this isn't generated from OpenFlights routes.dat anymore:
 * an earlier version of this script derived the list mechanically from
 * OpenFlights' routes.dat (public domain, but frozen since ~2014). A deploy
 * review caught that this hid ~80 real, current TLV routes — including
 * Dubai, Lisbon and Tokyo — while keeping long-dead ones (Philadelphia,
 * a Hong Kong route that had in fact resumed, etc.), because routes opened
 * after 2014 simply aren't in the source data and routes that quietly died
 * are. The fix direction taken here is the one recommended by that review:
 * flip the source of truth to a manually maintained, periodically
 * re-researched allow-list (tlv-destinations-source.json), with the old
 * OpenFlights snapshot kept in openflights-data/ only as a historical
 * cross-reference, not as the gate.
 *
 * tlv-destinations-source.json documents its own research method and date
 * in its _meta block — read that before trusting or extending this list.
 * Every city in it was verified against WeatherAPI.com's geocoding search
 * endpoint (the provider weatherService.js actually calls), so a listed
 * destination is guaranteed to have a weather source.
 *
 * Maintenance: edit tlv-destinations-source.json (not this script) and
 * re-run `node backend/scripts/build-tlv-destinations.js`. Airline route
 * networks change every season — re-verify periodically.
 *
 * Usage: node backend/scripts/build-tlv-destinations.js
 */

const fs = require("fs");
const path = require("path");

const SOURCE_FILE = path.join(__dirname, "tlv-destinations-source.json");
const OUTPUT_FILE = path.join(__dirname, "..", "config", "airportCities.json");

function build() {
  const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
  const { destinations } = source;

  if (!Array.isArray(destinations) || destinations.length === 0) {
    throw new Error(`${SOURCE_FILE} has no destinations array`);
  }

  const seenCities = new Set();
  const citiesByCountry = {};
  for (const { city, country } of destinations) {
    if (!city || !country) {
      throw new Error(`Malformed entry in ${SOURCE_FILE}: ${JSON.stringify({ city, country })}`);
    }
    if (seenCities.has(city)) {
      throw new Error(`Duplicate city "${city}" in ${SOURCE_FILE} — every city must be unique.`);
    }
    seenCities.add(city);
    if (!citiesByCountry[country]) citiesByCountry[country] = [];
    citiesByCountry[country].push(city);
  }
  for (const country of Object.keys(citiesByCountry)) {
    citiesByCountry[country].sort((a, b) => a.localeCompare(b));
  }
  const sortedCitiesByCountry = {};
  for (const country of Object.keys(citiesByCountry).sort((a, b) => a.localeCompare(b))) {
    sortedCitiesByCountry[country] = citiesByCountry[country];
  }

  const countryCount = Object.keys(sortedCitiesByCountry).length;
  const cityCount = destinations.length;

  const output = {
    _comment:
      `Destinations reachable by a real, currently-bookable flight route from ` +
      `Ben Gurion Airport (TLV). Source of truth: ` +
      `backend/scripts/tlv-destinations-source.json (hand-maintained ` +
      `allow-list, researched ${source._meta?.researched || "unknown date"} — ` +
      `see that file's _meta block for method and sources). Regenerate with ` +
      `node backend/scripts/build-tlv-destinations.js after editing the ` +
      `source file. ${countryCount} countries, ${cityCount} cities.`,
    citiesByCountry: sortedCitiesByCountry,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUTPUT_FILE}: ${countryCount} countries, ${cityCount} cities.`);
}

build();
