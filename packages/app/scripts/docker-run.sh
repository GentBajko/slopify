#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != Linux ]]; then
  echo "Host CLI bridging requires Linux executables. Use the API providers on this host." >&2
  exit 1
fi

image=${SLOPIFY_DOCKER_IMAGE:-ghcr.io/gentbajko/slopify:latest}
container=${SLOPIFY_DOCKER_NAME:-slopify}
volume=${SLOPIFY_DOCKER_VOLUME:-slopify-data}
host_port=${SLOPIFY_DOCKER_HOST_PORT:-6969}
if [[ ! "$host_port" =~ ^[0-9]{1,5}$ ]] || (( host_port > 65535 )); then
  echo "SLOPIFY_DOCKER_HOST_PORT must be a port from 0 to 65535." >&2
  exit 1
fi
published_port=$host_port
if [[ "$host_port" == 0 ]]; then published_port=""; fi

mounts=()
environment=()
installations=()
if [[ -n ${GEMINI_API_KEY:-} ]]; then environment+=(--env GEMINI_API_KEY); fi

bridge_node_package() {
  local command_name=$1 expected_package=$2 target=$3
  local launcher package_dir actual_package
  launcher=$(command -v "$command_name") || return 0
  launcher=$(readlink -f "$launcher")
  package_dir=$(dirname "$(dirname "$launcher")")
  if [[ ! -f "$package_dir/package.json" ]]; then
    echo "Cannot bridge $command_name: expected an npm package around $launcher." >&2
    exit 1
  fi
  actual_package=$(node -p 'require(process.argv[1]).name' "$package_dir/package.json")
  if [[ "$actual_package" != "$expected_package" ]]; then
    echo "Cannot bridge $command_name: $launcher is not from $expected_package." >&2
    exit 1
  fi
  mounts+=(--mount "type=bind,source=$package_dir,target=$target,readonly")
  installations+=("$(stat -Lc '%d:%i' "$package_dir")")
  echo "Detected $command_name: $launcher" >&2
}

bridge_node_package codex @openai/codex /opt/host-clis/codex
bridge_node_package gemini @google/gemini-cli /opt/host-clis/gemini

# Model metadata is separate from login state. Mount only this file, never the
# user's Codex home, which also contains credentials and conversation history.
codex_models=${CODEX_HOME:-$HOME/.codex}/models_cache.json
if command -v codex >/dev/null 2>&1 && [[ -f "$codex_models" ]]; then
  codex_models=$(readlink -f "$codex_models")
  mounts+=(--mount "type=bind,source=$codex_models,target=/opt/host-cli-data/codex-models.json,readonly")
  environment+=(--env SLOPIFY_CODEX_MODELS_FILE=/opt/host-cli-data/codex-models.json)
  installations+=("$(stat -Lc '%d:%i' "$codex_models")")
fi

if command -v claude >/dev/null 2>&1; then
  claude_binary=$(readlink -f "$(command -v claude)")
  if [[ "$(head -c 4 "$claude_binary")" != $'\177ELF' ]]; then
    echo "Cannot bridge claude: this launcher is not a native Linux executable." >&2
    exit 1
  fi
  mounts+=(--mount "type=bind,source=$claude_binary,target=/opt/host-clis/claude,readonly")
  installations+=("$(stat -Lc '%d:%i' "$claude_binary")")
  echo "Detected claude: $claude_binary" >&2
fi

if ! docker image inspect "$image" >/dev/null 2>&1; then docker pull "$image"; fi
image_id=$(docker image inspect --format '{{.Id}}' "$image")
# Changing an installation path or image requires new bind mounts. Re-running
# the launcher reconciles those automatically while keeping the named data volume.
signature=$(printf '%s\0' "$image_id" "$volume" "$host_port" "${mounts[@]}" "${installations[@]}" "${environment[@]}" "${GEMINI_API_KEY:-}" | sha256sum | cut -d ' ' -f 1)
previous=""
if docker container inspect "$container" >/dev/null 2>&1; then
  existing_signature=$(docker inspect --format '{{index .Config.Labels "io.slopify.launcher"}}' "$container")
  if [[ "$existing_signature" == "$signature" ]]; then
    docker start "$container" >/dev/null
    echo "Slopify is running at http://$(docker port "$container" 6969/tcp)"
    exit 0
  fi
  existing_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container")
  if [[ "$existing_volume" != "$volume" ]]; then
    echo "Container $container uses a different data mount. Set SLOPIFY_DOCKER_NAME to a new name or select its existing SLOPIFY_DOCKER_VOLUME." >&2
    exit 1
  fi
  previous="$container-previous-$(date +%Y%m%d%H%M%S)"
  previous_restart=$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container")
  docker update --restart=no "$container" >/dev/null
  docker stop "$container" >/dev/null
  docker rename "$container" "$previous"
fi

if ! docker run -d \
  --name "$container" \
  --label "io.slopify.launcher=$signature" \
  --restart always \
  -p "127.0.0.1:$published_port:6969" \
  --mount "type=volume,source=$volume,target=/data" \
  "${mounts[@]}" \
  "${environment[@]}" \
  "$image"; then
  if [[ -n "$previous" ]]; then
    failed_signature=$(docker inspect --format '{{index .Config.Labels "io.slopify.launcher"}}' "$container" 2>/dev/null || true)
    if [[ "$failed_signature" == "$signature" ]]; then docker rm -f "$container" >/dev/null; fi
    docker rename "$previous" "$container"
    docker update --restart="$previous_restart" "$container" >/dev/null
    docker start "$container" >/dev/null
  fi
  exit 1
fi
echo "Slopify is starting at http://$(docker port "$container" 6969/tcp)"
if [[ -n "$previous" ]]; then echo "Previous container kept stopped as $previous."; fi
