import { render, screen } from "@testing-library/react";
import App from "./App";
import { api } from "./services/api";

jest.mock("./services/api", () => ({
  api: {
    getTrips: jest.fn(),
    createTrip: jest.fn(),
    getTrip: jest.fn(),
    getDestinations: jest.fn(),
    getMe: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  window.history.pushState({}, "", "/");
  api.getDestinations.mockResolvedValue({ destinations: [] });
  api.getMe.mockResolvedValue({ isAdmin: false });
});

test("renders the login screen when no token is stored", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /welcome back!/i })).toBeInTheDocument();
});

test("does not render the protected dashboard when unauthenticated", () => {
  render(<App />);
  expect(screen.queryByText(/plan a new trip/i)).not.toBeInTheDocument();
});

test("sends an unauthenticated visitor away from a protected route", () => {
  window.history.pushState({}, "", "/dashboard");
  render(<App />);
  expect(screen.getByRole("heading", { name: /welcome back!/i })).toBeInTheDocument();
  expect(screen.queryByText(/plan a new trip/i)).not.toBeInTheDocument();
});

test("lets an authenticated user into the dashboard", async () => {
  localStorage.setItem("token", "jwt-abc");
  api.getTrips.mockResolvedValue([]);
  window.history.pushState({}, "", "/dashboard");

  render(<App />);

  expect(await screen.findByText(/plan a new trip/i)).toBeInTheDocument();
});
