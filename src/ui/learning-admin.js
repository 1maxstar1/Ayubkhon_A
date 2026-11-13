/*
 * Admin page: «Обучение» — what has been gathered to learn from (docs/ai-reja.md), as counts only: decisions on
 * suggestions by kind, finished prices by kind, applications finished and remembered. Never a name or a price —
 * «Скопировать числа» gives the same counts as text, safe to send to whoever maintains the program.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;
  function $(id) { return document.getElementById(id); }

  var ACTION = { applied: 'подсказка применена', typed: 'цена введена вручную', reset: 'возвращена сметная цена', autopick: '«Автоподбор»', bulk: 'массовое изменение' };
  var KIND = { corrected: 'цена изменена', checked: 'оставлена и проверена', untouched: 'оставлена', zeroed: 'обнулена' };
  var SOURCE = { typed: 'введены вручную', ref: 'из справочника', hint: 'из прежних проектов', uzex: 'с биржи UZEX', pct: '«Применить %»',
    mark: 'отмечены «проверено»', finish: 'приняты при завершении', '-': 'без отметки' };

  var L = {
    data: null,

    rows: function (d) {
      var out = [], sum = function (o) { return Object.keys(o || {}).reduce(function (s, k) { return s + o[k]; }, 0); };
      out.push(['Заявок в работе и завершённых', d.workspaces, 'workspaces']);
      out.push(['Завершённых заявок', d.finished, 'finished']);
      out.push(['Заявок, чьи цены запомнены', d.memory_applications, 'memory_applications']);
      out.push(['Правок цен (все заявки)', d.corrections, 'corrections']);
      out.push(['Запомнено цен завершённых заявок', sum(d.memory), 'memory']);
      Object.keys(KIND).forEach(function (k) { out.push(['— ' + KIND[k], (d.memory || {})[k] || 0, 'memory.' + k]); });
      Object.keys(SOURCE).forEach(function (k) { if ((d.memory_sources || {})[k]) out.push(['— — ' + SOURCE[k], d.memory_sources[k], 'memory_sources.' + k]); });
      out.push(['— изменённая цена принята подрядчиком', d.memory_accepted, 'memory_accepted']);
      out.push(['Решений по подсказкам', sum(d.events), 'events']);
      Object.keys(ACTION).forEach(function (k) { out.push(['— ' + ACTION[k], (d.events || {})[k] || 0, 'events.' + k]); });
      out.push(['— когда подсказки были', d.events_with_lines, 'events_with_lines']);
      out.push(['— когда окно подсказок открывали', d.events_opened, 'events_opened']);
      return out;
    },

    load: function () {
      var self = this;
      if (!$('learnPanel') || !S.isAdmin()) return;
      S.pb.send('/api/learning/stats', { method: 'GET' }).then(function (d) {
        self.data = d;
        $('learnStat').textContent = '';
        $('learnTable').querySelector('tbody').innerHTML = self.rows(d).map(function (r) {
          return '<tr data-k="' + S.esc(r[2]) + '"><td>' + S.esc(r[0]) + '</td><td class="num">' + (r[1] || 0) + '</td></tr>';
        }).join('');
      }).catch(function (e) {
        // a server from before this panel: said, not an error to act on
        $('learnStat').textContent = e && e.status === 404 ? 'Сервер ещё не обновлён — раздел появится после обновления.' : S.pbErr(e);
      });
    },

    text: function () {
      if (!this.data) return '';
      return this.rows(this.data).map(function (r) { return r[2] + ' = ' + (r[1] || 0); }).join('\n');
    },

    init: function () {
      var self = this;
      if (this.inited || !$('learnPanel')) return;
      this.inited = true;
      $('learnRefresh').addEventListener('click', function () { self.load(); });
      $('learnCopy').addEventListener('click', function () {
        var t = self.text();
        var done = function () { $('learnStat').textContent = 'Скопировано: ' + t.split('\n').length + ' строк чисел.'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { window.prompt('Скопируйте:', t); });
        else window.prompt('Скопируйте:', t);
      });
      document.addEventListener('auth:signedin', function () { self.load(); });
      if (S.pb.authStore.isValid) this.load();
    }
  };

  S.LearningAdmin = L;
  document.addEventListener('DOMContentLoaded', function () { L.init(); });
  if (document.readyState !== 'loading') L.init();
})(S);
