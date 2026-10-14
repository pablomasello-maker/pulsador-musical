// Los rivales de la compu: Robotina, DJ Chip y Bit Bunny dibujados en SVG.
// mood: "idle" (parpadea), "think" (piensa), "happy" (festeja) o "sad" (se lamenta). La animación está en style.css.
window.Bots = (() => {
  // Ojos y boca según el ánimo; cx/cy: centro de la cara.
  function face(cx, cy, mood, ink = "#14102a", gap = 13) {
    const L = cx - gap, R = cx + gap;
    let eyes, mouth;
    if (mood === "happy") {
      eyes = `<path d="M${L - 6} ${cy + 2} q6 -9 12 0 M${R - 6} ${cy + 2} q6 -9 12 0" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
      mouth = `<path d="M${cx - 10} ${cy + 11} q10 14 20 0 z" fill="${ink}"/><path d="M${cx - 5} ${cy + 17} q5 4 10 0" fill="#ff6b8a"/>`;
    } else if (mood === "sad") {
      eyes = `<g class="b-eyes"><circle cx="${L}" cy="${cy + 2}" r="4.5" fill="${ink}"/><circle cx="${R}" cy="${cy + 2}" r="4.5" fill="${ink}"/></g>
        <path d="M${L - 7} ${cy - 8} l10 4 M${R + 7} ${cy - 8} l-10 4" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
        <path class="b-tear" d="M${R + 6} ${cy + 7} q3 6 0 9 q-3 -3 0 -9 z" fill="#4fd1ff"/>`;
      mouth = `<path d="M${cx - 8} ${cy + 18} q8 -9 16 0" fill="none" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>`;
    } else if (mood === "think") {
      eyes = `<g class="b-eyes"><circle cx="${L}" cy="${cy}" r="5" fill="#fff"/><circle cx="${R}" cy="${cy}" r="5" fill="#fff"/>
        <circle class="b-look" cx="${L + 2}" cy="${cy - 2}" r="3" fill="${ink}"/><circle class="b-look" cx="${R + 2}" cy="${cy - 2}" r="3" fill="${ink}"/></g>`;
      mouth = `<path d="M${cx - 6} ${cy + 14} h12" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>`;
    } else {
      eyes = `<g class="b-eyes"><circle cx="${L}" cy="${cy}" r="5" fill="${ink}"/><circle cx="${R}" cy="${cy}" r="5" fill="${ink}"/>
        <circle cx="${L + 1.5}" cy="${cy - 1.5}" r="1.6" fill="#fff"/><circle cx="${R + 1.5}" cy="${cy - 1.5}" r="1.6" fill="#fff"/></g>`;
      mouth = `<path d="M${cx - 7} ${cy + 12} q7 7 14 0" fill="none" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>`;
    }
    return eyes + mouth;
  }

  const ART = {
    // Guitarrita: una guitarra eléctrica con cara; las cuerdas vibran y agita los brazos.
    pbotrobotina: (m) => `
      <g class="b-arm b-armL"><path d="M26 70 q-14 0 -18 -14" fill="none" stroke="#14102a" stroke-width="4" stroke-linecap="round"/><circle cx="8" cy="54" r="5" fill="#fff" stroke="#14102a" stroke-width="2"/></g>
      <g class="b-arm b-armR"><path d="M74 70 q14 0 18 -14" fill="none" stroke="#14102a" stroke-width="4" stroke-linecap="round"/><circle cx="92" cy="54" r="5" fill="#fff" stroke="#14102a" stroke-width="2"/></g>
      <g class="b-head">
        <g class="b-ant">
          <rect x="44" y="-2" width="12" height="40" rx="3" fill="#8a5a2b" stroke="#14102a" stroke-width="3"/>
          <rect x="40" y="-6" width="20" height="12" rx="4" fill="#ff4fa3" stroke="#14102a" stroke-width="3"/>
          <circle cx="38" cy="0" r="2.5" fill="#ffd23f"/><circle cx="62" cy="0" r="2.5" fill="#ffd23f"/>
          <path d="M44 8 h12 M44 16 h12 M44 24 h12" stroke="#d9b38c" stroke-width="1.5"/>
        </g>
        <path d="M50 34 c-14 0 -30 2 -30 20 c0 6 6 9 6 14 c0 6 -8 10 -8 20 c0 14 16 18 32 18 c16 0 32 -4 32 -18 c0 -10 -8 -14 -8 -20 c0 -5 6 -8 6 -14 c0 -18 -16 -20 -30 -20 z" fill="#ff4fa3" stroke="#14102a" stroke-width="3.5"/>
        <path d="M50 40 c-9 0 -20 2 -20 14 c0 5 5 8 5 12 c0 5 -6 8 -6 15 c0 10 11 13 21 13 c10 0 21 -3 21 -13 c0 -7 -6 -10 -6 -15 c0 -4 5 -7 5 -12 c0 -12 -11 -14 -20 -14 z" fill="#ffd1e6"/>
        ${face(50, 60, m, "#14102a", 10)}
        <rect x="38" y="88" width="24" height="6" rx="2" fill="#14102a"/>
        <g class="b-strings" stroke="#c7cde8" stroke-width="1.2"><path d="M46 38 V88"/><path d="M50 38 V88"/><path d="M54 38 V88"/></g>
      </g>`,
    // DJ Chip: un disco con auriculares que gira cuando festeja.
    pbotdjchip00: (m) => `
      <path d="M38 92 v10 h-8 M62 92 v10 h8" fill="none" stroke="#14102a" stroke-width="4" stroke-linecap="round"/>
      <g class="b-head">
        <g class="b-disc">
          <circle cx="50" cy="56" r="38" fill="#26224a" stroke="#14102a" stroke-width="3.5"/>
          <circle cx="50" cy="56" r="31" fill="none" stroke="#3d3a6e" stroke-width="2"/>
          <circle cx="50" cy="56" r="24" fill="none" stroke="#3d3a6e" stroke-width="2"/>
          <path d="M22 40 a34 34 0 0 1 20 -18" fill="none" stroke="#8f8bd6" stroke-width="3" stroke-linecap="round" opacity=".7"/>
        </g>
        <circle cx="50" cy="56" r="20" fill="#4fd1ff" stroke="#14102a" stroke-width="3"/>
        ${face(50, 52, m, "#14102a", 9)}
        <path d="M14 50 q0 -40 36 -40 q36 0 36 40" fill="none" stroke="#14102a" stroke-width="7" stroke-linecap="round"/>
        <path d="M14 50 q0 -40 36 -40 q36 0 36 40" fill="none" stroke="#ffb627" stroke-width="3.5" stroke-linecap="round"/>
        <rect x="6" y="44" width="14" height="22" rx="6" fill="#ffb627" stroke="#14102a" stroke-width="3"/>
        <rect x="80" y="44" width="14" height="22" rx="6" fill="#ffb627" stroke="#14102a" stroke-width="3"/>
      </g>
      <g class="b-note"><path d="M84 18 v-12 l9 -3 v12" fill="none" stroke="#ffd23f" stroke-width="2.5"/><circle cx="82" cy="18" r="3" fill="#ffd23f"/><circle cx="91" cy="15" r="3" fill="#ffd23f"/></g>`,
    // Bombito: un tambor con palillos que redobla cuando festeja.
    pbotbitbunny: (m) => `
      <g class="b-ears">
        <g class="b-earL"><path d="M22 30 l-14 -22" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/><circle cx="7" cy="7" r="6" fill="#fff" stroke="#14102a" stroke-width="2.5"/></g>
        <g class="b-earR"><path d="M78 30 l14 -22" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/><circle cx="93" cy="7" r="6" fill="#fff" stroke="#14102a" stroke-width="2.5"/></g>
      </g>
      <path d="M36 98 v8 h-8 M64 98 v8 h8" fill="none" stroke="#14102a" stroke-width="4" stroke-linecap="round"/>
      <g class="b-head">
        <path d="M16 34 v52 q34 18 68 0 v-52" fill="#3d8bff" stroke="#14102a" stroke-width="3.5"/>
        <path d="M16 40 l17 46 M33 40 l17 50 M50 40 l17 50 M67 40 l17 46" stroke="#ffd23f" stroke-width="3" opacity=".9"/>
        <path d="M84 40 l-17 46 M67 40 l-17 50 M50 40 l-17 50 M33 40 l-17 46" stroke="#ffd23f" stroke-width="3" opacity=".9"/>
        <ellipse cx="50" cy="34" rx="34" ry="11" fill="#fff8ec" stroke="#14102a" stroke-width="3.5"/>
        <rect x="26" y="50" width="48" height="34" rx="14" fill="#e6f0ff" stroke="#14102a" stroke-width="2.5"/>
        ${face(50, 62, m, "#14102a", 10)}
      </g>`,
  };
  function svg(id, mood = "idle") {
    const f = ART[id];
    if (!f) return "";
    return `<svg viewBox="-4 -6 108 114" class="botsvg ${id.slice(4)} m-${mood}" aria-hidden="true">${f(mood)}</svg>`;
  }
  return { svg, has: (id) => !!ART[id] };
})();
