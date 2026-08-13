import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the login screen when no token is stored", () => {
  localStorage.clear();
  render(<App />);
  // Unauthenticated users are redirected to the login page.
  expect(screen.getByRole("heading", { name: /welcome back!/i })).toBeInTheDocument();
});

test("does not render the protected dashboard when unauthenticated", () => {
  localStorage.clear();
  render(<App />);
  // The dashboard's "Plan a New Trip" form must not appear on the login page.
  expect(screen.queryByText(/plan a new trip/i)).not.toBeInTheDocument();
});
