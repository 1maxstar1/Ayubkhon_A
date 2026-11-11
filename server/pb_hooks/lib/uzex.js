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

// The page is somebody else's, and it is read by itself, at night, with nobody watching. So how much of it there may
// be is decided here: a page, a cell, the rows of a week, the weeks of a list, and the time one sync may take. All of
// them are several times what the exchange has ever published; past any of them the week (or the list) is refused
// and what is stored stays as it was.
const LENGTH = 5000;                    // rows asked for in one request
const MAX_PAGE = 8 * 1024 * 1024;       // characters of one page
const MAX_CELL = 4000;                  // characters of one cell or one week's label, tags included
const MAX_ROWS = LENGTH;                // rows of one week: more than was asked for is not the answer
const MAX_WEEKS = 100;                  // weeks in the list (the site keeps about four)
const SYNC_MS = 10 * 60 * 1000;         // one sync, all weeks together

// Every search below walks the text once. They used to be expressions of the form «<td …>…</td>»: given an opening
// tag that is never closed, such an expression reads to the end of the page, and then again from the next opening
// tag — thirty thousand of them took seconds, a few hundred thousand would have held the server for hours.

/** ASCII letters lowered and nothing else, so that every position stays where it was. */
function lower(s) { return s.replace(/[A-Z]+/g, function (m) { return m.toLowerCase(); }); }
function wordChar(c) { return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95; }

/**
 * Every element `name` of `html`, in order: fn(attrs, inner, start, end); returning true stops. `low` is lower(html).
 * An opening tag with no closing tag after it is not an element; once one closing tag has not been found no later
 * one will be, so it is not looked for again.
 */
function each(html, low, name, fn) {
  const open = "<" + name, close = "</" + name + ">", n = open.length;
  let p = 0;
  while ((p = low.indexOf(open, p)) >= 0) {
    const a = p + n;
    if (wordChar(low.charCodeAt(a))) { p = a; continue; }
    const gt = low.indexOf(">", a);
    if (gt < 0) break;
    const end = low.indexOf(close, gt + 1);
    if (end < 0) break;
    if (fn(html.slice(a, gt), html.slice(gt + 1, end), p, end + close.length)) return;
    p = end + close.length;
  }
}

/** The content of the first `name` element, or null. */
function first(html, low, name) {
  let out = null;
  each(html, low, name, function (attrs, inner) { out = inner; return true; });
  return out;
}

/** `html` with every «<…>» replaced by a space. A «<» that nothing closes is text, like everything after it. */
function untag(html) {
  let out = "", last = 0, p = 0;
  while ((p = html.indexOf("<", p)) >= 0) {
    const gt = html.indexOf(">", p + 1);
    if (gt < 0) break;
    out += html.slice(last, p) + " ";
    last = p = gt + 1;
  }
  return last ? out + html.slice(last) : html;
}

/** Text of a cell: tags out, entities decoded, white space (the no-break kinds too) to single spaces. */
function text(html) {
  return untag(String(html == null ? "" : html))
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
  html = String(html || "");
  if (html.length > MAX_PAGE) throw new Error("страница слишком большая (" + html.length + " знаков)");
  let sel = null;
  each(html, lower(html), "select", function (attrs, inner) {
    if (!/\bid\s*=\s*"ImportId"/i.test(attrs)) return false;
    sel = inner;
    return true;
  });
  if (sel === null) throw new Error("на странице нет списка недель (ImportId)");
  const out = { weeks: [], selected: null };
  each(sel, lower(sel), "option", function (attrs, inner) {
    const id = Number(attr(attrs, "value"));
    if (inner.length > MAX_CELL) throw new Error("неделя " + id + ": подпись слишком длинная");
    const label = text(inner);
    if (!(id > 0) || id !== Math.floor(id)) return;
    if (/\sselected\b/i.test(attrs)) out.selected = id;
    const p = /^(\d{2}\.\d{2}\.\d{4})\s*[-–—]\s*(\d{2}\.\d{2}\.\d{4})\s*\(([^()]*)\)$/.exec(label);
    if (!p) throw new Error("неделя " + id + ": подпись не разобрана");
    const from = isoDate(p[1]), to = isoDate(p[2]);
    const market = /^внутр/i.test(p[3]) ? "internal" : /^экспорт/i.test(p[3]) ? "export" : "";
    // the Russian page says «Внутренние» / «Экспортные»; the Uzbek and English ones are other datasets
    if (!from || !to || !market) throw new Error("страница не на русском языке или подпись недели изменилась");
    if (out.weeks.length >= MAX_WEEKS) throw new Error("в списке больше " + MAX_WEEKS + " недель");
    out.weeks.push({ id: id, label: label, from: from, to: to, market: market });
  });
  if (!out.weeks.length) throw new Error("список недель пуст");
  return out;
}

/** How many tags `name` open in the text (`low` is lowered). */
function countTags(low, name) {
  const open = "<" + name;
  let n = 0, p = 0;
  while ((p = low.indexOf(open, p)) >= 0) { p += open.length; if (!wordChar(low.charCodeAt(p))) n++; }
  return n;
}

/** What stands between the «<tr …>» tags of a table body: the first piece is what comes before the first row. */
function rowParts(body) {
  const low = lower(body), parts = [];
  let last = 0, p = 0;
  while ((p = low.indexOf("<tr", p)) >= 0) {
    if (wordChar(low.charCodeAt(p + 3))) { p += 3; continue; }
    const gt = low.indexOf(">", p + 3);
    if (gt < 0) break;
    parts.push(body.slice(last, p));
    last = p = gt + 1;
    if (parts.length > MAX_ROWS) throw new Error("в таблице больше " + MAX_ROWS + " строк");
  }
  parts.push(body.slice(last));
  return parts;
}

/**
 * One week's table. Throws — with nothing kept — unless the page is the Russian one, shows the week `id`, and every
 * row reads cleanly.
 */
function parseWeek(html, id, market) {
  html = String(html || "");
  const shown = parseWeeks(html).selected;
  if (shown !== id) throw new Error("сайт показал неделю " + shown + " вместо " + id);
  const low = lower(html);
  if (countTags(low, "table") !== 1) throw new Error("на странице не одна таблица");
  const head = first(html, low, "thead");
  const cols = [];
  if (head !== null) {
    each(head, lower(head), "th", function (attrs, inner) {
      if (cols.length > HEADER.length || inner.length > MAX_CELL) return true;      // not the header: said below
      cols.push(text(inner));
    });
  }
  if (cols.length !== HEADER.length || cols.some(function (c, i) { return c !== HEADER[i]; })) {
    throw new Error("заголовок таблицы не тот (страница не на русском языке?)");
  }
  const body = first(html, low, "tbody");
  if (body === null) throw new Error("таблица без строк");
  const rows = [], seen = {};
  const parts = rowParts(body);
  for (let i = 1; i < parts.length; i++) {
    const cells = [];
    each(parts[i], lower(parts[i]), "td", function (attrs, inner) {
      if (inner.length > MAX_CELL) throw new Error("строка " + i + ": ячейка длиннее " + MAX_CELL + " знаков");
      cells.push(text(inner));
      return cells.length > HEADER.length;                                          // one too many is enough to refuse
    });
    if (cells.length !== HEADER.length) {
      throw new Error("строка " + i + ": ячеек " + (cells.length > HEADER.length ? "больше " + HEADER.length : cells.length + " вместо " + HEADER.length));
    }
    const no = num(cells[0]), price = num(cells[2]), change = num(cells[3]), pct = num(cells[4]);
    const from = isoDate(cells[5]), to = isoDate(cells[6]);
    if (!(no > 0) || no !== Math.floor(no) || seen[no]) throw new Error("строка " + i + ": номер «" + cells[0].slice(0, 40) + "»");
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
/** How long one sync may take. UZEX_SYNC_MS shortens it for the tests; it cannot make it longer. */
function syncLimit() {
  const ms = Number($os.getenv("UZEX_SYNC_MS") || 0);
  return ms > 0 && ms < SYNC_MS ? ms : SYNC_MS;
}

/** One page, as text. A second try after a failure; then the error is the caller's. */
function fetchPage(query) {
  const url = base() + PAGE + "?" + query;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = $http.send({ url: url, method: "GET", timeout: 90, headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "ru" } });
      if (res.statusCode === 200) {
        const body = res.raw || (res.body ? toString(res.body) : "");
        if (body.length > MAX_PAGE) { last = "страница слишком большая (" + body.length + " знаков)"; break; }
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
    const started = Date.now();
    const weeks = parseWeeks(fetchPage(LANG)).weeks;
    out.listed = weeks.length;
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i];
      let have = false;
      try { have = !!app.findFirstRecordByData("uzex_imports", "import_id", w.id); } catch (_) { have = false; }
      if (have && !force) { out.kept++; continue; }
      // a site that answers slowly, week after week, does not hold the sync for as long as it likes: what is left
      // is not stored yet, so the next sync asks for it again
      if (Date.now() - started > syncLimit()) {
        out.errors.push({ import_id: w.id, message: "не загружена: обновление заняло больше " + Math.round(syncLimit() / 60000) + " мин. — будет загружена при следующем" });
        continue;
      }
      try {
        const rows = parseWeek(fetchPage("importId=" + w.id + "&page=1&length=" + LENGTH + "&" + LANG), w.id, w.market);
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
  HEADER: HEADER, LIMITS: { page: MAX_PAGE, cell: MAX_CELL, rows: MAX_ROWS, weeks: MAX_WEEKS, syncMs: SYNC_MS }, text: text, num: num, isoDate: isoDate, parseName: parseName, parseWeeks: parseWeeks, parseWeek: parseWeek,
  status: status, setAuto: setAuto, sync: sync, auto: auto, catchUp: catchUp
};
