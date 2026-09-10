import React, { useState } from "react";
import { Plane, PlaneTakeoff, PlaneLanding } from "lucide-react";
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
    <div className="rounded-xl border border-line bg-paper/60 p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="flight-origin" className="label">From (origin)</label>
          <input
            id="flight-origin"
            type="text"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="e.g. Tel Aviv"
            className="input"
          />
        </div>
        <button type="button" onClick={search} disabled={!canSearch} className="btn-primary shrink-0">
          <Plane size={16} />
          {loading ? "Searching…" : "Search flights"}
        </button>
      </div>

      {!destination || !departDate ? (
        <p className="mt-2 text-xs text-muted">
          Choose a destination and a departure date to search flights.
        </p>
      ) : null}

      {error && <p className="mt-2 text-xs text-danger-600" role="alert">{error}</p>}

      {offers && offers.length === 0 && !error && (
        <p className="mt-2 text-xs text-muted">No flights found for these dates.</p>
      )}

      {offers && offers.length > 0 && (
        <div className="mt-3 space-y-2">
          {isMock && (
            <p className="badge border-amber-200 bg-amber-50 text-amber-800 w-full justify-start">
              Showing sample flights (no live flight key configured).
            </p>
          )}
          <ul className="space-y-2">
            {offers.map((offer) => (
              <li
                key={offer.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2"
              >
                <div className="text-sm min-w-0">
                  <div className="font-semibold text-ink">
                    {offer.outbound?.airline || "—"}
                    {offer.price != null && (
                      <span className="ml-2 text-brand-700">
                        {offer.currency === "USD" ? "$" : ""}
                        {offer.price}
                        {offer.currency && offer.currency !== "USD" ? ` ${offer.currency}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <PlaneTakeoff size={13} /> {offer.departDate}
                      {formatTime(offer.outbound?.departTime) && ` · ${formatTime(offer.outbound.departTime)}`}
                    </span>
                    {offer.returnDate && (
                      <span className="inline-flex items-center gap-1">
                        <PlaneLanding size={13} /> {offer.returnDate}
                        {formatTime(offer.inbound?.departTime) && ` · ${formatTime(offer.inbound.departTime)}`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelectDates({ departDate: offer.departDate, returnDate: offer.returnDate })
                  }
                  className="btn-secondary !py-1.5 !px-2.5 text-xs text-brand-700 shrink-0"
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
