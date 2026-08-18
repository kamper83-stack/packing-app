import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";
import { api } from "../services/api";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../services/api", () => ({
  api: {
    login: jest.fn(),
  },
}));

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );

const fillLoginForm = () => {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "eran@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: "secret12" },
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe("Login (Issue #5)", () => {
  it("stores the JWT and navigates to the dashboard on success", async () => {
    api.login.mockResolvedValue({ token: "jwt-123", user: { id: "u1", email: "eran@example.com" } });

    renderLogin();
    fillLoginForm();
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("eran@example.com", "secret12"));
    expect(localStorage.getItem("token")).toBe("jwt-123");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("surfaces the server error and does not store a token on failure", async () => {
    api.login.mockRejectedValue(new Error("Invalid email or password."));

    renderLogin();
    fillLoginForm();
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalledWith("/dashboard");
  });

  it("links to the signup screen", () => {
    renderLogin();
    expect(screen.getByRole("link", { name: /sign up here/i })).toHaveAttribute("href", "/signup");
  });
});
