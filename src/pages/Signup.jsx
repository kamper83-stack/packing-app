import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { api } from "../services/api";
import useDocumentTitle from "../utils/useDocumentTitle";
import Logo from "../components/Logo";

export default function Signup() {
  useDocumentTitle("Sign Up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    setLoading(true);
    try {
      const data = await api.register(email, password);
      localStorage.setItem("token", data.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper bg-paper-glow flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <div className="card p-8">
          <div className="mb-7">
            <p className="eyebrow">Get started</p>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">Create your account</h1>
            <p className="mt-1.5 text-sm text-muted">
              Smart, weather-aware packing lists for every trip.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl bg-danger-50 text-danger-700 px-4 py-3 text-sm border border-danger-200">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="signup-email" className="label">Email address</label>
              <input
                id="signup-email"
                type="email"
                required
                autoComplete="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="label">Password</label>
              <input
                id="signup-password"
                type="password"
                required
                autoComplete="new-password"
                className="input"
                placeholder="Choose a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="signup-confirm-password" className="label">Confirm password</label>
              <input
                id="signup-confirm-password"
                type="password"
                required
                autoComplete="new-password"
                className="input"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Creating account…" : "Sign up"}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
