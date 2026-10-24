// Shared by the laptop routes (dev-otp.pb.js, laptop.pb.js), loaded with
// require() because each handler runs in its own VM.
module.exports = {
  /**
   * Is this the program's own page, on this computer?
   *
   * «Nobody else uses this computer» is not the whole of it. The server
   * listens on 127.0.0.1, and every web page open in the browser can send a
   * request there — PocketBase answers any origin, so a page on some other site
   * could ask for a sign-in and read the answer. Three checks shut that out:
   *   · the connection comes from this machine (remoteIP is the socket's peer,
   *     not a header anybody can write);
   *   · it was addressed to this machine by that name — a site whose domain
   *     has been pointed at 127.0.0.1 still sends its own name as the Host;
   *   · a browser that says where the request comes from (Origin, which a page
   *     cannot change) says it comes from this very address.
   * The program's own page passes all three; a page anywhere else fails one.
   */
  ownPage(e) {
    const ip = e.remoteIP();
    if (ip !== "127.0.0.1" && ip !== "::1") return false;
    const host = String(e.request.host || "");
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return false;
    const origin = String(e.request.header.get("Origin") || "");
    if (origin && origin !== "http://" + host) return false;
    return true;
  },
};
