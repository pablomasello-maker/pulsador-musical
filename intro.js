// ---------- Riff rockero de la intro ----------
// Tema original de Temón, tocado en vivo con Web Audio: guitarra distorsionada en quintas, bajo y batería.
const SynthRiff = (() => {
  let ac = null, master = null, dist = null, noise = null, timer = null, playing = false, startedAt = 0, step = 0;
  const BPM = 140, E8 = 60 / BPM / 2; // duración de una corchea
  const E2 = 82.41, hz = (st, base = E2) => base * Math.pow(2, st / 12);
  // 4 compases de 8 corcheas. Minúscula = apagado con la palma; "-" sostiene la nota anterior.
  const N = { E: 0, G: 3, A: 5, Bb: 6, B: 7, C: 8, D: 10 };
  const BARS = [
    "e e E - G - A -",
    "e e E - Bb - A -",
    "e e E - G - A -",
    "D - C - B - B -",
  ].map((b) => b.split(" "));

  function setup() {
    if (ac) return true;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = 0.55;
    master.connect(comp).connect(ac.destination);
    dist = ac.createWaveShaper();
    const k = 60, curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    dist.curve = curve; dist.oversample = "4x";
    const tone = ac.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 3200; tone.Q.value = 0.8;
    const gtr = ac.createGain(); gtr.gain.value = 0.16;
    dist.connect(tone).connect(gtr).connect(master);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  const env = (g, t, peak, dur, attack = 0.005) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };

  // Acorde de quinta (tónica, quinta y octava) a través de la distorsión.
  function chord(st, t, dur, mute) {
    const g = ac.createGain(); env(g, t, mute ? 0.5 : 0.9, dur);
    for (const [iv, det] of [[0, -6], [0, 6], [7, 0], [12, 3]]) {
      const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz(st + iv); o.detune.value = det;
      o.connect(g); o.start(t); o.stop(t + dur + 0.05);
    }
    if (mute) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900; g.connect(f).connect(dist); } else g.connect(dist);
    // Bajo una octava abajo.
    const b = ac.createOscillator(), bg = ac.createGain(), bf = ac.createBiquadFilter();
    b.type = "square"; b.frequency.value = hz(st) / 2; bf.type = "lowpass"; bf.frequency.value = 380;
    env(bg, t, 0.22, dur * 0.95); b.connect(bf).connect(bg).connect(master); b.start(t); b.stop(t + dur + 0.05);
  }
  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    env(g, t, 0.9, 0.35, 0.002); o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
  }
  function hiss(t, dur, type, freq, vol) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; f.type = type; f.frequency.value = freq; env(g, t, vol, dur, 0.002);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function snare(t) {
    hiss(t, 0.2, "bandpass", 1900, 0.5);
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 190; env(g, t, 0.3, 0.1, 0.002);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.15);
  }
  const hat = (t, open) => hiss(t, open ? 0.25 : 0.05, "highpass", 7500, open ? 0.18 : 0.12);
  const crash = (t) => hiss(t, 1.6, "highpass", 5000, 0.3);

  function scheduleStep(i, t) {
    const bar = Math.floor(i / 8) % BARS.length, s = i % 8, tok = BARS[bar][s];
    if (tok !== "-") {
      let len = 1; while (s + len < 8 && BARS[bar][s + len] === "-") len++;
      const mute = tok === tok.toLowerCase() && tok !== "-";
      chord(N[tok[0].toUpperCase() + tok.slice(1)], t, mute ? E8 * 0.8 : E8 * len * 0.95, mute);
    }
    if (s === 0 || s === 4 || s === 5) kick(t);
    if (bar === 3 && s >= 4) snare(t); else if (s === 2 || s === 6) snare(t);
    hat(t, s === 7);
    if (i % 32 === 0) crash(t);
  }
  function tick() {
    if (!playing) return;
    while (startedAt + step * E8 < ac.currentTime + 0.15) { scheduleStep(step, startedAt + step * E8); step++; }
    timer = setTimeout(tick, 40);
  }
  function start() {
    if (playing || !setup()) return;
    ac.resume();
    playing = true; step = 0; startedAt = ac.currentTime + 0.08;
    master.gain.cancelScheduledValues(0); master.gain.value = 0.55;
    tick();
  }
  // Final: acorde grande que suena y se apaga.
  function finish() {
    if (!setup()) return;
    ac.resume();
    playing = false; clearTimeout(timer);
    const t = Math.max(ac.currentTime + 0.03, startedAt + step * E8);
    chord(N.E, t, 2.2, false); kick(t); crash(t);
    master.gain.setValueAtTime(0.55, t + 1.2); master.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  }
  function stop() { playing = false; clearTimeout(timer); if (master) { master.gain.cancelScheduledValues(0); master.gain.value = 0; } }
  const running = () => !!ac && ac.state === "running";
  const isPlaying = () => playing;
  return { setup, start, finish, stop, running, isPlaying, resume: () => ac && ac.resume() };
})();

// Grabación del tema (audio/intro-loop.mp3 y audio/intro-end.mp3, hechos para Temón). Si no carga, se toca el riff sintetizado.
window.IntroRiff = (() => {
  const LOOP_START = 0.5, LOOP_LEN = 8 * 4 * 60 / 140; // 8 compases a 140 bpm
  let ac = null, out = null, bufs = null, loading = null, src = null, want = false, useSynth = false;
  function setup() {
    if (useSynth) return SynthRiff.setup();
    if (ac) return true;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { useSynth = true; return SynthRiff.setup(); }
    out = ac.createGain(); out.gain.value = 0.8; out.connect(ac.destination);
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.arrayBuffer(); }).then((b) => new Promise((res, rej) => ac.decodeAudioData(b, res, rej)));
    loading = Promise.all([get("audio/intro-loop.mp3"), get("audio/intro-end.mp3")])
      .then(([loop, end]) => { bufs = { loop, end }; if (want) playLoop(); })
      .catch(() => { useSynth = true; if (want) SynthRiff.start(); });
    return true;
  }
  function playLoop() {
    if (src || !bufs) return;
    out.gain.cancelScheduledValues(0); out.gain.value = 0.8;
    src = ac.createBufferSource(); src.buffer = bufs.loop; src.loop = true;
    src.loopStart = LOOP_START; src.loopEnd = LOOP_START + LOOP_LEN;
    src.connect(out); src.start(ac.currentTime + 0.02, LOOP_START);
  }
  function start() {
    if (useSynth) return SynthRiff.start();
    if (!setup() || useSynth) return SynthRiff.start();
    ac.resume(); want = true; playLoop();
  }
  function finish() {
    if (useSynth) return SynthRiff.finish();
    if (!setup()) return;
    ac.resume(); want = false;
    const t = ac.currentTime + 0.02;
    if (src) { const old = src, g = ac.createGain(); old.disconnect(); old.connect(g).connect(out); g.gain.setValueAtTime(1, t); g.gain.linearRampToValueAtTime(0, t + 0.08); old.stop(t + 0.1); src = null; }
    const hit = () => { const e = ac.createBufferSource(); e.buffer = bufs.end; e.connect(out); e.start(ac.currentTime + 0.01); };
    if (bufs) hit(); else if (loading) loading.then(() => bufs && hit());
  }
  function stop() {
    want = false;
    if (useSynth) return SynthRiff.stop();
    if (src) { try { src.stop(); } catch {} src = null; }
  }
  return {
    setup, start, finish, stop,
    running: () => (useSynth ? SynthRiff.running() : !!ac && ac.state === "running"),
    isPlaying: () => (useSynth ? SynthRiff.isPlaying() : want),
    resume: () => (useSynth ? SynthRiff.resume() : ac && ac.resume()),
  };
})();

// Presentación al abrir Temón: vinilo, letras que saltan, notas flotando y un dato curioso de música.
(() => {
  const el = document.getElementById("intro");
  if (!el) return;
  document.documentElement.classList.add("introOpen");
  const FACTS = [
    "«Bohemian Rhapsody» de Queen dura casi 6 minutos y no tiene estribillo.",
    "Los Beatles grabaron su primer disco, «Please Please Me», en un solo día de 1963.",
    "«Yesterday» de Paul McCartney empezó llamándose «Scrambled Eggs» (huevos revueltos).",
    "«Despacito» fue el primer video de YouTube en pasar las 5.000 millones de vistas.",
    "Freddie Mercury nació en Zanzíbar, una isla frente a la costa de África.",
    "«La bamba» es un son tradicional de Veracruz que Ritchie Valens hizo famoso en 1958.",
    "«De música ligera» de Soda Stereo salió en «Canción animal», de 1990.",
    "«Thriller» de Michael Jackson es considerado el disco más vendido de la historia.",
  ];
  document.getElementById("introFact").textContent = FACTS[Math.floor(Math.random() * FACTS.length)];

  // Notas que suben por el fondo.
  const notes = el.querySelector(".inotes");
  const SYM = ["♪", "♫", "♩", "♬"], COL = ["#ffb627", "#ff4fa3", "#3d8bff", "#3ddc97", "#ff8c1a"];
  for (let i = 0; i < 16; i++) {
    const n = document.createElement("span");
    n.textContent = SYM[i % SYM.length];
    n.style.cssText = `left:${Math.random() * 96}%;color:${COL[i % COL.length]};font-size:${18 + Math.random() * 26}px;animation-delay:${-Math.random() * 8}s;animation-duration:${6 + Math.random() * 5}s`;
    notes.appendChild(n);
  }

  // Música: arranca sola si el celu lo deja (app instalada); si no, con el primer toque.
  let soundOn = true;
  try { soundOn = localStorage.getItem("pm_introsound") !== "0"; } catch {}
  const snd = document.getElementById("introSnd");
  const paint = () => { snd.textContent = soundOn ? "🔊" : "🔇"; snd.setAttribute("aria-label", soundOn ? "Silenciar música" : "Poner música"); };
  paint();
  function music() {
    if (!soundOn || gone || IntroRiff.isPlaying()) return;
    IntroRiff.start();
  }
  snd.addEventListener("click", (e) => {
    e.stopPropagation();
    soundOn = !soundOn; paint();
    try { localStorage.setItem("pm_introsound", soundOn ? "1" : "0"); } catch {}
    if (soundOn) music(); else IntroRiff.stop();
  });
  el.addEventListener("pointerdown", music, { once: true });
  setTimeout(() => { if (IntroRiff.setup()) { IntroRiff.resume(); setTimeout(() => { if (IntroRiff.running()) music(); }, 120); } }, 300);

  let seen = false;
  try { seen = localStorage.getItem("pm_intro") === "1"; } catch {}
  let gone = false, timer = null;
  function close() {
    if (gone) return; gone = true; clearTimeout(timer);
    try { localStorage.setItem("pm_intro", "1"); } catch {}
    if (soundOn) IntroRiff.finish(); else IntroRiff.stop();
    el.classList.add("out");
    document.documentElement.classList.remove("introOpen");
    setTimeout(() => el.remove(), 550);
  }
  document.getElementById("introGo").addEventListener("click", (e) => { e.stopPropagation(); close(); });
  // En la compu también se cierra con Enter o Esc.
  const onKey = (e) => { if (e.key === "Enter" || e.key === "Escape") { document.removeEventListener("keydown", onKey); close(); } };
  document.addEventListener("keydown", onKey);
  // La primera vez espera al botón; las siguientes se va sola o con un toque.
  if (seen) {
    el.classList.add("quick");
    document.getElementById("introSkip").hidden = false;
    el.addEventListener("click", close);
    timer = setTimeout(close, 4200);
  }
})();
