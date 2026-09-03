/*
 * Where to find Chromium. The dev container ships one at a fixed path; on a
 * laptop Playwright resolves its own (npx playwright install chromium).
 */
import { existsSync } from 'node:fs';

const BUNDLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const launchOpts = existsSync(BUNDLED)
  ? { executablePath: BUNDLED, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] };
