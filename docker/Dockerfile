# ts-networks authoring-agent image.
#
# Two stages: `build` compiles the lezer parser and prunes to runtime deps; `runtime` is a
# slim image holding ONLY the language runtime (read-only), the agent knowledge wiki, Claude
# Code, and the tsn-* wrappers. The agent works in /workspace (the writable mount) and never
# touches the host or the runtime source.
#
# Build (from the repo root, which is the build context):
#   docker build -f docker/Dockerfile -t tsn-agent .

# ---------- stage 1: build the runtime ----------
FROM node:22-slim AS build
WORKDIR /app/ts-networks

# Install deps (full, incl. dev) so we can generate the parser.
COPY package.json package-lock.json ./
RUN npm ci

# Just the runtime sources — no tests, ui, dev, examples, docs.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Generate the lezer parser (devDep @lezer/generator), then drop dev deps.
RUN npm run generate \
 && npm prune --omit=dev \
 && npm cache clean --force

# ---------- stage 2: the agent runtime ----------
FROM node:22-slim AS runtime

# Claude Code + the TS runner, global on PATH.
RUN npm install -g @anthropic-ai/claude-code tsx \
 && npm cache clean --force

ENV TSN_WORKSPACE=/workspace \
    NODE_ENV=production \
    PORT=8787 \
    TSN_CLAUDE_PATH=/usr/local/bin/claude

# The web chat front-end (Agent SDK session in-container). Its single dependency is the
# Agent SDK, pinned in lockstep with the global CLI above. `--omit=optional` skips the SDK's
# bundled native CLI binary: the chat server reuses the already-installed global `claude`
# (TSN_CLAUDE_PATH), so a second copy would just bloat the image.
COPY docker/chat-server/package.json /app/chat-server/package.json
RUN cd /app/chat-server \
 && npm install --omit=dev --omit=optional \
 && npm cache clean --force
COPY docker/chat-server/agent.mjs docker/chat-server/server.mjs /app/chat-server/
COPY docker/chat-server/public /app/chat-server/public

# The language runtime: root-owned, read-only to the agent (the security boundary).
COPY --from=build /app/ts-networks /app/ts-networks

# The agent's knowledge base: root-owned, read-only.
COPY docker/knowledge /knowledge

# tsn-* command wrappers + the entrypoint.
COPY docker/runtime-bin/ /usr/local/bin/
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/tsn-* /usr/local/bin/entrypoint.sh

# The agent's user-global memory (Claude Code always loads ~/.claude/CLAUDE.md).
RUN mkdir -p /home/node/.claude
COPY docker/agent-home/CLAUDE.md /home/node/.claude/CLAUDE.md

# The only writable surface, owned by the non-root agent user.
RUN mkdir -p /workspace \
 && chown -R node:node /workspace /home/node/.claude

# Claude Code refuses --dangerously-skip-permissions as root, and non-root is the point.
USER node
WORKDIR /workspace

# Chat mode binds this port; published by `tsn-agent chat`. Other modes ignore it.
EXPOSE 8787

ENTRYPOINT ["entrypoint.sh"]
CMD ["shell"]
