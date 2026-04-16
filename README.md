# Universal Paperclips AI

An autonomous AI agent that plays [Universal Paperclips](https://www.decisionproblem.com/paperclips/) using Claude. The agent reads the game state on a 3-second tick, asks Claude what to do, and clicks buttons for you.

## How it works

A local Node.js server (`server.js`) serves the game files and exposes a `/decide` endpoint. The browser-side `agent.js` sends the current game screen text and available buttons to `/decide`, receives a JSON list of actions from Claude, and executes them by clicking the appropriate buttons.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and set your preferred provider
npm start
# Then open http://localhost:3000
```

## LLM Providers

### Option 1 — OpenClaw (default)

Uses the `openclaw` CLI, which handles authentication with Anthropic via a local gateway. No API key needed in `.env`.

```env
LLM_PROVIDER=openclaw
```

Requires the [OpenClaw](https://openclaw.ai) CLI to be installed and configured.

### Option 2 — Anthropic API

Uses the `@anthropic-ai/sdk` directly with your own API key.

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

If `ANTHROPIC_API_KEY` is set and `LLM_PROVIDER` is not explicitly configured, the server will automatically use the Anthropic provider.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the local server |
| `LLM_PROVIDER` | `openclaw` (or `anthropic` if key present) | `openclaw` or `anthropic` |
| `ANTHROPIC_API_KEY` | — | Required for `anthropic` provider |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Claude model to use |

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

## Testing

```bash
npm test
```

Requires Playwright (`npm install` installs it as a dev dependency). The test suite:
- Verifies the game loads
- Checks the agent overlay is present
- Hits the `/decide` endpoint
- Waits 8 seconds to confirm the agent is ticking

## License

MIT
