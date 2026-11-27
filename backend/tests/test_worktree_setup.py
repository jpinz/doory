from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def create_worktree_env(
    tmp_path: Path, *, main_env: str | None = None, existing_env: str | None = None
) -> str:
    worktree = tmp_path / "worktree"
    (worktree / "scripts").mkdir(parents=True)
    (worktree / "backend").mkdir()
    shutil.copyfile(ROOT / "scripts/worktree-setup.sh", worktree / "scripts/worktree-setup.sh")
    shutil.copyfile(ROOT / "backend/.env.example", worktree / "backend/.env.example")
    if existing_env is not None:
        (worktree / "backend/.env").write_text(existing_env)

    main = tmp_path / "main"
    if main_env is not None:
        (main / "backend").mkdir(parents=True)
        (main / "backend/.env").write_text(main_env)

    commands = tmp_path / "bin"
    commands.mkdir()
    (commands / "node").write_text("#!/bin/sh\nprintf 'v22.0.0\\n'\n")
    (commands / "make").write_text("#!/bin/sh\nexit 73\n")
    (commands / "node").chmod(0o755)
    (commands / "make").chmod(0o755)
    environment = {
        **os.environ,
        "PATH": f"{commands}{os.pathsep}{os.environ.get('PATH', '')}",
        "PYTHON": sys.executable,
        "ORCA_ROOT_PATH": str(main),
    }
    result = subprocess.run(
        ["bash", str(worktree / "scripts/worktree-setup.sh")],
        cwd=worktree,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 73, result.stderr
    assert "make setup" in result.stdout
    return (worktree / "backend/.env").read_text()


@pytest.mark.parametrize(
    ("main_env", "expected"),
    [
        (None, "DEV_AUTO_LOGIN=true"),
        ("SITE_URL=http://example.local", "DEV_AUTO_LOGIN=true"),
        ("DEV_AUTO_LOGIN=false\n", "DEV_AUTO_LOGIN=false"),
        ("export DEV_AUTO_LOGIN=false\n", "export DEV_AUTO_LOGIN=false"),
    ],
)
def test_new_worktree_defaults_to_shared_admin_unless_main_configures_it(tmp_path, main_env, expected):
    env = create_worktree_env(tmp_path, main_env=main_env)
    settings = [
        line for line in env.splitlines() if line.startswith(("DEV_AUTO_LOGIN=", "export DEV_AUTO_LOGIN="))
    ]
    assert settings == [expected]
    if main_env and main_env.startswith("SITE_URL"):
        assert main_env in env


@pytest.mark.parametrize("existing_env", ["DEV_AUTO_LOGIN=false\n", "SITE_URL=http://example.local\n"])
def test_existing_worktree_env_is_not_changed(tmp_path, existing_env):
    env = create_worktree_env(tmp_path, main_env="DEV_AUTO_LOGIN=true\n", existing_env=existing_env)
    assert env == existing_env
