const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");
const { User } = require("../models");

// Re-checking isActive on every request (not just at login) means a
// deactivated account loses access immediately, rather than only once its
// existing 7-day token happens to expire. A JWT alone can't carry that
// state, since it isn't reissued when an admin flips the flag later.
async function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findByPk(decoded.id, { attributes: ["id", "isActive"] });
    if (!user || !user.isActive) {
      return res.status(403).json({ error: "This account has been deactivated." });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid token." });
  }
}

module.exports = authMiddleware;
