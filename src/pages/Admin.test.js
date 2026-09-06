import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Admin from "./Admin";
import { api } from "../services/api";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../services/api", () => ({
  api: {
    getMe: jest.fn(),
    getAdminStatus: jest.fn(),
    getAdminUsers: jest.fn(),
    getAdminLogs: jest.fn(),
    getAdminSystemLogs: jest.fn(),
  },
}));

const renderAdmin = () =>
  render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Admin panel (Issue #49)", () => {
  // Default the operational-logs call so tests that don't focus on it still
  // resolve the Admin page's Promise.all cleanly.
  beforeEach(() => {
    api.getAdminSystemLogs.mockResolvedValue({ logs: [], count: 0 });
  });

  it("redirects non-admin users to the dashboard", async () => {
    api.getMe.mockResolvedValue({ id: "u1", email: "a@b.com", isAdmin: false });

    renderAdmin();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(api.getAdminStatus).not.toHaveBeenCalled();
  });

  it("shows provider status, users, and logs for an admin", async () => {
    api.getMe.mockResolvedValue({ id: "u1", email: "admin@example.com", isAdmin: true });
    api.getAdminStatus.mockResolvedValue({
      useMocks: true,
      weather: {
        configured: false,
        suffix: null,
        mode: "mock",
        lastSource: "mock",
        lastError: null,
        lastAt: null,
      },
      gemini: {
        configured: true,
        suffix: "wxyz",
        mode: "live",
        lastSource: "live",
        lastError: null,
        lastAt: null,
      },
    });
    api.getAdminUsers.mockResolvedValue([
      {
        id: "u1",
        email: "admin@example.com",
        isAdmin: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        tripCount: 2,
      },
    ]);
    api.getAdminLogs.mockResolvedValue([
      {
        id: "t1",
        destination: "Barcelona",
        email: "admin@example.com",
        createdAt: "2026-08-20T00:00:00.000Z",
        weatherSource: "mock",
        weatherError: "WeatherAPI request failed (503)",
        aiSource: "mock",
        aiError: null,
      },
    ]);

    renderAdmin();

    expect(await screen.findByText("WeatherAPI")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
    // Email appears in the users table and again in the trip log.
    expect(screen.getAllByText("admin@example.com").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("cell", { name: "admin@example.com" })).toBeInTheDocument();
    expect(screen.getByText("Barcelona")).toBeInTheDocument();
    expect(screen.getByText(/weatherapi request failed/i)).toBeInTheDocument();
    expect(screen.queryByText(/ghp_/i)).not.toBeInTheDocument();
  });

  it("renders the operational system log viewer for an admin (Issue #62)", async () => {
    api.getMe.mockResolvedValue({ id: "u1", email: "admin@example.com", isAdmin: true });
    api.getAdminStatus.mockResolvedValue({
      useMocks: true,
      weather: { configured: false, suffix: null, mode: "mock", lastSource: null, lastError: null, lastAt: null },
      gemini: { configured: false, suffix: null, mode: "mock", lastSource: null, lastError: null, lastAt: null },
    });
    api.getAdminUsers.mockResolvedValue([]);
    api.getAdminLogs.mockResolvedValue([]);
    api.getAdminSystemLogs.mockResolvedValue({
      logs: [
        { id: 2, at: "2026-09-05T10:00:01.000Z", level: "error", message: "POST /api/trips 500", method: "POST", path: "/api/trips", status: 500, durationMs: 42 },
        { id: 1, at: "2026-09-05T10:00:00.000Z", level: "info", message: "GET /api/trips 200", method: "GET", path: "/api/trips", status: 200, durationMs: 8 },
      ],
      count: 2,
    });

    renderAdmin();

    expect(await screen.findByText(/operational system logs/i)).toBeInTheDocument();
    expect(screen.getByText("POST /api/trips 500")).toBeInTheDocument();
    expect(screen.getByText("GET /api/trips 200")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
  });
});
