/*
 * Admin page: «Обучение» → «Набор для обучения» (docs/ai-reja.md, phase 3).
 *
 * «Собрать и измерить»: every price of the finished applications (price_memory) is asked of the reference again, as
 * of its application's date, in the reference worker — the same one the working page uses, with the same package —
 * and what the program suggests today is compared with what the expert decided (S.ml.dataset). Nothing leaves this
 * browser. The page shows counts and metrics only; «Скопировать числа» gives them as text with no name and no price
 * in it. «Сохранить набор в файл» writes the dataset itself (feature numbers and labels, no names, no prices) to a
 * file the owner keeps where he likes — never in the program's repository.
 *
 * A hand-labelled list («проверочный список») can be loaded: JSON [{ name, unit, region, asof, price | rid | none }]
 * or a table with the columns Наименование · Ед. · Регион · Дата · Цена. It stays in this browser (localStorage),
 * is measured apart, and never trains anything.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;
  function $(id) { return document.getElementById(id); }

  var GOLD_KEY = 'smeta.ml.gold', SUM_KEY = 'smeta.ml.summary', GOLD_MAX = 2000, IDLE_MS = 5 * 60 * 1000;
  var FIELDS = 'workspace,contragent,region,name,unit,section,match_key,match_unit_key,smeta_price,final_price,kind,source,asof,finished,accepted';
  var PHASE = { cache: 'Справочник: проверяем сохранённую копию…', download: 'Справочник: получаем…', unpack: 'Справочник: распаковываем…',
    check: 'Справочник: проверяем…', derive: 'Справочник: готовим…', store: 'Справочник: сохраняем…', index: 'Справочник: строим указатель…' };

  var PART = { test: 'проверочная часть (новейшие заявки)', train: 'учебная часть', all: 'все заявки', test_seen: 'проверочная часть · названия встречались раньше',
    test_unseen: 'проверочная часть · новые названия', gold: 'проверочный список' };
  var METRIC = { n_pos: 'вопросов, где правильная строка есть', n_none: 'вопросов, где ни одна строка не подошла', n_left: 'оставленных сметных цен (строка была ниже)',
    p1: 'первая строка — та, что выбрал эксперт', r3: 'правильная строка среди первых трёх', mrr: 'средняя обратная позиция правильной строки',
    abstention: 'программа промолчала, когда ни одна строка не подходила', ece: 'ошибка уверенности', price_err: 'медианное расхождение первой строки с ценой эксперта' };
  var LABEL = {
    schema: 'Схема признаков', rows: 'Цен завершённых заявок', applications: 'Заявок', 'applications.train': '— учебная часть', 'applications.test': '— проверочная часть (новейшие, на них ничего не учится)',
    queries: 'Вопросов к справочнику, пригодных для обучения', 'queries.ref': '— цена применена из справочника', 'queries.near': '— цена введена вручную и совпала со строкой справочника',
    'queries.none': '— цена введена вручную, ни одна строка не подошла', 'queries.left': '— сметная цена оставлена, хотя строка была ниже',
    'queries.accepted_by_contractor': '— из них: изменённая цена принята подрядчиком',
    'skipped.above': 'Не вошло: сметная цена оставлена, все строки выше неё', 'skipped.pct': 'Не вошло: «Применить %»', 'skipped.zeroed': 'Не вошло: ресурс обнулён',
    'skipped.empty': 'Не вошло: в справочнике нет ни одной строки', 'skipped.empty_corrected': '— из них: цена была изменена', 'skipped.lost': 'Не вошло: применённой записи нет в нынешнем пакете',
    'section.labor': 'Раздел: труд', 'section.machines': 'Раздел: машины', 'section.transport': 'Раздел: перевозка', 'section.materials': 'Раздел: материалы', 'section.equipment': 'Раздел: оборудование',
    'lines.median': 'Строк на вопрос (медиана)', 'lines.max': 'Строк на вопрос (наибольшее)', 'p3.conf_from': 'Уверенность оценена по', 'p3.rank': 'Место правильной строки: 1 2 3 4 5 6'
  };
  /* the price model: what is proposed for a resource, three ways, measured on the newest applications */
  var PRICE = { 'price.schema': 'схема признаков', 'price.rows': 'цен завершённых заявок', 'price.applications': 'заявок', 'price.applications.test': 'заявок в проверочной части',
    'price.items': 'ресурсов, о которых что-то известно заранее', 'price.items.corrected': '— цена снижена экспертом', 'price.items.accepted': '— сметная цена принята',
    'price.anchor.memory': 'опора: ваша прежняя цена этого ресурса', 'price.anchor.reference': 'опора: строка справочника', 'price.anchor.accepted': 'опора: ранее принятая сметная цена',
    'price.skipped.struck': 'не вошло: ресурс обнулён', 'price.skipped.pct': 'не вошло: «Применить %»', 'price.skipped.nodate': 'не вошло: нет даты заявки',
    'price.skipped.noevidence': 'не вошло: о ресурсе ничего не известно (нет ни прежних цен, ни строки справочника)',
    'price.skipped.noevidence_price': '— из них: цена была снижена', 'price.skipped.noevidence_price_other_region': '— — из них: прежняя цена есть в другом регионе',
    'price.validation': 'подбор порога', 'price.model.steps': 'шагов обучения' };
  var PBY = { mem: 'ваша прежняя цена', ref: 'строка справочника', acc: 'ранее принятая сметная цена' };
  var PWAY = { ref: 'по строке справочника', anchor: 'по прежней цене, иначе по справочнику', model: 'с обученной поправкой' };
  var PMET = { tau: 'порог: сметная цена выше предложенной более чем на (доля)', selected: 'выбран (1 — да)', n: 'ресурсов в проверочной части',
    lowered: 'из них снижено экспертом', flagged: 'отмечено программой как завышенные', precision: 'из отмеченных — действительно снижены экспертом',
    recall: 'из сниженных экспертом — отмечены', alarm: 'из принятых экспертом цен — отмечены зря', coverage: 'из сниженных — для скольких есть предложение',
    price_err: 'медианное расхождение предложенной цены с ценой эксперта' };
  var TIER = { '0': '«Ставка по таблице»', '1': '«Документ»', '1.5': '«Оценка»', '2': '«Похожий»', '2.5': '«Похожий» (другая единица)' };
  var SPLIT = { train: 'учебная часть', test: 'проверочная часть', gold: 'проверочный список' };
  function labelOf(k) {
    if (LABEL[k]) return LABEL[k];
    var m = /^p3\.tier\.(.+)$/.exec(k);
    if (m) return 'Сейчас · первая строка уровня ' + (TIER[m[1]] || m[1]) + ': верно / всего';
    m = /^p3\.([a-z_]+)\.([a-z0-9_]+)$/.exec(k);
    if (m && PART[m[1]] && METRIC[m[2]]) return 'Сейчас · ' + PART[m[1]] + ' · ' + METRIC[m[2]];
    m = /^queries\.[a-z]+\.([a-z]+)$/.exec(k);
    if (m && SPLIT[m[1]]) return '— — ' + SPLIT[m[1]];
    if (PRICE[k]) return 'Модель цен · ' + PRICE[k];
    m = /^price\.(ref|anchor|model)\.(?:test\.)?([a-z_]+)$/.exec(k);
    if (m && PWAY[m[1]] && PMET[m[2]]) return 'Модель цен · ' + PWAY[m[1]] + ' · ' + PMET[m[2]];
    m = /^price\.(anchor|model)\.by_(mem|ref|acc)$/.exec(k);
    if (m) return 'Модель цен · ' + PWAY[m[1]] + ' · отдельно, когда опора — ' + PBY[m[2]];
    return 'Прочее: ' + k;
  }

  var D = {
    worker: null, busy: false, summary: null, idleT: null, waitDs: null,

    stat: function (t) { $('dsStat').textContent = t || ''; },
    err: function (t) { var e = $('dsErr'); e.textContent = t || ''; e.hidden = !t; },
    progress: function (text, pct) {
      var p = $('dsProgress');
      p.hidden = text == null;
      if (text == null) return;
      p.querySelector('span').textContent = text;
      p.querySelector('.bar-fill').style.width = (pct == null ? 100 : Math.max(2, Math.min(100, pct))) + '%';
    },

    /* ------------------------------------------------------------------ the hand-labelled list */
    gold: function () {
      try { var g = JSON.parse(localStorage.getItem(GOLD_KEY) || '[]'); return Array.isArray(g) ? g : []; } catch (e) { return []; }
    },
    paintGold: function () {
      var n = this.gold().length;
      $('dsGoldDrop').hidden = !n;
      $('dsGoldStat').textContent = n ? 'Проверочный список: ' + n + ' строк (хранится в этом браузере).' : '';
    },
    /** A JSON array, or the first sheet of a table: the header row names the columns. → rows, or throws (Russian). */
    readGold: function (name, buf) {
      var rows;
      if (/\.json$/i.test(name)) {
        try { rows = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { throw new Error('Файл не читается как JSON'); }
        if (!Array.isArray(rows)) throw new Error('В файле должен быть список строк');
      } else {
        if (typeof XLSX === 'undefined') throw new Error('Таблицы в этом браузере не читаются — сохраните список как JSON');
        var wb = XLSX.read(buf, { type: 'array', cellDates: true });
        var grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
        var head = -1, col = {};
        var RE = { name: /наимен|name/i, unit: /^ед|unit/i, region: /регион|region/i, asof: /дата|date|asof/i, price: /цена|price/i, rid: /^rid$|запис/i,
          none: /нет подход|none/i, section: /раздел|section/i };
        for (var r = 0; r < Math.min(grid.length, 20) && head < 0; r++) {
          var c = {};
          (grid[r] || []).forEach(function (v, i) { Object.keys(RE).forEach(function (k) { if (c[k] == null && v != null && RE[k].test(String(v))) c[k] = i; }); });
          if (c.name != null && c.unit != null) { head = r; col = c; }
        }
        if (head < 0) throw new Error('В таблице не найдена строка заголовков (нужны столбцы «Наименование» и «Ед.»)');
        rows = grid.slice(head + 1).map(function (g) {
          var o = {};
          Object.keys(col).forEach(function (k) { o[k] = g[col[k]]; });
          return o;
        });
      }
      var byLabel = {};
      (S.REGIONS || []).forEach(function (x) { byLabel[String(x[1]).toLowerCase()] = x[0]; byLabel[x[0]] = x[0]; });
      var out = [], bad = 0;
      rows.forEach(function (g) {
        if (!g || g.name == null || String(g.name).trim() === '') return;
        var d = g.asof instanceof Date ? new Date(g.asof.getTime() - g.asof.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : String(g.asof || '').trim();
        var m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d);
        if (m) d = m[3] + '-' + m[2] + '-' + m[1];
        var region = byLabel[String(g.region || '').trim().toLowerCase()];
        var price = typeof g.price === 'number' ? g.price : S.num ? S.num(g.price) : parseFloat(g.price);
        var none = g.none === true || /^(да|yes|true|1|\+)$/i.test(String(g.none == null ? '' : g.none).trim());
        var rid = g.rid != null && /^\d+$/.test(String(g.rid).trim()) ? +g.rid : null;
        if (!region || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !(none || rid != null || price > 0)) { bad++; return; }
        out.push({ name: String(g.name).trim().slice(0, 500), unit: String(g.unit == null ? '' : g.unit).trim().slice(0, 40), region: region, asof: d,
          section: g.section ? String(g.section).trim() : '', price: price > 0 ? price : 0, rid: rid, none: none });
      });
      if (!out.length) throw new Error('В списке нет ни одной пригодной строки (нужны наименование, ед., регион, дата и цена)');
      if (out.length > GOLD_MAX) throw new Error('В списке больше ' + GOLD_MAX + ' строк');
      return { rows: out, bad: bad };
    },
    loadGold: function (file) {
      var self = this;
      this.err('');
      file.arrayBuffer().then(function (buf) {
        var g = self.readGold(file.name, buf);
        localStorage.setItem(GOLD_KEY, JSON.stringify(g.rows));
        self.paintGold();
        self.stat('Проверочный список загружен: ' + g.rows.length + ' строк' + (g.bad ? ', пропущено ' + g.bad : '') + '. Нажмите «Собрать и измерить».');
      }).catch(function (e) { self.err(e && e.message ? e.message : 'Список не прочитан'); });
    },

    /* ------------------------------------------------------------------ the worker */
    kill: function () {
      clearTimeout(this.idleT);
      if (this.worker) { try { this.worker.terminate(); } catch (e) { /* gone */ } }
      this.worker = null; this.ready = null;
    },
    idle: function () {
      var self = this;
      clearTimeout(this.idleT);
      this.idleT = setTimeout(function () { if (!self.busy) self.kill(); }, IDLE_MS);
    },
    /** The reference worker with the active package open. → Promise<worker> */
    open: function () {
      var self = this;
      if (this.worker && this.ready) return this.ready;
      this.kill();
      this.ready = S.pb.collection('ref_packages').getList(1, 1, {
        filter: 'active = true', fields: 'id,collectionId,collectionName,package_id,sha256,file,records', requestKey: null
      }).then(function (res) {
        var rec = res.items[0];
        if (!rec) throw new Error('Нет активного справочника — загрузите пакет в разделе «Справочные цены».');
        if (!window.__REFS_WORKER_SRC__ || typeof Worker === 'undefined') throw new Error('Справочник недоступен в этом браузере');
        var w = new Worker(URL.createObjectURL(new Blob([window.__REFS_WORKER_SRC__], { type: 'text/javascript' })));
        self.worker = w; self.pkg = rec.package_id;
        return S.fileURL(rec, rec.file).then(function (url) {
          return new Promise(function (resolve, reject) {
            w.onerror = function (e) { e.preventDefault(); reject(new Error('Ошибка справочника')); };
            w.onmessage = function (e) {
              var m = e.data || {};
              if (m.type === 'progress') self.progress(PHASE[m.phase] || 'Справочник…', m.total ? m.done / m.total * 100 : null);
              else if (m.type === 'error') reject(new Error(m.message || 'Справочник не подготовлен'));
              else if (m.type === 'ready') { w.onmessage = function (ev) { self.onMessage(ev.data || {}); }; resolve(w); }
            };
            w.postMessage({ cmd: 'open', pkgs: [{ id: rec.id, package_id: rec.package_id, sha256: rec.sha256, url: url, records: rec.records }] });
          });
        });
      });
      this.ready.catch(function () { self.kill(); });
      return this.ready;
    },
    onMessage: function (m) {
      if (m.type === 'replay-progress' && m.phase === 'model') this.progress('Обучаем и проверяем модель цен…');
      else if (m.type === 'replay-progress') this.progress('Спрашиваем справочник: ' + m.done + ' из ' + m.total, m.total ? m.done / m.total * 100 : null);
      else if (m.type === 'replay' && this.waitRun) { var w = this.waitRun; this.waitRun = null; if (m.error) w.reject(new Error(m.error)); else w.resolve(m); }
      else if (m.type === 'dataset' && this.waitDs) { var d = this.waitDs; this.waitDs = null; if (m.dataset) d.resolve(m.dataset); else d.reject(new Error('Набор не собран')); }
    },

    /* ------------------------------------------------------------------ build and measure */
    run: function () {
      var self = this;
      if (this.busy) return Promise.resolve();
      this.busy = true; this.err(''); this.stat('');
      $('dsBuild').disabled = true;
      this.progress('Читаем цены завершённых заявок…');
      return S.pb.collection('price_memory').getFullList({ batch: 500, fields: FIELDS, sort: 'finished', requestKey: null }).then(function (rows) {
        if (!rows.length && !self.gold().length) throw new Error('Пока нет ни одной завершённой заявки с запомненными ценами — завершите заявку кнопкой «✓ Завершить».');
        self.progress('Справочник…');
        return self.open().then(function (w) {
          return new Promise(function (resolve, reject) {
            self.waitRun = { resolve: resolve, reject: reject };
            w.postMessage({ cmd: 'replay', rows: rows, gold: self.gold(), now: new Date().toISOString() });
          });
        });
      }).then(function (m) {
        self.summary = m.summary;
        try { localStorage.setItem(SUM_KEY, JSON.stringify({ at: new Date().toISOString(), rows: m.summary })); } catch (e) { /* shown anyway */ }
        self.paint(m.summary, 'Готово за ' + Math.max(1, Math.round(m.ms / 1000)) + ' с. В числах нет ни названий, ни цен.');
      }).catch(function (e) {
        self.err(e && /[А-Яа-я]/.test(e.message || '') ? e.message : (e && e.status != null ? S.pbErr(e) : 'Набор не собран'));
      }).then(function () {
        self.busy = false; self.progress(null);
        $('dsBuild').disabled = false;
        self.idle();
      });
    },

    paint: function (rows, note) {
      var main = (rows || []).filter(function (r) { return !/^lift\.|^price\.w\./.test(r[0]); });
      $('dsTable').hidden = !main.length;
      $('dsTable').querySelector('tbody').innerHTML = main.map(function (r) {
        return '<tr data-k="' + S.esc(r[0]) + '"><td>' + S.esc(labelOf(r[0])) + '</td><td class="num">' + S.esc(String(r[1])) + '</td></tr>';
      }).join('');
      $('dsCopy').disabled = !main.length;
      $('dsSave').disabled = !main.length;
      this.stat(note || '');
    },

    text: function () { return (this.summary || []).map(function (r) { return r[0] + ' = ' + r[1]; }).join('\n'); },

    /** The dataset itself, to a file: from the worker if it still holds it, else built again first. */
    save: function () {
      var self = this;
      var ask = function () {
        return new Promise(function (resolve, reject) {
          if (!self.worker) { reject(new Error('gone')); return; }
          self.waitDs = { resolve: resolve, reject: reject };
          self.worker.postMessage({ cmd: 'dataset' });
        });
      };
      this.err('');
      ask().catch(function () { return self.run().then(ask); }).then(function (ds) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(ds)], { type: 'application/json' }));
        a.download = 'taqqoslash-' + new Date().toISOString().slice(0, 10) + '.dataset.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 6e4);
        self.stat('Набор сохранён в файл ' + a.download + '. Храните его у себя — не в папке программы.');
      }).catch(function () { self.err('Набор не сохранён — соберите его заново.'); });
    },

    init: function () {
      var self = this;
      if (this.inited || !$('dsBuild')) return;
      this.inited = true;
      $('dsBuild').addEventListener('click', function () { self.run(); });
      $('dsCopy').addEventListener('click', function () {
        var t = self.text();
        var done = function () { self.stat('Скопировано: ' + t.split('\n').length + ' строк чисел.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { window.prompt('Скопируйте:', t); });
        else window.prompt('Скопируйте:', t);
      });
      $('dsSave').addEventListener('click', function () { self.save(); });
      $('dsGold').addEventListener('change', function () { if (this.files[0]) self.loadGold(this.files[0]); this.value = ''; });
      $('dsGoldDrop').addEventListener('click', function () {
        if (!window.confirm('Убрать проверочный список из этого браузера?')) return;
        localStorage.removeItem(GOLD_KEY); self.paintGold(); self.stat('Проверочный список убран.');
      });
      this.paintGold();
      try {
        var last = JSON.parse(localStorage.getItem(SUM_KEY) || 'null');
        if (last && Array.isArray(last.rows) && last.rows.length) {
          this.summary = last.rows;
          this.paint(last.rows, 'Последний расчёт: ' + String(last.at || '').slice(0, 10) + '.');
        }
      } catch (e) { /* nothing kept */ }
      document.addEventListener('auth:signedout', function () { self.kill(); });
    }
  };

  S.DatasetAdmin = D;
  document.addEventListener('DOMContentLoaded', function () { D.init(); });
  if (document.readyState !== 'loading') D.init();
})(S);
