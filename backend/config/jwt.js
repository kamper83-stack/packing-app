// Central JWT secret source of truth.
// The secret MUST come from the environment. A dev-only fallback is used
// outside of production so the skeleton runs without extra setup, but in
// production the server refuses to boot unless JWT_SECRET is set explicitly.
const NODE_ENV = process.env.NODE_ENV || "development";

if (NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET must be set in the environment when NODE_ENV=production."
  );
}

module.exports = {
  JWT_SECRET:
    process.env.JWT_SECRET || "dev_insecure_jwt_secret_change_me",
};
