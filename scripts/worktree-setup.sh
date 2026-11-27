#!/usr/bin/env bash
# Prepare a git worktree for development: dependencies, backend/.env, and a local database that already has the
# first-run content (templates, fonts, shapes and icons, background-removal model, audio).
#
# `make seed` downloads for minutes, so it runs once; its database and media are then kept in a cache and
# copied into every new worktree. Orca runs this from orca.yaml; it is safe to run again by hand.
#
#   PYTHON=python3.12           interpreter for backend/.venv
#   DOORY_DEV_CONTENT=<dir>     the cache (default ~/.cache/doory/dev-content); delete it to rebuild it
#   ADMIN_EMAIL, ADMIN_PASSWORD an admin account for the cache (see `make seed`), so every worktree has it
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
main=${ORCA_ROOT_PATH:-}
python=${PYTHON:-python3.12}
cache=${DOORY_DEV_CONTENT:-${XDG_CACHE_HOME:-$HOME/.cache}/doory/dev-content}
venv_python="$root/backend/.venv/bin/python"
cd "$root"

log() { printf '\n==> %s\n' "$*"; }
manage() { (cd backend && "$venv_python" manage.py "$@"); }
query() { manage shell --no-imports -c "$1" | tail -n 1; }

command -v "$python" >/dev/null || { echo "$python not found: Doory needs Python 3.12 (set PYTHON=...)." >&2; exit 1; }
node_version=$(node --version 2>/dev/null || echo none)
case "$node_version" in v22.*) ;; *) echo "Warning: Node.js $node_version found, Doory expects Node.js 22." >&2 ;; esac

# Reuse the main checkout's settings (API keys and so on) when it has them.
if [ ! -f backend/.env ] && [ -n "$main" ] && [ "$main" != "$root" ] && [ -f "$main/backend/.env" ]; then
  log "Copying backend/.env from $main"
  cp "$main/backend/.env" backend/.env
fi

log "make setup"
make setup PYTHON="$python"

# Paths are made absolute here: the default SQLite name is relative to backend/.
IFS=$'\t' read -r engine db media storage < <(query "
import os
from django.conf import settings as s
d = s.DATABASES['default']
print(d['ENGINE'].rsplit('.', 1)[-1], os.path.abspath(d['NAME']), os.path.abspath(s.MEDIA_ROOT), s.STORAGES['default']['BACKEND'], sep='\t')")
[ -n "$engine" ] || { echo "Could not read the Django settings." >&2; exit 1; }
counts() {
  query "
from apps.elements.models import Element
from apps.fonts.models import FontFamily
from apps.gallery.models import Template
print(Template.objects.count(), FontFamily.objects.count(), Element.objects.count())"
}

inside() { case "$1" in "$root"/*) return 0 ;; *) return 1 ;; esac; }
install_content() {
  if [ "$engine" != sqlite3 ] || [ "$storage" != django.core.files.storage.FileSystemStorage ] \
    || ! inside "$db" || ! inside "$media"; then
    # A shared database or media storage: nothing to copy, and `make content` only adds what is missing.
    log "The database or media is outside this worktree: running make content"
    make content PY="$venv_python"
    return 0
  fi

  read -r templates fonts elements < <(counts)
  if [ "$templates" != 0 ] || [ "$fonts" != 0 ] || [ "$elements" != 0 ]; then
    log "The database already has content ($templates templates, $fonts fonts, $elements elements): keeping it"
    return 0
  fi

  mkdir -p "$(dirname "$cache")"
  exec 9>"$cache.lock"
  flock 9    # worktrees created at the same time wait for one cache build

  if [ ! -f "$cache/db.sqlite3" ]; then
    log "Building the content cache with make seed (downloads, takes minutes)"
    make seed PY="$venv_python"
    read -r templates fonts elements < <(counts)
    if [ "$templates" = 0 ] || [ "$fonts" = 0 ] || [ "$elements" = 0 ]; then
      echo "make seed left $templates templates, $fonts fonts, $elements elements: not caching it." >&2
      echo "Fix the failed download, then run scripts/worktree-setup.sh again." >&2
      return 1
    fi
    rm -rf "$cache.new"
    mkdir -p "$cache.new"
    cp "$db" "$cache.new/db.sqlite3"
    if [ -d "$media" ]; then cp -a --reflink=auto "$media" "$cache.new/media"; fi
    rm -rf "$cache"
    mv "$cache.new" "$cache"
    log "Cached the content in $cache"
  else
    log "Copying the content from $cache"
    cp "$cache/db.sqlite3" "$db"
    rm -rf "$media"
    if [ -d "$cache/media" ]; then cp -a --reflink=auto "$cache/media" "$media"; fi
    manage migrate --noinput
    # Offline and add-only: picks up the templates, shapes and sounds that this branch adds.
    manage seed_gallery
    manage seed_templates
    manage seed_elements
    manage sync_audio
  fi
}

install_content

# Machine-specific additions (ports, host names) that stay out of the repo.
local_setup=${DOORY_LOCAL_SETUP:-${XDG_CONFIG_HOME:-$HOME/.config}/doory/worktree-setup.local.sh}
if [ -f "$local_setup" ]; then
  log "Running $local_setup"
  bash "$local_setup"
fi

read -r templates fonts elements < <(counts)
log "Ready: $templates templates, $fonts fonts, $elements elements. Run make dev-api and make dev-web."
