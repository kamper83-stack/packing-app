const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const authMiddleware = require("../middleware/auth");
const { JWT_SECRET } = require("../config/jwt");

// Email validation helper
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

function publicUser(user) {
  return { id: user.id, email: user.email, isAdmin: Boolean(user.isAdmin) };
}

function isSeedAdminEmail(email) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return adminEmail !== "" && email === adminEmail;
}

// Ensure the designated ADMIN_EMAIL always reflects isAdmin: true, even for
// accounts created before the role was configured or promoted (Issue #62).
// Only ever promotes — never demotes — so manually-granted admins are kept.
// Returns the (possibly updated) user instance.
async function reconcileAdmin(user) {
  if (user && !user.isAdmin && isSeedAdminEmail(user.email)) {
    await user.update({ isAdmin: true });
  }
  return user;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const cleanEmail = email.trim().toLowerCase();

  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }

  try {
    const existingUser = await User.findOne({ where: { email: cleanEmail } });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      email: cleanEmail,
      password: hashedPassword,
      isAdmin: isSeedAdminEmail(cleanEmail),
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await User.findOne({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    // Reconcile admin status so the designated admin sees their role
    // immediately on login, without needing a server restart (Issue #62).
    await reconcileAdmin(user);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ["id", "email", "isAdmin"] });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    // Keep the designated admin's role accurate across sessions (Issue #62).
    await reconcileAdmin(user);
    res.json(publicUser(user));
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
