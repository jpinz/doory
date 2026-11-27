---
name: run-api
description: Start only the Doory API development server for the current worktree.
disable-model-invocation: true
---

Start only the current worktree's API server in a detached background process.

- If `dev-local.sh` in the repository root specifies an API command, use that command with its
  working directory, environment, host and port. Do not run the combined script or its shell job
  control. Otherwise run `make dev-api` from the repository root.
- If the desired port is in use, reuse the service only if it can be verified as belonging to this
  worktree; otherwise report the conflict without stopping the other process.
- Verify `/api/v1/health/` and report the reachable API URL and background process or session ID.
  Report startup errors instead of claiming success, and do not install dependencies or run setup.
