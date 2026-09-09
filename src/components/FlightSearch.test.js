import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FlightSearch from "./FlightSearch";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { searchFlights: jest.fn() },
}));

const OFFERS = [
  {
    id: "sample-0",
    price: 289,
    currency: "USD",
    departDate: "2026-09-01",
    returnDate: "2026-09-05",
    outbound: { from: "Tel Aviv", to: "Rome", airline: "EL AL", departTime: "2026-09-01T08:15:00" },
    inbound: { from: "Rome", to: "Tel Aviv", airline: "EL AL", departTime: "2026-09-05T19:40:00" },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

test("the search button is disabled until a destination and departure date exist", () => {
  render(<FlightSearch destination="" departDate="" returnDate="" onSelectDates={jest.fn()} />);
  expect(screen.getByRole("button", { name: /search flights/i })).toBeDisabled();
  expect(screen.getByText(/choose a destination and a departure date/i)).toBeInTheDocument();
});

test("searches and lets the user apply an offer's dates to the form", async () => {
  api.searchFlights.mockResolvedValue({ offers: OFFERS, isMock: true });
  const onSelectDates = jest.fn();

  render(
    <FlightSearch
      destination="Rome"
      departDate="2026-09-01"
      returnDate="2026-09-05"
      onSelectDates={onSelectDates}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /search flights/i }));

  await waitFor(() =>
    expect(api.searchFlights).toHaveBeenCalledWith({
      origin: "Tel Aviv",
      destination: "Rome",
      departDate: "2026-09-01",
      returnDate: "2026-09-05",
    })
  );

  // Sample-data notice and the offer are shown.
  expect(await screen.findByText(/showing sample flights/i)).toBeInTheDocument();
  expect(screen.getByText(/EL AL/)).toBeInTheDocument();

  // Applying the offer reports both dates back to the parent form.
  fireEvent.click(screen.getByRole("button", { name: /use dates/i }));
  expect(onSelectDates).toHaveBeenCalledWith({ departDate: "2026-09-01", returnDate: "2026-09-05" });
});

test("surfaces an error when the search fails", async () => {
  api.searchFlights.mockRejectedValue(new Error("network down"));

  render(
    <FlightSearch destination="Rome" departDate="2026-09-01" returnDate="" onSelectDates={jest.fn()} />
  );

  fireEvent.click(screen.getByRole("button", { name: /search flights/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/network down/i);
});
