// Comprehensive Playwright test for paperclips game + agent
// Usage: node test.js
const { chromium } = require('playwright');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let failures = 0;
function assert(condition, msg) {
  if (!condition) {
    console.log(`  ❌ ${msg}`);
    failures++;
  } else {
    console.log(`  ✅ ${msg}`);
  }
}

async function main() {
  console.log('🧪 Starting Paperclips comprehensive test...\n');

  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage();

  // Capture console errors (ignore favicon 404s)
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('404')) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

  // --- Test 1: Game loads ---
  console.log('📄 Test 1: Game loads');
  const PORT = process.env.PORT || 3000;
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  const title = await page.textContent('h2').catch(() => null);
  console.log(`  Game title: ${title}`);
  assert(title && title.includes('Paperclips'), 'Game loaded with Paperclips title');

  // --- Test 2: Overlay present and visible ---
  console.log('\n🎛 Test 2: Agent overlay');
  const overlay = await page.$('#agent-panel');
  assert(!!overlay, 'Overlay present in DOM');
  const visible = await overlay?.isVisible();
  assert(visible, 'Overlay is visible');

  // Check titlebar content
  const titlebar = await page.textContent('#agent-titlebar');
  console.log(`  Titlebar: ${titlebar?.trim().slice(0, 60)}`);
  assert(titlebar && titlebar.includes('AI Agent'), 'Titlebar shows agent name');

  // Verify no API key button
  const keyBtn = await page.$('#agent-key-btn');
  assert(!keyBtn, 'No API key button (server-side auth)');

  // --- Test 3: /decide endpoint via GET ---
  console.log('\n🔌 Test 3: /decide endpoint (GET with base64 state)');
  const decideResult = await page.evaluate(async () => {
    const testState = {
      gameScreen: 'Paperclips: 0\nMake Paperclip\nBusiness\nAvailable Funds: $ 0.00\nUnsold Inventory: 0\nPrice per Clip: $ .25\nPublic Demand: 32%\nMarketing Level: 1',
      buttons: ['Make Paperclip', 'lower', 'raise'],
    };
    try {
      const b64 = btoa(JSON.stringify(testState));
      const r = await fetch('./decide?s=' + b64);
      const data = await r.json();
      return { status: r.status, data };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (decideResult.error) {
    console.log(`  ❌ Fetch error: ${decideResult.error}`);
    failures++;
  } else {
    assert(decideResult.status === 200, `/decide returned 200 (got ${decideResult.status})`);
    assert(Array.isArray(decideResult.data?.actions), 'Response has actions array');
    assert(typeof decideResult.data?.thought === 'string', 'Response has thought string');
    console.log(`  Actions: ${decideResult.data?.actions?.map(a => a.action).join(', ')}`);
    console.log(`  Thought: ${decideResult.data?.thought?.slice(0, 100)}`);
  }

  // --- Test 4: Agent runs and produces log entries ---
  console.log('\n⏳ Test 4: Agent ticks (waiting 8s)...');
  await sleep(8000);

  const logEntries = await page.$$('#agent-log .entry');
  const entryCount = logEntries.length;
  console.log(`  Agent log entries: ${entryCount}`);
  assert(entryCount > 0, 'Agent log has entries');

  // Check for at least one non-fallback entry
  const logTexts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#agent-log .entry'))
      .map(e => e.textContent);
  });

  const hasNonFallback = logTexts.some(t =>
    !t.includes('fallback') && !t.includes('No API key') && !t.includes('Boot') && !t.includes('wait')
  );
  assert(hasNonFallback, 'At least one non-fallback log entry');

  if (logTexts.length > 0) {
    console.log(`  Latest: ${logTexts[0]?.trim().slice(0, 80)}`);
  }

  // --- Test 5: Overlay shows phase and clips ---
  console.log('\n📊 Test 5: Overlay status display');
  const statusHtml = await page.evaluate(() =>
    document.getElementById('agent-status')?.innerHTML || ''
  );
  assert(statusHtml.includes('Phase'), 'Status shows current phase');
  assert(statusHtml.includes('Clips'), 'Status shows clips count');

  // --- Test 6: No critical JS errors ---
  console.log('\n🐛 Test 6: JS errors');
  const criticalErrors = errors.filter(e => !e.includes('favicon'));
  if (criticalErrors.length > 0) {
    console.log('  JS errors detected:');
    criticalErrors.forEach(e => console.log('    -', e.slice(0, 120)));
  }
  assert(criticalErrors.length === 0, 'No critical JS errors');

  // --- Screenshot ---
  await page.screenshot({ path: '/tmp/paperclips-test.png', fullPage: true });
  console.log('\n📸 Screenshot saved to /tmp/paperclips-test.png');

  await browser.close();

  // --- Summary ---
  console.log(`\n${'='.repeat(40)}`);
  if (failures === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log(`❌ ${failures} test(s) failed`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌ Test crashed:', e.message);
  process.exit(1);
});
