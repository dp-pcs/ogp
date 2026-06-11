/* federation-art.js — animated open-ring / node motif.
   Two gateway rings connected by a signal that travels the link.
   Pure SVG + SMIL-free CSS animation; injected into #hero-art and a
   simplified mark into #companion-visual. */
(function () {
  function ring(cx, cy, r, sw, opts) {
    opts = opts || {};
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${opts.stroke || 'url(#ringGrad)'}" stroke-width="${sw}"
      stroke-linecap="round" stroke-dasharray="${opts.dash || (2 * Math.PI * r * 0.82) + ' ' + (2 * Math.PI * r * 0.18)}"
      transform="rotate(${opts.rot || -13} ${cx} ${cy})" ${opts.cls ? `class="${opts.cls}"` : ''}/>`;
  }

  const hero = document.getElementById('hero-art');
  if (hero) {
    hero.innerHTML = `
    <svg viewBox="0 0 460 420" width="100%" style="max-width:460px;overflow:visible" aria-hidden="true">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#5BA8FF"/><stop offset=".5" stop-color="#2E8BFF"/><stop offset="1" stop-color="#CFEFFF"/>
        </linearGradient>
        <linearGradient id="ringGrad2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#2E8BFF"/><stop offset="1" stop-color="#35D6FF"/>
        </linearGradient>
        <radialGradient id="nodeGrad" cx=".5" cy=".5" r=".5">
          <stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#DCF6FF"/><stop offset="1" stop-color="#35D6FF"/>
        </radialGradient>
        <radialGradient id="haze" cx=".5" cy=".5" r=".5">
          <stop offset="0" stop-color="#35D6FF" stop-opacity=".5"/><stop offset="1" stop-color="#35D6FF" stop-opacity="0"/>
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="3.5"/></filter>
      </defs>

      <!-- link line -->
      <line x1="150" y1="150" x2="310" y2="270" stroke="rgba(53,214,255,0.25)" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/>
      <circle r="5" fill="url(#nodeGrad)" class="signal">
        <animateMotion dur="2.8s" repeatCount="indefinite" path="M150,150 L310,270" keyPoints="0;1" keyTimes="0;1" calcMode="linear"/>
      </circle>

      <!-- gateway A -->
      <circle cx="150" cy="150" r="92" fill="url(#haze)" filter="url(#soft)" opacity=".7"/>
      ${ring(150, 150, 70, 17, { cls: 'spinA' })}
      <circle cx="150" cy="150" r="9" fill="url(#nodeGrad)"/>
      <circle cx="208" cy="98" r="13" fill="url(#haze)"/>
      <circle cx="208" cy="98" r="6" fill="url(#nodeGrad)"/>

      <!-- gateway B -->
      <circle cx="310" cy="270" r="78" fill="url(#haze)" filter="url(#soft)" opacity=".55"/>
      ${ring(310, 270, 54, 14, { stroke: 'url(#ringGrad2)', cls: 'spinB', rot: 160, dash: (2 * Math.PI * 54 * 0.8) + ' ' + (2 * Math.PI * 54 * 0.2) })}
      <circle cx="310" cy="270" r="7" fill="url(#nodeGrad)"/>
      <circle cx="356" cy="228" r="10" fill="url(#haze)"/>
      <circle cx="356" cy="228" r="4.5" fill="url(#nodeGrad)"/>
    </svg>`;
  }

  const comp = document.getElementById('companion-visual');
  if (comp) {
    comp.innerHTML = `
    <svg viewBox="0 0 300 300" width="100%" style="max-width:300px;overflow:visible" aria-hidden="true">
      <defs>
        <linearGradient id="cRing" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#5BA8FF"/><stop offset=".5" stop-color="#2E8BFF"/><stop offset="1" stop-color="#CFEFFF"/>
        </linearGradient>
        <radialGradient id="cNode" cx=".5" cy=".5" r=".5">
          <stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#DCF6FF"/><stop offset="1" stop-color="#35D6FF"/>
        </radialGradient>
        <radialGradient id="cHaze" cx=".5" cy=".5" r=".5">
          <stop offset="0" stop-color="#35D6FF" stop-opacity=".55"/><stop offset="1" stop-color="#35D6FF" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="150" cy="150" r="120" fill="url(#cHaze)" opacity=".5"/>
      <circle cx="150" cy="150" r="92" fill="none" stroke="url(#cRing)" stroke-width="22" stroke-linecap="round"
        stroke-dasharray="${(2 * Math.PI * 92 * 0.82).toFixed(0)} ${(2 * Math.PI * 92 * 0.18).toFixed(0)}"
        transform="rotate(-13 150 150)" class="spinA"/>
      <circle cx="214" cy="92" r="20" fill="url(#cHaze)"/>
      <circle cx="214" cy="92" r="9" fill="url(#cNode)"/>
    </svg>`;
  }

  // inject keyframes
  const css = document.createElement('style');
  css.textContent = `
    @keyframes spinSlow { to { transform: rotate(360deg); } }
    .spinA { transform-box: fill-box; transform-origin: center; animation: spinSlow 26s linear infinite; }
    .spinB { transform-box: fill-box; transform-origin: center; animation: spinSlow 18s linear infinite reverse; }
    .signal { filter: drop-shadow(0 0 5px rgba(53,214,255,0.9)); }
    @media (prefers-reduced-motion: reduce) {
      .spinA, .spinB { animation: none; }
      .signal animateMotion { display:none; }
    }`;
  document.head.appendChild(css);
})();
