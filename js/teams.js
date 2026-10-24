/**
 * Mayavi Tech Club - Public Teams & Categories Dynamic Integration
 * Automatically updates teams, leads, members, and categories from SQLite API.
 */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const plate = img => {
    const d = document.createElement('div');
    d.className = 'noimg';
    d.textContent = (img.alt || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    img.replaceWith(d);
  };

  const bindImageFallbacks = (container) => {
    $$('img', container).forEach(i => {
      if (i.complete && !i.naturalWidth) plate(i);
      else i.addEventListener('error', () => plate(i), { once: true });
    });
  };

  const reveal = els => {
    if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches || !els || els.length === 0) return;
    gsap.fromTo(els,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.9, stagger: 0.05, ease: 'power3.out' }
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

  async function loadTeamsAndCategories() {
    const catContainer = $('#teams-by-category');
    if (!catContainer) return;

    try {
      const [categories, teams] = await Promise.all([
        fetch(getApiUrl('/api/categories')).then(r => r.ok ? r.json() : []),
        fetch(getApiUrl('/api/teams')).then(r => r.ok ? r.json() : [])
      ]);

      if (!categories.length && !teams.length) return;

      // Group teams by category
      const catMap = new Map();
      categories.forEach(c => catMap.set(c.id, { ...c, teams: [] }));
      
      const unassignedTeams = [];
      teams.forEach(t => {
        if (t.category_id && catMap.has(t.category_id)) {
          catMap.get(t.category_id).teams.push(t);
        } else {
          unassignedTeams.push(t);
        }
      });

      let html = '';

      // Render each category with its assigned teams
      categories.forEach(cat => {
        const catTeams = catMap.get(cat.id).teams;
        if (catTeams.length === 0) return;

        html += `
          <div class="category-block" style="margin-bottom:64px;">
            <div class="cat-head" style="margin-bottom:28px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;background:${cat.color || '#a855f7'}20;color:${cat.color || '#a855f7'};border:1px solid ${cat.color || '#a855f7'}40;">
                  <i class="bi ${esc(cat.icon_url || 'bi-tags')}"></i>
                </span>
                <h3 style="font-family:var(--f-head);font-size:22px;color:#fff;margin:0;">${esc(cat.name)}</h3>
              </div>
              ${cat.description ? `<p style="font-size:13px;color:var(--dim);margin:0;max-width:560px;">${esc(cat.description)}</p>` : ''}
            </div>

            <div class="teams-list" style="display:flex;flex-direction:column;gap:40px;">
              ${catTeams.map(team => {
                const members = team.members || [];
                return `
                  <div class="team-card-wrap" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:24px;">
                    <div class="team-header-info" style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
                      <div style="display:flex;gap:16px;align-items:center;">
                        ${team.logo_url ? `<img src="${esc(team.logo_url)}" alt="${esc(team.name)}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;border:1px solid rgba(255,255,255,0.1);">` : ''}
                        <div>
                          <h4 style="font-family:var(--f-head);font-size:20px;color:#fff;margin:0 0 4px;">${esc(team.name)}</h4>
                          <span style="font-family:var(--f-mono);font-size:11px;color:var(--p2);letter-spacing:0.08em;text-transform:uppercase;">
                            LEAD: ${esc(team.team_lead_name || 'Assigned Core Lead')}
                          </span>
                        </div>
                      </div>
                      ${team.description ? `<p style="font-size:13px;color:var(--dim);max-width:540px;margin:0;">${esc(team.description)}</p>` : ''}
                    </div>

                    ${members.length > 0 ? `
                      <div class="members" style="margin-top:16px;">
                        ${members.map(m => `
                          <article class="member rv">
                            <div class="m-img">
                              <img loading="lazy" src="${esc(m.profile_image_url || 'assets/img/core/18.jpg')}" alt="${esc(m.full_name)}">
                            </div>
                            <div class="m-info">
                              <h4>${esc(m.full_name)}</h4>
                              <span>${esc(m.role_in_team || m.designation || 'Member')}</span>
                            </div>
                          </article>
                        `).join('')}
                      </div>
                    ` : '<p style="font-size:12px;color:var(--dim);margin:8px 0 0;">Team members roster being updated.</p>'}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      });

      if (html) {
        catContainer.innerHTML = html;
        bindImageFallbacks(catContainer);
        reveal($$('.rv', catContainer));
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      }
    } catch (e) {
      console.warn('Live teams fetch skipped, keeping static roster', e);
    }
  }

  // Batch roster dynamic loader
  async function loadBatchRoster(batchYear) {
    const targetDiv = $(`#team-${batchYear}`);
    if (!targetDiv) return;

    try {
      const members = await fetch(getApiUrl(`/api/members?batch_year=Y${batchYear.slice(-2)}`)).then(r => r.ok ? r.json() : []);
      if (members && members.length > 0) {
        const container = $('.members', targetDiv);
        if (container) {
          container.innerHTML = members.map(m => `
            <article class="member rv">
              <div class="m-img">
                <img loading="lazy" src="${esc(m.profile_image_url || 'assets/img/core/18.jpg')}" alt="${esc(m.full_name)}">
              </div>
              <div class="m-info">
                <h4>${esc(m.full_name)}</h4>
                <span>${esc(m.designation || 'Member')}</span>
              </div>
            </article>
          `).join('');

          bindImageFallbacks(container);
          reveal($$('.rv', container));
          if (window.ScrollTrigger) ScrollTrigger.refresh();
        }
      }
    } catch (e) {
      // Keep static roster if API unavailable
    }
  }

  // Setup tab switchers
  function initTeamsView() {
    const btnCat = $('#view-mode-categories');
    const btnBatch = $('#view-mode-batches');
    const catSec = $('#teams-by-category');
    const batchTabs = $('#batch-tabs-wrap');
    const batchSecs = $$('.team-year');

    if (btnCat && btnBatch && catSec && batchTabs) {
      btnCat.addEventListener('click', () => {
        btnCat.classList.add('on');
        btnBatch.classList.remove('on');
        catSec.style.display = 'block';
        batchTabs.style.display = 'none';
        batchSecs.forEach(s => s.classList.remove('on'));
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      });

      btnBatch.addEventListener('click', () => {
        btnBatch.classList.add('on');
        btnCat.classList.remove('on');
        catSec.style.display = 'none';
        batchTabs.style.display = 'flex';
        // Default show Y23
        const defaultTab = $('[data-year="2023"]');
        if (defaultTab) defaultTab.click();
      });
    }

    // Load dynamic data
    loadTeamsAndCategories();

    // Hook into batch tabs to load latest DB records
    $$('.tab[data-year]').forEach(t => {
      t.addEventListener('click', () => {
        loadBatchRoster(t.dataset.year);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initTeamsView);
})();
