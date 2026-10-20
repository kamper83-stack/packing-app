החלף את כל תוכן `
# Agent instructions — packing-app (PackPlanner)

Read this before committing, pushing, merging, or deploying anything in this repository.

## Autonomous merge

Agents may commit, push, open pull requests, and merge a pull request into
`main` autonomously.

Before merging, the current PR head must have passing `lint-and-test` and
`docker-build-test` CI checks. A new push requires checking CI again. If a
required check is failing, missing, or cannot be verified, do not merge; fix
or report the technical blocker.

## Autonomous production deploy

Merging to `main` does not itself deploy. Agents may deploy an exact full SHA
from `main` autonomously, but must follow the controlled procedure
below: fresh database backup, clean build worktree, SHA verification, and
post-deploy checks.

The CD GitHub Action remains disabled. Use the manual SHA-pinned procedure;
do not re-enable CD merely because connectivity or a secret is available.

## Manual production deploy — controlled procedure (2026-09-26)

The VPS is `ai_admin`'s own host; production runs directly on it. The
production checkout is `/home/ai_admin/apps/packing-app`, a real independent
clone with its own `.git` and
