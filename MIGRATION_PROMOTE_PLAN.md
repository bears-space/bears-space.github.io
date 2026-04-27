# Promote `leopold-website-migration` to `main` with safety backup

> Archival record of the plan executed on 2026-04-28 to make the new Astro
> website (this branch) the deployed `main`. Kept in-tree for reference.

## Context

`main` (commit `c8ea8fa`) was the deployed branch for `bears-space.de` (GitHub Pages),
serving a Quarto-built site. The new website lives on `leopold-website-migration`
(commit `d4bafb2`) and is ready to go live. Goal: make `main` fully match
`leopold-website-migration`, with the old `main` preserved on a backup branch
`2026-old-website`. The `leopold-website-migration` branch is also kept around as
a second safety net.

**Key constraint:** `main` and `leopold-website-migration` share **no common
history** (`git merge-base` returns exit 1, empty output) — the migration branch
was imported from a different repo. A normal merge is therefore impossible; the
only clean way to make `main` match the migration branch is to move `main`'s
pointer and force-push.

## Pre-execution state (verified)

- `main` = `origin/main` = `c8ea8fa` ("Re-purpose of kick-off meeting")
- `leopold-website-migration` = `origin/leopold-website-migration` = `d4bafb2`
  ("Sync content + assets from leopoldblum/bears-website")
- Working tree clean, on `leopold-website-migration`
- No `2026-old-website` branch existed locally or on origin
- Remote: `https://github.com/bears-space/bears-space.github.io.git`

## Execution steps

### 1. Fetch and stay on the migration branch (sanity)
```sh
git fetch origin --prune
git status     # confirm clean working tree, on leopold-website-migration
```

### 2. Create the backup branch from current main
```sh
git branch 2026-old-website main
git push -u origin 2026-old-website
```
Creates a new branch at `c8ea8fa` and publishes it. No force needed — it's a new
ref. After this, the old main is preserved on both local and remote.

### 3. Move main to point at the migration branch
```sh
git branch -f main leopold-website-migration
```
Re-points local `main` to the migration branch HEAD without checking it out.
Equivalent to `git checkout main && git reset --hard leopold-website-migration && git checkout -`,
but a single command and no working-tree churn.

### 4. Force-push main
```sh
git push --force-with-lease=main:c8ea8fa7497fe25a5a75e8fa3efbf7bb4e241da7 origin main
```
`--force-with-lease` with the explicit expected SHA refuses the push if anyone
else has moved `origin/main` since the fetch — safer than plain `--force`.

### 5. Verify
```sh
git log --oneline main -3                       # should match migration HEAD
git log --oneline 2026-old-website -3           # should be at c8ea8fa
git log --oneline leopold-website-migration -3  # unchanged
git rev-parse main origin/main                  # both at the new HEAD
git rev-parse 2026-old-website origin/2026-old-website  # both c8ea8fa...
```

## Rollout strategy: promote now, admin toggles Pages source later

The user (Leopold) does not have repo Admin and so cannot change the Pages
"Source" setting today. The plan is to promote `main` now and let the live site
stay frozen on the last Quarto build until an admin flips the toggle. This is
safe because of the deploy-mechanism mismatch detailed below — the old built
site sits on `gh-pages` and Pages keeps serving it as long as the source is set
to that branch.

### What the live site does, hour by hour

1. **Right after force-push (step 4 above):**
   - `main` now has the Astro code + new `deploy.yml`. Old `publish.yml` (Quarto) is gone.
   - The new `deploy.yml` triggers on push: `build` job succeeds, `deploy` job
     **fails** at `actions/deploy-pages@v4` ("Get Pages site failed... ensure
     GitHub Pages has been enabled with the correct build type"). Expected.
   - `bears-space.de` keeps serving the last Quarto build from `gh-pages`
     (commit `6757629`, 2026-04-22). Visitors see no change.
   - `admin.bears-space.de` (Cloudflare Pages, builds on push to main) **does**
     rebuild and switches to the new Keystatic UI. Desired outcome for the
     admin subdomain.

2. **During the gap (until admin flips Pages source):**
   - Each push to `main` (including any Keystatic content commit) triggers
     another failed deploy run. Cosmetic; clears once the toggle flips.
   - `gh-pages` stays frozen; live public site stays frozen.

3. **When admin toggles Pages → "GitHub Actions":**
   - The toggle alone does **not** trigger a deploy.
   - To go live, do one of: re-run the latest `Deploy public site to GitHub Pages`
     run, run the workflow manually (`workflow_dispatch` is enabled), or push
     any commit to main.
   - Deploy step now succeeds → new Astro site replaces the old. Custom domain
     stays attached.

### Other concerns

1. **Branch protection on `main`.** If GitHub has "Restrict force pushes" enabled
   on `main`, step 4 will be rejected and an admin will have to perform the push
   (or relax the rule). The rejection is non-destructive — `origin/main` does
   not move, the live site is unaffected, and local `main` can be reset back to
   `origin/main` in one command. The backup branch push in step 2 still
   succeeds regardless (new branch, no protection).
2. **Open PRs against `main`.** A force-push that rewrites `main` to a branch
   with no shared history will mark every open PR targeting `main` as
   out-of-date / unmergeable. Affected PRs would need to be closed, rebased
   onto the new main, or retargeted.
3. **Local checkouts of `main`** by other contributors will diverge from origin
   and need a `git fetch && git reset --hard origin/main` (with their own
   backup) to sync.

### Deploy-mechanism mismatch (reference)

|                    | Current `main` (c8ea8fa)             | New `main` (migration branch)           |
| ------------------ | ------------------------------------ | --------------------------------------- |
| Workflow file      | `.github/workflows/publish.yml`      | `.github/workflows/deploy.yml`          |
| Builder            | Quarto (`quarto-actions/publish@v2`) | Astro (`withastro/action@v3`)           |
| Deploy mechanism   | Pushes built site to `gh-pages`      | `actions/deploy-pages@v4` (Actions-native) |
| Required Pages src | "Deploy from a branch → `gh-pages`"  | "GitHub Actions"                        |

Evidence: `gh-pages` has fresh "Built site for gh-pages" commits (last
2026-04-22), matching the Quarto workflow on the old `main`.

## Refs touched by execution

- Local: `refs/heads/main` (re-pointed), `refs/heads/2026-old-website` (new),
  `refs/heads/leopold-website-migration` (untouched apart from this commit
  adding the plan file).
- Remote: `refs/remotes/origin/main` (force-updated),
  `refs/remotes/origin/2026-old-website` (new),
  `refs/remotes/origin/leopold-website-migration` (touched by the plan-file
  commit only).

## Rollback

If anything goes wrong and we need the old `main` back:
```sh
git push --force-with-lease=main:<current-main-sha> origin 2026-old-website:main
```
…or locally `git branch -f main 2026-old-website && git push --force-with-lease origin main`.
The backup branch makes this trivial.

## Follow-ups after admin flips Pages source

1. In repo Settings → Pages, the source has changed to "GitHub Actions".
2. Trigger a deploy: Actions tab → `Deploy public site to GitHub Pages` → "Run
   workflow", or re-run the latest failed run.
3. Confirm `bears-space.de` now serves the Astro build.
4. Optional cleanup: delete the now-stale `gh-pages` branch from origin (it's
   no longer used). The `2026-old-website` and `leopold-website-migration`
   branches stay until the team is confident in the new site.
