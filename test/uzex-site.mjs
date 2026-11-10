/*
 * A stand-in for uzex.uz/WeeklyQuotes, for tests: the same markup the exchange's page has (one table, the week list
 * in <select id="ImportId">, cells with numeric entities and no-break spaces), filled with invented goods and prices.
 * The sync is pointed at it with UZEX_BASE.
 *
 *   const site = await startSite(8145);
 *   site.weeks       the weeks it lists (edit freely: push a week, change rows)
 *   site.mode        'ok' | 'down' (503) | 'uz' (another language) | 'stuck' (always shows the newest week)
 *   site.hits        requests answered, by importId ('' for the list)
 *   site.stop()
 */
import { createServer } from 'node:http';

const ent = (s) => String(s).replace(/[^\x20-\x7E]/g, (c) => '&#x' + c.codePointAt(0).toString(16).toUpperCase() + ';')
  .replace(/'/g, '&#x27;');
const money = (v) => {
  const [i, f] = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+$)/g, ' ') + ',' + f;
};
const day = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);

/** A row: [name, price, change, from, to]; from/to default to the week's own period. */
export function week(id, from, to, market, rows) {
  return { id, from, to, market, rows };
}

/** Invented goods that cover every kind of name the parser tells apart. */
export function sampleRows(prev) {
  return [
    ['Тестовый битум ТБ 90/60', 1234.5, -65.5],
    ['Тестовый битум ТБ 40/60 (Форвард)', 1100, -10],
    ['Тестовый цемент ТЦ-400 (в мешках)', 700, 0, prev && prev[0], prev && prev[1]],   // last quoted a week earlier
    ['Тестовый цемент ТЦ-400 (навал)', 650, 12.25],
    ['Тестовое масло ТМ-8 (литр)', 21, 0],
    ['Тестовая труба ТТ 57х3 (метр)', 33, 1],
    ['Тестовый лист 5х1500 ст.Т1 (ТЕСТ 321)', 9000, 0],
    ['Тестовый газ (импорт) (доллар США) (Форвард)', 820, 0],
    ['Тестовый растворитель ТР-4 (литр) (импорт) (доллар США)', 3, 0],
    ['Тестовая проволока ТП-1,2', 5000, 250]
  ];
}

function page(site, shown, lang) {
  const ru = lang !== 'uz';
  const head = ru ? ['№', 'Наименование товара', 'Текущая цена', 'Изменение цены', 'Изменение, %', 'Дата начала', 'Дата окончания']
    : ['№', 'Tovar nomi', 'Joriy narx', "Narx o'zgarishi", "O'zgarish, %", 'Boshlanish sanasi', 'Tugash sanasi'];
  const opts = site.weeks.map((w) => `<option value="${w.id}"${w.id === shown.id ? ' selected="selected"' : ''}>` +
    ent(`${day(w.from)} - ${day(w.to)} (${ru ? (w.market === 'export' ? 'Экспортные' : 'Внутренние') : (w.market === 'export' ? 'Eksport' : 'Ichki')})`) +
    '</option>').join('\n');
  const rows = shown.rows.map((r, i) => {
    const cut = site.mode === 'broken' && i === 2;
    const pct = r[1] - r[2] ? Math.abs(r[2] / (r[1] - r[2]) * 100) : 0;
    const cls = r[2] < 0 ? 'price-change--down' : r[2] > 0 ? 'price-change--up' : '';
    return `<tr>
      <td>${i + 1}</td>
      <td>${ent(r[0])}</td>
      <td class="text-nowrap">${ent(money(r[1]))}</td>
      <td>
        <div class="price-change ${cls}">
          ${cls ? '<span class="price-arrow"><i class="fas fa-caret-up"></i></span>' : ''}
          <span>${ent(money(r[2]))}</span>
        </div>
      </td>
      ${cut ? '' : `<td>${ent(money(pct))}%</td>`}
      <td>${day(r[3] || shown.from)}</td>
      <td>${day(r[4] || shown.to)}</td>
    </tr>`;
  }).join('\n');
  return `<!doctype html><html lang="${ru ? 'ru' : 'uz'}"><head><meta charset="utf-8"><title>WeeklyQuotes</title></head><body>
<form><select class="form-control form-control-sm import-select" onchange="this.form.submit()" id="ImportId" name="ImportId">
${opts}
</select></form>
<table class="table table-bordered custom-table-dark table-row-bg">
<thead><tr>${head.map((h) => `<th class="col">${ent(h)}</th>`).join('')}</tr></thead>
<tbody>
${rows}
</tbody>
</table></body></html>`;
}

export async function startSite(port) {
  const site = {
    port, base: `http://127.0.0.1:${port}`, mode: 'ok', hits: {},
    weeks: [
      week(204, '2031-03-10', '2031-03-14', 'internal', sampleRows(['2031-03-03', '2031-03-07'])),
      week(205, '2031-03-10', '2031-03-14', 'export', [['Тестовый кокс', 190.03, 0.03], ['Тестовый шрот 1 сорт', 405, -65]]),
      week(200, '2031-03-03', '2031-03-07', 'internal', sampleRows().map((r) => [r[0], r[1] + 100, r[2]])),
      week(201, '2031-03-03', '2031-03-07', 'export', [['Тестовый кокс', 190, 0]])
    ]
  };
  const server = createServer((req, res) => {
    const u = new URL(req.url, site.base);
    if (u.pathname !== '/WeeklyQuotes') { res.writeHead(404); res.end('not found'); return; }
    const id = u.searchParams.get('importId') || '';
    site.hits[id] = (site.hits[id] || 0) + 1;
    if (site.mode === 'down') { res.writeHead(503); res.end('Service Unavailable'); return; }
    // the real site ignores the language cookie when the query names a culture, and answers an unknown week with the newest
    const lang = site.mode === 'uz' ? 'uz' : (u.searchParams.get('culture') === 'ru' && u.searchParams.get('ui-culture') === 'ru' ? 'ru' : 'uz');
    const want = site.mode === 'stuck' ? null : site.weeks.find((w) => String(w.id) === id);
    const body = page(site, want || site.weeks[0], lang);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  site.stop = () => server.close();
  return site;
}
