---
name: run
description: Start the Doory web and API development servers for the current worktree.
disable-model-invocation: true
---

Start the API and web servers from the current worktree as separate, detached background processes.

- For each service, if `dev-local.sh` in the repository root specifies its command, use that command
  with its working directory, environment, host and port. Do not run the combined script or its
  shell job control. Otherwise use `make dev-api` for the API and `make dev-web` for the web server.
- Start the API first. If a desired port is in use, reuse the service only if it can be verified
  as belonging to this worktree; otherwise report the conflict without stopping the other process.
  Do not start a web proxy against another worktree's API.
- Verify the API at `/api/v1/health/`, the web page, and the same health endpoint through the web
  server. Report each result, the reachable URLs (including any reachable URL advertised by the local
  launcher) and the background process or session IDs. Report startup errors instead of claiming
  success. Do not run setup or install dependencies, including automatic downloads by `npx`.
