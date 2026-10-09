const rateLimit = require("express-rate-limit");
const logStore = require("../services/logStore");

// Issue #161 / StoreReadiness A7 / gap G6: brute-force protection for the
// credential endpoints (POST /api/auth/register and /login). Without a limit an
// attacker can spray passwords or hammer signup from a single IP. Authenticated
// endpoints (GET/DELETE /api/auth/me) are deliberately left unthrottled so
// ordinary app traffic — e.g. the /auth/me call on every page load — is never
// affected.
//
// Tunable via env so ops can tighten/loosen without a code change:
//   AUTH_RATE_LIMIT_WINDOW_MS  window length in ms (default 60000 = 1 minute)
//   AUTH_RATE_LIMIT_MAX        allowed requests per window per IP (default 10)
//
// In the test environment the default ceiling is raised to TEST_MAX so the
// unrelated suites (which make a handful of auth calls) are never throttled;
// the dedicated rate-limit suite sets AUTH_RATE_LIMIT_MAX explicitly to
// exercise the limit deterministically.

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 10;
const TEST_MAX = 1000;

function resolveWindowMs() {
  const raw = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WINDOW_MS;
}

function resolveMax() {
  const raw = Number(process.env.AUTH_RATE_LIMIT_MAX);
  if (Number.isFinite(raw) && raw > 0) return raw;
  if (process.env.NODE_ENV === "test") return TEST_MAX;
  return DEFAULT_MAX;
}

// Factory so routes get one shared limiter instance and tests can build an
// isolated one with explicit options.
function createAuthRateLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs ?? resolveWindowMs(),
    limit: options.max ?? options.limit ?? resolveMax(),
    standardHeaders: true,
    legacyHeaders: false,
    // Log every throttled attempt into the operational buffer (Issue #62) so
    // the Admin panel surfaces brute-force activity, then return a readable
    // JSON error the frontend already renders in its auth error banner.
    handler: (req, res, _next, limiterOptions) => {
      logStore.record("warn", `Rate limit exceeded: ${req.method} ${req.originalUrl}`, {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        status: limiterOptions.statusCode,
      });
      res.status(limiterOptions.statusCode).json({
        error: "Too many attempts from this device. Please wait a minute and try again.",
      });
    },
  });
}

module.exports = createAuthRateLimiter;
module.exports.createAuthRateLimiter = createAuthRateLimiter;
