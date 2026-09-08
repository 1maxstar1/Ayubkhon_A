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

module.exports = {
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
