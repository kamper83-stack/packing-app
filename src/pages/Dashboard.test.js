import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";
import { api } from "../services/api";

// Capture navigation without a real router history.
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

// Stub the API layer so the component logic is tested in isolation.
jest.mock("../services/api", () => ({
  api: {
    getTrips: jest.fn(),
    createTrip: jest.fn(),
    getDestinations: jest.fn(),
    getMe: jest.fn(),
  },
}));

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );

// Fill the minimum required fields of the "Plan a New Trip" form.
// `passengers` overrides individual passenger-composition counts (defaults
// to a single adult woman so submission passes the "at least one" check).
const fillTripForm = (container, passengers = { women: 1 }) => {
  fireEvent.change(screen.getByPlaceholderText(/paris/i), { target: { value: "Rome" } });
  const dateInputs = container.querySelectorAll('input[type="date"]');
  fireEvent.change(dateInputs[0], { target: { value: "2026-09-01" } });
  fireEvent.change(dateInputs[1], { target: { value: "2026-09-05" } });
  for (const [key, value] of Object.entries(passengers)) {
    const label = { infants: /תינוקות/, children: /ילדים/, women: /נשים/, men: /גברים/ }[key];
    if (!label) continue;
    fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  api.getDestinations.mockResolvedValue({ destinations: [] });
  api.getMe.mockResolvedValue({ isAdmin: false });
});

describe("Dashboard (Issue #9)", () => {
  it("loads and renders the user's trips with a link to each checklist", async () => {
    api.getTrips.mockResolvedValue([
      {
        id: "t1",
        destination: "Barcelona",
        startDate: "2026-09-01",
        endDate: "2026-09-05",
        airline: "EL AL",
        numPeople: 2,
        passengerComposition: { infants: 0, children: 0, women: 1, men: 1 },
        vacationType: "Beach Vacation",
      },
    ]);

    renderDashboard();

    expect(await screen.findByText("Barcelona")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view checklist/i })).toHaveAttribute(
      "href",
      "/trip/t1"
    );
    const card = screen.getByText("Barcelona").closest("div");
    expect(card).toHaveTextContent(/1 נשים/);
    expect(card).toHaveTextContent(/1 גברים/);
    expect(card).not.toHaveTextContent(/תינוקות/);
    expect(card).not.toHaveTextContent(/ילדים/);
  });

  it("falls back to numPeople for legacy trips without a composition", async () => {
    api.getTrips.mockResolvedValue([
      {
        id: "legacy1",
        destination: "Legacy Town",
        startDate: "2026-09-01",
        endDate: "2026-09-05",
        airline: "EL AL",
        numPeople: 4,
        vacationType: "City Trip",
      },
    ]);

    renderDashboard();

    expect(await screen.findByText("Legacy Town")).toBeInTheDocument();
    expect(screen.getByText(/👥 4/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no trips", async () => {
    api.getTrips.mockResolvedValue([]);

    renderDashboard();

    expect(await screen.findByText(/no trips planned yet/i)).toBeInTheDocument();
  });

  it("creates a trip with the mixed passenger composition payload", async () => {
    api.getTrips.mockResolvedValue([]);
    api.createTrip.mockResolvedValue({ id: "new99" });

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    fillTripForm(container, { infants: 1, children: 2, women: 1, men: 1 });
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    await waitFor(() =>
      expect(api.createTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: "Rome",
          startDate: "2026-09-01",
          endDate: "2026-09-05",
          airline: "EL AL",
          passengerComposition: { infants: 1, children: 2, women: 1, men: 1 },
          vacationType: "City Trip",
        })
      )
    );
    const payload = api.createTrip.mock.calls[0][0];
    expect(payload).not.toHaveProperty("numPeople");
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/trip/new99"));
  });

  it("blocks submission with a clear error when all passenger counts are zero", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    fillTripForm(container, {});
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(await screen.findByText(/at least one passenger/i)).toBeInTheDocument();
    expect(api.createTrip).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/trip/"));
  });

  it("rejects fractional passenger counts with a clear message instead of truncating (Issue #35)", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    fillTripForm(container, { women: 1.5 });
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(await screen.findByText(/whole numbers/i)).toBeInTheDocument();
    expect(api.createTrip).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/trip/"));
  });

  it("surfaces the server error message when trip creation fails", async () => {
    api.getTrips.mockResolvedValue([]);
    api.createTrip.mockRejectedValue(new Error("Free trip quota exceeded"));

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    fillTripForm(container);
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(await screen.findByText(/free trip quota exceeded/i)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/trip/"));
  });

  it("logs out and redirects to the login page", async () => {
    localStorage.setItem("token", "abc");
    api.getTrips.mockResolvedValue([]);

    renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    fireEvent.click(screen.getByRole("button", { name: /logout/i }));

    expect(localStorage.getItem("token")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("shows a prominent Admin nav link only for admin users (Issue #49, #62)", async () => {
    api.getTrips.mockResolvedValue([]);
    api.getMe.mockResolvedValue({ isAdmin: true });

    renderDashboard();
    expect(await screen.findByRole("link", { name: /admin panel/i })).toHaveAttribute("href", "/admin");
  });

  it("hides the Admin nav link for non-admin users (Issue #62)", async () => {
    api.getTrips.mockResolvedValue([]);
    api.getMe.mockResolvedValue({ isAdmin: false });

    renderDashboard();
    // Wait for the trip form to render, then assert no admin link is present.
    await screen.findByText(/plan a new trip/i);
    expect(screen.queryByRole("link", { name: /admin panel/i })).not.toBeInTheDocument();
  });
});
