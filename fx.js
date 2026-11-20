// Shared decorative snow + glitter background. Call once per page.
function initFx(count = 24) {
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  const flakes = ['❄', '❅', '❆', '✦'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'snowflake';
    el.textContent = flakes[i % flakes.length];
    el.style.left = Math.random() * 100 + 'vw';
    el.style.fontSize = (8 + Math.random() * 12) + 'px';
    el.style.animationDuration = (8 + Math.random() * 10) + 's';
    el.style.animationDelay = (Math.random() * 10) + 's';
    el.style.opacity = (0.4 + Math.random() * 0.5).toString();
    layer.appendChild(el);
  }
  for (let i = 0; i < count; i++) {
    const g = document.createElement('span');
    g.className = 'glitter';
    g.style.left = Math.random() * 100 + 'vw';
    g.style.top = Math.random() * 100 + 'vh';
    g.style.animationDelay = (Math.random() * 3) + 's';
    layer.appendChild(g);
  }
  document.body.appendChild(layer);
}

function fireConfetti(container, count = 60) {
  const colors = ['#d4af37', '#f3d675', '#a4172b', '#c7cad1'];
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + 'vw';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = (Math.random() * 0.6) + 's';
    s.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    wrap.appendChild(s);
  }
  (container || document.body).appendChild(wrap);
  setTimeout(() => wrap.remove(), 3200);
}
