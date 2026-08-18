import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Signup from "./Signup";
import { api } from "../services/api";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../services/api", () => ({
  api: {
    register: jest.fn(),
  },
}));

const renderSignup = () =>
  render(
    <MemoryRouter>
      <Signup />
    </MemoryRouter>
  );

const fillSignupForm = ({ password = "secret12", confirm = "secret12" } = {}) => {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "new@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: confirm },
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe("Signup (Issue #5)", () => {
  it("stores the JWT and navigates to the dashboard after a successful signup", async () => {
    api.register.mockResolvedValue({ token: "jwt-new", user: { id: "u2", email: "new@example.com" } });

    renderSignup();
    fillSignupForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => expect(api.register).toHaveBeenCalledWith("new@example.com", "secret12"));
    expect(localStorage.getItem("token")).toBe("jwt-new");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects mismatched passwords without calling the API", async () => {
    renderSignup();
    fillSignupForm({ password: "secret12", confirm: "other12" });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("surfaces the server error when registration fails", async () => {
    api.register.mockRejectedValue(new Error("User already exists with this email."));

    renderSignup();
    fillSignupForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText(/user already exists with this email/i)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith("/dashboard");
  });

  it("links to the login screen", () => {
    renderSignup();
    expect(screen.getByRole("link", { name: /sign in here/i })).toHaveAttribute("href", "/login");
  });
});
