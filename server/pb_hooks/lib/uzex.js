// UZEX weekly quotes (uzex.uz/WeeklyQuotes, the Russian version): reading the page and keeping what it says.
// Shared by the handlers in uzex.pb.js (loaded with require(), because each handler runs in its own VM).
//
// The exchange publishes no API for this table: one GET returns one week as server-rendered HTML. The site keeps about
// four weeks, so every week seen is stored — in collections of its own (uzex_imports, uzex_quotes, uzex_settings),
// never beside the reference packages. Nothing here reads or writes ref_packages.
//
// A week is written whole or not at all: the page must be the Russian one (its seven column titles, exactly), must be
// the week that was asked for (an unknown importId silently answers with the newest week), and every row must read as
// seven cells with a number and two dates. Anything else is reported and the stored data stays as it was.
//
// The first half of this file is plain text work and runs in node as well (test/uzex.cjs).

const HEADER = ["№", "Наименование товара", "Текущая цена", "Изменение цены", "Изменение, %", "Дата начала", "Дата окончания"];
const PAGE = "/WeeklyQuotes";
const LANG = "culture=ru&ui-culture=ru";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// What a trailing «(…)» of a name may mean. Anything else — a steel grade, a class — is part of the name.
const UNITS = {
  "литр": "л", "декалитр": "дал", "штука": "шт", "метр": "м", "погонный метр": "м", "кв.м": "м2",
  "куб.метр": "м3", "куб.м": "м3", "грамм": "г", "кг": "кг", "тонна": "т"
};
const PACKING = { "в мешках": true, "навал": true };
const DEAL = { "форвард": true, "фьючерс": true };          // not a spot price
const CURRENCY = { "доллар сша": "USD", "рубль": "RUB", "евро": "EUR", "юань": "CNY" };

const NAMED = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00A0", laquo: "«", raquo: "»", ndash: "–", mdash: "—" };

/** Text of a cell: tags out, entities decoded, white space (the no-break kinds too) to single spaces. */
function text(html) {
  return String(html == null ? "" : html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g, function (all, e) {
      if (e.charAt(0) === "#") {
        const code = e.charAt(1) === "x" || e.charAt(1) === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
      }
      return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : all;
    })
    .replace(/[\s\u00A0\u2007\u202F]+/g, " ")
    .trim();
}

/** «8 428 070,18», «-160 418,92», «5,02%» → a number; NaN for anything that does not read as one. */
function num(s) {
  const t = String(s == null ? "" : s).replace(/[\s\u00A0\u2007\u202F]/g, "").replace(/%$/, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** «06.11.2026» → «2026-11-06»; '' when it is not a calendar date. */
function isoDate(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s == null ? "" : s).trim());
  if (!m) return "";
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCFullYear() === +m[3] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[1] ? m[3] + "-" + m[2] + "-" + m[1] : "";
}

/**
 * A quote's name, with what its trailing brackets say taken out of it: «Нефть (доллар США) (импорт) (Форвард)» is the
 * item «Нефть», imported, a forward contract, priced in dollars. A name without a unit is quoted per tonne — the
 * exchange's default — and says so (unit_assumed).
 *
 * @param {string} raw     the name as printed
 * @param {string} market  'internal' | 'export': export quotes are in foreign currency whether or not a row names one
 */
function parseName(raw, market) {
  const out = { item: "", unit: "", unit_assumed: false, packing: "", is_forward: false, is_import: false, currency: "" };
  let s = String(raw == null ? "" : raw).trim();
  for (;;) {
    const m = /^(.*\S)\s*\(([^()]*)\)$/.exec(s);
    if (!m) break;
    const k = m[2].trim().toLowerCase().replace(/\s+/g, " ");
    if (Object.prototype.hasOwnProperty.call(UNITS, k) && !out.unit) out.unit = UNITS[k];
    else if (PACKING[k] && !out.packing) out.packing = k;
    else if (DEAL[k]) out.is_forward = true;
    else if (k === "импорт") out.is_import = true;
    else if (Object.prototype.hasOwnProperty.call(CURRENCY, k) && !out.currency) out.currency = CURRENCY[k];
    else break;
    s = m[1];
  }
  out.item = s;
  if (!out.unit) { out.unit = "т"; out.unit_assumed = true; }
  if (!out.currency) out.currency = market === "export" ? "VAL" : "UZS";
  return out;
}

function attr(tag, name) {
  const m = new RegExp("\\s" + name + "\\s*=\\s*\"([^\"]*)\"", "i").exec(tag);
  return m ? m[1] : null;
}

/** The weeks the page offers: [{ id, label, from, to, market }], and which one it is showing. */
function parseWeeks(html) {
  const sel = /<select\b[^>]*\bid\s*=\s*"ImportId"[^>]*>([\s\S]*?)<\/select>/i.exec(String(html || ""));
  if (!sel) throw new Error("на странице нет списка недель (ImportId)");
  const out = { weeks: [], selected: null };
  const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let m;
  while ((m = re.exec(sel[1]))) {
    const id = Number(attr(m[1], "value"));
    const label = text(m[2]);
    if (!(id > 0) || id !== Math.floor(id)) continue;
    if (/\sselected\b/i.test(m[1])) out.selected = id;
    const p = /^(\d{2}\.\d{2}\.\d{4})\s*[-–—]\s*(\d{2}\.\d{2}\.\d{4})\s*\(([^()]*)\)$/.exec(label);
    if (!p) throw new Error("неделя " + id + ": подпись не разобрана");
    const from = isoDate(p[1]), to = isoDate(p[2]);
    const market = /^внутр/i.test(p[3]) ? "internal" : /^экспорт/i.test(p[3]) ? "export" : "";
    // the Russian page says «Внутренние» / «Экспортные»; the Uzbek and English ones are other datasets
    if (!from || !to || !market) throw new Error("страница не на русском языке или подпись недели изменилась");
    out.weeks.push({ id: id, label: label, from: from, to: to, market: market });
  }
  if (!out.weeks.length) throw new Error("список недель пуст");
  return out;
}

/**
 * One week's table. Throws — with nothing kept — unless the page is the Russian one, shows the week `id`, and every
 * row reads cleanly.
 */
function parseWeek(html, id, market) {
  html = String(html || "");
  const shown = parseWeeks(html).selected;
  if (shown !== id) throw new Error("сайт показал неделю " + shown + " вместо " + id);
  if ((html.match(/<table\b/gi) || []).length !== 1) throw new Error("на странице не одна таблица");
  const head = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(html);
  const cols = [];
  if (head) { const th = /<th\b[^>]*>([\s\S]*?)<\/th>/gi; let h; while ((h = th.exec(head[1]))) cols.push(text(h[1])); }
  if (cols.length !== HEADER.length || cols.some(function (c, i) { return c !== HEADER[i]; })) {
    throw new Error("заголовок таблицы не тот (страница не на русском языке?)");
  }
  const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(html);
  if (!body) throw new Error("таблица без строк");
  const rows = [], seen = {};
  const parts = body[1].split(/<tr\b[^>]*>/i);
  for (let i = 1; i < parts.length; i++) {
    const cells = [];
    const td = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let c;
    while ((c = td.exec(parts[i]))) cells.push(text(c[1]));
    if (cells.length !== HEADER.length) throw new Error("строка " + i + ": ячеек " + cells.length + " вместо " + HEADER.length);
    const no = num(cells[0]), price = num(cells[2]), change = num(cells[3]), pct = num(cells[4]);
    const from = isoDate(cells[5]), to = isoDate(cells[6]);
    if (!(no > 0) || no !== Math.floor(no) || seen[no]) throw new Error("строка " + i + ": номер «" + cells[0] + "»");
    if (!cells[1]) throw new Error("строка " + no + ": пустое название");
    if (!(price >= 0) || isNaN(change) || isNaN(pct)) throw new Error("строка " + no + ": число не разобрано");
    if (!from || !to || from > to) throw new Error("строка " + no + ": дата не разобрана");
    seen[no] = true;
    const n = parseName(cells[1], market);
    rows.push({
      row_no: no, name: cells[1], item: n.item, unit: n.unit, unit_assumed: n.unit_assumed, packing: n.packing,
      is_forward: n.is_forward, is_import: n.is_import, currency: n.currency,
      price: price, change: change, change_pct: change < 0 ? -Math.abs(pct) : pct, date_from: from, date_to: to
    });
  }
  if (!rows.length) throw new Error("в таблице нет строк");
  return rows;
}

/* ------------------------------------------------------------------ the server part (PocketBase JSVM) */

function base() { return String($os.getenv("UZEX_BASE") || "https://uzex.uz").replace(/\/+$/, ""); }

/** One page, as text. A second try after a failure; then the error is the caller's. */
function fetchPage(query) {
  const url = base() + PAGE + "?" + query;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = $http.send({ url: url, method: "GET", timeout: 90, headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "ru" } });
      if (res.statusCode === 200) {
        const body = res.raw || (res.body ? toString(res.body) : "");
        if (body) return body;
        last = "пустой ответ";
      } else last = "HTTP " + res.statusCode;
    } catch (err) { last = String((err && err.message) || err).slice(0, 200); }
  }
  throw new Error("uzex.uz не ответил: " + last);
}

function settings(app) {
  try { return app.findFirstRecordByData("uzex_settings", "key", "main"); } catch (_) { /* not there yet */ }
  const r = new Record(app.findCollectionByNameOrId("uzex_settings"));
  r.set("key", "main");
  app.save(r);
  return r;
}

function status(app) {
  const s = settings(app);
  return {
    auto: !s.getBool("auto_off"),
    last_sync_at: String(s.get("last_sync_at") || ""),
    last_sync_status: s.getString("last_sync_status"),
    last_sync_message: s.getString("last_sync_message"),
    last_new_weeks: s.getInt("last_new_weeks")
  };
}

function setAuto(app, on) {
  const s = settings(app);
  s.set("auto_off", !on);
  app.save(s);
  return status(app);
}

function storeWeek(app, week, rows, nlp) {
  app.runInTransaction(function (tx) {
    let imp = null;
    try { imp = tx.findFirstRecordByData("uzex_imports", "import_id", week.id); } catch (_) { imp = null; }
    if (imp) tx.db().newQuery("DELETE FROM uzex_quotes WHERE import = {:i}").bind({ i: imp.id }).execute();
    else imp = new Record(tx.findCollectionByNameOrId("uzex_imports"));
    imp.set("import_id", week.id);
    imp.set("period_from", week.from);
    imp.set("period_to", week.to);
    imp.set("market", week.market);
    imp.set("label", week.label);
    imp.set("lang", "ru");
    imp.set("row_count", rows.length);
    imp.set("fetched_at", new Date().toISOString().replace("T", " "));
    tx.save(imp);
    const coll = tx.findCollectionByNameOrId("uzex_quotes");
    for (let i = 0; i < rows.length; i++) {
      const q = rows[i], r = new Record(coll);
      r.set("import", imp.id);
      r.set("row_no", q.row_no);
      r.set("name", q.name);
      r.set("item", q.item);
      r.set("name_norm", nlp.matchKey(q.item));
      r.set("unit", q.unit);
      r.set("unit_assumed", q.unit_assumed);
      r.set("packing", q.packing);
      r.set("is_forward", q.is_forward);
      r.set("is_import", q.is_import);
      r.set("currency", q.currency);
      r.set("price", q.price);
      r.set("change", q.change);
      r.set("change_pct", q.change_pct);
      r.set("date_from", q.date_from);
      r.set("date_to", q.date_to);
      tx.save(r);
    }
  });
}

/**
 * Fetch the weeks the site lists that are not stored yet (all of them with `force`), one after another.
 * Returns { ok, listed, added: [{ import_id, label, rows }], kept, errors: [{ import_id, message }], message }.
 * A failure never removes anything: a week that could not be read is reported and the rest goes on.
 */
function sync(app, opts) {
  const force = !!(opts && opts.force);
  const store = app.store();
  if (store.get("uzex_running")) return { ok: false, busy: true, listed: 0, added: [], kept: 0, errors: [], message: "обновление уже идёт" };
  store.set("uzex_running", true);
  const out = { ok: true, listed: 0, added: [], kept: 0, errors: [], message: "" };
  try {
    const nlp = require(`${__hooks}/lib/nlp.js`);
    const weeks = parseWeeks(fetchPage(LANG)).weeks;
    out.listed = weeks.length;
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i];
      let have = false;
      try { have = !!app.findFirstRecordByData("uzex_imports", "import_id", w.id); } catch (_) { have = false; }
      if (have && !force) { out.kept++; continue; }
      try {
        const rows = parseWeek(fetchPage("importId=" + w.id + "&page=1&length=5000&" + LANG), w.id, w.market);
        storeWeek(app, w, rows, nlp);
        out.added.push({ import_id: w.id, label: w.label, rows: rows.length });
      } catch (err) {
        out.errors.push({ import_id: w.id, message: String((err && err.message) || err).slice(0, 300) });
      }
    }
    out.ok = !out.errors.length;
    out.message = out.errors.length ? out.errors.map(function (e) { return e.import_id + ": " + e.message; }).join("; ").slice(0, 900) : "";
  } catch (err) {
    out.ok = false;
    out.message = String((err && err.message) || err).slice(0, 900);
  } finally {
    store.set("uzex_running", false);
  }
  try {
    const s = settings(app);
    s.set("last_sync_at", new Date().toISOString().replace("T", " "));
    s.set("last_sync_status", out.ok ? "ok" : "error");
    s.set("last_sync_message", out.message);
    s.set("last_new_weeks", out.added.length);
    app.save(s);
  } catch (err) {
    app.logger().warn("uzex: sync state not saved", "error", String(err));
  }
  return out;
}

/** The sync that nobody pressed a button for: only while the switch is on (and UZEX_AUTO is not 0). */
function auto(app, why) {
  if ($os.getenv("UZEX_AUTO") === "0") return null;
  try {
    if (settings(app).getBool("auto_off")) return null;
  } catch (err) {
    return null;                       // the collections are not there yet (a first start): nothing to do
  }
  const r = sync(app, {});
  app.logger().info("uzex sync (" + why + ")", "ok", String(r.ok), "added", String(r.added.length), "message", r.message);
  return r;
}

/** Once per start, about half a minute in: weeks published while the computer was off. */
function catchUp(app) {
  const store = app.store();
  if (store.get("uzex_caught_up")) return;
  const boot = Number(store.get("uzex_boot_at") || 0);
  if (!boot || Date.now() - boot < 30 * 1000) return;
  try { app.findCollectionByNameOrId("uzex_imports"); } catch (_) { return; }   // schema not imported yet: next minute
  store.set("uzex_caught_up", true);
  auto(app, "start");
}

module.exports = {
  HEADER: HEADER, text: text, num: num, isoDate: isoDate, parseName: parseName, parseWeeks: parseWeeks, parseWeek: parseWeek,
  status: status, setAuto: setAuto, sync: sync, auto: auto, catchUp: catchUp
};
