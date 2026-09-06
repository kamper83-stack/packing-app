import React, { useState } from "react";
import { api } from "../services/api";

// Real round-trip flight search. The user gives an origin (defaults to Tel
// Aviv) and the current destination + departure date; on "Search flights" we
// call the backend (Sky-Scrapper / RapidAPI) and list round-trip options.
// Picking one calls onSelectDates with the outbound and return dates so the
// trip form's Start/End dates fill in automatically. In the demo/offline
// environment the backend returns clearly-labelled sample flights.
function formatTime(value) {
  if (!value) return "";
  const [, time = ""] = String(value).split("T");
  return time.slice(0, 5); // HH:MM
}

export default function FlightSearch({ destination, departDate, returnDate, onSelectDates }) {
  const [origin, setOrigin] = useState("Tel Aviv");
  const [offers, setOffers] = useState(null);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSearch = Boolean(destination && departDate) && !loading;

  const search = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.searchFlights({ origin, destination, departDate, returnDate });
      setOffers(Array.isArray(result?.offers) ? result.offers : []);
      setIsMock(Boolean(result?.isMock));
    } catch (err) {
      setError(err.message || "Flight search failed.");
      setOffers(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="flight-origin" className="block text-xs font-semibold text-gray-500 uppercase">
            From (origin)
          </label>
          <input
            id="flight-origin"
            type="text"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="e.g. Tel Aviv"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={search}
          disabled={!canSearch}
          className="px-3 py-2 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Searching…" : "✈️ Search flights"}
        </button>
      </div>

      {!destination || !departDate ? (
        <p className="mt-2 text-xs text-gray-500">
          Choose a destination and a departure date to search flights.
        </p>
      ) : null}

      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}

      {offers && offers.length === 0 && !error && (
        <p className="mt-2 text-xs text-gray-500">No flights found for these dates.</p>
      )}

      {offers && offers.length > 0 && (
        <div className="mt-3 space-y-2">
          {isMock && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Showing sample flights (no live flight key configured).
            </p>
          )}
          <ul className="space-y-2">
            {offers.map((offer) => (
              <li
                key={offer.id}
                className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2"
              >
                <div className="text-sm">
                  <div className="font-semibold text-gray-800">
                    {offer.outbound?.airline || "—"}
                    {offer.price != null && (
                      <span className="ml-2 text-indigo-700">
                        {offer.currency === "USD" ? "$" : ""}
                        {offer.price}
                        {offer.currency && offer.currency !== "USD" ? ` ${offer.currency}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    🛫 {offer.departDate}
                    {formatTime(offer.outbound?.departTime) && ` ${formatTime(offer.outbound.departTime)}`}
                    {offer.returnDate && (
                      <>
                        {"  ·  "}🛬 {offer.returnDate}
                        {formatTime(offer.inbound?.departTime) && ` ${formatTime(offer.inbound.departTime)}`}
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelectDates({ departDate: offer.departDate, returnDate: offer.returnDate })
                  }
                  className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 whitespace-nowrap"
                >
                  Use dates
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
