// Pulsador Musical: el anfitrión crea una sala (PeerJS / WebRTC) y los jugadores se conectan directamente a su móvil.
// El móvil anfitrión es el árbitro: decide el orden de los pulsadores por orden de llegada.
(() => {
  const $ = (id) => document.getElementById(id);
  const PREFIX = "pulsador-musical-v1-";
  const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I ni O para no confundir
  const KINDS = { cancion: ["Canción", 1], artista: ["Artista", 1], disco: ["Disco", 2], anio: ["Año", 2] };
  const MAX_PLAYERS = 24;

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
  const C = { snippet: 0, limit: 0, cut: true }; // desafíos elegidos por el anfitrión
  const H = { phase: "lobby", round: 0, kind: "cancion", queue: [], locked: [], scores: {}, names: {}, last: null, reveal: null, online: [] };
  const conns = new Map(); // conn.peer -> { conn, pid }
  let penalty = false;
  let code = null;
  let music = "manual"; // "manual" | "spotify"
  let tracks = [];
  let played = new Set();
  let current = null;

  const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");

  function saveHost() { ss.set("pm_host", { code, H: { ...H, online: [] }, C, penalty, music, playlist: $("spPlaylist").value || ss.get("pm_host")?.playlist || "", played: [...played].slice(-500) }); }

  function startHost(saved) {
    role = "host";
    $("start").hidden = true; $("host").hidden = false;
    if (saved) {
      Object.assign(H, saved.H || {});
      penalty = !!saved.penalty; $("penalty").checked = penalty;
      played = new Set(saved.played || []);
      if (saved.C) Object.assign(C, saved.C);
      if (H.phase === "open" || H.phase === "answering") { H.phase = "reveal"; H.queue = []; H.reveal = null; }
      H.left = null; H.running = false;
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
      if (H.queue.length === 1) {
        H.phase = "answering"; sfx.buzz(); vibrate(200);
        freezeClock();
        if (C.cut) { if (C.snippet) { clearTimeout(snippetTimer); snippetOver = true; } stopMusic(); }
      }
      publish();
    }
  }

  function publish() {
    if (role !== "host") return;
    H.online = [...new Set([...conns.values()].map((c) => c.pid))];
    const msg = { t: "state", st: { ...H, left: H.running ? Math.max(0, deadline - Date.now()) : H.left } };
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
  const SNIPPETS = [[0, "Entera"], [3, "3 s"], [5, "5 s"], [10, "10 s"], [20, "20 s"]];
  const LIMITS = [[0, "Sin límite"], [10, "10 s"], [20, "20 s"], [30, "30 s"]];
  let snippetTimer = null;
  let snippetOver = false;
  let deadline = null; // reloj del anfitrión mientras corre la cuenta atrás; a los jugadores se les manda lo que queda

  function chipRow(el, options, key) {
    for (const [v, label] of options) {
      const b = document.createElement("button");
      b.className = "chip"; b.type = "button"; b.dataset.v = v; b.textContent = label;
      b.onclick = () => { C[key] = v; saveHost(); renderHost(); };
      el.appendChild(b);
    }
  }
  chipRow($("snippetChips"), SNIPPETS, "snippet");
  chipRow($("limitChips"), LIMITS, "limit");
  $("cutOnBuzz").onchange = (e) => { C.cut = e.target.checked; saveHost(); };

  function stopMusic() { if (music === "spotify") Spotify.pause(); }
  function startSnippet() {
    clearTimeout(snippetTimer); snippetOver = false;
    if (!C.snippet) return;
    snippetTimer = setTimeout(() => { snippetOver = true; stopMusic(); sfx.cut(); renderHost(); }, C.snippet * 1000);
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
    renderTimer($("hTimer"), H.running ? deadline - Date.now() : H.left, H.phase);
  }, 200);

  $("replay").onclick = async () => {
    if (!current || music !== "spotify") return;
    show($("roundErr"), "");
    try { await Spotify.play(current); startSnippet(); } catch (e) { show($("roundErr"), e.message); }
  };

  $("openRound").onclick = async () => {
    show($("roundErr"), "");
    if (music === "spotify") {
      let pool = tracks.filter((t) => !played.has(t.uri));
      if (!pool.length) { played.clear(); pool = tracks.slice(); }
      if (!pool.length) { show($("roundErr"), "La playlist no tiene canciones que se puedan reproducir."); return; }
      const t = pool[Math.floor(Math.random() * pool.length)];
      $("openRound").disabled = true;
      try { await Spotify.play(t); }
      catch (e) { show($("roundErr"), e.message); $("openRound").disabled = false; return; }
      $("openRound").disabled = false;
      played.add(t.uri); current = t;
    } else current = null;
    H.round += 1; H.queue = []; H.locked = []; H.last = null; H.reveal = null; H.timeout = false; H.phase = "open";
    clearClock();
    if (C.limit) { H.left = C.limit * 1000; startClock(); }
    startSnippet();
    sfx.open(); publish();
  };
  const revealNow = () => { H.reveal = current ? { title: current.title, artist: current.artist, album: current.album, year: current.year, img: current.img } : null; if (current) Spotify.resume(); };
  $("right").onclick = () => {
    const id = H.queue[0]; if (!id) return;
    H.scores[id] = (H.scores[id] || 0) + KINDS[H.kind][1];
    H.last = { pid: id, ok: true }; H.phase = "reveal"; H.queue = [];
    endRound(); revealNow(); sfx.right(); publish();
  };
  $("wrong").onclick = () => {
    const id = H.queue.shift(); if (!id) return;
    H.locked.push(id);
    if (penalty) H.scores[id] = (H.scores[id] || 0) - 1;
    H.last = { pid: id, ok: false };
    H.phase = H.queue.length ? "answering" : "open";
    if (!H.queue.length) {
      startClock();
      // Sigue la canción, salvo en modo fragmento: ese ya se escuchó (se puede repetir con el botón).
      if (music === "spotify" && C.cut && !C.snippet) Spotify.resume();
    }
    sfx.wrong(); publish();
  };
  $("skip").onclick = () => { H.phase = "reveal"; H.last = null; H.queue = []; endRound(); revealNow(); publish(); };
  $("penalty").onchange = (e) => { penalty = e.target.checked; saveHost(); };
  $("resetScores").onclick = () => { $("resetConfirm").hidden = false; };
  $("resetNo").onclick = () => { $("resetConfirm").hidden = true; };
  $("resetYes").onclick = () => { for (const k of Object.keys(H.scores)) H.scores[k] = 0; $("resetConfirm").hidden = true; publish(); };

  function renderHost() {
    if (role !== "host") return;
    const n = H.online.length;
    const kindLabel = KINDS[H.kind][0];
    for (const b of kindsEl.children) b.setAttribute("aria-pressed", String(b.dataset.kind === H.kind));
    $("hJudge").hidden = H.phase !== "answering";
    $("openRound").textContent = H.round === 0 ? "Abrir primera ronda" : (H.phase === "open" || H.phase === "answering") ? "Otra canción" : "Abrir siguiente ronda";
    $("manualTip").hidden = music === "spotify"; $("spTip").hidden = music !== "spotify";
    for (const b of $("snippetChips").children) b.setAttribute("aria-pressed", String(Number(b.dataset.v) === C.snippet));
    for (const b of $("limitChips").children) b.setAttribute("aria-pressed", String(Number(b.dataset.v) === C.limit));
    $("cutOnBuzz").checked = C.cut;
    $("replay").hidden = !(music === "spotify" && current && (H.phase === "open" || H.phase === "answering"));
    $("replay").textContent = C.snippet ? `Repetir fragmento (${C.snippet} s)` : "Repetir desde el inicio";
    const conn = `${n} jugador${n === 1 ? "" : "es"} conectado${n === 1 ? "" : "s"}`;
    if (H.phase === "lobby") setStage("h", "", "Sala abierta", n ? "Todo listo" : "Esperando jugadores", conn);
    else if (H.phase === "open") setStage("h", "open", `Ronda ${H.round} · ${kindLabel}`, "¡Pulsadores activos!",
      H.last && !H.last.ok ? `${nameOf(H, H.last.pid)} falló. Sigue la música. ${conn}` : conn);
    else if (H.phase === "answering") setStage("h", "ans", `Ronda ${H.round} · ${kindLabel}`, `Contesta ${nameOf(H, H.queue[0])}`,
      music === "spotify" ? "Música en pausa. Escucha la respuesta." : "Pausa la música y escucha la respuesta.");
    else if (H.phase === "reveal") setStage("h", "rev", `Ronda ${H.round} · ${kindLabel}`,
      H.last && H.last.ok ? `¡Punto para ${nameOf(H, H.last.pid)}!` : H.timeout ? "¡Se acabó el tiempo!" : "Nadie acertó", music === "spotify" ? "Abre la siguiente ronda cuando quieras." : "Pon la siguiente canción y abre otra ronda.");
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
  setInterval(() => { if (role === "player" && st) renderTimer($("pTimer"), pDeadline ? pDeadline - Date.now() : (typeof st.left === "number" ? st.left : null), st.phase); }, 200);

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
      const tag = `Ronda ${st.round} · Adivina: ${kindLabel}`;
      if (pos === 0) setStage("p", "ans", tag, "¡Te toca! Di tu respuesta", "Contesta en voz alta.");
      else if (pos > 0) setStage("p", "ans", tag, `Eres el ${pos + 1}º en la cola`, `Contesta ${nameOf(st, queue[0])}.`);
      else if (locked.includes(pid)) setStage("p", "", tag, "Fallaste esta", "Espera a la próxima canción.");
      else if (pressedRound === st.round) setStage("p", "ans", tag, "¡Pulsado!", "Esperando al anfitrión…");
      else if (st.phase === "answering") setStage("p", "ans", tag, `Contesta ${nameOf(st, queue[0])}`, "Si falla, puedes pulsar tú.");
      else setStage("p", "open", tag, "¡Pulsa si lo sabes!", st.last && !st.last.ok ? `${nameOf(st, st.last.pid)} falló.` : "");
      if (pos === 0 && lastFirst !== pid) vibrate([80, 60, 80]);
    } else if (st.phase === "reveal") {
      const won = st.last && st.last.ok;
      setStage("p", "rev", `Ronda ${st.round} · ${kindLabel}`, won ? (st.last.pid === pid ? "¡Acertaste!" : `Punto para ${nameOf(st, st.last.pid)}`) : st.timeout ? "¡Se acabó el tiempo!" : "Nadie acertó", "Atento a la siguiente canción.");
    }
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
