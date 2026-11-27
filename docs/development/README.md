# Development

## Requirements

- Python 3.12
- Node.js 22. Newer versions can make some frontend tests fail.
- Optional: Docker, for PostgreSQL and Redis (`docker-compose.dev.yml`)
- Optional: Playwright's Chromium, for server-side export and the end-to-end tests

## Set up and run

```bash
make setup     # virtualenv in backend/.venv, dependencies, backend/.env, local SQLite database
make dev-api   # API on http://localhost:8000 (also serves WebSockets)
make dev-web   # app on http://localhost:5173, in a second terminal; proxies /api and /ws to the API
```

To reuse an existing virtualenv: `make <target> PY=/path/to/venv/bin/python`.

The local settings are in `backend/.env`, created from [`backend/.env.example`](../../backend/.env.example).
Every setting is described in [configuration.md](../self-hosting/configuration.md).

## Worktrees

`scripts/worktree-setup.sh` prepares a git worktree in one step: `make setup`, then a database with the first-run
content (templates, fonts, elements, model, audio). Orca runs it in every new worktree (`orca.yaml`) and the
script copies `backend/.env` from the main checkout. With other tools, run it by hand in the new worktree.

The first run builds the content with `make seed` (downloads, takes minutes) and keeps the database and
`backend/media/` in `~/.cache/doory/dev-content` (`DOORY_DEV_CONTENT` to change it). Later worktrees copy that
cache, migrate, and add what their branch changed in the bundled templates, elements and sounds. Each worktree gets
its own copy, so changes in one don't affect the others.

- `ADMIN_PASSWORD=… scripts/worktree-setup.sh` on the first run adds an admin account to the cache.
- Delete the cache folder to rebuild it, for example to get newer fonts or element packs.
- A database that already has content is kept. With PostgreSQL or S3 in `backend/.env`, the script runs
  `make content` instead, which only adds what is missing.
- For settings that belong to your machine only (ports, host names), put a script in
  `~/.config/doory/worktree-setup.local.sh` (`DOORY_LOCAL_SETUP` to change the path). It runs last, from the
  worktree's root.

## Make targets

| Target | What it does |
|--------|--------------|
| `make help` | List the targets |
| `make setup` | Install dependencies and prepare the local database |
| `make dev-api`, `make dev-web` | Run the API and the frontend |
| `make migrate` | Apply migrations |
| `make content` | Install the first-run content (templates, elements, fonts, model, audio); downloads, takes minutes |
| `make seed ADMIN_PASSWORD=…` | `content`, plus an admin account (`ADMIN_EMAIL`, default `admin@doory.local`) |
| `make test` | Backend and frontend unit tests ([testing.md](testing.md)) |
| `make lint` | Ruff, TypeScript, ESLint and `docs-check` |
| `make fmt` | Format the backend code |
| `make docs-check` | Check that every setting is documented in configuration.md |
| `make docker-up`, `make docker-down` | Start and stop the full Docker stack |

## Optional local services

```bash
docker compose -f docker-compose.dev.yml up -d                    # PostgreSQL
docker compose -f docker-compose.dev.yml --profile redis up -d    # and Redis
```

Then set `DATABASE_URL` (and `REDIS_URL`) in `backend/.env`.

## Next

- [architecture.md](architecture.md): how the code is organised
- [testing.md](testing.md): unit and end-to-end tests
- [CONTRIBUTING.md](../../CONTRIBUTING.md): pull requests and documentation rules
- [AGENTS.md](../../AGENTS.md): instructions for AI coding agents (`CLAUDE.md` loads the same file)
