import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import useDocumentTitle from "../utils/useDocumentTitle";

function formatTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function ProviderCard({ title, status }) {
  if (!status) return null;
  const configured = status.configured ? "Yes" : "No";
  const suffix = status.suffix ? `…${status.suffix}` : "not set";
  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
      <dl className="space-y-2 text-sm text-gray-700">
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
          <dt className="text-xs font-semibold text-gray-500 uppercase mb-1">Last error</dt>
          <dd className="text-xs text-amber-800 break-words">{status.lastError || "none"}</dd>
        </div>
        <div className="text-xs text-gray-500">Updated {formatTime(status.lastAt)}</div>
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
        const [nextStatus, nextUsers, nextLogs] = await Promise.all([
          api.getAdminStatus(),
          api.getAdminUsers(),
          api.getAdminLogs(),
        ]);
        if (cancelled) return;
        setStatus(nextStatus);
        setUsers(nextUsers);
        setLogs(nextLogs);
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
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-4">
              <span className="text-xl font-bold text-indigo-600">🎒 PackPlanner</span>
              <span className="text-sm font-semibold text-gray-500">Admin</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/dashboard" className="text-gray-600 hover:text-indigo-600 font-medium text-sm">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200">{error}</div>
        )}
        {loading ? (
          <div className="text-center py-10 text-gray-500">Loading admin panel...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ProviderCard title="WeatherAPI" status={status && status.weather} />
              <ProviderCard title="Gemini" status={status && status.gemini} />
            </div>
            {status && (
              <p className="text-xs text-gray-500">
                USE_MOCKS is {status.useMocks ? "on" : "off"}. Keys are never shown in full.
              </p>
            )}

            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Users</h3>
              {users.length === 0 ? (
                <p className="text-sm text-gray-500">No users yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-gray-500 border-b">
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

            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Recent trip logs</h3>
              {logs.length === 0 ? (
                <p className="text-sm text-gray-500">No provenance events yet.</p>
              ) : (
                <ul className="space-y-3">
                  {logs.map((log) => (
                    <li key={log.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                      <div className="font-semibold text-gray-900">
                        {log.destination}{" "}
                        <span className="text-xs font-normal text-gray-500">{log.email}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{formatTime(log.createdAt)}</div>
                      <div className="mt-2 text-xs text-gray-700">
                        Weather: {log.weatherSource || "unknown"}
                        {log.weatherError ? ` — ${log.weatherError}` : ""}
                      </div>
                      <div className="text-xs text-gray-700">
                        Gemini: {log.aiSource || "unknown"}
                        {log.aiError ? ` — ${log.aiError}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
