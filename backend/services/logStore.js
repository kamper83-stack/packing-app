// In-memory operational log buffer (Issue #62). Captures runtime server events
// — API request/response statuses and errors — so the Admin panel can surface a
// live operational view without a full logging stack. This is a single-process,
// best-effort ring buffer: it is not persisted and resets on restart, which is
// acceptable for this app's single-container deployment.

const MAX_ENTRIES = 300;

// Newest entries are pushed to the end; the buffer is trimmed from the front
// once it exceeds MAX_ENTRIES.
const entries = [];
let nextId = 1;

const VALID_LEVELS = new Set(["info", "warn", "error"]);

// Record one operational event. `level` is info|warn|error (defaults to info);
// `meta` is a small object of extra fields (method, path, status, durationMs…).
function record(level, message, meta = {}) {
  const entry = {
    id: nextId++,
    at: new Date().toISOString(),
    level: VALID_LEVELS.has(level) ? level : "info",
    message: String(message),
    ...meta,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  return entry;
}

// Most recent first, optionally limited.
function list(limit = MAX_ENTRIES) {
  const capped = Math.max(1, Math.min(limit, MAX_ENTRIES));
  return entries.slice(-capped).reverse();
}

// Test/maintenance helper.
function clear() {
  entries.length = 0;
}

module.exports = { record, list, clear, MAX_ENTRIES };
