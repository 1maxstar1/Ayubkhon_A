/*
 * What the page says when the server refuses something (S.pbErr, src/lib/pb.js).
 *
 * It used to hand over whatever PocketBase wrote: «email: Value must be unique.» for a colleague who was already
 * on the list, «Failed to create record.» for a refusal with no detail, and «Нет доступа» in place of a hook's own
 * explanation. The interface is Russian (CLAUDE.md), so a field and a code are named in Russian, a hook's own
 * Russian text is passed on, and English with nothing behind it becomes a plain Russian sentence with the code.
 *
 * pb.js runs here in a sandbox with a stand-in for the PocketBase client; nothing is started.
 *
 *   node test/pb-err.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

class PocketBase {
  constructor(base) { this.base = base; this.authStore = { record: null, isSuperuser: false }; this.files = { getToken() { return Promise.resolve('t'); } }; }
  autoCancellation() {}
}
const warned = [];
const ctx = {
  S: {}, PocketBase, location: { origin: 'http://x', href: '' }, document: { addEventListener() {} },
  console: { warn: (...a) => warned.push(a.join(' ')), log() {}, error() {} }, Promise
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'pb.js'), 'utf8'), ctx, { filename: 'pb.js' });
const err = ctx.S.pbErr;
check(typeof err === 'function', 'S.pbErr is there once a PocketBase client is');

const latin = /[A-Za-z]{3,}/;
const field = (name, code, message, status) => ({ status: status || 400, message: 'Failed to create record.', response: { code: status || 400, message: 'Failed to create record.', data: { [name]: { code, message } } } });
const say = (e) => { const m = err(e); console.log('     → ' + m); return m; };

let m = say(field('email', 'validation_not_unique', 'Value must be unique.'));
check(/уже есть/.test(m) && !latin.test(m), 'an e-mail already on the list: said in Russian, no English left');
check(/Включить/.test(m), 'and it says where to look (a disabled colleague is switched back on, not added again)');

m = say(field('name', 'validation_required', 'Cannot be blank.'));
check(/^Имя: не заполнено$/.test(m), 'a required field left empty is named and explained');

m = say(field('number', 'validation_not_unique', 'Value must be unique.'));
check(/^Номер заявки: такое значение уже есть$/.test(m), 'another field that must be unique');

m = say(field('email', 'validation_is_email', 'Must be a valid email address.'));
check(/неверный адрес почты/.test(m) && !latin.test(m), 'an address that is no address');

m = say(field('name', 'validation_length_out_of_range', 'The length must be between 1 and 100.'));
check(/^Имя: слишком длинное/.test(m), 'a value too long');

m = say(field('zzz_field', 'validation_something_new', 'Something new.'));
check(m === 'неверное значение', 'an unknown field and an unknown code: no raw name, no English — «неверное значение»');

m = say({ status: 400, message: 'Слишком много строк за один запрос: 9 (не больше 5)', response: { message: 'Слишком много строк за один запрос: 9 (не больше 5)', data: {} } });
check(/^Слишком много строк/.test(m), "a hook's own Russian text is passed on as it is");

warned.length = 0;
m = say({ status: 400, message: 'Failed to create record.', response: { message: 'Failed to create record.', data: {} } });
check(/код 400/.test(m) && !latin.test(m), 'English with nothing behind it: a Russian sentence with the code');
check(warned.some((w) => /Failed to create record/.test(w)), 'and the English goes to the console, not lost');

m = say({ status: 403, message: 'Только администратор', response: { message: 'Только администратор', data: {} } });
check(m === 'Только администратор', 'a refusal for rights that the hook explained keeps its explanation');

m = say({ status: 403, message: 'The authorized record is not allowed to perform this action.', response: { data: {} } });
check(m === 'Нет доступа', 'a bare refusal for rights is still «Нет доступа»');
m = say({ status: 401, message: 'The request requires valid record authorization token.' });
check(m === 'Нет доступа', 'and so is a missing sign-in');

m = say({ status: 404, message: 'Рабочая область не найдена', response: { data: {} } });
check(m === 'Рабочая область не найдена', "a hook's «не найдено» keeps what was not found");
m = say({ status: 404, message: "The requested resource wasn't found.", response: { data: {} } });
check(m === 'Не найдено', 'a bare 404 is «Не найдено»');

m = say({ status: 500, message: 'Something went wrong while processing your request.', response: { data: {} } });
check(/код 500/.test(m) && !latin.test(m), 'a server fault is said in Russian, with the code');

m = say({ status: 429, message: 'Too Many Requests.', response: { data: {} } });
check(/подождите/.test(m) && !latin.test(m), 'too many requests: wait');

check(say({ status: 0, message: 'Failed to fetch' }) === 'Нет связи с сервером', 'no connection');
check(say(null) === 'Неизвестная ошибка', 'nothing at all');
check(say(new Error('Файл не прочитан')) === 'Файл не прочитан', 'an error of our own (no HTTP status) keeps its text');

console.log(fail ? `FAILED (${fail})` : 'pb-err OK');
process.exit(fail ? 1 : 0);
