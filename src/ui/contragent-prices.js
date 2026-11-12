/*
 * «Цены этого контрагента…» (F1): the earlier prices of the same contractor for the same resources, in one list, set by
 * one confirmation.
 *
 * The popover of earlier projects offers them one resource at a time. An application of a contractor priced before
 * often repeats most of its resources, and each took two clicks. Here they are listed together — each resource with
 * the price of the newest earlier application of this contractor in this region that priced it — and nothing is set
 * until «Применить выбранные» is pressed (the rule: a suggestion is set only by «Применить»). Never over a price the
 * expert set (a price «Применить %» set is not one): a name and unit any of whose variants already has its own price is left out, so one name and unit never
 * ends with two market prices. The press can be taken back («Отменить», as every bulk change).
 *
 * Server only. Calls what match.js exports (S.matchPair) and changes none of the measured code.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;
  function $(id) { return document.getElementById(id); }
  function A() { return window.app; }

  /**
   * The list: `resources` of the model, `corrections` of the contractor's earlier applications (newest first).
   * Returns { picks: [{ nk, name, unit, variants, price, corrId, number, at, smetaThere, ref, uzex, diff }], own, ambiguous, same }.
   */
  function pick(resources, corrections, own) {
    own = own || function (v) { return !S.near(v.market, v.price); };
    var byMk = {};
    (corrections || []).forEach(function (c) {
      if (!(c.market_price > 0)) return;
      var mk = S.matchPair(c.name, c.unit || '');
      var g = byMk[mk];
      if (!g) { byMk[mk] = { app: c.application, rows: [c] }; return; }
      if (c.application === g.app) g.rows.push(c);          // only the newest application that priced it counts
    });
    var groups = {}, order = [];
    (resources || []).forEach(function (r) {
      var k = r.nk || S.nameUnitKey(r.name, r.unit || '');
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(r);
    });
    var out = { picks: [], own: 0, ambiguous: 0, same: 0 };
    order.forEach(function (k) {
      var vs = groups[k], r0 = vs[0];
      var g = byMk[r0.mk || S.matchPair(r0.name, r0.unit || '')];
      if (!g) return;
      var prices = [];
      g.rows.forEach(function (c) { if (!prices.some(function (p) { return S.near(p, c.market_price); })) prices.push(c.market_price); });
      if (prices.length > 1) { out.ambiguous++; return; }
      if (vs.some(own)) { out.own++; return; }
      var price = prices[0];
      if (vs.every(function (v) { return S.near(v.market, price); })) { out.same++; return; }
      var c = g.rows[0], a = c.expand && c.expand.application;
      // the saving row by row: a resource can stand at several estimate prices
      var diff = vs.reduce(function (s, v) { return s + (v.smetaSum - (v.qty || 0) * price); }, 0);
      out.picks.push({ nk: k, name: r0.name, unit: r0.unit || '', variants: vs, price: price, corrId: c.id, number: a ? a.number : '',
        at: c.updated, smetaThere: c.smeta_price, ref: /^ref:/.test(c.source || '') && S.near(c.market_price, c.source_price),
        uzex: /^uzex:/.test(c.source || '') && S.near(c.market_price, c.source_price), diff: diff });
    });
    return out;
  }

  function day(d) { var t = new Date(String(d || '').replace(' ', 'T')); return isNaN(t) ? '' : t.toLocaleDateString('ru-RU'); }

  function open() {
    var app = A(), Sy = S.Sync;
    if (!app || !app.model || !Sy || !Sy.ws || Sy.loading || Sy.frozen || !Sy.app || !Sy.app.contragent) return;
    S.pb.collection('corrections').getFullList({
      batch: 500, sort: '-updated', expand: 'application',
      filter: S.pb.filter('contragent = {:c} && region = {:r} && workspace != {:w} && market_price > 0', { c: Sy.app.contragent, r: Sy.ws.region, w: Sy.ws.id })
    }).then(function (rows) {
      // a price «Применить %» set is the program's, not the expert's (as for «Применить %» itself, A7)
      show(pick(app.model.resources, rows, function (v) { return app.ownPrice(v); }));
    }).catch(function (e) { app.toast('Прежние цены контрагента не получены: ' + S.pbErr(e), true); });
  }

  function show(res) {
    var app = A();
    var box = $('cpBox');
    if (!box) { box = document.createElement('div'); box.id = 'cpBox'; box.className = 'cpbox'; document.body.appendChild(box); }
    var skipped = (res.own ? 'с вашей ценой — ' + res.own : '') + (res.ambiguous ? (res.own ? ', ' : '') + 'разные цены в одной заявке — ' + res.ambiguous : '');
    if (!res.picks.length) {
      app.toast('Нечего предложить: у этого контрагента в этом регионе нет прежних цен на эти ресурсы' + (skipped ? ' (пропущено: ' + skipped + ')' : ''));
      return;
    }
    box.innerHTML = '<div class="cp-in"><div class="cp-h"><b>Цены этого контрагента из прежних заявок</b> · ' + S.esc(S.regionLabel(S.Sync.ws.region)) +
      ' <small>цены без НДС</small><button class="link" data-x title="Закрыть">×</button></div>' +
      '<div class="cp-list"><table><thead><tr><th></th><th>Ресурс</th><th>Ед.</th><th class="num">Цена по смете</th><th class="num">Прежняя цена</th>' +
      '<th class="num">Разница, сум</th><th>Заявка</th></tr></thead><tbody>' +
      res.picks.map(function (p, i) {
        var smeta = p.variants.map(function (v) { return S.price(v.price); }).join(' · ');
        return '<tr><td><input type="checkbox" data-i="' + i + '"' + (p.uzex ? '' : ' checked') + '></td><td>' + S.esc(p.name) +
          (p.ref ? ' <em class="hp-ref">из справочника</em>' : '') + (p.uzex ? ' <em class="hp-uzex">с биржи UZEX — проверьте НДС</em>' : '') +
          '</td><td>' + S.esc(p.unit) + '</td><td class="num">' + smeta + '</td><td class="num"><b>' + S.price(p.price) + '</b>' +
          (p.smetaThere != null && !p.variants.some(function (v) { return S.near(v.price, p.smetaThere); }) ? '<small>сметная цена там: ' + S.price(p.smetaThere) + '</small>' : '') +
          '</td><td class="num">' + S.money(p.diff) + '</td><td>№ ' + S.esc(p.number) + ' · ' + day(p.at) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="cp-f"><span class="count">Ваши цены не трогаются' + (skipped ? ': пропущено ' + skipped : '') +
      '. Сразу после применения действие можно отменить кнопкой «Отменить».</span>' +
      '<button class="btn sm" data-x>Отмена</button><button class="btn sm ok" data-apply>Применить выбранные</button></div></div>';
    box.hidden = false;
    var count = function () { var n = box.querySelectorAll('input[data-i]:checked').length; box.querySelector('[data-apply]').textContent = 'Применить выбранные (' + n + ')'; };
    count();
    box.querySelectorAll('input[data-i]').forEach(function (c) { c.addEventListener('change', count); });
    box.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', function () { box.hidden = true; }); });
    box.querySelector('[data-apply]').addEventListener('click', function () {
      var chosen = [].map.call(box.querySelectorAll('input[data-i]:checked'), function (c) { return res.picks[+c.dataset.i]; });
      var map = {}, used = [], now = {};
      ((app.model && app.model.resources) || []).forEach(function (r) { now[r.key] = r; });
      chosen.forEach(function (p) {
        // again at the press, on the resources as they are now: a price typed while the list was open is not replaced
        if (p.variants.some(function (v) { return !now[v.key] || app.ownPrice(now[v.key]); })) return;
        p.variants.forEach(function (v) { map[v.key] = p.price; });
        used.push(p);
      });
      box.hidden = true;
      if (!used.length) { app.toast('Ничего не применено'); return; }
      app.bulkPrices(map, 'Цены контрагента: применено ' + used.length, function () {
        if (S.markSource) used.forEach(function (p) { p.variants.forEach(function (v) { S.markSource(v.key, p.price, 'hint:' + p.corrId); }); });
      });
    });
  }

  function init() {
    var reset = $('resetBtn');
    if (!reset || $('cpBtn')) return;
    var b = document.createElement('button');
    b.className = 'btn sm'; b.id = 'cpBtn'; b.hidden = true;
    b.title = 'Прежние цены этого контрагента на те же ресурсы — одним списком, применяются после подтверждения';
    b.textContent = 'Цены этого контрагента…';
    reset.parentNode.insertBefore(b, reset);
    b.addEventListener('click', open);
    document.addEventListener('ws:open', function () { b.hidden = !(S.Sync && S.Sync.app && S.Sync.app.contragent); });
    document.addEventListener('ws:close', function () { b.hidden = true; var x = $('cpBox'); if (x) x.hidden = true; });
  }

  S.ContragentPrices = { pick: pick, open: open };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(S);
