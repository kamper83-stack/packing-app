import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { Plus, Trash2, ChevronLeft } from "lucide-react";
import { summarizePassengers } from "../utils/passengers";

export default function TripView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Loading checklist...</div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="text-red-500 text-lg mb-4">{error || "Trip not found."}</div>
        <Link to="/dashboard" className="text-indigo-600 font-semibold hover:underline">
          Go back to Dashboard
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
    <div className="min-h-screen bg-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-md border border-gray-100">
          <div>
            <Link to="/dashboard" className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:underline mb-2">
              <ChevronLeft size={16} /> Back to Dashboard
            </Link>
            <h2 className="text-2xl font-bold text-gray-900">{trip.destination}</h2>
            <p className="text-sm text-gray-500 mt-1">
              🗓️ {trip.startDate} to {trip.endDate} | 🛫 {trip.airline} | 👤{" "}
              {summarizePassengers(trip.passengerComposition) ||
                `${trip.numPeople} ${trip.numPeople > 1 ? "people" : "person"}`}
            </p>
          </div>
          <button
            onClick={handleDeleteTrip}
            className="mt-4 md:mt-0 text-red-500 hover:text-red-700 text-sm font-semibold flex items-center"
          >
            <Trash2 size={16} className="mr-1" /> Delete Trip
          </button>
        </div>

        {/* Weather Forecast and Baggage Constraints */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Weather Widget */}
          <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Weather Forecast</h3>
            {trip.weatherData && trip.weatherData.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {trip.weatherData.slice(0, 4).map((day, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
                    <span className="block text-xs font-bold text-gray-400">{day.date}</span>
                    <span className="block text-xl font-extrabold text-gray-900 mt-1">{day.tempC}°C</span>
                    <span className="block text-xs text-gray-500 mt-1">{day.condition}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No weather forecast available.</p>
            )}
          </div>

          {/* Baggage Limits Warning */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Luggage Constraints</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p className="font-semibold text-indigo-600">Airline: {trip.airline}</p>
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <span className="block font-bold text-gray-900">👜 Cabin Baggage:</span>
                <span className="text-xs">Limit: 8-10 kg. Place documents & chargers here.</span>
              </div>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="block font-bold text-gray-900">🧳 Checked Baggage:</span>
                <span className="text-xs">Limit: 23 kg. Place heavy clothing & liquids here.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
          <div className="flex justify-between items-center text-sm font-semibold mb-2">
            <span>Overall Packing Progress</span>
            <span>{progressPercent}% ({packedCount} of {items.length} items)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Packing List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items checklist */}
          <div className="lg:col-span-2 space-y-6">
            {/* Filter toolbar (Issue #43) */}
            <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1">
                  <label
                    htmlFor="bag-filter"
                    className="block text-xs font-semibold text-gray-500 uppercase mb-1"
                  >
                    Bag
                  </label>
                  <select
                    id="bag-filter"
                    aria-label="Filter by bag"
                    value={bagFilter}
                    onChange={(e) => setBagFilter(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="All">All bags</option>
                    <option value="Backpack">🎒 Cabin / Backpack</option>
                    <option value="Suitcase">🧳 Checked Suitcase</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label
                    htmlFor="status-filter"
                    className="block text-xs font-semibold text-gray-500 uppercase mb-1"
                  >
                    Status
                  </label>
                  <select
                    id="status-filter"
                    aria-label="Filter by packing status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="All">All items</option>
                    <option value="ToPack">To Pack</option>
                    <option value="Packed">Packed</option>
                  </select>
                </div>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="bg-white p-8 rounded-xl shadow-md border border-gray-100 text-center text-gray-400">
                Your packing list is empty. Add a custom item below.
              </div>
            ) : categories.length === 0 ? (
              <div className="bg-white p-8 rounded-xl shadow-md border border-gray-100 text-center text-gray-400">
                No items match the selected filters.
              </div>
            ) : (
              categories.map((category) => (
                <div key={category} className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                  <h4 className="text-base font-extrabold text-gray-900 border-b pb-2 mb-4">
                    {category}
                  </h4>
                  <div className="space-y-3">
                    {visibleItems
                      .filter((i) => i.category === category)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center p-2 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              checked={item.isPacked}
                              onChange={() => handleTogglePack(item)}
                              className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <span
                              className={`text-sm ${
                                item.isPacked ? "line-through text-gray-400" : "text-gray-900"
                              }`}
                            >
                              {item.name} <span className="text-xs text-gray-500">(x{item.quantity})</span>
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                              {item.targetBag === "Suitcase" ? "🧳 Suitcase" : "🎒 Backpack"}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-gray-400 hover:text-red-500"
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
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 h-fit">
            <h4 className="text-base font-bold text-gray-900 mb-4">Add Custom Item</h4>
            <form onSubmit={handleAddCustom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Toothbrush, Rain Jacket"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Category</label>
                <select
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
                  <label className="block text-xs font-semibold text-gray-500 uppercase">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase">Pack In</label>
                  <select
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={customBag}
                    onChange={(e) => setCustomBag(e.target.value)}
                  >
                    <option value="Suitcase">🧳 Suitcase</option>
                    <option value="Backpack">🎒 Backpack</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-4 flex items-center justify-center py-2 px-4 border border-transparent text-sm font-semibold rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Plus size={16} className="mr-1" /> Add to List
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
