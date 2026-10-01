# Phase 4 — Demo & E2E Verification Checklist

Tracking issue: **#148** (Phase 4: אינטגרציה, DevOps והגשה — `DEV_PLAN.md`, שלב 4).

This document turns the Phase 4 acceptance criteria into an executable,
reviewable checklist. It is the **"final demo checklist"** deliverable for
#148. The two remaining acceptance items — a documented E2E pass *with results*
and a *release tag* for submission — are recorded here as steps to be executed
and signed off by a human, because they touch production and the release
process (see the notes under each section). Nothing in this file runs a
production deploy, cuts a tag, or transmits secrets.

---

## 1. Pre-demo environment sanity

- [ ] `main` is green: latest `lint-and-test` and `docker-build-test` succeeded
      on the current `origin/main` head.
- [ ] Working tree is clean; the demo runs an immutable, known commit
      (record the full SHA below).
- [ ] Production is reachable: `https://packing.erankam.dev/` returns `200`.

```text
Demo commit (full SHA): ____________________________________________
Verified on (date/UTC): ____________________________________________
```

## 2. Local containerized smoke (docker-compose)

Confirms the container image the demo depends on actually boots. Uses a local
`.env` (never commit it — see README "Docker Compose").

- [ ] `docker compose up --build` brings both services up with no restart loop.
- [ ] Frontend served (locally `http://localhost`, prod behind host nginx on
      `127.0.0.1:3025`); backend healthy on `127.0.0.1:3026`.
- [ ] Backend live-weather smoke returns live data (`isMock: false`) — see the
      README backend smoke command, or the AGENTS.md post-deploy weather check
      (`isMock=false` **and** `isSeasonal=false` for a current-window date).

> This is a *build/boot* verification only. A real production deploy follows the
> **manual, SHA-pinned procedure in `AGENTS.md`** (fresh DB backup, clean
> detached build worktree, post-deploy smoke checks) and requires a current
> independent `expert` deploy APPROVE naming the exact SHA. Do not deploy from
> this checklist.

## 3. End-to-end functional pass

Run the full happy path against the demo target and record the result.
Reference API/UI surface: README "API overview" and `src/pages/`.

- [ ] **Signup** — register a fresh user; JWT stored; redirected into the app
      (authenticated users are kept off `/login` and `/signup` — #145).
- [ ] **Login** — log out, log back in with the same credentials.
- [ ] **Create trip** — pick destination, dates, group size, vacation type;
      trip is created and a weather-aware checklist is generated.
- [ ] **Weather window behavior** — a trip fully inside Google's ~10-day window
      shows live data; a trip spanning the boundary shows a `mixed` forecast
      (leading days live, trailing days seasonal); a trip fully outside shows a
      seasonal estimate. A mock fallback is **never** presented as live data.
- [ ] **Luggage allocation** — checklist items are grouped by bag
      (Backpack / Trolley (cabin) / Checked suitcase); per-bag progress is
      shown (#147 / PR #151) and totals reconcile with the overall count.
- [ ] **Trolley-only trip** — a trip whose allowance yields only a cabin
      trolley allocates items correctly and shows no empty/checked-suitcase
      artifacts (#143).
- [ ] **Checklist interactions** — toggle items packed, add a custom item,
      delete an item, delete the trip.
- [ ] **Trip edit (partial update)** — editing a single field preserves every
      other writable field and never persists an inverted/over-long date range
      (#146 / PR #150).

```text
E2E result (pass/fail + notes): ____________________________________
Tester / date (UTC):            ____________________________________
```

> **Acceptance "E2E pass documented with results":** paste the filled-in block
> above (or link a run log) into #148 before closing it. Running the pass
> against production is a human action — this checklist does not perform it.

## 4. Automated test evidence (CI-equivalent)

- [ ] Backend suite green (`cd backend && npm test`).
- [ ] Frontend suite green (`npm test -- --watchAll=false`) and production build
      compiles clean (`npm run build`).
- [ ] These match the green `lint-and-test` + `docker-build-test` CI jobs on the
      demo commit.

## 5. Documentation & submission

- [ ] README reflects the current feature set and run instructions.
- [ ] README screenshots refreshed against the demo build (human step —
      requires capturing the running UI).
- [ ] Final demo narrative/checklist rehearsed against this document.

## 6. Release tag (human + approval-gated)

The submission tag is **not** cut automatically.

- [ ] Confirm the demo commit is the intended `origin/main` tip.
- [ ] Obtain the approvals the team process requires for the release/deploy of
      that exact SHA (per `AGENTS.md`).
- [ ] Cut and push the annotated release tag on the approved SHA, then link it
      in #148.

```text
Release tag:        ________________________________________________
Tagged commit SHA:  ________________________________________________
Approved by:        ________________________________________________
```

---

### Sign-off (close #148 when both are done)

- [ ] E2E pass documented with results (Section 3).
- [ ] Release tag cut for submission (Section 6).
