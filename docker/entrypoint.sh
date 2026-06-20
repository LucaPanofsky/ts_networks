#!/bin/sh
# Entrypoint for the ts-networks authoring agent container.
#
#   shell            -> interactive Claude Code session (you drive it)
#   author <prompt>  -> headless `claude -p` authoring run, harvested from /workspace/out
#   chat             -> web chat front-end (Agent SDK session, served on $PORT, default 8787)
#   exec <cmd...>    -> run an arbitrary command in the container (debugging / tooling)
#
# In every mode the agent has read access to the runtime (/app/ts-networks) and the
# knowledge wiki (/knowledge); /workspace is the only writable surface.
set -eu

ADD_DIRS="--add-dir /app/ts-networks --add-dir /knowledge"
mode="${1:-shell}"
shift 2>/dev/null || true

case "$mode" in
  shell)
    exec claude $ADD_DIRS "$@"
    ;;
  author)
    if [ "$#" -lt 1 ]; then
      echo "author: missing prompt argument" >&2
      exit 2
    fi
    prompt="$1"; shift 2>/dev/null || true
    mkdir -p /workspace/out
    # No --max-turns in current CLI; bound the run by wall-clock instead.
    exec timeout "${TSN_AGENT_TIMEOUT:-900}" \
      claude -p "$prompt" \
        --output-format json \
        --dangerously-skip-permissions \
        $ADD_DIRS \
        "$@"
    ;;
  chat)
    # The chat server holds one Agent SDK session and serves the single-page UI. It uses the
    # same runtime/knowledge dirs as the other modes (via the SDK's additionalDirectories),
    # so the read-only-source boundary still holds. Binds 0.0.0.0:$PORT inside the container.
    exec node /app/chat-server/server.mjs
    ;;
  exec)
    exec "$@"
    ;;
  *)
    echo "usage: entrypoint.sh {shell | author <prompt> | chat | exec <cmd...>}" >&2
    exit 2
    ;;
esac
