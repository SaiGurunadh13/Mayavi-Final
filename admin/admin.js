/**
 * MAYAVI ADMIN PORTAL - CLIENT APPLICATION CONTROLLER
 * Single Page Application for content and club management.
 */

const AdminApp = (() => {
  'use strict';

  // State
  let currentUser = null;
  let activeTab = 'dashboard';
  let cachedCategories = [];
  let cachedTeams = [];
  let cachedMembers = [];
  let cachedEvents = [];
  let pendingDeleteAction = null;

  // DOM Elements
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Helper for safe HTML escaping
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // API Request Wrapper with credentials
  async function api(endpoint, options = {}) {
    const opts = {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        ...options.headers
      },
      ...options
    };

    const token = localStorage.getItem('mayavi_admin_token');
    if (token) {
      opts.headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(endpoint, opts);
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        // Session expired or invalid
        localStorage.removeItem('mayavi_admin_token');
        currentUser = null;
        showLoginView();
        throw new Error(data.detail || 'Session expired. Please log in again.');
      }

      if (!res.ok) {
        throw new Error(data.detail || `Request failed (${res.status})`);
      }

      return data;
    } catch (err) {
      throw err;
    }
  }

  // Toast Notification System
  function showToast(message, type = 'success') {
    const container = $('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'bi-check-circle-fill';
    if (type === 'error') icon = 'bi-exclamation-triangle-fill';
    if (type === 'warning') icon = 'bi-info-circle-fill';

    toast.innerHTML = `<i class="bi ${icon}"></i><span>${esc(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATION & SESSION
  // --------------------------------------------------------------------------

  async function checkSession() {
    try {
      const user = await api('/api/admin/auth/me');
      if (user && user.id) {
        currentUser = user;
        showAppView();
        loadDashboard();
        loadCategoriesCache();
      } else {
        showLoginView();
      }
    } catch (err) {
      showLoginView();
    }
  }

  function showLoginView() {
    $('view-login').style.display = 'flex';
    $('view-app').classList.remove('active');
  }

  function showAppView() {
    $('view-login').style.display = 'none';
    $('view-app').classList.add('active');

    if (currentUser) {
      $('admin-display-name').textContent = currentUser.username;
      $('admin-display-role').textContent = currentUser.role.toUpperCase();
      $('admin-avatar-char').textContent = currentUser.username.charAt(0).toUpperCase();

      $('settings-username').value = currentUser.username;
      $('settings-email').value = currentUser.email;
      $('settings-role').value = currentUser.role.toUpperCase();
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const btn = $('btn-login-submit');
    const errBox = $('login-error-box');
    const errMsg = $('login-error-msg');
    const username = $('login-username').value.trim();
    const password = $('login-password').value;

    errBox.classList.remove('show');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div><span>Authenticating...</span>`;

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username_or_email: username, password: password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Login failed. Please verify credentials.');
      }

      if (data.token) {
        localStorage.setItem('mayavi_admin_token', data.token);
      }
      currentUser = data.admin;
      showToast('Welcome back to Mayavi Control Center!', 'success');
      showAppView();
      switchTab('dashboard');
      loadCategoriesCache();
    } catch (err) {
      errMsg.textContent = err.message;
      errBox.classList.add('show');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span class="btn-text">Authenticate</span><i class="bi bi-arrow-right"></i>`;
    }
  }

  async function handleLogout() {
    try {
      await api('/api/admin/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('mayavi_admin_token');
    currentUser = null;
    showToast('You have been logged out safely.', 'info');
    showLoginView();
  }

  // --------------------------------------------------------------------------
  // TAB NAVIGATION
  // --------------------------------------------------------------------------

  function switchTab(tabId) {
    activeTab = tabId;

    // Update sidebar items
    $$('.sidebar-nav .nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.tab === tabId);
    });

    // Update views
    $$('.view-section').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `tab-${tabId}`);
    });

    // Update Header title
    const titles = {
      dashboard: 'Dashboard Overview',
      events: 'Manage Events',
      members: 'Manage Members',
      teams: 'Manage Teams',
      categories: 'Manage Categories',
      preview: 'Website Live Preview',
      settings: 'Settings & Administration'
    };
    $('page-title').textContent = titles[tabId] || 'Admin Portal';

    // Close mobile drawer if open
    $('sidebar').classList.remove('open');

    // Trigger tab-specific loader
    if (tabId === 'dashboard') loadDashboard();
    else if (tabId === 'events') loadEvents();
    else if (tabId === 'members') loadMembers();
    else if (tabId === 'teams') loadTeams();
    else if (tabId === 'categories') loadCategories();
    else if (tabId === 'preview') reloadPreview();
  }

  // --------------------------------------------------------------------------
  // DATA CACHING & LOADERS
  // --------------------------------------------------------------------------

  async function loadCategoriesCache() {
    try {
      cachedCategories = await api('/api/categories');
      populateCategoryDropdowns();
    } catch (e) {
      console.error('Failed to cache categories', e);
    }
  }

  function populateCategoryDropdowns() {
    const selects = [
      'filter-event-category',
      'event-category',
      'filter-member-category',
      'member-category',
      'filter-team-category',
      'team-category'
    ];

    selects.forEach((sid) => {
      const el = $(sid);
      if (!el) return;
      const isFilter = sid.startsWith('filter-');
      const val = el.value;

      el.innerHTML = isFilter
        ? '<option value="">All Categories</option>'
        : '<option value="">Select Category</option>';

      cachedCategories.forEach((cat) => {
        el.innerHTML += `<option value="${cat.id}">${esc(cat.name)}</option>`;
      });

      if (val) el.value = val;
    });
  }

  // --------------------------------------------------------------------------
  // TAB 1: DASHBOARD
  // --------------------------------------------------------------------------

  async function loadDashboard() {
    try {
      const data = await api('/api/admin/dashboard');
      const s = data.stats || {};

      $('stat-total-events').textContent = s.total_events ?? 0;
      $('stat-upcoming-events').textContent = s.upcoming_events ?? 0;
      $('stat-total-members').textContent = s.total_members ?? 0;
      $('stat-active-members').textContent = s.active_members ?? 0;
      $('stat-total-teams').textContent = s.total_teams ?? 0;
      $('stat-total-categories').textContent = s.total_categories ?? 0;

      // Activity Feed
      const feed = $('dash-activity-feed');
      if (data.recent_activity && data.recent_activity.length > 0) {
        feed.innerHTML = data.recent_activity.map((a) => {
          let badgeType = 'update';
          let icon = 'bi-pencil';
          if (a.action === 'CREATE') { badgeType = 'create'; icon = 'bi-plus-lg'; }
          else if (a.action === 'DELETE') { badgeType = 'delete'; icon = 'bi-trash'; }
          else if (a.action === 'LOGIN') { badgeType = 'login'; icon = 'bi-box-arrow-in-right'; }
          else if (a.action === 'UPLOAD') { badgeType = 'create'; icon = 'bi-cloud-arrow-up'; }

          const timeStr = a.created_at ? new Date(a.created_at.replace(' ', 'T') + 'Z').toLocaleString() : '';

          return `
            <div class="activity-item">
              <div class="activity-icon-badge ${badgeType}">
                <i class="bi ${icon}"></i>
              </div>
              <div class="activity-content">
                <div class="activity-text">${esc(a.details || `${a.action} ${a.entity_type}`)}</div>
                <div class="activity-meta">by ${esc(a.admin_username)} · ${timeStr}</div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        feed.innerHTML = '<p class="stat-sub">No recent activity logged yet.</p>';
      }

      // Recent Events Table
      const tb = $('dash-events-tbody');
      if (data.recent_events && data.recent_events.length > 0) {
        tb.innerHTML = data.recent_events.map((e) => {
          const statusBadge = `<span class="badge badge-${e.status.toLowerCase()}">${esc(e.status)}</span>`;
          return `
            <tr>
              <td><strong>${esc(e.title)}</strong></td>
              <td style="font-family:var(--f-mono);font-size:11px;">${esc(e.event_date)}</td>
              <td>${statusBadge}</td>
            </tr>
          `;
        }).join('');
      } else {
        tb.innerHTML = '<tr><td colspan="3" class="table-empty">No events created yet.</td></tr>';
      }
    } catch (err) {
      showToast('Error loading dashboard data: ' + err.message, 'error');
    }
  }

  // --------------------------------------------------------------------------
  // TAB 2: EVENTS MANAGEMENT
  // --------------------------------------------------------------------------

  async function loadEvents() {
    const tbody = $('events-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><div class="spinner" style="margin:0 auto 12px;"></div><p>Fetching events...</p></td></tr>';

    try {
      cachedEvents = await api('/api/admin/events');
      renderEventsTable();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty" style="color:var(--danger);">${esc(err.message)}</td></tr>`;
    }
  }

  function renderEventsTable() {
    const tbody = $('events-table-body');
    const q = ($('filter-event-search').value || '').toLowerCase().trim();
    const catId = $('filter-event-category').value;
    const stat = ($('filter-event-status').value || '').toLowerCase();
    const pub = $('filter-event-published').value;

    const filtered = cachedEvents.filter((e) => {
      if (q && !(e.title || '').toLowerCase().includes(q) && !(e.location || '').toLowerCase().includes(q)) return false;
      if (catId && String(e.category_id) !== String(catId)) return false;
      if (stat && (e.status || '').toLowerCase() !== stat) return false;
      if (pub !== '' && String(e.is_published) !== String(pub)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="bi bi-calendar-x"></i><p>No matching events found.</p></td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((e) => {
      const bannerSrc = e.banner_url || '../assets/img/projects/marathon.jpg';
      const statusClass = (e.status || '').toLowerCase();
      const isPub = e.is_published === 1;

      return `
        <tr>
          <td>
            <img src="${esc(bannerSrc)}" class="table-thumb" alt="${esc(e.title)}" onerror="this.src='../assets/img/projects/marathon.jpg'">
          </td>
          <td>
            <strong style="color:#fff;font-size:14px;">${esc(e.title)}</strong>
            <div style="font-size:11px;color:var(--dim);margin-top:2px;">
              <i class="bi bi-geo-alt"></i> ${esc(e.location || 'Not specified')}
            </div>
          </td>
          <td>
            <span class="badge badge-category" style="${e.category_color ? `border-color:${e.category_color}40;color:${e.category_color};` : ''}">
              ${esc(e.category_display_name || e.category_name || 'General')}
            </span>
          </td>
          <td style="font-family:var(--f-mono);font-size:12px;">
            <div>${esc(e.event_date)}</div>
            ${e.start_time ? `<div style="color:var(--dim);font-size:10px;">${esc(e.start_time)} - ${esc(e.end_time || '')}</div>` : ''}
          </td>
          <td>
            <span class="badge badge-${statusClass}">${esc(e.status)}</span>
            ${e.is_featured ? '<span class="badge" style="background:rgba(168,85,247,0.15);color:var(--p2);border:1px solid rgba(168,85,247,0.3);margin-left:4px;">★ FEATURED</span>' : ''}
          </td>
          <td>
            <button type="button" class="btn-icon toggle" title="${isPub ? 'Click to unpublish' : 'Click to publish'}" onclick="AdminApp.toggleEventPublish(${e.id})">
              <i class="bi ${isPub ? 'bi-eye-fill text-success' : 'bi-eye-slash text-faint'}" style="${isPub ? 'color:var(--success)' : 'color:var(--faint)'}"></i>
            </button>
            <span style="font-size:11px;color:${isPub ? 'var(--success)' : 'var(--faint)'};margin-left:6px;">
              ${isPub ? 'Published' : 'Draft'}
            </span>
          </td>
          <td>
            <div class="table-actions">
              <button type="button" class="btn-icon edit" title="Edit Event" onclick="AdminApp.editEvent(${e.id})">
                <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn-icon delete" title="Delete Event" onclick="AdminApp.confirmDelete('event', ${e.id}, '${esc(e.title)}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function toggleEventPublish(id) {
    try {
      const res = await api(`/api/admin/events/${id}/publish`, { method: 'PATCH' });
      showToast(res.message, 'success');
      loadEvents();
      loadDashboard();
    } catch (err) {
      showToast('Error toggling publish state: ' + err.message, 'error');
    }
  }

  function editEvent(id) {
    const ev = cachedEvents.find((x) => x.id === id);
    if (!ev) return;

    $('modal-event-title').innerHTML = `<i class="bi bi-pencil-square"></i> Edit Event: ${esc(ev.title)}`;
    $('event-id').value = ev.id;
    $('event-title').value = ev.title || '';
    $('event-category').value = ev.category_id || '';
    $('event-date').value = ev.event_date || '';
    $('event-venue').value = ev.location || '';
    $('event-start').value = ev.start_time || '';
    $('event-end').value = ev.end_time || '';
    $('event-reg-url').value = ev.registration_url || '';
    $('event-banner-url').value = ev.banner_url || '';
    $('event-desc').value = ev.description || '';
    $('event-status').value = ev.status || 'Upcoming';
    $('event-featured').checked = ev.is_featured === 1;
    $('event-published').checked = ev.is_published === 1;

    if (ev.banner_url) {
      $('event-banner-preview').style.display = 'inline-block';
      $('event-banner-preview').querySelector('img').src = ev.banner_url;
    } else {
      $('event-banner-preview').style.display = 'none';
    }

    openModal('event');
  }

  async function handleEventSubmit(e) {
    e.preventDefault();
    const btn = $('btn-save-event');
    const id = $('event-id').value;

    const payload = {
      title: $('event-title').value.trim(),
      category_id: $('event-category').value ? parseInt($('event-category').value) : null,
      event_date: $('event-date').value.trim(),
      location: $('event-venue').value.trim(),
      start_time: $('event-start').value.trim(),
      end_time: $('event-end').value.trim(),
      registration_url: $('event-reg-url').value.trim(),
      banner_url: $('event-banner-url').value.trim(),
      description: $('event-desc').value.trim(),
      status: $('event-status').value,
      is_featured: $('event-featured').checked,
      is_published: $('event-published').checked
    };

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Saving...`;

    try {
      if (id) {
        await api(`/api/admin/events/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Event updated successfully!', 'success');
      } else {
        await api('/api/admin/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Event created successfully!', 'success');
      }

      closeModal('event');
      loadEvents();
      loadDashboard();
    } catch (err) {
      showToast('Error saving event: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-check-lg"></i> Save Event`;
    }
  }

  // --------------------------------------------------------------------------
  // TAB 3: MEMBERS MANAGEMENT
  // --------------------------------------------------------------------------

  async function loadMembers() {
    const tbody = $('members-table-body');
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty"><div class="spinner" style="margin:0 auto 12px;"></div><p>Fetching members...</p></td></tr>';

    try {
      cachedMembers = await api('/api/admin/members');
      // Populate member teams filter and team checklist
      populateMemberFilters();
      renderMembersTable();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty" style="color:var(--danger);">${esc(err.message)}</td></tr>`;
    }
  }

  async function populateMemberFilters() {
    // Populate team options
    if (cachedTeams.length === 0) {
      try {
        cachedTeams = await api('/api/admin/teams');
      } catch (e) {}
    }

    const tFilter = $('filter-member-team');
    const mTeam = $('member-team');
    const valF = tFilter ? tFilter.value : '';
    const valM = mTeam ? mTeam.value : '';

    if (tFilter) {
      tFilter.innerHTML = '<option value="">All Teams</option>' +
        cachedTeams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
      if (valF) tFilter.value = valF;
    }

    if (mTeam) {
      mTeam.innerHTML = '<option value="">None / Unassigned</option>' +
        cachedTeams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
      if (valM) mTeam.value = valM;
    }
  }

  function renderMembersTable() {
    const tbody = $('members-table-body');
    const q = ($('filter-member-search').value || '').toLowerCase().trim();
    const teamId = $('filter-member-team').value;
    const catId = $('filter-member-category').value;
    const batch = ($('filter-member-batch').value || '').toLowerCase();
    const status = $('filter-member-status').value;

    const filtered = cachedMembers.filter((m) => {
      if (q && !(m.full_name || '').toLowerCase().includes(q) && !(m.designation || '').toLowerCase().includes(q) && !(m.skills || '').toLowerCase().includes(q)) return false;
      if (teamId && String(m.team_id) !== String(teamId)) return false;
      if (catId && String(m.category_id) !== String(catId)) return false;
      if (batch && (m.batch_year || '').toLowerCase() !== batch) return false;
      if (status !== '' && String(m.is_active) !== String(status)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="table-empty"><i class="bi bi-people"></i><p>No matching members found.</p></td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((m) => {
      const initials = (m.full_name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      const photoHtml = m.profile_image_url
        ? `<img src="${esc(m.profile_image_url)}" class="table-thumb-round" alt="${esc(m.full_name)}" onerror="this.outerHTML='<div class=\\'table-initials\\'>${initials}</div>'">`
        : `<div class="table-initials">${initials}</div>`;

      const isActive = m.is_active === 1;

      return `
        <tr>
          <td>${photoHtml}</td>
          <td>
            <strong style="color:#fff;font-size:14px;">${esc(m.full_name)}</strong>
            ${m.skills ? `<div style="font-size:11px;color:var(--dim);margin-top:2px;">${esc(m.skills)}</div>` : ''}
          </td>
          <td>
            <span style="font-family:var(--f-mono);font-size:12px;color:var(--p2);">${esc(m.designation || '-')}</span>
          </td>
          <td>${esc(m.team_name || 'None')}</td>
          <td>${esc(m.category_name || '-')}</td>
          <td><span class="badge" style="background:rgba(255,255,255,0.06);">${esc(m.batch_year || 'Y23')}</span></td>
          <td style="font-family:var(--f-mono);font-size:11px;">#${m.display_order ?? 0}</td>
          <td>
            <span class="badge ${isActive ? 'badge-active' : 'badge-inactive'}">
              ${isActive ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td>
            <div class="table-actions">
              <button type="button" class="btn-icon edit" title="Edit Member" onclick="AdminApp.editMember(${m.id})">
                <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn-icon delete" title="Delete Member" onclick="AdminApp.confirmDelete('member', ${m.id}, '${esc(m.full_name)}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function editMember(id) {
    const m = cachedMembers.find((x) => x.id === id);
    if (!m) return;

    $('modal-member-title').innerHTML = `<i class="bi bi-pencil-square"></i> Edit Member: ${esc(m.full_name)}`;
    $('member-id').value = m.id;
    $('member-name').value = m.full_name || '';
    $('member-desig').value = m.designation || '';
    $('member-team').value = m.team_id || '';
    $('member-category').value = m.category_id || '';
    $('member-batch').value = m.batch_year || 'Y23';
    $('member-order').value = m.display_order ?? 0;
    $('member-skills').value = m.skills || '';
    $('member-bio').value = m.biography || '';
    $('member-photo-url').value = m.profile_image_url || '';

    const soc = m.social_links || {};
    $('member-linkedin').value = soc.linkedin || '';
    $('member-github').value = soc.github || '';
    $('member-email').value = soc.email || '';

    $('member-active').checked = m.is_active === 1;

    if (m.profile_image_url) {
      $('member-photo-preview').style.display = 'inline-block';
      $('member-photo-preview').querySelector('img').src = m.profile_image_url;
    } else {
      $('member-photo-preview').style.display = 'none';
    }

    openModal('member');
  }

  async function handleMemberSubmit(e) {
    e.preventDefault();
    const btn = $('btn-save-member');
    const id = $('member-id').value;

    const payload = {
      full_name: $('member-name').value.trim(),
      designation: $('member-desig').value.trim(),
      team_id: $('member-team').value ? parseInt($('member-team').value) : null,
      category_id: $('member-category').value ? parseInt($('member-category').value) : null,
      batch_year: $('member-batch').value,
      display_order: parseInt($('member-order').value || 0),
      skills: $('member-skills').value.trim(),
      biography: $('member-bio').value.trim(),
      profile_image_url: $('member-photo-url').value.trim(),
      social_links: {
        linkedin: $('member-linkedin').value.trim(),
        github: $('member-github').value.trim(),
        email: $('member-email').value.trim()
      },
      is_active: $('member-active').checked
    };

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Saving...`;

    try {
      if (id) {
        await api(`/api/admin/members/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Member details updated successfully!', 'success');
      } else {
        await api('/api/admin/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('New member added successfully!', 'success');
      }

      closeModal('member');
      loadMembers();
      loadDashboard();
    } catch (err) {
      showToast('Error saving member: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-check-lg"></i> Save Member`;
    }
  }

  // --------------------------------------------------------------------------
  // TAB 4: TEAMS MANAGEMENT
  // --------------------------------------------------------------------------

  async function loadTeams() {
    const tbody = $('teams-table-body');
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><div class="spinner" style="margin:0 auto 12px;"></div><p>Fetching teams...</p></td></tr>';

    try {
      cachedTeams = await api('/api/admin/teams');
      renderTeamsTable();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty" style="color:var(--danger);">${esc(err.message)}</td></tr>`;
    }
  }

  function renderTeamsTable() {
    const tbody = $('teams-table-body');
    const q = ($('filter-team-search').value || '').toLowerCase().trim();
    const catId = $('filter-team-category').value;

    const filtered = cachedTeams.filter((t) => {
      if (q && !(t.name || '').toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
      if (catId && String(t.category_id) !== String(catId)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><i class="bi bi-diagram-3"></i><p>No teams found.</p></td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((t) => {
      const logoSrc = t.logo_url || '../assets/img/1.jpg';
      const isActive = t.is_active === 1;

      return `
        <tr>
          <td>
            <img src="${esc(logoSrc)}" class="table-thumb" alt="${esc(t.name)}" onerror="this.src='../assets/img/1.jpg'">
          </td>
          <td>
            <strong style="color:#fff;font-size:14px;">${esc(t.name)}</strong>
            ${t.description ? `<div style="font-size:11px;color:var(--dim);margin-top:2px;">${esc(t.description.slice(0, 75))}...</div>` : ''}
          </td>
          <td>
            <span class="badge badge-category">${esc(t.category_name || 'Unassigned')}</span>
          </td>
          <td>${esc(t.team_lead_name || 'None Assigned')}</td>
          <td>
            <span class="badge" style="background:rgba(0,240,255,0.12);color:var(--c);border:1px solid rgba(0,240,255,0.25);">
              ${t.member_count ?? 0} Members
            </span>
          </td>
          <td style="font-family:var(--f-mono);font-size:11px;">#${t.display_order ?? 0}</td>
          <td>
            <span class="badge ${isActive ? 'badge-active' : 'badge-inactive'}">
              ${isActive ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td>
            <div class="table-actions">
              <button type="button" class="btn-icon edit" title="Edit Team" onclick="AdminApp.editTeam(${t.id})">
                <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn-icon delete" title="Delete Team" onclick="AdminApp.confirmDelete('team', ${t.id}, '${esc(t.name)}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function populateTeamModalFields(teamData = null) {
    // Team Lead options
    if (cachedMembers.length === 0) {
      try {
        cachedMembers = await api('/api/admin/members');
      } catch (e) {}
    }

    const leadSelect = $('team-lead');
    leadSelect.innerHTML = '<option value="">Select Team Leader</option>' +
      cachedMembers.map((m) => `<option value="${m.id}">${esc(m.full_name)} (${esc(m.designation)})</option>`).join('');

    if (teamData && teamData.team_lead_id) {
      leadSelect.value = teamData.team_lead_id;
    }

    // Members checklist
    const checklist = $('team-members-checklist');
    const assignedIds = new Set(teamData ? teamData.member_ids || [] : []);

    checklist.innerHTML = cachedMembers.map((m) => `
      <label class="checkbox-item">
        <input type="checkbox" name="team_members" value="${m.id}" ${assignedIds.has(m.id) ? 'checked' : ''}>
        <span>${esc(m.full_name)} <small style="color:var(--dim);">(${esc(m.designation)})</small></span>
      </label>
    `).join('');
  }

  function editTeam(id) {
    const t = cachedTeams.find((x) => x.id === id);
    if (!t) return;

    $('modal-team-title').innerHTML = `<i class="bi bi-pencil-square"></i> Edit Team: ${esc(t.name)}`;
    $('team-id').value = t.id;
    $('team-name').value = t.name || '';
    $('team-category').value = t.category_id || '';
    $('team-order').value = t.display_order ?? 0;
    $('team-logo-url').value = t.logo_url || '';
    $('team-desc').value = t.description || '';
    $('team-active').checked = t.is_active === 1;

    if (t.logo_url) {
      $('team-logo-preview').style.display = 'inline-block';
      $('team-logo-preview').querySelector('img').src = t.logo_url;
    } else {
      $('team-logo-preview').style.display = 'none';
    }

    populateTeamModalFields(t);
    openModal('team');
  }

  async function handleTeamSubmit(e) {
    e.preventDefault();
    const btn = $('btn-save-team');
    const id = $('team-id').value;

    const checkedBoxes = $$('#team-members-checklist input[name="team_members"]:checked');
    const memberIds = Array.from(checkedBoxes).map((cb) => parseInt(cb.value));

    const payload = {
      name: $('team-name').value.trim(),
      category_id: $('team-category').value ? parseInt($('team-category').value) : null,
      team_lead_id: $('team-lead').value ? parseInt($('team-lead').value) : null,
      display_order: parseInt($('team-order').value || 0),
      logo_url: $('team-logo-url').value.trim(),
      description: $('team-desc').value.trim(),
      is_active: $('team-active').checked,
      member_ids: memberIds
    };

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Saving...`;

    try {
      if (id) {
        await api(`/api/admin/teams/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Team updated successfully!', 'success');
      } else {
        await api('/api/admin/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('New team created successfully!', 'success');
      }

      closeModal('team');
      loadTeams();
      loadDashboard();
    } catch (err) {
      showToast('Error saving team: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-check-lg"></i> Save Team`;
    }
  }

  // --------------------------------------------------------------------------
  // TAB 5: CATEGORIES MANAGEMENT
  // --------------------------------------------------------------------------

  async function loadCategories() {
    const tbody = $('categories-table-body');
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><div class="spinner" style="margin:0 auto 12px;"></div><p>Fetching categories...</p></td></tr>';

    try {
      cachedCategories = await api('/api/admin/categories');
      populateCategoryDropdowns();
      renderCategoriesTable();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty" style="color:var(--danger);">${esc(err.message)}</td></tr>`;
    }
  }

  function renderCategoriesTable() {
    const tbody = $('categories-table-body');
    const q = ($('filter-category-search').value || '').toLowerCase().trim();

    const filtered = cachedCategories.filter((c) => {
      if (q && !(c.name || '').toLowerCase().includes(q) && !(c.description || '').toLowerCase().includes(q)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><i class="bi bi-tags"></i><p>No categories found.</p></td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((c) => {
      const color = c.color || '#a855f7';
      const icon = c.icon_url || 'bi-tags';
      const isActive = c.is_active === 1;

      return `
        <tr>
          <td>
            <div style="width:36px;height:36px;border-radius:8px;background:${color}20;border:1px solid ${color}60;color:${color};display:flex;align-items:center;justify-content:center;font-size:16px;">
              <i class="bi ${icon}"></i>
            </div>
          </td>
          <td>
            <strong style="color:#fff;font-size:14px;">${esc(c.name)}</strong>
          </td>
          <td style="font-size:12px;color:var(--dim);">${esc(c.description || '-')}</td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--f-mono);font-size:11px;">
              <span style="width:12px;height:12px;border-radius:3px;background:${color};"></span>
              ${esc(color)}
            </span>
          </td>
          <td>
            <span class="badge" style="background:rgba(255,255,255,0.06);">
              ${c.team_count ?? 0} Teams
            </span>
          </td>
          <td style="font-family:var(--f-mono);font-size:11px;">#${c.display_order ?? 0}</td>
          <td>
            <span class="badge ${isActive ? 'badge-active' : 'badge-inactive'}">
              ${isActive ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td>
            <div class="table-actions">
              <button type="button" class="btn-icon edit" title="Edit Category" onclick="AdminApp.editCategory(${c.id})">
                <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn-icon delete" title="Delete Category" onclick="AdminApp.confirmDelete('category', ${c.id}, '${esc(c.name)}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function editCategory(id) {
    const c = cachedCategories.find((x) => x.id === id);
    if (!c) return;

    $('modal-category-title').innerHTML = `<i class="bi bi-pencil-square"></i> Edit Category: ${esc(c.name)}`;
    $('category-id').value = c.id;
    $('category-name').value = c.name || '';
    $('category-desc').value = c.description || '';
    $('category-icon').value = c.icon_url || 'bi-tags';
    $('category-color').value = c.color || '#a855f7';
    $('category-order').value = c.display_order ?? 0;
    $('category-active').checked = c.is_active === 1;

    openModal('category');
  }

  async function handleCategorySubmit(e) {
    e.preventDefault();
    const btn = $('btn-save-category');
    const id = $('category-id').value;

    const payload = {
      name: $('category-name').value.trim(),
      description: $('category-desc').value.trim(),
      icon_url: $('category-icon').value.trim() || 'bi-tags',
      color: $('category-color').value,
      display_order: parseInt($('category-order').value || 0),
      is_active: $('category-active').checked
    };

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Saving...`;

    try {
      if (id) {
        await api(`/api/admin/categories/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Category updated successfully!', 'success');
      } else {
        await api('/api/admin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Category created successfully!', 'success');
      }

      closeModal('category');
      loadCategories();
      loadDashboard();
    } catch (err) {
      showToast('Error saving category: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-check-lg"></i> Save Category`;
    }
  }

  // --------------------------------------------------------------------------
  // TAB 6: WEBSITE PREVIEW
  // --------------------------------------------------------------------------

  function setPreviewDevice(device) {
    $$('.btn-device').forEach((b) => b.classList.toggle('active', b.dataset.device === device));
    const iframe = $('preview-iframe');
    iframe.className = `preview-iframe ${device}`;
  }

  function reloadPreview() {
    const iframe = $('preview-iframe');
    if (iframe) {
      iframe.src = '../index.html?t=' + Date.now();
    }
  }

  // --------------------------------------------------------------------------
  // TAB 7: SETTINGS & PASSWORD CHANGE
  // --------------------------------------------------------------------------

  async function handlePasswordChange(e) {
    e.preventDefault();
    const current = $('pwd-current').value;
    const pwdNew = $('pwd-new').value;
    const confirm = $('pwd-confirm').value;
    const btn = $('btn-save-pwd');

    if (pwdNew !== confirm) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (pwdNew.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Updating...`;

    try {
      await api('/api/admin/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: pwdNew })
      });
      showToast('Password changed successfully!', 'success');
      $('form-change-password').reset();
    } catch (err) {
      showToast('Error changing password: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-check-lg"></i> Update Password`;
    }
  }

  // --------------------------------------------------------------------------
  // IMAGE UPLOADS
  // --------------------------------------------------------------------------

  async function handleFileUpload(inputEl, targetUrlId, previewWrapId) {
    const file = inputEl.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image file size must be less than 10MB.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    showToast('Uploading image to secure storage...', 'info');

    try {
      const res = await api('/api/admin/upload', {
        method: 'POST',
        body: formData
      });

      if (res.url) {
        $(targetUrlId).value = res.url;
        const previewWrap = $(previewWrapId);
        if (previewWrap) {
          previewWrap.style.display = 'inline-block';
          previewWrap.querySelector('img').src = res.url;
        }
        showToast('Image uploaded and preview ready!', 'success');
      }
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
    }
  }

  function clearImagePreview(targetUrlId, previewWrapId) {
    $(targetUrlId).value = '';
    const wrap = $(previewWrapId);
    if (wrap) {
      wrap.style.display = 'none';
      wrap.querySelector('img').src = '';
    }
  }

  // --------------------------------------------------------------------------
  // MODAL MANAGEMENT & DELETE CONFIRMATION
  // --------------------------------------------------------------------------

  function openModal(type) {
    if (type === 'event' && !$('event-id').value) {
      $('form-event').reset();
      $('event-id').value = '';
      $('modal-event-title').innerHTML = `<i class="bi bi-calendar-event"></i> Add New Event`;
      $('event-banner-preview').style.display = 'none';
      $('event-published').checked = true;
    } else if (type === 'member' && !$('member-id').value) {
      $('form-member').reset();
      $('member-id').value = '';
      $('modal-member-title').innerHTML = `<i class="bi bi-person"></i> Add New Member`;
      $('member-photo-preview').style.display = 'none';
      $('member-active').checked = true;
      populateMemberFilters();
    } else if (type === 'team' && !$('team-id').value) {
      $('form-team').reset();
      $('team-id').value = '';
      $('modal-team-title').innerHTML = `<i class="bi bi-diagram-3"></i> Create New Team`;
      $('team-logo-preview').style.display = 'none';
      $('team-active').checked = true;
      populateTeamModalFields();
    } else if (type === 'category' && !$('category-id').value) {
      $('form-category').reset();
      $('category-id').value = '';
      $('modal-category-title').innerHTML = `<i class="bi bi-tag"></i> Add Category`;
      $('category-color').value = '#a855f7';
      $('category-icon').value = 'bi-tags';
      $('category-active').checked = true;
    }

    const m = $(`modal-${type}`);
    if (m) m.classList.add('show');
  }

  function closeModal(type) {
    const m = $(`modal-${type}`);
    if (m) m.classList.remove('show');

    // Reset forms when closing if they were add/edit
    if (type === 'event') $('event-id').value = '';
    if (type === 'member') $('member-id').value = '';
    if (type === 'team') $('team-id').value = '';
    if (type === 'category') $('category-id').value = '';
  }

  function confirmDelete(entityType, id, title) {
    pendingDeleteAction = { entityType, id };
    $('confirm-msg').innerHTML = `Are you sure you want to delete <strong>${esc(title)}</strong>?`;

    let submsg = 'This operation is permanent and cannot be undone.';
    if (entityType === 'team') {
      submsg += ' Any members assigned to this team will remain in the system as unassigned.';
    } else if (entityType === 'category') {
      submsg += ' If any teams use this category, they will be detached safely.';
    }
    $('confirm-submsg').textContent = submsg;

    openModal('confirm');
  }

  async function executeDelete() {
    if (!pendingDeleteAction) return;
    const { entityType, id } = pendingDeleteAction;
    const btn = $('btn-confirm-delete');

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Deleting...`;

    try {
      if (entityType === 'event') {
        await api(`/api/admin/events/${id}`, { method: 'DELETE' });
        showToast('Event deleted successfully.', 'success');
        loadEvents();
      } else if (entityType === 'member') {
        await api(`/api/admin/members/${id}`, { method: 'DELETE' });
        showToast('Member deleted successfully.', 'success');
        loadMembers();
      } else if (entityType === 'team') {
        await api(`/api/admin/teams/${id}?force=true`, { method: 'DELETE' });
        showToast('Team deleted successfully.', 'success');
        loadTeams();
      } else if (entityType === 'category') {
        await api(`/api/admin/categories/${id}?force=true`, { method: 'DELETE' });
        showToast('Category deleted successfully.', 'success');
        loadCategories();
      }

      closeModal('confirm');
      loadDashboard();
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-trash"></i> Permanently Delete`;
      pendingDeleteAction = null;
    }
  }

  // --------------------------------------------------------------------------
  // EVENT LISTENERS INITIALIZATION
  // --------------------------------------------------------------------------

  function initListeners() {
    // Password visibility toggle
    $('btn-toggle-pwd').addEventListener('click', () => {
      const input = $('login-password');
      const icon = $('btn-toggle-pwd').querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
      } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
      }
    });

    // Login Form Submit
    $('form-login').addEventListener('submit', handleLogin);

    // Logout
    $('btn-sidebar-logout').addEventListener('click', handleLogout);

    // Mobile menu
    $('btn-mobile-menu').addEventListener('click', () => {
      $('sidebar').classList.toggle('open');
    });

    // Sidebar navigation clicks
    $$('.sidebar-nav .nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (tab) switchTab(tab);
      });
    });

    // Form Submissions
    $('form-event').addEventListener('submit', handleEventSubmit);
    $('form-member').addEventListener('submit', handleMemberSubmit);
    $('form-team').addEventListener('submit', handleTeamSubmit);
    $('form-category').addEventListener('submit', handleCategorySubmit);
    $('form-change-password').addEventListener('submit', handlePasswordChange);

    // Confirm Delete button
    $('btn-confirm-delete').addEventListener('click', executeDelete);

    // Filter event listeners (real-time filtering)
    ['filter-event-search', 'filter-event-category', 'filter-event-status', 'filter-event-published'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('input', renderEventsTable);
    });

    ['filter-member-search', 'filter-member-team', 'filter-member-category', 'filter-member-batch', 'filter-member-status'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('input', renderMembersTable);
    });

    ['filter-team-search', 'filter-team-category'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('input', renderTeamsTable);
    });

    const catSearch = $('filter-category-search');
    if (catSearch) catSearch.addEventListener('input', renderCategoriesTable);

    // Close modals on backdrop click or ESC key
    $$('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('show');
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal-backdrop.show').forEach((m) => m.classList.remove('show'));
      }
    });
  }

  // Initial startup
  function init() {
    initListeners();
    checkSession();
  }

  // Public API
  return {
    init,
    switchTab,
    openModal,
    closeModal,
    editEvent,
    editMember,
    editTeam,
    editCategory,
    confirmDelete,
    toggleEventPublish,
    handleFileUpload,
    clearImagePreview,
    setPreviewDevice,
    reloadPreview
  };
})();

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', AdminApp.init);
