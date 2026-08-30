const { User } = require("../models");

// Issue #49: admin routes require a real isAdmin row in the database.
// Do not trust a client-supplied flag; re-read the user after JWT auth.
async function adminMiddleware(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const user = await User.findByPk(req.user.id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Admin access required." });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
}

module.exports = adminMiddleware;
