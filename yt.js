// YouTube dentro de Temón: busca el video de cada canción y lo reproduce en un recuadro en la pantalla del anfitrión.
// El reproductor queda a la vista (lo piden las reglas de YouTube); los jugadores no lo ven.
window.Ytp = (() => {
  const params = new URLSearchParams(location.search);
  // Clave de la API de YouTube (restringida a la web de Temón). Vacía: solo se usan los videos ya guardados.
  const KEY = params.get("ytkey") || "";
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const songKey = (s) => (s.title + "|" + s.artist).toLowerCase();
  let cache = ls.get("yt_cache") || {};

  // Video de una canción: primero los guardados en videos.js, luego los de este móvil, y si hay clave, se busca.
  async function find(song) {
    const k = songKey(song);
    const baked = window.VIDEOS && window.VIDEOS[k];
    if (baked) return baked;
    if (k in cache) return cache[k];
    if (!KEY) return null;
    const q = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "1", q: `${song.title} ${song.artist}`, key: KEY });
    try {
      const r = await fetch("https://www.googleapis.com/youtube/v3/search?" + q);
      if (!r.ok) return null; // sin cupo o clave inválida: se juega como siempre
      const j = await r.json();
      const id = j.items && j.items[0] && j.items[0].id && j.items[0].id.videoId || null;
      cache[k] = id; ls.set("yt_cache", cache);
      return id;
    } catch { return null; }
  }
  const canSearch = () => !!KEY || Object.keys(window.VIDEOS || {}).length > 0;

  // ---------- Reproductor ----------
  let api = null, player = null, ready = null, onFail = null;
  function loadApi() {
    if (api) return api;
    api = new Promise((res, rej) => {
      if (window.YT && window.YT.Player) return res();
      window.onYouTubeIframeAPIReady = () => res();
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api"; s.onerror = () => { api = null; rej(new Error("No se pudo cargar YouTube.")); };
      document.head.appendChild(s);
    });
    return api;
  }
  function ensure(box) {
    if (ready) return ready;
    ready = loadApi().then(() => new Promise((res) => {
      const el = document.createElement("div"); box.replaceChildren(el);
      player = new YT.Player(el, {
        width: "100%", height: "100%",
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => res(player),
          // 101/150: el dueño no deja reproducirlo fuera de YouTube.
          onError: (e) => { onFail && onFail(e.data); },
        },
      });
    }));
    ready.catch(() => { ready = null; });
    return ready;
  }
  async function play(box, id, startSec, failCb) {
    onFail = failCb;
    const p = await ensure(box);
    p.loadVideoById({ videoId: id, startSeconds: Math.max(0, Math.floor(startSec || 0)) });
    p.unMute && p.unMute();
  }
  function pause() { try { player && player.pauseVideo(); } catch {} }
  function resume() { try { player && player.playVideo(); } catch {} }
  function seek(sec) { try { player && player.seekTo(Math.max(0, sec), true); player.playVideo(); } catch {} }
  function stop() { try { player && player.stopVideo(); } catch {} }

  return { find, canSearch, play, pause, resume, seek, stop, hasKey: () => !!KEY };
})();
