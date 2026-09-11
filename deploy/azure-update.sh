#!/usr/bin/env bash
# Invoked by the installed systemd timer; never source the application's .env.
set -Eeuo pipefail
export GIT_TERMINAL_PROMPT=0
REPO=${DEPLOY_REPO:-/home/gabriel/suspredict}
STATE=${DEPLOY_STATE:-/home/gabriel/.local/state/suspredict-deploy}
WEB=${DEPLOY_WEB:-/var/www/suspredict}
SERVICE=${DEPLOY_SERVICE:-suspredict}
HEALTH=${DEPLOY_HEALTH:-https://suspredict.northcentralus.cloudapp.azure.com/backend/health}
mkdir -p "$STATE"
exec 9>"$STATE/lock"
flock -n 9 || exit 0
cd "$REPO"
[[ $(git branch --show-current) == main ]] || { echo 'Deploy requires main'; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo 'Deploy blocked: checkout has local changes'; exit 1; }
git fetch --quiet origin main
head=$(git rev-parse HEAD)
new=$(git rev-parse origin/main)
# Compare with the last published commit, not HEAD: a manual `git pull` must still build and restart.
old=$(cat "$STATE/last-success" 2>/dev/null || echo "$head")
git merge-base --is-ancestor "$old" "$head" 2>/dev/null || old=$head
[[ "$old" != "$new" ]] || { echo "Already deployed: $old"; exit 0; }
git merge-base --is-ancestor "$head" "$new" || { echo 'Deploy blocked: main diverged'; exit 1; }
[[ ! -e "$STATE/paused" ]] || { echo 'Deploy paused after a failed activation; inspect logs and remove state/paused to retry'; exit 1; }
work=$(mktemp -d "$STATE/build.XXXXXXXX")
activated=0
venv_saved=0
web_saved=0
rollback_failed=0
health() {
    for attempt in $(seq 1 20); do
        if curl -fsS --max-time 5 "$HEALTH" | python3 -c 'import json,sys; assert json.load(sys.stdin).get("status") == "ok"' 2>/dev/null; then
            return 0
        fi
        sleep 2
    done
    return 1
}
finish() {
    result=$?
    trap - EXIT
    if [[ "$result" != 0 && "$activated" == 1 ]]; then
        echo "Activation failed; restoring $old"
        touch "$STATE/paused"
        sudo -n systemctl stop "$SERVICE" || rollback_failed=1
        # The checkout was verified clean and only this transaction may mutate it.
        git reset --hard "$old" || rollback_failed=1
        if [[ "$venv_saved" == 1 ]]; then
            rm -rf "$REPO/venv"
            cp -a "$work/venv" "$REPO/venv" || rollback_failed=1
        fi
        if [[ "$web_saved" == 1 ]]; then
            sudo -n rsync -a --delete "$work/web/" "$WEB/" || rollback_failed=1
        fi
        sudo -n systemctl start "$SERVICE" || rollback_failed=1
        health || rollback_failed=1
        if [[ "$rollback_failed" == 1 ]]; then
            echo "ROLLBACK FAILED: backup retained at $work; manual recovery required"
            exit 1
        fi
        echo 'Previous version restored; automatic activation paused'
    fi
    rm -rf "$work"
    exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Build an exact snapshot before touching the running application.
git archive "$new" | tar -x -C "$work"
(
    cd "$work/frontend"
    npm ci --no-audit --no-fund
    VITE_API_BASE=/backend npm run build
)
test -s "$work/frontend/dist/index.html"
chmod -R a+rX "$work/frontend/dist"
# Preserve the current dependencies when requirements change (same absolute venv path).
if ! git diff --quiet "$old" "$new" -- api/requirements_api.txt; then
    cp -a "$REPO/venv" "$work/venv"
    venv_saved=1
fi
mkdir "$work/web"
cp -a "$WEB/." "$work/web/"
web_saved=1
# Check again: a manual edit during the build must not be overwritten.
[[ $(git rev-parse HEAD) == "$head" && -z $(git status --porcelain) ]] || { echo 'Checkout changed during build'; exit 1; }
printf '%s -> %s\n' "$old" "$new" > "$STATE/last-attempt"
activated=1
sudo -n systemctl stop "$SERVICE"
git merge --ff-only "$new"
if [[ "$venv_saved" == 1 ]]; then
    # Match the established Azure install policy: Prophet is not used in production.
    sed '/^[[:space:]]*prophet[<=>!~[:space:]]/Id' api/requirements_api.txt > "$work/requirements-azure.txt"
    venv/bin/pip install -r "$work/requirements-azure.txt"
fi
venv/bin/python -m compileall -q api
sudo -n rsync -a --delete "$work/frontend/dist/" "$WEB/"
sudo -n systemctl start "$SERVICE"
health
printf '%s\n' "$new" > "$STATE/last-success"
echo "Deployed and healthy: $new"
