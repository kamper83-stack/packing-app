import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import {
  PASSENGER_CATEGORIES,
  buildComposition,
  emptyComposition,
  invalidPassengerCategories,
  summarizePassengers,
  totalPassengers,
} from "../utils/passengers";
import DestinationAutocomplete from "../components/DestinationAutocomplete";

export default function Dashboard() {
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Trip Form States
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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

  const handlePassengerChange = (key, value) => {
    setPassengers((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    setError("");

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
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-indigo-600">🎒 PackPlanner</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-indigo-600 font-medium text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create New Trip */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 h-fit">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Plan a New Trip</h3>
            <form onSubmit={handleCreateTrip} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Destination</label>
                <DestinationAutocomplete
                  value={destination}
                  onChange={setDestination}
                  required
                  placeholder="e.g. Paris, London, Tokyo"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase">Start Date</label>
                  <input
                    type="date"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase">End Date</label>
                  <input
                    type="date"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Airline</label>
                <select
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={airline}
                  onChange={(e) => setAirline(e.target.value)}
                >
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
                <legend className="block text-xs font-semibold text-gray-500 uppercase">
                  Passengers
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {PASSENGER_CATEGORIES.map((c) => (
                    <label key={c.key} className="block">
                      <span className="block text-xs text-gray-600 mb-1">
                        <span className="mr-1" aria-hidden="true">{c.emoji}</span>
                        {c.label}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-label={c.label}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={passengers[c.key]}
                        onChange={(e) => handlePassengerChange(c.key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Vacation Type</label>
                <select
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={vacationType}
                  onChange={(e) => setVacationType(e.target.value)}
                >
                  <option value="City Trip">City Trip 🏙️</option>
                  <option value="Beach Vacation">Beach Vacation 🏖️</option>
                  <option value="Winter/Snow Sports">Winter Sports ❄️</option>
                  <option value="Hiking/Active Outdoors">Hiking & Outdoors ⛰️</option>
                  <option value="Business Trip">Business Trip 💼</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full mt-4 flex justify-center py-2 px-4 border border-transparent text-sm font-semibold rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {creating ? "Generating Packing List..." : "Create Trip & Generate List"}
              </button>
            </form>
          </div>

          {/* Trips List */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">My Trips</h3>
            {loading ? (
              <div className="text-center py-10 text-gray-500">Loading trips...</div>
            ) : trips.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                No trips planned yet. Use the form to plan your first adventure!
              </div>
            ) : (
              <div className="space-y-4">
                {trips.map((trip) => {
                  const summary = summarizePassengers(trip.passengerComposition);
                  return (
                    <div
                      key={trip.id}
                      className="flex justify-between items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
                    >
                      <div>
                        <h4 className="font-bold text-gray-900 text-base">{trip.destination}</h4>
                        <p className="text-xs text-gray-500">
                          🗓️ {trip.startDate} to {trip.endDate} | 🛫 {trip.airline} | 👥{" "}
                          {summary || trip.numPeople}
                        </p>
                        <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs font-semibold">
                          {trip.vacationType}
                        </span>
                      </div>
                      <Link
                        to={`/trip/${trip.id}`}
                        className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md text-sm font-semibold transition-colors"
                      >
                        View Checklist
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
