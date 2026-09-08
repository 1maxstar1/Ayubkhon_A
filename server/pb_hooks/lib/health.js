// Shared by the handler in health.pb.js (loaded with require(), because each
// handler runs in its own VM and cannot see the hook file's top-level scope).

// A nightly backup is configured (server/deploy/configure.sh: 0 3 * * *), so
// anything older than two nights means it has stopped happening.
const MAX_AGE_H = 48;

module.exports = {
  /**
   * Is the server still doing the things nobody watches?
   *
   * A server whose backups have quietly stopped — a directory the service user
   * cannot write to is enough — looks completely healthy: /api/health answers
   * 200 and every record saves. The failure is only discovered on the day the
   * backup is needed, which is the day the registry is being reset.
   */
  report(e) {
    require(`${__hooks}/lib/admin.js`).requireAdmin(e);

    const out = { ok: true, why: [], backups: { count: 0, newest: "", at: "", size: 0, ageHours: null } };
    let fs = null;
    try {
      fs = $app.newBackupsFilesystem();
      const items = fs.list("");
      let newest = null;
      for (const it of items) {
        if (it.isDir) continue;
        out.backups.count++;
        if (!newest || it.modTime.unix() > newest.modTime.unix()) newest = it;
      }
      if (newest) {
        out.backups.newest = newest.key;
        out.backups.size = newest.size;
        out.backups.at = JSON.parse(JSON.stringify(newest.modTime));
        out.backups.ageHours = Math.round((Date.now() / 1000 - newest.modTime.unix()) / 360) / 10;
      }
    } catch (err) {
      out.backups.error = String(err);
    } finally {
      if (fs) { try { fs.close(); } catch (_) { /* nothing left to close */ } }
    }

    // Russian: this is read on the admin page.
    if (out.backups.error) out.why.push("список резервных копий не читается: " + out.backups.error);
    else if (!out.backups.count) out.why.push("резервных копий нет ни одной");
    else if (out.backups.ageHours > MAX_AGE_H) {
      out.why.push("последняя резервная копия сделана " + Math.round(out.backups.ageHours) + " ч. назад");
    }
    out.ok = out.why.length === 0;
    return e.json(200, out);
  },
};
