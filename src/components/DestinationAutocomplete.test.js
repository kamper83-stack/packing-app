import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DestinationAutocomplete from "./DestinationAutocomplete";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    getDestinations: jest.fn(),
  },
}));

// Controlled wrapper mirroring how the Dashboard uses the component, so the
// input reflects onChange and we can assert the value the form would submit.
function Harness(props) {
  const [value, setValue] = React.useState("");
  return (
    <div>
      <DestinationAutocomplete value={value} onChange={setValue} {...props} />
      <span data-testid="value">{value}</span>
    </div>
  );
}

const DESTINATIONS = ["Barcelona", "Paris", "Rome", "Tokyo"];

beforeEach(() => {
  jest.clearAllMocks();
  api.getDestinations.mockResolvedValue({ destinations: DESTINATIONS });
});

const getInput = () => screen.getByRole("combobox");

test("typing 'bar' surfaces Barcelona in the dropdown", async () => {
  render(<Harness />);
  await waitFor(() => expect(api.getDestinations).toHaveBeenCalled());

  fireEvent.change(getInput(), { target: { value: "bar" } });

  const option = await screen.findByRole("option", { name: "Barcelona" });
  expect(option).toBeInTheDocument();
  // Non-matching destinations are filtered out.
  expect(screen.queryByRole("option", { name: "Paris" })).not.toBeInTheDocument();
});

test("picking a suggestion fills the field and closes the dropdown", async () => {
  render(<Harness />);
  await waitFor(() => expect(api.getDestinations).toHaveBeenCalled());

  fireEvent.change(getInput(), { target: { value: "bar" } });
  const option = await screen.findByRole("option", { name: "Barcelona" });
  fireEvent.mouseDown(option);

  expect(getInput()).toHaveValue("Barcelona");
  expect(screen.getByTestId("value")).toHaveTextContent("Barcelona");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("free text that matches nothing is preserved and shows no dropdown", async () => {
  render(<Harness />);
  await waitFor(() => expect(api.getDestinations).toHaveBeenCalled());

  fireEvent.change(getInput(), { target: { value: "Reykjavik" } });

  expect(getInput()).toHaveValue("Reykjavik");
  expect(screen.getByTestId("value")).toHaveTextContent("Reykjavik");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("keyboard: ArrowDown highlights and Enter selects", async () => {
  render(<Harness />);
  await waitFor(() => expect(api.getDestinations).toHaveBeenCalled());

  const input = getInput();
  fireEvent.change(input, { target: { value: "o" } }); // Barcelona, Rome, Tokyo
  await screen.findByRole("listbox");

  fireEvent.keyDown(input, { key: "ArrowDown" }); // highlight first match
  fireEvent.keyDown(input, { key: "Enter" });

  // First "o" match in canonical order is Barcelona.
  expect(input).toHaveValue("Barcelona");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("Escape closes the dropdown without changing the value", async () => {
  render(<Harness />);
  await waitFor(() => expect(api.getDestinations).toHaveBeenCalled());

  const input = getInput();
  fireEvent.change(input, { target: { value: "bar" } });
  await screen.findByRole("listbox");

  fireEvent.keyDown(input, { key: "Escape" });

  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(input).toHaveValue("bar");
});

test("still works as a plain input when the suggestions request fails", async () => {
  api.getDestinations.mockRejectedValue(new Error("network"));
  render(<Harness />);
  await waitFor(() => expect(api.getDestinations).toHaveBeenCalled());

  fireEvent.change(getInput(), { target: { value: "Barcelona" } });

  expect(getInput()).toHaveValue("Barcelona");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
