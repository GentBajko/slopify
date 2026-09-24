#!/usr/bin/env bash
set -euo pipefail

smoke_container="slopify-container-smoke-$$"
smoke_volume="slopify-container-smoke-$$"
previous_id=""

cleanup() {
  docker rm -f "$smoke_container" >/dev/null 2>&1 || true
  if [[ -n "$previous_id" ]]; then docker rm -f "$previous_id" >/dev/null 2>&1 || true; fi
  docker volume rm "$smoke_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$smoke_volume" >/dev/null

start_container() {
  SLOPIFY_DOCKER_IMAGE=slopify:smoke \
    SLOPIFY_DOCKER_NAME="$smoke_container" \
    SLOPIFY_DOCKER_VOLUME="$smoke_volume" \
    SLOPIFY_DOCKER_HOST_PORT="${1:-0}" \
    bash packages/app/scripts/docker-run.sh >/dev/null
}

wait_for_health() {
  for _attempt in {1..180}; do
    if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$smoke_container")" == "healthy" ]]; then
      return 0
    fi
    sleep 1
  done
  docker logs "$smoke_container" >&2
  return 1
}

start_container
wait_for_health
original_id=$(docker inspect --format '{{.Id}}' "$smoke_container")
start_container
test "$(docker inspect --format '{{.Id}}' "$smoke_container")" = "$original_id"
test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$smoke_container")" = "always"
curl --fail --silent "http://$(docker port "$smoke_container" 6969/tcp)/api/health" >/dev/null
for cli in codex claude gemini; do
  if command -v "$cli" >/dev/null 2>&1; then
    provider=$cli
    if [[ "$cli" == claude ]]; then provider=claude-code; fi
    docker exec "$smoke_container" "$cli" --version >/dev/null
    docker exec "$smoke_container" node -e \
      "fetch('http://127.0.0.1:6969/api/providers').then(r => r.json()).then(body => { if (!body.providers.some(p => p.id === '$provider' && p.readiness.installed)) process.exit(1) }).catch(() => process.exit(1))"
    if [[ "$cli" == gemini || "$cli" == codex || "$cli" == claude ]]; then
      docker exec "$smoke_container" node -e \
        "fetch('http://127.0.0.1:6969/api/providers/$provider/models').then(r => r.json()).then(body => { if (!Array.isArray(body.models) || body.models.length < 2 || body.warning) process.exit(1) }).catch(() => process.exit(1))"
    fi
  fi
done
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
