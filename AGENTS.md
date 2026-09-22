# Agent instructions — packing-app (PackPlanner)

Read this before committing, pushing, or merging anything in this repository.

## Merge approval is mandatory (learned the hard way — 2026-09-22)

Every pull request into `main` requires an explicit, PR-level **APPROVED**
review from **shirikyky** (GitHub login) before it is merged — regardless of
CI status. A green CI run (`lint-and-test`, `docker-build-test`) is
necessary but **not sufficient** on its own.

`main` currently has no GitHub branch protection rule enforcing this (see
`gh api repos/<owner>/packing-app/branches/main/protection` → 404), so
nothing on the platform blocks a merge on CI-green alone. This is a team
process convention, and an agent must self-check it before every merge:

```bash
gh pr view <number> --json reviews \
  --jq '[.reviews[] | select(.author.login == "shirikyky" and .state == "APPROVED")] | length'
```

If that returns `0`, **do not run `gh pr merge`**. Either wait for the
review, or explicitly ask the requester for a one-off exception — never
default to merging on CI alone.

Note: shirikyky cannot approve her own PRs (GitHub self-review
restriction) — on PRs she authors, her sign-off lands as a `COMMENTED`
review saying the change looks ready, not `APPROVED`. Treat that as
equivalent for her own PRs; the `APPROVED`-only check above applies to PRs
authored by someone else.

## Deploying is separate from merging

Merging to `main` does not by itself deploy anything. The CD GitHub Action
(`.github/workflows/deploy.yml`) attempts an automatic deploy over SSH on
CI success but is currently broken (Tailscale/SSH connectivity — see #114);
the working path today is a manual deploy on the VPS. Whatever deploy-gate
process your operating profile requires (independent review naming the
exact commit, etc.) applies on top of this — merging is not a substitute
for it.
