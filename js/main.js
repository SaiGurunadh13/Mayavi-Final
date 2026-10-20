/* MAYAVI CINEMATIC — main.js
   Order: intro → hero entrance → scroll timeline (hero pull-back, cuts, pinned wings, horizontal tools,
   sticky experience, final scene). Everything animated is transform/opacity. */
(() => {
  'use strict';
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine) and (min-width:992px)').matches;
  const small = innerWidth < 992;
  const SECTIONS = [['hero', 'HOME'], ['wings', 'WINGS'], ['tools', 'TOOLS'], ['experience', 'EXPERIENCE'], ['join', 'JOIN']];

  /* ---------- text split: words masked, characters slide up (keeps inline <span> styling) ---------- */
  const split = el => {
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const f = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(w => {
          if (!w) return;
          if (/^\s+$/.test(w)) return f.append(' ');
          const sw = document.createElement('span'); sw.className = 'w';
          [...w].forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; sw.append(c); });
          f.append(sw);
        });
        n.replaceWith(f);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(el); el.setAttribute('aria-label', el.textContent); return $$('.c', el);
  };
  const chars = new Map();
  if (!reduced) $$('.split').forEach(el => { const c = split(el); chars.set(el, c); gsap.set(c, { yPercent: 115, rotate: 5 }); });
  if (!reduced) gsap.set('.hero .r, .join .r', { opacity: 0, y: 30 });

  /* ---------- particles (single canvas each, paused off-screen) ---------- */
  const particles = (canvas, n, mouse) => {
    const ctx = canvas.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 1.5); let w, h, run = false, pts = [];
    const size = () => { w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener('resize', size);
    pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, z: .3 + Math.random() * .7, vy: -.08 - Math.random() * .25, c: Math.random() < .2 ? '0,240,255' : '192,132,252' }));
    const tick = () => {
      if (!run) return; ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.y += p.vy * p.z; p.x += Math.sin(p.y * .01) * .08; if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
        const ox = mouse ? mouse.x * 30 * p.z : 0, oy = mouse ? mouse.y * 30 * p.z : 0;
        ctx.fillStyle = `rgba(${p.c},${.25 + p.z * .55})`; ctx.fillRect(p.x + ox, p.y + oy, p.z * 2.2, p.z * 2.2);
      }
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => { const on = e.isIntersecting; if (on && !run) { run = true; tick(); } run = on; }).observe(canvas);
  };
  const mouse = { x: 0, y: 0 };
  if (!reduced) { particles($('#fx'), small ? 35 : 90, mouse); particles($('#fx2'), small ? 25 : 60); }

  /* ---------- cursor: DEFAULT / VIEW-ENTER-EXPLORE (label) / LINK / CLICK / DRAG ---------- */
  if (fine && !reduced) {
    document.body.classList.add('has-cursor');
    const dot = $('.cursor-dot'), ring = $('.cursor-ring'), lab = $('span', ring);
    const rx = gsap.quickTo(ring, 'x', { duration: .45, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: .45, ease: 'power3' });
    addEventListener('mousemove', e => { gsap.set(dot, { x: e.clientX, y: e.clientY }); rx(e.clientX); ry(e.clientY); mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; }, { passive: true });
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-cursor]'), l = e.target.closest('a,button');
      document.body.classList.toggle('c-label', !!t); document.body.classList.toggle('c-link', !t && !!l);
      if (t) lab.textContent = t.dataset.cursor;
    }, { passive: true });
    addEventListener('mousedown', () => document.body.classList.add('c-down')); addEventListener('mouseup', () => document.body.classList.remove('c-down'));
    // hero mouse parallax (depth: modules move opposite to emblem)
    const ex = gsap.quickTo('.emblem', 'x', { duration: 1.2 }), ey = gsap.quickTo('.emblem', 'y', { duration: 1.2 });
    const mods = $$('.mod').map((m, i) => [gsap.quickTo(m, 'x', { duration: 1.4 }), gsap.quickTo(m, 'y', { duration: 1.4 }), i % 2 ? 1 : -1]);
    addEventListener('mousemove', () => { ex(mouse.x * 26); ey(mouse.y * 26); mods.forEach(([x, y, d]) => { x(mouse.x * 44 * d); y(mouse.y * 30 * d); }); }, { passive: true });
  }

  /* ---------- header, nav, anchors ---------- */
  const header = $('#header'), nav = $('#nav'), tog = $('.nav-toggle');
  const closeNav = () => {
    if (!nav || !tog) return;
    nav.classList.remove('open'); tog.setAttribute('aria-expanded', 'false');
    if (tog.firstElementChild) tog.firstElementChild.className = 'bi bi-list';
    document.body.classList.remove('nav-open');
  };
  if (tog && nav) tog.addEventListener('click', () => {
    const o = nav.classList.toggle('open'); tog.setAttribute('aria-expanded', String(o));
    if (tog.firstElementChild) tog.firstElementChild.className = o ? 'bi bi-x' : 'bi bi-list';
    document.body.classList.toggle('nav-open', o);
  });
  if (nav) nav.addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });
  const go = id => {
    const el = document.getElementById(id); if (!el) return;
    const st = ScrollTrigger.getAll().find(s => s.pin === el);
    const y = id === 'hero' ? 0 : st ? st.start : el.getBoundingClientRect().top + scrollY;
    scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    e.preventDefault(); closeNav(); go(a.getAttribute('href').slice(1) || 'hero');
  });
  const replay = $('#replay');
  if (replay) replay.addEventListener('click', e => { e.preventDefault(); location.reload(); });

  /* ---------- hero entrance (runs after intro completes) ---------- */
  const heroIn = () => {
    if (reduced) { gsap.set('.r', { clearProps: 'all' }); return; }
    const t = gsap.timeline({ defaults: { ease: 'expo.out' } });
    t.from('.bg-grid,.glow', { opacity: 0, duration: 2 }, 0)                                   // 1 background from black
     .from('#fx', { opacity: 0, duration: 2 }, .3)                                              // 2 particles
     .from('.emblem-logo', { scale: .5, opacity: 0, duration: 1.8 }, .5)                        // 3 emblem
     .from('.ring', { scale: .6, opacity: 0, duration: 1.6, stagger: .15 }, .8)                 // 4 orbital rings
     .to(chars.get($('.hero-title .split')) || [], { yPercent: 0, rotate: 0, duration: 1.3, stagger: .03 }, 1.0)
     .to(chars.get($('.hero-title .split:last-child')) || [], { yPercent: 0, rotate: 0, duration: 1.3, stagger: .04 }, 1.3) // 5 typography
     .to('.hero .r', { opacity: 1, y: 0, duration: 1.2, stagger: .12 }, 1.7)                    // 6-7 text + buttons
     .from('.mod', { opacity: 0, scale: .8, duration: 1, stagger: .12 }, 2.0);                  // 8 modules
  };

  /* ---------- start: hero entrance waits for the VR intro to complete ---------- */
  const introSection = document.getElementById('vr-intro');
  const introIsActive = introSection && !introSection.classList.contains('is-finished');
  if (introIsActive) {
    // Wait for the intro-complete event dispatched by vr-intro.js
    window.addEventListener('intro-complete', () => {
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(heroIn, 150));
    }, { once: true });
  } else {
    // No intro or already finished — run immediately
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(heroIn, 150));
  }

  /* ---------- section progress: navbar line, % readout, rail ---------- */
  const np = $('.navprog'), npl = $('#np-label'), npp = $('#np-pct'), links = $$('.rail a');
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => {
    npp.textContent = Math.round(s.progress * 100) + '%'; np.style.setProperty('--p', s.progress.toFixed(4));
    header.classList.toggle('scrolled', scrollY > 40);
  } });
  $$('.rail a').forEach(a => a.addEventListener('click', () => {}));
  // pinned sections live inside a pin-spacer; track the spacer so positions include the pinned scroll distance
  const bindSections = () => SECTIONS.forEach(([id, label], i) => ScrollTrigger.create({
    trigger: (el => el.parentNode.classList.contains('pin-spacer') ? el.parentNode : el)(document.getElementById(id)), start: 'top 55%', end: 'bottom 55%',
    onToggle: s => { if (s.isActive) { links.forEach(l => l.classList.toggle('on', +l.dataset.i === i)); npl.textContent = label; } }
  }));

  if (!reduced) {
    /* reveal for plain text blocks (all sizes): split headings scrub with scroll */
    $$('.split').forEach(el => {
      if (el.closest('.hero')) return;
      gsap.to(chars.get(el), { yPercent: 0, rotate: 0, stagger: .03, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 55%', scrub: .6 } });
    });
    $$('.cut').forEach(c => {                                           // manga-style interlude: streak + frame label
      const tl = gsap.timeline({ scrollTrigger: { trigger: c, start: 'top 90%', end: 'bottom 10%', scrub: .5 } });
      tl.fromTo($('.streak', c), { xPercent: -120 }, { xPercent: 190, ease: 'none' }, 0)
        .fromTo($('.jp', c), { xPercent: -30, opacity: 0 }, { xPercent: 0, opacity: 1, ease: 'power2.out' }, 0)
        .fromTo($('.lbl', c), { scale: .8, opacity: 0 }, { scale: 1, opacity: 1, ease: 'power2.out' }, .15);
    });
  }

  /* ---------- scroll scenes ---------- */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 992px) and (prefers-reduced-motion: no-preference)', () => {
    /* HERO: camera pulls back — logo shrinks, rings turn, grid/particles/glow move at different speeds */
    gsap.timeline({ scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: .6 } })
      .to('.hero-shell', { scale: .86, y: -80, opacity: 0, filter: 'blur(6px)', ease: 'none' }, 0)
      .to('.emblem', { rotation: 50, scale: .72, ease: 'none' }, 0)
      .to('.emblem-logo', { rotation: -50, ease: 'none' }, 0)
      .to('.bg-grid', { yPercent: -14, ease: 'none' }, 0)
      .to('#fx', { scale: 1.18, opacity: .3, ease: 'none' }, 0)
      .to('.glow', { scale: 1.6, opacity: .35, ease: 'none' }, 0)
      .to('.hud', { opacity: 0, ease: 'none' }, 0);

    /* WINGS: pinned scenes, clip-path wipe + push-in + sweep line */
    const ws = $('#wings'), stage = $('.stage'), sc = $$('.scene', stage), n = sc.length;
    ws.classList.add('is-pinned');
    const sweep = document.createElement('i'); sweep.className = 'sweep'; stage.append(sweep);
    const lab = $('#scene-label'), bar = $('#scene-bar'), nm = $('#scene-name'), hud = $('.stage-hud');
    const show = i => { lab.textContent = `SCENE 0${i + 1} / 0${n}`; nm.textContent = 'DISCIPLINE: ' + sc[i].dataset.name; };
    sc.forEach((s, i) => { s.style.zIndex = i + 1; if (i) { gsap.set(s, { clipPath: 'inset(0 0 0 100%)' }); gsap.set($('.scene-body', s), { opacity: 0, x: 60 }); } });
    const tl = gsap.timeline({ scrollTrigger: { trigger: ws, start: 'top top', end: () => '+=' + innerHeight * n * .9, pin: true, scrub: .6, anticipatePin: 1, invalidateOnRefresh: true,
      onUpdate: s => { hud.style.setProperty('--p', s.progress.toFixed(3)); show(Math.min(n - 1, Math.floor(s.progress * n + .02))); } } });
    sc.forEach((s, i) => {
      const img = $('img', s), body = $('.scene-body', s);
      tl.fromTo(img, { scale: i ? 1.2 : 1.08 }, { scale: 1.15, duration: 1, ease: 'none' }, i);       // slow push-in
      if (i < n - 1) {
        const nx = sc[i + 1];
        tl.to(body, { opacity: 0, x: -60, duration: .3, ease: 'power2.in' }, i + .65)
          .to(img, { filter: 'brightness(.35)', scale: 1.22, duration: .35, ease: 'none' }, i + .65)
          .fromTo(sweep, { xPercent: -120, opacity: 1 }, { xPercent: 260, opacity: 1, duration: .45, ease: 'power2.inOut' }, i + .68)
          .to(nx, { clipPath: 'inset(0 0 0 0%)', duration: .4, ease: 'power3.inOut' }, i + .72)
          .to($('.scene-body', nx), { opacity: 1, x: 0, duration: .3, ease: 'power3.out' }, i + 1.05)
          .set(sweep, { opacity: 0 }, i + 1.15);
      }
    });

    /* TOOLS: vertical scroll → horizontal travel; centred card is largest */
    const ts = $('#tools'), track = $('.track'), cards = $$('.tool', track);
    ts.classList.add('is-pinned');
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    const paint = () => cards.forEach(c => {
      const r = c.getBoundingClientRect(), d = Math.min(1, Math.abs(r.left + r.width / 2 - innerWidth / 2) / (innerWidth * .5));
      c.style.setProperty('--s', (1.04 - d * .2).toFixed(3)); c.style.setProperty('--o', (1 - d * .6).toFixed(3)); c.classList.toggle('on', d < .18);
    });
    gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: ts, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: .5, invalidateOnRefresh: true, onUpdate: paint, onRefresh: paint } });

    /* EXPERIENCE: sticky image drifts, capability in focus lights up */
    const caps = $$('.cap'), now = $('#exp-now'); caps[0].classList.add('on');
    caps.forEach(c => ScrollTrigger.create({ trigger: c, start: 'top 58%', end: 'bottom 58%',
      onToggle: s => { if (s.isActive) { caps.forEach(o => o.classList.toggle('on', o === c)); now.textContent = c.dataset.name; } } }));
    gsap.fromTo('.exp-frame img', { scale: 1.12, yPercent: -4 }, { scale: 1, yPercent: 4, ease: 'none', scrollTrigger: { trigger: '.exp', start: 'top bottom', end: 'bottom top', scrub: true } });
    return () => { ws.classList.remove('is-pinned'); ts.classList.remove('is-pinned'); sweep.remove(); };
  });

  /* smaller screens: light reveals only (no pins) */
  mm.add('(max-width: 991px) and (prefers-reduced-motion: no-preference)', () => {
    $$('.scene,.tool,.cap').forEach(el => gsap.from(el, { opacity: 0, y: 40, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));
    gsap.fromTo('.exp-frame img', { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: '.exp-frame', start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  /* FINAL SCENE: darkens, glow swells, CTA reveals, then END OF TRANSMISSION */
  if (!reduced) {
    gsap.set('.join .r', { opacity: 0, y: 30 });
    const f = gsap.timeline({ scrollTrigger: { trigger: '#join', start: 'top 70%', end: 'bottom bottom', scrub: .8 } });
    f.fromTo('#join', { backgroundColor: '#08080c' }, { backgroundColor: '#000', ease: 'none' }, 0)
     .fromTo('.join-glow', { opacity: 0, scale: .6 }, { opacity: 1, scale: 1.5, ease: 'none' }, 0)
     .to('.join .r', { opacity: 1, y: 0, stagger: .15, ease: 'power2.out' }, .35);
    ScrollTrigger.create({ trigger: '#join', start: 'top 30%', once: true, onEnter: () => $('.join .btn-primary').classList.add('pulse') });
  }

  const top = $('#top');
  if (top) top.addEventListener('click', e => { e.preventDefault(); go('hero'); });
  bindSections();
  addEventListener('load', () => { ScrollTrigger.refresh(); setTimeout(() => ScrollTrigger.refresh(), 1500); });
})();
