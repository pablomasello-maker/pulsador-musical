// Pulsador Musical: el anfitrión crea una sala (PeerJS / WebRTC) y los jugadores se conectan directamente a su móvil.
// El móvil anfitrión es el árbitro: decide el orden de los pulsadores por orden de llegada.
(() => {
  const $ = (id) => document.getElementById(id);
  const PREFIX = "pulsador-musical-v1-";
  const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I ni O para no confundir
  const KINDS = { cancion: ["Canción", 1], artista: ["Artista", 1], disco: ["Disco", 2], anio: ["Año", 2] };
  const MAX_PLAYERS = 24;
  // Catálogo de desafíos. snippet: segundos que suena; limit: segundos para pulsar; mult: multiplica los puntos.
  const CH = {
    clasico: { name: "Clásico", color: "#ffb627", rule: "Canción entera. El primero que pulsa contesta." },
    flash: { name: "Intro relámpago", color: "#4fd1ff", rule: "Solo 3 segundos de canción y 15 para pulsar. Vale doble.", snippet: 3, limit: 15, mult: 2 },
    reloj: { name: "Contrarreloj", color: "#ff8a5c", rule: "10 segundos para pulsar. Cuanto antes aciertes, más puntos extra.", limit: 10, speed: true },
    doble: { name: "Doble o nada", color: "#b48cff", rule: "Acertar vale el doble. Fallar te resta lo mismo.", mult: 2, wrongMinus: true },
    subita: { name: "Muerte súbita", color: "#ff5a4e", rule: "Un solo intento: si el primero falla, se acaba la ronda.", oneTry: true },
    aguja: { name: "Aguja loca", color: "#3ddc97", rule: "Empieza en cualquier parte de la canción y suenan 8 segundos.", snippet: 8, randomStart: true, manual: "Ponla desde la mitad o donde quieras." },
    ruleta: { name: "Ruleta de desafíos", color: "#e9e6dc", rule: "Cada ronda toca un desafío al azar. Nadie sabe cuál hasta que entra el cassette.", meta: true },
  };

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const clean = (s, n = 16) => String(s || "").replace(/[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g, "").trim().slice(0, n);
  const show = (el, msg) => { el.textContent = msg || ""; el.hidden = !msg; };

  // Servidor de señalización: el público de PeerJS por defecto; ?peerhost=... para pruebas locales.
  const params = new URLSearchParams(location.search);
  const peerOpts = {};
  const testParams = ["peerhost", "peerport", "peersecure"].filter((k) => params.has(k));
  if (params.has("peerhost")) {
    peerOpts.host = params.get("peerhost");
    peerOpts.port = Number(params.get("peerport") || 443);
    peerOpts.secure = params.get("peersecure") !== "0";
    peerOpts.path = "/";
  }

  let pid = ls.get("pm_pid");
  if (!pid || !/^p[a-z0-9]{8,}$/.test(pid)) { pid = "p" + Math.random().toString(36).slice(2, 12).padEnd(10, "0"); ls.set("pm_pid", pid); }
  $("name").value = ls.get("pm_name") || "";
  if (params.get("sala")) $("code").value = clean(params.get("sala"), 4).toUpperCase();

  let role = null;
  let myName = "";
  let peer = null;

  // ---------- Sonido (sale por el parlante del anfitrión) ----------
  let ac = null;
  const audio = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch {} return ac; };
  function tone(seq) {
    const c = audio(); if (!c) return;
    let t = c.currentTime + 0.02;
    for (const [f, d, type = "square", vol = 0.18] of seq) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02); t += d * 0.9;
    }
  }
  const sfx = {
    buzz: () => tone([[220, 0.45, "sawtooth", 0.22]]),
    right: () => tone([[660, 0.12, "triangle", .25], [880, 0.12, "triangle", .25], [1320, 0.3, "triangle", .25]]),
    wrong: () => tone([[180, 0.25, "square", .2], [120, 0.45, "square", .2]]),
    open: () => tone([[523, 0.08, "sine", .2], [784, 0.14, "sine", .2]]),
    cut: () => tone([[880, 0.1, "square", .2], [0.01, 0.06, "sine", 0.0001], [880, 0.1, "square", .2]]),
  };
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
  async function keepAwake() { try { await navigator.wakeLock?.request("screen"); } catch {} }
  document.addEventListener("visibilitychange", () => { if (role && document.visibilityState === "visible") keepAwake(); });

  // ---------- Inicio ----------
  function enter(as) {
    myName = clean($("name").value) || (as === "host" ? "Anfitrión" : "Jugador");
    ls.set("pm_name", myName);
    if (as === "player") {
      const code = clean($("code").value, 4).toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) { show($("startErr"), "Escribe el código de 4 letras que aparece en el móvil del anfitrión."); return; }
      show($("startErr"), "");
      ss.set("pm_player", { code });
      startPlayer(code);
    } else {
      startHost(null);
    }
    audio(); keepAwake();
  }
  $("joinPlayer").onclick = () => enter("player");
  $("joinHost").onclick = () => enter("host");
  $("code").addEventListener("keydown", (e) => { if (e.key === "Enter") enter("player"); });
  $("code").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ""); });

  const nameOf = (st, id) => (st.names && st.names[id]) || "Jugador";
  function setStage(prefix, pillCls, pill, big, small) {
    const p = $(prefix + "Pill"); p.className = "pill " + pillCls; p.textContent = pill;
    $(prefix + "Big").textContent = big; $(prefix + "Small").textContent = small || "";
  }
  function renderScores(el, st, mine, online) {
    const ids = Object.keys(st.scores || {}).filter((id) => online.includes(id) || st.scores[id] !== 0);
    ids.sort((a, b) => st.scores[b] - st.scores[a] || nameOf(st, a).localeCompare(nameOf(st, b)));
    if (!ids.length) { const li = document.createElement("li"); li.textContent = "Todavía no hay jugadores. Comparte el código."; li.style.display = "block"; el.replaceChildren(li); return; }
    el.replaceChildren(...ids.map((id, i) => {
      const li = document.createElement("li");
      if (id === mine) li.className = "me";
      const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
      const nm = document.createElement("span"); nm.className = "name"; nm.textContent = nameOf(st, id) + (id === mine ? " (tú)" : "") + (online.includes(id) ? "" : " · desconectado");
      const pt = document.createElement("span"); pt.className = "pts"; pt.textContent = st.scores[id];
      li.append(pos, nm, pt); return li;
    }));
  }
  function renderTimer(el, ms, phase) {
    if (ms == null || !(phase === "open" || phase === "answering")) { el.hidden = true; return; }
    const sec = Math.max(0, Math.ceil(ms / 1000));
    el.textContent = `${sec} s`;
    el.classList.toggle("low", sec <= 5);
    el.hidden = false;
  }
  function resultText(st, me) {
    const L = st.last;
    if (L && L.ok) return me && L.pid === me ? `¡Acertaste! +${L.pts || 1}` : `¡${nameOf(st, L.pid)} suma ${L.pts || 1}!`;
    if (st.timeout) return "¡Se acabó el tiempo!";
    if (L && !L.ok && (CH[st.ch] || {}).oneTry) return me && L.pid === me ? "Muerte súbita: fallaste" : `Muerte súbita: falló ${nameOf(st, L.pid)}`;
    return "Nadie acertó";
  }

  // El cassette de cada pantalla: entra al abrir ronda, gira mientras suena, se para al cortar y da la vuelta a la etiqueta al final.
  function deckView(el) {
    const k = Cassette.mount(el);
    let round = -1, phase = null, tape = 0, flickering = false, last = Date.now();
    const lobbyLabel = ["Pulsador Musical", "Cara A · Esperando la primera ronda", "#e9e6dc"];
    k.setLabel(...lobbyLabel);
    return (st, leftMs) => {
      const now = Date.now(), dt = (now - last) / 1000; last = now;
      if (!st) return;
      const c = CH[st.ch] || CH.clasico;
      const kind = (KINDS[st.kind] || KINDS.cancion)[0];
      const live = st.phase === "open" || st.phase === "answering";
      if (st.round !== round) {
        const fresh = round !== -1;
        round = st.round; tape = 0;
        if (live && fresh) {
          if (st.roulette) {
            flickering = true;
            const opts = Object.values(CH).filter((x) => !x.meta).map((x) => [x.name, x.color]);
            k.flicker(opts, [c.name, `Ronda ${st.round} · Adivina: ${kind}`, c.color], () => { flickering = false; });
          } else k.insert();
        }
      }
      if (st.phase !== phase) { if (st.phase === "reveal" && phase !== null) k.flip(); phase = st.phase; }
      if (!flickering) {
        if (st.phase === "lobby" || !st.round) k.setLabel(...lobbyLabel);
        else if (live) k.setLabel(c.name, `Ronda ${st.round} · Adivina: ${kind}`, c.color);
        else if (st.reveal && st.reveal.title) k.setLabel(st.reveal.title, [st.reveal.artist, st.reveal.year].filter(Boolean).join(" · "), c.color);
        else k.setLabel(resultText(st, null), `Ronda ${st.round} · ${c.name}`, c.color);
      }
      k.setPlaying(!!st.playing && !flickering);
      if (st.lim && typeof leftMs === "number" && live) tape = 1 - leftMs / st.lim;
      else if (st.playing) tape += dt / (c.snippet || 120);
      k.setTape(tape);
    };
  }

  function renderReveal(el, rv) {
    if (!rv) { el.hidden = true; el.replaceChildren(); return; }
    const parts = [];
    if (rv.img && /^https:\/\/[a-z0-9.-]+\.scdn\.co\//.test(rv.img)) { const im = document.createElement("img"); im.src = rv.img; im.alt = ""; parts.push(im); }
    const t = document.createElement("p"); t.className = "t"; t.textContent = rv.title || ""; parts.push(t);
    const a = document.createElement("p"); a.textContent = rv.artist || ""; parts.push(a);
    const d = document.createElement("p"); d.className = "muted"; d.textContent = [rv.album, rv.year].filter(Boolean).join(" · "); parts.push(d);
    el.replaceChildren(...parts); el.hidden = false;
  }

  // =====================================================================
  // ANFITRIÓN
  // =====================================================================
  const H = { phase: "lobby", round: 0, kind: "cancion", pick: "clasico", ch: "clasico", roulette: false, playing: false, lim: 0,
    queue: [], locked: [], bl: {}, scores: {}, names: {}, last: null, reveal: null, timeout: false, online: [] };
  const conns = new Map(); // conn.peer -> { conn, pid }
  let penalty = false;
  let code = null;
  let music = "manual"; // "manual" | "spotify"
  let tracks = [];
  let played = new Set();
  let current = null;

  const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");

  function saveHost() { ss.set("pm_host", { code, H: { ...H, online: [] }, penalty, music, playlist: $("spPlaylist").value || ss.get("pm_host")?.playlist || "", played: [...played].slice(-500) }); }

  function startHost(saved) {
    role = "host";
    $("start").hidden = true; $("host").hidden = false;
    if (saved) {
      Object.assign(H, saved.H || {});
      if (!CH[H.pick]) H.pick = "clasico";
      if (!CH[H.ch]) H.ch = "clasico";
      H.bl = H.bl || {};
      penalty = !!saved.penalty; $("penalty").checked = penalty;
      played = new Set(saved.played || []);
      if (H.phase === "open" || H.phase === "answering") { H.phase = "reveal"; H.queue = []; H.reveal = null; }
      H.left = null; H.running = false; H.playing = false;
    }
    code = (saved && saved.code) || randomCode();
    $("redirectUri").textContent = Spotify.redirectUri();
    openPeer();
    renderHost();
    initSpotifyPanel(saved);
  }

  function openPeer() {
    if (peer) try { peer.destroy(); } catch {}
    show($("hostErr"), "");
    $("roomCode").textContent = "····";
    peer = new Peer(PREFIX + code, peerOpts);
    peer.on("open", () => { showShare(); saveHost(); });
    peer.on("connection", onConnection);
    peer.on("disconnected", () => { try { peer.reconnect(); } catch {} });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id") { code = randomCode(); openPeer(); return; }
      if (e.type === "peer-unavailable") return;
      show($("hostErr"), e.type === "network" || e.type === "server-error" || e.type === "socket-error"
        ? "No hay conexión con el servidor de salas. Revisa internet; reintentando…"
        : "Problema con la sala (" + e.type + ").");
      if (e.type === "network" || e.type === "server-error" || e.type === "socket-error") setTimeout(() => { if (peer && (peer.destroyed || peer.disconnected)) openPeer(); }, 4000);
    });
  }

  function showShare() {
    $("roomCode").textContent = code;
    const extra = testParams.map((k) => `&${k}=${encodeURIComponent(params.get(k))}`).join("");
    const url = `${location.origin}${location.pathname}?sala=${code}${extra}`;
    $("joinLink").textContent = url;
    $("copyLink").onclick = async () => {
      try { await navigator.clipboard.writeText(url); $("copyLink").textContent = "Enlace copiado"; }
      catch { $("copyLink").textContent = "Copia el enlace de arriba"; }
      setTimeout(() => { $("copyLink").textContent = "Copiar enlace"; }, 2000);
    };
    try {
      const qr = qrcode(0, "M"); qr.addData(url); qr.make();
      $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch { $("qr").hidden = true; }
  }

  function onConnection(conn) {
    conn.on("data", (d) => onPlayerMsg(conn, d));
    conn.on("close", () => { conns.delete(conn.peer); publish(); });
    conn.on("error", () => { conns.delete(conn.peer); publish(); });
  }

  function onPlayerMsg(conn, d) {
    if (!d || typeof d !== "object") return;
    if (d.t === "hello") {
      const id = typeof d.pid === "string" && /^p[a-z0-9]{8,20}$/.test(d.pid) ? d.pid : null;
      if (!id) return;
      if (!(id in H.scores) && Object.keys(H.scores).length >= MAX_PLAYERS) { conn.send({ t: "full" }); setTimeout(() => conn.close(), 500); return; }
      // Si el mismo jugador vuelve a entrar, cerramos su conexión vieja.
      for (const [k, v] of conns) if (v.pid === id && k !== conn.peer) { try { v.conn.close(); } catch {} conns.delete(k); }
      conns.set(conn.peer, { conn, pid: id });
      H.names[id] = clean(d.name) || "Jugador";
      if (!(id in H.scores)) H.scores[id] = 0;
      publish();
      return;
    }
    const c = conns.get(conn.peer);
    if (!c) return;
    if (d.t === "buzz" && d.round === H.round && (H.phase === "open" || H.phase === "answering")) {
      if (H.queue.includes(c.pid) || H.locked.includes(c.pid)) return;
      H.queue.push(c.pid);
      H.bl[c.pid] = H.running ? Math.max(0, deadline - Date.now()) : (H.left || 0);
      if (H.queue.length === 1) {
        H.phase = "answering"; sfx.buzz(); vibrate(200);
        freezeClock(); clearTimeout(snippetTimer);
        if (H.playing) { H.playing = false; stopMusic(); }
      }
      publish();
    }
  }

  function publish() {
    if (role !== "host") return;
    H.online = [...new Set([...conns.values()].map((c) => c.pid))];
    const st = { ...H, left: H.running ? Math.max(0, deadline - Date.now()) : H.left };
    delete st.bl;
    const msg = { t: "state", st };
    for (const { conn } of conns.values()) { try { if (conn.open) conn.send(msg); } catch {} }
    saveHost();
    renderHost();
  }

  const kindsEl = $("kinds");
  for (const [k, [label, pts]] of Object.entries(KINDS)) {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.dataset.kind = k;
    b.textContent = `${label} · ${pts} pt${pts > 1 ? "s" : ""}`;
    b.onclick = () => { H.kind = k; publish(); };
    kindsEl.appendChild(b);
  }

  // ---------- Desafíos ----------
  for (const [id, c] of Object.entries(CH)) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chcard" + (c.meta ? " wide" : ""); b.dataset.ch = id;
    b.style.setProperty("--c", c.color);
    const n = document.createElement("span"); n.className = "n"; n.textContent = c.name;
    const d = document.createElement("span"); d.className = "d"; d.textContent = c.rule;
    b.append(n, d);
    b.onclick = () => { H.pick = id; saveHost(); renderHost(); };
    $("chCards").appendChild(b);
  }

  let snippetTimer = null;
  let deadline = null; // reloj del anfitrión mientras corre la cuenta atrás; a los jugadores se les manda lo que queda
  const cfg = () => CH[H.ch] || CH.clasico;

  function stopMusic() { if (music === "spotify") Spotify.pause(); }
  function startSnippet() {
    clearTimeout(snippetTimer);
    const sn = cfg().snippet;
    if (!sn) return;
    snippetTimer = setTimeout(() => { H.playing = false; stopMusic(); sfx.cut(); publish(); }, sn * 1000);
  }
  function startClock() { if (H.left != null && !H.running) { deadline = Date.now() + H.left; H.running = true; } }
  function freezeClock() { if (H.running) { H.left = Math.max(0, deadline - Date.now()); H.running = false; deadline = null; } }
  function clearClock() { H.left = null; H.running = false; deadline = null; }
  function endRound() { clearClock(); clearTimeout(snippetTimer); }

  setInterval(() => {
    if (role !== "host") return;
    if (H.running && H.phase === "open" && Date.now() >= deadline) {
      endRound(); H.phase = "reveal"; H.last = null; H.timeout = true; H.queue = [];
      revealNow(); sfx.wrong(); publish(); return;
    }
    const left = H.running ? deadline - Date.now() : H.left;
    renderTimer($("hTimer"), left, H.phase);
    hDeck(H, left);
  }, 200);

  async function playCurrent() {
    await Spotify.play(current, current.pos);
    H.playing = true; startSnippet();
  }
  $("replay").onclick = async () => {
    if (!current || music !== "spotify") return;
    show($("roundErr"), "");
    try { await playCurrent(); publish(); } catch (e) { show($("roundErr"), e.message); }
  };

  $("openRound").onclick = async () => {
    show($("roundErr"), "");
    const roulette = H.pick === "ruleta";
    const ids = Object.keys(CH).filter((k) => !CH[k].meta);
    const ch = roulette ? ids[Math.floor(Math.random() * ids.length)] : H.pick;
    const c = CH[ch];
    if (music === "spotify") {
      let pool = tracks.filter((t) => !played.has(t.uri));
      if (!pool.length) { played.clear(); pool = tracks.slice(); }
      if (!pool.length) { show($("roundErr"), "La playlist no tiene canciones que se puedan reproducir."); return; }
      const t = { ...pool[Math.floor(Math.random() * pool.length)] };
      // Aguja loca: cualquier punto entre el 10 % y el 80 %. Si no, a un tercio para saltar intros largas.
      t.pos = c.randomStart && t.ms > 30000 ? Math.floor(t.ms * (0.1 + Math.random() * 0.7)) : t.ms > 90000 ? Math.floor(t.ms * 0.3) : 0;
      current = t;
      $("openRound").disabled = true;
      H.ch = ch;
      try { await playCurrent(); }
      catch (e) { show($("roundErr"), e.message); $("openRound").disabled = false; return; }
      $("openRound").disabled = false;
      played.add(t.uri);
    } else { current = null; H.ch = ch; H.playing = true; startSnippet(); }
    H.roulette = roulette;
    H.round += 1; H.queue = []; H.locked = []; H.bl = {}; H.last = null; H.reveal = null; H.timeout = false; H.phase = "open";
    clearClock();
    H.lim = c.limit ? c.limit * 1000 : 0;
    if (c.limit) { H.left = H.lim; startClock(); }
    sfx.open(); publish();
  };
  const revealNow = () => {
    H.reveal = current ? { title: current.title, artist: current.artist, album: current.album, year: current.year, img: current.img } : null;
    if (current) { Spotify.resume(); H.playing = true; } else H.playing = false;
  };
  $("right").onclick = () => {
    const id = H.queue[0]; if (!id) return;
    const c = cfg(), base = KINDS[H.kind][1];
    let pts = base * (c.mult || 1);
    if (c.speed && H.lim) pts += Math.max(1, Math.ceil(3 * (H.bl[id] || 0) / H.lim));
    H.scores[id] = (H.scores[id] || 0) + pts;
    H.last = { pid: id, ok: true, pts }; H.phase = "reveal"; H.queue = [];
    endRound(); revealNow(); sfx.right(); publish();
  };
  $("wrong").onclick = () => {
    const id = H.queue.shift(); if (!id) return;
    const c = cfg(), base = KINDS[H.kind][1];
    H.locked.push(id);
    const minus = c.wrongMinus ? base * (c.mult || 1) : penalty ? 1 : 0;
    if (minus) H.scores[id] = (H.scores[id] || 0) - minus;
    H.last = { pid: id, ok: false, pts: -minus };
    sfx.wrong();
    if (c.oneTry) { H.queue = []; H.phase = "reveal"; endRound(); revealNow(); publish(); return; }
    H.phase = H.queue.length ? "answering" : "open";
    if (!H.queue.length) {
      startClock();
      // Sigue la canción, salvo en los desafíos de fragmento: ese ya se escuchó (se puede repetir con el botón).
      if (!c.snippet) { H.playing = true; if (music === "spotify") Spotify.resume(); }
    }
    publish();
  };
  $("skip").onclick = () => { H.phase = "reveal"; H.last = null; H.queue = []; endRound(); revealNow(); publish(); };
  $("penalty").onchange = (e) => { penalty = e.target.checked; saveHost(); };
  $("resetScores").onclick = () => { $("resetConfirm").hidden = false; };
  $("resetNo").onclick = () => { $("resetConfirm").hidden = true; };
  $("resetYes").onclick = () => { for (const k of Object.keys(H.scores)) H.scores[k] = 0; $("resetConfirm").hidden = true; publish(); };

  const hDeck = deckView($("hDeck"));

  function renderHost() {
    if (role !== "host") return;
    const n = H.online.length;
    const kindLabel = KINDS[H.kind][0];
    const c = cfg();
    for (const b of kindsEl.children) b.setAttribute("aria-pressed", String(b.dataset.kind === H.kind));
    for (const b of $("chCards").children) b.setAttribute("aria-pressed", String(b.dataset.ch === H.pick));
    $("hJudge").hidden = H.phase !== "answering";
    $("openRound").textContent = H.round === 0 ? "Abrir primera ronda" : (H.phase === "open" || H.phase === "answering") ? "Otra canción" : "Abrir siguiente ronda";
    $("manualTip").hidden = music === "spotify"; $("spTip").hidden = music !== "spotify";
    $("replay").hidden = !(music === "spotify" && current && (H.phase === "open" || H.phase === "answering"));
    $("replay").textContent = c.snippet ? `Repetir fragmento (${c.snippet} s)` : "Repetir desde el inicio";
    const live = H.phase === "open" || H.phase === "answering";
    $("hRule").textContent = live ? c.rule + (music === "manual" && c.manual ? " " + c.manual : "") : "";
    const conn = `${n} jugador${n === 1 ? "" : "es"} conectado${n === 1 ? "" : "s"}`;
    if (H.phase === "lobby") setStage("h", "", "Sala abierta", n ? "Todo listo" : "Esperando jugadores", conn);
    else if (H.phase === "open") setStage("h", "open", `Ronda ${H.round} · ${c.name}`, H.playing || !c.snippet ? "¡Pulsadores activos!" : "¡Corte! ¿Quién lo sabe?",
      H.last && !H.last.ok ? `${nameOf(H, H.last.pid)} falló. ${conn}` : `Adivina: ${kindLabel} · ${conn}`);
    else if (H.phase === "answering") setStage("h", "ans", `Ronda ${H.round} · ${c.name}`, `Contesta ${nameOf(H, H.queue[0])}`,
      music === "spotify" ? "Música en pausa. Escucha la respuesta." : "Pausa la música y escucha la respuesta.");
    else if (H.phase === "reveal") setStage("h", "rev", `Ronda ${H.round} · ${c.name}`, resultText(H, null), music === "spotify" ? "Abre la siguiente ronda cuando quieras." : "Pon la siguiente canción y abre otra ronda.");
    // El anfitrión ve la canción mientras suena, por si tiene que juzgar.
    renderReveal($("hReveal"), H.reveal || (current && (H.phase === "open" || H.phase === "answering") ? { title: current.title, artist: current.artist, album: current.album, year: current.year } : null));
    $("hQueue").replaceChildren(...H.queue.map((id, i) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = nameOf(H, id);
      const b = document.createElement("span"); b.textContent = i === 0 ? "contesta" : `${i + 1}º`;
      li.append(a, b); return li;
    }));
    renderScores($("hScores"), H, null, H.online);
  }

  // ---------- Spotify (solo anfitrión) ----------
  async function initSpotifyPanel(saved) {
    $("spClient").value = Spotify.clientId();
    $("spConnect").onclick = async () => {
      show($("spErr"), "");
      saveHost();
      try { await Spotify.login($("spClient").value); } catch (e) { show($("spErr"), e.message); }
    };
    $("spLogout").onclick = () => { Spotify.logout(); music = "manual"; tracks = []; refreshSpotify(); publish(); };
    $("spManual").onclick = () => { music = "manual"; current = null; publish(); refreshSpotify(); };
    $("spUse").onclick = async () => {
      const id = $("spPlaylist").value; if (!id) return;
      show($("spErr"), ""); $("spUse").disabled = true; $("spCount").textContent = "Cargando canciones…";
      try {
        tracks = await Spotify.playlistTracks(id);
        if (!tracks.length) throw new Error("Esa playlist no tiene canciones que se puedan reproducir.");
        music = "spotify"; saveHost(); publish();
        $("spCount").textContent = `${tracks.length} canciones listas. Modo Spotify activado.`;
      } catch (e) { show($("spErr"), e.status === 403 || e.status === 404 ? "Spotify no deja leer esa playlist. Usa una que sea tuya o colaborativa." : e.message); $("spCount").textContent = ""; }
      $("spUse").disabled = false;
    };
    if (saved && saved.music === "spotify" && saved.playlist) { $("spPlaylist").dataset.want = saved.playlist; }
    await refreshSpotify(saved && saved.music === "spotify");
  }

  async function refreshSpotify(autoUse) {
    const on = Spotify.connected();
    $("spOff").hidden = on; $("spOn").hidden = !on;
    if (!on) return;
    try {
      const u = await Spotify.me().catch(() => null);
      $("spWho").textContent = u && u.display_name ? `Spotify conectado: ${u.display_name}` : "Spotify conectado";
      const lists = await Spotify.playlists();
      const sel = $("spPlaylist");
      sel.replaceChildren(...lists.map((p) => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.name + (p.total != null ? ` (${p.total})` : ""); return o; }));
      if (!lists.length) { const o = document.createElement("option"); o.value = ""; o.textContent = "No tienes playlists propias"; sel.replaceChildren(o); }
      if (sel.dataset.want) sel.value = sel.dataset.want;
      if (autoUse && sel.value) $("spUse").click();
    } catch (e) {
      show($("spErr"), e.status === 403 ? "Spotify no autoriza esta cuenta. En tu app de Spotify, añade tu email en “User Management”." : e.message);
    }
  }

  // =====================================================================
  // JUGADOR
  // =====================================================================
  let conn = null;
  let st = null;
  let pressedRound = -1;
  let lastFirst = null;
  let retries = 0;
  let joinCode = null;
  let connectTimer = null;
  let pDeadline = null;
  let pDeck = null;
  setInterval(() => {
    if (role !== "player" || !st) return;
    const left = pDeadline ? pDeadline - Date.now() : (typeof st.left === "number" ? st.left : null);
    renderTimer($("pTimer"), left, st.phase);
    if (!pDeck) pDeck = deckView($("pDeck"));
    pDeck(st, left);
  }, 200);

  function startPlayer(c) {
    role = "player"; joinCode = c;
    $("start").hidden = true; $("player").hidden = false;
    connectPlayer();
  }

  function connectPlayer() {
    clearTimeout(connectTimer);
    $("retry").hidden = true;
    setStage("p", "", "Conectando", `Entrando a la sala ${joinCode}…`, "");
    renderPlayer();
    if (peer) try { peer.destroy(); } catch {}
    peer = new Peer(peerOpts);
    connectTimer = setTimeout(() => { if (!conn || !conn.open) failed("No se pudo conectar. Comprueba el código y que el anfitrión tenga la sala abierta."); }, 15000);
    peer.on("open", () => {
      conn = peer.connect(PREFIX + joinCode, { reliable: true });
      conn.on("open", () => { clearTimeout(connectTimer); retries = 0; conn.send({ t: "hello", pid, name: myName }); });
      conn.on("data", (d) => {
        if (!d || typeof d !== "object") return;
        if (d.t === "full") { failed("La sala está llena."); return; }
        if (d.t === "state" && d.st && typeof d.st === "object") {
          st = d.st;
          pDeadline = st.running && typeof st.left === "number" ? Date.now() + st.left : null;
          renderPlayer();
        }
      });
      conn.on("close", () => lost());
      conn.on("error", () => lost());
    });
    peer.on("error", (e) => {
      if (e.type === "peer-unavailable") failed(`No hay ninguna sala abierta con el código ${joinCode}.`);
      else lost();
    });
  }
  function failed(msg) {
    clearTimeout(connectTimer);
    setStage("p", "", "Sin conexión", "No se pudo entrar", msg);
    $("buzz").disabled = true; $("retry").hidden = false;
  }
  function lost() {
    if (role !== "player") return;
    if (retries < 5) { retries += 1; setStage("p", "", "Reconectando", "Se perdió la conexión", "Reintentando…"); $("buzz").disabled = true; setTimeout(connectPlayer, 2000 * retries); }
    else failed("Se perdió la conexión con el anfitrión.");
  }
  $("retry").onclick = () => { retries = 0; connectPlayer(); };

  $("buzz").addEventListener("pointerdown", (e) => { e.preventDefault(); press(); });
  $("buzz").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); press(); } });
  function press() {
    if (!st || !conn || !conn.open || $("buzz").disabled) return;
    pressedRound = st.round;
    try { conn.send({ t: "buzz", round: st.round }); } catch {}
    vibrate(60);
    renderPlayer();
    $("buzz").classList.add("pressed");
  }

  function renderPlayer() {
    if (role !== "player") return;
    const btn = $("buzz");
    btn.classList.remove("pressed", "live");
    if (!st || !conn || !conn.open) { btn.disabled = true; renderScores($("pScores"), { scores: {} }, pid, []); renderReveal($("pReveal"), null); return; }
    const kindLabel = (KINDS[st.kind] || KINDS.cancion)[0];
    const queue = Array.isArray(st.queue) ? st.queue : [];
    const locked = Array.isArray(st.locked) ? st.locked : [];
    const pos = queue.indexOf(pid);
    const canBuzz = (st.phase === "open" || st.phase === "answering") && pos < 0 && !locked.includes(pid) && pressedRound !== st.round;
    btn.disabled = !canBuzz;
    if (canBuzz) btn.classList.add("live");

    if (st.phase === "lobby") setStage("p", "", `Sala ${joinCode}`, `Hola, ${myName}`, "El anfitrión abrirá la primera ronda enseguida.");
    else if (st.phase === "open" || st.phase === "answering") {
      const c = CH[st.ch] || CH.clasico;
      const tag = `Ronda ${st.round} · ${c.name} · ${kindLabel}`;
      if (pos === 0) setStage("p", "ans", tag, "¡Te toca! Di tu respuesta", "Contesta en voz alta.");
      else if (pos > 0) setStage("p", "ans", tag, `Eres el ${pos + 1}º en la cola`, `Contesta ${nameOf(st, queue[0])}.`);
      else if (locked.includes(pid)) setStage("p", "", tag, "Fallaste esta", "Espera a la próxima canción.");
      else if (pressedRound === st.round) setStage("p", "ans", tag, "¡Pulsado!", "Esperando al anfitrión…");
      else if (st.phase === "answering") setStage("p", "ans", tag, `Contesta ${nameOf(st, queue[0])}`, c.oneTry ? "Muerte súbita: si falla, se acaba la ronda." : "Si falla, puedes pulsar tú.");
      else setStage("p", "open", tag, st.playing || !c.snippet ? "¡Pulsa si lo sabes!" : "¡Corte! ¿Lo sabes?", st.last && !st.last.ok ? `${nameOf(st, st.last.pid)} falló.` : "");
      if (pos === 0 && lastFirst !== pid) vibrate([80, 60, 80]);
    } else if (st.phase === "reveal") {
      setStage("p", "rev", `Ronda ${st.round} · ${(CH[st.ch] || CH.clasico).name}`, resultText(st, pid), "Atento a la siguiente canción.");
    }
    $("pRule").textContent = (st.phase === "open" || st.phase === "answering") ? (CH[st.ch] || CH.clasico).rule : "";
    renderReveal($("pReveal"), st.phase === "reveal" ? st.reveal : null);
    lastFirst = queue[0] || null;
    renderScores($("pScores"), st, pid, Array.isArray(st.online) ? st.online : []);
  }

  // ---------- Arranque: volver de Spotify o recuperar la partida tras recargar ----------
  (async () => {
    let spErr = null;
    try { await Spotify.handleRedirect(); } catch (e) { spErr = e.message; }
    const host = ss.get("pm_host");
    const player = ss.get("pm_player");
    myName = ls.get("pm_name") || "";
    if (host && !params.get("sala")) {
      startHost(host);
      if (spErr) show($("spErr"), spErr);
      if (Spotify.connected() || spErr) $("spPanel").open = true;
    } else if (player && player.code && (!params.get("sala") || params.get("sala").toUpperCase() === player.code) && myName) {
      startPlayer(player.code);
    }
  })();
})();
