const MAX_BYTES = 3 * 1024 * 1024;

/** Scarica un feed RSS dal server, con timeout e limite di dimensione. */
export async function fetchFeed(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Indirizzo non valido");
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NotizieChiare/1.0; +rss reader)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
    },
  });
  if (!res.ok) throw new Error(`Feed ${res.status}`);
  if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new Error("Feed troppo grande");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("Feed troppo grande");
  return text;
}
