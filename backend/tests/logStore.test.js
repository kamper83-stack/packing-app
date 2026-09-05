// Unit tests for the in-memory operational log buffer (Issue #62).
const logStore = require("../services/logStore");

beforeEach(() => {
  logStore.clear();
});

describe("logStore", () => {
  it("records entries with an id, timestamp, level and message", () => {
    logStore.record("info", "GET /api/trips 200", { status: 200 });
    const [entry] = logStore.list();
    expect(entry).toMatchObject({ level: "info", message: "GET /api/trips 200", status: 200 });
    expect(entry).toHaveProperty("id");
    expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns most-recent-first", () => {
    logStore.record("info", "first");
    logStore.record("warn", "second");
    const messages = logStore.list().map((e) => e.message);
    expect(messages).toEqual(["second", "first"]);
  });

  it("defaults an unknown level to info", () => {
    logStore.record("verbose", "odd level");
    expect(logStore.list()[0].level).toBe("info");
  });

  it("caps the buffer at MAX_ENTRIES, dropping the oldest", () => {
    const total = logStore.MAX_ENTRIES + 25;
    for (let i = 0; i < total; i += 1) {
      logStore.record("info", `event ${i}`);
    }
    const all = logStore.list(logStore.MAX_ENTRIES);
    expect(all).toHaveLength(logStore.MAX_ENTRIES);
    // Newest is the last recorded; the earliest 25 were dropped.
    expect(all[0].message).toBe(`event ${total - 1}`);
    expect(all.some((e) => e.message === "event 0")).toBe(false);
  });

  it("honors the list limit", () => {
    for (let i = 0; i < 10; i += 1) logStore.record("info", `e${i}`);
    expect(logStore.list(3)).toHaveLength(3);
  });
});
