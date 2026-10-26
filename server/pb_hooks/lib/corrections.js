// Shared by the handler in corrections.pb.js (loaded with require(), because
// each handler runs in its own VM and cannot see the hook file's top-level
// scope).

const MAX_ROWS = 3000;      // one estimate's resources, with room to spare
const MAX_TEXT = 500;

function text(v) { return String(v == null ? "" : v).slice(0, MAX_TEXT); }
function money(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// Where a price came from (corrections.source, written by the page): «typed», «hint:<correction id>»,
// «ref:<package>:<record>» or «ref:<package>:median:<record>,<record>…». Other experts' hints label a price «из
// справочника» by it, and these labels are meant to become learning data, so the server takes only these forms, and a
// reference or a hint only when that package or that correction exists; anything else is stored as «typed». It stays
// the page's claim about one click (the server cannot see the click), never a proof.
const MAX_SOURCE = 200;
const SOURCE_RE = /^(?:typed|hint:([a-z0-9]{15})|ref:([a-z0-9][a-z0-9._-]{2,63}):(?:\d{1,12}|median:\d{1,12}(?:,\d{1,12})*(?:…)?))$/;

function sourceChecker(app) {
  const known = new Map();
  function exists(coll, field, value) {
    const k = coll + "\u0000" + value;
    if (!known.has(k)) {
      let ok = false;
      try { ok = !!(field === "id" ? app.findRecordById(coll, value) : app.findFirstRecordByData(coll, field, value)); } catch (_) { ok = false; }
      known.set(k, ok);
    }
    return known.get(k);
  }
  /** { source, source_price } as stored: "" for a page that sends none (older versions), «typed» for a bad claim. */
  return function (source, price) {
    let s = String(source == null ? "" : source);
    if (!s) return { source: "", price: 0 };
    // a long median list is cut at a whole record number, as the page cuts it
    if (s.length > MAX_SOURCE) s = s.slice(0, MAX_SOURCE - 1).replace(/,\d*$/, "") + "…";
    const m = SOURCE_RE.exec(s);
    let ok = !!m;
    if (ok && m[1]) ok = exists("corrections", "id", m[1]);
    if (ok && m[2]) ok = exists("ref_packages", "package_id", m[2]);
    if (!ok || s === "typed") return { source: "typed", price: 0 };
    return { source: s, price: money(price) };
  };
}

module.exports = {
  sourceChecker: sourceChecker,

  /** A correction written through the records API (not the bulk route): its source is checked the same way. */
  checkRecord(e) {
    const r = e.record;
    const src = sourceChecker($app)(r.get("source"), r.get("source_price"));
    r.set("source", src.source);
    r.set("source_price", src.price);
    e.next();
  },

  /**
   * Write a workspace's price corrections in one request.
   *
   * One «Применить процент» changes every resource of an estimate at once —
   * a thousand of them is ordinary. Written one record at a time that is a
   * thousand HTTP creates, and the deployed server allows forty per five
   * seconds from one address (the whole office shares that address), so all
   * but the first forty came back 429 and were thrown away: the estimate was
   * priced correctly on screen and in the exported document, but the price
   * memory that feeds the next project's hints kept almost none of it.
   *
   * Everything that says who did the work and where — the region, the
   * application, the contragent, the author — is taken from the workspace and
   * from the token, not from the request. The lookup keys are computed here by
   * the same lib/nlp.js the page is built from, so the two sides cannot drift.
   */
  bulk(e) {
    const auth = e.auth;
    if (!auth) throw new ForbiddenError("Kirish kerak");

    const body = e.requestInfo().body || {};
    const rows = Array.isArray(body.set) ? body.set : [];
    const gone = Array.isArray(body.del) ? body.del : [];
    if (rows.length + gone.length > MAX_ROWS) {
      throw new BadRequestError("too many corrections in one request: " +
        (rows.length + gone.length) + " (max " + MAX_ROWS + ")");
    }

    let ws = null;
    try { ws = $app.findRecordById("workspaces", String(body.workspace || "")); } catch (_) { ws = null; }
    if (!ws) throw new NotFoundError("Ish maydoni topilmadi");

    const region = ws.getString("region");
    const application = ws.getString("application");
    let contragent = "";
    if (application) {
      try { contragent = $app.findRecordById("applications", application).getString("contragent"); } catch (_) { contragent = ""; }
    }
    // A superuser acts on somebody else's behalf and has no user record of its
    // own, the same exception the ownership hook makes.
    const by = auth.isSuperuser() ? "" : auth.id;

    const N = require(`${__hooks}/lib/nlp.js`);
    const coll = $app.findCollectionByNameOrId("corrections");

    // One query for what the workspace already has, rather than one lookup per
    // row: a thousand rows would otherwise be a thousand round trips inside the
    // write lock.
    const have = new Map();
    for (const r of $app.findRecordsByFilter("corrections", "workspace = {:w}", "", 0, 0, { w: ws.id })) {
      have.set(r.getString("res_key"), r);
    }

    const ids = {};
    let saved = 0, deleted = 0;
    const checkSource = sourceChecker($app);

    $app.runInTransaction((tx) => {
      for (const row of rows) {
        const key = text(row.res_key);
        if (!key) continue;
        const name = text(row.name);
        const unit = text(row.unit);
        let rec = have.get(key);
        if (!rec) {
          rec = new Record(coll);
          rec.set("workspace", ws.id);
          rec.set("res_key", key);
          have.set(key, rec);
        }
        rec.set("application", application);
        rec.set("contragent", contragent);
        rec.set("region", region);
        rec.set("name", name);
        rec.set("unit", unit);
        rec.set("name_key", N.nameKey(name));
        rec.set("unit_key", N.unitKey(unit));
        rec.set("match_key", N.matchKey(name) || "-");
        rec.set("match_unit_key", N.matchUnitKey(unit));
        rec.set("smeta_price", money(row.smeta_price));
        rec.set("market_price", money(row.market_price));
        rec.set("note", text(row.note));
        // where the price came from (see sourceChecker); empty from older pages. It holds only while market_price
        // equals source_price — a price typed over an applied one is «typed» again.
        const src = checkSource(row.source, row.source_price);
        rec.set("source", src.source);
        rec.set("source_price", src.price);
        rec.set("by", by);
        tx.save(rec);
        ids[key] = rec.id;
        saved++;
      }
      for (const k of gone) {
        const rec = have.get(text(k));
        if (!rec || !rec.id) continue;
        tx.delete(rec);
        have.delete(text(k));
        deleted++;
      }
    });

    return e.json(200, { saved: saved, deleted: deleted, ids: ids });
  },
};
