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

  /**
   * Fills match_key / match_unit_key on corrections saved before those columns
   * existed. Without them a price correction written by the old page is
   * invisible to the hint lookup, which searches by match key.
   *
   * Batched on purpose: a single transaction over the whole table would hold a
   * write lock for as long as it takes. A name that normalises to nothing gets
   * "-" so the same row is not picked up on every pass.
   *
   * Written with SQL rather than tx.save(), and that is the whole point of the
   * loop below. Saving a record stamps `updated`, and `updated` is what the
   * hint list is ordered by — both in the query (`sort: '-updated'`, capped at
   * a thousand rows a chunk) and in the popover, where the newest price of a
   * resource is shown first. A backfill that saved every historical row would
   * stamp them all with the same minute, in whatever order the batches came
   * out, and a region's whole price history would arrive shuffled — the one
   * thing the expert reads it for, which project paid what most recently,
   * lost to a migration that was only meant to fill in two columns.
   */
  backfillKeys(app, cap) {
    const N = require(`${__hooks}/lib/nlp.js`);
    const limit = cap || 200000;
    let done = 0;
    for (let round = 0; round < 1000 && done < limit; round++) {
      const rows = app.findRecordsByFilter("corrections", "match_key = ''", "", 500, 0, {});
      if (!rows.length) break;
      app.runInTransaction((tx) => {
        for (const r of rows) {
          tx.db().newQuery("UPDATE corrections SET match_key = {:k}, match_unit_key = {:u} WHERE id = {:id}")
            .bind({
              k: N.matchKey(r.getString("name")) || "-",
              u: N.matchUnitKey(r.getString("unit")),
              id: r.id
            })
            .execute();
        }
      });
      done += rows.length;
    }
    return done;
  },
};
