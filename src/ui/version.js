/*
 * A page left open across an update (F6).
 *
 * The program on the server can be updated while a page stays open for days; that page went on with the old code
 * against the new server, and nothing said so. Now and then — when the tab is shown again, when the network comes
 * back, every five minutes while it is on screen — the page reads the version the server serves now, from the same
 * label the launchers read («class="ver"»), and when it is another one says so in a bar that stays, with a button
 * that saves the work and reloads. It never reloads by itself. The single-file page has no server and does nothing.
 */
(function (S) {
  'use strict';
  if (typeof location === 'undefined' || location.protocol === 'file:' || !S.pb) return;

  var RE = /class="ver"[^>]*>(v[0-9][0-9.]*)</;
  var own = '', dismissed = {}, bar = null, busy = null;

  /** The version the server serves now: read from the start of the page, as far as its label; null when it cannot be told. */
  function served() {
    return fetch(location.pathname, { cache: 'no-store', headers: { Range: 'bytes=0-65535' } }).then(function (r) {
      if (!r.ok) return null;
      if (!r.body || !r.body.getReader) return r.text().then(function (t) { var m = RE.exec(t); return m ? m[1] : null; });
      var reader = r.body.getReader(), dec = new TextDecoder(), text = '';
      function more() {
        return reader.read().then(function (x) {
          if (x.done) return null;
          text += dec.decode(x.value, { stream: true });
          var m = RE.exec(text);
          if (m) { try { reader.cancel(); } catch (e) { /* done anyway */ } return m[1]; }
          if (text.length > 4 * 1024 * 1024) { try { reader.cancel(); } catch (e) { /* done anyway */ } return null; }
          return more();
        });
      }
      return more();
    }).catch(function () { return null; });   // no server just now: that is said elsewhere (the save mark)
  }

  function reload() {
    var Sy = S.Sync;
    if (Sy && Sy.ws && !Sy.frozen) {
      try { Sy.flush(); } catch (e) { /* the journal of this browser keeps the last prices */ }
      Promise.resolve(Sy.saveNow && Sy.saveNow()).then(function () { location.reload(); }, function () { location.reload(); });
    } else location.reload();
  }

  function show(v) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'verBar';
      bar.className = 'verbar';
      document.body.appendChild(bar);
    }
    bar.innerHTML = '<span>На сервере обновлена программа: <b>' + S.esc(v) + '</b> (у вас открыта ' + S.esc(own) +
      '). Обновите страницу.</span> <button class="btn sm" data-reload>Обновить страницу</button> <button class="link" data-x title="Скрыть">×</button>';
    bar.hidden = false;
    bar.querySelector('[data-reload]').addEventListener('click', reload);
    bar.querySelector('[data-x]').addEventListener('click', function () { dismissed[v] = 1; bar.hidden = true; });
  }

  function check() {
    if (busy) return busy;
    busy = served().then(function (v) {
      busy = null;
      if (v && own && v !== own && !dismissed[v]) show(v);
      else if (bar && (!v || v === own)) bar.hidden = true;
      return { served: v, own: own };
    });
    return busy;
  }

  function start() {
    own = ((document.querySelector('.ver') || {}).textContent || '').trim();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
    window.addEventListener('online', check);
    setInterval(function () { if (document.visibilityState === 'visible') check(); }, 5 * 60 * 1000);
  }
  S.Version = { check: check, own: function () { return own; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(S);
