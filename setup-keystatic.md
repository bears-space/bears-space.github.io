# Set up Keystatic admin on the club's Cloudflare

Checklist for re-doing the Keystatic external setup against
`bears-space/bears-space.github.io` and the club's Cloudflare account, since
the migration branch already points the code at the club's repo
(`keystatic.config.ts:14–22`).

Do the steps in order. Whole thing takes ~20 minutes assuming you have access
to all the accounts.

## Prerequisites

- Write access to `bears-space/bears-space.github.io`.
- An account on the club's Cloudflare workspace.
- Permission to edit DNS for `bears-space.de`.
- Decide first: deploy from `leopold-website-migration` (preview only) or merge
  it into the club's `main` first (recommended — see *Branch caveat* below).

## 1. Register the GitHub App

Keystatic's GitHub storage authenticates via a GitHub App installed on the
repo. The personal-repo App can't be reused — register a new one.

```sh
git clone https://github.com/bears-space/bears-space.github.io.git
cd bears-space.github.io
git checkout leopold-website-migration   # or main, after merge
npm install
```

The setup wizard at `/keystatic/setup` only renders when `keystatic.config.ts`
is in github-storage mode, which is gated on `NODE_ENV === 'production'`
([keystatic.config.ts:14](keystatic.config.ts)). In a normal `npm run
dev:admin` invocation `NODE_ENV` is `development`, storage falls back to
`local`, and the setup wizard short-circuits — that's why a fresh clone
"just works" with no prompts. Force production mode for this one step:

```powershell
# Windows PowerShell
$env:NODE_ENV='production'; npm run dev:admin
```

```sh
# macOS / Linux / Git Bash
NODE_ENV=production npm run dev:admin
```

Then open `http://localhost:4321/keystatic/setup` and walk through the flow. Set:

- Homepage URL → `https://<admin-domain>` (placeholder ok, editable later).
- OAuth callback → `https://<admin-domain>/api/keystatic/github/oauth/callback`.

Copy the three secrets it generates:

- `KEYSTATIC_GITHUB_CLIENT_ID`
- `KEYSTATIC_GITHUB_CLIENT_SECRET`
- `KEYSTATIC_SECRET`

Install the App on `bears-space/bears-space.github.io` only — not org-wide.

Stop the dev server and unset `NODE_ENV` (close the shell, or
`Remove-Item Env:\NODE_ENV` / `unset NODE_ENV`) so subsequent `npm run
dev:admin` calls go back to the local-storage flow that doesn't need the
secrets.

## 2. Create the Cloudflare Pages project (club's account)

Workers & Pages → Create application → Pages → Connect to Git → select
`bears-space/bears-space.github.io`.

| Field | Value |
|---|---|
| Production branch | `main` (after merge) or `leopold-website-migration` |
| Build command | `npm run build:admin` |
| Output directory | `dist` |
| Node version | `20` |

Under **Environment variables → Production**, add the three secrets from step 1.

Save & deploy. First build is ~3 minutes.

## 3. DNS

**Reusing `admin.bears-space.de`** (taking it over from the personal Cloudflare):

1. Personal Cloudflare → delete the current `admin.bears-space.de` Pages
   custom domain. Brief downtime starts here.
2. Club Cloudflare → new Pages project → Custom domains → Add
   `admin.bears-space.de`.
3. DNS zone for `bears-space.de` → update the CNAME for `admin` to the new
   Pages project target Cloudflare shows you. Propagation < 5 min.

**Fresh subdomain** (e.g. `cms.bears-space.de`): just steps 2–3 with the new
name. No downtime, both admins coexist while testing.

## 4. Update the GitHub App URLs

If step 1 used placeholder URLs:

GitHub → Settings → Developer settings → GitHub Apps → your Keystatic App →
update Homepage URL + User authorization callback URL to the live admin
domain → Save.

## 5. Smoke test

1. Visit `https://<admin-domain>/keystatic`.
2. Sign in with GitHub → authorise the App.
3. Make a trivial edit on a `page-text` singleton.
4. Save.
5. Confirm the commit appears at
   `https://github.com/bears-space/bears-space.github.io/commits/<branch>`.

Public site rebuilds are a separate concern — those run on the club's
GitHub Pages workflow on `main`. If you committed to
`leopold-website-migration`, the public site won't update until merge.

## 6. Retire the personal admin (only after step 5 passes)

Personal Cloudflare → Workers & Pages → the admin project → Settings →
Delete.

GitHub → Settings → Developer settings → GitHub Apps → the
`leopoldblum/bears-website` Keystatic App → Delete (optional — only if you're
sure the personal admin will never come back).

## Branch caveat

Keystatic's admin UI has a branch picker. By default it commits to the repo's
default branch (`main`). If the Cloudflare deploy is built from
`leopold-website-migration` but an editor saves with the picker still on
`main`, the commit goes to the club's existing `main` — which currently has
unrelated content from prior work on the repo. The result is a tangled
history.

Two ways to avoid this:

- **Merge first** (recommended): merge `leopold-website-migration` into the
  club's `main` (`git merge --allow-unrelated-histories`), resolve conflicts,
  then deploy from `main`.
- **Discipline + restricted App scope**: deploy from
  `leopold-website-migration`, tell editors to leave the picker alone.
  Brittle.

## References

- `keystatic.config.ts:14–22` — storage config
- `package.json` → `build:admin` — the script Cloudflare runs
- `astro.config.mjs` — `ADMIN_BUILD` branching
- `src/middleware.ts` — admin-build runtime gating
- `CLAUDE.md` § *Dual deploy* and § *Keystatic external setup*
