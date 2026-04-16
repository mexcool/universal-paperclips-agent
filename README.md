# Universal Paperclips AI

An autonomous AI agent that plays [Universal Paperclips](https://www.decisionproblem.com/paperclips/) using an LLM. The agent reads the game state on a 3-second tick, asks the LLM what to do, and clicks buttons for you.

## How it works

A local Node.js server (`server.js`) serves the game files and exposes a `/decide` endpoint. The browser-side `agent.js` sends the current game screen text and available buttons to `/decide`, receives a JSON list of actions, and executes them by clicking the appropriate buttons.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and set your preferred provider (default: openclaw)
node server.js
# Then open http://localhost:3000
```

## LLM Providers

`LLM_PROVIDER` in `.env` (or environment) always wins. Default is `openclaw`.

### Option 1 — OpenClaw (default)

Uses the `openclaw` CLI, which routes through a local OpenClaw gateway. No API key needed in `.env`.

```env
LLM_PROVIDER=openclaw
```

Requires the [OpenClaw](https://openclaw.ai) CLI to be installed and running.

```bash
# Explicit start (safest — prevents env var bleed-through):
LLM_PROVIDER=openclaw node server.js
```

### Option 2 — Anthropic API

Uses the `@anthropic-ai/sdk` directly with your own API key.

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

> **Note:** Having `ANTHROPIC_API_KEY` set in your environment does **not** automatically select the Anthropic provider. You must set `LLM_PROVIDER=anthropic` explicitly.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the local server |
| `LLM_PROVIDER` | `openclaw` | `openclaw` or `anthropic` |
| `ANTHROPIC_API_KEY` | — | Required for `anthropic` provider only |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Claude model (anthropic provider only) |

## Keeping the server alive

The server runs as a plain Node process. To keep it alive across shell sessions, use tmux or a process manager:

```bash
# tmux (simple)
tmux new-session -d -s paperclips 'LLM_PROVIDER=openclaw node server.js'

# pm2
pm2 start server.js --name paperclips --env LLM_PROVIDER=openclaw
```

## Agent controls

The agent overlay in the bottom-right of the game window lets you:
- **Pause/resume** the agent
- **Restart** the game (clears save data)
- **Minimize** the overlay

You can also pause from the browser console:
```js
window.agentPause = true;
```

## Strategy

The agent's behavior is driven by `strategy.md`. Edit this file while the server is running — it's reloaded automatically every 3 seconds.

## Acknowledgments

The original [Universal Paperclips](https://www.decisionproblem.com/paperclips/) game was created by [Frank Lantz](https://en.wikipedia.org/wiki/Frank_Lantz) in 2017. The game files (`index.html`, `main.js`, `globals.js`, `projects.js`, `combat.js`, `interface.css`, and associated assets) are included in this repository for convenience and remain the intellectual property of Frank Lantz.

## License

The agent code (`server.js`, `agent.js`, `strategy.md`) is released under the [MIT License](LICENSE). The original game files are **not** covered by this license.
