"""Linux integration tests: real Git/files, simulated npm/systemd/HTTP failures."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("azure-update.sh").resolve()

class DeployTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.origin = self.root / "origin"
        self.seed = self.root / "seed"
        self.repo = self.root / "repo"
        self.web = self.root / "web"
        self.state = self.root / "state"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.web.mkdir()
        (self.web / "index.html").write_text("old")
        self.env = dict(os.environ, DEPLOY_REPO=str(self.repo), DEPLOY_STATE=str(self.state),
                        DEPLOY_WEB=str(self.web), DEPLOY_TEST_ROOT=str(self.root),
                        PATH=str(self.bin) + ":" + os.environ["PATH"])
        self.run_cmd("git", "init", "--bare", "--initial-branch=main", str(self.origin))
        self.run_cmd("git", "clone", str(self.origin), str(self.seed))
        self.git(self.seed, "config", "user.name", "Deploy test")
        self.git(self.seed, "config", "user.email", "test@example.invalid")
        (self.seed / "frontend").mkdir()
        (self.seed / "api").mkdir()
        (self.seed / "frontend/package.json").write_text("{}")
        (self.seed / "api/requirements_api.txt").write_text("fastapi\n")
        (self.seed / ".gitignore").write_text("venv/\n")
        self.commit("initial")
        self.run_cmd("git", "clone", str(self.origin), str(self.repo))
        (self.repo / "venv/bin").mkdir(parents=True)
        self.executable(self.repo / "venv/bin/python", "exit 0")
        self.executable(self.repo / "venv/bin/pip", 'echo changed > "$DEPLOY_REPO/venv/marker"; exit 1')
        (self.repo / "venv/marker").write_text("original")
        self.executable(self.bin / "sudo", 'shift; exec "$@"')
        self.executable(self.bin / "systemctl", 'echo "$*" >> "$DEPLOY_TEST_ROOT/service.log"')
        self.executable(self.bin / "sleep", "exit 0")
        self.executable(self.bin / "npm",
            'if [ "${DEPLOY_TEST_MODE:-}" = build_fail ]; then exit 1; fi\n'
            'if [ "$1" = run ]; then mkdir -p dist; echo new > dist/index.html; fi')
        self.executable(self.bin / "curl", 
            'n=0; f="$DEPLOY_TEST_ROOT/checks"; [ ! -f "$f" ] || n=$(cat "$f"); n=$((n+1)); echo "$n" > "$f"\n'
            'if [ "${DEPLOY_TEST_MODE:-}" = health_fail ] && [ "$n" -le 20 ]; then exit 1; fi\n'
            "echo '{\"status\":\"ok\"}'")
        self.old = self.git(self.repo, "rev-parse", "HEAD").strip()

    def executable(self, path, body):
        path.write_text("#!/bin/bash\n" + body + "\n")
        path.chmod(0o755)

    def run_cmd(self, *args):
        return subprocess.check_output(args, env=self.env, stderr=subprocess.STDOUT, text=True)

    def git(self, where, *args):
        return self.run_cmd("git", "-C", str(where), *args)

    def commit(self, message):
        self.git(self.seed, "add", ".")
        self.git(self.seed, "commit", "-m", message)
        self.git(self.seed, "push", "origin", "main")

    def update(self, deps=False):
        (self.seed / "version").write_text("new")
        if deps:
            (self.seed / "api/requirements_api.txt").write_text("fastapi>=1\n")
        self.commit("update")

    def deploy(self, mode=""):
        return subprocess.run(["bash", str(SCRIPT)], env=dict(self.env, DEPLOY_TEST_MODE=mode),
                              capture_output=True, text=True)

    def test_no_change_does_not_restart(self):
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((self.root / "service.log").exists())

    def test_success_and_second_run_is_noop(self):
        self.update()
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.web / "index.html").read_text().strip(), "new")
        self.assertEqual(self.git(self.repo, "rev-parse", "HEAD").strip(), (self.state / "last-success").read_text().strip())
        log = (self.root / "service.log").read_text()
        self.assertEqual(self.deploy().returncode, 0)
        self.assertEqual(log, (self.root / "service.log").read_text())

    def test_manual_pull_still_builds_and_restarts(self):
        (self.state).mkdir()
        (self.state / "last-success").write_text(self.old + "\n")
        self.update()
        self.git(self.repo, "pull", "--ff-only")
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.web / "index.html").read_text().strip(), "new")
        self.assertIn("start", (self.root / "service.log").read_text())

    def test_dirty_checkout_is_preserved(self):
        self.update()
        (self.repo / "frontend/package.json").write_text("manual")
        self.assertNotEqual(self.deploy().returncode, 0)
        self.assertEqual((self.repo / "frontend/package.json").read_text(), "manual")
        self.assertFalse((self.root / "service.log").exists())

    def test_build_failure_leaves_running_version(self):
        self.update()
        self.assertNotEqual(self.deploy("build_fail").returncode, 0)
        self.assertEqual(self.git(self.repo, "rev-parse", "HEAD").strip(), self.old)
        self.assertFalse((self.root / "service.log").exists())

    def test_health_failure_restores_code_and_web_then_pauses(self):
        self.update()
        result = self.deploy("health_fail")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Previous version restored", result.stdout, result.stdout + result.stderr)
        self.assertEqual(self.git(self.repo, "rev-parse", "HEAD").strip(), self.old)
        self.assertEqual((self.web / "index.html").read_text(), "old")
        self.assertTrue((self.state / "paused").exists())
        self.assertNotEqual(self.deploy().returncode, 0)

    def test_dependency_failure_restores_venv(self):
        self.update(deps=True)
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.repo / "venv/marker").read_text(), "original")
        self.assertEqual(self.git(self.repo, "rev-parse", "HEAD").strip(), self.old)

if __name__ == "__main__":
    unittest.main()
