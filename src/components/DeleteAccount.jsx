import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { api } from "../services/api";

// Self-service account deletion UI (Issue #160 / StoreReadiness A5 / gap G4).
// A store requirement (Apple Guideline 5.1.1(v), recommended by Google Play):
// the user must be able to delete their own account and data from inside the
// app. Deletion is irreversible, so it is gated behind an explicit confirmation
// dialog that re-asks for the current password before the request is sent.
export default function DeleteAccount() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword("");
    setError("");
  };

  const handleDelete = async (event) => {
    event.preventDefault();
    if (!password) {
      setError("Please enter your current password to confirm.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.deleteAccount(password);
      // Session is gone server-side; drop the token and return to login.
      localStorage.removeItem("token");
      navigate("/login");
    } catch (err) {
      setError(err.message || "Could not delete your account. Please try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost !py-2 !px-3 text-danger-700"
      >
        <Trash2 size={16} />
        <span className="hidden sm:inline">Delete account</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete account"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl border border-line">
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Trash2 size={18} className="text-danger-700" />
              Delete your account
            </h2>
            <p className="mt-2 text-sm text-ink/70">
              This permanently deletes your account and <strong>all of your trips
              and packing lists</strong>. This action cannot be undone. Enter your
              current password to confirm.
            </p>

            <form onSubmit={handleDelete} className="mt-4 space-y-3">
              <input
                type="password"
                autoComplete="current-password"
                aria-label="Current password"
                placeholder="Current password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={busy}
              />

              {error && (
                <div className="rounded-xl bg-danger-50 text-danger-700 px-3 py-2 text-sm border border-danger-200">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="btn-ghost !py-2 !px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-primary !py-2 !px-3 bg-danger-600 hover:bg-danger-700"
                >
                  {busy ? "Deleting…" : "Delete my account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
