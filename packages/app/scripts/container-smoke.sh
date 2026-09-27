#!/usr/bin/env bash
# The image and the compose install on a throwaway name, volume and folder (never "slopify").
set -euo pipefail

smoke_name="slopify-container-smoke-$$"
smoke_volume="${smoke_name}-data"
offline_container="${smoke_name}-offline"
smoke_root=$(mktemp -d -t slopify-container-projects-XXXXXXXX)
export XDG_DATA_HOME="$smoke_root/state"
export SLOPIFY_DOCKER_NAME="$smoke_name"
export SLOPIFY_DOCKER_VOLUME="$smoke_volume"
export SLOPIFY_DOCKER_IMAGE="${SLOPIFY_SMOKE_IMAGE:-slopify:smoke}"
export SLOPIFY_DOCKER_PROJECTS_DIR="$smoke_root/Projects"
install_dir="$XDG_DATA_HOME/slopify/docker/$smoke_name"
succeeded=false

cleanup() {
  if [[ "$succeeded" != true && "${SLOPIFY_SMOKE_KEEP:-}" == 1 ]]; then
    printf 'Disposable smoke material retained: %s %s %s\n' "$smoke_root" "$smoke_name" "$smoke_volume" >&2
    return
  fi
  docker rm -f "$offline_container" >/dev/null 2>&1 || true
  if [[ -f "$install_dir/.env" ]]; then
    docker compose --project-directory "$install_dir" --env-file "$install_dir/.env" \
      --project-name "$smoke_name" down >/dev/null 2>&1 || true
  fi
  docker rm -f "$smoke_name" >/dev/null 2>&1 || true
  local target
  while IFS= read -r target; do
    if [[ "$target" == "$smoke_volume" || "$target" == "$smoke_volume"-recovery-* ]]; then
      docker volume rm "$target" >/dev/null
    fi
  done < <(docker volume ls --format '{{.Name}}')
  rm -rf "$smoke_root"
}
trap cleanup EXIT

install() {
  node packages/app/dist/edge/cli.js --docker --host-cli=off "$@"
}

health_status() {
  docker inspect --format '{{.State.Health.Status}}' "$smoke_name"
}

# No host executable or first-boot download may supply the image's FFmpeg.
docker run --rm --network none --entrypoint node "$SLOPIFY_DOCKER_IMAGE" -e '
  const fs = require("node:fs");
  const cp = require("node:child_process");
  const bin = require("ffmpeg-static");
  for (const path of [bin, bin + ".LICENSE", bin + ".README"]) {
    if (!fs.statSync(path).size) throw new Error("Missing FFmpeg file: " + path);
  }
  cp.execFileSync(bin, ["-v", "error", "-f", "lavfi", "-i", "color=s=64x64:d=0.1", "-c:v", "libx264", "-f", "null", "-"]);
'
# The image alone, without compose or a volume, still starts and stays healthy.
docker run -d --name "$offline_container" --network none --tmpfs /data:uid=1000,gid=1000,mode=0700 \
  "$SLOPIFY_DOCKER_IMAGE" >/dev/null
for _attempt in {1..180}; do
  [[ "$(docker inspect --format '{{.State.Health.Status}}' "$offline_container")" == healthy ]] && break
  sleep 1
done
test "$(docker inspect --format '{{.State.Health.Status}}' "$offline_container")" = healthy
docker exec "$offline_container" sh -c 'test ! -d /data/bin'
test "$(docker inspect --format '{{.Config.User}}' "$offline_container")" = node
docker rm -f "$offline_container" >/dev/null

# First install on a free port: a compose project with the external volume and a localhost port.
install --port 0
original_id=$(docker inspect --format '{{.Id}}' "$smoke_name")
test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$smoke_name")" = "$smoke_name"
test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$smoke_name")" = unless-stopped
test "$(docker inspect --format '{{(index (index .NetworkSettings.Ports "6969/tcp") 0).HostIp}}' "$smoke_name")" = 127.0.0.1
test -f "$install_dir/compose.yaml" && test -f "$install_dir/install.json" && test ! -e "$install_dir/update.json"
test "$(stat -c %a "$install_dir/.env")" = 600
curl --fail --silent "http://$(docker port "$smoke_name" 6969/tcp)/api/health" >/dev/null
docker exec "$smoke_name" node -e '
  fetch("http://127.0.0.1:6969/api/providers").then(r => r.json()).then(body => {
    const cli = body.providers.filter(p => ["codex", "claude-code", "gemini", "codex-image"].includes(p.id));
    if (cli.length !== 4 || cli.some(p => p.readiness.installed || p.readiness.issueKind !== "bridge")) process.exit(1);
  }).catch(() => process.exit(1));
'
docker exec "$smoke_name" sh -c 'test "$HOME" = /data/home && test -w "$HOME"'
docker exec "$smoke_name" node -e \
  "require('node:fs').writeFileSync('/data/.container-smoke', 'persisted')"
docker exec "$smoke_name" node -e \
  "require('node:fs').writeFileSync('/data/projects/host-owned', 'x')"
test "$(stat -c %u "$SLOPIFY_DOCKER_PROJECTS_DIR/host-owned")" = "$(id -u)"

# The same command with the same settings changes nothing.
install
test "$(docker inspect --format '{{.Id}}' "$smoke_name")" = "$original_id"

# A changed setting recreates the container through compose, snapshots and keeps the data.
assigned_port=$(docker port "$smoke_name" 6969/tcp)
install --port "${assigned_port##*:}"
test "$(docker inspect --format '{{.Id}}' "$smoke_name")" != "$original_id"
test "$(docker volume ls --quiet --filter "name=^${smoke_volume}-recovery-" | wc -l)" = 1
docker exec "$smoke_name" node -e \
  "if (require('node:fs').readFileSync('/data/.container-smoke', 'utf8') !== 'persisted') process.exit(1)"

# A second change keeps only the newest recovery volume.
first_recovery=$(docker volume ls --quiet --filter "name=^${smoke_volume}-recovery-")
install --port 0
test "$(docker volume ls --quiet --filter "name=^${smoke_volume}-recovery-" | wc -l)" = 1
test "$(docker volume ls --quiet --filter "name=^${smoke_volume}-recovery-")" != "$first_recovery"

# `update` on an up-to-date install is a no-op; a removed container is recreated from the volume.
node packages/app/dist/edge/cli.js update --docker --host-cli=off
docker rm -f "$smoke_name" >/dev/null
install
docker exec "$smoke_name" node -e \
  "if (require('node:fs').readFileSync('/data/.container-smoke', 'utf8') !== 'persisted') process.exit(1)"
test "$(health_status)" != unhealthy
curl --fail --silent "http://$(docker port "$smoke_name" 6969/tcp)/api/health" >/dev/null
succeeded=true
echo "Container smoke passed."
