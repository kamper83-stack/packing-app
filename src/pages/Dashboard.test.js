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
  },
}));

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );

// Fill the minimum required fields of the "Plan a New Trip" form.
const fillTripForm = (container) => {
  fireEvent.change(screen.getByPlaceholderText(/paris/i), { target: { value: "Rome" } });
  const dateInputs = container.querySelectorAll('input[type="date"]');
  fireEvent.change(dateInputs[0], { target: { value: "2026-09-01" } });
  fireEvent.change(dateInputs[1], { target: { value: "2026-09-05" } });
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
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
        vacationType: "Beach Vacation",
      },
    ]);

    renderDashboard();

    expect(await screen.findByText("Barcelona")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view checklist/i })).toHaveAttribute(
      "href",
      "/trip/t1"
    );
  });

  it("shows an empty state when there are no trips", async () => {
    api.getTrips.mockResolvedValue([]);

    renderDashboard();

    expect(await screen.findByText(/no trips planned yet/i)).toBeInTheDocument();
  });

  it("creates a trip and navigates to its checklist", async () => {
    api.getTrips.mockResolvedValue([]);
    api.createTrip.mockResolvedValue({ id: "new99" });

    const { container } = renderDashboard();
    await screen.findByText(/no trips planned yet/i);

    fillTripForm(container);
    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    await waitFor(() =>
      expect(api.createTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: "Rome",
          startDate: "2026-09-01",
          endDate: "2026-09-05",
          airline: "EL AL",
          numPeople: 1, // parsed from the default "1"
          vacationType: "City Trip",
        })
      )
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/trip/new99"));
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
});
