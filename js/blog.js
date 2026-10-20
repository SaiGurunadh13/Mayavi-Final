/* Blogs: list by ?software= (Blog.html) and detail view (blog-details.html). Same Contentful space/content type as the original. */
(() => {
  const spaceId = '90ufhhyngsqh', token = 'RyU97nj8AZmq4VUNAUZ4ItNX9mDc8H8Ri7SZamGOows', base = `https://cdn.contentful.com/spaces/${spaceId}`;
  const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const param = n => new URLSearchParams(location.search).get(n);
  const go = () => window.ScrollTrigger && ScrollTrigger.refresh();
  const img = (assets, id) => { const a = assets.find(x => x.sys.id === id); return a ? 'https:' + a.fields.file.url : ''; };
  const safeUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };

  /* ---- list ---- */
  const list = $('#blog-list');
  if (list) {
    const sw = param('software');
    if (!sw) list.innerHTML = '<p class="empty">Select a software first. <a href="blogs.html" style="color:var(--p2)">Browse all software →</a></p>';
    else {
      const t = sw.replace(/([A-Z])/g, ' $1').trim();
      $('#software-title').textContent = t + ' Blogs'; $('#software-description').textContent = 'Explore our collection of blogs and tutorials for ' + t + '.';
      fetch(`${base}/entries?access_token=${token}&content_type=mayaviBlog&fields.software=${encodeURIComponent(sw)}&include=1`).then(r => r.json()).then(d => {
        const posts = d.items || [], assets = (d.includes && d.includes.Asset) || [];
        if (!posts.length) { list.innerHTML = '<p class="empty">Sorry for the inconvenience, there are no blogs to display here. Check out our remaining software to learn more.</p>'; return; }
        list.innerHTML = posts.map(p => { const f = p.fields, b = f.banner ? img(assets, f.banner.sys.id) : '';
          return `<a class="card" data-cursor="READ" href="blog-details.html?id=${p.sys.id}" data-title="${esc(f.title)}">${b ? `<img loading="lazy" src="${b}" alt="${esc(f.title)}">` : ''}<h4>${esc(f.title)}</h4><p>${esc(f.description)}</p><span class="more">Read more →</span></a>`; }).join('');
        list.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => localStorage.setItem('blogTitle', c.dataset.title)));
        go();
      }).catch(() => (list.innerHTML = '<p class="empty">Could not load blogs right now. Please try again later.</p>'));
    }
  }

  /* ---- details ---- */
  const box = $('#blog-content');
  if (box) {
    const fmt = (c, assets) => esc(c).replace(/__(.*?)__/g, '<strong>$1</strong>')
      .replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => { url = url.replace(/&amp;/g, '&');
        if (url.startsWith('//')) { const a = assets.find(x => x.fields.file.url.endsWith(url.split('/').pop())); url = a ? 'https:' + a.fields.file.url : 'https:' + url; }
        const safe = safeUrl(url); return safe ? `<img src="${safe}" alt="${alt}" loading="lazy">` : ''; }).replace(/\n/g, '<br>');
    const show = (post, assets) => {
      if (!post) { box.innerHTML = '<p class="empty">Sorry, no blog details available.</p>'; return; }
      const f = post.fields, media = (f.referenceImg || []).map(r => img(assets, r.sys.id)).filter(Boolean);
      const slides = media.map(u => /\.(mp4|webm|ogg)$/i.test(u) ? `<div class="slide"><video controls src="${u}"></video></div>` : `<div class="slide"><img src="${u}" alt="Reference" loading="lazy"></div>`).join('');
      box.innerHTML = `<article class="post"><h2>${esc(f.title)}</h2>${slides ? `<div class="slider"><div class="slides">${slides}</div>${media.length > 1 ? '<button class="sl-btn sl-prev" aria-label="Previous">‹</button><button class="sl-btn sl-next" aria-label="Next">›</button>' : ''}</div>` : ''}
        <div class="post-body">${fmt(f.content || '', assets)}</div><div class="post-author">~ ${esc(f.author)}${f.id ? ' (' + esc(f.id) + ')' : ''}</div>
        ${safeUrl(f.youTubeLink || '') ? `<p class="post-link">Watch the detailed explanation video: <a href="${esc(safeUrl(f.youTubeLink))}" target="_blank" rel="noopener">Click Here</a></p>` : ''}<a href="blogs.html" class="btn btn-ghost back"><span>← Back</span></a></article>`;
      const sl = box.querySelector('.slides');
      if (sl) { const step = d => sl.scrollBy({ left: d * sl.clientWidth, behavior: 'smooth' }); const p = box.querySelector('.sl-prev'), n = box.querySelector('.sl-next'); p && p.addEventListener('click', () => step(-1)); n && n.addEventListener('click', () => step(1)); }
      go();
    };
    const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = '<button aria-label="Close">×</button><img alt="">'; document.body.append(lb);
    lb.addEventListener('click', () => lb.classList.remove('open'));
    box.addEventListener('click', e => { if (e.target.matches('.slide img,.post-body img')) { lb.querySelector('img').src = e.target.src; lb.classList.add('open'); } });
    const id = param('id'), title = localStorage.getItem('blogTitle');
    const q = id ? `${base}/entries?access_token=${token}&content_type=mayaviBlog&sys.id=${encodeURIComponent(id)}&include=1`
      : title ? `${base}/entries?access_token=${token}&content_type=mayaviBlog&fields.title=${encodeURIComponent(title)}&include=1` : '';
    if (!q) box.innerHTML = '<p class="empty">No blog title found. Please go back and select a blog.</p>';
    else fetch(q).then(r => r.json()).then(d => show((d.items || [])[0], (d.includes && d.includes.Asset) || [])).catch(() => (box.innerHTML = '<p class="empty">Could not load this blog right now.</p>'));
  }
})();
