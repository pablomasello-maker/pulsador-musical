// Spotify para el móvil anfitrión: inicio de sesión PKCE (sin servidor) y control de la reproducción.
// Solo el anfitrión inicia sesión; los jugadores nunca tocan Spotify.
window.Spotify = (() => {
  const SCOPES = "user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative";
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const redirectUri = () => location.origin + location.pathname;
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const randomString = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); };

  let tok = null;
  try { tok = JSON.parse(ls.get("sp_tok") || "null"); } catch {}
  const save = (t) => { tok = t; ls.set("sp_tok", t ? JSON.stringify(t) : null); };

  // Client ID de la app de Spotify del juego. Con él puesto, el anfitrión solo pulsa "Conectar Spotify".
  // No es secreto: con PKCE cualquier app web lo lleva a la vista.
  const BUILTIN = "7c70696d87d445ccbd079a7351f8e134";
  function builtin() { return !!BUILTIN; }
  function clientId() { return BUILTIN || ls.get("sp_cid") || ""; }
  function connected() { return !!(tok && tok.refresh_token); }

  async function login(cid) {
    cid = String(cid || BUILTIN || "").trim();
    if (!/^[A-Za-z0-9]{20,64}$/.test(cid)) throw new Error("El Client ID no parece correcto. Cópialo tal cual de tu app de Spotify.");
    if (!BUILTIN) ls.set("sp_cid", cid);
    const verifier = randomString(64);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = randomString(16);
    ls.set("sp_ver", verifier); ls.set("sp_state", state);
    const q = new URLSearchParams({ client_id: cid, response_type: "code", redirect_uri: redirectUri(), code_challenge_method: "S256", code_challenge: challenge, scope: SCOPES, state });
    location.assign("https://accounts.spotify.com/authorize?" + q);
  }

  async function tokenRequest(body) {
    const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || "Spotify rechazó el inicio de sesión.");
    return { access_token: j.access_token, refresh_token: j.refresh_token || (tok && tok.refresh_token), exp: Date.now() + (j.expires_in - 60) * 1000 };
  }

  // Si volvemos de Spotify con ?code=..., cambia el código por un token. Devuelve true si había vuelta de Spotify.
  async function handleRedirect() {
    const p = new URLSearchParams(location.search);
    if (!p.has("code") && !p.has("error")) return false;
    const state = p.get("state");
    const clean = () => history.replaceState(null, "", redirectUri());
    if (!state || state !== ls.get("sp_state")) { clean(); return false; }
    clean();
    if (p.has("error")) throw new Error(p.get("error") === "access_denied" ? "Cancelaste la conexión con Spotify." : "Spotify devolvió un error: " + p.get("error"));
    save(await tokenRequest({ grant_type: "authorization_code", code: p.get("code"), redirect_uri: redirectUri(), client_id: clientId(), code_verifier: ls.get("sp_ver") || "" }));
    ls.set("sp_ver", null); ls.set("sp_state", null);
    return true;
  }

  async function accessToken() {
    if (!connected()) throw new Error("Spotify no está conectado.");
    if (Date.now() > tok.exp) save(await tokenRequest({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: clientId() }));
    return tok.access_token;
  }

  async function api(path, opts = {}) {
    const url = path.startsWith("https://") ? path : "https://api.spotify.com/v1" + path;
    const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + await accessToken(), ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
    if (r.status === 204 || r.status === 202) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const reason = j && j.error && (j.error.reason || j.error.message);
      const e = new Error(reason || "Error de Spotify " + r.status);
      e.status = r.status; e.reason = reason;
      throw e;
    }
    return j;
  }

  async function me() { return api("/me"); }

  async function playlists() {
    const out = [];
    let next = "/me/playlists?limit=50";
    while (next && out.length < 200) {
      const j = await api(next);
      for (const p of j.items || []) if (p) out.push({ id: p.id, name: p.name, total: (p.items || p.tracks || {}).total });
      next = j.next;
    }
    return out;
  }

  // Canciones de una playlist (hasta 500). Spotify renombró /tracks a /items en 2026; probamos los dos.
  const toTrack = (t) => ({
    uri: t.uri,
    title: t.name,
    artist: (t.artists || []).map((a) => a.name).join(", "),
    album: t.album ? t.album.name : "",
    year: t.album && t.album.release_date ? t.album.release_date.slice(0, 4) : "",
    img: t.album && t.album.images && t.album.images.length ? (t.album.images[1] || t.album.images[0]).url : "",
    ms: t.duration_ms || 0,
  });

  // Acepta el link para compartir de Spotify, una URI spotify:playlist:... o el ID suelto.
  function parsePlaylist(input) {
    const v = String(input || "").trim();
    const m = v.match(/playlist[/:]([A-Za-z0-9]{22})/) || v.match(/^([A-Za-z0-9]{22})$/);
    return m ? m[1] : null;
  }
  async function playlistName(id) {
    try { const j = await api(`/playlists/${encodeURIComponent(id)}?fields=name`); return (j && j.name) || ""; } catch { return ""; }
  }

  async function playlistTracks(id) {
    const tracks = [];
    let next = `/playlists/${encodeURIComponent(id)}/items?limit=50`;
    try { await api(next); } catch (e) { if (e.status === 404) next = `/playlists/${encodeURIComponent(id)}/tracks?limit=50`; else throw e; }
    while (next && tracks.length < 500) {
      const j = await api(next);
      for (const it of j.items || []) {
        const t = it && (it.track || it.item);
        if (!t || t.type !== "track" || !t.uri || t.is_local) continue;
        tracks.push(toTrack(t));
      }
      next = j.next;
    }
    return tracks;
  }

  const noDevice = (e) => e.status === 404 || e.reason === "NO_ACTIVE_DEVICE";
  const deviceMsg = "Abre la app de Spotify en este móvil, pon cualquier canción un segundo y vuelve aquí.";

  async function play(track, pos) {
    // Por defecto empieza a un tercio de la canción para saltar intros largas.
    if (typeof pos !== "number") pos = track.ms > 90000 ? Math.floor(track.ms * 0.3) : 0;
    try { await api("/me/player/play", { method: "PUT", body: JSON.stringify({ uris: [track.uri], position_ms: pos }) }); }
    catch (e) { if (noDevice(e)) throw new Error(deviceMsg); throw e; }
  }
  // Modo link: Spotify no deja leer las canciones de playlists ajenas, pero sí reproducirlas.
  // Ponemos la playlist en aleatorio y preguntamos qué está sonando.
  async function playContext(id) {
    try {
      await api("/me/player/shuffle?state=true", { method: "PUT" }).catch((e) => { if (noDevice(e)) throw e; });
      await api("/me/player/play", { method: "PUT", body: JSON.stringify({ context_uri: "spotify:playlist:" + id }) });
    } catch (e) { if (noDevice(e)) throw new Error(deviceMsg); throw e; }
  }
  async function next() {
    try { await api("/me/player/next", { method: "POST" }); }
    catch (e) { if (noDevice(e)) throw new Error(deviceMsg); throw e; }
  }
  async function seek(ms) { try { await api("/me/player/seek?position_ms=" + Math.max(0, Math.floor(ms)), { method: "PUT" }); } catch {} }
  // Espera a que suene una canción distinta de "prev" (hasta ~6 s) y la devuelve.
  async function nowPlaying(prev) {
    let last = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, i ? 400 : 700));
      const j = await api("/me/player/currently-playing").catch(() => null);
      const t = j && (j.item || j.track);
      if (t && t.type === "track" && t.uri) { last = toTrack(t); if (t.uri !== prev) return last; }
    }
    return last;
  }

  async function pause() { try { await api("/me/player/pause", { method: "PUT" }); } catch {} }
  async function resume() { try { await api("/me/player/play", { method: "PUT" }); } catch {} }
  function logout() { save(null); }

  return { builtin, redirectUri, clientId, connected, login, handleRedirect, me, playlists, playlistTracks, parsePlaylist, playlistName, playContext, next, seek, nowPlaying, play, pause, resume, logout };
})();
