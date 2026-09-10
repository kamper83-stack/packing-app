import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, LogOut, Calendar, Plane, Users, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { api } from "../services/api";
import {
  PASSENGER_CATEGORIES,
  buildComposition,
  emptyComposition,
  invalidPassengerCategories,
  summarizePassengers,
  totalPassengers,
} from "../utils/passengers";
import DestinationPicker from "../components/DestinationPicker";
import FlightSearch from "../components/FlightSearch";
import Logo from "../components/Logo";
import useDocumentTitle from "../utils/useDocumentTitle";

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
  // Ref to the end (landing) date input so choosing a departure date can send
  // the user straight to picking the return date, without hunting for it.
  const endDateRef = useRef(null);
  const [airline, setAirline] = useState("EL AL");
  const [passengers, setPassengers] = useState(emptyComposition());
  const [vacationType, setVacationType] = useState("City Trip");
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

    setCreating(true);
    try {
      const newTrip = await api.createTrip({
        destination,
        startDate,
        endDate,
        airline,
        passengerComposition,
        vacationType,
      });
      // Redirect to the trip details view
      navigate(`/trip/${newTrip.id}`);
    } catch (err) {
      setError(err.message || "Failed to create trip.");
      setCreating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

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
                    className="input"
                    value={startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDate(nextStart);
                      // Keep the return date on/after departure so the form
                      // can't hold an end-before-start range.
                      if (endDate && nextStart && endDate < nextStart) {
                        setEndDate(nextStart);
                      }
                      // Once a departure date is chosen, advance the user
                      // straight to picking the landing date.
                      if (nextStart) {
                        const el = endDateRef.current;
                        if (el) {
                          el.focus();
                          // showPicker() opens the native calendar where the
                          // browser supports it; guard it since it can be
                          // unsupported (older browsers, jsdom) or blocked.
                          try {
                            el.showPicker?.();
                          } catch {
                            /* fall back to the plain focus above */
                          }
                        }
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input
                    ref={endDateRef}
                    type="date"
                    required
                    min={startDate || undefined}
                    className="input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Real round-trip flight search: pick an offer to auto-fill the
                  trip's start (departure) and end (return) dates. */}
              <FlightSearch
                destination={destination}
                departDate={startDate}
                returnDate={endDate}
                onSelectDates={({ departDate, returnDate }) => {
                  if (departDate) setStartDate(departDate);
                  if (returnDate) setEndDate(returnDate);
                }}
              />

              <div>
                <label className="label">Airline</label>
                <select className="input" value={airline} onChange={(e) => setAirline(e.target.value)}>
                  <option value="EL AL">EL AL</option>
                  <option value="Ryanair">Ryanair</option>
                  <option value="Wizz Air">Wizz Air</option>
                  <option value="EasyJet">EasyJet</option>
                  <option value="Delta">Delta</option>
                  <option value="United">United</option>
                  <option value="Other">Other</option>
                </select>
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
                      className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-lift hover:-translate-y-0.5"
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
                            <Plane size={14} /> {trip.airline}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Users size={14} /> {travellers}
                          </span>
                        </div>
                        <span className="badge mt-3 border-brand-100 bg-brand-50 text-brand-700">
                          {trip.vacationType}
                        </span>
                      </div>
                      <Link to={`/trip/${trip.id}`} className="btn-secondary shrink-0 self-start sm:self-auto">
                        View checklist
                        <ArrowRight size={16} />
                      </Link>
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
