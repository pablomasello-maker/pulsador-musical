// Presentación al abrir Temón: vinilo, letras que saltan, notas flotando y un dato curioso de música.
(() => {
  const el = document.getElementById("intro");
  if (!el) return;
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

  let seen = false;
  try { seen = localStorage.getItem("pm_intro") === "1"; } catch {}
  let gone = false, timer = null;
  function close() {
    if (gone) return; gone = true; clearTimeout(timer);
    try { localStorage.setItem("pm_intro", "1"); } catch {}
    try { window.Fx && Fx.sound.pop(); } catch {}
    el.classList.add("out");
    setTimeout(() => el.remove(), 550);
  }
  document.getElementById("introGo").addEventListener("click", (e) => { e.stopPropagation(); close(); });
  // La primera vez espera al botón; las siguientes se va sola o con un toque.
  if (seen) {
    el.classList.add("quick");
    document.getElementById("introSkip").hidden = false;
    el.addEventListener("click", close);
    timer = setTimeout(close, 3600);
  }
})();
