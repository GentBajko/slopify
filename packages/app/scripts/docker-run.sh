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
}

bridge_node_package codex @openai/codex /opt/host-clis/codex
bridge_node_package gemini @google/gemini-cli /opt/host-clis/gemini

if command -v claude >/dev/null 2>&1; then
  claude_binary=$(readlink -f "$(command -v claude)")
  if [[ "$(head -c 4 "$claude_binary")" != $'\177ELF' ]]; then
    echo "Cannot bridge claude: this launcher is not a native Linux executable." >&2
    exit 1
  fi
  mounts+=(--mount "type=bind,source=$claude_binary,target=/opt/host-clis/claude,readonly")
fi

docker run -d \
  --name "$container" \
  --restart always \
  -p "127.0.0.1:$published_port:6969" \
  --mount "type=volume,source=$volume,target=/data" \
  "${mounts[@]}" \
  "${environment[@]}" \
  "$image"
