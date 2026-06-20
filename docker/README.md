# Running the ts-networks authoring agent (Gavagai)

Gavagai is a containerized Claude Code instance that authors `.tsn` programs using the
language's own runtime and tools. The runtime (`/app/ts-networks`) and the knowledge base
(`/knowledge`) are baked in read-only; the agent works only in `/workspace`. It needs an
`ANTHROPIC_API_KEY` — passed in at runtime, never baked into the image.

## Chat UI (the PoC deployment) — Docker Compose

From this `docker/` directory, with your key exported in the shell (it never touches a file):

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # stays in your shell; never written to disk
docker compose up --build             # builds the image and serves the chat UI
# open http://localhost:8787
docker compose down                   # stop; the workspace persists on the host
```

The key can come from your shell (as above) **or** from a `.env` file — `docker compose`
auto-loads `./.env`. A `.env` file is optional and only worth it for the non-secret settings;
if you make one, `cp .env.example .env`. Configurable (shell env or `.env`): `TSN_AGENT_PORT`
(host port, default 8787), `TSN_AGENT_WORKDIR` (workspace dir, default `../tsn-work` =
`<repo>/tsn-work`), `TSN_AGENT_IMAGE` (image tag).

## Headless / shell — the `tsn-agent` driver

For a one-shot authoring run or an interactive sandbox shell, use `bin/tsn-agent` (export
`ANTHROPIC_API_KEY` first):

```bash
bin/tsn-agent build                  # build the image
bin/tsn-agent chat                   # same chat UI, without compose
bin/tsn-agent author "extract …"     # headless run; harvest from the work dir's out/
bin/tsn-agent shell                  # interactive Claude Code in the sandbox
```

## The workspace: persistence & size

`/workspace` is a **bind mount** to a host directory (`TSN_AGENT_WORKDIR`, default
`<repo>/tsn-work`). Consequences:

- **It persists.** Uploads (`uploads/`) and the agent's outputs (`out/`) survive `docker
  compose down`, container removal, and restarts — they live on the host, not in the container.
- **It is the file channel.** Drop inputs into the host dir (or upload through the UI); read
  results back from `out/`.
- **There is no size cap.** It uses host disk freely; sizing is the host's concern. To start
  from a clean slate, delete the host directory.

## What's where

| path | role |
|---|---|
| `Dockerfile` | two-stage build: language runtime (read-only) + Claude Code + knowledge base + chat server |
| `docker-compose.yml` · `.env.example` | the chat-UI PoC deployment |
| `bin/tsn-agent` | host driver for build / chat / author / shell / exec |
| `entrypoint.sh` | in-container mode router |
| `agent-home/` | the agent's `~/.claude`: `CLAUDE.md` (the map) + `skills/` (authoring method) |
| `knowledge/` | the read-only knowledge base (`/knowledge`) |
| `chat-server/` | the in-container web chat server (Agent SDK session + single-page UI) |
| `runtime-bin/` | the `tsn-*` command wrappers on the agent's `PATH` |
