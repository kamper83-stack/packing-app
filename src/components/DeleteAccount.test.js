import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DeleteAccount from "./DeleteAccount";
import { api } from "../services/api";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../services/api", () => ({
  api: { deleteAccount: jest.fn() },
}));

const renderComponent = () =>
  render(
    <MemoryRouter>
      <DeleteAccount />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem("token", "fake-jwt");
});

describe("DeleteAccount (Issue #160)", () => {
  it("does not open the confirmation dialog until the trigger is clicked", () => {
    renderComponent();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  it("opens a confirmation dialog that warns the deletion is permanent", () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/cannot be undone/i);
  });

  it("requires a password before calling the API", () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    // Submit with an empty password field.
    fireEvent.click(
      screen.getByRole("button", { name: /^delete my account$/i })
    );

    expect(api.deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/enter your current password/i);
  });

  it("deletes the account, clears the token and redirects to login on success", async () => {
    api.deleteAccount.mockResolvedValueOnce({ message: "deleted" });
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete my account$/i }));

    await waitFor(() =>
      expect(api.deleteAccount).toHaveBeenCalledWith("Password123!")
    );
    expect(localStorage.getItem("token")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("shows the server error and keeps the session when deletion fails", async () => {
    api.deleteAccount.mockRejectedValueOnce(new Error("Invalid password."));
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete my account$/i }));

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent(/invalid password/i)
    );
    expect(localStorage.getItem("token")).toBe("fake-jwt");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
