// Cassette animado: entra en la pletina, las bobinas giran mientras suena la música y se paran cuando se corta.
window.Cassette = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const RMIN = 15, RMAX = 33; // radio de la cinta enrollada en cada bobina

  function hub(cx, cy) {
    let teeth = "";
    for (let i = 0; i < 6; i++) teeth += `<rect x="${cx - 2}" y="${cy - 11}" width="4" height="5" rx="1" transform="rotate(${i * 60} ${cx} ${cy})" class="tooth"/>`;
    return `<g class="reel"><circle class="tape-wound" cx="${cx}" cy="${cy}" r="${RMIN}"/>
      <circle cx="${cx}" cy="${cy}" r="12" class="hub"/>${teeth}
      <circle cx="${cx}" cy="${cy}" r="4" class="hub-hole"/>
      <rect x="${cx - 1}" y="${cy - 12}" width="2" height="9" class="spoke"/></g>`;
  }

  const TEMPLATE = `
  <svg viewBox="0 0 300 190" role="img" aria-label="Cassette">
    <defs><clipPath id="CLIP"><rect x="66" y="70" width="168" height="44" rx="22"/></clipPath></defs>
    <g class="shell-g">
      <rect x="4" y="4" width="292" height="182" rx="14" class="shell"/>
      <circle cx="18" cy="18" r="4" class="screw"/><circle cx="282" cy="18" r="4" class="screw"/>
      <circle cx="18" cy="172" r="4" class="screw"/><circle cx="282" cy="172" r="4" class="screw"/>
      <g class="label-g">
        <rect x="22" y="14" width="256" height="118" rx="6" class="label"/>
        <rect x="22" y="14" width="256" height="10" rx="4" class="label-stripe"/>
        <text x="34" y="46" class="label-title"></text>
        <text x="34" y="62" class="label-sub"></text>
        <text x="266" y="46" class="label-side" text-anchor="end">A</text>
        <rect x="62" y="66" width="176" height="52" rx="26" class="window-rim"/>
      </g>
      <rect x="66" y="70" width="168" height="44" rx="22" class="window"/>
      <g clip-path="url(#CLIP)">
        <line x1="103" y1="114" x2="197" y2="114" class="tape-line"/>
        ${hub(103, 92)}${hub(197, 92)}
      </g>
      <path d="M58 186 L78 146 L222 146 L242 186 Z" class="mouth"/>
      <circle cx="100" cy="170" r="5" class="hole"/><circle cx="200" cy="170" r="5" class="hole"/>
      <rect x="136" y="160" width="28" height="10" rx="2" class="hole"/>
    </g>
  </svg>`;

  let uid = 0;
  function mount(el) {
    const id = "cc" + (++uid);
    el.innerHTML = TEMPLATE.replace(/CLIP/g, id + "clip");
    el.classList.add("deck");
    const $ = (s) => el.querySelector(s);
    const title = $(".label-title"), sub = $(".label-sub"), label = $(".label"), stripe = $(".label-stripe");
    const wound = el.querySelectorAll(".tape-wound");
    let flickerTimer = null;

    const fit = (t, max) => (t.length > max ? t.slice(0, max - 1) + "…" : t);
    const api = {
      setLabel(t, s, color) {
        title.textContent = fit(t || "", 22);
        sub.textContent = fit(s || "", 36);
        if (color) { label.style.fill = color; stripe.style.fill = "rgba(0,0,0,.18)"; }
      },
      setPlaying(on) { el.classList.toggle("playing", !!on); },
      // 0 = cinta toda a la izquierda, 1 = toda a la derecha
      setTape(f) {
        f = Math.min(1, Math.max(0, f));
        const area = RMAX * RMAX - RMIN * RMIN; // reparte la cinta conservando el área
        wound[0].setAttribute("r", Math.sqrt(RMIN * RMIN + area * (1 - f)).toFixed(1));
        wound[1].setAttribute("r", Math.sqrt(RMIN * RMIN + area * f).toFixed(1));
      },
      insert() { el.classList.remove("inserting"); void el.offsetWidth; el.classList.add("inserting"); },
      flip() { el.classList.remove("flipping"); void el.offsetWidth; el.classList.add("flipping"); },
      // Ruleta: va pasando etiquetas rápido y se queda en la final.
      flicker(options, final, done) {
        clearInterval(flickerTimer);
        let n = 0;
        flickerTimer = setInterval(() => {
          const o = options[n % options.length]; n++;
          api.setLabel(o[0], "Girando la ruleta…", o[1]);
          if (n > 14) { clearInterval(flickerTimer); api.setLabel(final[0], final[1], final[2]); api.flip(); done && done(); }
        }, 90);
      },
      busy() { return !!flickerTimer && el.dataset.flick === "1"; },
    };
    api.setTape(0);
    return api;
  }
  return { mount };
})();
