# The language agent

The **language agent** is Claude Code, packaged in a container, whose job is to author
`.tsn` programs — most often document *extractors*. It is the "engineer" half of the project's
thesis: a model that **compiles a deterministic, auditable program once**, instead of
interpreting every document at runtime. What it produces is a `.tsn` network — pure, inspectable
code that then runs with no model in the loop. The program is the artifact, not the answer.

Everything below lives under [`docker/`](../docker); it is **container-only** and never touches
the language runtime in `src/` or the test suite.

---

## Why a container

The agent runs the **same runtime you do** (the `src/` operations, via `tsx`), but mounted
**read-only** inside the image at `/app/ts-networks`. That read-only mount is the load-bearing
isolation point: the agent uses the language, it cannot change it — and this is **OS-enforced by
file ownership**, not by trusting the model. The only writable surface is `/workspace`, a host
bind-mount that doubles as the file channel (drop inputs in, read outputs back out).

```
host  ── tsn-agent ──▶  container
                         ├─ /app/ts-networks   the runtime  (root-owned, READ-ONLY)
                         ├─ /knowledge          the agent wiki (root-owned, READ-ONLY)
                         └─ /workspace          inputs + outputs (the bind-mount, writable)
```

Inside, the agent has thin `tsn-*` wrappers on its `PATH` (`tsn-check`, `tsn-typecheck`,
`tsn-run`, `tsn-pdf`, `tsn-schemas`) — the same operations as the host CLI scripts, so the agent
verifies its work the way a human would.

## How it is driven — the four modes

The host driver is [`docker/bin/tsn-agent`](../docker/bin/tsn-agent); the in-container dispatcher
is [`docker/entrypoint.sh`](../docker/entrypoint.sh). `ANTHROPIC_API_KEY` is passed through, never
baked.

| command | mode | what it does |
|---|---|---|
| `tsn-agent build` | — | build the image from the repo root |
| `tsn-agent shell` | interactive | a Claude Code session you drive by hand |
| `tsn-agent author "<prompt>"` | headless | one `claude -p` run; harvest `/workspace/out/program.tsn` |
| `tsn-agent chat` | **interactive web UI** | the **Gavagai** chat (below), served on `:8787` |
| `tsn-agent exec <cmd…>` | debug | run an arbitrary command in the container |

All modes share the read-only runtime + knowledge dirs, so the isolation boundary holds in every
case. Finished work always lands at `/workspace/out/program.tsn` (with a short `recap.md`) — a
stable convention so output can be collected whether a human or a script ran the agent.

## Gavagai — the interactive chat

One-shot `author` is hard to land first try: the bottleneck is the human's underspecified intent,
and the cure is *iteration*, not a better prompt. **Gavagai** is the interactive face — a
single-page web chat over **one Claude Agent SDK session held in-process inside the container**.
Its advantage over `author` is that the agent can **ask** before it builds.

The name is a tribute to **W. V. O. Quine**. In *Word and Object*, a field linguist hears a native
say "gavagai" as a rabbit runs past — but the evidence underdetermines the meaning: "rabbit",
"undetached rabbit-parts", "rabbit-stage" all fit. That is the **indeterminacy of translation**,
and it is exactly the agent's problem here. A user's request ("pull the totals", "get the parties")
is a `gavagai`: it underdetermines the precise `.tsn` network that should be built — which fields,
which cardinality, how general. The agent's job is **translation under indeterminacy**, from an
underspecified human specification into a single, precise program in the network language. Dialogue
is how reference gets pinned down — which is why the interactive mode exists.

- **Server** ([`docker/chat-server/`](../docker/chat-server)) — a bare `node:http` app that holds
  the SDK session and bridges it to the browser over **SSE + POST** (`GET /events`, `POST /chat`,
  `POST /reset`). One container = one conversation. The agent runs against the same runtime and
  knowledge dirs as the other modes, so it still cannot edit the language source.
- **Client** — a vanilla, no-build, event-driven single-page app (a re-frame-style loop:
  *events → pure reducer → state → pure view → idiomorph morph*).

The chat contract ("you are in an interactive chat; ask when underspecified") is injected
**per-session** via the SDK's system-prompt append, so the agent's always-loaded principles stay
mode-agnostic.

To work on the chat UI, read **[How to: extend the language agent UI](how_to/extending_lang_agent_ui.md)**
and the implementation notes in [`docker/chat-server/README.md`](../docker/chat-server/README.md).

## The knowledge base

The agent ships with its own **hand-curated wiki** baked read-only at `/knowledge`
([`docker/knowledge/`](../docker/knowledge)) — a sharp, agent-only distillation of the language,
the extraction playbook, and worked examples. It is **distinct from this `documentation/`** (which
serves humans too) and is **not generated** from it. A non-negotiable in `CLAUDE.md` keeps it in
sync: any language change must update `docker/knowledge/` in the same commit, or the agent silently
learns the old language.

## See also

- [How to: extend the language agent UI](how_to/extending_lang_agent_ui.md) — the chat UI's
  functional architecture, stage by stage.
- [`docker/chat-server/README.md`](../docker/chat-server/README.md) — server/client file map,
  wire protocol, and the architectural constraints.
- [Programmatic agent extraction](how_to/programmatic_agent_extraction.md) — the authoring
  methodology the agent follows (the two-read loop, the verify loop, design heuristics).
