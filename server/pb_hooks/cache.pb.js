/// <reference path="../pb_data/types.d.ts" />
/*
 * The pages are always asked for afresh.
 *
 * PocketBase serves pb_public with a Last-Modified date and nothing else, and
 * a browser that sees no Cache-Control works out its own freshness from that
 * date — a tenth of the file's age. After an update the old page went on being
 * shown from the cache: on Windows the files come out of a ZIP with the
 * commit's date, so a page "modified" days ago was trusted for hours, and the
 * new version — no login, in this case — simply did not appear.
 *
 * no-cache still lets the browser keep a copy; it only has to ask whether it
 * changed, and an unchanged page costs one 304.
 */
routerUse((e) => {
  const path = e.request.url.path;
  if (!path.startsWith("/api/") && !path.startsWith("/_/")) {
    e.response.header().set("Cache-Control", "no-cache");
  }
  return e.next();
});
