// Shared by the handlers in refs.pb.js (loaded with require(), because each handler runs in its own VM and cannot
// see the hook file's top-level scope).
//
// The checks mirror src/lib/refs/package.js for the package head only: the page validates every row before it
// uploads, and every expert's browser validates the file again before it uses it. The sha256 is the page's own
// (pure JS: crypto.subtle is missing on plain-HTTP pages); the server trusts it only to recognise a package that
// was already uploaded, and the unique indexes on package_id and sha256 make that safe against two uploads at once.

const ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECORDS = 2 * 1000 * 1000;
const MAX_SOURCES = 10 * 1000;
// what an upload may never change afterwards
const FIXED = ["package_id", "sha256", "file", "manifest", "records", "sources", "date_min", "date_max", "by"];

function requireAdmin(e) {
  const auth = e.auth;
  if (!auth || !(auth.isSuperuser() || auth.get("role") === "admin")) {
    throw new ForbiddenError("Только администратор может менять справочник цен");
  }
  return auth;
}

function isInt(v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v; }

function manifestOf(record) {
  let text = "";
  try { text = toString(record.get("manifest")); } catch (_) { text = ""; }
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

function activeIds(app) {
  return app.findRecordsByFilter("ref_packages", "active = true", "", 0, 0).map((r) => r.id);
}

module.exports = {
  onCreate(e) {
    const auth = requireAdmin(e);
    const r = e.record;
    const m = manifestOf(r);
    const bad = (msg) => { throw new BadRequestError("Пакет не принят: " + msg); };
    if (!m || typeof m !== "object") bad("нет описания пакета (manifest)");
    if (m.format !== "smeta-refs") bad("это не пакет справочника цен");
    if (m.version !== 1) bad("версия пакета " + (isInt(m.version) ? m.version : "?") + " не поддерживается этой версией программы — обновите программу");
    if (m.full !== true) bad("частичные пакеты не поддерживаются");
    if (Object.prototype.hasOwnProperty.call(m, "rows")) bad("описание пакета не должно содержать строки");
    const pid = r.getString("package_id");
    if (!ID_RE.test(pid) || m.package_id !== pid) bad("номер пакета не совпадает с описанием");
    if (!SHA_RE.test(r.getString("sha256"))) bad("нет контрольной суммы");
    const c = m.counts || {};
    if (!isInt(c.records) || c.records < 0 || c.records > MAX_RECORDS) bad("число записей");
    if (!isInt(c.sources) || c.sources < 0 || c.sources > MAX_SOURCES) bad("число документов");
    if (r.getInt("records") !== c.records || r.getInt("sources") !== c.sources) bad("числа записей и документов не совпадают с описанием");
    if (!Array.isArray(m.sources) || m.sources.length !== c.sources) bad("список документов не совпадает с их числом");
    for (const k of ["date_min", "date_max"]) {
      if (!DATE_RE.test(String(m[k] || ""))) bad("нет диапазона дат");
      if (r.getString(k) && r.getString(k) !== m[k]) bad("даты не совпадают с описанием");
      r.set(k, m[k]);
    }
    // at this point an upload is a file object, not yet a name (the schema also requires the field)
    const fv = r.get("file");
    if (fv == null || fv === "" || (Array.isArray(fv) && !fv.length)) bad("нет файла пакета");
    r.set("by", auth.isSuperuser() ? "" : auth.id);
    // the first package becomes the active one by itself; later ones wait for «Сделать активным»
    r.set("active", activeIds($app).length === 0);
    e.next();
  },

  onUpdate(e) {
    requireAdmin(e);
    const r = e.record;
    const o = r.original();
    if (r.getBool("active") !== o.getBool("active")) {
      throw new BadRequestError("Активный пакет выбирается кнопкой «Сделать активным»");
    }
    for (const k of FIXED) {
      if (JSON.stringify(r.get(k)) !== JSON.stringify(o.get(k))) {
        throw new BadRequestError("Загруженный пакет не меняется: загрузите новый пакет");
      }
    }
    e.next();
  },

  onDelete(e) {
    requireAdmin(e);
    if (e.record.getBool("active")) throw new BadRequestError("Сначала сделайте активным другой пакет");
    e.next();
  },

  activate(e) {
    requireAdmin(e);
    const id = e.request.pathValue("id");
    let found = true;
    try { $app.findRecordById("ref_packages", id); } catch (_) { found = false; }
    if (!found) throw new NotFoundError("Пакет не найден");
    $app.runInTransaction((tx) => {
      for (const r of tx.findRecordsByFilter("ref_packages", "active = true", "", 0, 0)) {
        if (r.id === id) continue;
        r.set("active", false);
        tx.saveNoValidate(r);
      }
      const me = tx.findRecordById("ref_packages", id);
      me.set("active", true);
      tx.saveNoValidate(me);
    });
    return e.json(200, { active: id });
  },
};
