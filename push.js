// Web-Push ohne Fremdbibliothek: Nachricht verschlüsseln (RFC 8291, aes128gcm)
// und beim Push-Dienst (Apple, Google, Mozilla) mit VAPID-Signatur (RFC 8292) abliefern.

const te = new TextEncoder();

export const b64u = {
  enc(buf) {
    let s = '';
    for (const x of new Uint8Array(buf)) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  },
};

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// Nur echte Push-Dienste anschreiben, keine beliebigen Adressen.
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

// Prüft ein vom Browser geliefertes Abo (PushSubscription.toJSON()).
export function cleanSubscription(sub) {
  if (!sub || typeof sub !== 'object') return null;
  let url;
  try { url = new URL(String(sub.endpoint)); } catch { return null; }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some(re => re.test(url.hostname)) || url.href.length > 1000) return null;
  try {
    const p256dh = String(sub.keys?.p256dh ?? ''), auth = String(sub.keys?.auth ?? '');
    if (b64u.dec(p256dh).length !== 65 || b64u.dec(auth).length !== 16) return null;
    return { endpoint: url.href, keys: { p256dh, auth } };
  } catch { return null; }
}

// Verschlüsselt die Nachricht für ein Abo. `test` erlaubt feste Schlüssel/Salt für den RFC-Testvektor.
export async function encryptPayload(sub, plaintext, test = {}) {
  const uaPublic = b64u.dec(sub.keys.p256dh);
  const authSecret = b64u.dec(sub.keys.auth);
  const asKeys = test.asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = test.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

let vapidCache = null;
async function vapidKeys(jwkJson) {
  if (vapidCache && vapidCache.src === jwkJson) return vapidCache;
  const jwk = JSON.parse(jwkJson);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const publicKey = b64u.enc(concat(new Uint8Array([4]), b64u.dec(jwk.x), b64u.dec(jwk.y)));
  vapidCache = { src: jwkJson, key, publicKey };
  return vapidCache;
}

// Öffentlicher Absender-Schlüssel, den der Browser beim Abonnieren braucht.
export async function vapidPublicKey(env) {
  if (!env.VAPID_PRIVATE_JWK) return null;
  return (await vapidKeys(env.VAPID_PRIVATE_JWK)).publicKey;
}

export async function vapidHeader(env, endpoint) {
  const { key, publicKey } = await vapidKeys(env.VAPID_PRIVATE_JWK);
  const head = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(te.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${publicKey}`;
}

// Schickt eine Mitteilung. Gibt den HTTP-Status des Push-Dienstes zurück (201 = angenommen).
export async function sendPush(env, sub, data, topic) {
  const body = await encryptPayload(sub, te.encode(JSON.stringify(data)));
  const headers = {
    Authorization: await vapidHeader(env, sub.endpoint),
    TTL: '86400',
    Urgency: 'high',
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
  };
  if (topic) headers.Topic = topic;
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body });
  return res.status;
}
