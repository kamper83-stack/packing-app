import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DestinationPicker from "./DestinationPicker";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { getLocations: jest.fn() },
}));

// Controlled harness mirroring how Dashboard drives the picker.
function Harness({ onChangeSpy }) {
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  return (
    <DestinationPicker
      country={country}
      city={city}
      onChange={(next) => {
        setCountry(next.country);
        setCity(next.city);
        if (onChangeSpy) onChangeSpy(next);
      }}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  api.getLocations.mockResolvedValue({
    citiesByCountry: { France: ["Nice", "Paris"], Italy: ["Milan", "Rome"] },
  });
});

test("loads countries and fills the city list only after a country is chosen", async () => {
  render(<Harness />);

  const countrySelect = await screen.findByLabelText("Country");
  await waitFor(() =>
    expect(countrySelect.querySelectorAll("option").length).toBeGreaterThan(1)
  );

  const citySelect = screen.getByLabelText("City");
  // City is disabled and empty until a country is selected.
  expect(citySelect).toBeDisabled();
  expect(citySelect.querySelectorAll("option[value]:not([value=''])").length).toBe(0);

  fireEvent.change(countrySelect, { target: { value: "Italy" } });

  expect(citySelect).not.toBeDisabled();
  const cityOptions = [...citySelect.querySelectorAll("option")].map((o) => o.textContent);
  expect(cityOptions).toContain("Rome");
  expect(cityOptions).toContain("Milan");
  expect(cityOptions).not.toContain("Paris"); // only the chosen country's cities
});

test("reports the chosen country and city through onChange, resetting city when country changes", async () => {
  const onChangeSpy = jest.fn();
  render(<Harness onChangeSpy={onChangeSpy} />);

  const countrySelect = await screen.findByLabelText("Country");
  await waitFor(() =>
    expect(countrySelect.querySelectorAll("option").length).toBeGreaterThan(1)
  );

  fireEvent.change(countrySelect, { target: { value: "Italy" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Rome" } });
  expect(onChangeSpy).toHaveBeenLastCalledWith({ country: "Italy", city: "Rome" });

  // Switching country clears the previously chosen city.
  fireEvent.change(countrySelect, { target: { value: "France" } });
  expect(onChangeSpy).toHaveBeenLastCalledWith({ country: "France", city: "" });
});

test("surfaces an alert when the locations request fails", async () => {
  api.getLocations.mockRejectedValue(new Error("network"));
  render(<Harness />);

  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load destinations/i);
});
