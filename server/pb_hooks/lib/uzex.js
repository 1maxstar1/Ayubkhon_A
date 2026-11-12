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

/*
 * How much of a page is read. The page is somebody else's: the site itself on a bad day, or whatever stands
 * between this machine and it. It used to be read with expressions like <td…>([\s\S]*?)</td>, which on a tag
 * that is never closed read to the end and start again at the next one — a page of 79 kB kept the server busy
 * for a minute, each doubling four times as long, with nothing to cancel it and the same sync starting again
 * half a minute after every restart. The page is now walked in one pass, and everything about it has a size:
 * the real week is 1.7 MB, about 1 300 rows, eight weeks listed, cells of a few hundred characters.
 */
const MAX_PAGE = 8 * 1024 * 1024;     // bytes of one page
const MAX_LISTED = 60;                // weeks in the page's list
const MAX_ROWS = 5000;                // rows of one week: what the request asks for
const MAX_CELL = 4000;                // characters of one cell, markup included
const MAX_NEW_WEEKS = 12;             // weeks fetched by one sync; the rest wait for the next
const MAX_SYNC_MS = 4 * 60 * 1000;    // one sync, all its pages

/** «<td » and «<td>» are a cell, «<tdx» is not: the character after the name. */
function nameEnds(s, at) {
  const c = s.charCodeAt(at);
  return c === 32 || c === 62 || c === 47 || c === 9 || c === 10 || c === 13;
}
/**
 * The elements <name …>…</name> of `html`, in order, in one pass: fn(attributeText, innerText). `low` is the same
 * text in lower case (the page writes its tags either way). An element that is opened and never closed ends the
 * walk — nothing after it can be whole — and is reported by the return value: false.
 */
function eachEl(html, low, name, fn) {
  const open = "<" + name, close = "</" + name + ">";
  let pos = 0;
  for (;;) {
    const a = low.indexOf(open, pos);
    if (a < 0) return true;
    const nameEnd = a + open.length;
    if (!nameEnds(low, nameEnd)) { pos = nameEnd; continue; }
    const gt = low.indexOf(">", nameEnd);
    if (gt < 0) return false;
    const z = low.indexOf(close, gt + 1);
    if (z < 0) return false;
    fn(html.slice(nameEnd, gt), html.slice(gt + 1, z));
    pos = z + close.length;
  }
}
/** The first <name …>…</name>: { attrs, inner } or null. */
function firstEl(html, low, name) {
  let found = null;
  const open = "<" + name;
  let pos = 0;
  for (;;) {
    const a = low.indexOf(open, pos);
    if (a < 0) return null;
    const nameEnd = a + open.length;
    if (!nameEnds(low, nameEnd)) { pos = nameEnd; continue; }
    const gt = low.indexOf(">", nameEnd);
    if (gt < 0) return null;
    const z = low.indexOf("</" + name + ">", gt + 1);
    if (z >= 0) found = { attrs: html.slice(nameEnd, gt), inner: html.slice(gt + 1, z) };
    return found;
  }
}
/** `html` with every tag replaced by a space, in one pass. A «<» that opens nothing stays what it is. */
function untag(html) {
  if (html.indexOf("<") < 0) return html;
  let out = "", pos = 0;
  for (;;) {
    const a = html.indexOf("<", pos);
    if (a < 0) return out + html.slice(pos);
    const z = html.indexOf(">", a + 1);
    if (z < 0) return out + html.slice(pos);
    out += html.slice(pos, a) + " ";
    pos = z + 1;
  }
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
  if (html.length > MAX_PAGE) throw new Error("страница слишком велика (" + Math.round(html.length / 1024 / 1024) + " МБ)");
  const low = html.toLowerCase();
  let sel = null;
  eachEl(html, low, "select", function (attrs, inner) {
    if (sel === null && /\sid\s*=\s*"ImportId"/i.test(" " + attrs)) sel = inner;
  });
  if (sel === null) throw new Error("на странице нет списка недель (ImportId)");
  const out = { weeks: [], selected: null };
  let failed = "";
  eachEl(sel, sel.toLowerCase(), "option", function (attrs, inner) {
    if (failed || out.weeks.length > MAX_LISTED) return;
    const id = Number(attr(attrs, "value"));
    if (!(id > 0) || id !== Math.floor(id)) return;
    if (inner.length > MAX_CELL) { failed = "неделя " + id + ": подпись слишком длинная"; return; }
    const label = text(inner);
    if (/\sselected\b/i.test(attrs)) out.selected = id;
    const p = /^(\d{2}\.\d{2}\.\d{4})\s*[-–—]\s*(\d{2}\.\d{2}\.\d{4})\s*\(([^()]*)\)$/.exec(label);
    if (!p) { failed = "неделя " + id + ": подпись не разобрана"; return; }
    const from = isoDate(p[1]), to = isoDate(p[2]);
    const market = /^внутр/i.test(p[3]) ? "internal" : /^экспорт/i.test(p[3]) ? "export" : "";
    // the Russian page says «Внутренние» / «Экспортные»; the Uzbek and English ones are other datasets
    if (!from || !to || !market) { failed = "страница не на русском языке или подпись недели изменилась"; return; }
    out.weeks.push({ id: id, label: label, from: from, to: to, market: market });
  });
  if (failed) throw new Error(failed);
  if (out.weeks.length > MAX_LISTED) throw new Error("в списке недель больше " + MAX_LISTED + " — страница не та, что ожидалась");
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
  const low = html.toLowerCase();
  const head = firstEl(html, low, "thead");
  const cols = [];
  if (head) eachEl(head.inner, head.inner.toLowerCase(), "th", function (attrs, inner) { if (cols.length <= HEADER.length) cols.push(text(inner.slice(0, MAX_CELL))); });
  if (cols.length !== HEADER.length || cols.some(function (c, i) { return c !== HEADER[i]; })) {
    throw new Error("заголовок таблицы не тот (страница не на русском языке?)");
  }
  const body = firstEl(html, low, "tbody");
  if (!body) throw new Error("таблица без строк");
  const rows = [], seen = {};
  const parts = body.inner.split(/<tr\b[^>]*>/i);
  if (parts.length - 1 > MAX_ROWS) throw new Error("строк " + (parts.length - 1) + " — больше, чем запрошено (" + MAX_ROWS + ")");
  for (let i = 1; i < parts.length; i++) {
    const cells = [];
    // a row is seven short cells: one that is not is refused before it is read
    if (parts[i].length > MAX_CELL * (HEADER.length + 1)) throw new Error("строка " + i + ": слишком длинная");
    const whole = eachEl(parts[i], parts[i].toLowerCase(), "td", function (attrs, inner) { cells.push(text(inner)); });
    if (!whole) throw new Error("строка " + i + ": ячейка не закрыта");
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

/*
 * Why a page did not come, in words the admin page can show. The transport's own text is Go's —
 * «Get "…": dial tcp: lookup uzex.uz: no such host», «context deadline exceeded», «EOF» — and it used to be stored
 * and shown as it was. It goes to the server log; the stored message says what happened. A text of our own
 * (Cyrillic: «страница слишком велика», «пустой ответ») is kept as it is.
 */
const FETCH_TIMEOUT = 90;
function reason(raw, code) {
  if (code >= 500) return "сайт временно не работает (HTTP " + code + ")";
  if (code >= 400) return "сайт отклонил запрос (HTTP " + code + ") — возможно, изменился адрес страницы";
  if (code) return "неожиданный ответ сайта (HTTP " + code + ")";
  const s = String(raw || "");
  if (/[А-Яа-яЁё]/.test(s)) return s;
  if (/no such host|lookup|network is unreachable|no route to host/i.test(s)) return "нет интернета или адрес uzex.uz не находится";
  if (/refused/i.test(s)) return "uzex.uz отказал в соединении";
  if (/timeout|deadline|timed out/i.test(s)) return "нет ответа за " + FETCH_TIMEOUT + " секунд";
  if (/x509|certificate|tls/i.test(s)) return "не удалось установить защищённое соединение (сертификат)";
  if (/EOF|reset|broken pipe|closed/i.test(s)) return "соединение оборвалось";
  return "ошибка соединения";
}

/** One page, as text. A second try after a failure; then the error is the caller's. */
function fetchPage(query) {
  const url = base() + PAGE + "?" + query;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = $http.send({ url: url, method: "GET", timeout: FETCH_TIMEOUT, headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "ru" } });
      if (res.statusCode === 200) {
        const body = res.raw || (res.body ? toString(res.body) : "");
        if (body && body.length > MAX_PAGE) throw new Error("страница слишком велика (" + Math.round(body.length / 1024 / 1024) + " МБ)");
        if (body) return body;
        last = "пустой ответ";
      } else last = reason("", res.statusCode);
    } catch (err) {
      const raw = String((err && err.message) || err).slice(0, 300);
      try { $app.logger().warn("uzex fetch", "url", url, "error", raw); } catch (_) { /* no logger here */ }
      last = reason(raw);
    }
  }
  throw new Error("uzex.uz не ответил — " + last);
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
    // newest first: if there are more new weeks than one sync takes, the ones that wait are the oldest
    const weeks = parseWeeks(fetchPage(LANG)).weeks.slice().sort(function (a, b) { return b.id - a.id; });
    out.listed = weeks.length;
    let fetched = 0, waiting = 0;
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i];
      let have = false;
      try { have = !!app.findFirstRecordByData("uzex_imports", "import_id", w.id); } catch (_) { have = false; }
      if (have && !force) { out.kept++; continue; }
      if (fetched >= MAX_NEW_WEEKS || Date.now() - started > MAX_SYNC_MS) { waiting++; continue; }
      fetched++;
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
    if (waiting) out.message = (out.message ? out.message + "; " : "") + "ещё недель: " + waiting + " — при следующем обновлении";
    out.waiting = waiting;
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
  HEADER: HEADER, LIMITS: { page: MAX_PAGE, listed: MAX_LISTED, rows: MAX_ROWS, cell: MAX_CELL, newWeeks: MAX_NEW_WEEKS },
  text: text, num: num, isoDate: isoDate, reason: reason, parseName: parseName, parseWeeks: parseWeeks, parseWeek: parseWeek,
  status: status, setAuto: setAuto, sync: sync, auto: auto, catchUp: catchUp
};
