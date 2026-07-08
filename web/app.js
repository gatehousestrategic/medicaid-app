/* ==========================================================================
   ClearCare — Application Logic
   Auth, routing, dashboard, staff view
   ========================================================================== */

const sb = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

let currentUser = null;
let currentProfile = null;
const root = document.getElementById('root');

const STATUS_LABEL = {
  draft: 'Draft', submitted: 'Submitted',
  in_review: 'In review', approved: 'Approved', denied: 'Denied'
};

/* --------------------------------------------------------------------------
   SVG Icons
-------------------------------------------------------------------------- */
const ICON = {
  shield: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8zm0-4h8v2H8zm0-4h5v2H8z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`,
  logo: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
  user: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
  empty: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6h-2.18c.07-.44.18-.88.18-1.34C18 2.54 15.96.5 13.64.5c-1.28 0-2.4.6-3.14 1.5L10 2.76l-.5-.78C8.76 1.1 7.64.5 6.36.5 4.04.5 2 2.54 2 4.66c0 .46.11.9.18 1.34H0v14h24V6h-4zm-6-3.62c.34-.4.85-.63 1.36-.63 1.06 0 1.86.9 1.86 2.25 0 .61-.26 1.09-.5 1.41l-1.72-3.03zM6.36 1.88c.51 0 1.02.23 1.36.63L6 5.41c-.24-.32-.5-.8-.5-1.41 0-1.35.8-2.12 1.86-2.12zM2 8h20v10H2V8zm8 4H4v-2h6v2zm4 4h-4v-2h4v2zm0-4h-2v-2h2v2zm6 4h-6v-2h6v2zm0-4h-4v-2h4v2z" opacity=".4"/><path d="M11 10H4v2h7v-2zm2 4v2h4v-2h-4zm2-4h-2v2h2v-2zm4 0h-2v2h2v-2zm0 4h-4v2h4v-2z" opacity="0"/></svg>`
};

/* --------------------------------------------------------------------------
   Router
-------------------------------------------------------------------------- */
function route() {
  const hash = window.location.hash || '#/';
  if (hash.startsWith('#/login'))        return renderLogin();
  if (hash.startsWith('#/signup'))       return renderSignup();
  if (hash.startsWith('#/dashboard'))    return renderDashboard();
  if (hash.startsWith('#/application/')) return renderApplication(hash.split('/')[2]);
  if (hash.startsWith('#/staff'))        return renderStaff();
  return renderHome();
}
window.addEventListener('hashchange', route);
function go(h) { window.location.hash = h; }

/* --------------------------------------------------------------------------
   Auth bootstrap
-------------------------------------------------------------------------- */
async function loadProfile() {
  if (!currentUser) { currentProfile = null; return; }
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  currentProfile = data || null;
}

async function init() {
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) await loadProfile();
  sb.auth.onAuthStateChange(async (_e, session) => {
    currentUser = session?.user || null;
    currentProfile = null;
    if (currentUser) await loadProfile();
    route();
  });
  route();
}

async function signOut() {
  await sb.auth.signOut();
  go('#/');
}

/* --------------------------------------------------------------------------
   Helpers
-------------------------------------------------------------------------- */
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}
function userName() {
  if (!currentUser) return '';
  return currentProfile?.full_name || currentUser.email || '';
}

/* --------------------------------------------------------------------------
   Layout shell
-------------------------------------------------------------------------- */
function shell(pageHtml, opts = {}) {
  const isStaff = currentProfile && currentProfile.role !== 'applicant';
  const nav = currentUser
    ? `<span class="nav-name">${esc(userName())}</span>
       ${isStaff ? `<a href="#/staff">Staff view</a>` : ''}
       <a href="#/dashboard">My applications</a>
       <button onclick="signOut()">Sign out</button>`
    : `<a href="#/login">Sign in</a><a href="#/signup" style="background:var(--cyan);color:var(--navy-dark);border-color:var(--cyan);font-weight:700;">Get started</a>`;

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;">
      <header class="site-header">
        <div class="site-header-inner">
          <a class="site-logo" href="#/">
            <div class="site-logo-mark">${ICON.logo}</div>
            <div>
              <div class="site-logo-name">Clear<span>Care</span></div>
              <div class="site-logo-tagline">Medicaid Application Assistant</div>
            </div>
          </a>
          <nav class="site-nav">${nav}</nav>
        </div>
      </header>
      ${pageHtml}
      <footer class="site-footer">
        ClearCare is an independent self-help tool, not a government website. It does not submit anything to any agency on your behalf.
        &nbsp;·&nbsp; <a href="#/">Home</a>
      </footer>
    </div>`;
}

/* --------------------------------------------------------------------------
   Home
-------------------------------------------------------------------------- */
function renderHome() {
  if (currentUser) return go('#/dashboard');
  shell(`
    <div class="hero">
      <div class="hero-inner">
        <div>
          <p style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--cyan);margin-bottom:12px;">All 50 States · Nursing Home Medicaid</p>
          <h1>Applying for Medicaid <span>shouldn't be this hard.</span></h1>
          <p>ClearCare guides you through every section a caseworker needs — assets, income, the 5-year lookback, and more — then produces a complete, ready-to-submit disclosure packet tailored to your state.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/signup" style="background:var(--cyan);color:var(--navy-dark);font-size:1.05rem;padding:14px 28px;">Start your application</a>
            <a class="btn btn-secondary" href="#/login" style="border-color:rgba(255,255,255,0.3);color:#fff;background:rgba(255,255,255,0.08);">Sign in</a>
          </div>
        </div>
        <div class="hero-card">
          <h3>How it works</h3>
          <div class="hero-step"><div class="hero-step-num">1</div><div class="hero-step-text">Answer questions about the applicant, household, and finances</div></div>
          <div class="hero-step"><div class="hero-step-num">2</div><div class="hero-step-text">Upload supporting documents — bank statements, IDs, and more</div></div>
          <div class="hero-step"><div class="hero-step-num">3</div><div class="hero-step-text">Download a complete, state-specific application packet</div></div>
          <div class="hero-step"><div class="hero-step-num">4</div><div class="hero-step-text">Submit to your state Medicaid agency with confidence</div></div>
        </div>
      </div>
    </div>

    <div class="features">
      <div class="feature-item">
        <div class="feature-icon">${ICON.shield}</div>
        <h3>Covers the 5-year lookback</h3>
        <p>Every transfer, gift, and asset sale in the past 60 months — captured in full detail, with attorney-review flags for anything that may affect eligibility.</p>
      </div>
      <div class="feature-item">
        <div class="feature-icon">${ICON.doc}</div>
        <h3>State-specific output</h3>
        <p>Correct thresholds, agency names, and submission instructions for all 50 states — automatically applied based on your state selection.</p>
      </div>
      <div class="feature-item">
        <div class="feature-icon">${ICON.check}</div>
        <h3>Save and return</h3>
        <p>Your progress is saved automatically. Come back any time — on any device — and pick up exactly where you left off.</p>
      </div>
    </div>

    <div style="background:var(--navy-dark);padding:40px 20px;text-align:center;">
      <div style="max-width:600px;margin:0 auto;">
        <p style="color:rgba(255,255,255,0.6);font-size:0.875rem;margin:0;">ClearCare is an independent self-help tool. It is not affiliated with any government agency and does not provide legal advice. For complex Medicaid planning situations, consult a Certified Medicaid Planner or elder law attorney.</p>
      </div>
    </div>
  `);
}

/* --------------------------------------------------------------------------
   Login
-------------------------------------------------------------------------- */
function renderLogin() {
  if (currentUser) return go('#/dashboard');
  shell(`
    <div class="page-wrap narrow" style="padding-top:48px;">
      <div class="card">
        <h1 style="font-size:1.5rem;margin-bottom:6px;">Sign in to ClearCare</h1>
        <p class="text-faint text-sm" style="margin-bottom:24px;">Pick up where you left off.</p>
        <div class="field">
          <label class="label" for="loginEmail">Email address</label>
          <input type="email" id="loginEmail" autocomplete="email">
        </div>
        <div class="field">
          <label class="label" for="loginPw">Password</label>
          <input type="password" id="loginPw" autocomplete="current-password">
        </div>
        <div id="loginErr" class="alert alert-error" style="display:none;"></div>
        <button class="btn btn-primary" onclick="doLogin()" style="width:100%;justify-content:center;margin-top:8px;">Sign in</button>
        <p class="text-sm text-faint" style="text-align:center;margin-top:20px;margin-bottom:0;">
          Don't have an account? <a href="#/signup">Get started — it's free</a>
        </p>
      </div>
    </div>
  `);
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPw').value;
  const err = document.getElementById('loginErr');
  err.style.display = 'none';
  if (!email || !pw) { err.style.display='block'; err.textContent='Please enter your email and password.'; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) { err.style.display='block'; err.textContent=error.message; return; }
  go('#/dashboard');
}

/* --------------------------------------------------------------------------
   Signup
-------------------------------------------------------------------------- */
function renderSignup() {
  if (currentUser) return go('#/dashboard');
  shell(`
    <div class="page-wrap narrow" style="padding-top:48px;">
      <div class="card">
        <h1 style="font-size:1.5rem;margin-bottom:6px;">Create your account</h1>
        <p class="text-faint text-sm" style="margin-bottom:24px;">Free to use. Your information is kept private and secure.</p>
        <div class="field">
          <label class="label" for="suName">Full name <span class="req">*</span></label>
          <input type="text" id="suName" autocomplete="name">
        </div>
        <div class="field">
          <label class="label" for="suEmail">Email address <span class="req">*</span></label>
          <input type="email" id="suEmail" autocomplete="email">
        </div>
        <div class="field">
          <label class="label" for="suPw">Password <span class="req">*</span></label>
          <input type="password" id="suPw" autocomplete="new-password">
          <div class="hint">At least 8 characters.</div>
        </div>
        <div id="suErr" class="alert alert-error" style="display:none;"></div>
        <div id="suOk" class="alert alert-success" style="display:none;"></div>
        <button class="btn btn-primary" id="suBtn" onclick="doSignup()" style="width:100%;justify-content:center;margin-top:8px;">Create account</button>
        <p class="text-sm text-faint" style="text-align:center;margin-top:20px;margin-bottom:0;">
          Already have an account? <a href="#/login">Sign in</a>
        </p>
      </div>
    </div>
  `);
}

async function doSignup() {
  const full_name = document.getElementById('suName').value.trim();
  const email = document.getElementById('suEmail').value.trim();
  const pw = document.getElementById('suPw').value;
  const err = document.getElementById('suErr');
  const ok = document.getElementById('suOk');
  err.style.display='none'; ok.style.display='none';
  if (!full_name||!email||!pw) { err.style.display='block'; err.textContent='Please fill in all fields.'; return; }
  if (pw.length < 8) { err.style.display='block'; err.textContent='Password must be at least 8 characters.'; return; }
  document.getElementById('suBtn').disabled = true;
  const { data, error } = await sb.auth.signUp({ email, password:pw, options:{ data:{ full_name } } });
  document.getElementById('suBtn').disabled = false;
  if (error) { err.style.display='block'; err.textContent=error.message; return; }
  if (data.session) { go('#/dashboard'); }
  else { ok.style.display='block'; ok.textContent='Account created! Check your email for a confirmation link, then sign in.'; }
}

/* --------------------------------------------------------------------------
   Dashboard
-------------------------------------------------------------------------- */
async function renderDashboard() {
  if (!currentUser) return go('#/login');
  shell(`<div class="spinner-wrap">Loading your applications…</div>`);

  const { data: apps, error } = await sb
    .from('applications').select('*').order('created_at', { ascending: false });

  if (error) {
    shell(`<div class="page-wrap"><div class="alert alert-error"><strong>Could not load applications.</strong>${esc(error.message)}</div></div>`);
    return;
  }

  const greeting = userName() ? `Welcome back, ${esc(userName().split(' ')[0])}.` : 'Your applications';

  const list = apps.length ? apps.map(a => {
    const st = a.state ? getStateData(a.state) : null;
    return `<div class="app-row">
      <div>
        <div class="app-row-title">${st ? esc(st.name) : (a.state ? esc(a.state) : 'State not selected yet')}</div>
        <div class="app-row-meta">${a.facility_name ? esc(a.facility_name) + ' · ' : ''}Started ${fmtDate(a.created_at)}</div>
      </div>
      <div class="app-row-actions">
        <span class="badge badge-${a.status}">${STATUS_LABEL[a.status]||a.status}</span>
        <a class="btn btn-secondary btn-sm" href="#/application/${a.id}">Continue →</a>
      </div>
    </div>`;
  }).join('') : `
    <div class="empty-state">
      ${ICON.empty}
      <p>No applications yet. Start one below.</p>
    </div>`;

  shell(`
    <div class="page-header">
      <div class="page-header-inner">
        <div class="eyebrow">Dashboard</div>
        <h1>${greeting}</h1>
        <p>Each application covers one person applying for nursing-home Medicaid.</p>
      </div>
    </div>
    <div class="page-wrap">
      ${list}
      <button class="btn btn-primary" onclick="createApplication()" style="margin-top:${apps.length?'8':'0'}px;">
        ${ICON.plus} Start a new application
      </button>
    </div>
  `);
}

async function createApplication() {
  const { data, error } = await sb.from('applications')
    .insert({ applicant_user_id: currentUser.id, status: 'draft' })
    .select().single();
  if (error) { alert('Could not create application: ' + error.message); return; }
  go('#/application/' + data.id);
}

/* --------------------------------------------------------------------------
   Application detail (intake form — next phase)
-------------------------------------------------------------------------- */
async function renderApplication(id) {
  if (!currentUser) return go('#/login');
  shell(`<div class="spinner-wrap">Loading…</div>`);

  const { data: app, error } = await sb.from('applications').select('*').eq('id', id).single();
  if (error) {
    shell(`<div class="page-wrap"><div class="alert alert-error"><strong>Couldn't load this application.</strong> ${esc(error.message)}</div></div>`);
    return;
  }

  const st = app.state ? getStateData(app.state) : null;

  shell(`
    <div class="page-header">
      <div class="page-header-inner">
        <div class="eyebrow">Application ${app.id.slice(0,8)}</div>
        <h1>${st ? esc(st.name) : 'New application'}</h1>
        <p>Status: <span class="badge badge-${app.status}" style="vertical-align:middle;">${STATUS_LABEL[app.status]||app.status}</span></p>
      </div>
    </div>
    <div class="page-wrap medium">
      <div class="alert alert-info">
        <strong>Intake form coming next.</strong>
        This page confirms your account, database, and Row Level Security are all working correctly. The full intake — applicant details, spouse information, asset inventory, income, 60-month lookback, document uploads, and the state-specific PDF packet — is the next phase being built.
      </div>
      <a href="#/dashboard" class="btn btn-secondary">← Back to my applications</a>
    </div>
  `);
}

/* --------------------------------------------------------------------------
   Staff dashboard
-------------------------------------------------------------------------- */
async function renderStaff() {
  if (!currentUser) return go('#/login');
  if (!currentProfile || currentProfile.role === 'applicant') {
    shell(`<div class="page-wrap"><div class="alert alert-error">This page is for staff accounts only.</div></div>`);
    return;
  }

  shell(`<div class="spinner-wrap">Loading all applications…</div>`);

  const { data: apps, error } = await sb
    .from('applications').select('*').order('created_at', { ascending: false });

  if (error) {
    shell(`<div class="page-wrap"><div class="alert alert-error">${esc(error.message)}</div></div>`);
    return;
  }

  const rows = apps.length ? apps.map(a => {
    const st = a.state ? getStateData(a.state) : null;
    return `<tr>
      <td class="mono">${a.id.slice(0,8)}</td>
      <td>${st ? esc(st.name) : (a.state||'—')}</td>
      <td><span class="badge badge-${a.status}">${STATUS_LABEL[a.status]||a.status}</span></td>
      <td>${fmtDate(a.created_at)}</td>
      <td><a href="#/application/${a.id}" class="btn btn-secondary btn-sm">Open</a></td>
    </tr>`;
  }).join('') : `<tr><td colspan="5"><div class="empty-state"><p>No applications yet.</p></div></td></tr>`;

  shell(`
    <div class="page-header">
      <div class="page-header-inner">
        <div class="eyebrow">Staff view</div>
        <h1>All applications</h1>
        <p>${apps.length} application${apps.length===1?'':'s'} total</p>
      </div>
    </div>
    <div class="page-wrap">
      <table class="data-table">
        <thead><tr><th>ID</th><th>State</th><th>Status</th><th>Started</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

/* --------------------------------------------------------------------------
   Boot
-------------------------------------------------------------------------- */
init();
