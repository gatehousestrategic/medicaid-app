/* ==========================================================================
   ClearCare — Staff Portal (staff.js)
   Full staff dashboard: login, application list, detail view with
   editing, notes, document upload, and status management.
   ========================================================================== */

const sb = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

let currentUser = null;
let currentProfile = null;
const root = document.getElementById('root');

const STATUS_OPTIONS = [
  { v:'draft',     label:'Draft' },
  { v:'submitted', label:'Submitted' },
  { v:'in_review', label:'In review' },
  { v:'approved',  label:'Approved' },
  { v:'denied',    label:'Denied' },
];

/* --------------------------------------------------------------------------
   Helpers
-------------------------------------------------------------------------- */
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
}
function fmtMoney(n) {
  n = parseFloat(n)||0;
  return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function go(h) { window.location.hash = h; }

/* --------------------------------------------------------------------------
   Auth
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

function isStaff() {
  return currentProfile && (currentProfile.role === 'staff' || currentProfile.role === 'admin');
}

/* --------------------------------------------------------------------------
   Router
-------------------------------------------------------------------------- */
function route() {
  if (!currentUser) return renderLogin();
  if (!isStaff()) return renderAccessDenied();
  const hash = window.location.hash || '#/';
  if (hash.startsWith('#/app/')) return renderAppDetail(hash.split('/')[2], hash.split('/')[3] || 'overview');
  if (hash.startsWith('#/apps')) return renderAppList();
  return renderDashboard();
}
window.addEventListener('hashchange', route);

/* --------------------------------------------------------------------------
   Sidebar shell
-------------------------------------------------------------------------- */
function shell(mainHtml, title) {
  const name = currentProfile?.full_name || currentUser?.email || '';
  const hash = window.location.hash || '#/';
  const isActive = (h) => hash.startsWith(h) ? 'active' : '';

  root.innerHTML = `
    <div class="layout">
      <nav class="sidebar">
        <div class="sidebar-logo">
          <div class="sidebar-logo-name">Clear<span>Care</span></div>
          <div class="sidebar-logo-sub">Staff Portal</div>
        </div>
        <div class="sidebar-user">
          <strong>${esc(name)}</strong>
          ${esc(currentProfile?.role || 'staff')}
        </div>
        <div class="sidebar-nav">
          <a class="nav-item ${isActive('#/')}" onclick="go('#/')" href="#">
            ${iconDashboard()} Dashboard
          </a>
          <a class="nav-item ${isActive('#/apps')}" onclick="go('#/apps')" href="#">
            ${iconList()} Applications
          </a>
        </div>
        <div class="sidebar-footer">
          <button onclick="signOut()">Sign out</button>
        </div>
      </nav>
      <main class="main">
        <div class="topbar">
          <h1>${esc(title||'Dashboard')}</h1>
        </div>
        <div class="page-body">${mainHtml}</div>
      </main>
    </div>`;
}

/* --------------------------------------------------------------------------
   Login
-------------------------------------------------------------------------- */
function renderLogin() {
  root.innerHTML = `
    <div style="background:#f0f0f0;min-height:100vh;">
      <div class="login-wrap">
        <div class="login-logo">
          <div class="login-logo-name">Clear<span>Care</span></div>
          <div class="login-logo-sub">Staff Portal</div>
        </div>
        <div class="card">
          <h2 style="margin-bottom:20px;">Staff sign in</h2>
          <div class="field"><label class="label">Email</label><input type="email" id="lEmail" autocomplete="email"></div>
          <div class="field"><label class="label">Password</label><input type="password" id="lPw" autocomplete="current-password"></div>
          <div id="lErr" class="error-text"></div>
          <button class="btn btn-primary" onclick="doLogin()" style="width:100%;margin-top:8px;justify-content:center;">Sign in</button>
        </div>
        <p style="text-align:center;font-size:0.8rem;color:#666;margin-top:16px;">This portal is for authorized staff only.<br>Applicants: <a href="https://apply.gatehousestrategic.com">apply.gatehousestrategic.com</a></p>
      </div>
    </div>`;
}

async function doLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pw    = document.getElementById('lPw').value;
  const err   = document.getElementById('lErr');
  err.textContent = '';
  if (!email || !pw) { err.textContent = 'Please enter your email and password.'; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) { err.textContent = error.message; return; }
}

function renderAccessDenied() {
  root.innerHTML = `<div style="text-align:center;padding:80px 20px;">
    <h2>Access denied</h2>
    <p>This portal is for staff accounts only.</p>
    <button class="btn btn-secondary" onclick="signOut()">Sign out</button>
  </div>`;
}

/* --------------------------------------------------------------------------
   Dashboard
-------------------------------------------------------------------------- */
async function renderDashboard() {
  shell(`<div class="spinner">Loading…</div>`, 'Dashboard');

  const { data: apps } = await sb.from('applications').select('*');
  if (!apps) return;

  const total    = apps.length;
  const draft    = apps.filter(a=>a.status==='draft').length;
  const inReview = apps.filter(a=>a.status==='in_review').length;
  const submitted= apps.filter(a=>a.status==='submitted').length;
  const approved = apps.filter(a=>a.status==='approved').length;
  const denied   = apps.filter(a=>a.status==='denied').length;

  // By state
  const byState = {};
  apps.forEach(a => { if(a.state) byState[a.state]=(byState[a.state]||0)+1; });
  const topStates = Object.entries(byState).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Recent (last 5)
  const recent = [...apps].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);

  shell(`
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Total applications</div></div>
      <div class="stat-card cyan"><div class="stat-num">${submitted+inReview}</div><div class="stat-label">Needs attention</div></div>
      <div class="stat-card green"><div class="stat-num">${approved}</div><div class="stat-label">Approved</div></div>
      <div class="stat-card amber"><div class="stat-num">${draft}</div><div class="stat-label">In draft</div></div>
    </div>

    <div class="chart-grid">
      <div class="chart-card">
        <h3>Applications by status</h3>
        <canvas id="statusChart" height="200"></canvas>
      </div>
      <div class="chart-card">
        <h3>Top states</h3>
        <canvas id="stateChart" height="200"></canvas>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:14px;">Recent applications</h3>
      <table class="data-table">
        <thead><tr><th>ID</th><th>State</th><th>Status</th><th>Started</th><th></th></tr></thead>
        <tbody>
          ${recent.map(a => {
            const st = a.state ? getStateData(a.state) : null;
            return `<tr onclick="go('#/app/${a.id}')" style="cursor:pointer;">
              <td class="mono">${a.id.slice(0,8)}</td>
              <td>${st ? esc(st.name) : (a.state||'—')}</td>
              <td><span class="badge badge-${a.status}">${STATUS_OPTIONS.find(s=>s.v===a.status)?.label||a.status}</span></td>
              <td>${fmtDate(a.created_at)}</td>
              <td><button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();go('#/app/${a.id}')">Open →</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `, 'Dashboard');

  // Draw charts
  setTimeout(() => {
    const statusCtx = document.getElementById('statusChart');
    const stateCtx  = document.getElementById('stateChart');
    if (statusCtx) {
      new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: ['Draft','Submitted','In review','Approved','Denied'],
          datasets: [{ data: [draft,submitted,inReview,approved,denied], backgroundColor: ['#dfe1e2','#e8f0fb','#faf3d1','#ecf3ec','#f4e3db'], borderWidth:2 }]
        },
        options: { plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } }, cutout:'65%' }
      });
    }
    if (stateCtx && topStates.length > 0) {
      new Chart(stateCtx, {
        type: 'bar',
        data: {
          labels: topStates.map(s => { const d=getStateData(s[0]); return d?d.name:s[0]; }),
          datasets: [{ data: topStates.map(s=>s[1]), backgroundColor:'#1a4480', borderRadius:4 }]
        },
        options: { plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
      });
    }
  }, 50);
}

/* --------------------------------------------------------------------------
   Application list
-------------------------------------------------------------------------- */
async function renderAppList() {
  shell(`<div class="spinner">Loading…</div>`, 'All applications');

  const { data: apps } = await sb.from('applications').select('*').order('created_at', { ascending: false });
  if (!apps) return;

  // Load people for name display
  const { data: people } = await sb.from('application_people').select('application_id,first_name,last_name,person_role');
  const nameMap = {};
  (people||[]).filter(p=>p.person_role==='applicant').forEach(p => {
    nameMap[p.application_id] = [p.first_name,p.last_name].filter(Boolean).join(' ');
  });

  const rows = apps.map(a => {
    const st   = a.state ? getStateData(a.state) : null;
    const name = nameMap[a.id] || '(no name yet)';
    return `<tr onclick="go('#/app/${a.id}')" style="cursor:pointer;">
      <td class="mono">${a.id.slice(0,8)}</td>
      <td><strong>${esc(name)}</strong></td>
      <td>${st ? esc(st.name) : (a.state||'—')}</td>
      <td><span class="badge badge-${a.status}">${STATUS_OPTIONS.find(s=>s.v===a.status)?.label||a.status}</span></td>
      <td>${fmtDate(a.created_at)}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();go('#/app/${a.id}')">Open →</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" style="text-align:center;padding:30px;color:#666;">No applications yet.</td></tr>`;

  shell(`
    <div class="card">
      <div class="filters">
        <select id="filterStatus" onchange="filterAppList()">
          <option value="">All statuses</option>
          ${STATUS_OPTIONS.map(s=>`<option value="${s.v}">${s.label}</option>`).join('')}
        </select>
        <input type="text" id="filterSearch" placeholder="Search name or state…" oninput="filterAppList()" style="width:220px;">
      </div>
      <table class="data-table" id="appTable">
        <thead><tr><th>ID</th><th>Applicant</th><th>State</th><th>Status</th><th>Started</th><th></th></tr></thead>
        <tbody id="appTableBody">${rows}</tbody>
      </table>
    </div>
  `, 'All applications');

  window._allApps = apps;
  window._nameMap = nameMap;
}

window.filterAppList = function() {
  const status = document.getElementById('filterStatus')?.value || '';
  const search = (document.getElementById('filterSearch')?.value || '').toLowerCase();
  const apps = window._allApps || [];
  const nameMap = window._nameMap || {};

  const filtered = apps.filter(a => {
    if (status && a.status !== status) return false;
    if (search) {
      const name = (nameMap[a.id]||'').toLowerCase();
      const state = (a.state||'').toLowerCase();
      const stName = a.state ? (getStateData(a.state)?.name||'').toLowerCase() : '';
      if (!name.includes(search) && !state.includes(search) && !stName.includes(search)) return false;
    }
    return true;
  });

  const body = document.getElementById('appTableBody');
  if (!body) return;
  body.innerHTML = filtered.map(a => {
    const st   = a.state ? getStateData(a.state) : null;
    const name = nameMap[a.id] || '(no name yet)';
    return `<tr onclick="go('#/app/${a.id}')" style="cursor:pointer;">
      <td class="mono">${a.id.slice(0,8)}</td>
      <td><strong>${esc(name)}</strong></td>
      <td>${st ? esc(st.name) : (a.state||'—')}</td>
      <td><span class="badge badge-${a.status}">${STATUS_OPTIONS.find(s=>s.v===a.status)?.label||a.status}</span></td>
      <td>${fmtDate(a.created_at)}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();go('#/app/${a.id}')">Open →</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" style="text-align:center;padding:30px;color:#666;">No results.</td></tr>`;
};

/* --------------------------------------------------------------------------
   Application detail
-------------------------------------------------------------------------- */
let _app = null, _people = [], _assets = [], _income = [], _transfers = [], _notes = [], _docs = [];

async function renderAppDetail(id, section) {
  section = section || 'overview';
  shell(`<div class="spinner">Loading application…</div>`, 'Application');

  const [appRes, peopleRes, assetsRes, incRes, transRes, notesRes, docsRes] = await Promise.all([
    sb.from('applications').select('*').eq('id', id).single(),
    sb.from('application_people').select('*').eq('application_id', id),
    sb.from('assets').select('*').eq('application_id', id),
    sb.from('income_sources').select('*').eq('application_id', id),
    sb.from('transfers').select('*').eq('application_id', id).order('transfer_date',{ascending:false}),
    sb.from('staff_notes').select('*, profiles(full_name)').eq('application_id', id).order('created_at',{ascending:false}),
    sb.from('documents').select('*, profiles(full_name)').eq('application_id', id).order('uploaded_at',{ascending:false}),
  ]);

  _app = appRes.data || {};
  _people    = peopleRes.data || [];
  _assets    = assetsRes.data || [];
  _income    = incRes.data || [];
  _transfers = transRes.data || [];
  _notes     = notesRes.data || [];
  _docs      = docsRes.data || [];

  const applicant = _people.find(p=>p.person_role==='applicant') || {};
  const spouse    = _people.find(p=>p.person_role==='spouse') || {};
  const st        = _app.state ? getStateData(_app.state) : null;
  const appName   = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') || 'Unnamed applicant';

  const tabs = ['overview','people','assets','income','transfers','documents','notes'];
  const tabsHtml = tabs.map(t =>
    `<button class="section-tab ${t===section?'active':''}" onclick="go('#/app/${id}/${t}')">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`
  ).join('');

  let sectionHtml = '';
  if (section === 'overview')   sectionHtml = renderOverview(_app, applicant, spouse, st);
  if (section === 'people')     sectionHtml = renderPeopleSection(id, applicant, spouse);
  if (section === 'assets')     sectionHtml = renderAssetsSection(id);
  if (section === 'income')     sectionHtml = renderIncomeSection(id);
  if (section === 'transfers')  sectionHtml = renderTransfersSection(id, st);
  if (section === 'documents')  sectionHtml = renderDocsSection(id);
  if (section === 'notes')      sectionHtml = renderNotesSection(id);

  shell(`
    <div style="margin-bottom:6px;">
      <a href="#/apps" style="font-size:0.82rem;color:var(--ink-faint);">← All applications</a>
    </div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="margin-bottom:4px;">${esc(appName)}</h2>
        <div style="font-size:0.85rem;color:var(--ink-faint);">${st?esc(st.name):'No state'} · Started ${fmtDate(_app.created_at)} · ID: <span class="mono">${id.slice(0,8)}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <select class="status-select" style="width:160px;" onchange="updateStatus('${id}',this.value)">
          ${STATUS_OPTIONS.map(s=>`<option value="${s.v}" ${_app.status===s.v?'selected':''}>${s.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="app-detail">
      <div>
        <div class="staff-edit-banner">✏️ Staff edit mode — changes save directly to the applicant's record</div>
        <div class="section-tabs">${tabsHtml}</div>
        ${sectionHtml}
      </div>
      <div class="staff-panel">
        ${quickNotesPanel(id)}
        ${quickDocsPanel(id)}
      </div>
    </div>
  `, esc(appName));
}

/* --------------------------------------------------------------------------
   Overview tab
-------------------------------------------------------------------------- */
function renderOverview(app, applicant, spouse, st) {
  function row(label, val) {
    return `<tr><td style="color:var(--ink-faint);width:180px;padding:7px 10px;font-size:0.85rem;">${esc(label)}</td><td style="padding:7px 10px;font-size:0.875rem;">${val||'—'}</td></tr>`;
  }
  function table(rows) { return `<table style="width:100%;border-collapse:collapse;">${rows}</table>`; }

  const totalAssets = _assets.reduce((s,a)=>s+(parseFloat(a.value)||0),0);
  const countable   = _assets.filter(a=>!a.is_exempt).reduce((s,a)=>s+(parseFloat(a.value)||0),0);
  const totalIncome = _income.reduce((s,i)=>{
    const freqMap={weekly:52/12,biweekly:26/12,monthly:1,yearly:1/12};
    return s+(parseFloat(i.amount)||0)*(freqMap[i.frequency]||1);
  },0);
  const totalUncomp = _transfers.reduce((s,t)=>s+(parseFloat(t.uncompensated_value)||0),0);

  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:14px;">Application summary</h3>
      ${table(
        row('State / program', st ? esc(st.name)+' — '+esc(st.programName) : '—') +
        row('Facility', app.facility_name||'—') +
        row('Admission date', fmtDate(app.facility_admission_date)) +
        row('Marital status', app.marital_status==='married'?'Married':'Single / widowed / divorced') +
        row('Level of care documented', app.level_of_care_documented?'Yes':'Not yet confirmed')
      )}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:14px;">Financial snapshot</h3>
      ${table(
        row('Total assets', fmtMoney(totalAssets)) +
        row('Countable assets', fmtMoney(countable)) +
        (st?row('Asset limit', st.assetLimit?'$'+st.assetLimit.toLocaleString():'See note'):'') +
        row('Monthly income', fmtMoney(totalIncome)) +
        (st?row('Income limit', st.incomeLimit?'$'+st.incomeLimit.toLocaleString()+'/mo':'No hard cap'):'') +
        row('Total uncompensated transfers', totalUncomp>0?`<strong style="color:#b50909;">${fmtMoney(totalUncomp)}</strong>`:'$0.00') +
        (st&&st.penaltyDivisor&&totalUncomp>0?row('Estimated penalty period','~'+(totalUncomp/st.penaltyDivisor).toFixed(1)+' months (estimate — verify with attorney)'):'')
      )}
    </div>
    ${st ? `<div class="alert alert-info">
      <strong>${esc(st.agencyName)}</strong> · ${esc(st.agencyPhone)}<br>
      ${esc(st.agencyUrl)}
      ${st.lookbackNote?`<br><em>${esc(st.lookbackNote)}</em>`:''}
    </div>` : ''}
  `;
}

/* --------------------------------------------------------------------------
   People tab
-------------------------------------------------------------------------- */
function renderPeopleSection(id, applicant, spouse) {
  function personCard(p, role) {
    if (!p || !p.id) return `<div class="card"><p style="color:var(--ink-faint);">No ${role} on file.</p></div>`;
    const ADL_FIELDS = ['bathing','dressing','eating','transferring','toileting','continence'];
    return `
      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-bottom:14px;">${role.charAt(0).toUpperCase()+role.slice(1)}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="field"><label class="label">First name</label><input type="text" id="pf_${role}_first" value="${esc(p.first_name||'')}" onchange="savePerson('${p.id}','first_name',this.value)"></div>
          <div class="field"><label class="label">Last name</label><input type="text" id="pf_${role}_last" value="${esc(p.last_name||'')}" onchange="savePerson('${p.id}','last_name',this.value)"></div>
          <div class="field"><label class="label">Date of birth</label><input type="date" id="pf_${role}_dob" value="${esc(p.dob||'')}" onchange="savePerson('${p.id}','dob',this.value)"></div>
          <div class="field"><label class="label">SSN last 4</label><input type="text" maxlength="4" id="pf_${role}_ssn4" value="${esc(p.ssn_last4||'')}" onchange="savePerson('${p.id}','ssn_last4',this.value)"></div>
          <div class="field"><label class="label">Phone</label><input type="text" id="pf_${role}_phone" value="${esc(p.phone||'')}" onchange="savePerson('${p.id}','phone',this.value)"></div>
          <div class="field"><label class="label">Email</label><input type="text" id="pf_${role}_email" value="${esc(p.email||'')}" onchange="savePerson('${p.id}','email',this.value)"></div>
          <div class="field" style="grid-column:span 2"><label class="label">Address</label><input type="text" id="pf_${role}_addr" value="${esc(p.address1||'')}" onchange="savePerson('${p.id}','address1',this.value)"></div>
          <div class="field"><label class="label">Medicare number</label><input type="text" id="pf_${role}_mcare" value="${esc(p.medicare_number||'')}" onchange="savePerson('${p.id}','medicare_number',this.value)"></div>
          <div class="field"><label class="label">Physician</label><input type="text" id="pf_${role}_phys" value="${esc(p.attending_physician||'')}" onchange="savePerson('${p.id}','attending_physician',this.value)"></div>
          ${role==='applicant'?`<div class="field" style="grid-column:span 2"><label class="label">Primary diagnosis</label><input type="text" id="pf_${role}_diag" value="${esc(p.primary_diagnosis||'')}" onchange="savePerson('${p.id}','primary_diagnosis',this.value)"></div>`:''}
        </div>
        ${role==='applicant'?`
          <h3 style="margin-top:18px;margin-bottom:10px;">Activities of Daily Living</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${ADL_FIELDS.map(f=>`
              <div class="field"><label class="label">${f.charAt(0).toUpperCase()+f.slice(1)}</label>
                <select onchange="savePerson('${p.id}','adl_${f}',this.value)">
                  <option value="">—</option>
                  ${['Independent','Needs assistance','Fully dependent'].map(o=>`<option value="${o}" ${p['adl_'+f]===o?'selected':''}>${o}</option>`).join('')}
                </select>
              </div>`).join('')}
          </div>`:''}
        <div id="person_save_${p.id}" class="alert alert-success" style="display:none;margin-top:10px;">Saved.</div>
      </div>`;
  }
  const app = _people.find(p=>p.person_role==='applicant')||{};
  const sp  = _people.find(p=>p.person_role==='spouse')||{};
  return personCard(app,'applicant') + (_app.marital_status==='married' ? personCard(sp,'spouse') : '');
}

window.savePerson = async function(personId, field, value) {
  const { error } = await sb.from('application_people').update({ [field]: value || null }).eq('id', personId);
  const el = document.getElementById('person_save_'+personId);
  if (el) { el.style.display='block'; el.textContent = error ? 'Error: '+error.message : 'Saved.'; el.className='alert '+(error?'alert-error':'alert-success'); setTimeout(()=>{el.style.display='none';},2000); }
};

/* --------------------------------------------------------------------------
   Assets tab
-------------------------------------------------------------------------- */
function renderAssetsSection(id) {
  const ASSET_LABELS = {checking:'Checking',savings:'Savings',cd:'CD',brokerage:'Brokerage',retirement:'IRA/401k',life_insurance:'Life insurance',primary_home:'Primary home',other_real_estate:'Other real estate',vehicle_primary:'Primary vehicle',vehicle_add:'Additional vehicle',burial_fund:'Burial fund',trust_irrev:'Irrevocable trust',trust_rev:'Revocable trust',annuity:'Annuity',business:'Business',other:'Other'};
  if (_assets.length === 0) return `<div class="card"><p style="color:var(--ink-faint);">No assets on file.</p></div>`;
  const totalAssets = _assets.reduce((s,a)=>s+(parseFloat(a.value)||0),0);
  const countable   = _assets.filter(a=>!a.is_exempt).reduce((s,a)=>s+(parseFloat(a.value)||0),0);
  return `
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Owner</th><th>Type</th><th>Institution</th><th>Value</th><th>Exempt</th></tr></thead>
        <tbody>
          ${_assets.map(a=>`<tr>
            <td>${esc(a.owner)}</td>
            <td>${ASSET_LABELS[a.asset_type]||esc(a.asset_type)}</td>
            <td>${esc(a.institution||a.description||'')}</td>
            <td><input type="number" value="${a.value||0}" style="width:120px;" onchange="saveAsset('${a.id}','value',this.value)"></td>
            <td><input type="checkbox" ${a.is_exempt?'checked':''} onchange="saveAsset('${a.id}','is_exempt',this.checked)" style="width:18px;height:18px;accent-color:var(--navy);"></td>
          </tr>`).join('')}
          <tr style="font-weight:700;border-top:2px solid var(--navy);">
            <td colspan="3">Total</td>
            <td>${fmtMoney(totalAssets)}</td>
            <td style="font-size:0.8rem;color:var(--navy);">Countable: ${fmtMoney(countable)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

window.saveAsset = async function(assetId, field, value) {
  await sb.from('assets').update({ [field]: value }).eq('id', assetId);
};

/* --------------------------------------------------------------------------
   Income tab
-------------------------------------------------------------------------- */
function renderIncomeSection(id) {
  const INCOME_LABELS = {ss_retirement:'Social Security',ssdi:'SSDI',ssi:'SSI',pension:'Pension',va:'VA benefits',wages:'Wages',annuity:'Annuity',rental:'Rental',alimony:'Alimony',other:'Other'};
  const FREQ_FACTORS  = {weekly:52/12,biweekly:26/12,monthly:1,yearly:1/12};
  if (_income.length === 0) return `<div class="card"><p style="color:var(--ink-faint);">No income on file.</p></div>`;
  const total = _income.reduce((s,i)=>s+(parseFloat(i.amount)||0)*(FREQ_FACTORS[i.frequency]||1),0);
  return `
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Person</th><th>Type</th><th>Payer</th><th>Amount</th><th>Frequency</th><th>Monthly</th></tr></thead>
        <tbody>
          ${_income.map(s=>{
            const monthly=(parseFloat(s.amount)||0)*(FREQ_FACTORS[s.frequency]||1);
            return `<tr>
              <td>${esc(s.person)}</td>
              <td>${INCOME_LABELS[s.income_type]||esc(s.income_type)}</td>
              <td>${esc(s.payer||'')}</td>
              <td><input type="number" value="${s.amount||0}" style="width:110px;" onchange="saveIncome('${s.id}','amount',this.value)"></td>
              <td>${esc(s.frequency)}</td>
              <td>${fmtMoney(monthly)}</td>
            </tr>`;
          }).join('')}
          <tr style="font-weight:700;border-top:2px solid var(--navy);">
            <td colspan="5">Total monthly income</td>
            <td>${fmtMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

window.saveIncome = async function(incId, field, value) {
  await sb.from('income_sources').update({ [field]: value }).eq('id', incId);
};

/* --------------------------------------------------------------------------
   Transfers tab
-------------------------------------------------------------------------- */
function renderTransfersSection(id, st) {
  const totalUV = _transfers.reduce((s,t)=>s+(parseFloat(t.uncompensated_value)||0),0);
  const penDiv  = st?.penaltyDivisor;
  if (_transfers.length === 0) return `<div class="card"><p style="color:var(--ink-faint);">No transfers on file.</p></div>`;
  return `
    ${totalUV>0?`<div class="alert alert-warn" style="margin-bottom:12px;">Total uncompensated: <strong>${fmtMoney(totalUV)}</strong>${penDiv?' · Estimated penalty: ~'+(totalUV/penDiv).toFixed(1)+' months':''}</div>`:''}
    ${_transfers.map((t,i)=>{
      const uv=parseFloat(t.uncompensated_value)||0;
      return `<div class="card" style="margin-bottom:12px;border-left:4px solid ${uv>0?'#b50909':'var(--border)'};">
        <h3 style="margin-bottom:10px;">Transfer ${i+1}: ${esc(t.asset_description||'(no description)')}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div class="field"><label class="label">Date</label><input type="date" value="${esc(t.transfer_date||'')}" onchange="saveTransfer('${t.id}','transfer_date',this.value)"></div>
          <div class="field"><label class="label">Fair market value</label><input type="number" value="${t.fair_market_value||0}" onchange="saveTransfer('${t.id}','fair_market_value',this.value)"></div>
          <div class="field"><label class="label">Amount received</label><input type="number" value="${t.amount_received||0}" onchange="saveTransfer('${t.id}','amount_received',this.value)"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="field"><label class="label">Recipient</label><input type="text" value="${esc(t.recipient_name||'')}" onchange="saveTransfer('${t.id}','recipient_name',this.value)"></div>
          <div class="field"><label class="label">Relationship</label><input type="text" value="${esc(t.recipient_relationship||'')}" onchange="saveTransfer('${t.id}','recipient_relationship',this.value)"></div>
        </div>
        ${uv>0?`<div class="alert alert-error" style="margin-top:8px;">Uncompensated value: <strong>${fmtMoney(uv)}</strong>${t.notes?'<br><em>'+esc(t.notes)+'</em>':''}</div>`:''}
      </div>`;
    }).join('')}`;
}

window.saveTransfer = async function(transId, field, value) {
  await sb.from('transfers').update({ [field]: value }).eq('id', transId);
};

/* --------------------------------------------------------------------------
   Documents tab
-------------------------------------------------------------------------- */
function renderDocsSection(id) {
  const docList = _docs.length ? _docs.map(d=>`
    <div class="doc-item">
      <div>
        <div class="doc-name">${esc(d.file_name||d.storage_path)}</div>
        <div class="doc-meta">${esc(d.doc_type||'Document')} · Uploaded ${fmtDate(d.uploaded_at)} by ${esc(d.profiles?.full_name||'applicant')}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm btn-secondary" onclick="downloadDoc('${esc(d.storage_path)}')">Download</button>
      </div>
    </div>`).join('') : '<p style="color:var(--ink-faint);padding:12px 0;">No documents uploaded yet.</p>';

  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:14px;">Documents (${_docs.length})</h3>
      ${docList}
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px;">Upload a document</h3>
      <div class="field"><label class="label">Document type</label>
        <select id="staffDocType">
          ${['bank_statement','id','tax_return','deed','insurance_policy','medicare_card','physician_letter','care_agreement','promissory_note','other'].map(t=>`<option value="${t}">${t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join('')}
        </select>
      </div>
      <label class="upload-zone" onclick="document.getElementById('staffDocFile').click()">
        <input type="file" id="staffDocFile" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onchange="uploadStaffDoc('${id}')">
        📎 Click to choose a file to upload
      </label>
      <div id="staffUploadMsg" style="display:none;margin-top:8px;"></div>
    </div>`;
}

window.downloadDoc = async function(path) {
  const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
  if (error) { alert('Could not get download link: '+error.message); return; }
  window.open(data.signedUrl, '_blank');
};

window.uploadStaffDoc = async function(appId) {
  const file    = document.getElementById('staffDocFile').files[0];
  const docType = document.getElementById('staffDocType').value;
  const msgEl   = document.getElementById('staffUploadMsg');
  if (!file) return;
  msgEl.style.display='block'; msgEl.textContent='Uploading…'; msgEl.className='alert alert-info';

  const path = `${appId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file);
  if (upErr) { msgEl.textContent='Upload failed: '+upErr.message; msgEl.className='alert alert-error'; return; }

  const { error: dbErr } = await sb.from('documents').insert({
    application_id: appId,
    uploaded_by: currentUser.id,
    doc_type: docType,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size
  });
  if (dbErr) { msgEl.textContent='DB error: '+dbErr.message; msgEl.className='alert alert-error'; return; }
  msgEl.textContent='Uploaded successfully.'; msgEl.className='alert alert-success';
  setTimeout(()=>{ go('#/app/'+appId+'/documents'); }, 1000);
};

/* --------------------------------------------------------------------------
   Notes tab
-------------------------------------------------------------------------- */
function renderNotesSection(id) {
  const noteList = _notes.length ? _notes.map(n=>`
    <div class="note-item">
      <div class="note-meta">${esc(n.profiles?.full_name||'Staff')} · ${fmtDate(n.created_at)} ${n.shared_with_applicant?'<span class="note-shared">Shared with applicant</span>':''}</div>
      <div class="note-text">${esc(n.note)}</div>
    </div>`).join('') : '<p style="color:var(--ink-faint);">No notes yet.</p>';

  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:14px;">Staff notes</h3>
      ${noteList}
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px;">Add a note</h3>
      <div class="field"><textarea id="newNote" rows="4" placeholder="Type your note here…"></textarea></div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;">
          <input type="checkbox" id="notifyApplicant" style="width:17px;height:17px;accent-color:var(--navy);">
          Notify applicant by email and share this note with them
        </label>
        <button class="btn btn-primary btn-sm" onclick="addNote('${id}')">Save note</button>
      </div>
      <div id="noteMsg" style="display:none;margin-top:8px;"></div>
    </div>`;
}

window.addNote = async function(appId) {
  const note    = document.getElementById('newNote')?.value.trim();
  const notify  = document.getElementById('notifyApplicant')?.checked || false;
  const msgEl   = document.getElementById('noteMsg');
  if (!note) { msgEl.style.display='block'; msgEl.textContent='Please write a note first.'; msgEl.className='alert alert-error'; return; }

  const { error } = await sb.from('staff_notes').insert({
    application_id: appId,
    author_user_id: currentUser.id,
    note,
    notify_applicant: notify,
    shared_with_applicant: notify
  });

  if (error) { msgEl.style.display='block'; msgEl.textContent=error.message; msgEl.className='alert alert-error'; return; }
  msgEl.style.display='block';
  msgEl.textContent = notify ? 'Note saved and applicant notified.' : 'Note saved.';
  msgEl.className='alert alert-success';
  setTimeout(()=>{ go('#/app/'+appId+'/notes'); },1000);
};

/* --------------------------------------------------------------------------
   Status update
-------------------------------------------------------------------------- */
window.updateStatus = async function(appId, status) {
  const { error } = await sb.from('applications').update({ status, updated_at: new Date().toISOString() }).eq('id', appId);
  if (error) { alert('Could not update status: '+error.message); return; }
  // Add an automatic staff note
  await sb.from('staff_notes').insert({
    application_id: appId,
    author_user_id: currentUser.id,
    note: `Status changed to: ${STATUS_OPTIONS.find(s=>s.v===status)?.label||status}`,
    notify_applicant: true,
    shared_with_applicant: true
  });
};

/* --------------------------------------------------------------------------
   Quick sidebar panels
-------------------------------------------------------------------------- */
function quickNotesPanel(id) {
  const recent = _notes.slice(0,3);
  return `
    <div class="card">
      <h3 style="margin-bottom:10px;font-size:0.9rem;">Recent notes</h3>
      ${recent.length ? recent.map(n=>`<div class="note-item"><div class="note-meta">${esc(n.profiles?.full_name||'Staff')} · ${fmtDate(n.created_at)}</div><div class="note-text" style="font-size:0.82rem;">${esc(n.note.slice(0,120))}${n.note.length>120?'…':''}</div></div>`).join('') : '<p style="color:var(--ink-faint);font-size:0.82rem;">No notes yet.</p>'}
      <button class="btn btn-secondary btn-sm" onclick="go('#/app/${id}/notes')" style="margin-top:10px;width:100%;justify-content:center;">View all notes →</button>
    </div>`;
}

function quickDocsPanel(id) {
  return `
    <div class="card">
      <h3 style="margin-bottom:10px;font-size:0.9rem;">Documents (${_docs.length})</h3>
      ${_docs.slice(0,3).map(d=>`<div style="font-size:0.82rem;padding:5px 0;border-bottom:1px solid var(--border);">${esc(d.file_name||d.storage_path)}</div>`).join('') || '<p style="color:var(--ink-faint);font-size:0.82rem;">No documents yet.</p>'}
      <button class="btn btn-secondary btn-sm" onclick="go('#/app/${id}/documents')" style="margin-top:10px;width:100%;justify-content:center;">Manage documents →</button>
    </div>`;
}

/* --------------------------------------------------------------------------
   SVG Icons
-------------------------------------------------------------------------- */
function iconDashboard() { return `<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>`; }
function iconList()      { return `<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>`; }

/* --------------------------------------------------------------------------
   Boot
-------------------------------------------------------------------------- */
init();
