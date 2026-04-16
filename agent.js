// LLM-powered AI agent for Universal Paperclips
// Pause me with: window.agentPause = true

(function () {
  'use strict';

  window.agentPause = false;

  // --- Config ---
  const TICK_INTERVAL = 3000; // ms between LLM calls
  const LOG_MAX = 30;
  const log = [];
  let minimized = false;
  let tickCount = 0;
  let llmInFlight = false;

  // --- Action execution map ---
  // Click a button by its visible text (exact match first, then partial, with blacklist)
  function clickButtonByText(text) {
    const lower = text.toLowerCase().trim();

    // Never click blacklisted buttons
    if (BUTTON_BLACKLIST.some(b => lower.includes(b))) return false;

    const all = Array.from(document.querySelectorAll('button')).filter(btn =>
      btn.offsetParent !== null && !btn.disabled && !btn.closest('#agent-panel')
    );

    // 1. Exact match
    for (const btn of all) {
      const btnText = btn.textContent.trim().toLowerCase();
      if (btnText === lower) {
        btn.click();
        return true;
      }
    }

    // 2. Partial match — but skip if the match text is short and could hit the wrong button
    for (const btn of all) {
      const btnText = btn.textContent.trim().toLowerCase();
      if (btnText.includes(lower)) {
        // Extra safety: if searching for "wire", only match buttons whose text IS "wire" (already handled above)
        // or starts with "wire" — not "wirebuyer" etc.
        if (lower === 'wire' && !btnText.startsWith('wire ') && btnText !== 'wire') continue;
        btn.click();
        return true;
      }
    }
    return false;
  }

  // Aliases: map old action names → button text fragments, for LLM backwards compat
  const ACTION_ALIASES = {
    'clickClip': 'Make Paperclip',
    'makeClipper': 'AutoClippers',
    'makeMegaClipper': 'MegaClipper',
    'buyWire': 'Wire',      // resolved via exact-first match below
    'lowerPrice': 'lower',
    'raisePrice': 'raise',
    'buyAd': 'Marketing',
    'addProcessor': 'Processors',
    'addMemory': 'Memory',
  };

  // Buttons to never click — safety blacklist
  const BUTTON_BLACKLIST = ['wirebuyer', 'wire buyer', 'reset', 'prestige'];

  // Execute an action — button text (exact or partial), alias, or special
  function executeAction(action) {
    if (action === 'wait') return true;
    // Resolve alias first
    const resolved = ACTION_ALIASES[action] || action;
    return clickButtonByText(resolved);
  }

  // --- Overlay UI ---
  const panel = document.createElement('div');
  panel.id = 'agent-panel';
  panel.innerHTML = `
    <style>
      #agent-panel {
        position: fixed; bottom: 12px; right: 12px; width: 420px; height: 520px;
        min-width: 280px; min-height: 200px;
        background: rgba(0,0,0,0.88); color: #e0e0e0;
        font-family: 'Courier New', monospace; font-size: 12px;
        border: 1px solid #555; border-radius: 6px; z-index: 99999;
        display: flex; flex-direction: column; box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        resize: both; overflow: hidden;
      }
      #agent-titlebar {
        display: flex; justify-content: space-between; align-items: center;
        padding: 7px 10px; background: rgba(30,30,50,0.95); border-bottom: 1px solid #444;
        border-radius: 6px 6px 0 0; cursor: move; user-select: none; flex-shrink: 0;
      }
      #agent-titlebar span { font-weight: bold; color: #7ecfff; font-size: 13px; }
      #agent-titlebar button {
        background: none; border: none; color: #999; font-size: 15px; cursor: pointer;
        padding: 0 5px; line-height: 1;
      }
      #agent-titlebar button:hover { color: #fff; }
      #agent-llm-indicator {
        font-size: 11px; color: #ffcf7e; margin-left: 6px; display: none;
        animation: pulse 1s infinite;
      }
      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      #agent-body { padding: 8px 10px; overflow: hidden; display: flex; flex-direction: column; flex: 1; }
      #agent-status { margin-bottom: 6px; line-height: 1.6; color: #aaa; flex-shrink: 0; }
      #agent-status .val { color: #7ecfff; }
      #agent-status .phase { color: #ffcf7e; font-weight: bold; }
      #agent-thought {
        padding: 4px 6px; margin-bottom: 4px; background: rgba(126,207,255,0.08);
        border-left: 2px solid #7ecfff; font-style: italic; color: #aac8e0;
        font-size: 11px; line-height: 1.4; flex-shrink: 0; display: none;
      }
      #agent-log {
        flex: 1; overflow-y: auto;
        border-top: 1px solid #333; padding-top: 4px;
      }
      #agent-log .entry { padding: 3px 0; border-bottom: 1px solid #222; line-height: 1.4; }
      #agent-log .ts { color: #666; }
      #agent-log .act { color: #7eff8e; }
      #agent-log .reason { color: #bbb; }
      #agent-log .wait { color: #888; font-style: italic; }
      #agent-log .error { color: #ff7e7e; }
      #agent-panel.minimized #agent-body { display: none; }
      #agent-panel.minimized { height: auto !important; resize: none; }
    </style>
    <div id="agent-titlebar">
      <div>
        <span>🤖 AI Agent</span>
        <span id="agent-llm-indicator">⚡ LLM</span>
      </div>
      <div style="display:flex;gap:4px">
        <button id="agent-pause-btn" title="Pause/resume agent">⏸</button>
        <button id="agent-restart-btn" title="Restart game (clears save)" style="color:#ff6b6b">↺</button>
        <button id="agent-minimize">—</button>
      </div>
    </div>
    <div id="agent-body">
      <div id="agent-status"></div>
      <div id="agent-thought"></div>
      <div id="agent-log"></div>
    </div>
  `;
  document.body.appendChild(panel);

  // --- UI event handlers ---
  document.getElementById('agent-minimize').addEventListener('click', (e) => {
    e.stopPropagation();
    minimized = !minimized;
    panel.classList.toggle('minimized', minimized);
    e.target.textContent = minimized ? '+' : '—';
  });

  document.getElementById('agent-pause-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.agentPause = !window.agentPause;
    e.target.textContent = window.agentPause ? '▶' : '⏸';
    e.target.title = window.agentPause ? 'Resume agent' : 'Pause agent';
    addLog(window.agentPause ? '⏸ Agent paused' : '▶ Agent resumed', '', 'wait');
  });

  document.getElementById('agent-restart-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Reset ALL progress and restart? This cannot be undone.')) {
      if (typeof reset === 'function') {
        reset();
      } else {
        localStorage.removeItem('saveGame');
        localStorage.removeItem('saveProjectsUses');
        localStorage.removeItem('saveProjectsFlags');
        localStorage.removeItem('saveProjectsActive');
        localStorage.removeItem('saveStratsActive');
        location.reload();
      }
    }
  });

  // --- Drag to move ---
  const titlebar = document.getElementById('agent-titlebar');
  let dragging = false, dragOffX = 0, dragOffY = 0;
  titlebar.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = (e.clientX - dragOffX) + 'px';
    panel.style.top = (e.clientY - dragOffY) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  // --- Helpers ---
  function g(id, fallbackVar) {
    const el = document.getElementById(id);
    if (el) {
      const txt = el.innerText || el.textContent || '';
      const clean = txt.replace(/,/g, '').trim();
      const n = parseFloat(clean);
      return isNaN(n) ? clean : n;
    }
    return (typeof fallbackVar !== 'undefined') ? fallbackVar : null;
  }

  function fmt(n) {
    if (n === undefined || n === null) return '?';
    if (typeof n === 'number') {
      if (n >= 1e15) return n.toExponential(2);
      if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
      if (n % 1 !== 0) return n.toFixed(2);
    }
    return String(n);
  }

  function ts() {
    return new Date().toTimeString().slice(0, 8);
  }

  function addLog(action, reasoning, cls) {
    log.unshift({ time: ts(), action, reasoning, cls: cls || 'act' });
    if (log.length > LOG_MAX) log.pop();
    renderLog();
  }

  function renderLog() {
    const el = document.getElementById('agent-log');
    el.innerHTML = log.map(e =>
      `<div class="entry"><span class="ts">${e.time}</span> <span class="${e.cls}">${e.action}</span> <span class="reason">${e.reasoning || ''}</span></div>`
    ).join('');
  }

  function getPhase() {
    if (typeof spaceFlag !== 'undefined' && spaceFlag === 1) return 3;
    if (typeof probeCount !== 'undefined' && probeCount > 0) return 3;
    if (typeof compFlag !== 'undefined' && compFlag === 1) return 2;
    return 1;
  }

  function phaseName(p) {
    return { 1: 'Phase 1: Human Era', 2: 'Phase 2: Computing', 3: 'Phase 3: Space' }[p] || '?';
  }

  function isVisible(selector) {
    const el = document.querySelector(selector);
    return el && el.offsetParent !== null && el.style.display !== 'none';
  }

  function setLlmIndicator(active) {
    llmInFlight = active;
    const el = document.getElementById('agent-llm-indicator');
    if (el) el.style.display = active ? 'inline' : 'none';
  }

  // --- State collection ---
  function collectState() {
    // Full visible game text — everything the player sees
    const pageEl = document.getElementById('page');
    // Trim mobile/gift shop header noise and cap length to avoid 431 URL too long
    let gameText = pageEl ? pageEl.innerText : '';
    // Remove the top mobile/gift shop section (irrelevant)
    gameText = gameText.replace(/Mobile Version[\s\S]*?Welcome to Universal Paperclips[^\n]*\n/, '');
    // Cap at 2000 chars — enough for all visible game state
    if (gameText.length > 2000) gameText = gameText.slice(0, 2000);

    // All visible, enabled buttons with their text
    const buttons = [];
    document.querySelectorAll('button').forEach(btn => {
      if (btn.offsetParent !== null && !btn.disabled && !btn.closest('#agent-panel')) {
        const text = btn.textContent.trim().replace(/\s+/g, ' ');
        if (text) buttons.push(text);
      }
    });

    return {
      gameScreen: gameText,   // full visible text of the game
      buttons,                // all clickable buttons (by their label)
    };
  }

  // --- Status display ---
  function updateStatus() {
    const phase = getPhase();
    const el = document.getElementById('agent-status');
    let html = `<span class="phase">${phaseName(phase)}</span>`;
    if (phase === 1) {
      html += ` · Clips: <span class="val">${fmt(g('clips'))}</span>`;
      html += ` · $<span class="val">${fmt(g('funds'))}</span>`;
      html += ` · Wire: <span class="val">${fmt(g('wire'))}</span>`;
      html += ` · Demand: <span class="val">${fmt(g('demand'))}%</span>`;
      html += `<br>Clippers: <span class="val">${fmt(g('clipmakerLevel2'))}</span>`;
      html += ` · Rate: <span class="val">${fmt(g('clipmakerRate'))}/s</span>`;
      html += ` · Price: $<span class="val">${fmt(g('margin'))}</span>`;
    } else if (phase === 2) {
      html += ` · Clips: <span class="val">${fmt(g('clips'))}</span>`;
      html += ` · Ops: <span class="val">${fmt(typeof operations !== 'undefined' ? operations : 0)}</span>`;
      html += ` · Creat: <span class="val">${fmt(typeof creativity !== 'undefined' ? creativity : 0)}</span>`;
      html += `<br>Proc: <span class="val">${fmt(g('processors'))}</span>`;
      html += ` · Mem: <span class="val">${fmt(g('memory'))}</span>`;
      html += ` · Trust: <span class="val">${fmt(g('trust'))}</span>`;
    } else {
      html += ` · Probes: <span class="val">${fmt(g('probeCount'))}</span>`;
      html += ` · Matter: <span class="val">${fmt(g('acquiredMatter'))}</span>`;
      html += `<br>Factories: <span class="val">${fmt(g('factoryLevel'))}</span>`;
      html += ` · Harvesters: <span class="val">${fmt(g('harvesterLevel'))}</span>`;
    }
    if (window.agentPause) html += `<br><span style="color:#ff7e7e">⏸ PAUSED</span>`;
    if (llmInFlight) html += ` <span style="color:#ffcf7e">⚡ thinking...</span>`;
    el.innerHTML = html;
  }

  // --- Fallback strategy (when /decide fails) ---
  function fallbackAction(logError) {
    const _wire = g('wire', typeof wire !== 'undefined' ? wire : 0);
    const _funds = g('funds', typeof funds !== 'undefined' ? funds : 0);
    const _wireCost = g('wireCost', typeof wireCost !== 'undefined' ? wireCost : 20);
    if (_wire < 100 && _funds >= _wireCost) {
      ACTIONS.buyWire();
      // Only log fallback actions every 10 ticks to reduce noise
      if (logError) addLog('buyWire', '(fallback)', 'act');
    } else {
      if (logError) addLog('wait', '(fallback)', 'wait');
    }
  }

  // --- Execute actions from LLM response ---
  function executeActions(response) {
    const { actions, thought } = response;

    // Show thought
    const thoughtEl = document.getElementById('agent-thought');
    if (thought) {
      thoughtEl.textContent = thought;
      thoughtEl.style.display = 'block';
    }

    if (!actions || actions.length === 0) {
      addLog('wait', 'LLM returned no actions', 'wait');
      return;
    }

    // Track ops budget — don't let projects overdraft ops
    let opsRemaining = typeof operations !== 'undefined' ? operations : 0;

    for (const item of actions) {
      const { action, reason } = item;

      // Project op budget enforcement — find project cost from DOM and skip if can't afford
      if (action !== 'wait' && action !== 'clickClip') {
        const resolved = ACTION_ALIASES[action] || action;
        // Check if this matches a project button with an ops cost
        const btns = Array.from(document.querySelectorAll('button')).filter(b =>
          b.offsetParent !== null && !b.disabled && !b.closest('#agent-panel'));
        const matchedBtn = btns.find(b => b.textContent.trim().toLowerCase().includes(resolved.toLowerCase()));
        if (matchedBtn) {
          const costMatch = matchedBtn.textContent.match(/\(([0-9,]+)\s*ops\)/);
          if (costMatch) {
            const opCost = parseInt(costMatch[1].replace(/,/g, ''));
            if (opCost > opsRemaining) {
              addLog('skip ' + (action.length > 20 ? action.slice(0,20)+'…' : action),
                `not enough ops (need ${opCost}, have ${Math.round(opsRemaining)})`, 'error');
              continue;
            }
            opsRemaining -= opCost;
          }
        }
      }

      const ok = executeAction(action);
      const cls = action === 'wait' ? 'wait' : (ok ? 'act' : 'error');
      const label = action.length > 25 ? action.slice(0, 25) + '…' : action;
      addLog(label, reason || '', cls);
    }
  }

  // --- Main LLM decision loop ---
  async function tick() {
    tickCount++;
    updateStatus();

    if (window.agentPause) {
      if (tickCount % 5 === 0) {
        addLog('Paused', 'watching silently...', 'wait');
      }
      setTimeout(tick, TICK_INTERVAL); // keep the loop alive while paused
      return;
    }

    if (llmInFlight) return; // Don't stack requests

    try {
      const state = collectState();
      setLlmIndicator(true);

      // GET with base64 state (POST may be blocked depending on your deployment)
      // Trim state to avoid 431 (URL too long) — gameScreen already capped at 2000 chars
      const json = JSON.stringify(state);
      const bytes = new TextEncoder().encode(json);
      const b64 = btoa(String.fromCharCode(...bytes));
      const resp = await fetch('./decide?s=' + encodeURIComponent(b64));

      setLlmIndicator(false);

      if (!resp.ok) {
        throw new Error(`/decide returned ${resp.status}`);
      }

      const result = await resp.json();
      result.actions = (result.actions || []).slice(0, 10);

      executeActions(result);

      // LLM can request a longer sleep by returning sleepMs (e.g. when saving up)
      const delay = Math.min(Math.max(result.sleepMs || TICK_INTERVAL, 1000), 30000);
      if (delay !== TICK_INTERVAL) {
        addLog('💤 sleep', `${(delay/1000).toFixed(0)}s (${result.sleepReason || 'LLM requested'})`, 'wait');
      }
      setTimeout(tick, delay);
    } catch (e) {
      setLlmIndicator(false);
      const shouldLog = tickCount % 10 === 1;
      if (shouldLog) addLog('⚠ Error', e.message, 'error');
      fallbackAction(shouldLog);
      setTimeout(tick, TICK_INTERVAL);
    }
  }

  // --- Boot ---
  console.log('[AI Agent] Online — server-side LLM mode.');
  addLog('Boot', 'LLM brain online. Time to make paperclips.');
  tick(); // self-scheduling via setTimeout
})();
