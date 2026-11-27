---
name: run-web
description: Start only the Doory web development server for the current worktree.
disable-model-invocation: true
---

Start only the current worktree's web server in a detached background process.

- If `dev-local.sh` in the repository root specifies a web command, use that command with its
  working directory, environment, host and port. Do not run the combined script or its shell job
  control. Otherwise run `make dev-web` from the repository root.
- If the desired port is in use, reuse the service only if it can be verified as belonging to this
  worktree; otherwise report the conflict without stopping the other process.
- Verify that the web page responds and report its reachable URL (including any reachable URL
  advertised by the local launcher) and background process or session ID. Report startup errors
  instead of claiming success. Do not run setup or install dependencies, including automatic
  downloads by `npx`. Do not start the API as part of this command.
