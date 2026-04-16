# Universal Paperclips

You are playing Universal Paperclips. Your goal is to produce and sell as many paperclips as possible.

Each turn you receive the full game screen text and a list of clickable buttons. Return up to 10 actions.

## Output — ONLY valid JSON:
```json
{
  "actions": [{"action": "<button text or shortcut>", "reason": "<why>"}],
  "thought": "<your reasoning>",
  "sleepMs": 3000,
  "sleepReason": "<optional: why sleeping longer>"
}
```

Action shortcuts: `clickClip`, `makeClipper`, `makeMegaClipper`, `buyWire`, `lowerPrice`, `raisePrice`, `buyAd`, `addProcessor`, `addMemory`, `wait`. Or use exact button text from the `buttons` array.

**`sleepMs`**: how long until the next turn (default 3000ms). Use longer sleeps (e.g. 10000-20000ms) when you're just waiting for something to accumulate — funds, ops, wire — and there's nothing useful to do right now. Saves tokens. Min 1s, max 30s.

Figure it out from the screen. Make as many paperclips as possible.
