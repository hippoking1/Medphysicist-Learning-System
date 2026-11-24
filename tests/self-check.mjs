/**
 * 醫學物理師考照自學系統 v4.0 - 零相依自動化自檢腳本 (tests/self-check.mjs)
 * 執行方式：node tests/self-check.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function loadClassicScripts(files, extraGlobals = {}) {
  const storage = new Map();
  const sess = new Map();
  const mkStore = (m) => ({
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  });

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    URL,
    Set,
    Map,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    Promise,
    crypto: globalThis.crypto,
    localStorage: mkStore(storage),
    sessionStorage: mkStore(sess),
    window: {},
    ...extraGlobals
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);

  for (const f of files) {
    const code = read(f);
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

console.log('=== 醫學物理師考照自學系統 v4.0 自檢套件 ===');

const ctx = loadClassicScripts(['js/syllabus-data.js', 'js/diagrams.js', 'js/db.js']);
const { SafeHTML, Diagrams, DB } = vm.runInContext('({ SafeHTML, Diagrams, DB })', ctx);

// 1. SafeHTML XSS 防護與 URL 白名單測試
test('SafeHTML 阻擋 <script>、onerror、javascript: 與 <foreignObject>', () => {
  const dirty = `
    <h3>TG-51 講義</h3>
    <script>window.pwn=1</script>
    <img src="x" onerror="alert(1)">
    <div onclick="steal()">安全段落</div>
    <svg><foreignObject><script>alert(2)</script></foreignObject><path d="M0 0 L10 10" stroke="currentColor"/></svg>
    <a href="javascript:alert(3)">危險連結</a>
  `;
  const clean = SafeHTML.sanitizeHtml(dirty);
  assert.ok(!/<script/i.test(clean), '不可殘留 script 標籤');
  assert.ok(!/onerror\s*=/i.test(clean), '不可殘留 onerror 屬性');
  assert.ok(!/onclick\s*=/i.test(clean), '不可殘留 onclick 屬性');
  assert.ok(!/foreignObject/i.test(clean), '不可殘留 foreignObject');
  assert.ok(!/javascript:/i.test(clean), '不可殘留 javascript: 協議');
  assert.ok(clean.includes('TG-51 講義'), '應保留正常標題文字');
});

test('SafeHTML.safeUrl 僅放行 https / mailto / localhost', () => {
  assert.equal(SafeHTML.safeUrl('https://notebooklm.google.com/notebook/abc'), 'https://notebooklm.google.com/notebook/abc');
  assert.equal(SafeHTML.safeUrl('javascript:alert(1)'), '');
  assert.equal(SafeHTML.safeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(SafeHTML.safeUrl('http://evil.example.com'), '');
  assert.equal(SafeHTML.safeUrl('#section-1', true), '#section-1');
});

// 2. Diagrams.formatStudyGuide Markdown + LaTeX + XSS 混合測試
test('Diagrams.formatStudyGuide 跳脫 Markdown 內嵌 XSS 並正確保留公式、表格與物理實驗室', () => {
  const md = [
    '### 1. TG-51 核心公式',
    '吸收劑量公式為 $$D_{w,Q} = M \\cdot N_{D,w}^{Q_0} \\cdot k_Q$$，且 `r_cav < 0.5 cm`。',
    '惡意測試：<img src=x onerror=alert(1)>',
    '',
    '| 協定 | 參考溫度 | 參考氣壓 |',
    '| --- | --- | --- |',
    '| TG-51 | 22 °C | 101.33 kPa |',
    '',
    '[[DIAGRAM:tg51_setup]]'
  ].join('\n');

  const html = Diagrams.formatStudyGuide(md, 'U2.1.2');
  assert.ok(html.includes('<h3>1. TG-51 核心公式</h3>'));
  assert.ok(html.includes('$$D_{w,Q} = M \\cdot N_{D,w}^{Q_0} \\cdot k_Q$$'));
  assert.ok(html.includes('<table><thead><tr><th>協定</th>'));
  assert.ok(html.includes('data-lab-type="tg51_setup"'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'Markdown 行內惡意 img 標籤必須被實體跳脫');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('INTERACTIVE LAB'), '不應殘留全大寫英文標籤');
});

// 3. SM-2 間隔重複與 DB 零金鑰防線測試
test('DB.computeSM2Next 符合 SuperMemo-2 排程與 easeFactor >= 1.3 下限', () => {
  const r1 = DB.computeSM2Next({ repetitions: 0, interval: 1, easeFactor: 2.5 }, 5);
  assert.equal(r1.repetitions, 1);
  assert.equal(r1.interval, 1);
  assert.equal(r1.easeFactor, 2.6);

  const r2 = DB.computeSM2Next({ repetitions: 1, interval: 1, easeFactor: 2.5 }, 4);
  assert.equal(r2.repetitions, 2);
  assert.equal(r2.interval, 6);

  const fail = DB.computeSM2Next({ repetitions: 4, interval: 20, easeFactor: 1.35 }, 0);
  assert.equal(fail.repetitions, 0);
  assert.equal(fail.interval, 1);
  assert.equal(fail.easeFactor, 1.3);
});

test('DB._stripSecrets 徹底剔除 geminiApiKey', () => {
  const cleaned = DB._stripSecrets({ examDate: '2027-10-01', geminiApiKey: 'AIzaSyTESTKEY' });
  assert.equal('geminiApiKey' in cleaned, false);
  assert.equal(cleaned.examDate, '2027-10-01');
});

// 4. 靜態原始碼資安與現代化斷言
test('靜態原始碼零硬編碼試算表 ID、零 URL ?key= 傳遞、且已刪除 gas-project/', () => {
  const dbSrc = read('js/db.js');
  const htmlSrc = read('index.html');
  const geminiSrc = read('js/gemini.js');
  const cssSrc = read('css/style.css');
  const rulesSrc = read('firestore.rules');

  assert.ok(!dbSrc.includes('1-ATEDk8TtYZRA0gdOFfgzp5ZIYpYWzSRHvcE5eaYcnQ'), 'db.js 不可硬編碼個人 Google Sheet ID');
  assert.ok(!htmlSrc.includes('1-ATEDk8TtYZRA0gdOFfgzp5ZIYpYWzSRHvcE5eaYcnQ'), 'index.html 不可硬編碼個人 Google Sheet ID');
  assert.ok(!geminiSrc.includes('key=${encodeURIComponent(apiKey)}'), 'gemini.js 必須改用 x-goog-api-key Header');
  assert.ok(geminiSrc.includes("'x-goog-api-key': apiKey"), 'gemini.js 應設定 x-goog-api-key Header');
  assert.ok(htmlSrc.includes('<meta name="color-scheme"'), 'index.html 必須宣告 color-scheme meta');
  assert.ok(htmlSrc.includes('popover="manual"'), 'Toast 必須使用 popover="manual" Top Layer');
  assert.ok(htmlSrc.includes('closedby="any"'), '檢視型 dialog 必須宣告 closedby="any"');
  assert.ok(!cssSrc.includes('@import url('), 'style.css 不可使用阻塞式 @import');
  assert.ok(cssSrc.includes('scrollbar-color:'), 'style.css 必須宣告標準 scrollbar-color');
  assert.ok(rulesSrc.includes('isAllowedCollection'), 'firestore.rules 必須限制集合白名單');
  assert.equal(fs.existsSync(path.join(root, 'gas-project')), false, 'gas-project/ 舊版目錄應已移除');
});

console.log(`\n全部 ${passed} 項自檢測試通過！`);
