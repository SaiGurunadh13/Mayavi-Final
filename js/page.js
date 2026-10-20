/* MAYAVI CINEMATIC — shared behaviour for inner pages (header, cursor, reveals, counters, team tabs). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine) and (min-width:992px)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* header + progress */
  const header = $('#header'), nav = $('#nav'), tog = $('.nav-toggle'), bar = $('.topbar'), pct = $('#np-pct'), np = $('.navprog');
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? scrollY / max : 0;
    if (header) header.classList.toggle('scrolled', scrollY > 40);
    if (bar) bar.style.setProperty('--p', p.toFixed(4));
    if (pct) pct.textContent = Math.round(p * 100) + '%'; if (np) np.style.setProperty('--p', p.toFixed(4));
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
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
  document.addEventListener('click', e => { if (e.target.closest('#top')) { e.preventDefault(); scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); } });

  /* image fallbacks (missing/broken photos become an initials plate) */
  const plate = img => {
    const d = document.createElement('div'); d.className = 'noimg';
    d.textContent = (img.alt || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); img.replaceWith(d);
  };
  $$('.m-img img,.about-img img').forEach(i => { if (i.complete && !i.naturalWidth) plate(i); else i.addEventListener('error', () => plate(i), { once: true }); });

  /* cursor */
  if (fine && !reduced && hasGsap) {
    document.body.classList.add('has-cursor');
    const dot = $('.cursor-dot'), ring = $('.cursor-ring'), lab = $('span', ring);
    const rx = gsap.quickTo(ring, 'x', { duration: .45, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: .45, ease: 'power3' });
    addEventListener('mousemove', e => { gsap.set(dot, { x: e.clientX, y: e.clientY }); rx(e.clientX); ry(e.clientY); }, { passive: true });
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-cursor]'), l = e.target.closest('a,button');
      document.body.classList.toggle('c-label', !!t); document.body.classList.toggle('c-link', !t && !!l); if (t) lab.textContent = t.dataset.cursor;
    }, { passive: true });
    addEventListener('mousedown', () => document.body.classList.add('c-down')); addEventListener('mouseup', () => document.body.classList.remove('c-down'));
  }
  if (!hasGsap || reduced) return;

  /* title: character mask reveal (keeps text accessible) */
  const title = $('.sub-title');
  if (title) {
    const txt = title.textContent; title.setAttribute('aria-label', txt); title.textContent = '';
    txt.split(/(\s+)/).forEach(w => {
      if (/^\s+$/.test(w)) return title.append(' ');
      const sw = document.createElement('span'); sw.className = 'w'; sw.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:.12em;margin-bottom:-.12em';
      [...w].forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.style.display = 'inline-block'; c.textContent = ch; sw.append(c); }); title.append(sw);
    });
    gsap.set('.sub-title .c', { yPercent: 115, rotate: 5 });
    gsap.timeline({ delay: .15 }).to('.sub-title .c', { yPercent: 0, rotate: 0, duration: 1.2, stagger: .04, ease: 'expo.out' })
      .from('.sub-hero .r', { opacity: 0, y: 24, duration: 1, stagger: .12, ease: 'expo.out' }, .5);
  }
  /* hero depth: bg/jp drift at different speeds, content eases out */
  gsap.timeline({ scrollTrigger: { trigger: '.sub-hero', start: 'top top', end: 'bottom top', scrub: .6 } })
    .to('.sub-bg', { yPercent: 14, scale: 1.12, ease: 'none' }, 0).to('.sub-jp', { yPercent: -30, ease: 'none' }, 0)
    .to('.sub-inner', { y: -50, opacity: 0, ease: 'none' }, 0);

  /* scroll reveals */
  ScrollTrigger.batch($$('.rv'), { start: 'top 90%', once: true, onEnter: els => gsap.fromTo(els, { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 1.1, stagger: .09, ease: 'power3.out', overwrite: true }) });
  $$('.about-img img').forEach(i => gsap.fromTo(i, { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: i, start: 'top bottom', end: 'bottom top', scrub: true } }));
  $$('[data-count]').forEach(el => { const end = +el.dataset.count, o = { v: 0 };
    ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(o, { v: end, duration: 1.6, ease: 'power2.out', onUpdate: () => (el.textContent = Math.round(o.v)) }) }); });
  $$('.wrap-head h2,.about-copy h2').forEach(h => gsap.from(h, { clipPath: 'inset(0 0 100% 0)', y: 30, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 90%', once: true } }));

  /* team year tabs */
  const tabs = $$('.tab');
  if (tabs.length) tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(o => o.classList.toggle('on', o === t));
    $$('.team-year').forEach(y => y.classList.toggle('on', y.id === 'team-' + t.dataset.year));
    const cards = $$('#team-' + t.dataset.year + ' .member');
    gsap.fromTo(cards, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .8, stagger: .04, ease: 'power3.out' }); ScrollTrigger.refresh();
  }));
  addEventListener('load', () => ScrollTrigger.refresh());
})();
