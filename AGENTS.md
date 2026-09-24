# Agent instructions — packing-app (PackPlanner)

Read this before committing, pushing, or merging anything in this repository.

## Merge approval is mandatory

Every pull request into `main` requires:

1. Passing CI (`lint-and-test` and `docker-build-test`), and
2. An explicit **APPROVE** from the independent `expert` review of the exact
   PR and commit being merged.

The `expert` approval replaces the previous `shirikyky` approval requirement.
A green CI run is necessary but **not sufficient** on its own.

Before merging, run a one-shot review that names the exact PR and commit:

```bash
hermes -p expert chat -q \
  "Review PR #<number> in kamper83-stack/packing-app for correctness, security, tests, architecture, and merge readiness. Explicitly name the exact PR and commit reviewed. Return APPROVE or REQUEST_CHANGES."
```

Verify that the commit named in the `APPROVE` response matches the current PR
head:

```bash
gh pr view <number> --json headRefOid,url \
  --jq '"PR: \(.url) commit: \(.headRefOid)"'
```

If the expert response is missing, says `REQUEST_CHANGES`, or names a
different commit, **do not run `gh pr merge`**. Re-run the review after the
PR changes and require a fresh approval for the new commit.

The repository has no GitHub branch protection rule enforcing this process, so
nothing on the platform blocks a merge on CI-green alone. This is a team
process convention and must be self-checked before every merge.

## Deploying is separate from merging

Merging to `main` does not by itself deploy anything. The CD GitHub Action
(`.github/workflows/deploy.yml`) attempts an automatic deploy over SSH on
CI success but is currently broken (Tailscale/SSH connectivity — see #114);
the working path today is a manual deploy on the VPS. Whatever deploy-gate
process your operating profile requires (independent review naming the
exact commit, etc.) applies on top of this — merging is not a substitute
for it.

## Manual VPS deploy — verified procedure (2026-09-23)

The VPS *is* `ai_admin`'s own host (not a separate remote machine an agent
SSHes into) — production runs directly on it. Verified live on this host:
containers up, weather smoke check returned `isMock=false`, and
`https://packing.erankam.dev/` returned `200` at the time this was written.

**Production checkout**: `/home/ai_admin/apps/packing-app` — a real,
independent git clone of this repo (own `.git`, own working tree). It is
**not** the same checkout an agent does its dev/PR work in (e.g. a scratch
clone) — never edit or `git reset`/`git clean` this directory casually,
other things (backups, the running stack) depend on its state.

```bash
cd /home/ai_admin/apps/packing-app

# Deploy the reviewed/approved ref - do NOT assume it's always "main".
# (At the time of writing, production is intentionally running a feature
# branch, fix/trip-card-click-and-weather-grid, not main - confirm the
# exact ref/commit from the deploy-gate review before checking anything out.)
git fetch origin
git checkout <reviewed-branch-or-main>
git pull origin <reviewed-branch-or-main>

# .env already exists at the repo root (chmod 600) with real
# JWT_SECRET / GEMINI_API_KEY / WEATHER_API_KEY / ADMIN_EMAIL - docker
# compose reads it automatically. Don't regenerate/overwrite it blindly;
# only touch it if a secret actually changed.

docker compose build
docker compose up -d --remove-orphans
docker image prune -f
```

**Post-deploy smoke checks** (same ones `.github/workflows/deploy.yml`
already runs — confirmed working when re-run manually against the live
containers):

```bash
docker compose exec -T backend node -e \
  "require('./services/weatherService').getForecast('London', new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0]).then(r => console.log('[POST-DEPLOY] Weather check finished. isMock=' + r.isMock + (r.error ? ' (error: ' + r.error + ')' : '')))"

curl -o /dev/null -s -w "%{http_code}\n" https://packing.erankam.dev/   # expect 200
```

**How the port is actually opened to the internet** (provisioned once,
outside this repo — do not try to redo this per deploy; a deploy only
needs the `docker compose` steps above, since the port mapping doesn't
change):

- `docker-compose.yml` binds both containers to `127.0.0.1` only
  (`127.0.0.1:3025:80` frontend, `127.0.0.1:3026:5001` backend) — never
  reachable from outside the host directly, by design.
- The host's nginx (`/etc/nginx/sites-available/packing`, symlinked into
  `sites-enabled/`) is the only public entry point: it terminates TLS for
  `packing.erankam.dev` on the host's public IP, port 443 (cert via
  Certbot, `/etc/letsencrypt/live/wildcard-erankam.dev/`), and
  reverse-proxies to `127.0.0.1:3025`. The frontend container's own nginx
  then proxies `/api` through to the backend container internally.
  `nginx -t && systemctl reload nginx` after editing that vhost file — not
  needed for a routine code deploy.

**Known gap found while verifying this (not yet fixed)**: the production
DB backup script (`/home/ai_admin/scripts/backup-packing-app-db.sh`) exists
and works, but is **not** installed in `crontab -l` on this host — only
`appy-backup-nightly.sh` is scheduled. Flag this to Eran before relying on
automated packing-app DB backups.
