/*
 * Where to find Chromium. The dev container ships one at a fixed path; on a
 * laptop Playwright resolves its own (npx playwright install chromium).
 *
 * Chromium on Linux turns a file path into a file through the locale's
 * encoding. In a container without a locale (LANG unset: the C locale) a path
 * with a non-ASCII character — every smeta named in Cyrillic — reaches the page
 * as no file at all, and a test that loads it waits out its timeout as if the
 * program had failed. Such a run hands the browser a UTF-8 locale.
 */
import { existsSync } from 'node:fs';

const BUNDLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LOCALE = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '';
const env = process.platform === 'linux' && !/utf-?8/i.test(LOCALE)
  ? { env: { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' } }
  : {};
export const launchOpts = existsSync(BUNDLED)
  ? { executablePath: BUNDLED, args: ['--no-sandbox'], ...env }
  : { args: ['--no-sandbox'], ...env };
