// Tests for the frontend HTTP layer (src/services/api.js) — issue #101 / [T1].
// This layer builds the Authorization header and centralizes HTTP error
// handling for every backend call, so it is exercised here through the public
// `api` surface with `fetch` and `localStorage` mocked. Covers getHeaders (with
// and without a token) and request (401 with a JSON error body, 404 with no
// body, 204 No Content, success, and request construction).
import { api } from "./api";

const API_BASE = "http://localhost:5001/api";

// Build a minimal fetch Response stand-in.
function mockResponse({ ok = true, status = 200, json } = {}) {
  return {
    ok,
    status,
    json: json !== undefined ? json : () => Promise.resolve({}),
  };
}

describe("api service (frontend HTTP layer)", () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("getHeaders", () => {
    it("sends Content-Type and no Authorization header when no token is stored", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ json: () => Promise.resolve({ trips: [] }) })
      );

      await api.getTrips();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers.Authorization).toBeUndefined();
    });

    it("adds a Bearer Authorization header when a token is stored", async () => {
      localStorage.setItem("token", "jwt-123");
      fetchMock.mockResolvedValueOnce(mockResponse({ json: () => Promise.resolve({}) }));

      await api.getMe();

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer jwt-123");
    });
  });

  describe("request error handling", () => {
    it("throws the server-provided message on a JSON error body (401)", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Invalid credentials." }),
        })
      );

      await expect(api.login("a@b.com", "pw")).rejects.toThrow("Invalid credentials.");
    });

    it("throws a generic status message when the error body is not JSON (404)", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 404,
          json: () => Promise.reject(new Error("Unexpected end of JSON input")),
        })
      );

      await expect(api.getTrip(999)).rejects.toThrow("HTTP error! status: 404");
    });

    it("returns null for a 204 No Content response", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));

      await expect(api.deleteTrip(1)).resolves.toBeNull();
    });

    it("returns parsed JSON on a successful response", async () => {
      const payload = { id: 1, destination: "Rome" };
      fetchMock.mockResolvedValueOnce(
        mockResponse({ json: () => Promise.resolve(payload) })
      );

      await expect(api.getTrip(1)).resolves.toEqual(payload);
    });
  });

  describe("request construction", () => {
    it("login POSTs to /auth/login with the credentials in the body", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ json: () => Promise.resolve({ token: "t" }) })
      );

      await api.login("user@example.com", "secret");

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/auth/login`);
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({
        email: "user@example.com",
        password: "secret",
      });
    });

    it("deleteItem issues a DELETE to the item endpoint", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));

      await api.deleteItem(42);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/trips/item/42`);
      expect(options.method).toBe("DELETE");
    });

    it("updateTrip PUTs edited data to the trip endpoint", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ json: () => Promise.resolve({ id: "t1", destination: "Rome" }) })
      );
      const payload = { destination: "Rome", startDate: "2026-10-01", endDate: "2026-10-01" };

      await api.updateTrip("t1", payload);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/trips/t1`);
      expect(options.method).toBe("PUT");
      expect(JSON.parse(options.body)).toEqual(payload);
    });

    it("refreshWeather POSTs to the trip weather endpoint", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ json: () => Promise.resolve({ weatherSource: "live" }) })
      );

      await api.refreshWeather("t1");

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/trips/t1/weather`);
      expect(options.method).toBe("POST");
    });

    it("searchFlights builds the query string and omits origin/returnDate when absent", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ json: () => Promise.resolve({ offers: [], isMock: true }) })
      );

      await api.searchFlights({ destination: "Rome", departDate: "2026-11-01" });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain("/trips/flights?");
      expect(url).toContain("destination=Rome");
      expect(url).toContain("departDate=2026-11-01");
      expect(url).not.toContain("origin=");
      expect(url).not.toContain("returnDate=");
    });

    it("includes returnDate and ignores the removed origin field", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ json: () => Promise.resolve({ offers: [], isMock: false }) })
      );

      await api.searchFlights({
        origin: "Tel Aviv",
        destination: "Rome",
        departDate: "2026-11-01",
        returnDate: "2026-11-08",
      });

      const [url] = fetchMock.mock.calls[0];
      expect(url).not.toContain("origin=");
      expect(url).toContain("returnDate=2026-11-08");
    });
  });
});
