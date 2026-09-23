import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, LogOut, Calendar, Users, MapPin, ArrowRight, Sparkles, Trash2, Luggage } from "lucide-react";
import { api } from "../services/api";
import {
  PASSENGER_CATEGORIES,
  buildComposition,
  emptyComposition,
  invalidPassengerCategories,
  summarizePassengers,
  totalPassengers,
} from "../utils/passengers";
import { DEFAULT_AIRLINE, MAX_TROLLEY_COUNT } from "../utils/luggage";
import DestinationPicker from "../components/DestinationPicker";
import Logo from "../components/Logo";
import useDocumentTitle from "../utils/useDocumentTitle";

// Issue #121: UX mirror of the backend's year-plausibility check (source of
// truth stays server-side) — constrains the native date pickers so a stray
// old/far-future year is harder to pick in the first place. Window must
// match backend/routes/trips.js's YEAR_WINDOW_YEARS_AHEAD.
const DATE_INPUT_YEAR_WINDOW_AHEAD = 2;
const currentYearNow = new Date().getFullYear();
const currentDateNow = new Date().toISOString().split("T")[0];
const DATE_INPUT_MIN = currentDateNow;
const DATE_INPUT_MAX = `${currentYearNow + DATE_INPUT_YEAR_WINDOW_AHEAD}-12-31`;

export default function Dashboard() {
  useDocumentTitle("Dashboard");
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Trip Form States
  // Destination is chosen as a (country, city) pair; the city — always a place
  // with an airport — is what we send as the trip destination.
  const [country, setCountry] = useState("");
  const [destination, setDestination] = useState(""); // the selected city
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const endDateRef = useRef(null);
  const skipEndDateAutoOpenRef = useRef(false);
  const [passengers, setPassengers] = useState(emptyComposition());
  const [vacationType, setVacationType] = useState("City Trip");
  const [trolleyCount, setTrolleyCount] = useState(1);
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTrips();
      setTrips(data);
    } catch (err) {
      setError("Failed to load trips. Please log in again.");
      localStorage.removeItem("token");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  useEffect(() => {
    api.getMe()
      .then((user) => setIsAdmin(Boolean(user && user.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  const handlePassengerChange = (key, value) => {
    setPassengers((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    setError("");

    // Require a country + city (a city with an airport) before hitting the
    // backend, so the message is clear up front.
    if (!country || !destination) {
      setError("Please choose a destination country and city.");
      return;
    }

    // Reject fractional or otherwise non-integer passenger counts before they
    // are silently truncated by parseInt (Issue #35). Report the offending
    // categories so the user knows exactly what to fix.
    const invalidCategories = invalidPassengerCategories(passengers);
    if (invalidCategories.length > 0) {
      setError(
        `Passenger counts must be whole numbers (no decimals). Please correct: ${invalidCategories.join(
          ", "
        )}.`
      );
      return;
    }

    // Build the canonical passengerComposition (Issue #22 contract) and block
    // submission when no travellers were selected at all.
    const passengerComposition = buildComposition(passengers);
    if (totalPassengers(passengerComposition) === 0) {
      setError("Please add at least one passenger (infant, child, woman or man).");
      return;
    }

    // A trolley count must be a non-negative whole number — reject fractional
    // values up front instead of silently truncating with parseInt (same
    // philosophy as the passenger-count validation above).
    const trolleyValue = String(trolleyCount).trim();
    if (trolleyValue === "" || !/^\d+$/.test(trolleyValue)) {
      setError("Trolley suitcase count must be a whole number (no decimals).");
      return;
    }
    const cleanTrolleyCount = Math.min(MAX_TROLLEY_COUNT, Number(trolleyValue));

    setCreating(true);
    try {
      const newTrip = await api.createTrip({
        destination,
        startDate,
        endDate,
        // The backend always requires a non-empty airline (it drives baggage
        // allowance into the packing prompt); the UI no longer collects it, so
        // send a fixed default rather than a user-chosen field.
        airline: DEFAULT_AIRLINE,
        passengerComposition,
        vacationType,
        trolleyCount: cleanTrolleyCount,
      });
      // Redirect to the trip details view
      navigate(`/trip/${newTrip.id}`);
    } catch (err) {
      setError(err.message || "Failed to create trip.");
      setCreating(false);
    }
  };

  const handleDeleteTrip = async (tripId) => {
    if (!window.confirm("Are you sure you want to delete this trip?")) return;
    try {
      await api.deleteTrip(tripId);
      setTrips((current) => current.filter((trip) => trip.id !== tripId));
    } catch (err) {
      setError(err.message || "Failed to delete trip.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  // One cabin backpack per traveler is assumed automatically (the stack no
  // longer asks for backpacks); the helper text mirrors exactly how many the
  // packing list will enumerate, based on the chosen passenger composition.
  // TODO: infants are currently counted toward this backpack total along with
  // every other traveller — semantics unchanged from the legacy numPeople
  // total; revisit whether lap infants should be excluded here.
  const cabinBackpackCount = totalPassengers(buildComposition(passengers));

  return (
    <div className="min-h-screen bg-paper bg-paper-glow">
      <nav className="sticky top-0 z-20 bg-surface/80 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Logo size="md" />
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Link to="/admin" className="btn-secondary !py-2 !px-3 text-brand-700">
                  <ShieldCheck size={16} />
                  <span className="hidden sm:inline">Admin panel</span>
                </Link>
              )}
              <button onClick={handleLogout} className="btn-ghost !py-2 !px-3">
                <LogOut size={16} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <header className="mb-7">
          <p className="eyebrow">Your travel companion</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-ink">Plan smarter, pack lighter</h1>
        </header>

        {error && (
          <div className="mb-5 rounded-xl bg-danger-50 text-danger-700 px-4 py-3 text-sm border border-danger-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create New Trip */}
          <div className="card p-6 h-fit lg:sticky lg:top-24">
            <div className="flex items-center gap-2 mb-5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand-50 text-brand-600">
                <Sparkles size={18} />
              </span>
              <h2 className="text-lg font-bold text-ink">Plan a new trip</h2>
            </div>
            <form onSubmit={handleCreateTrip} className="space-y-4">
              <div>
                <label className="label">Destination</label>
                <DestinationPicker
                  country={country}
                  city={destination}
                  onChange={({ country: nextCountry, city }) => {
                    setCountry(nextCountry);
                    setDestination(city);
                  }}
                  required
                  selectClassName="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start date</label>
                  <input
                    type="date"
                    required
                    min={DATE_INPUT_MIN}
                    max={DATE_INPUT_MAX}
                    className="input"
                    value={startDate}
                    onKeyDown={(e) => {
                      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(e.key)) {
                        skipEndDateAutoOpenRef.current = true;
                      }
                    }}
                    onKeyUp={() => {
                      // If navigation changed only the calendar's visible month
                      // (and therefore emitted no change event), do not let this
                      // flag suppress a later pointer-based date selection.
                      skipEndDateAutoOpenRef.current = false;
                    }}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDate(nextStart);
                      // Start the return-date picker at the selected departure
                      // date, while preserving a later return date if one exists.
                      if (!endDate || (nextStart && endDate < nextStart)) {
                        setEndDate(nextStart);
                      }
                      if (nextStart && !skipEndDateAutoOpenRef.current) {
                        const endInput = endDateRef.current;
                        if (endInput) {
                          endInput.focus();
                          try {
                            endInput.showPicker?.();
                          } catch {
                            // Browsers may block showPicker outside a direct user gesture.
                          }
                        }
                      }
                      skipEndDateAutoOpenRef.current = false;
                    }}
                  />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input
                    ref={endDateRef}
                    type="date"
                    required
                    min={startDate || DATE_INPUT_MIN}
                    max={DATE_INPUT_MAX}
                    className="input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <fieldset>
                <legend className="label">Passengers</legend>
                <div className="grid grid-cols-2 gap-3">
                  {PASSENGER_CATEGORIES.map((c) => (
                    <label key={c.key} className="block">
                      <span className="block text-xs text-muted mb-1">{c.label}</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-label={c.label}
                        className="input"
                        value={passengers[c.key]}
                        onChange={(e) => handlePassengerChange(c.key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className="label" htmlFor="trolley-count">Trolley / checked suitcases</label>
                <input
                  id="trolley-count"
                  type="number"
                  min="0"
                  max={MAX_TROLLEY_COUNT}
                  step="1"
                  inputMode="numeric"
                  className="input"
                  value={trolleyCount}
                  // Keep the raw string so a fractional entry (e.g. "3.7") is
                  // preserved and rejected with a clear message on submit,
                  // instead of being silently truncated by parseInt.
                  onChange={(e) => setTrolleyCount(e.target.value)}
                />
                <span className="block mt-1 text-xs text-muted">
                  Plus {cabinBackpackCount} cabin backpack{cabinBackpackCount === 1 ? "" : "s"} per traveler, added automatically.
                </span>
              </div>

              <div>
                <label className="label">Vacation type</label>
                <select className="input" value={vacationType} onChange={(e) => setVacationType(e.target.value)}>
                  <option value="City Trip">City trip</option>
                  <option value="Beach Vacation">Beach vacation</option>
                  <option value="Winter/Snow Sports">Winter sports</option>
                  <option value="Hiking/Active Outdoors">Hiking &amp; outdoors</option>
                  <option value="Business Trip">Business trip</option>
                </select>
              </div>

              <button type="submit" disabled={creating} className="btn-primary w-full">
                {creating ? "Generating packing list…" : "Create trip & generate list"}
                {!creating && <ArrowRight size={16} />}
              </button>
            </form>
          </div>

          {/* Trips List */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-ink">My trips</h2>
              {!loading && trips.length > 0 && (
                <span className="badge border-line bg-surface text-muted">{trips.length} planned</span>
              )}
            </div>

            {loading ? (
              <div className="card p-10 text-center text-muted">Loading trips…</div>
            ) : trips.length === 0 ? (
              <div className="card p-12 text-center">
                <span className="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-brand-50 text-brand-500">
                  <MapPin size={26} />
                </span>
                <h3 className="mt-4 font-bold text-ink">No trips planned yet</h3>
                <p className="mt-1 text-sm text-muted">
                  Use the form to plan your first adventure — we'll build the packing list for you.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {trips.map((trip) => {
                  const summary = summarizePassengers(trip.passengerComposition);
                  const travellers =
                    summary || `${trip.numPeople} ${trip.numPeople > 1 ? "travelers" : "traveler"}`;
                  return (
                    <div
                      key={trip.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        // Ignore clicks that originate from a nested control (e.g. Delete)
                        // so the card doesn't also navigate when a child handles the click.
                        if (e.target.closest("button, a")) return;
                        navigate(`/trip/${trip.id}`);
                      }}
                      onKeyDown={(e) => {
                        // Only react to keydowns on the card itself — otherwise Enter/Space
                        // on the nested Delete button also bubbles up and navigates, which
                        // swallows the delete keypress entirely (PR #127 review).
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/trip/${trip.id}`);
                        }
                      }}
                      className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-lift hover:-translate-y-0.5 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 font-bold text-ink text-base truncate">
                          <MapPin size={16} className="text-brand-600 shrink-0" />
                          {trip.destination}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar size={14} /> {trip.startDate} – {trip.endDate}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Users size={14} />
                            <span
                              dir={summary ? "rtl" : undefined}
                              style={summary ? { unicodeBidi: "isolate" } : undefined}
                            >
                              {travellers}
                            </span>
                          </span>
                          {typeof trip.trolleyCount === "number" && (
                            <span className="inline-flex items-center gap-1.5">
                              <Luggage size={14} />
                              {trip.trolleyCount} {trip.trolleyCount === 1 ? "trolley" : "trolleys"}
                            </span>
                          )}
                        </div>
                        <span className="badge mt-3 border-brand-100 bg-brand-50 text-brand-700">
                          {trip.vacationType}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTrip(trip.id);
                          }}
                          className="btn-ghost text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                          aria-label={`Delete trip to ${trip.destination}`}
                        >
                          <Trash2 size={16} /> Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
