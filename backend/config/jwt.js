// Central JWT secret source of truth.
//
// The secret MUST come from the environment, always — this check is NOT
// gated on NODE_ENV. Making it conditional on NODE_ENV === "production" was
// dead code in practice: docker-compose.yml never set NODE_ENV, so the
// container always ran as "development" and silently accepted the
// committed insecure default below, defeating the whole check (audit
// finding C2). A missing secret must refuse to boot in every environment;
// tests and local dev set JWT_SECRET explicitly (see backend/.env.example
// and the CI workflow), so this never fires for a legitimate setup.
if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET must be set in the environment. Refusing to start with no " +
      "secret configured — see backend/.env.example."
  );
}

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET,
};
