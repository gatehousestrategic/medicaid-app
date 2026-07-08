/* ==========================================================================
   ClearCare — Packet, Form Toggle & Checklist Print (packet.js)
   Provides:
   1. window.renderFormView(appId)     — traditional all-fields form toggle
   2. window.printChecklist()          — printable outstanding documents list
   3. window.exportPacketPDF()         — full submission PDF packet
   ========================================================================== */

(function () {

  /* ------------------------------------------------------------------------
     Helpers
  ------------------------------------------------------------------------ */
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function fmtMoney(n) {
    n = parseFloat(n) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function today() {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const ASSET_LABELS = {
    checking:'Checking account', savings:'Savings account', cd:'Certificate of deposit',
    brokerage:'Brokerage/investment account', retirement:'IRA/401(k)/retirement account',
    life_insurance:'Life insurance (cash value)', primary_home:'Primary residence',
    other_real_estate:'Other real estate', vehicle_primary:'Primary vehicle',
    vehicle_add:'Additional vehicle', burial_fund:'Prepaid burial/funeral',
    trust_irrev:'Irrevocable trust', trust_rev:'Revocable trust',
    annuity:'Annuity', other:'Other asset'
  };
  const INCOME_LABELS = {
    ss_retirement:'Social Security', ssdi:'SSDI', ssi:'SSI', pension:'Pension',
    va:'VA benefits', wages:'Wages', annuity:'Annuity payments',
    rental:'Rental income', alimony:'Alimony', other:'Other income'
  };
  const FREQ_FACTORS = { weekly: 52/12, biweekly: 26/12, monthly: 1, yearly: 1/12 };

  /* ------------------------------------------------------------------------
     Load all data for a given application
  ------------------------------------------------------------------------ */
  async function loadAppData(appId) {
    // For demo mode, pull from the in-memory data that questions.js populated
    if (appId === 'demo' && window._demoData) {
      const d = window._demoData;
      const app = d.APP || {};
      const checklist = {};
      // Build checklist from what's in CHECKLIST global if questions.js exposed it
      if (window._currentChecklist) Object.assign(checklist, window._currentChecklist);
      const st = app.state ? getStateData(app.state) : null;
      return {
        app, st,
        applicant: d.APPL || {},
        spouse: d.SPOU || {},
        assets: (d.ASSETS || []).map(a => ({...a, asset_type: a.asset_type||'other', owner: a.owner||'applicant'})),
        income: d.INCOME || [],
        transfers: d.TRANSFERS || [],
        checklist,
        docs: []
      };
    }
    const [appRes, peopleRes, assetsRes, incRes, transRes, checklistRes, docsRes] = await Promise.all([
      sb.from('applications').select('*').eq('id', appId).single(),
      sb.from('application_people').select('*').eq('application_id', appId),
      sb.from('assets').select('*').eq('application_id', appId),
      sb.from('income_sources').select('*').eq('application_id', appId),
      sb.from('transfers').select('*').eq('application_id', appId).order('transfer_date', { ascending: false }),
      sb.from('checklist_items').select('*').eq('application_id', appId),
      sb.from('documents').select('*').eq('application_id', appId).order('uploaded_at'),
    ]);
    const app       = appRes.data || {};
    const applicant = (peopleRes.data || []).find(p => p.person_role === 'applicant') || {};
    const spouse    = (peopleRes.data || []).find(p => p.person_role === 'spouse') || {};
    const assets    = assetsRes.data || [];
    const income    = incRes.data || [];
    const transfers = transRes.data || [];
    const checklist = {};
    (checklistRes.data || []).forEach(i => { checklist[i.item_key] = i.completed ? 'done' : 'pending'; });
    const docs      = docsRes.data || [];
    const st        = app.state ? getStateData(app.state) : null;
    return { app, applicant, spouse, assets, income, transfers, checklist, docs, st };
  }

  async function loadFirmSettings() {
    try {
      const { data } = await sb.from('firm_settings').select('*').limit(1).single();
      return data || {};
    } catch(e) { return {}; }
  }

  /* ========================================================================
     1. FORM TOGGLE VIEW
     Traditional all-fields form, organized by section, saves on blur/change
  ======================================================================== */

  window.renderFormView = async function(appId) {
    shell(`<div class="spinner-wrap">Loading…</div>`, 'Form view');
    const { app, applicant, spouse, assets, income, transfers, checklist, docs, st } = await loadAppData(appId);
    const appName = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') || 'Application';
    const totalAssets = assets.reduce((s,a)=>s+(parseFloat(a.value)||0),0);
    const countable   = assets.filter(a=>!a.is_exempt).reduce((s,a)=>s+(parseFloat(a.value)||0),0);
    const totalIncome = income.reduce((s,i)=>s+(parseFloat(i.amount)||0)*(FREQ_FACTORS[i.frequency]||1),0);
    const totalUV     = transfers.reduce((s,t)=>s+(parseFloat(t.uncompensated_value)||0),0);
    const doneCount    = Object.values(checklist).filter(v=>v==="done").length;
    const missingCount = Object.values(checklist).filter(v=>v!=="done").length;

    function disp(v) { return esc(v||"\u2014"); }
    function inp(label, dbKey, v, type) {
      type = type||"text";
      return `<div class="fv-col"><div class="fv-label">${esc(label)}</div><input type="${type}" class="fv-input" value="${esc(v||"")}" onchange="fvSave("${appId}","${dbKey}",this.value)"></div>`;
    }
    function ro(label, v) {
      return `<div class="fv-col"><div class="fv-label">${esc(label)}</div><div class="fv-value">${disp(v)}</div></div>`;
    }
    function sh(title, meta) {
      return `<div class="fv-sh"><span>${esc(title)}</span>${meta?`<span class="fv-sh-meta">${meta}</span>`:""}</div>`;
    }
    function adlBadge(v) {
      const cls = v==="Fully dependent"?"fv-bad":v==="Needs assistance"?"fv-warn":"fv-ok";
      return `<span class="fv-adl-pill ${cls}">${disp(v)}</span>`;
    }

    const adlFields = ["adl_bathing","adl_dressing","adl_eating","adl_transferring","adl_toileting","adl_continence"];
    const adlLabels = ["Bathing","Dressing","Eating","Transferring","Toileting","Continence"];
    const needsHelpCount = adlFields.filter(k=>applicant[k] && applicant[k]!=="Independent").length;

    shell(`
      <style>
        .fv-tb{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;}
        .fv-tb h2{margin:0 0 4px;font-size:1.25rem;}
        .fv-tb-sub{font-size:0.82rem;color:var(--ink-faint);}
        .fv-stats{display:flex;gap:0;background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:18px;overflow:hidden;}
        .fv-stat{flex:1;text-align:center;padding:14px 8px;border-right:1px solid var(--border);}
        .fv-stat:last-child{border-right:none;}
        .fv-stat-n{font-size:1.5rem;font-weight:800;line-height:1;}
        .fv-stat-l{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-top:3px;}
        .fv-sec{background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:14px;overflow:hidden;}
        .fv-sh{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;background:#f8f8f8;border-bottom:1px solid var(--border);font-weight:700;font-size:0.875rem;}
        .fv-sh-meta{font-size:0.78rem;font-weight:600;color:var(--navy);}
        .fv-body{padding:16px;}
        .fv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:14px;}
        .fv-grid:last-child{margin-bottom:0;}
        .fv-col{display:flex;flex-direction:column;gap:4px;}
        .fv-label{font-size:0.72rem;font-weight:700;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.04em;}
        .fv-value{font-size:0.925rem;padding:2px 0;color:var(--ink);}
        .fv-input{font-size:0.9rem;padding:7px 9px;border:1.5px solid #ccc;border-radius:6px;font-family:inherit;color:var(--ink);background:#fafafa;}
        .fv-input:focus{outline:none;border-color:var(--navy);background:#fff;}
        .fv-table{width:100%;border-collapse:collapse;font-size:0.85rem;}
        .fv-table th{text-align:left;padding:8px 12px;background:#f4f4f4;border-bottom:2px solid #ddd;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:#666;}
        .fv-table td{padding:8px 12px;border-bottom:1px solid #f0f0f0;}
        .fv-table .fv-tot td{font-weight:700;border-top:2px solid var(--navy);background:#f0f4ff;}
        .fv-adl-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:0.9rem;}
        .fv-adl-row:last-child{border-bottom:none;}
        .fv-adl-pill{font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:12px;}
        .fv-ok{background:#ecf3ec;color:#2b5b33;}
        .fv-warn{background:#faf3d1;color:#5c4809;}
        .fv-bad{background:#f4e3db;color:#6f3331;}
        .fv-exempt{display:inline-block;background:#ecf3ec;color:#2b5b33;font-size:0.7rem;font-weight:700;padding:2px 7px;border-radius:10px;}
        .fv-flag{display:inline-block;background:#f4e3db;color:#6f3331;font-size:0.7rem;font-weight:700;padding:2px 7px;border-radius:10px;}
        .fv-tc{border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
        .fv-tc.fv-tc-flag{border-color:#e0a898;background:#fff8f8;}
        .fv-doc{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;}
        .fv-doc:last-child{border-bottom:none;}
        @media(max-width:600px){.fv-grid{grid-template-columns:1fr;}.fv-stats{flex-wrap:wrap;}}
      </style>

      <div class="fv-tb">
        <div>
          <h2>${esc(appName)}</h2>
          <div class="fv-tb-sub">${st?esc(st.name):"\u2014"} \u00b7 Form view</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="go('#/application/${appId}')">\u2190 Question view</button>
          <button class="btn btn-secondary btn-sm" onclick="printChecklist('${appId}')">\uD83D\uDDB4 Print checklist</button>
          <button class="btn btn-primary btn-sm" onclick="exportPacketPDF('${appId}')">\uD83D\uDCC4 Export PDF</button>
        </div>
      </div>

      <div class="fv-stats">
        <div class="fv-stat"><div class="fv-stat-n" style="color:var(--good-ink);">${doneCount}</div><div class="fv-stat-l" style="color:var(--good-ink);">\u2705 Done</div></div>
        <div class="fv-stat"><div class="fv-stat-n" style="color:${missingCount>0?"var(--error-ink)":"var(--warn-ink)"};">${missingCount}</div><div class="fv-stat-l" style="color:${missingCount>0?"var(--error-ink)":"var(--warn-ink)"};">${missingCount>0?"\uD83D\uDD34 Needed":"\uD83D\uDFE1 Pending"}</div></div>
        <div class="fv-stat"><div class="fv-stat-n" style="color:var(--navy);">${assets.length}</div><div class="fv-stat-l" style="color:var(--navy);">Assets</div></div>
        <div class="fv-stat"><div class="fv-stat-n" style="color:var(--navy);">${income.length}</div><div class="fv-stat-l" style="color:var(--navy);">Income</div></div>
        <div class="fv-stat"><div class="fv-stat-n" style="color:${totalUV>0?"var(--error-ink)":"var(--ink-faint)"};">${transfers.length}</div><div class="fv-stat-l" style="color:${totalUV>0?"var(--error-ink)":"var(--ink-faint)"};">Transfers${totalUV>0?" \u26A0":""}</div></div>
        <div class="fv-stat"><div class="fv-stat-n" style="color:var(--ink-faint);">${docs.length}</div><div class="fv-stat-l" style="color:var(--ink-faint);">Docs</div></div>
      </div>

      <!-- Facility -->
      <div class="fv-sec">
        ${sh("Facility & Application")}
        <div class="fv-body"><div class="fv-grid">
          ${inp("State","app.state",app.state)}
          ${inp("Facility name","app.facility_name",app.facility_name)}
          ${inp("Admission date","app.facility_admission_date",app.facility_admission_date,"date")}
          ${ro("Marital status",app.marital_status==="married"?"Married":"Single / widowed / divorced")}
          ${ro("Level of care documented",app.level_of_care_documented?"Yes \u2714":"Pending")}
          ${ro("Application status",app.status||"draft")}
        </div></div>
      </div>

      <!-- Applicant -->
      <div class="fv-sec">
        ${sh("Applicant",applicant.primary_diagnosis?esc(applicant.primary_diagnosis):"")}
        <div class="fv-body">
          <div class="fv-grid">
            ${inp("First name","appl.first_name",applicant.first_name)}
            ${inp("Middle name","appl.middle_name",applicant.middle_name)}
            ${inp("Last name","appl.last_name",applicant.last_name)}
            ${inp("Date of birth","appl.dob",applicant.dob,"date")}
            ${ro("Age",applicant.dob?Math.floor((Date.now()-new Date(applicant.dob+"T00:00:00").getTime())/(365.25*24*3600*1000))+" years":"\u2014")}
            ${ro("Sex",applicant.sex==="M"?"Male":applicant.sex==="F"?"Female":"\u2014")}
            ${inp("SSN last 4","appl.ssn_last4",applicant.ssn_last4)}
            ${ro("U.S. citizen",applicant.citizen===true?"Yes":applicant.citizen===false?"No":"\u2014")}
          </div>
          <div class="fv-grid">
            ${inp("Phone","appl.phone",applicant.phone,"tel")}
            ${inp("Email","appl.email",applicant.email,"email")}
            ${inp("Street address","appl.address1",applicant.address1)}
            ${inp("City","appl.city",applicant.city)}
            ${inp("State","appl.state_field",applicant.state)}
            ${inp("ZIP","appl.zip",applicant.zip)}
            ${inp("Medicare #","appl.medicare_number",applicant.medicare_number)}
            ${inp("Physician","appl.attending_physician",applicant.attending_physician)}
            ${inp("Physician phone","appl.physician_phone",applicant.physician_phone,"tel")}
            ${inp("Diagnosis","appl.primary_diagnosis",applicant.primary_diagnosis)}
          </div>
        </div>
      </div>

      <!-- ADLs -->
      <div class="fv-sec">
        ${sh("Activities of Daily Living",needsHelpCount>=2?`<span style="color:var(--good-ink);">\u2705 ${needsHelpCount}/6 need assistance \u2014 qualifies</span>`:`${needsHelpCount}/6 need assistance`)}
        <div class="fv-body">
          ${adlFields.map((k,i)=>`<div class="fv-adl-row"><span>${adlLabels[i]}</span>${adlBadge(applicant[k])}</div>`).join("")}
        </div>
      </div>

      ${app.marital_status==="married"?`
      <div class="fv-sec">
        ${sh("Community Spouse",st?"CSRA up to $"+st.csra.toLocaleString()+" \u00b7 MMMNA $"+st.mmmna.toLocaleString()+"/mo":"")}
        <div class="fv-body"><div class="fv-grid">
          ${inp("First name","spou.first_name",spouse.first_name)}
          ${inp("Last name","spou.last_name",spouse.last_name)}
          ${inp("Date of birth","spou.dob",spouse.dob,"date")}
          ${inp("SSN last 4","spou.ssn_last4",spouse.ssn_last4)}
          ${inp("Phone","spou.phone",spouse.phone,"tel")}
          ${inp("Address","spou.address1",spouse.address1)}
          ${inp("Medicare #","spou.medicare_number",spouse.medicare_number)}
        </div></div>
      </div>`:""}

      <!-- Assets -->
      <div class="fv-sec">
        ${sh("Assets","Total: "+fmtMoney(totalAssets)+" | Countable: "+fmtMoney(countable)+(st?" | Limit: "+(st.assetLimit?"$"+st.assetLimit.toLocaleString():"see notes"):""))}
        <div style="overflow-x:auto;">
          <table class="fv-table">
            <tr><th>Owner</th><th>Type</th><th>Institution</th><th>Acct last 4</th><th>Value</th><th>Exempt?</th></tr>
            ${assets.map(a=>`<tr>
              <td style="text-transform:capitalize;">${esc(a.owner)}</td>
              <td>${ASSET_LABELS[a.asset_type]||esc(a.asset_type)}</td>
              <td>${esc(a.institution||a.description||"\u2014")}</td>
              <td>${esc(a.account_last4||"\u2014")}</td>
              <td>${fmtMoney(a.value)}</td>
              <td>${a.is_exempt?`<span class="fv-exempt">Exempt \u2014 ${esc(a.exempt_reason||"yes")}</span>`:"\u2014"}</td>
            </tr>`).join("")||"<tr><td colspan=\"6\" style=\"color:#999;padding:16px;\">No assets recorded yet</td></tr>"}
            <tr class="fv-tot"><td colspan="3">Total</td><td></td><td>${fmtMoney(totalAssets)}</td><td>Countable: ${fmtMoney(countable)}</td></tr>
          </table>
        </div>
      </div>

      <!-- Income -->
      <div class="fv-sec">
        ${sh("Income","Total: "+fmtMoney(totalIncome)+"/month"+(st?" | Limit: "+(st.incomeLimit?"$"+st.incomeLimit.toLocaleString()+"/mo":"no hard cap"):""))}
        <div style="overflow-x:auto;">
          <table class="fv-table">
            <tr><th>Person</th><th>Source</th><th>Payer</th><th>Amount</th><th>Frequency</th><th>Monthly</th></tr>
            ${income.map(i=>`<tr>
              <td style="text-transform:capitalize;">${esc(i.person)}</td>
              <td>${INCOME_LABELS[i.income_type]||esc(i.income_type)}</td>
              <td>${esc(i.payer||"\u2014")}</td>
              <td>${fmtMoney(i.amount)}</td>
              <td style="text-transform:capitalize;">${esc(i.frequency)}</td>
              <td>${fmtMoney((parseFloat(i.amount)||0)*(FREQ_FACTORS[i.frequency]||1))}</td>
            </tr>`).join("")||"<tr><td colspan=\"6\" style=\"color:#999;padding:16px;\">No income recorded yet</td></tr>"}
            <tr class="fv-tot"><td colspan="5">Total monthly income</td><td>${fmtMoney(totalIncome)}</td></tr>
          </table>
        </div>
      </div>

      <!-- Transfers -->
      <div class="fv-sec">
        ${sh("Transfers \u2014 "+(st?st.lookback:60)+"-month lookback",totalUV>0?"\u26A0 "+fmtMoney(totalUV)+" uncompensated":"")}
        <div class="fv-body">
          ${transfers.length?transfers.map((t,i)=>{
            const uv=parseFloat(t.uncompensated_value)||0;
            return `<div class="fv-tc ${uv>0?"fv-tc-flag":""}">
              <div style="font-weight:700;margin-bottom:8px;font-size:0.875rem;">Transfer ${i+1}: ${esc(t.asset_description||"(no description)")}</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;font-size:0.82rem;">
                <div><span style="color:#666;">Date:</span> ${fmtDate(t.transfer_date)}</div>
                <div><span style="color:#666;">FMV:</span> ${fmtMoney(t.fair_market_value)}</div>
                <div><span style="color:#666;">Received:</span> ${fmtMoney(t.amount_received)}</div>
                <div><span style="color:#666;">Uncompensated:</span> <strong style="color:${uv>0?"#b50909":"inherit"}">${fmtMoney(uv)}</strong></div>
                <div><span style="color:#666;">To:</span> ${esc(t.recipient_name||"\u2014")}</div>
                <div><span style="color:#666;">Relationship:</span> ${esc(t.recipient_relationship||"\u2014")}</div>
              </div>
              ${uv>0?`<div style="margin-top:8px;"><span class="fv-flag">\u26A0 Attorney review recommended</span></div>`:""}
            </div>`;
          }).join(""):"<p style=\"color:#999;margin:0;\">No transfers recorded yet</p>"}
        </div>
      </div>

      <!-- Docs -->
      <div class="fv-sec">
        ${sh("Uploaded documents",docs.length+" file"+(docs.length===1?"":"s"))}
        <div class="fv-body">
          ${docs.length?docs.map(d=>`<div class="fv-doc">
            <div>
              <div style="font-weight:600;font-size:0.875rem;">${esc(d.file_name||d.storage_path)}</div>
              <div style="font-size:0.78rem;color:#666;">${esc((d.doc_type||"").replace(/_/g," "))} \u00b7 ${fmtDate(d.uploaded_at)}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="downloadDocById(\'${esc(d.storage_path)}\')">Download</button>
          </div>`).join(""):"<p style=\"color:#999;margin:0;\">No documents uploaded yet</p>"}
        </div>
      </div>

    `,"Form view \u2014 "+appName);
  };

  window.downloadDocById = async function(path) {
    const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 120);
    if (error) { alert('Could not get download link: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  /* ========================================================================
     2. PRINT CHECKLIST
     Clean printable page of outstanding documents
  ======================================================================== */

  window.printChecklist = async function(appId) {
    const { app, applicant, spouse, assets, income, transfers, checklist, docs, st } = await loadAppData(appId);
    const appName = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') || 'Applicant';

    // Build a comprehensive list of everything needed to complete the packet
    // Each item: { key, category, label, status, how, urgent }
    const allItems = [];

    function item(key, category, label, status, how, urgent) {
      allItems.push({ key, category, label, status: status || 'missing', how: how || '', urgent: !!urgent });
    }

    // ── PERSONAL INFORMATION ─────────────────────────────────────────────
    item('info_state',    'Personal information', 'State selected',                    app.state ? 'done' : 'missing', 'Answer the first question in the application.');
    item('info_fname',    'Personal information', 'Applicant first name',              applicant.first_name ? 'done' : 'missing', 'Complete Phase 1 of the question flow.');
    item('info_lname',    'Personal information', 'Applicant last name',               applicant.last_name ? 'done' : 'missing', 'Complete Phase 1 of the question flow.');
    item('info_dob',      'Personal information', 'Applicant date of birth',           applicant.dob ? 'done' : 'missing', 'Complete Phase 2 of the question flow.');
    item('info_ssn',      'Personal information', 'SSN (last 4 digits)',               applicant.ssn_last4 ? 'done' : 'missing', 'Complete Phase 2 of the question flow.');
    item('info_address',  'Personal information', 'Home address before nursing home',  applicant.address1 ? 'done' : 'missing', 'Complete Phase 2 of the question flow.');
    item('info_phone',    'Personal information', 'Phone number',                      applicant.phone ? 'done' : 'missing', 'Complete Phase 2 of the question flow.');
    item('info_marital',  'Personal information', 'Marital status',                    app.marital_status ? 'done' : 'missing', 'Complete Phase 1 of the question flow.', true);
    item('info_facility', 'Personal information', 'Nursing facility name',             app.facility_name ? 'done' : 'missing', 'Complete Phase 1 of the question flow.', true);
    item('info_admit',    'Personal information', 'Admission date',                    app.facility_admission_date ? 'done' : 'missing', 'Complete Phase 1 of the question flow.', true);

    if (app.marital_status === 'married') {
      item('info_spouse_fname', 'Spouse information', 'Spouse first name',      spouse.first_name ? 'done' : 'missing', 'Complete Phase 4 of the question flow.');
      item('info_spouse_lname', 'Spouse information', 'Spouse last name',       spouse.last_name ? 'done' : 'missing',  'Complete Phase 4 of the question flow.');
      item('info_spouse_dob',   'Spouse information', 'Spouse date of birth',   spouse.dob ? 'done' : 'missing',        'Complete Phase 4 of the question flow.');
      item('info_spouse_ssn',   'Spouse information', 'Spouse SSN (last 4)',    spouse.ssn_last4 ? 'done' : 'missing',  'Complete Phase 4 of the question flow.');
    }

    // ── MEDICAL ──────────────────────────────────────────────────────────
    item('med_nfloc',   'Medical', 'Nursing facility level of care documented',  app.level_of_care_documented ? 'done' : 'missing', 'Ask the facility social worker to arrange a physician assessment. This is standard at admission.', true);
    item('med_diag',    'Medical', 'Primary diagnosis on file',                  applicant.primary_diagnosis ? 'done' : 'missing',  'Complete Phase 3 of the question flow.');
    item('med_phys',    'Medical', 'Attending physician name',                   applicant.attending_physician ? 'done' : 'missing', 'Complete Phase 3 of the question flow.');
    const adlKeys = ['adl_bathing','adl_dressing','adl_eating','adl_transferring','adl_toileting','adl_continence'];
    const adlFilled = adlKeys.filter(k => applicant[k]).length;
    item('med_adls',    'Medical', `ADL assessment complete (${adlFilled}/6 answered)`, adlFilled === 6 ? 'done' : adlFilled > 0 ? 'pending' : 'missing', 'Complete Phase 3 of the question flow.');
    const needsHelp = adlKeys.filter(k => applicant[k] && applicant[k] !== 'Independent').length;
    item('med_qualify', 'Medical', 'Medically qualifies (2+ ADLs need assistance)', needsHelp >= 2 ? 'done' : 'missing', 'At least 2 ADLs must show need for assistance to qualify for nursing home Medicaid.', true);

    // ── ASSETS ───────────────────────────────────────────────────────────
    item('assets_recorded', 'Assets', `Assets inventory complete (${assets.length} recorded)`, assets.length > 0 ? 'done' : 'missing', 'Complete Phase 5 of the question flow.', true);
    if (st) {
      const countable = assets.filter(a=>!a.is_exempt).reduce((s,a)=>s+(parseFloat(a.value)||0),0);
      item('assets_limit', 'Assets', `Countable assets vs. state limit ($${countable.toLocaleString()} vs $${(st.assetLimit||2000).toLocaleString()} limit)`,
        countable <= (st.assetLimit || 2000) ? 'done' : 'missing',
        countable > (st.assetLimit || 2000) ? 'Countable assets exceed the limit. Assets must be spent down or protected before approval. Consult an elder law attorney.' : '',
        countable > (st.assetLimit || 2000));
    }

    // ── INCOME ───────────────────────────────────────────────────────────
    item('income_recorded', 'Income', `Income sources documented (${income.length} recorded)`, income.length > 0 ? 'done' : 'missing', 'Complete Phase 6 of the question flow.', true);
    if (st && st.incomeLimit) {
      const totalIncome = income.filter(i=>i.person==='applicant').reduce((s,i)=>s+(parseFloat(i.amount)||0)*(FREQ_FACTORS[i.frequency]||1),0);
      item('income_limit', 'Income', `Income vs. state limit ($${Math.round(totalIncome).toLocaleString()}/mo vs $${st.incomeLimit.toLocaleString()}/mo)`,
        totalIncome <= st.incomeLimit ? 'done' : 'missing',
        totalIncome > st.incomeLimit ? 'Income exceeds the state cap. A Qualified Income Trust (Miller Trust) will be required. Contact an elder law attorney.' : '',
        totalIncome > st.incomeLimit);
    }

    // ── TRANSFERS ────────────────────────────────────────────────────────
    item('transfers_disclosed', 'Transfers & lookback', '5-year lookback section completed', transfers.length >= 0 ? 'done' : 'missing', 'Complete Phase 8 of the question flow.');
    const totalUV = transfers.reduce((s,t)=>s+(parseFloat(t.uncompensated_value)||0),0);
    if (totalUV > 0) {
      const penMonths = st?.penaltyDivisor ? (totalUV / st.penaltyDivisor).toFixed(1) : null;
      item('transfers_penalty', 'Transfers & lookback',
        `Uncompensated transfers: $${totalUV.toLocaleString()} — attorney review needed`,
        'missing',
        `Transfers of $${totalUV.toLocaleString()} may result in a penalty period${penMonths?' of ~'+penMonths+' months':''} before Medicaid will pay. Consult an elder law attorney before submitting.`,
        true);
    }

    // ── DOCUMENTS ────────────────────────────────────────────────────────
    const DOC_INFO = {
      photo_id:               { label: 'Government photo ID', how: "Driver's license, state ID, or passport. Call the DMV for a replacement if lost." },
      birth_certificate:      { label: 'Birth certificate or proof of age', how: 'Contact the vital records office of the birth state, or call SSA at 1-800-772-1213.' },
      ss_award_letter:        { label: 'Social Security award/benefit letter', how: 'Get instantly at ssa.gov/myaccount or call 1-800-772-1213 to request by mail.' },
      medicare_card:          { label: 'Medicare card', how: 'Call 1-800-MEDICARE or print at medicare.gov. Free replacement takes 1-2 weeks by mail.' },
      citizenship_proof:      { label: 'Proof of U.S. citizenship', how: 'Passport, birth certificate, or naturalization certificate.' },
      immigration_docs:       { label: 'Immigration documents', how: 'Green card, visa, or EAD card.' },
      proof_of_residency:     { label: 'Proof of residence before nursing home', how: 'Lease, mortgage statement, utility bill, or bank statement at the home address.' },
      marriage_certificate:   { label: 'Marriage certificate', how: 'Contact the vital records office of the state/county where the marriage took place.' },
      divorce_or_death_cert:  { label: 'Divorce decree or death certificate (prior marriage)', how: 'Contact the county courthouse (divorce) or vital records office (death certificate).' },
      poa_document:           { label: 'Power of attorney or guardianship paperwork', how: 'The signed, notarized POA or court guardianship order.' },
      nfloc_documentation:    { label: 'Nursing facility level of care documentation', how: 'Ask the facility social worker — this is standard and they do it regularly.' },
      admission_records:      { label: 'Nursing home admission records and account statement', how: 'Request from the nursing home billing department.' },
      physician_letter:       { label: 'Physician letter or medical records', how: "Request from the attending physician's office." },
      bank_checking_1:        { label: 'Checking account — 60 months of statements', how: 'Download as PDFs from online banking or request from a branch. Most banks keep 7 years of statements.' },
      bank_checking_2:        { label: 'Second checking account — 60 months of statements', how: 'Same as above for the second account.' },
      bank_savings_1:         { label: 'Savings account — 60 months of statements', how: 'Download or request from the bank. Include all monthly/quarterly statements.' },
      bank_cd_1:              { label: 'CD — statements', how: 'Most recent statement plus any from the past 60 months from the issuing bank.' },
      investment_stmt_1:      { label: 'Investment/brokerage account — 60 months of statements', how: 'Download quarterly statements from the brokerage portal or ask your advisor.' },
      retirement_stmt_1:      { label: 'Retirement account — 60 months of statements', how: 'Download quarterly statements or request from the plan administrator.' },
      closed_account_statements: { label: 'Closed account closing statements (zero balance)', how: 'Contact the bank for a closing statement or letter confirming the account closed and final balance.' },
      home_deed:              { label: 'Deed to primary home', how: "Contact the county recorder's office — deeds are public records, often available online for free." },
      home_tax_statement:     { label: 'Property tax statement (home)', how: 'Available from the county tax assessor or in the annual tax bill.' },
      home_insurance:         { label: "Homeowner's insurance declarations page", how: 'Contact your insurance agent or download from the insurer portal.' },
      other_re_deed:          { label: 'Deed to other real estate', how: "Contact the county recorder's office where the property is located." },
      vehicle_title_1:        { label: 'Vehicle title', how: 'Contact your state DMV to order a duplicate if lost.' },
      vehicle_title_2:        { label: 'Second vehicle title', how: 'Contact your state DMV to order a duplicate if lost.' },
      life_insurance_policy:  { label: 'Life insurance policy and cash surrender value statement', how: 'Contact the insurance company directly. Ask for the current CSV statement.' },
      burial_contract:        { label: 'Prepaid funeral/burial contract', how: 'Contact the funeral home or burial society that issued the policy.' },
      trust_document:         { label: 'Trust document and Schedule A', how: 'Contact the attorney who drafted the trust, or the trustee.' },
      annuity_contract:       { label: 'Annuity contract', how: 'Contact the insurance company that issued the annuity.' },
      ltc_insurance_policy:   { label: 'Long-term care insurance policy', how: 'Contact the insurance company. Also request current benefit status.' },
      pension_statement:      { label: 'Pension award letter or statement', how: 'Contact the pension administrator or former employer HR department.' },
      va_award_letter:        { label: 'VA benefits award letter', how: 'Available at va.gov or by calling 1-800-827-1000.' },
      nh_trust_account:       { label: 'Nursing home trust/comfort account statement', how: 'Request from the nursing home business office.' },
      transfer_docs_1:        { label: 'Transfer documentation — gift/transfer #1', how: 'Cancelled check, bank statement showing withdrawal, deed, or gift letter.' },
      additional_transfer_docs: { label: 'Additional transfer documentation', how: 'Bank statements, deeds, gift letters, or any other evidence.' },
      promissory_note_1:      { label: 'Promissory note', how: 'The signed promissory note documenting the loan repayment terms.' },
    };

    // Add document items from checklist
    Object.entries(DOC_INFO).forEach(([key, info]) => {
      const status = checklist[key];
      if (status) {
        item('doc_'+key, 'Documents', info.label, status, info.how, status !== 'done');
      }
    });

    // Always required docs that may not be in checklist yet
    ['photo_id','birth_certificate','ss_award_letter','nfloc_documentation','admission_records'].forEach(key => {
      if (!checklist[key]) {
        item('doc_'+key, 'Documents', DOC_INFO[key]?.label || key, 'missing', DOC_INFO[key]?.how || '', true);
      }
    });
    if (applicant.medicare_number && !checklist['medicare_card']) {
      item('doc_medicare_card', 'Documents', 'Medicare card', 'missing', DOC_INFO.medicare_card.how, false);
    }

    // Compute summary
    const done    = allItems.filter(i => i.status === 'done');
    const pending = allItems.filter(i => i.status === 'pending');
    const missing = allItems.filter(i => i.status === 'missing');
    const urgent  = missing.filter(i => i.urgent);

    // Group by category
    const categories = [...new Set(allItems.map(i => i.category))];

    const pct = Math.round((done.length / allItems.length) * 100);

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Application Checklist — ${esc(appName)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 13px; color: #222; max-width: 820px; margin: 0 auto; padding: 32px; }
        h1 { font-size: 1.3rem; margin: 0 0 4px; }
        .meta { color: #666; font-size: 0.82rem; margin-bottom: 20px; }
        .progress-bar { height: 10px; background: #e0e0e0; border-radius: 5px; overflow: hidden; margin-bottom: 6px; }
        .progress-fill { height: 100%; background: #1a4480; border-radius: 5px; width: ${pct}%; }
        .progress-label { font-size: 0.8rem; color: #555; margin-bottom: 20px; }
        .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .summary-box { border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 120px; }
        .summary-num { font-size: 1.6rem; font-weight: 800; line-height: 1; }
        .summary-lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-top: 3px; }
        .s-done { background: #ecf3ec; color: #2b5b33; }
        .s-miss { background: #f4e3db; color: #6f3331; }
        .s-pend { background: #faf3d1; color: #5c4809; }
        .s-urg  { background: #fff0f0; color: #8c1c1c; border: 1px solid #e0a0a0; }
        .cat-header { font-size: 0.85rem; font-weight: 700; color: #1a4480; border-bottom: 2px solid #1a4480; padding-bottom: 5px; margin: 22px 0 10px; }
        .cl-row { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        .cl-row:last-child { border-bottom: none; }
        .cl-check { width: 20px; height: 20px; border: 1.5px solid #aaa; border-radius: 3px; flex-shrink: 0; margin-top: 1px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .cl-check.done { background: #ecf3ec; border-color: #4d8055; color: #2b5b33; }
        .cl-check.pending { background: #faf3d1; border-color: #c2850c; }
        .cl-check.missing { background: #fff; border-color: #ccc; }
        .cl-label { font-size: 0.875rem; font-weight: 600; }
        .cl-how { font-size: 0.78rem; color: #666; margin-top: 2px; }
        .urgent-tag { display: inline-block; background: #f4e3db; color: #6f3331; font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.04em; margin-left: 6px; vertical-align: middle; }
        @media print { body { padding: 16px; } .progress-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head><body>
      <h1>Application Checklist</h1>
      <div class="meta">
        <strong>${esc(appName)}</strong> &nbsp;·&nbsp;
        ${st ? esc(st.name) + ' &nbsp;·&nbsp; ' : ''}
        Printed: ${today()}
      </div>

      <div class="progress-bar"><div class="progress-fill"></div></div>
      <div class="progress-label">${pct}% complete — ${done.length} of ${allItems.length} items done</div>

      <div class="summary">
        <div class="summary-box s-done">
          <div class="summary-num">${done.length}</div>
          <div class="summary-lbl">✅ Complete</div>
        </div>
        <div class="summary-box s-miss">
          <div class="summary-num">${missing.length}</div>
          <div class="summary-lbl">🔴 Missing</div>
        </div>
        ${pending.length > 0 ? `<div class="summary-box s-pend">
          <div class="summary-num">${pending.length}</div>
          <div class="summary-lbl">🟡 In progress</div>
        </div>` : ''}
        ${urgent.length > 0 ? `<div class="summary-box s-urg">
          <div class="summary-num">${urgent.length}</div>
          <div class="summary-lbl">⚠ Urgent</div>
        </div>` : ''}
      </div>

      ${categories.map(cat => {
        const catItems = allItems.filter(i => i.category === cat);
        if (catItems.length === 0) return '';
        return `
          <div class="cat-header">${esc(cat)}</div>
          ${catItems.map(item => `
            <div class="cl-row">
              <div class="cl-check ${item.status}">${item.status==='done'?'✓':item.status==='pending'?'◑':''}</div>
              <div>
                <div class="cl-label">${esc(item.label)}${item.urgent && item.status!=='done'?'<span class="urgent-tag">urgent</span>':''}</div>
                ${item.status !== 'done' && item.how ? `<div class="cl-how">${esc(item.how)}</div>` : ''}
              </div>
            </div>`).join('')}`;
      }).join('')}

    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

    /* ========================================================================
     3. EXPORT PACKET PDF
     Full submission package with cover letter, POA disclosure, all sections,
     document index, and signed certification
  ======================================================================== */

  window.exportPacketPDF = async function(appId) {
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }

    const [{ app, applicant, spouse, assets, income, transfers, checklist, docs, st }, firm] = await Promise.all([
      loadAppData(appId),
      loadFirmSettings(),
    ]);

    if (btn) { btn.disabled = false; btn.textContent = '📄 Export packet PDF'; }

    const appName = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') || 'Applicant';
    const totalAssets = assets.reduce((s,a) => s+(parseFloat(a.value)||0), 0);
    const countable   = assets.filter(a => !a.is_exempt).reduce((s,a) => s+(parseFloat(a.value)||0), 0);
    const totalIncome = income.reduce((s,i) => s+(parseFloat(i.amount)||0)*(FREQ_FACTORS[i.frequency]||1), 0);
    const totalUV     = transfers.reduce((s,t) => s+(parseFloat(t.uncompensated_value)||0), 0);
    const penMonths   = st?.penaltyDivisor && totalUV > 0 ? (totalUV / st.penaltyDivisor).toFixed(1) : null;

    function kv(label, val) {
      return `<tr><td style="width:200px;color:#555;padding:5px 8px;vertical-align:top;font-size:0.875rem;">${esc(label)}</td><td style="padding:5px 8px;font-size:0.875rem;">${val||'—'}</td></tr>`;
    }
    function section(title, content) {
      return `<div style="margin-top:32px;">
        <div style="font-family:Arial,sans-serif;font-size:1rem;font-weight:700;color:#162e51;border-bottom:2px solid #1a4480;padding-bottom:6px;margin-bottom:14px;">${title}</div>
        ${content}
      </div>`;
    }

    const packetHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Medicaid Application Packet — ${esc(appName)}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #222; line-height: 1.5; margin: 0; padding: 0; }
        .page { max-width: 760px; margin: 0 auto; padding: 48px 40px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 7px 8px; background: #f0f0f0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 2px solid #ddd; }
        td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
        .page-break { page-break-before: always; }
        .stamp { border: 2px solid #c2850c; color: #7a4e12; padding: 10px 18px; border-radius: 6px; display: inline-block; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
        .sig-line { border-top: 1px solid #333; width: 280px; margin-top: 40px; padding-top: 4px; font-size: 0.78rem; color: #666; }
        @media print {
          .page { padding: 32px 24px; }
          .page-break { page-break-before: always; }
        }
      </style>
    </head><body>

    <!-- COVER LETTER -->
    <div class="page">
      ${firm.firm_name ? `
        <div style="margin-bottom:32px;">
          <div style="font-size:1.1rem;font-weight:700;">${esc(firm.firm_name)}</div>
          ${firm.firm_address ? `<div>${esc(firm.firm_address)}</div>` : ''}
          ${firm.firm_city_state_zip ? `<div>${esc(firm.firm_city_state_zip)}</div>` : ''}
          ${firm.firm_phone ? `<div>${esc(firm.firm_phone)}</div>` : ''}
          ${firm.firm_email ? `<div>${esc(firm.firm_email)}</div>` : ''}
        </div>` : ''}

      <div style="margin-bottom:24px;">
        <div>${today()}</div>
      </div>

      ${st ? `<div style="margin-bottom:24px;">
        <div><strong>${esc(st.agencyName)}</strong></div>
        <div>${esc(st.agencyPhone)}</div>
        <div>${esc(st.agencyUrl)}</div>
      </div>` : ''}

      <div style="margin-bottom:16px;"><strong>Re: Medicaid Long-Term Care Application — ${esc(appName)}</strong></div>

      <p>Dear ${st ? esc(st.name) + ' Medicaid' : 'Medicaid'} Eligibility Staff,</p>

      <p>Please find enclosed a complete application for nursing home Medicaid benefits on behalf of our client, <strong>${esc(appName)}</strong>${applicant.dob ? ', date of birth ' + fmtDate(applicant.dob) : ''}${applicant.address1 ? ', residing at ' + esc(applicant.address1) + (applicant.city ? ', ' + esc(applicant.city) : '') + (applicant.state ? ', ' + esc(applicant.state) : '') + (applicant.zip ? ' ' + esc(applicant.zip) : '') : ''}.</p>

      <p>${firm.firm_name ? esc(firm.firm_name) : 'Our firm'} has been engaged to assist ${esc(appName)} and ${app.marital_status === 'married' ? 'their family' : 'their family'} in preparing and submitting this Medicaid application. We have collected, organized, and reviewed all required documentation to the best of our ability, including:</p>

      <ul style="margin:12px 0;padding-left:20px;">
        <li>Complete personal and contact information for the applicant${app.marital_status === 'married' ? ' and community spouse' : ''}</li>
        <li>Medical information and activities of daily living assessment</li>
        <li>Full asset inventory as of the date of application</li>
        <li>Complete income documentation for all sources</li>
        <li>${st ? st.lookback : 60}-month financial history including all transfers and gifts</li>
        <li>Supporting documents as listed in the enclosed Document Index (Section 9)</li>
      </ul>

      ${totalUV > 0 ? `<p><strong>Note regarding transfers:</strong> This application discloses ${fmtMoney(totalUV)} in uncompensated transfers during the lookback period. Details are provided in Section 7 of this packet. We recommend consultation with an elder law attorney regarding any potential penalty period implications.</p>` : ''}

      <p>We respectfully request that you process this application promptly${app.facility_admission_date ? ', noting that ' + esc(appName) + ' has been in nursing facility care since ' + fmtDate(app.facility_admission_date) + ' and may be eligible for retroactive coverage to that date' : ''}.</p>

      <p>Please do not hesitate to contact us if additional information is needed.</p>

      <p>Sincerely,</p>
      <div class="sig-line">Authorized Representative / Date</div>
      ${firm.firm_name ? `<div style="margin-top:8px;font-size:0.85rem;">${esc(firm.firm_name)}</div>` : ''}
      ${firm.firm_phone ? `<div style="font-size:0.85rem;">${esc(firm.firm_phone)}</div>` : ''}
    </div>

    <!-- AUTHORIZED REPRESENTATIVE DISCLOSURE -->
    <div class="page page-break">
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:20px;color:#162e51;">Authorized Representative Disclosure</div>

      <div class="stamp" style="margin-bottom:20px;">Section 1 of 9 — Representative Authorization</div>

      <p>${firm.firm_name ? esc(firm.firm_name) : 'The undersigned authorized representative'} hereby certifies that:</p>

      <ol style="padding-left:20px;line-height:1.8;">
        <li>We have been authorized to act as the representative of <strong>${esc(appName)}</strong> in connection with this Medicaid application.</li>
        <li>Our authority is based on ${app._poa_type === 'guardian' ? 'a court-issued guardianship order' : 'a durable Power of Attorney'} executed by or on behalf of the applicant, a copy of which is enclosed with this application.</li>
        <li>All information contained in this application has been provided to us by the applicant and/or their family members and is true, accurate, and complete to the best of our knowledge.</li>
        <li>We understand that providing false information may result in denial of benefits and may subject the applicant and/or their representative to civil or criminal penalties.</li>
        <li>We consent to the release of any information necessary for the determination of Medicaid eligibility to the appropriate state agency.</li>
      </ol>

      <div style="display:flex;gap:60px;flex-wrap:wrap;margin-top:40px;">
        <div class="sig-line">Authorized Representative signature &amp; date</div>
        <div class="sig-line">Printed name &amp; title</div>
      </div>
      ${firm.firm_name ? `<div style="margin-top:12px;font-size:0.85rem;color:#666;">${esc(firm.firm_name)} ${firm.firm_address ? '· '+esc(firm.firm_address) : ''} ${firm.firm_phone ? '· '+esc(firm.firm_phone) : ''}</div>` : ''}
    </div>

    <!-- SECTION 2: APPLICANT INFORMATION -->
    <div class="page page-break">
      <div class="stamp" style="margin-bottom:20px;">Section 2 of 9 — Applicant Information</div>
      ${section('Applicant Personal Information', `<table>
        ${kv('Full name', [applicant.first_name, applicant.middle_name, applicant.last_name].filter(Boolean).join(' '))}
        ${kv('Date of birth', fmtDate(applicant.dob))}
        ${kv('Sex', applicant.sex === 'M' ? 'Male' : applicant.sex === 'F' ? 'Female' : '—')}
        ${kv('SSN (last 4)', applicant.ssn_last4 ? '•••–••–'+esc(applicant.ssn_last4) : 'Provide on official form')}
        ${kv('U.S. citizen/national', applicant.citizen === true ? 'Yes' : applicant.citizen === false ? 'No' : '—')}
        ${kv('Phone', applicant.phone||'—')}
        ${kv('Email', applicant.email||'—')}
        ${kv('Address before nursing home', [applicant.address1, applicant.city, applicant.state, applicant.zip].filter(Boolean).join(', ')||'—')}
        ${kv('Medicare number', applicant.medicare_number||'—')}
        ${kv('Attending physician', applicant.attending_physician||'—')}
        ${kv('Physician phone', applicant.physician_phone||'—')}
        ${kv('Primary diagnosis', applicant.primary_diagnosis||'—')}
        ${kv('Marital status', app.marital_status === 'married' ? 'Married' : 'Single / widowed / divorced')}
      </table>`)}

      ${section('Activities of Daily Living', `<table>
        <tr><th>Activity</th><th>Level of Assistance Needed</th></tr>
        ${['bathing','dressing','eating','transferring','toileting','continence'].map(adl =>
          `<tr><td style="text-transform:capitalize;">${adl}</td><td>${esc(applicant['adl_'+adl]||'Not answered')}</td></tr>`
        ).join('')}
      </table>`)}

      ${section('Facility Information', `<table>
        ${kv('State / program', st ? esc(st.name)+' — '+esc(st.programName) : '—')}
        ${kv('Nursing facility', app.facility_name||'—')}
        ${kv('Admission date', fmtDate(app.facility_admission_date))}
        ${kv('Level of care documented', app.level_of_care_documented ? 'Yes — physician documentation on file' : 'Pending')}
      </table>`)}
    </div>

    <!-- SECTION 3: COMMUNITY SPOUSE -->
    ${app.marital_status === 'married' ? `<div class="page page-break">
      <div class="stamp" style="margin-bottom:20px;">Section 3 of 9 — Community Spouse Information</div>
      ${section('Community Spouse', `<table>
        ${kv('Full name', [spouse.first_name, spouse.last_name].filter(Boolean).join(' ')||'—')}
        ${kv('Date of birth', fmtDate(spouse.dob))}
        ${kv('SSN (last 4)', spouse.ssn_last4 ? '•••–••–'+esc(spouse.ssn_last4) : 'Provide on official form')}
        ${kv('Phone', spouse.phone||'—')}
        ${kv('Address', [spouse.address1, spouse.city, spouse.state, spouse.zip].filter(Boolean).join(', ')||'—')}
        ${kv('Medicare number', spouse.medicare_number||'—')}
        ${st ? kv('Community Spouse Resource Allowance', 'Up to $'+st.csra.toLocaleString()) : ''}
        ${st ? kv('Min. Monthly Maintenance Needs Allowance', '$'+st.mmmna.toLocaleString()+'/month') : ''}
      </table>`)}
    </div>` : ''}

    <!-- SECTION 4: ASSET INVENTORY -->
    <div class="page page-break">
      <div class="stamp" style="margin-bottom:20px;">Section 4 of 9 — Asset Inventory</div>
      ${section(`Asset Inventory — Total: ${fmtMoney(totalAssets)} | Countable: ${fmtMoney(countable)}${st ? ' | State limit: '+(st.assetLimit ? '$'+st.assetLimit.toLocaleString() : 'see notes') : ''}`, `
        <table>
          <tr><th>Owner</th><th>Asset Type</th><th>Institution / Description</th><th>Acct Last 4</th><th>Value</th><th>Exempt?</th></tr>
          ${assets.map(a => `<tr>
            <td style="text-transform:capitalize;">${esc(a.owner)}</td>
            <td>${ASSET_LABELS[a.asset_type]||esc(a.asset_type)}</td>
            <td>${esc(a.institution||a.description||'')}</td>
            <td>${esc(a.account_last4||'—')}</td>
            <td>${fmtMoney(a.value)}</td>
            <td>${a.is_exempt ? 'Yes — '+esc(a.exempt_reason||'exempt') : 'No'}</td>
          </tr>`).join('') || '<tr><td colspan="6" style="color:#999;">No assets recorded</td></tr>'}
          <tr style="font-weight:700;border-top:2px solid #1a4480;">
            <td colspan="3">Total</td><td></td>
            <td>${fmtMoney(totalAssets)}</td>
            <td>Countable: ${fmtMoney(countable)}</td>
          </tr>
        </table>`)}
    </div>

    <!-- SECTION 5: INCOME -->
    <div class="page page-break">
      <div class="stamp" style="margin-bottom:20px;">Section 5 of 9 — Income</div>
      ${section(`Income Summary — Total: ${fmtMoney(totalIncome)}/month${st ? ' | State limit: '+(st.incomeLimit ? '$'+st.incomeLimit.toLocaleString()+'/mo' : 'no hard cap') : ''}`, `
        <table>
          <tr><th>Person</th><th>Source</th><th>Payer</th><th>Amount</th><th>Frequency</th><th>Monthly</th></tr>
          ${income.map(i => `<tr>
            <td style="text-transform:capitalize;">${esc(i.person)}</td>
            <td>${INCOME_LABELS[i.income_type]||esc(i.income_type)}</td>
            <td>${esc(i.payer||'—')}</td>
            <td>${fmtMoney(i.amount)}</td>
            <td style="text-transform:capitalize;">${esc(i.frequency)}</td>
            <td>${fmtMoney((parseFloat(i.amount)||0)*(FREQ_FACTORS[i.frequency]||1))}</td>
          </tr>`).join('') || '<tr><td colspan="6" style="color:#999;">No income recorded</td></tr>'}
          <tr style="font-weight:700;border-top:2px solid #1a4480;">
            <td colspan="5">Total countable monthly income</td>
            <td>${fmtMoney(totalIncome)}</td>
          </tr>
        </table>
        ${st ? `<p style="font-size:0.82rem;color:#555;margin-top:12px;">Personal Needs Allowance: $${st.pna}/month. ${app.marital_status === 'married' ? 'Community spouse income protected per MMMNA rules. ' : ''}${st.incomeType === 'cap' ? 'Income cap state — Qualified Income Trust (Miller Trust) may be required if income exceeds $'+st.incomeLimit?.toLocaleString()+'/month.' : 'Medically needy/spend-down state.'}</p>` : ''}
      `)}
    </div>

    <!-- SECTION 6: MEDICAL ELIGIBILITY -->
    <div class="page page-break">
      <div class="stamp" style="margin-bottom:20px;">Section 6 of 9 — Medical Eligibility</div>
      ${section('Activities of Daily Living & Level of Care', `
        <table>
          <tr><th>ADL</th><th>Level</th></tr>
          ${['bathing','dressing','eating','transferring','toileting','continence'].map(adl =>
            `<tr><td style="text-transform:capitalize;">${adl}</td><td>${esc(applicant['adl_'+adl]||'Not answered')}</td></tr>`
          ).join('')}
        </table>
        <table style="margin-top:16px;">
          ${kv('Primary diagnosis', applicant.primary_diagnosis||'—')}
          ${kv('Attending physician', applicant.attending_physician||'—')}
          ${kv('Physician phone', applicant.physician_phone||'—')}
          ${kv('NFLOC documented', app.level_of_care_documented ? 'Yes' : 'Pending')}
        </table>`)}
    </div>

    <!-- SECTION 7: TRANSFERS -->
    <div class="page page-break">
      <div class="stamp" style="margin-bottom:20px;">Section 7 of 9 — ${st ? st.lookback : 60}-Month Lookback / Transfer Disclosure</div>
      <p style="font-size:0.85rem;color:#555;margin-bottom:16px;">This section discloses all transfers, gifts, and below-market sales made in the ${st ? st.lookback : 60} months prior to this application, as required by federal Medicaid law. The IRS annual gift tax exclusion does not apply to Medicaid lookback rules.</p>
      ${totalUV > 0 ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px;margin-bottom:16px;font-size:0.85rem;color:#664d03;"><strong>⚠ Attorney review recommended.</strong> Total uncompensated transfers: ${fmtMoney(totalUV)}.${penMonths ? ' Estimated penalty period: ~'+penMonths+' months (verify with state).' : ''} Consult an elder law attorney.</div>` : ''}
      ${transfers.length ? transfers.map((t,i) => {
        const uv = parseFloat(t.uncompensated_value)||0;
        return `${section('Transfer '+(i+1)+': '+esc(t.asset_description||'(no description)'), `<table>
          ${kv('Date', fmtDate(t.transfer_date))}
          ${kv('Asset / description', t.asset_description||'—')}
          ${kv('Fair market value', fmtMoney(t.fair_market_value))}
          ${kv('Amount received', fmtMoney(t.amount_received))}
          ${kv('Uncompensated value', uv > 0 ? '<strong style="color:#b50909;">'+fmtMoney(uv)+'</strong>' : fmtMoney(0))}
          ${kv('Recipient', [t.recipient_name, t.recipient_relationship].filter(Boolean).join(' — ')||'—')}
          ${kv('Was a loan', t.was_loan ? 'Yes'+(t.has_promissory_note?' — promissory note on file':'') : 'No')}
          ${kv('Was payment for care', t.was_for_care ? 'Yes'+(t.has_care_agreement?' — care agreement on file':'') : 'No')}
          ${kv('Asset returned', t.was_returned ? 'Yes' : 'No')}
          ${kv('Possible exemption', t.possible_exemption && t.possible_exemption !== 'none' ? t.possible_exemption : 'None identified')}
          ${t.notes ? kv('Notes', t.notes) : ''}
        </table>`)}`;
      }).join('') : '<p style="color:#555;">No transfers disclosed.</p>'}
    </div>

    <!-- SECTION 8: CERTIFICATION -->
    <div class="page page-break">
      <div class="stamp" style="margin-bottom:20px;">Section 8 of 9 — Certification</div>
      <p>I certify, under penalty of perjury, that the information provided in this application is true, accurate, and complete to the best of my knowledge and belief. I understand that Medicaid eligibility is conditioned upon accurate and complete disclosure of all financial information, and that providing false or misleading information may result in denial, termination, or recovery of benefits, and may subject me to civil or criminal penalties.</p>
      <p>I authorize the release of any information necessary to determine eligibility for Medicaid benefits, including financial and medical records, to the appropriate state agency.</p>
      <p>I understand that if I am approved for Medicaid, the state may recover costs from my estate after my death (estate recovery), and I have been informed of this right.</p>
      <div style="display:flex;gap:60px;flex-wrap:wrap;margin-top:40px;">
        <div class="sig-line">Applicant signature &amp; date</div>
        <div class="sig-line">Authorized representative signature &amp; date</div>
      </div>
      <div style="display:flex;gap:60px;flex-wrap:wrap;margin-top:32px;">
        ${app.marital_status === 'married' ? '<div class="sig-line">Community spouse signature &amp; date</div>' : ''}
      </div>
    </div>

    <!-- SECTION 9: DOCUMENT INDEX -->
    <div class="page page-break">
      <div class="stamp" style="margin-bottom:20px;">Section 9 of 9 — Document Index</div>
      <p style="font-size:0.85rem;color:#555;margin-bottom:16px;">The following documents are enclosed with this application (${docs.length} total).</p>
      <table>
        <tr><th>#</th><th>Document</th><th>File name</th><th>Uploaded</th></tr>
        ${docs.map((d,i) => `<tr>
          <td>${i+1}</td>
          <td>${esc((d.doc_type||'').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()))}</td>
          <td style="font-size:0.8rem;color:#555;">${esc(d.file_name||d.storage_path)}</td>
          <td style="font-size:0.8rem;">${fmtDate(d.uploaded_at)}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="color:#999;">No documents uploaded</td></tr>'}
      </table>
    </div>

    </body></html>`;

    const w = window.open('', '_blank');
    w.document.write(packetHTML);
    w.document.close();
    setTimeout(() => w.print(), 800);
  };

  /* ========================================================================
     Firm Settings UI (for staff portal)
  ======================================================================== */
  window.renderFirmSettings = async function() {
    const firm = await loadFirmSettings();
    return `
      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-bottom:16px;">Firm information — appears on all cover letters</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          ${fvFieldStatic('Firm name', 'firm_name', firm.firm_name)}
          ${fvFieldStatic('Address', 'firm_address', firm.firm_address)}
          ${fvFieldStatic('City, State ZIP', 'firm_city_state_zip', firm.firm_city_state_zip)}
          ${fvFieldStatic('Phone', 'firm_phone', firm.firm_phone)}
          ${fvFieldStatic('Email', 'firm_email', firm.firm_email)}
          ${fvFieldStatic('Website', 'firm_website', firm.firm_website)}
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveFirmSettings()" style="margin-top:16px;">Save firm settings</button>
        <div id="firmSaveMsg" style="display:none;margin-top:8px;font-size:0.85rem;"></div>
      </div>`;
  };

  function fvFieldStatic(label, id, val) {
    return `<div class="field"><label class="label">${esc(label)}</label><input type="text" id="firm_${id}" value="${esc(val||'')}"></div>`;
  }

  window.saveFirmSettings = async function() {
    const data = {
      firm_name: document.getElementById('firm_firm_name')?.value.trim(),
      firm_address: document.getElementById('firm_firm_address')?.value.trim(),
      firm_city_state_zip: document.getElementById('firm_firm_city_state_zip')?.value.trim(),
      firm_phone: document.getElementById('firm_firm_phone')?.value.trim(),
      firm_email: document.getElementById('firm_firm_email')?.value.trim(),
      firm_website: document.getElementById('firm_firm_website')?.value.trim(),
      updated_at: new Date().toISOString(),
      updated_by: window.currentUser?.id || null,
    };
    const existing = await loadFirmSettings();
    let error;
    if (existing.id) {
      ({ error } = await sb.from('firm_settings').update(data).eq('id', existing.id));
    } else {
      ({ error } = await sb.from('firm_settings').insert(data));
    }
    const msg = document.getElementById('firmSaveMsg');
    if (msg) {
      msg.style.display = 'block';
      msg.style.color = error ? '#b50909' : '#2b5b33';
      msg.textContent = error ? 'Error: ' + error.message : '✅ Firm settings saved.';
    }
  };

})();
