import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import {
  Plus,
  Trash2,
  ChevronLeft,
  Calendar,
  Plane,
  Users,
  Briefcase,
  Backpack,
  Luggage,
  Sun,
  Sparkles,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { summarizePassengers } from "../utils/passengers";
import useDocumentTitle from "../utils/useDocumentTitle";

// Issue #36 / #65: compact indicator of where the weather forecast came from.
// "live" -> real WeatherAPI data; "seasonal" -> historical climate estimate for
// a distant-future trip; "mock" -> offline/sample fallback. Any other value
// (including null on pre-#32 trips) renders nothing.
const WEATHER_SOURCE_BADGES = {
  live: {
    classes: "bg-brand-50 text-brand-700 border-brand-200",
    label: "Live data",
    aria: "Live weather data",
    Icon: Sun,
  },
  seasonal: {
    classes: "bg-sky-50 text-sky-700 border-sky-200",
    label: "Seasonal estimate",
    aria: "Seasonal climate estimate",
    Icon: Calendar,
  },
  mock: {
    classes: "bg-stone-100 text-stone-600 border-stone-200",
    label: "Sample data",
    aria: "Sample weather data",
    Icon: FileText,
  },
};

function WeatherSourceBadge({ source }) {
  const badge = WEATHER_SOURCE_BADGES[source];
  if (!badge) return null;
  const { Icon } = badge;

  return (
    <span role="status" aria-label={badge.aria} className={`badge ${badge.classes}`}>
      <Icon size={13} />
      {badge.label}
    </span>
  );
}

// Issue #42: compact indicator of how the packing list was generated.
// "live" -> personalized live by the Gemini AI; "mock" -> offline/standard
// template fallback. Any other value (including null on pre-#48 trips)
// renders nothing, so legacy trips stay readable.
function AiSourceBadge({ source }) {
  if (source !== "live" && source !== "mock") return null;

  const isLive = source === "live";
  const classes = isLive
    ? "bg-accent-50 text-accent-700 border-accent-200"
    : "bg-stone-100 text-stone-600 border-stone-200";
  const label = isLive ? "AI personalized" : "Standard template";
  const Icon = isLive ? Sparkles : FileText;

  return (
    <span
      role="status"
      aria-label={isLive ? "AI personalized packing list" : "Standard template packing list"}
      className={`badge ${classes}`}
    >
      <Icon size={13} />
      {label}
    </span>
  );
}

export default function TripView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reflect the trip destination in the browser tab, e.g. "Trip to Paris |
  // PackPlanner"; before the trip loads, show a neutral branded fallback.
  useDocumentTitle(trip?.destination ? `Trip to ${trip.destination}` : "Trip");

  // Custom Item Form
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("Clothing");
  const [customQty, setCustomQty] = useState(1);
  const [customBag, setCustomBag] = useState("Suitcase");

  // Checklist filters (Issue #43): narrow the list by target bag and by
  // whether an item is still to pack or already packed.
  const [bagFilter, setBagFilter] = useState("All"); // "All" | "Backpack" | "Suitcase"
  const [statusFilter, setStatusFilter] = useState("All"); // "All" | "ToPack" | "Packed"

  const fetchTripDetails = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTrip(id);
      setTrip(data);
      setItems(data.PackingItems || []);
    } catch (err) {
      setError("Failed to fetch trip details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTripDetails();
  }, [fetchTripDetails]);

  const handleTogglePack = async (item) => {
    try {
      const updated = await api.updateItem(item.id, { isPacked: !item.isPacked });
      setItems(items.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      setError("Failed to update item packing status.");
    }
  };

  const handleAddCustom = async (e) => {
    e.preventDefault();
    if (!customName.trim()) return;

    try {
      const newItem = await api.addCustomItem(id, {
        name: customName.trim(),
        category: customCategory,
        quantity: parseInt(customQty),
        targetBag: customBag,
      });
      setItems([...items, newItem]);
      setCustomName("");
    } catch (err) {
      setError("Failed to add custom item.");
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await api.deleteItem(itemId);
      setItems(items.filter((i) => i.id !== itemId));
    } catch (err) {
      setError("Failed to remove item.");
    }
  };

  const handleDeleteTrip = async () => {
    if (!window.confirm("Are you sure you want to delete this trip?")) return;

    try {
      await api.deleteTrip(id);
      navigate("/dashboard");
    } catch (err) {
      setError("Failed to delete trip.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-muted text-lg">Loading checklist…</div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper p-4">
        <div className="text-accent-600 text-lg mb-4">{error || "Trip not found."}</div>
        <Link to="/dashboard" className="font-semibold text-brand-700 hover:underline">
          Go back to dashboard
        </Link>
      </div>
    );
  }

  // Overall progress always reflects every item, regardless of the active
  // filters, so the user keeps a stable sense of how much is left to pack.
  const packedCount = items.filter((i) => i.isPacked).length;
  const progressPercent = items.length ? Math.round((packedCount / items.length) * 100) : 0;

  // Apply the bag + status filters (Issue #43) before grouping, so both the
  // visible items and their category sections update together.
  const visibleItems = items.filter((item) => {
    const bagMatches = bagFilter === "All" || item.targetBag === bagFilter;
    const statusMatches =
      statusFilter === "All" ||
      (statusFilter === "Packed" ? item.isPacked : !item.isPacked);
    return bagMatches && statusMatches;
  });

  // Group the visible items by category.
  const categories = [...new Set(visibleItems.map((i) => i.category))];

  return (
    <div className="min-h-screen bg-paper bg-paper-glow py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="card p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline mb-2"
            >
              <ChevronLeft size={16} /> Back to dashboard
            </Link>
            <h1 className="text-2xl font-extrabold text-ink">{trip.destination}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={15} /> {trip.startDate} – {trip.endDate}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Plane size={15} /> {trip.airline}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={15} />{" "}
                {summarizePassengers(trip.passengerComposition) ||
                  `${trip.numPeople} ${trip.numPeople > 1 ? "people" : "person"}`}
              </span>
            </div>
            <div className="mt-3">
              <AiSourceBadge source={trip.aiSource} />
            </div>
          </div>
          <button onClick={handleDeleteTrip} className="btn-ghost text-accent-600 hover:text-accent-700 hover:bg-accent-50">
            <Trash2 size={16} /> Delete trip
          </button>
        </div>

        {/* Weather Forecast and Baggage Constraints */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Weather Widget */}
          <div className="md:col-span-2 card p-6">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <h2 className="text-lg font-bold text-ink">Weather forecast</h2>
              <WeatherSourceBadge source={trip.weatherSource} />
            </div>
            {trip.weatherError && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2 p-3 bg-accent-50 border border-accent-200 rounded-xl text-xs text-accent-800"
              >
                <AlertTriangle size={16} className="shrink-0 mt-px" aria-hidden="true" />
                <span>
                  Live weather is temporarily unavailable, so we're showing sample
                  data. Reload the trip later to try again.
                </span>
              </div>
            )}
            {trip.weatherSource === "seasonal" && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2 p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-800"
              >
                <Calendar size={16} className="shrink-0 mt-px" aria-hidden="true" />
                <span>
                  This trip is beyond the live forecast window, so we're showing a
                  seasonal climate estimate based on typical weather for these dates.
                </span>
              </div>
            )}
            {trip.weatherData && trip.weatherData.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {trip.weatherData.slice(0, 4).map((day, idx) => (
                  <div key={idx} className="p-3 bg-paper border border-line rounded-xl text-center">
                    <span className="block text-xs font-semibold text-muted">{day.date}</span>
                    <span className="block text-2xl font-extrabold text-ink mt-1">{day.tempC}°</span>
                    <span className="block text-xs text-muted mt-1">{day.condition}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No weather forecast available.</p>
            )}
          </div>

          {/* Baggage Limits Warning */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-ink mb-4">Luggage constraints</h2>
            <p className="text-sm font-semibold text-brand-700 mb-3">{trip.airline}</p>
            <div className="space-y-3 text-sm text-muted">
              <div className="p-3 bg-brand-50 border border-brand-100 rounded-xl">
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Briefcase size={16} /> Cabin baggage
                </span>
                <span className="block mt-1 text-xs">Limit 8–10 kg. Keep documents &amp; chargers here.</span>
              </div>
              <div className="p-3 bg-paper border border-line rounded-xl">
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Luggage size={16} /> Checked baggage
                </span>
                <span className="block mt-1 text-xs">Limit 23 kg. Heavy clothing &amp; liquids here.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="card p-6">
          <div className="flex justify-between items-center text-sm font-semibold mb-2 text-ink">
            <span>Overall packing progress</span>
            <span className="text-muted">
              {progressPercent}% · {packedCount} of {items.length} items
            </span>
          </div>
          <div className="w-full bg-stone-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-brand-gradient h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Packing List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items checklist */}
          <div className="lg:col-span-2 space-y-6">
            {trip.aiError && (
              <div
                role="status"
                className="flex items-start gap-2 p-3 bg-accent-50 border border-accent-200 rounded-xl text-xs text-accent-800"
              >
                <AlertTriangle size={16} className="shrink-0 mt-px" aria-hidden="true" />
                <span>
                  AI personalization was unavailable, so this list uses a standard
                  template. Reload the trip later to try again.
                </span>
              </div>
            )}
            {/* Filter toolbar (Issue #43) */}
            <div className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1">
                  <label htmlFor="bag-filter" className="label">Bag</label>
                  <select
                    id="bag-filter"
                    aria-label="Filter by bag"
                    value={bagFilter}
                    onChange={(e) => setBagFilter(e.target.value)}
                    className="input"
                  >
                    <option value="All">All bags</option>
                    <option value="Backpack">Cabin / backpack</option>
                    <option value="Suitcase">Checked suitcase</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label htmlFor="status-filter" className="label">Status</label>
                  <select
                    id="status-filter"
                    aria-label="Filter by packing status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="input"
                  >
                    <option value="All">All items</option>
                    <option value="ToPack">To pack</option>
                    <option value="Packed">Packed</option>
                  </select>
                </div>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="card p-8 text-center text-muted">
                Your packing list is empty. Add a custom item below.
              </div>
            ) : categories.length === 0 ? (
              <div className="card p-8 text-center text-muted">
                No items match the selected filters.
              </div>
            ) : (
              categories.map((category) => (
                <div key={category} className="card p-6">
                  <h3 className="text-base font-bold text-ink border-b border-line pb-2 mb-4">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {visibleItems
                      .filter((i) => i.category === category)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center p-2 rounded-lg hover:bg-paper transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={item.isPacked}
                              onChange={() => handleTogglePack(item)}
                              className="h-5 w-5 accent-brand-600 rounded"
                            />
                            <span
                              className={`text-sm ${
                                item.isPacked ? "line-through text-stone-400" : "text-ink"
                              }`}
                            >
                              {item.name} <span className="text-xs text-muted">(x{item.quantity})</span>
                            </span>
                            <span className="badge border-line bg-paper text-muted">
                              {item.targetBag === "Suitcase" ? (
                                <><Luggage size={12} /> Suitcase</>
                              ) : (
                                <><Backpack size={12} /> Backpack</>
                              )}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            aria-label={`Remove ${item.name}`}
                            className="text-stone-400 hover:text-accent-600 p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add custom item form */}
          <div className="card p-6 h-fit">
            <h3 className="text-base font-bold text-ink mb-4">Add custom item</h3>
            <form onSubmit={handleAddCustom} className="space-y-4">
              <div>
                <label className="label">Item name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Toothbrush, rain jacket"
                  className="input"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  className="input"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                >
                  <option value="Clothing">Clothing</option>
                  <option value="Toiletries">Toiletries</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Documents">Documents</option>
                  <option value="Specialized Gear">Specialized Gear</option>
                  <option value="Accessories">Accessories</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="input"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Pack in</label>
                  <select
                    className="input"
                    value={customBag}
                    onChange={(e) => setCustomBag(e.target.value)}
                  >
                    <option value="Suitcase">Suitcase</option>
                    <option value="Backpack">Backpack</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary w-full">
                <Plus size={16} /> Add to list
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
