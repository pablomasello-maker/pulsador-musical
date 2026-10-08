// Efectos de fiesta: personajes de cada categoría, confeti, destellos, carteles de acierto/fallo y la ruleta de desafíos.
window.Fx = (() => {
  const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

  // ---------- Sonidos (en el propio móvil) ----------
  let ac = null;
  const audio = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch {} return ac; };
  function tone(seq, gap = 0.9) {
    const c = audio(); if (!c) return;
    let t = c.currentTime + 0.02;
    for (const [f, d, type = "triangle", vol = 0.2, slide] of seq) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02); t += d * gap;
    }
  }
  const sound = {
    win: () => tone([[523, .1], [659, .1], [784, .1], [1047, .18], [784, .08], [1047, .45, "square", .14]], 1),
    lose: () => tone([[392, .3, "sawtooth", .16, 370], [370, .3, "sawtooth", .16, 349], [349, .3, "sawtooth", .16, 330], [330, .7, "sawtooth", .16, 260]], 1),
    tick: () => tone([[1400, .03, "square", .08]]),
    pop: () => tone([[300, .12, "sine", .25, 900]]),
  };

  // ---------- Personajes ----------
  const COLORS = { cancion: "#3d8bff", artista: "#ff4fa3", disco: "#22c55e", anio: "#ff8c1a" };
  function face(cx, cy, mood, s = 1) {
    const e = 9 * s, dx = 15 * s, p = 4.5 * s;
    const eyes = [-dx, dx].map((x) => `<circle cx="${cx + x}" cy="${cy}" r="${e}" fill="#fff"/><circle cx="${cx + x + (mood === "sad" ? 0 : 1.5 * s)}" cy="${cy + (mood === "sad" ? 2 * s : 1 * s)}" r="${p}" fill="#14102a"/><circle cx="${cx + x + 3 * s}" cy="${cy - 2 * s}" r="${1.6 * s}" fill="#fff"/>`).join("");
    const my = cy + 17 * s;
    const mouth = mood === "sad"
      ? `<path d="M${cx - 9 * s} ${my + 5 * s} Q${cx} ${my - 5 * s} ${cx + 9 * s} ${my + 5 * s}" fill="none" stroke="#14102a" stroke-width="${3.5 * s}" stroke-linecap="round"/>`
        + `<path d="M${cx - dx - 8 * s} ${cy - 14 * s} L${cx - dx + 6 * s} ${cy - 11 * s} M${cx + dx + 8 * s} ${cy - 14 * s} L${cx + dx - 6 * s} ${cy - 11 * s}" stroke="#14102a" stroke-width="${3 * s}" stroke-linecap="round"/>`
      : mood === "wow"
        ? `<ellipse cx="${cx}" cy="${my + 1 * s}" rx="${5 * s}" ry="${6.5 * s}" fill="#14102a"/>`
        : `<path d="M${cx - 11 * s} ${my - 3 * s} Q${cx} ${my + 11 * s} ${cx + 11 * s} ${my - 3 * s} Z" fill="#14102a"/><path d="M${cx - 5 * s} ${my + 3.5 * s} Q${cx} ${my + 7 * s} ${cx + 5 * s} ${my + 3.5 * s}" fill="#ff6b81"/>`;
    const cheeks = mood === "sad" ? "" : `<circle cx="${cx - dx - 6 * s}" cy="${cy + 12 * s}" r="${4 * s}" fill="#ff7aa8" opacity=".55"/><circle cx="${cx + dx + 6 * s}" cy="${cy + 12 * s}" r="${4 * s}" fill="#ff7aa8" opacity=".55"/>`;
    return cheeks + eyes + mouth;
  }
  const outline = `stroke="#14102a" stroke-width="4" stroke-linejoin="round"`;
  const BODIES = {
    // Nota musical con cara en la cabeza de la nota.
    cancion: (c, m) => `<path d="M78 14 L78 78" stroke="#14102a" stroke-width="12" stroke-linecap="round"/><path d="M78 14 L78 78" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
      <path d="M76 12 Q104 18 104 44 Q96 30 78 30 Z" fill="${c}" ${outline}/>
      <ellipse cx="56" cy="82" rx="34" ry="28" fill="${c}" ${outline}/>${face(56, 80, m, .85)}`,
    // Micrófono.
    artista: (c, m) => `<rect x="50" y="74" width="20" height="38" rx="8" fill="#3a3560" ${outline}/>
      <circle cx="60" cy="50" r="38" fill="${c}" ${outline}/>
      <path d="M30 34 Q60 22 90 34" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="5" stroke-linecap="round"/>${face(60, 52, m, .95)}`,
    // Disco de vinilo con la etiqueta de color.
    disco: (c, m) => `<circle cx="60" cy="60" r="52" fill="#1d1a33" ${outline}/>
      <circle cx="60" cy="60" r="44" fill="none" stroke="#2f2b52" stroke-width="2"/><circle cx="60" cy="60" r="38" fill="none" stroke="#2f2b52" stroke-width="2"/>
      <path d="M22 40 A44 44 0 0 1 48 18" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="60" cy="62" r="30" fill="${c}" stroke="#14102a" stroke-width="3"/>${face(60, 58, m, .7)}`,
    // Calendario.
    anio: (c, m) => `<rect x="14" y="24" width="92" height="86" rx="14" fill="#fff8ec" ${outline}/>
      <path d="M14 38 Q14 24 28 24 L92 24 Q106 24 106 38 L106 46 L14 46 Z" fill="${c}" ${outline}/>
      <rect x="34" y="12" width="8" height="22" rx="4" fill="#3a3560" stroke="#14102a" stroke-width="3"/><rect x="78" y="12" width="8" height="22" rx="4" fill="#3a3560" stroke="#14102a" stroke-width="3"/>${face(60, 70, m, .9)}`,
  };
  function mascot(kind, mood = "happy") {
    const k = BODIES[kind] ? kind : "cancion";
    return `<svg viewBox="0 0 120 120" class="mascot-svg" aria-hidden="true">${BODIES[k](COLORS[k], mood)}</svg>`;
  }

  // ---------- Capa de efectos ----------
  function layer(cls) { const d = document.createElement("div"); d.className = "fx " + (cls || ""); document.body.appendChild(d); return d; }
  function confetti(n = 90) {
    if (reduced()) return;
    const L = layer("confetti");
    const cols = ["#ffb627", "#3d8bff", "#ff4fa3", "#22c55e", "#ff8c1a", "#b48cff", "#fff"];
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("i");
      p.style.background = cols[i % cols.length];
      p.style.left = (W / 2) + "px"; p.style.top = (H * 0.45) + "px";
      if (i % 3 === 0) p.style.borderRadius = "50%";
      L.appendChild(p);
      const ang = Math.random() * Math.PI * 2, sp = 120 + Math.random() * Math.min(W, 420);
      const x = Math.cos(ang) * sp, y = Math.sin(ang) * sp * 0.8 - 160;
      p.animate([
        { transform: "translate(0,0) rotate(0) scale(.6)", opacity: 1 },
        { transform: `translate(${x}px, ${y}px) rotate(${Math.random() * 360}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${x * 1.2}px, ${y + H * 0.8}px) rotate(${Math.random() * 900}deg) scale(1)`, opacity: 0 },
      ], { duration: 1800 + Math.random() * 1200, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" });
    }
    setTimeout(() => L.remove(), 3200);
  }
  function flash(color) {
    const L = layer("flash"); L.style.background = color;
    L.animate([{ opacity: .55 }, { opacity: 0 }], { duration: 650, easing: "ease-out", fill: "forwards" });
    setTimeout(() => L.remove(), 700);
  }
  function shake() {
    if (reduced()) return;
    const w = document.querySelector("body > .wrap");
    w && w.animate([0, -14, 12, -10, 8, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 520, easing: "ease-out" });
  }
  // Cartel grande en el centro, como en los juegos de preguntas.
  function banner(title, sub, kind, mood, color) {
    document.querySelectorAll(".fx.banner").forEach((b) => b.remove());
    const L = layer("banner");
    const card = document.createElement("div"); card.className = "bcard"; card.style.setProperty("--b", color);
    const m = document.createElement("div"); m.className = "bm"; m.innerHTML = mascot(kind, mood);
    const t = document.createElement("p"); t.className = "bt"; t.textContent = title;
    card.append(m, t);
    if (sub) { const s = document.createElement("p"); s.className = "bs"; s.textContent = sub; card.append(s); }
    L.appendChild(card);
    setTimeout(() => { L.classList.add("out"); setTimeout(() => L.remove(), 300); }, 2100);
  }
  function win(title, sub, kind) { banner(title, sub, kind, "happy", "#22c55e"); confetti(); flash("#3ddc97"); sound.win(); }
  function lose(title, sub, kind, quiet) { banner(title, sub, kind, "sad", "#ff5a4e"); flash("#ff3b30"); shake(); if (!quiet) sound.lose(); }
  function info(title, sub, kind) { banner(title, sub, kind, "wow", "#ffb627"); sound.pop(); }

  // ---------- Ruleta ----------
  // items: [{ name, color }], target: índice donde para. Llama a done() al terminar.
  function wheel(items, target, done) {
    document.querySelectorAll(".fx.wheel").forEach((b) => b.remove());
    const L = layer("wheel");
    const n = items.length, seg = 360 / n, R = 140;
    let paths = "";
    items.forEach((it, i) => {
      const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180;
      const x0 = 150 + R * Math.cos(a0), y0 = 150 + R * Math.sin(a0), x1 = 150 + R * Math.cos(a1), y1 = 150 + R * Math.sin(a1);
      const mid = (i + 0.5) * seg;
      const words = it.name.split(" ");
      const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [it.name];
      const txt = lines.map((l, j) => `<tspan x="150" dy="${j ? 13 : lines.length > 1 ? -6 : 0}">${l.replace(/[<&>]/g, "")}</tspan>`).join("");
      paths += `<path d="M150 150 L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="${it.color}" stroke="#14102a" stroke-width="3"/>
        <text transform="rotate(${mid} 150 150) translate(0 -88)" x="150" y="150" text-anchor="middle" class="wl">${txt}</text>`;
    });
    L.innerHTML = `<div class="wbox"><p class="wtitle">¡Ruleta de desafíos!</p><div class="wwrap"><div class="wpin"></div>
      <svg viewBox="0 0 300 300" class="wsvg"><g class="wrot"><circle cx="150" cy="150" r="146" fill="#14102a"/>${paths}
      <circle cx="150" cy="150" r="24" fill="#fff8ec" stroke="#14102a" stroke-width="4"/></g></svg></div><p class="wres"></p></div>`;
    const rot = L.querySelector(".wrot");
    const final = 360 * 5 + (360 - (target + 0.5) * seg) + (Math.random() - 0.5) * seg * 0.6;
    const dur = reduced() ? 300 : 3200;
    rot.style.transformOrigin = "150px 150px";
    const anim = rot.animate([{ transform: "rotate(0deg)" }, { transform: `rotate(${final}deg)` }], { duration: dur, easing: "cubic-bezier(.12,.75,.15,1)", fill: "forwards" });
    // Tic-tic que se va frenando.
    let lastSeg = -1;
    const ticker = setInterval(() => {
      const ct = anim.currentTime || 0, p = Math.min(1, ct / dur);
      const e = 1 - Math.pow(1 - p, 3.2);
      const s = Math.floor(e * final / seg);
      if (s !== lastSeg) { lastSeg = s; sound.tick(); }
    }, 30);
    anim.onfinish = () => {
      clearInterval(ticker);
      L.querySelector(".wres").textContent = items[target].name;
      L.querySelector(".wres").style.color = items[target].color;
      sound.pop();
      setTimeout(() => { L.classList.add("out"); setTimeout(() => { L.remove(); done && done(); }, 300); }, 1100);
    };
    L.onclick = () => { anim.finish(); };
  }

  return { mascot, COLORS, confetti, flash, shake, banner, win, lose, info, wheel, sound, audio };
})();
