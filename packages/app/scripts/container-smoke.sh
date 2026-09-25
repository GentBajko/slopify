#!/usr/bin/env bash
set -euo pipefail

smoke_container="slopify-container-smoke-$$"
smoke_volume="slopify-container-smoke-$$"
offline_container="${smoke_container}-offline"
previous_id=""
smoke_root=$(mktemp -d -t slopify-container-projects-XXXXXXXX)
export XDG_DATA_HOME="$smoke_root/state"
export SLOPIFY_DOCKER_PROJECTS_DIR="$smoke_root/Projects"
succeeded=false

cleanup() {
  if [[ "$succeeded" != true ]]; then
    printf 'Disposable recovery material retained: %s %s %s\n' "$smoke_root" "$smoke_container" "$smoke_volume" >&2
    return
  fi
  docker rm -f "$offline_container" >/dev/null 2>&1 || true
  docker rm -f "$smoke_container" >/dev/null 2>&1 || true
  if [[ -n "$previous_id" ]]; then docker rm -f "$previous_id" >/dev/null 2>&1 || true; fi
  local target
  while IFS= read -r target; do
    if [[ -n "$target" ]]; then docker rm -f "$target" >/dev/null; fi
  done < <(docker container ls -a --filter "name=^/${smoke_container}($|-)" --format '{{.ID}}')
  docker volume rm "$smoke_volume" >/dev/null 2>&1 || true
  node --input-type=module - "$smoke_root" "$smoke_container" "$smoke_volume" <<'JS'
import { execFileSync } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
const [root,name,volume]=process.argv.slice(2);
if (!root || !name || !volume || !name.startsWith('slopify-container-smoke-')) throw new Error('Invalid smoke cleanup identity');
const directory=join(root,'state/slopify/docker',name);
for (const entry of await readdir(directory).catch(()=>[])) {
  if (!/^[a-f0-9-]{36}$/.test(entry)) continue;
  const j=JSON.parse(await readFile(join(directory,entry,'journal.json'),'utf8'));
  if (j.volume!==volume || j.backup!==`${volume}-recovery-${j.id}`) throw new Error('Foreign recovery volume');
  const names=execFileSync('docker',['volume','ls','--format','{{.Name}}'],{encoding:'utf8'}).split(/\s+/);
  if (names.includes(j.backup)) execFileSync('docker',['volume','rm',j.backup],{stdio:'pipe'});
}
await rm(root,{recursive:true,force:true});
JS
}
trap cleanup EXIT

docker volume create "$smoke_volume" >/dev/null

start_container() {
  SLOPIFY_HOST_CLI_DIR="" \
    SLOPIFY_DOCKER_IMAGE=slopify:smoke \
    SLOPIFY_DOCKER_NAME="$smoke_container" \
    SLOPIFY_DOCKER_VOLUME="$smoke_volume" \
    SLOPIFY_DOCKER_HOST_PORT="${1:-0}" \
    bash packages/app/scripts/docker-run.sh >/dev/null
}

wait_for_health() {
  local target="${1:-$smoke_container}"
  for _attempt in {1..180}; do
    if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$target")" == "healthy" ]]; then
      return 0
    fi
    sleep 1
  done
  docker logs "$target" >&2
  return 1
}

# No host executable or first-boot download may supply the image's FFmpeg.
docker run --rm --network none --entrypoint node slopify:smoke -e '
  const fs = require("node:fs");
  const cp = require("node:child_process");
  const bin = require("ffmpeg-static");
  for (const path of [bin, bin + ".LICENSE", bin + ".README"]) {
    if (!fs.statSync(path).size) throw new Error("Missing FFmpeg file: " + path);
  }
  cp.execFileSync(bin, ["-v", "error", "-f", "lavfi", "-i", "color=s=64x64:d=0.1", "-c:v", "libx264", "-f", "null", "-"]);
'
docker run -d --name "$offline_container" --network none --tmpfs /data:uid=1000,gid=1000,mode=0700 \
  slopify:smoke >/dev/null
wait_for_health "$offline_container"
docker exec "$offline_container" sh -c 'test ! -d /data/bin'
docker rm -f "$offline_container" >/dev/null

start_container
wait_for_health
original_id=$(docker inspect --format '{{.Id}}' "$smoke_container")
start_container
test "$(docker inspect --format '{{.Id}}' "$smoke_container")" = "$original_id"
test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$smoke_container")" = "always"
curl --fail --silent "http://$(docker port "$smoke_container" 6969/tcp)/api/health" >/dev/null
docker exec "$smoke_container" node -e '
  fetch("http://127.0.0.1:6969/api/providers").then(r => r.json()).then(body => {
    const cli = body.providers.filter(p => ["codex", "claude-code", "gemini", "codex-image"].includes(p.id));
    if (cli.length !== 4 || cli.some(p => p.readiness.installed || p.readiness.issueKind !== "bridge")) process.exit(1);
  }).catch(() => process.exit(1));
'
docker exec "$smoke_container" sh -c 'test "$HOME" = /data/home && test -w "$HOME"'
docker exec "$smoke_container" node -e \
  "require('node:fs').writeFileSync('/data/.container-smoke', 'persisted')"
# A changed launch configuration must recreate the container, keep its data,
# and disable restarts on the retained previous container.
previous_id=$original_id
assigned_port=$(docker port "$smoke_container" 6969/tcp)
start_container "${assigned_port##*:}"
wait_for_health
test "$(docker inspect --format '{{.Id}}' "$smoke_container")" != "$previous_id"
test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$previous_id")" = "no"
test "$(docker inspect --format '{{.State.Running}}' "$previous_id")" = "false"
docker exec "$smoke_container" node -e \
  "if (require('node:fs').readFileSync('/data/.container-smoke', 'utf8') !== 'persisted') process.exit(1)"
docker stop "$smoke_container" >/dev/null
docker rm "$smoke_container" >/dev/null

start_container
wait_for_health
docker exec "$smoke_container" node -e \
  "if (require('node:fs').readFileSync('/data/.container-smoke', 'utf8') !== 'persisted') process.exit(1)"
curl --fail --silent "http://$(docker port "$smoke_container" 6969/tcp)/api/health" >/dev/null
succeeded=true
