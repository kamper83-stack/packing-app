import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

// Test dates must be derived from the live clock: hardcoded dates decay
// (CI goes red once the real calendar passes them) because the onChange
// guard clamps any past value to today. +30/+34 days keeps every date
// future-proof indefinitely.
const isoDate = (d) => d.toISOString().split("T")[0];
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
const FUTURE_START = daysFromNow(30);
const FUTURE_END = daysFromNow(34);

// Local "today" as the Dashboard computes it (timezone-shifted, not UTC).
// Used to assert the past-date clamp without hardcoding calendar dates.
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
};

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
  fireEvent.change(dateInputs[0], { target: { value: FUTURE_START } });
  fireEvent.change(dateInputs[1], { target: { value: FUTURE_END } });
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
        startDate: FUTURE_START,
        endDate: FUTURE_END,
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
        startDate: FUTURE_START,
        endDate: FUTURE_END,
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
        startDate: FUTURE_START,
        endDate: FUTURE_END,
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
        startDate: FUTURE_START,
        endDate: FUTURE_END,
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
        startDate: FUTURE_START,
        endDate: FUTURE_END,
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
          startDate: FUTURE_START,
          endDate: FUTURE_END,
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
    fireEvent.change(startInput, { target: { value: FUTURE_START } });

    expect(endInput).toHaveValue(FUTURE_START);
    expect(endInput).toHaveAttribute("min", FUTURE_START);
    expect(endInput).toHaveFocus();
  });

  it("keeps focus on the start-date picker when calendar arrow navigation changes its value", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const [startInput, endInput] = container.querySelectorAll('input[type="date"]');
    startInput.focus();
    fireEvent.keyDown(startInput, { key: "ArrowRight" });
    fireEvent.change(startInput, { target: { value: FUTURE_START } });

    expect(startInput).toHaveFocus();
    expect(endInput).not.toHaveFocus();
    expect(endInput).toHaveValue(FUTURE_START);
  });

  it("does not let month-only arrow navigation suppress a later date selection", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const [startInput, endInput] = container.querySelectorAll('input[type="date"]');
    startInput.focus();
    fireEvent.keyDown(startInput, { key: "PageDown" });
    fireEvent.keyUp(startInput, { key: "PageDown" });
    fireEvent.change(startInput, { target: { value: daysFromNow(45) } });

    expect(endInput).toHaveFocus();
  });

  it("pulls an earlier end date forward when a later start date is chosen", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const [startInput, endInput] = dateInputs;

    const laterStart = daysFromNow(40);
    // Choosing a start date after the current end date snaps the end date to it.
    fireEvent.change(endInput, { target: { value: daysFromNow(35) } });
    fireEvent.change(startInput, { target: { value: laterStart } });
    expect(endInput).toHaveValue(laterStart);
  });

  it("clamps a past start date to local today (past-date guard regression, PR #144)", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const [startInput] = container.querySelectorAll('input[type="date"]');
    // Unambiguously past in every timezone (not just yesterday-local).
    fireEvent.change(startInput, { target: { value: daysFromNow(-5) } });
    expect(startInput).toHaveValue(localToday());
  });

  it("floors a past end date to the chosen future start date (PR #144)", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const [startInput, endInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: FUTURE_START } });
    fireEvent.change(endInput, { target: { value: daysFromNow(-5) } });
    expect(endInput).toHaveValue(FUTURE_START);
  });

  it("keeps the start input min pinned to local today after a start date is chosen (PR #144)", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const [startInput] = container.querySelectorAll('input[type="date"]');
    expect(startInput).toHaveAttribute("min", localToday());
    fireEvent.change(startInput, { target: { value: FUTURE_START } });
    // Regression: min must stay today so an earlier-but-future day remains selectable.
    expect(startInput).toHaveAttribute("min", localToday());
  });

  // ---- Stale-tab / midnight rollover (review: expert on PR #144) ----
  // A tab left open across local midnight fires no onChange and (without the
  // visibility/focus refresh) no re-render either, so render-time min
  // attributes and already-selected values can silently go stale.

  it("refreshes min bounds when the tab regains visibility after midnight (PR #144)", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    const [startInput, endInput] = container.querySelectorAll('input[type="date"]');
    expect(startInput).toHaveAttribute("min", localToday());

    // Freeze the clock just before local midnight, pick today, then cross
    // into the next day with the tab idle (no date change fires).
    const beforeMidnight = new Date();
    beforeMidnight.setHours(23, 58, 0, 0);
    jest.useFakeTimers();
    try {
      jest.setSystemTime(beforeMidnight);
      fireEvent.change(startInput, { target: { value: localToday() } });
      expect(startInput).toHaveValue(localToday());

      jest.setSystemTime(new Date(beforeMidnight.getTime() + 5 * 60000));
      const rolledToday = localToday();
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Both mins now name the new day; the end floor is max(start, today),
      // so the yesterday-selected start cannot drag it into the past.
      expect(startInput).toHaveAttribute("min", rolledToday);
      expect(endInput).toHaveAttribute("min", rolledToday);
    } finally {
      jest.useRealTimers();
    }
  });

  it("reconciles stale selected dates to today on submit after midnight (PR #144)", async () => {
    api.getTrips.mockResolvedValue([]);
    api.createTrip.mockResolvedValue({ id: "t1" });

    const { container } = renderDashboard();
    await screen.findByText(/plan a new trip/i);

    await fillTripForm(container);

    // The tab sits idle for 40 days: both selected dates are now in the
    // past and no onChange will ever fire for them.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date(Date.now() + 40 * 86400000));
      const rolledToday = localToday();

      fireEvent.submit(container.querySelector("form"));

      // The submit-time reconciliation clamps to the same floor the inputs
      // enforce instead of sending stale dates to the backend.
      expect(api.createTrip).toHaveBeenCalledTimes(1);
      const payload = api.createTrip.mock.calls[0][0];
      expect(payload.startDate).toBe(rolledToday);
      expect(payload.endDate).toBe(rolledToday);
    } finally {
      jest.useRealTimers();
    }
  });

  // ---- Airline is no longer a user-chosen field (backend still requires it) ----

  it("does not offer an airline selector in the create form", async () => {
    api.getTrips.mockResolvedValue([]);

    renderDashboard();
    await screen.findByText(/plan a new trip/i);

    expect(screen.queryByLabelText(/airline/i)).not.toBeInTheDocument();
  });

  // ---- Trolley / checked-suitcase count ----\\

  it("sends separate default trolley and checked-suitcase counts", async () => {
    api.getTrips.mockResolvedValue([]);
    api.createTrip.mockResolvedValue({ id: "t1" });

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    await fillTripForm(container);
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    await waitFor(() => expect(api.createTrip).toHaveBeenCalled());
    expect(api.createTrip.mock.calls[0][0].trolleyCount).toBe(1);
    expect(api.createTrip.mock.calls[0][0].checkedSuitcaseCount).toBe(1);
  });

  it("sends a non-default trolleyCount when the user changes it", async () => {
    api.getTrips.mockResolvedValue([]);
    api.createTrip.mockResolvedValue({ id: "t1" });

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    await fillTripForm(container);
    fireEvent.change(screen.getByLabelText(/trolley/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/checked suitcases/i), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    await waitFor(() => expect(api.createTrip).toHaveBeenCalled());
    expect(api.createTrip.mock.calls[0][0].trolleyCount).toBe(3);
    expect(api.createTrip.mock.calls[0][0].checkedSuitcaseCount).toBe(4);
  });

  it("allows and sends a trolleyCount of zero", async () => {
    api.getTrips.mockResolvedValue([]);
    api.createTrip.mockResolvedValue({ id: "t1" });

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    await fillTripForm(container);
    fireEvent.change(screen.getByLabelText(/trolley/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    await waitFor(() => expect(api.createTrip).toHaveBeenCalled());
    expect(api.createTrip.mock.calls[0][0].trolleyCount).toBe(0);
  });

  it("rejects a fractional trolleyCount instead of silently truncating it", async () => {
    api.getTrips.mockResolvedValue([]);
    api.createTrip.mockResolvedValue({ id: "t1" });

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    await fillTripForm(container);
    fireEvent.change(screen.getByLabelText(/trolley/i), { target: { value: "3.7" } });
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(await screen.findByText(/whole number/i)).toBeInTheDocument();
    expect(api.createTrip).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/trip/"));
  });

  it("shows the automatic cabin-backpack count based on the chosen passengers", async () => {
    api.getTrips.mockResolvedValue([]);

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    await fillTripForm(container, { women: 2, men: 1 });
    expect(screen.getByText(/3 cabin backpacks per traveler/i)).toBeInTheDocument();
  });

});
