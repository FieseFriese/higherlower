// Higher or Lower – Online-Duell
// Der Worker liefert die statischen Dateien aus dist/ und betreibt pro Spielcode
// einen Duell-Raum (Durable Object). Der Raum hält den Spielstand und prüft die
// Züge; Kartenwerte verlassen den Server erst, wenn eine Karte richtig liegt.

import { DurableObject } from 'cloudflare:workers';
import { cleanSubscription, sendPush, vapidPublicKey } from './push.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;
const ROOM_TTL_MS = 48 * 60 * 60 * 1000; // Räume nach 48 h Ruhe löschen
const MAX_TEMPLATE_BYTES = 800_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, b => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

function cleanText(v, max) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanToken(v) {
  const t = String(v ?? '');
  return /^[A-Za-z0-9-]{16,64}$/.test(t) ? t : null;
}

// Prüft eine vom Client gesendete Vorlage und bringt sie in ein festes Format.
function cleanTemplate(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) throw new Error('Vorlage fehlt.');
  const entries = [];
  for (const e of raw.entries) {
    const name = cleanText(e?.name, 120);
    const value = typeof e?.value === 'number' ? e.value : Number(String(e?.value ?? '').replace(',', '.'));
    if (!name || !Number.isFinite(value)) continue;
    let img = '';
    const url = String(e?.imageUrl ?? '');
    const data = String(e?.imageData ?? '');
    if (/^https:\/\//i.test(url) && url.length <= 1000) img = url;
    else if (/^data:image\/(jpeg|png|webp|gif);base64,/i.test(data) && data.length <= 120_000) img = data;
    entries.push({ name, value, img });
    if (entries.length >= 100) break;
  }
  if (entries.length < 3) throw new Error('Die Vorlage braucht mindestens 3 vollständige Karten.');
  const sourceUrl = String(raw.sourceUrl ?? '');
  const tpl = {
    topic: cleanText(raw.topic, 120) || 'Higher or Lower',
    unit: cleanText(raw.unit, 40),
    source: cleanText(raw.source, 200),
    sourceUrl: /^https:\/\/[^\s"'<>]+$/i.test(sourceUrl) && sourceUrl.length <= 500 ? sourceUrl : '',
    entries,
  };
  if (JSON.stringify(tpl).length > MAX_TEMPLATE_BYTES) throw new Error('Die Vorlage ist zu groß (zu viele hochgeladene Bilder).');
  return tpl;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/duel' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Ungültige Anfrage.' }, 400); }
      let template;
      try { template = cleanTemplate(body.template); } catch (err) { return json({ error: err.message }, 400); }
      const token = cleanToken(body.token);
      if (!token) return json({ error: 'Ungültige Sitzung.' }, 400);
      const lives = Math.min(10, Math.max(1, parseInt(body.lives, 10) || 3));
      const name = cleanText(body.name, 24) || 'Spieler 1';

      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const stub = env.DUEL.get(env.DUEL.idFromName(code));
        const res = await stub.create({ code, template, lives, token, name });
        if (res.ok) return json({ code });
      }
      return json({ error: 'Kein freier Spielcode gefunden, bitte nochmal versuchen.' }, 503);
    }

    const m = url.pathname.match(/^\/api\/duel\/([A-Za-z0-9]{4})\/ws$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'Ungültiger Code.' }, 400);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket erwartet.' }, 426);
      const stub = env.DUEL.get(env.DUEL.idFromName(code));
      return stub.fetch(request);
    }

    if (url.pathname === '/api/push/key') {
      const key = await vapidPublicKey(env);
      return key ? json({ key }) : json({ error: 'Mitteilungen sind auf dem Server nicht eingerichtet.' }, 503);
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Nicht gefunden.' }, 404);
    return env.ASSETS.fetch(request);
  },
};

export class DuelRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    ctx.blockConcurrencyWhile(async () => {
      this.game = (await ctx.storage.get('game')) || null;
    });
  }

  async save() {
    this.game.touched = Date.now();
    await this.ctx.storage.put('game', this.game);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  async alarm() {
    if (this.game && Date.now() - (this.game.touched || 0) < ROOM_TTL_MS) {
      await this.ctx.storage.setAlarm(this.game.touched + ROOM_TTL_MS);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(4000, 'Duell abgelaufen'); } catch {}
    }
    this.game = null;
    await this.ctx.storage.deleteAll();
  }

  // Wird vom Worker beim Anlegen aufgerufen (RPC).
  async create({ code, template, lives, token, name }) {
    if (this.game) return { ok: false };
    this.game = {
      code,
      topic: template.topic,
      unit: template.unit,
      source: template.source,
      sourceUrl: template.sourceUrl,
      cards: template.entries.map((e, id) => ({ id, ...e })),
      lives,
      players: [{ token, name, lives }, null],
      phase: 'waiting',
      starter: 0,
      matchNo: 0,
      log: [],
    };
    await this.save();
    return { ok: true };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const token = cleanToken(url.searchParams.get('token'));
    const name = cleanText(url.searchParams.get('name'), 24);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const fail = (msg, code = 4004) => {
      server.send(JSON.stringify({ t: 'error', msg, fatal: true }));
      server.close(code, msg);
      return new Response(null, { status: 101, webSocket: client });
    };

    if (!this.game) return fail('Dieses Duell gibt es nicht (mehr). Code prüfen.');
    if (!token) return fail('Ungültige Sitzung.', 4001);

    const g = this.game;
    let seat = g.players.findIndex(p => p && p.token === token);
    if (seat === -1 && g.players[1]) {
      // Duell ist voll: Ein Spieler, der gerade offline ist, darf seinen Platz
      // auf einem neuen Gerät/Browser übernehmen (z. B. Safari statt Home-Bildschirm-App).
      const online = new Set(this.ctx.getWebSockets()
        .filter(ws => ws !== server && ws.readyState === 1)
        .map(ws => ws.deserializeAttachment()?.seat));
      const claim = Number(url.searchParams.get('claim'));
      if ((claim === 0 || claim === 1) && !online.has(claim)) {
        seat = claim;
        g.players[seat].token = token;
      } else {
        const free = [0, 1].filter(s => !online.has(s)).map(s => ({ seat: s, name: g.players[s].name }));
        server.send(JSON.stringify({ t: 'error', msg: 'Dieses Duell ist schon voll.', fatal: true, full: true, free }));
        server.close(4003, 'voll');
        return new Response(null, { status: 101, webSocket: client });
      }
    }
    let joined = false;
    if (seat === -1) {
      seat = 1;
      g.players[1] = { token, name: name || 'Spieler 2', lives: g.lives };
      if (g.players[1].name === g.players[0].name) g.players[1].name += ' 2';
      this.startMatch();
      joined = true;
    } else if (name && g.players[seat].name !== name) {
      g.players[seat].name = name;
    }

    // Andere Verbindungen desselben Spielers schließen (z. B. alter Tab).
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== server && ws.deserializeAttachment()?.seat === seat) {
        try { ws.close(4002, 'Neu verbunden'); } catch {}
      }
    }
    server.serializeAttachment({ seat, visible: true });
    await this.save();
    if (joined) {
      const n = g.players[1].name;
      this.notify(0, 'Dein Gegner ist da', n + ' ist beigetreten – ' + (g.turn === 0 ? 'du fängst an.' : n + ' fängt an.')).catch(() => {});
    }

    server.send(this.cardsMessage());
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const seat = ws.deserializeAttachment()?.seat;
    if (seat !== 0 && seat !== 1 || !this.game) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const g = this.game;

    if (msg.t === 'place') {
      if (g.phase !== 'playing') return;
      if (g.turn !== seat) return this.sendError(ws, 'Du bist nicht dran.');
      const pos = Number(msg.pos);
      if (!Number.isInteger(pos) || pos < 0 || pos > g.placed.length) return this.sendError(ws, 'Ungültige Position.');
      if (msg.card !== g.current) return; // veralteter Zug
      this.place(seat, pos);
      await this.save();
      this.broadcast();
      const other = 1 - seat, me = g.players[seat].name, l = g.last;
      if (g.phase === 'playing' && g.turn === other) {
        await this.notify(other, 'Du bist dran!', `${me} hat „${g.cards[l.card].name}“ ${l.correct ? 'richtig' : 'falsch'} gelegt.`);
      } else if (g.phase === 'over') {
        const result = g.winner === 'draw' ? 'Unentschieden!' : g.winner === other ? 'Du hast gewonnen! 🎉' : g.players[g.winner].name + ' hat gewonnen.';
        await this.notify(other, 'Duell vorbei', result + ' Tippe für die Revanche.');
      }
    } else if (msg.t === 'rematch') {
      if (g.phase !== 'over' || !g.players[1]) return;
      // Optional mit neuem Thema (Vorlage) und neuer Herzenzahl
      if (msg.template) {
        let tpl;
        try { tpl = cleanTemplate(msg.template); } catch (err) { return this.sendError(ws, err.message); }
        g.topic = tpl.topic; g.unit = tpl.unit; g.source = tpl.source; g.sourceUrl = tpl.sourceUrl;
        g.cards = tpl.entries.map((e, id) => ({ id, ...e }));
      }
      if (msg.lives !== undefined) g.lives = Math.min(10, Math.max(1, parseInt(msg.lives, 10) || g.lives));
      g.starter = 1 - g.starter;
      const me = g.players[seat].name;
      this.startMatch(me + ' hat eine Revanche gestartet: ' + g.topic + '.');
      await this.save();
      this.sendCards();
      this.broadcast();
      const other = 1 - seat;
      await this.notify(other, 'Revanche!', me + ' will eine Revanche (' + g.topic + ') – ' + (g.turn === other ? 'du fängst an.' : me + ' fängt an.'));
    } else if (msg.t === 'picking') {
      // Gegner informieren, dass gerade ein neues Thema gewählt wird
      if (g.phase !== 'over') return;
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && other.readyState === 1 && other.deserializeAttachment()?.seat === 1 - seat) {
          try { other.send(JSON.stringify({ t: 'info', msg: g.players[seat].name + ' wählt ein Thema für die Revanche …' })); } catch {}
        }
      }
    } else if (msg.t === 'push') {
      // Mitteilungen für diesen Spieler an- (Abo) oder abschalten (null)
      if (msg.sub === null) delete g.players[seat].push;
      else {
        const sub = cleanSubscription(msg.sub);
        if (!sub) return this.sendError(ws, 'Mitteilungen konnten nicht eingerichtet werden.');
        g.players[seat].push = sub;
      }
      await this.save();
      this.broadcast();
    } else if (msg.t === 'vis') {
      // Sichtbarkeit der App: Wer gerade hinschaut, bekommt keine Mitteilung
      ws.serializeAttachment({ ...ws.deserializeAttachment(), visible: !!msg.v });
    } else if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong' }));
    }
  }

  async webSocketClose() {
    this.broadcast();
  }

  async webSocketError() {
    this.broadcast();
  }

  // Mitteilung an einen Spieler, aber nur wenn er die App gerade nicht offen hat.
  async notify(seat, title, body) {
    const g = this.game;
    const p = g && g.players[seat];
    if (!p || !p.push || !this.env.VAPID_PRIVATE_JWK) return;
    const watching = this.ctx.getWebSockets().some(ws => {
      const a = ws.deserializeAttachment();
      return ws.readyState === 1 && a?.seat === seat && a.visible !== false;
    });
    if (watching) return;
    try {
      const status = await sendPush(this.env, p.push,
        { title, body, code: g.code, url: '/duell?c=' + g.code, tag: 'hl-' + g.code }, 'hl' + g.code);
      if (status === 404 || status === 410) { delete p.push; await this.save(); }
      else if (status >= 400) console.log('Push abgelehnt', status, new URL(p.push.endpoint).hostname);
    } catch (err) {
      console.log('Push fehlgeschlagen', err.message);
    }
  }

  cardsMessage() {
    const g = this.game;
    return JSON.stringify({ t: 'cards', topic: g.topic, unit: g.unit, source: g.source || '', sourceUrl: g.sourceUrl || '', cards: g.cards.map(c => ({ id: c.id, name: c.name, img: c.img })) });
  }

  sendCards() {
    const msg = this.cardsMessage();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === 1) { try { ws.send(msg); } catch {} }
    }
  }

  sendError(ws, msg) {
    ws.send(JSON.stringify({ t: 'error', msg }));
  }

  startMatch(note) {
    const g = this.game;
    const ids = shuffle(g.cards.map(c => c.id));
    const ref = ids.pop();
    g.placed = [ref];
    g.pool = ids;
    g.players.forEach(p => { if (p) p.lives = g.lives; });
    g.phase = 'playing';
    g.matchNo++;
    g.winner = null;
    g.last = null;
    g.round = { order: [g.starter, 1 - g.starter], idx: 0, losses: [] };
    g.roundNo = 1;
    g.turn = g.starter;
    g.current = g.pool.pop();
    g.log = [{ text: note || 'Das Duell beginnt. ' + g.players[g.starter].name + ' fängt an.' }];
  }

  value(id) {
    return this.game.cards[id].value;
  }

  // Ein Zug: aktuelle Karte an Position pos der (aufsteigend sortierten) Skala legen.
  place(seat, pos) {
    const g = this.game;
    const card = g.current;
    const v = this.value(card);
    const left = pos > 0 ? this.value(g.placed[pos - 1]) : -Infinity;
    const right = pos < g.placed.length ? this.value(g.placed[pos]) : Infinity;
    const correct = v >= left && v <= right;
    const player = g.players[seat];

    if (correct) {
      g.placed.splice(pos, 0, card);
      g.log.push({ seat, ok: true, text: player.name + ': ' + g.cards[card].name + ' richtig' });
    } else {
      player.lives = Math.max(0, player.lives - 1);
      g.round.losses.push(seat);
      g.pool.unshift(card); // zurück unter den Stapel
      g.log.push({ seat, ok: false, text: player.name + ': ' + g.cards[card].name + ' falsch' + (player.lives ? ' (' + player.lives + ' ♥ übrig)' : ' (keine Herzen mehr)') });
    }
    g.last = { seat, card, pos, correct, n: (g.last?.n || 0) + 1 };
    g.current = null;
    if (g.log.length > 40) g.log = g.log.slice(-40);

    if (g.pool.length === 0) return this.finishByPool();
    this.advance();
  }

  advance() {
    const g = this.game;
    const r = g.round;
    r.idx++;
    while (r.idx < r.order.length && g.players[r.order[r.idx]].lives <= 0) r.idx++;

    if (r.idx >= r.order.length) {
      // Rundenende wie im Hauptspiel: sind alle Spieler dieser Runde bei 0,
      // bekommen die, die in dieser Runde ein Herz verloren haben, eins zurück.
      const roundPlayers = r.order.map(s => g.players[s]);
      if (r.losses.length && roundPlayers.every(p => p.lives <= 0)) {
        for (const s of new Set(r.losses)) g.players[s].lives = Math.min(g.players[s].lives + 1, g.lives);
        g.log.push({ text: 'Beide ohne Herzen – jeder bekommt eins zurück.' });
      }
      const alive = [g.starter, 1 - g.starter].filter(s => g.players[s].lives > 0);
      if (alive.length === 1) return this.finish(alive[0]);
      if (alive.length === 0) return this.finish('draw');
      g.round = { order: alive, idx: 0, losses: [] };
      g.roundNo++;
    }
    g.turn = g.round.order[g.round.idx];
    g.current = g.pool.pop();
  }

  finishByPool() {
    const g = this.game;
    const [a, b] = g.players;
    if (a.lives === b.lives) return this.finish('draw');
    this.finish(a.lives > b.lives ? 0 : 1);
  }

  finish(winner) {
    const g = this.game;
    g.phase = 'over';
    g.winner = winner;
    g.turn = null;
    g.current = null;
    g.log.push({ text: winner === 'draw' ? 'Unentschieden!' : g.players[winner].name + ' gewinnt!' });
  }

  stateFor(seat, online) {
    const g = this.game;
    const over = g.phase === 'over';
    return {
      t: 'state',
      code: g.code,
      you: seat,
      phase: g.phase,
      lives: g.lives,
      players: g.players.map((p, i) => p ? { name: p.name, lives: p.lives, online: online.has(i) } : null),
      turn: g.turn ?? null,
      current: g.current ?? null,
      placed: (g.placed || []).map(id => ({ id, value: this.value(id) })),
      poolCount: g.pool ? g.pool.length : 0,
      last: g.last ? { ...g.last, value: g.last.correct || over ? this.value(g.last.card) : null } : null,
      winner: g.winner ?? null,
      // Nach Spielende alle restlichen Werte zeigen
      rest: over ? (g.pool || []).map(id => ({ id, value: this.value(id) })) : [],
      matchNo: g.matchNo,
      pushOn: !!g.players[seat]?.push,
      roundNo: g.roundNo || 0,
      log: g.log.slice(-12),
    };
  }

  broadcast() {
    if (!this.game) return;
    const sockets = this.ctx.getWebSockets().filter(ws => ws.readyState === 1);
    const online = new Set(sockets.map(ws => ws.deserializeAttachment()?.seat));
    for (const ws of sockets) {
      const seat = ws.deserializeAttachment()?.seat;
      if (seat === 0 || seat === 1) {
        try { ws.send(JSON.stringify(this.stateFor(seat, online))); } catch {}
      }
    }
  }
}
