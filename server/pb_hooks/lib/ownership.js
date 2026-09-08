// Shared by the handlers in ownership.pb.js (loaded with require(), because
// each handler runs in its own VM and cannot see the hook file's top-level
// scope).
const STAMP = {
  // collection      on create                        on update
  workspaces: { create: ["opened_by", "updated_by"], update: ["updated_by"] },
  corrections: { create: ["by"], update: ["by"] },
  exports: { create: ["by"], update: [] },
};

module.exports = {
  /**
   * Put the authenticated user's id on the fields that record who did the
   * work, whatever the request said. Superusers are left alone: the installer,
   * the tests and the maintenance endpoints act on somebody else's behalf and
   * have no user record of their own.
   */
  stamp(e, phase) {
    const auth = e.auth;
    if (auth && !auth.isSuperuser()) {
      const rule = STAMP[e.collection.name];
      if (rule) {
        const fields = rule[phase];
        for (let i = 0; i < fields.length; i++) e.record.set(fields[i], auth.id);
      }
    }
    e.next();
  },
};
