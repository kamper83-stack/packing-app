import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TripView from "./TripView";
import { api } from "../services/api";

// Fix the route param to a known trip id and capture navigation.
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: "t1" }),
}));

jest.mock("../services/api", () => ({
  api: {
    getTrip: jest.fn(),
    updateItem: jest.fn(),
    addCustomItem: jest.fn(),
    deleteItem: jest.fn(),
    deleteTrip: jest.fn(),
    updateTrip: jest.fn(),
    refreshWeather: jest.fn(),
  },
}));

const sampleTrip = {
  id: "t1",
  destination: "Barcelona",
  startDate: "2026-09-01",
  endDate: "2026-09-05",
  airline: "EL AL",
  numPeople: 2,
  passengerComposition: { infants: 0, children: 0, women: 1, men: 1 },
  weatherData: [{ date: "2026-09-01", tempC: 22, condition: "Sunny" }],
  PackingItems: [
    { id: "i1", name: "Shirts", category: "Clothing", quantity: 3, targetBag: "Suitcase", isPacked: false },
    { id: "i2", name: "Passport", category: "Documents", quantity: 1, targetBag: "Backpack", isPacked: true },
  ],
};

const renderTripView = () =>
  render(
    <MemoryRouter>
      <TripView />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe("TripView (Issue #10)", () => {
  it("renders trip details, category groups and packing progress", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);

    const { container } = renderTripView();

    expect(await screen.findByRole("heading", { name: "Barcelona" })).toBeInTheDocument();
    expect(screen.getByText(/Shirts/)).toBeInTheDocument();
    expect(screen.getByText(/Passport/)).toBeInTheDocument();
    // Items are grouped under their category headings.
    expect(screen.getByRole("heading", { name: "Clothing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    // 1 of 2 items packed -> 50%.
    expect(container.textContent).toContain("50%");
    expect(container.textContent).toContain("1 of 2 items");
    // Passenger composition is shown in place of the generic count.
    expect(container.textContent).toContain("1 נשים");
    expect(container.textContent).toContain("1 גברים");
  });

  it("falls back to the legacy numPeople count when no composition is stored", async () => {
    const legacy = { ...sampleTrip, passengerComposition: undefined, numPeople: 3 };
    api.getTrip.mockResolvedValue(legacy);

    const { container } = renderTripView();

    await screen.findByRole("heading", { name: "Barcelona" });
    expect(container.textContent).toContain("3 people");
  });

  it("toggles an item's packed status via its checkbox", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);
    api.updateItem.mockResolvedValue({ ...sampleTrip.PackingItems[0], isPacked: true });

    renderTripView();
    await screen.findByText(/Shirts/);

    // First checkbox is the (unpacked) Shirts item under "Clothing".
    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith("i1", { isPacked: true }));
  });

  it("adds a custom item through the form", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);
    api.addCustomItem.mockResolvedValue({
      id: "i3",
      name: "Rain Jacket",
      category: "Clothing",
      quantity: 1,
      targetBag: "Suitcase",
      isPacked: false,
    });

    renderTripView();
    await screen.findByText(/Shirts/);

    fireEvent.change(screen.getByPlaceholderText(/toothbrush/i), {
      target: { value: "Rain Jacket" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add to list/i }));

    await waitFor(() =>
      expect(api.addCustomItem).toHaveBeenCalledWith("t1", {
        name: "Rain Jacket",
        category: "Clothing", // default select value
        quantity: 1,
        targetBag: "Suitcase", // default select value
      })
    );
    expect(await screen.findByText(/Rain Jacket/)).toBeInTheDocument();
  });

  it("filters the checklist by target bag (Issue #43)", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);

    renderTripView();
    await screen.findByText(/Shirts/);

    // Shirts -> Suitcase, Passport -> Backpack. Filtering to the cabin
    // backpack should leave only the Passport visible.
    fireEvent.change(screen.getByLabelText(/filter by bag/i), { target: { value: "Backpack" } });

    expect(screen.getByText(/Passport/)).toBeInTheDocument();
    expect(screen.queryByText(/Shirts/)).not.toBeInTheDocument();
    // The empty category section for the hidden Suitcase item is gone too.
    expect(screen.queryByRole("heading", { name: "Clothing" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();

    // Switching to the checked suitcase flips which item is shown.
    fireEvent.change(screen.getByLabelText(/filter by bag/i), { target: { value: "Suitcase" } });
    expect(screen.getByText(/Shirts/)).toBeInTheDocument();
    expect(screen.queryByText(/Passport/)).not.toBeInTheDocument();
  });

  it("filters the checklist by packed status (Issue #43)", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);

    renderTripView();
    await screen.findByText(/Shirts/);

    // Shirts is unpacked, Passport is packed.
    fireEvent.change(screen.getByLabelText(/filter by packing status/i), {
      target: { value: "Packed" },
    });
    expect(screen.getByText(/Passport/)).toBeInTheDocument();
    expect(screen.queryByText(/Shirts/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/filter by packing status/i), {
      target: { value: "ToPack" },
    });
    expect(screen.getByText(/Shirts/)).toBeInTheDocument();
    expect(screen.queryByText(/Passport/)).not.toBeInTheDocument();
  });

  it("shows an empty-filter message when no item matches the active filters (Issue #43)", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);

    renderTripView();
    await screen.findByText(/Shirts/);

    // Packed items that live in the cabin backpack: Passport is packed but in
    // the backpack, Shirts is in the suitcase but unpacked -> no match for
    // "Suitcase" + "Packed".
    fireEvent.change(screen.getByLabelText(/filter by bag/i), { target: { value: "Suitcase" } });
    fireEvent.change(screen.getByLabelText(/filter by packing status/i), {
      target: { value: "Packed" },
    });

    expect(await screen.findByText(/no items match the selected filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/Shirts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Passport/)).not.toBeInTheDocument();
  });

  it("keeps overall progress based on all items even when a filter is active (Issue #43)", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);

    const { container } = renderTripView();
    await screen.findByText(/Shirts/);

    // Filter down to a single item; the progress summary must still reflect
    // the whole list (1 of 2 packed -> 50%).
    fireEvent.change(screen.getByLabelText(/filter by packing status/i), {
      target: { value: "ToPack" },
    });
    expect(container.textContent).toContain("50%");
    expect(container.textContent).toContain("1 of 2 items");
  });

  it("shows a live weather badge when the forecast came from WeatherAPI (Issue #36)", async () => {
    api.getTrip.mockResolvedValue({ ...sampleTrip, weatherSource: "live" });

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });

    expect(screen.getByLabelText(/live weather data/i)).toBeInTheDocument();
    // No fallback notice when the live call succeeded.
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
  });

  it("shows a sample-data badge and fallback notice when weather fell back to mock (Issue #36)", async () => {
    api.getTrip.mockResolvedValue({
      ...sampleTrip,
      weatherSource: "mock",
      weatherError: "WeatherAPI request failed (503)",
    });

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });

    expect(screen.getByLabelText(/sample weather data/i)).toBeInTheDocument();
    expect(screen.getByText(/live weather is temporarily unavailable/i)).toBeInTheDocument();
  });

  it("shows a seasonal-estimate badge and notice for a distant-future trip (Issue #65)", async () => {
    api.getTrip.mockResolvedValue({ ...sampleTrip, weatherSource: "seasonal" });

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });

    expect(screen.getByLabelText(/seasonal climate estimate/i)).toBeInTheDocument();
    expect(screen.getByText(/seasonal climate estimate based on typical weather/i)).toBeInTheDocument();
    // Not confused with the live badge.
    expect(screen.queryByLabelText(/live weather data/i)).not.toBeInTheDocument();
  });

  it("renders no weather source badge for legacy trips without provenance (Issue #36)", async () => {
    // sampleTrip has no weatherSource -> pre-#32 row must stay readable.
    api.getTrip.mockResolvedValue(sampleTrip);

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });

    expect(screen.queryByLabelText(/live weather data/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sample weather data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/live weather is temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it("shows an AI-personalized badge when the list was generated live (Issue #42)", async () => {
    api.getTrip.mockResolvedValue({ ...sampleTrip, aiSource: "live" });

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });

    expect(screen.getByLabelText(/ai personalized packing list/i)).toBeInTheDocument();
    // No fallback notice when the live generation succeeded.
    expect(
      screen.queryByText(/ai personalization was unavailable/i)
    ).not.toBeInTheDocument();
  });

  it("shows a standard-template badge and fallback notice when AI fell back to mock (Issue #42)", async () => {
    api.getTrip.mockResolvedValue({
      ...sampleTrip,
      aiSource: "mock",
      aiError: "Gemini request failed (429 quota exceeded)",
    });

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });

    expect(screen.getByLabelText(/standard template packing list/i)).toBeInTheDocument();
    expect(screen.getByText(/ai personalization was unavailable/i)).toBeInTheDocument();
  });

  it("renders no AI source badge for legacy trips without provenance (Issue #42)", async () => {
    // sampleTrip has no aiSource -> pre-#48 row must stay readable.
    api.getTrip.mockResolvedValue(sampleTrip);

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });

    expect(screen.queryByLabelText(/ai personalized packing list/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/standard template packing list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ai personalization was unavailable/i)).not.toBeInTheDocument();
  });

  it("edits trip inputs and replaces the checklist with the regenerated response", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);
    const regenerated = {
      ...sampleTrip,
      destination: "Rome",
      airline: "Wizz Air",
      passengerComposition: { infants: 0, children: 1, women: 1, men: 1 },
      numPeople: 3,
      PackingItems: [
        { id: "new-1", name: "Rain Jacket", category: "Clothing", quantity: 3, targetBag: "Suitcase", isPacked: false },
      ],
    };
    api.updateTrip.mockResolvedValue(regenerated);

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });
    fireEvent.click(screen.getByRole("button", { name: /edit & regenerate/i }));
    fireEvent.change(screen.getByLabelText(/destination city/i), { target: { value: "Rome" } });
    fireEvent.change(screen.getByLabelText("ילדים"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes & regenerate/i }));

    await waitFor(() =>
      expect(api.updateTrip).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({
          destination: "Rome",
          passengerComposition: { infants: 0, children: 1, women: 1, men: 1 },
        })
      )
    );
    expect(await screen.findByRole("heading", { name: "Rome" })).toBeInTheDocument();
    expect(screen.getByText(/Rain Jacket/)).toBeInTheDocument();
    expect(screen.queryByText(/Shirts/)).not.toBeInTheDocument();
  });

  it("refreshes the displayed weather and replaces the weather-dependent packing list", async () => {
    api.getTrip.mockResolvedValue({ ...sampleTrip, weatherSource: "live" });
    api.refreshWeather.mockResolvedValue({
      ...sampleTrip,
      weatherSource: "live",
      weatherData: [{ date: "2026-09-01", tempC: 9, condition: "Rain" }],
      PackingItems: [
        { id: "rain-1", name: "Rain Jacket", category: "Clothing", quantity: 2, targetBag: "Suitcase", isPacked: false },
      ],
    });

    renderTripView();
    await screen.findByText("22°");
    fireEvent.click(screen.getByRole("button", { name: /refresh weather and packing list/i }));

    await waitFor(() => expect(api.refreshWeather).toHaveBeenCalledWith("t1"));
    expect(await screen.findByText("9°")).toBeInTheDocument();
    expect(screen.getByText("Rain")).toBeInTheDocument();
    expect(screen.getByText(/Rain Jacket/)).toBeInTheDocument();
    expect(screen.queryByText(/Shirts/)).not.toBeInTheDocument();
    expect(api.updateTrip).not.toHaveBeenCalled();
  });

  it("keeps the trip visible when weather refresh fails", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);
    api.refreshWeather.mockRejectedValue(new Error("Weather service unavailable"));

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });
    fireEvent.click(screen.getByRole("button", { name: /refresh weather and packing list/i }));

    expect(await screen.findByText(/weather service unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Barcelona" })).toBeInTheDocument();
  });

  it("shows an error state when the trip cannot be loaded", async () => {
    api.getTrip.mockRejectedValue(new Error("boom"));

    renderTripView();

    expect(await screen.findByText(/failed to fetch trip details/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go back to dashboard/i })).toBeInTheDocument();
  });

  it("deletes the trip after confirmation and returns to the dashboard", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);
    api.deleteTrip.mockResolvedValue(null);
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });

    fireEvent.click(screen.getByRole("button", { name: /delete trip/i }));

    await waitFor(() => expect(api.deleteTrip).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));

    confirmSpy.mockRestore();
  });

  // ---- Airline is no longer a user-chosen field (backend still requires it) ----

  it("does not offer an airline selector in the edit form", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });
    fireEvent.click(screen.getByRole("button", { name: /edit & regenerate/i }));

    expect(screen.queryByLabelText(/airline/i)).not.toBeInTheDocument();
  });

  it("preserves the trip's original airline even though the edit form no longer shows it", async () => {
    api.getTrip.mockResolvedValue({ ...sampleTrip, airline: "Wizz Air" });
    api.updateTrip.mockResolvedValue({ ...sampleTrip, airline: "Wizz Air" });

    const { container } = renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });
    fireEvent.click(screen.getByRole("button", { name: /edit & regenerate/i }));

    // Change a different field (the start date) and save.
    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-09-02" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes & regenerate/i }));

    await waitFor(() =>
      expect(api.updateTrip).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ airline: "Wizz Air" })
      )
    );
  });

  it("loads the trip's stored trolley count into the edit form and sends changes", async () => {
    api.getTrip.mockResolvedValue({ ...sampleTrip, trolleyCount: 3 });
    api.updateTrip.mockResolvedValue({ ...sampleTrip, trolleyCount: 3 });

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });
    fireEvent.click(screen.getByRole("button", { name: /edit & regenerate/i }));

    expect(screen.getByLabelText(/trolley/i)).toHaveValue(3);
    fireEvent.change(screen.getByLabelText(/trolley/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes & regenerate/i }));

    await waitFor(() =>
      expect(api.updateTrip).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ trolleyCount: 5 })
      )
    );
  });

  it("allows and sends a trolley count of zero on save", async () => {
    api.getTrip.mockResolvedValue({ ...sampleTrip, trolleyCount: 0 });
    api.updateTrip.mockResolvedValue({ ...sampleTrip, trolleyCount: 0 });

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });
    fireEvent.click(screen.getByRole("button", { name: /edit & regenerate/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes & regenerate/i }));

    await waitFor(() =>
      expect(api.updateTrip).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ trolleyCount: 0 })
      )
    );
  });

  it("rejects a fractional trolley count instead of silently truncating it", async () => {
    api.getTrip.mockResolvedValue(sampleTrip);

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });
    fireEvent.click(screen.getByRole("button", { name: /edit & regenerate/i }));

    fireEvent.change(screen.getByLabelText(/trolley/i), { target: { value: "3.7" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes & regenerate/i }));

    expect(await screen.findByText(/whole number/i)).toBeInTheDocument();
    expect(api.updateTrip).not.toHaveBeenCalled();
  });

  it("shows the automatic cabin-backpack count based on the trip's passengers in the edit form", async () => {
    api.getTrip.mockResolvedValue(sampleTrip); // 2 passengers (1 woman, 1 man)

    renderTripView();
    await screen.findByRole("heading", { name: "Barcelona" });
    fireEvent.click(screen.getByRole("button", { name: /edit & regenerate/i }));

    expect(screen.getByText(/2 cabin backpacks per traveler/i)).toBeInTheDocument();
  });
});
