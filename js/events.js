/* Events: list (events/index.html) and detail (events/info.html) driven by live backend /api/events with fallback to data.json */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = n => String(n + 1).padStart(2, '0');

  const reveal = els => {
    if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(els,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1, stagger: 0.07, ease: 'power3.out', scrollTrigger: window.ScrollTrigger && { trigger: els[0], start: 'top 92%', once: true } }
    );
  };

  const getApiUrl = (endpoint) => {
    if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;
    const cfg = window.__MAYAVI_CONFIG__;
    if (cfg && typeof cfg.API_BASE_URL === 'string' && cfg.API_BASE_URL.trim()) {
      return cfg.API_BASE_URL.replace(/\/+$/, '') + endpoint;
    }
    const loc = window.location;
    if ((loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.protocol === 'file:') && loc.port !== '8000') {
      return `http://127.0.0.1:8000${endpoint}`;
    }
    return endpoint;
  };

  const load = () => {
    // Try live database API first, fallback to static data.json
    return fetch(getApiUrl('/api/events'))
      .then(r => {
        if (!r.ok) throw new Error('API unavailable');
        return r.json();
      })
      .catch(() => fetch('data.json').then(r => r.json()));
  };

  /* broken/missing posters get a numbered plate instead of a broken-image icon */
  const guard = (root, label) => root.querySelectorAll('img').forEach(i => i.addEventListener('error', () => {
    const d = document.createElement('div');
    d.className = 'ev-noimg';
    d.textContent = label(i);
    i.replaceWith(d);
  }, { once: true }));

  const grid = $('#allev');
  if (grid) {
    load().then(data => {
      if (!data || data.length === 0) {
        grid.innerHTML = '<p class="empty">No events scheduled at the moment.</p>';
        return;
      }

      grid.innerHTML = data.map((e, i) => {
        const posterUrl = e.poster || e.banner_url || '../assets/img/projects/marathon.jpg';
        const eventName = e.name || e.title || 'Event';
        const eventDate = e.date || e.event_date || '';
        const eventVenue = e.venue || e.location || 'K L University';
        const eventCat = e.category || e.category_name || 'Technology';
        const eventId = e.id;
        const statusBadge = (e.status && e.status.toLowerCase() === 'upcoming')
          ? '<span class="pill" style="margin-left:6px;background:rgba(0,240,255,0.15);color:#00f0ff;border:1px solid rgba(0,240,255,0.3);font-size:9px;padding:2px 6px;border-radius:4px;">UPCOMING</span>'
          : '';

        return `<a class="ev-card" data-cursor="VIEW" href="info.html?id=${eventId || ''}&name=${encodeURIComponent(eventName)}">
          <div class="ev-poster">
            <img loading="lazy" src="${esc(posterUrl)}" alt="${esc(eventName)}" data-n="${pad(i)}">
          </div>
          <div class="ev-meta">
            <span class="ev-no">E${pad(i)}</span>
            <span class="ev-cat">${esc(eventCat)}${statusBadge}</span>
          </div>
          <div class="ev-text">
            <h3>${esc(eventName)}</h3>
            <p class="ev-date">${esc(eventDate)} // ${esc(eventVenue)}</p>
          </div>
        </a>`;
      }).join('');

      guard(grid, i => i.dataset.n);
      reveal([...grid.children]);
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }).catch(() => {
      grid.innerHTML = '<p class="empty">Could not load events right now.</p>';
    });
  }

  const box = $('#m');
  if (box) {
    const params = new URLSearchParams(location.search);
    const eventId = params.get('id');
    const name = params.get('name');

    const miss = () => {
      box.innerHTML = '<div class="wrap"><p class="empty">404 // Event not found.</p><a href="index.html" class="btn btn-ghost back"><span>← Go Back</span></a></div>';
    };

    if (!eventId && !name) {
      miss();
    } else {
      load().then(data => {
        let i = -1;
        if (eventId) {
          i = data.findIndex(e => String(e.id) === String(eventId));
        }
        if (i === -1 && name) {
          i = data.findIndex(e => (e.name || e.title) === name);
        }

        const e = data[i];
        if (!e) return miss();

        const eventName = e.name || e.title || 'Event';
        const eventDesc = e.des || e.description || '';
        const eventDate = e.date || e.event_date || '';
        const eventVenue = e.venue || e.location || 'K L University';
        const eventCat = e.category || e.category_name || 'Technology';
        const images = (e.img && e.img.length > 0) ? e.img : ((e.image_urls && e.image_urls.length > 0) ? e.image_urls : (e.poster ? [e.poster] : []));
        const regUrl = e.registration_url || '';

        document.title = eventName + ' | Mayavi Events';
        const cr = $('#crumb-name');
        if (cr) cr.textContent = eventName;

        const slides = images.map(u => `<div class="slide"><img src="${esc(u)}" alt="${esc(eventName)}" loading="lazy"></div>`).join('');
        const paras = String(eventDesc).split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join('');

        const prev = data[i - 1];
        const next = data[i + 1];
        const l = x => `info.html?id=${x.id || ''}&name=${encodeURIComponent(x.name || x.title)}`;

        box.innerHTML = `<section class="wrap">
          <div class="ev-detail">
            <div class="ev-main">
              ${slides ? `<div class="slider"><div class="slides">${slides}</div>${images.length > 1 ? '<button class="sl-btn sl-prev" aria-label="Previous">‹</button><button class="sl-btn sl-next" aria-label="Next">›</button>' : ''}</div>` : ''}
              <h2>${esc(eventName)}</h2>
              ${paras}
              <div style="display:flex;gap:14px;align-items:center;margin-top:28px;flex-wrap:wrap;">
                <a href="index.html" class="btn btn-ghost back" data-cursor="BACK"><span>← All events</span></a>
                ${regUrl ? `<a href="${esc(regUrl)}" target="_blank" rel="noopener" class="btn btn-primary" data-cursor="ENTER"><span>Register Now ↗</span></a>` : ''}
              </div>
            </div>
            <aside class="ev-info">
              <h3>Event information</h3>
              <dl>
                <div><dt>Category</dt><dd>${esc(eventCat)}</dd></div>
                <div><dt>Event date</dt><dd>${esc(eventDate)}</dd></div>
                <div><dt>Venue</dt><dd>${esc(eventVenue)}</dd></div>
                ${e.status ? `<div><dt>Status</dt><dd><span style="color:${e.status.toLowerCase() === 'upcoming' ? '#00f0ff' : 'var(--p2)'};font-weight:600;">${esc(e.status.toUpperCase())}</span></dd></div>` : ''}
              </dl>
              <div class="ev-nav">
                <span>${prev ? `<a href="${l(prev)}">← Prev</a>` : ''}</span>
                <span>${next ? `<a href="${l(next)}">Next →</a>` : ''}</span>
              </div>
            </aside>
          </div>
        </section>`;

        const sl = box.querySelector('.slides');
        if (sl) {
          const step = d => sl.scrollBy({ left: d * sl.clientWidth, behavior: 'smooth' });
          const p = box.querySelector('.sl-prev');
          const n = box.querySelector('.sl-next');
          p && p.addEventListener('click', () => step(-1));
          n && n.addEventListener('click', () => step(1));
          sl.querySelectorAll('img').forEach(im => im.addEventListener('error', () => im.closest('.slide').remove(), { once: true }));
        }

        if (window.ScrollTrigger) ScrollTrigger.refresh();
      }).catch(miss);
    }
  }

  const ip = $('#ip');
  if (ip) {
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => { ip.textContent = d.ip; })
      .catch(() => { ip.textContent = 'Unavailable'; });
  }
})();
