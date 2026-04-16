require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown',
};

const { execFile } = require('child_process');

// Detect LLM provider:
// 1. LLM_PROVIDER in .env or environment (explicit — always wins)
// 2. Default to 'openclaw'
// Note: ANTHROPIC_API_KEY being present does NOT auto-select anthropic.
// Set LLM_PROVIDER=anthropic explicitly if you want direct API access.
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openclaw';

// Load strategy.md once at startup, reload on change
let strategyPrompt = '';
const strategyPath = path.join(__dirname, 'strategy.md');
function loadStrategy() {
  try {
    strategyPrompt = fs.readFileSync(strategyPath, 'utf8');
  } catch (e) {
    console.error('Could not load strategy.md:', e.message);
    strategyPrompt = 'You are an AI playing Universal Paperclips. Return JSON with actions array and thought string.';
  }
}
loadStrategy();
fs.watchFile(strategyPath, { interval: 2000 }, loadStrategy);

// --- Provider: openclaw CLI ---
function callClaudeOpenClaw(stateJson) {
  return new Promise((resolve, reject) => {
    const message = strategyPrompt + '\n\nGame state:\n' + stateJson + '\n\nReturn ONLY valid JSON with "actions" array and "thought" string. No markdown fences.';
    // Use a unique session ID per call so each decision is stateless
    // (avoids context overflow from accumulating game history)
    const sessionId = 'paperclips-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const args = [
      'agent',
      '--session-id', sessionId,
      '--message', message,
      '--json',
    ];

    execFile('openclaw', args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`openclaw agent failed: ${err.message}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        const text = result?.result?.payloads?.[0]?.text || '';
        if (!text) reject(new Error('Empty response from openclaw agent'));
        else resolve(text);
      } catch (e) {
        reject(new Error(`Failed to parse openclaw response: ${e.message} | stdout: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

// --- Provider: Anthropic SDK ---
let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

async function callClaudeAnthropic(stateJson) {
  const client = getAnthropicClient();
  const message = strategyPrompt + '\n\nGame state:\n' + stateJson + '\n\nReturn ONLY valid JSON with "actions" array and "thought" string. No markdown fences.';
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: message }],
  });
  const text = response.content?.[0]?.text || '';
  if (!text) throw new Error('Empty response from Anthropic API');
  return text;
}

// --- Unified callClaude dispatcher ---
function callClaude(stateJson) {
  if (LLM_PROVIDER === 'anthropic') {
    return callClaudeAnthropic(stateJson);
  }
  return callClaudeOpenClaw(stateJson);
}

function mockResponse(state) {
  const actions = [];
  if (state.wire < 200 && state.funds >= state.wireCost) {
    actions.push({ action: 'buyWire', reason: 'wire low (mock mode)' });
  }
  if (state.funds > (state.clipperCost || 10) + (state.wireCost || 20)) {
    actions.push({ action: 'makeClipper', reason: 'can afford clipper (mock mode)' });
  }
  if (actions.length === 0) {
    actions.push({ action: 'wait', reason: 'mock fallback — nothing to do' });
  }
  return { actions, thought: 'Mock mode: LLM unavailable', mock: true };
}

function parseClaudeResponse(text) {
  // Try to extract JSON from the response — Claude might wrap it in markdown
  let json = text.trim();
  const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) json = fenceMatch[1].trim();

  const parsed = JSON.parse(json);
  // Validate structure
  if (!Array.isArray(parsed.actions)) {
    throw new Error('Response missing actions array');
  }
  // Cap at 10 actions
  parsed.actions = parsed.actions.slice(0, 10);
  return parsed;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // Handle /decide — POST (preferred) or GET ?s=<base64>
  if (parsed.pathname === '/decide' && (req.method === 'POST' || req.method === 'GET')) {
    try {
      let stateJson, state;
      if (req.method === 'POST') {
        stateJson = await readBody(req);
        state = JSON.parse(stateJson);
      } else {
        const b64 = parsed.query.s;
        if (!b64) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ error: 'Missing ?s= query param' }));
          return;
        }
        stateJson = Buffer.from(decodeURIComponent(b64), 'base64').toString('utf8');
        state = JSON.parse(stateJson);
      }

      let result;
      try {
        const text = await callClaude(stateJson);
        result = parseClaudeResponse(text);
      } catch (llmErr) {
        console.error('[LLM fallback]', llmErr.message);
        result = mockResponse(state);
        result.thought = 'LLM error — safe fallback: ' + llmErr.message.slice(0, 80);
      }

      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.error('[/decide error]', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({
        error: e.message,
        actions: [{ action: 'wait', reason: 'server error' }],
        thought: 'Error: ' + e.message,
      }));
    }
    return;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Static file serving
  let filePath = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  filePath = path.join(__dirname, filePath);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (ext !== '.ico') console.log(`404 ${req.method} ${req.url}`);
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Paperclips server running at http://localhost:${PORT}`);
  console.log(`LLM provider: ${LLM_PROVIDER}`);
});
