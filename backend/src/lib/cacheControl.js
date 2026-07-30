export function setPrivateNoStore(res) {
  res.set("Cache-Control", "private, no-store");
  res.vary("Cookie");
}
