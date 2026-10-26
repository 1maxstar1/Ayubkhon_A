/*
 * Reference prices in a real browser. Synthetic package and smeta only (test/refs-fixture.cjs).
 *
 * The admin part: an administrator checks and uploads a package on admin.html with crypto.subtle REMOVED (as on a
 * plain-HTTP office network or a server reached by its IP, where it does not exist), the stored hash is the file's,
 * the same file again is recognised, a broken package is refused with a row and a field, a second package is made
 * active from the table, and the documents of a package are listed.
 *
 * The expert part: the package arrives (held back on purpose) while the expert scrolls and has a price field
 * focused — the answers land without moving the list or the focus; the «справ.» tags sit on the rows they should
 * and on no other; the popover shows the tier, the matched record's own name on every line, the document, the
 * difference to the smeta price, and never an internal key or a document id; the two filters; nothing is applied
 * before a click; «Применить» sets the price and the correction records where it came from; a typed price is
 * «typed» and is replaced only after a confirm; the derived pool comes back from IndexedDB after a reload; another
 * as-of date gives the older edition; in a second workspace the hint built from an applied price says «из
 * справочника»; and a repaint never takes the focus from a price field to a tag button of its row.
 *
 *   node test/e2e-refs.mjs
 */
import { chromium } from 'playwright';
import { launchOpts } from './chromium.mjs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, ROOT } from './server.mjs';

const require = createRequire(import.meta.url);
const F = require('./refs-fixture.cjs');

const PORT = 8123;
const pb = await startServer({ port: PORT, build: true, registry: true });
await pb.api('/api/collections/users/records', {
  method: 'POST',
  body: JSON.stringify({ email: 'boss@example.com', password: 'Xx12345678901', passwordConfirm: 'Xx12345678901', name: 'Boss', role: 'admin', active: true, emailVisibility: true })
}, pb.su);

const dir = mkdtempSync(join(tmpdir(), 'e2e-refs-'));
const p1 = F.makePackage(), g1 = F.gzip(p1);
const f1 = join(dir, 'fake-20260101-1.json.gz'); writeFileSync(f1, g1);
const p2 = F.makePackage({ id: 'fake-20260101-2' });
const f2 = join(dir, 'fake-20260101-2.json.gz'); writeFileSync(f2, F.gzip(p2));
const bad = F.makePackage({ id: 'fake-20260101-9' });
bad.rows[3][6] = -1; bad.rows[5][7] = 'вчера';
const f3 = join(dir, 'broken.json.gz'); writeFileSync(f3, F.gzip(bad));
const f4 = join(dir, 'not-a-package.json.gz'); writeFileSync(f4, Buffer.from('просто текст'));

const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
// stands in for a page served over plain HTTP from a LAN address, where crypto.subtle is undefined
await context.addInitScript(() => { try { Object.defineProperty(self.crypto, 'subtle', { get: () => undefined }); } catch (e) { /* ignore */ } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

await page.goto(pb.base + '/admin.html');
await page.fill('#loginEmail', 'boss@example.com');
await page.click('#loginBtn');
await page.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
await page.fill('#loginCode', pb.lastCode('boss@example.com'));
await page.click('#loginBtn');
await page.waitForSelector('#refsPanel');
await page.waitForSelector('#adminMain:not([hidden])');
check(await page.evaluate(() => typeof crypto.subtle === 'undefined'), 'crypto.subtle is absent on this page (plain-HTTP stand-in)');
check(await page.isVisible('#refsPanel'), 'the admin page has the reference-price section');

/* ------------------------------------------------------------- a package */
await page.setInputFiles('#refsFile', f1);
await page.waitForFunction(() => /Пакет fake-20260101-1/.test(document.getElementById('refsStat').textContent) && !document.getElementById('refsReady').hidden);
const stat = await page.textContent('#refsStat');
check(/записей 16 · документов 6 · цены 14\.03\.2025 … 27\.02\.2026/.test(stat), 'the checked package is summarised: records, documents, date range');
await page.click('#refsUpload');
await page.waitForFunction(() => /fake-20260101-1/.test(document.querySelector('#refsTable tbody').textContent));
const stored = (await pb.api('/api/collections/ref_packages/records', {}, pb.su)).items;
const sha1 = createHash('sha256').update(g1).digest('hex');
check(stored.length === 1 && stored[0].sha256 === sha1, 'the stored sha256 (computed in pure JS) is the hash of the file');
check(stored[0].active === true && /активен/.test(await page.textContent('#refsTable tbody')), 'the first package is active');

await page.setInputFiles('#refsFile', f1);
await page.waitForFunction(() => /уже загружен/.test(document.getElementById('refsStat').textContent));
check(await page.isHidden('#refsUpload'), 'the same file again: «уже загружен», nothing to upload');
await page.click('#refsCancel');

/* ------------------------------------------------------------- broken files */
await page.setInputFiles('#refsFile', f3);
await page.waitForFunction(() => !document.getElementById('refsErr').hidden);
const err = await page.textContent('#refsErr');
check(/Пакет не принят: 2 ошибки/.test(err) && /строка 4, поле price/.test(err) && /строка 6, поле price_date/.test(err),
  'a broken package is refused: how many errors, row and field of each');
check(err.indexOf('-1') < 0 && err.indexOf('вчера') < 0, 'and no value of the package is shown');
await page.setInputFiles('#refsFile', f4);
await page.waitForFunction(() => /не файл \.json\.gz|повреждён/.test(document.getElementById('refsErr').textContent));
check(true, 'a file that is not a gzip is refused');

/* ------------------------------------------------------------- a second package, activated from the table */
await page.setInputFiles('#refsFile', f2);
await page.waitForFunction(() => /Пакет fake-20260101-2/.test(document.getElementById('refsStat').textContent) && !document.getElementById('refsReady').hidden);
await page.click('#refsUpload');
await page.waitForFunction(() => /fake-20260101-2/.test(document.querySelector('#refsTable tbody').textContent));
check((await pb.api('/api/collections/ref_packages/records?filter=' + encodeURIComponent("package_id='fake-20260101-2'"), {}, pb.su)).items[0].active === false,
  'a second package waits inactive');
await page.click('#refsTable tr:has-text("fake-20260101-2") button[data-act=activate]');
await page.waitForFunction(() => { const tr = [...document.querySelectorAll('#refsTable tbody tr')].find((t) => /fake-20260101-2/.test(t.textContent)); return tr && /активен/.test(tr.textContent); });
const act = (await pb.api('/api/collections/ref_packages/records?filter=' + encodeURIComponent('active=true'), {}, pb.su)).items;
check(act.length === 1 && act[0].package_id === 'fake-20260101-2', '«Сделать активным» leaves exactly the second package active');
await page.click('#refsTable tr:has-text("fake-20260101-2") button[data-act=docs]');
await page.waitForSelector('#refsDocs:not([hidden])');
const docs = await page.textContent('#refsDocs');
check(/ООО «Тест-Поставщик-1»/.test(docs) && /предложение поставщика/.test(docs) && /Хорезмская область/.test(docs) && docs.indexOf('fake-src-') < 0,
  'the documents of a package: type and region in Russian, never a document id');

check(!errors.length, 'no page errors on the admin page' + (errors.length ? ': ' + errors.join(' | ') : ''));
errors.length = 0;

/* ================================================================== the expert */
const ACTIVE = 'fake-20260101-2';
const P = F.PRICES;
const r2 = (v) => Math.round(v * 100) / 100;
const SEC = 1000;
const rows = pb.rows().slice(0, 3);
await pb.api('/api/registry/import', { method: 'POST', body: JSON.stringify({ rows }) }, pb.su);
const smetaFile = join(dir, 'smeta-test.xlsx');
writeFileSync(smetaFile, F.makeSmeta());
const ectx = await browser.newContext({ viewport: { width: 1400, height: 800 } });
const ep = await ectx.newPage();
ep.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
ep.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const dialogs = [];
ep.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

// the package download is held until the expert is scrolled down with a field focused
let release = null, held = 0;
const gate = new Promise((r) => { release = r; });
await ectx.route(/\/api\/files\/[^/]+\/[^/]+\/[^/?]+\.gz/, async (route) => { held++; await gate; await route.continue(); });

async function openApp(number, region) {
  await ep.waitForSelector('#screen-list:not([hidden])');
  await ep.fill('#appQ', number);
  await ep.waitForFunction((n) => [...document.querySelectorAll('#appTable tbody tr')].some((t) => t.textContent.includes(n)), number);
  await ep.click(`#appTable tbody tr:has-text("${number}") button[data-act=open]`);
  if (region) {
    await ep.waitForSelector('#screen-region:not([hidden])');
    await ep.selectOption('#regionSel', region);
    await ep.click('#regionForm button[type=submit]');
  }
  await ep.waitForSelector('#wsBox:not([hidden])');
}
async function dropSmeta() {
  await ep.setInputFiles('#pick', [smetaFile]);
  await ep.waitForFunction(() => window.app && app.model && app.model.resources.length > 60 && S.Sync.ws.files.length === 1 && !S.Sync.loading,
    null, { timeout: 60 * SEC });
}
async function reopen(number) {
  await ep.waitForFunction(() => window.app && app.model && app.model.resources.length > 60 && !S.Sync.loading, null, { timeout: 60 * SEC })
    .catch(() => null);
}
const refsReady = () => ep.waitForFunction(() => S.Refs.state === 'ready' && !Object.keys(S.Refs.batches).length &&
  /справочных \d+/.test(document.getElementById('priceCount').textContent), null, { timeout: 60 * SEC });
const settle = () => new Promise((r) => setTimeout(r, 600));
const rowSel = (name) => `#priceScroll .vrow:has(.c[title="${name}"])`;
/** Only that row on screen (the list renders the rows in view). */
async function only(name) {
  await ep.fill('#q', name);
  await ep.waitForFunction((t) => { const r = document.querySelectorAll('#priceScroll .vrow'); return r.length === 1 && r[0].querySelector('.c[title="' + t + '"]'); }, name);
}
/** …and its «справ.» tag. */
async function tagOf(name) {
  await only(name);
  await ep.waitForSelector(rowSel(name) + ' .tagr');
  return rowSel(name) + ' .tagr';
}
async function popover(name) {
  await ep.click(await tagOf(name));
  await ep.waitForSelector('#refPop:not([hidden])');
  return ep.evaluate(() => {
    const pop = document.getElementById('refPop');
    return {
      text: pop.textContent,
      lines: [...pop.querySelectorAll('.rp-line')].map((l) => ({
        badge: l.querySelector('.rp-badge').textContent, name: l.querySelector('.rp-name').textContent,
        near: l.classList.contains('near'), text: l.textContent
      }))
    };
  });
}
const closePop = () => ep.evaluate(() => S.Refs.hide());
const internal = (t) => t.indexOf('|') >= 0 || /\b[0-9a-f]{12}\b/.test(t) || /fake-src-/.test(t) || /\b(xorazm|toshkent_sh|national)\b/.test(t);

await ep.goto(pb.base + '/');
await ep.fill('#loginEmail', 'test@example.com');
await ep.click('#loginBtn');
await ep.waitForSelector('#codeBox:not([hidden])');
await new Promise((r) => setTimeout(r, 700));
await ep.fill('#loginCode', pb.lastCode('test@example.com'));
await ep.click('#loginBtn');
await openApp(rows[0].number, 'xorazm');
await dropSmeta();
const wsA = await ep.evaluate(() => S.Sync.ws.id);
await ep.waitForFunction(() => S.Refs.state === 'loading', null, { timeout: 20 * SEC });
for (let i = 0; i < 80 && !held; i++) await new Promise((r) => setTimeout(r, 250));
check(held >= 1 && await ep.evaluate(() => S.Refs.state === 'loading' && !document.querySelector('#priceScroll .tagr')),
  'the package download is under way (held by the test); no tags yet');
check(/справочник: подготовка/.test(await ep.textContent('#priceCount')), 'the status line says the reference prices are being prepared');

/* ------------------------------------------------------------- answers arrive: the list does not move */
await ep.evaluate(() => { document.getElementById('priceScroll').scrollTop = 900; });
await settle();
const before = await ep.evaluate(() => {
  const sc = document.getElementById('priceScroll');
  const top = sc.getBoundingClientRect().top;
  const inp = [...sc.querySelectorAll('.pin')].find((x) => x.getBoundingClientRect().top > top + 60);
  inp.focus();
  return { scroll: sc.scrollTop, key: inp.dataset.key };
});
release();
await refsReady();
await settle();
const after = await ep.evaluate(() => ({ scroll: document.getElementById('priceScroll').scrollTop,
  key: document.activeElement && document.activeElement.classList.contains('pin') ? document.activeElement.dataset.key : null }));
check(before.scroll > 0 && after.scroll === before.scroll, `the answers do not move the list (scrollTop ${before.scroll} → ${after.scroll})`);
check(after.key === before.key, 'the focused price field keeps its focus');
await ep.evaluate(() => document.activeElement && document.activeElement.blur());
check(await ep.evaluate(() => Object.keys(app.prices).length === 0 && app.model.resources.every((r) => S.near(r.market, r.price))),
  'nothing is applied by itself: every market price is still the smeta price');

/* ------------------------------------------------------------- tags and filters */
const NAMES = F.SMETA.labor.concat(F.SMETA.machines, F.SMETA.materials).map((x) => x[0]);
const MATCHED = NAMES.filter((n) => !/Краска/.test(n));
const tagged = await ep.evaluate(() => app.model.resources.filter((r) => S.Refs.hasRow(r)).map((r) => r.name).sort());
check(JSON.stringify(tagged) === JSON.stringify(MATCHED.slice().sort()),
  `reference lines for exactly the resources the package has (${tagged.length} of ${MATCHED.length}), none for the paint or the filler rows`);
await ep.selectOption('#filter', 'ref');
await ep.waitForFunction((n) => document.querySelectorAll('#priceScroll .vrow').length === n, MATCHED.length);
check(await ep.evaluate(() => [...document.querySelectorAll('#priceScroll .vrow')].every((r) => r.querySelector('.tagr'))),
  'filter «Со справочными ценами»: those rows, each with its «справ.» tag');
check(/справочных 9 · похожих справ\. 1/.test(await ep.textContent('#priceCount')), 'the status line counts them');
await ep.selectOption('#filter', 'nearref');
await ep.waitForFunction(() => document.querySelectorAll('#priceScroll .vrow').length === 1);
check(/ВВГнг/.test(await ep.textContent('#priceScroll')) && await ep.isVisible('#priceScroll .tagr.near'),
  'filter «Только похожие справочные»: the one row whose top line is another resource, dashed tag');
await ep.selectOption('#filter', 'ref');
await ep.waitForFunction((n) => document.querySelectorAll('#priceScroll .vrow').length === n, MATCHED.length);

/* ------------------------------------------------------------- the popover */
const cab = await popover('Кабель ВВГ 3х2,5');
check(cab.lines.length >= 1 && cab.lines.length <= 6 && cab.lines.every((l) => l.name.trim().length > 0),
  'cable: ≤ 6 lines, the matched record\'s name on every line');
check(cab.lines[0].badge === 'Документ' && /Медиана 2 документов/.test(cab.lines[0].text), 'its top line: «Документ», the median of two documents');
check(/Хорезмская область · на 29\.08\.2026/.test(cab.text), 'header: the workspace region and the as-of date (the application\'s registration date)');
check(/к сметной цене: [+−]\d/.test(cab.text), 'the difference to this line\'s smeta price');
await ep.click('#refPop button[data-fold]');
const comps = await ep.textContent('#refPop .rp-comps');
check(/ООО «Тест-Поставщик-1» № ТЕСТ-5/.test(comps) && /г\. Ташкент/.test(comps) && /Кабель ВВГ 3х2,5/.test(comps),
  'the median unfolds into its documents: issuer, document number, region, name');
check(!internal(cab.text) && !internal(comps), 'no family key, document id or Latin region key in the popover');
await closePop();
const conc = await popover('Бетон тяжёлый В15');
check(/документы расходятся/.test(conc.lines[0].text) && /3 строки/.test(conc.lines[0].text), 'concrete: documents that disagree, flagged with their range');
await closePop();
const sim = await popover('Кабель ВВГнг(А)-LS 3х2,5');
check(sim.lines[0].badge === 'Похожий' && sim.lines[0].near && sim.lines[0].name === 'Кабель ВВГ 3х2,5' &&
  /Похожие ресурсы/.test(sim.text) && /близкие характеристики/.test(sim.lines[0].text) && !internal(sim.text),
  '«Похожий»: under «Похожие ресурсы», naming the other resource and what differs');
await closePop();
const lab = await popover('Затраты труда рабочих-строителей');
check(lab.lines[0].badge === 'Ставка по таблице' && /таблица ставок · Хорезмская область/.test(lab.lines[0].text) && !internal(lab.text),
  'labour: «Ставка по таблице», the table, the region in Russian');
await closePop();
const anc = await popover('Анкер М8');
check(anc.lines.length === 1 && anc.lines.every((l) => /М8/.test(l.name) && !/М5/.test(l.text)), 'Анкер М8: no М5 line');

/* ------------------------------------------------------------- «Применить» */
check(await ep.evaluate(() => Object.keys(app.prices).length === 0), 'still nothing applied after looking');
await ep.click('#refPop button[data-i="0"]');
await ep.waitForFunction(() => document.getElementById('refPop').hidden);
await ep.click(await tagOf('Кабель ВВГ 3х2,5'));
await ep.waitForSelector('#refPop:not([hidden])');
await ep.click('#refPop button[data-i="0"]');
await ep.fill('#q', '');
const corr = async (name) => (await pb.api('/api/collections/corrections/records?filter=' +
  encodeURIComponent(`workspace='${wsA}' && name='${name}'`), {}, pb.su)).items[0];
const waitCorr = async (name, ok) => {
  for (let i = 0; i < 60; i++) { const c = await corr(name); if (c && ok(c)) return c; await new Promise((r) => setTimeout(r, 250)); }
  return corr(name);
};
const cAnc = await waitCorr('Анкер М8', (c) => c.source);
check(cAnc && cAnc.market_price === r2(P.d) && cAnc.source === `ref:${ACTIVE}:10` && cAnc.source_price === r2(P.d),
  '«Применить»: the price is set and its correction says ref:<package>:<record>, with the price it gave');
const cCab = await waitCorr('Кабель ВВГ 3х2,5', (c) => c.source);
check(cCab && /^ref:fake-20260101-2:median:(2,3|3,2)$/.test(cCab.source) && cCab.source_price === cCab.market_price &&
  cCab.market_price === r2((P.a + P.g) / 2), 'a median: ref:<package>:median:<records>');
check(await ep.evaluate(() => app.model.resources.filter((r) => !S.near(r.market, r.price)).length === 2), 'and no other price changed');

/* ------------------------------------------------------------- a typed price */
await ep.selectOption('#filter', 'all');
await only('Экскаватор одноковшовый 0,65 м3');
await ep.click('#priceScroll .pin');
await ep.keyboard.type(String(P.typed).replace('.', ','));
await ep.keyboard.press('Tab');
const cTyped = await waitCorr('Экскаватор одноковшовый 0,65 м3', (c) => c.market_price === P.typed);
check(cTyped && cTyped.source === 'typed' && !cTyped.source_price, 'a typed price goes out as «typed»');
await ep.fill('#q', '');

/* ------------------------------------------------------------- reload: prices stay, the pool comes from IndexedDB */
await ep.evaluate(() => S.Sync.saveNow());
await ep.reload();
await openApp(rows[0].number);
await reopen();
await refsReady();
const kept = await ep.evaluate(() => {
  const by = {};
  app.model.resources.filter((r) => !S.near(r.market, r.price)).forEach((r) => { by[r.name] = r.market; });
  return { by, cached: S.Refs.cached };
});
check(Object.keys(kept.by).length === 3 && kept.by['Анкер М8'] === r2(P.d) && kept.by['Экскаватор одноковшовый 0,65 м3'] === P.typed,
  'after a reload the applied and the typed prices stay, nothing else changed');
check(kept.cached === true, 'the derived pool comes back from the IndexedDB cache');
const exc = await popover('Экскаватор одноковшовый 0,65 м3');
check(/Ваша цена: 44 444,44/.test(exc.text), 'the popover shows the expert\'s own price');
await ep.click('#refPop button[data-i="0"]');
await settle();
check(dialogs.length === 1 && /^Заменить вашу цену 44 444,44 на /.test(dialogs[0]), '«Применить» over a typed price asks first');
check(await ep.evaluate((t) => app.model.resources.some((r) => /Экскаватор/.test(r.name) && r.market === t), P.typed),
  'declined: the typed price stays');
await closePop();

/* ------------------------------------------------------------- another as-of date */
await ep.click(await tagOf('Кабель ВВГ 3х2,5'));
await ep.waitForSelector('#refPop:not([hidden])');
await ep.click('#refPop [data-asof]');
await ep.$eval('#refPop .rp-asof input', (el) => { el.value = '2026-01-31'; el.dispatchEvent(new Event('change', { bubbles: true })); });
await ep.waitForFunction(() => {
  const r = app.model.resources.find((x) => x.name === 'Кабель ВВГ 3х2,5');
  const l = S.Refs.lines(r)[0];
  return l && (l.rids || [l.rid]).indexOf(1) >= 0;
}, null, { timeout: 30 * SEC });
check(await ep.evaluate(() => { const l = S.Refs.lines(app.model.resources.find((x) => x.name === 'Кабель ВВГ 3х2,5'))[0]; return l.rids.indexOf(2) < 0; }),
  'an as-of date before the newest edition: the top line is the older edition');
await ep.waitForSelector('#refPop:not([hidden])');
check(/на 31\.01\.2026/.test(await ep.textContent('#refPop .rp-head')), 'the popover comes back with the new date');
check(await ep.evaluate(() => S.Sync.state().refs && S.Sync.state().refs.asof === '2026-01-31'), 'the date is kept in the workspace state');
check(await ep.evaluate(() => Object.keys(app.prices).length === 3), 'changing the date applies nothing');
await closePop();
await ep.evaluate(() => S.Sync.saveNow());
await ep.click('#wsList');

/* ------------------------------------------------------------- a second workspace: the hint knows where the price came from */
await openApp(rows[1].number, 'xorazm');
await dropSmeta();
await ep.waitForFunction(() => S.Hints && Object.keys(S.Hints.map).length >= 3, null, { timeout: 30 * SEC });
await refsReady();
await only('Анкер М8');
await ep.waitForSelector('#priceScroll .tagh');
await ep.click('#priceScroll .tagh');
await ep.waitForSelector('#hintPop:not([hidden])');
check(/из справочника/.test(await ep.textContent('#hintPop')), 'a hint built from an applied reference price says «из справочника»');
await ep.evaluate(() => S.Hints.hide());
await only('Экскаватор одноковшовый 0,65 м3');
await ep.waitForSelector('#priceScroll .tagh');
await ep.click('#priceScroll .tagh');
await ep.waitForSelector('#hintPop:not([hidden])');
const hx = await ep.textContent('#hintPop');
check(!/из справочника/.test(hx), 'a typed price\'s hint does not' + (/из справочника/.test(hx) ? ': ' + hx : ''));
await ep.evaluate(() => S.Hints.hide());
await only('Анкер М8');
const kept2 = await ep.evaluate(() => {
  const inp = document.querySelector('#priceScroll .pin');
  inp.focus();
  app.prices_ui.list.refresh();
  const a = document.activeElement;
  return { tag: a.tagName, pin: a.classList.contains('pin'), both: !!document.querySelector('#priceScroll .tagh') && !!document.querySelector('#priceScroll .tagr') };
});
check(kept2.both && kept2.pin, 'a repaint keeps the focus in the price field of a row that has a hint tag and a «справ.» tag');
await ep.evaluate(() => document.activeElement && document.activeElement.blur());

/* ------------------------------------------------------------- sign-out: the derived pool leaves the browser */
check(await ep.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'smeta-refs')), 'the derived pool is kept in IndexedDB while signed in');
await ep.click('#signOut');
await ep.waitForFunction(async () => !(await indexedDB.databases()).some((d) => d.name === 'smeta-refs'), null, { timeout: 15 * SEC })
  .then(() => check(true, 'signing out deletes it'), () => check(false, 'signing out deletes it'));

/* ------------------------------------------------------------- builds */
const single = readFileSync(join(ROOT, 'dist/smeta-taqqoslash.html'), 'utf8');
check(single.indexOf('S.refs') < 0 && single.indexOf('__REFS_WORKER') < 0 && single.indexOf('Справочные цены') < 0,
  'the single-file page carries no reference-price code');
check(!errors.length, 'no page errors on the expert page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
pb.stop();
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAILED (${fail})` : 'e2e-refs OK');
process.exit(fail ? 1 : 0);

