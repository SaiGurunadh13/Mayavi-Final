/* Events: list (events/index.html) and detail (events/info.html?name=...) driven by events/data.json */
(() => {
  const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = n => String(n + 1).padStart(2, '0');
  const reveal = els => { if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return; gsap.fromTo(els, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1, stagger: .07, ease: 'power3.out', scrollTrigger: ScrollTrigger && { trigger: els[0], start: 'top 92%', once: true } }); };
  const load = () => fetch('data.json').then(r => r.json());
  /* broken/missing posters get a numbered plate instead of a broken-image icon */
  const guard = (root, label) => root.querySelectorAll('img').forEach(i => i.addEventListener('error', () => { const d = document.createElement('div'); d.className = 'ev-noimg'; d.textContent = label(i); i.replaceWith(d); }, { once: true }));

  const grid = $('#allev');
  if (grid) load().then(data => {
    grid.innerHTML = data.map((e, i) => `<a class="ev-card" data-cursor="VIEW" href="info.html?name=${encodeURIComponent(e.name)}">
      <div class="ev-poster"><img loading="lazy" src="${esc(e.poster)}" alt="${esc(e.name)}" data-n="${pad(i)}"></div>
      <div class="ev-meta"><span class="ev-no">E${pad(i)}</span><span class="ev-cat">${esc(e.category)}</span></div>
      <div class="ev-text"><h3>${esc(e.name)}</h3><p class="ev-date">${esc(e.date)} // ${esc(e.venue)}</p></div></a>`).join('');
    guard(grid, i => i.dataset.n); reveal([...grid.children]); window.ScrollTrigger && ScrollTrigger.refresh();
  }).catch(() => (grid.innerHTML = '<p class="empty">Could not load events right now.</p>'));

  const box = $('#m');
  if (box) {
    const name = new URLSearchParams(location.search).get('name');
    const miss = () => (box.innerHTML = '<div class="wrap"><p class="empty">404 // Event not found.</p><a href="index.html" class="btn btn-ghost back"><span>← Go Back</span></a></div>');
    if (!name) miss();
    else load().then(data => {
      const i = data.findIndex(e => e.name === name), e = data[i]; if (!e) return miss();
      document.title = e.name + ' | Mayavi Events'; const cr = $('#crumb-name'); if (cr) cr.textContent = e.name;
      const slides = (e.img || []).map(u => `<div class="slide"><img src="${esc(u)}" alt="${esc(e.name)}" loading="lazy"></div>`).join('');
      const paras = String(e.des || '').split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join('');
      const prev = data[i - 1], next = data[i + 1], l = x => `info.html?name=${encodeURIComponent(x.name)}`;
      box.innerHTML = `<section class="wrap"><div class="ev-detail"><div class="ev-main">
        ${slides ? `<div class="slider"><div class="slides">${slides}</div>${(e.img || []).length > 1 ? '<button class="sl-btn sl-prev" aria-label="Previous">‹</button><button class="sl-btn sl-next" aria-label="Next">›</button>' : ''}</div>` : ''}
        <h2>${esc(e.name)}</h2>${paras}<a href="index.html" class="btn btn-ghost back" data-cursor="BACK"><span>← All events</span></a></div>
        <aside class="ev-info"><h3>Event information</h3><dl><div><dt>Category</dt><dd>${esc(e.category)}</dd></div><div><dt>Event date</dt><dd>${esc(e.date)}</dd></div><div><dt>Venue</dt><dd>${esc(e.venue)}</dd></div></dl>
        <div class="ev-nav"><span>${prev ? `<a href="${l(prev)}">← Prev</a>` : ''}</span><span>${next ? `<a href="${l(next)}">Next →</a>` : ''}</span></div></aside></div></section>`;
      const sl = box.querySelector('.slides');
      if (sl) { const step = d => sl.scrollBy({ left: d * sl.clientWidth, behavior: 'smooth' }); const p = box.querySelector('.sl-prev'), n = box.querySelector('.sl-next'); p && p.addEventListener('click', () => step(-1)); n && n.addEventListener('click', () => step(1));
        sl.querySelectorAll('img').forEach(im => im.addEventListener('error', () => im.closest('.slide').remove(), { once: true })); }
      window.ScrollTrigger && ScrollTrigger.refresh();
    }).catch(miss);
  }

  const ip = $('#ip');
  if (ip) fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => (ip.textContent = d.ip)).catch(() => (ip.textContent = 'Unavailable'));
})();
