import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { ChevronLeft } from "lucide-react";
import Logo from "../components/Logo";
import useDocumentTitle from "../utils/useDocumentTitle";

function formatTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

// Issue #62: colour a runtime log line by severity.
const LOG_LEVEL_STYLES = {
  error: "bg-red-50 text-red-700 border-red-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-stone-100 text-muted border-stone-200",
};

function ProviderCard({ title, status }) {
  if (!status) return null;
  const configured = status.configured ? "Yes" : "No";
  const suffix = status.suffix ? `…${status.suffix}` : "not set";
  return (
    <div className="card p-6">
      <h3 className="text-lg font-bold text-ink mb-3">{title}</h3>
      <dl className="space-y-2 text-sm text-ink">
        <div className="flex justify-between gap-4">
          <dt>Configured</dt>
          <dd className="font-semibold">{configured}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Key</dt>
          <dd className="font-mono text-xs">{suffix}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Mode</dt>
          <dd className="font-semibold capitalize">{status.mode}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Last source</dt>
          <dd>{status.lastSource || "none yet"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted uppercase mb-1">Last error</dt>
          <dd className="text-xs text-amber-800 break-words">{status.lastError || "none"}</dd>
        </div>
        <div className="text-xs text-muted">Updated {formatTime(status.lastAt)}</div>
      </dl>
    </div>
  );
}

export default function Admin() {
  useDocumentTitle("Admin");
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await api.getMe();
        if (!me.isAdmin) {
          navigate("/dashboard", { replace: true });
          return;
        }
        const [nextStatus, nextUsers, nextLogs, nextSystemLogs] = await Promise.all([
          api.getAdminStatus(),
          api.getAdminUsers(),
          api.getAdminLogs(),
          api.getAdminSystemLogs(),
        ]);
        if (cancelled) return;
        setStatus(nextStatus);
        setUsers(nextUsers);
        setLogs(nextLogs);
        setSystemLogs(Array.isArray(nextSystemLogs?.logs) ? nextSystemLogs.logs : []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load admin data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-paper bg-paper-glow">
      <nav className="sticky top-0 z-20 bg-surface/80 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Logo size="md" />
              <span className="badge border-brand-100 bg-brand-50 text-brand-700">Admin</span>
            </div>
            <Link to="/dashboard" className="btn-ghost !py-2 !px-3">
              <ChevronLeft size={16} /> Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">
        {error && (
          <div className="rounded-xl bg-accent-50 text-accent-700 px-4 py-3 text-sm border border-accent-200">{error}</div>
        )}
        {loading ? (
          <div className="text-center py-10 text-muted">Loading admin panel...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ProviderCard title="WeatherAPI" status={status && status.weather} />
              <ProviderCard title="Gemini" status={status && status.gemini} />
            </div>
            {status && (
              <p className="text-xs text-muted">
                USE_MOCKS is {status.useMocks ? "on" : "off"}. Keys are never shown in full.
              </p>
            )}

            <div className="card p-6">
              <h3 className="text-lg font-bold text-ink mb-4">Users</h3>
              {users.length === 0 ? (
                <p className="text-sm text-muted">No users yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted border-b">
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Created</th>
                        <th className="py-2 pr-4">Trips</th>
                        <th className="py-2">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{user.email}</td>
                          <td className="py-2 pr-4">{formatTime(user.createdAt)}</td>
                          <td className="py-2 pr-4">{user.tripCount}</td>
                          <td className="py-2">{user.isAdmin ? "Admin" : "User"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-bold text-ink mb-4">Recent trip logs</h3>
              {logs.length === 0 ? (
                <p className="text-sm text-muted">No provenance events yet.</p>
              ) : (
                <ul className="space-y-3">
                  {logs.map((log) => (
                    <li key={log.id} className="border border-line rounded-xl p-3 text-sm">
                      <div className="font-semibold text-ink">
                        {log.destination}{" "}
                        <span className="text-xs font-normal text-muted">{log.email}</span>
                      </div>
                      <div className="text-xs text-muted mt-1">{formatTime(log.createdAt)}</div>
                      <div className="mt-2 text-xs text-ink">
                        Weather: {log.weatherSource || "unknown"}
                        {log.weatherError ? ` — ${log.weatherError}` : ""}
                      </div>
                      <div className="text-xs text-ink">
                        Gemini: {log.aiSource || "unknown"}
                        {log.aiError ? ` — ${log.aiError}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Issue #62: operational system log viewer — runtime API activity,
                status codes, and errors captured in-process. */}
            <div className="card p-6">
              <h3 className="text-lg font-bold text-ink mb-1">Operational system logs</h3>
              <p className="text-xs text-muted mb-4">
                Recent runtime API requests and errors (most recent first, in-memory).
              </p>
              {systemLogs.length === 0 ? (
                <p className="text-sm text-muted">No runtime events recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted border-b">
                        <th className="py-2 pr-4">Time</th>
                        <th className="py-2 pr-4">Level</th>
                        <th className="py-2 pr-4">Event</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemLogs.map((entry) => (
                        <tr key={entry.id} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-4 whitespace-nowrap text-xs text-muted">
                            {formatTime(entry.at)}
                          </td>
                          <td className="py-2 pr-4">
                            <span
                              className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                LOG_LEVEL_STYLES[entry.level] || LOG_LEVEL_STYLES.info
                              }`}
                            >
                              {entry.level}
                            </span>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs text-ink break-all">
                            {entry.message}
                          </td>
                          <td className="py-2 text-xs text-ink whitespace-nowrap">
                            {entry.status != null ? entry.status : "—"}
                            {entry.durationMs != null ? ` · ${entry.durationMs}ms` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
