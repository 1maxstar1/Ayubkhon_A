// Shared by the handlers in admin.pb.js (loaded with require(), because each
// handler runs in its own VM and cannot see the hook file's top-level scope).
module.exports = {
  requireAdmin(e) {
    const auth = e.auth;
    if (!auth || !(auth.isSuperuser() || auth.get("role") === "admin")) {
      throw new ForbiddenError("Faqat administrator");
    }
  },
  /** Deletes every record of `collection` whose `field` equals `id`; returns the count. */
  deleteWhere(tx, collection, field, id) {
    const rows = tx.findRecordsByFilter(collection, field + " = {:id}", "", 0, 0, { id: id });
    for (const r of rows) tx.delete(r);
    return rows.length;
  },
};
