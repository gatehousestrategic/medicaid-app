/* =======================================================================
   SETUP
======================================================================= */
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

/* =======================================================================
   ROUTER
======================================================================= */
function route() {
  const hash = window.location.hash || '#/';
  if (hash.startsWith('#/login')) return renderLogin();
  if (hash.startsWith('#/signup')) return renderSignup();
  if (hash.startsWith('#/dashboard')) return renderDashboard();
  if (hash.startsWith('#/application/')) return renderApplicationDetail(hash.split('/')[2]);
  if (hash.startsWith('#/staff')) return renderStaff();
  return renderHome();
}
window.addEventListener('hashchange', route);
function go(hash) { window.location.hash = hash; }

/* =======================================================================
   AUTH BOOTSTRAP
======================================================================= */
async function loadProfile() {
  if (!currentUser) { currentProfile = null; return; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error) { currentProfile = null; } else currentProfile = data;
}

async function init() {
  const { data } = await sb.auth.getSession();
  currentUser = data.session ? data.session.user : null;
  if (currentUser) await loadProfile();
  sb.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session ? session.user : null;
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

/* =======================================================================
   LAYOUT
======================================================================= */
function layout(innerHtml, opts) {
  opts = opts || {};
  const narrow = opts.narrow ? ' narrow' : '';
  const topRight = currentUser
    ? `<span style="color:#C6D8C9;">${esc(currentProfile ? currentProfile.full_name || currentUser.email : currentUser.email)}</span>
       ${currentProfile && currentProfile.role !== 'applicant' ? `<a href="#/staff">Staff view</a>` : ''}
       <a href="#/dashboard">My applications</a>
       <button onclick="signOut()">Log out</button>`
    : `<a href="#/login">Log in</a><a href="#/signup">Sign up</a>`;
  root.innerHTML = `
    <div class="topbar">
      <a class="brandmark" href="#/">LTC Medicaid Helper<span class="dot">.</span></a>
      <div class="topbar-right">${topRight}</div>
    </div>
    <div class="wrap${narrow}">${innerHtml}</div>`;
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
}

/* =======================================================================
   HOME
======================================================================= */
function renderHome() {
  if (currentUser) return go('#/dashboard');
  layout(`
    <div class="card">
      <div class="eyebrow">Nursing home Medicaid — all 50 states</div>
      <h1>Let's build your application.</h1>
      <p class="lede">A guided intake for long-term care Medicaid — covering assets, income, the 5-year lookback, and every other section a caseworker needs. Generates a complete, ready-to-submit disclosure packet tailored to your state.</p>
      <div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap;">
        <a class="btn btn-primary" href="#/signup" style="text-decoration:none;display:inline-block;">Get started</a>
        <a class="btn btn-ghost" href="#/login" style="text-decoration:none;display:inline-block;">I already have an account</a>
      </div>
    </div>
  `);
}

/* =======================================================================
   LOGIN
======================================================================= */
function renderLogin() {
  if (currentUser) return go('#/dashboard');
  layout(`
    <div class="card">
      <h1>Log in</h1>
      <div class="field"><label class="flabel">Email</label><input type="email" id="loginEmail"></div>
      <div class="field"><label class="flabel">Password</label><input type="password" id="loginPassword"></div>
      <div id="loginError" class="error-text"></div>
      <button class="btn btn-primary" onclick="doLogin()" style="width:100%;margin-top:4px;">Log in</button>
      <p style="margin-top:16px;font-size:0.88rem;text-align:center;">No account yet? <a href="#/signup">Sign up</a></p>
    </div>
  `, { narrow: true });
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = error.message; return; }
  go('#/dashboard');
}

/* =======================================================================
   SIGNUP
======================================================================= */
function renderSignup() {
  if (currentUser) return go('#/dashboard');
  layout(`
    <div class="card">
      <h1>Create an account</h1>
      <div class="field"><label class="flabel">Full name</label><input type="text" id="suName"></div>
      <div class="field"><label class="flabel">Email</label><input type="email" id="suEmail"></div>
      <div class="field"><label class="flabel">Password</label><input type="password" id="suPassword"></div>
      <div id="suError" class="error-text"></div>
      <div id="suSuccess" class="note-box note-good" style="display:none;"></div>
      <button class="btn btn-primary" id="suBtn" onclick="doSignup()" style="width:100%;margin-top:4px;">Sign up</button>
      <p style="margin-top:16px;font-size:0.88rem;text-align:center;">Already have an account? <a href="#/login">Log in</a></p>
    </div>
  `, { narrow: true });
}

async function doSignup() {
  const full_name = document.getElementById('suName').value.trim();
  const email = document.getElementById('suEmail').value.trim();
  const password = document.getElementById('suPassword').value;
  const errEl = document.getElementById('suError');
  const okEl = document.getElementById('suSuccess');
  errEl.textContent = ''; okEl.style.display = 'none';
  if (!full_name || !email || !password) { errEl.textContent = 'Please fill in every field.'; return; }
  if (password.length < 8) { errEl.textContent = 'Password needs to be at least 8 characters.'; return; }
  document.getElementById('suBtn').disabled = true;
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name } } });
  document.getElementById('suBtn').disabled = false;
  if (error) { errEl.textContent = error.message; return; }
  if (data.session) { go('#/dashboard'); }
  else { okEl.style.display='block'; okEl.textContent='Account created. Check your email for a confirmation link, then log in.'; }
}

/* =======================================================================
   APPLICANT DASHBOARD
======================================================================= */
async function renderDashboard() {
  if (!currentUser) return go('#/login');
  layout(`<div class="card"><p class="spinner-text">Loading your applications…</p></div>`);
  const { data: apps, error } = await sb.from('applications').select('*').order('created_at', { ascending: false });
  if (error) {
    layout(`<div class="card"><h1>My applications</h1><div class="note-box note-bad">Couldn't load applications: ${esc(error.message)}</div></div>`);
    return;
  }
  const list = apps.length
    ? apps.map(a => {
        const st = a.state ? getStateData(a.state) : null;
        return `<div class="app-card">
          <div>
            <div><strong>${st ? st.name : (a.state || 'State not set')}</strong>${a.facility_name ? ' — ' + esc(a.facility_name) : ''}</div>
            <div class="meta">Started ${fmtDate(a.created_at)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="status-pill status-${a.status}">${STATUS_LABEL[a.status]||a.status}</span>
            <a class="btn btn-small btn-ghost" href="#/application/${a.id}">Open</a>
          </div>
        </div>`;}).join('')
    : `<div class="empty-state">No applications yet. Start one to begin.</div>`;

  layout(`
    <h1>My applications</h1>
    <p class="lede">Each application covers one person applying for nursing-home Medicaid.</p>
    ${list}
    <button class="btn btn-primary" onclick="createApplication()" style="margin-top:14px;">+ Start a new application</button>
  `);
}

async function createApplication() {
  const { data, error } = await sb.from('applications').insert({ applicant_user_id: currentUser.id, status: 'draft' }).select().single();
  if (error) { alert('Could not create application: ' + error.message); return; }
  go('#/application/' + data.id);
}

/* =======================================================================
   APPLICATION DETAIL  (intake form — next build phase)
======================================================================= */
async function renderApplicationDetail(id) {
  if (!currentUser) return go('#/login');
  layout(`<div class="card"><p class="spinner-text">Loading…</p></div>`);
  const { data: app, error } = await sb.from('applications').select('*').eq('id', id).single();
  if (error) {
    layout(`<div class="card"><h1>Application</h1><div class="note-box note-bad">Couldn't load this application: ${esc(error.message)}</div></div>`);
    return;
  }
  const st = app.state ? getStateData(app.state) : null;
  layout(`
    <div class="eyebrow">Application ${app.id.slice(0,8)}</div>
    <h1>${st ? st.name : (app.state || 'State not set yet')}</h1>
    <span class="status-pill status-${app.status}">${STATUS_LABEL[app.status]||app.status}</span>
    <div class="note-box note-neutral" style="margin-top:18px;">
      The full intake form is the next phase being built — applicant details, spouse, full asset inventory, income, 60-month lookback, document upload, and the state-specific generated packet.
      This page confirms the database connection and Row Level Security are working end to end.
    </div>
    <p style="margin-top:18px;"><a href="#/dashboard">← Back to my applications</a></p>
  `);
}

/* =======================================================================
   STAFF DASHBOARD
======================================================================= */
async function renderStaff() {
  if (!currentUser) return go('#/login');
  if (!currentProfile || currentProfile.role === 'applicant') {
    layout(`<div class="card"><div class="note-box note-bad">This page is for staff accounts only.</div></div>`);
    return;
  }
  layout(`<div class="card"><p class="spinner-text">Loading all applications…</p></div>`);
  const { data: apps, error } = await sb.from('applications').select('*').order('created_at', { ascending: false });
  if (error) {
    layout(`<div class="card"><h1>Staff — all applications</h1><div class="note-box note-bad">${esc(error.message)}</div></div>`);
    return;
  }
  const rows = apps.length
    ? apps.map(a => {
        const st = a.state ? getStateData(a.state) : null;
        return `<tr>
          <td style="font-family:monospace;font-size:0.82rem;">${a.id.slice(0,8)}</td>
          <td>${st ? st.name : (a.state||'—')}</td>
          <td><span class="status-pill status-${a.status}">${STATUS_LABEL[a.status]||a.status}</span></td>
          <td>${fmtDate(a.created_at)}</td>
          <td><a href="#/application/${a.id}">Open</a></td>
        </tr>`;}).join('')
    : `<tr><td colspan="5" class="empty-state">No applications yet.</td></tr>`;

  layout(`
    <div class="eyebrow">Staff view</div>
    <h1>All applications</h1>
    <table class="staff-table">
      <tr><th>ID</th><th>State</th><th>Status</th><th>Started</th><th></th></tr>
      ${rows}
    </table>
  `);
}

/* =======================================================================
   BOOT
======================================================================= */
init();
