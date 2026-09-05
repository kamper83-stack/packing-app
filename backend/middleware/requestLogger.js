const logStore = require("../services/logStore");

// Records each API request's outcome into the operational log buffer (Issue
// #62) so the Admin panel can show runtime activity, status codes, and errors.
// Level is derived from the response status: 5xx -> error, 4xx -> warn, else
// info. Health checks are skipped to avoid drowning the log in probe noise.
function requestLogger(req, res, next) {
  if (req.path === "/health") return next();

  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    logStore.record(level, `${req.method} ${req.originalUrl} ${status}`, {
      method: req.method,
      path: req.originalUrl,
      status,
      durationMs,
    });
  });

  next();
}

module.exports = requestLogger;
