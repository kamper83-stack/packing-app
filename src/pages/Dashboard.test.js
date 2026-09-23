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
    getLocations: jest.fn(),
    searchFlights: jest.fn(),
    deleteTrip: jest.fn(),
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
// Async because the destination picker loads its country/city data from the API.
const fillTripForm = async (container, passengers = { women: 1 }) => {
  // Pick a country, then a city with an airport within it.
  const countrySelect = await screen.findByLabelText("Country");
  await waitFor(() =>
    expect(screen.getByLabelText("Country").querySelectorAll("option").length).toBeGreaterThan(1)
  );
  fireEvent.change(countrySelect, { target: { value: "Italy" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Rome" } });

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
  api.getLocations.mockResolvedValue({
    citiesByCountry: { Italy: ["Milan", "Rome"], France: ["Nice", "Paris"] },
  });
  api.getMe.mockResolvedValue({ isAdmin: false });
});

describe("Dashboard (Issue #9)", () => {
  it("loads and renders the user's trips as a clickable card that opens the checklist", async () => {
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
    const card = screen.getByText("Barcelona").closest('[role="button"]');
    expect(card).toHaveTextContent(/1 נשים/);
    expect(card).toHaveTextContent(/1 גברים/);
    expect(card.querySelector('[dir="rtl"]')).toHaveStyle({ unicodeBidi: "isolate" });
    expect(card).not.toHaveTextContent(/תינוקות/);
    expect(card).not.toHaveTextContent(/ילדים/);

    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith("/trip/t1");
  });

  it("does not navigate to the trip when the delete button is clicked", async () => {
    api.getTrips.mockResolvedValue([
      {
        id: "t1",
        destination: "Barcelona",
        startDate: "2026-09-01",
        endDate: "2026-09-05",
        airline: "EL AL",
        numPeople: 2,
        vacationType: "Beach Vacation",
      },
    ]);
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);

    renderDashboard();
    expect(await screen.findByText("Barcelona")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete trip to Barcelona/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith("/trip/t1");
    confirmSpy.mockRestore();
  });

  it("does not navigate when Enter is pressed while the delete button is focused (PR #127 review)", async () => {
    api.getTrips.mockResolvedValue([
      {
        id: "t1",
        destination: "Barcelona",
        startDate: "2026-09-01",
        endDate: "2026-09-05",
        airline: "EL AL",
        numPeople: 2,
        vacationType: "Beach Vacation",
      },
    ]);

    renderDashboard();
    expect(await screen.findByText("Barcelona")).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: /delete trip to Barcelona/i });

    fireEvent.keyDown(deleteButton, { key: "Enter" });

    expect(mockNavigate).not.toHaveBeenCalledWith("/trip/t1");
  });

  it("deletes a trip from the dashboard after confirmation", async () => {
    api.getTrips.mockResolvedValue([
      {
        id: "t1",
        destination: "Barcelona",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
        airline: "EL AL",
        numPeople: 1,
        vacationType: "City Trip",
      },
    ]);
    api.deleteTrip.mockResolvedValue({ message: "Trip deleted successfully." });
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    renderDashboard();
    expect(await screen.findByText("Barcelona")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete trip to Barcelona/i }));

    await waitFor(() => expect(api.deleteTrip).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(screen.queryByText("Barcelona")).not.toBeInTheDocument());
    confirmSpy.mockRestore();
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
    expect(screen.getByText(/4 travelers/)).toBeInTheDocument();
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

    await fillTripForm(container, { infants: 1, children: 2, women: 1, men: 1 });
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

    await fillTripForm(container, {});
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(await screen.findByText(/at least one passenger/i)).toBeInTheDocument();
    expect(api.createTrip).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/trip/"));
  });

  it("rejects fractional passenger counts with a clear message instead of truncating (Issue #35)", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    await fillTripForm(container, { women: 1.5 });
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

    await fillTripForm(container);
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

  it("starts both date pickers from today rather than January", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const today = new Date().toISOString().split("T")[0];
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs[0]).toHaveAttribute("min", today);
    expect(dateInputs[1]).toHaveAttribute("min", today);
  });
  it("moves to the end date picker and opens it after choosing a start date", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const [startInput, endInput] = dateInputs;

    startInput.focus();
    fireEvent.change(startInput, { target: { value: "2026-09-22" } });

    expect(endInput).toHaveValue("2026-09-22");
    expect(endInput).toHaveAttribute("min", "2026-09-22");
    expect(endInput).toHaveFocus();
  });

  it("keeps focus on the start-date picker when calendar arrow navigation changes its value", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const [startInput, endInput] = container.querySelectorAll('input[type="date"]');
    startInput.focus();
    fireEvent.keyDown(startInput, { key: "ArrowRight" });
    fireEvent.change(startInput, { target: { value: "2026-10-22" } });

    expect(startInput).toHaveFocus();
    expect(endInput).not.toHaveFocus();
    expect(endInput).toHaveValue("2026-10-22");
  });

  it("does not let month-only arrow navigation suppress a later date selection", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const [startInput, endInput] = container.querySelectorAll('input[type="date"]');
    startInput.focus();
    fireEvent.keyDown(startInput, { key: "PageDown" });
    fireEvent.keyUp(startInput, { key: "PageDown" });
    fireEvent.change(startInput, { target: { value: "2026-11-22" } });

    expect(endInput).toHaveFocus();
  });

  it("pulls an earlier end date forward when a later start date is chosen", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const [startInput, endInput] = dateInputs;

    fireEvent.change(endInput, { target: { value: "2026-09-03" } });
    // Choosing a start date after the current end date snaps the end date to it.
    fireEvent.change(startInput, { target: { value: "2026-09-10" } });
    expect(endInput).toHaveValue("2026-09-10");
  });

});
