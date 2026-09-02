const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001/api";

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  // Handle delete or empty responses
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email, password) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => request("/auth/me"),

  getTrips: () => request("/trips"),

  getTrip: (id) => request(`/trips/${id}`),

  createTrip: (tripData) =>
    request("/trips", {
      method: "POST",
      body: JSON.stringify(tripData),
    }),

  deleteTrip: (id) =>
    request(`/trips/${id}`, {
      method: "DELETE",
    }),

  addCustomItem: (tripId, itemData) =>
    request(`/trips/${tripId}/custom-item`, {
      method: "POST",
      body: JSON.stringify(itemData),
    }),

  updateItem: (itemId, updateData) =>
    request(`/trips/item/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(updateData),
    }),

  deleteItem: (itemId) =>
    request(`/trips/item/${itemId}`, {
      method: "DELETE",
    }),

  getAirlines: () => request("/trips/config/airlines"),

  getDestinations: () => request("/trips/destinations"),

  getAdminStatus: () => request("/admin/status"),

  getAdminUsers: () => request("/admin/users"),

  getAdminLogs: () => request("/admin/logs"),
};
