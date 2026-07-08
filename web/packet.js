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
    shell(`<div class="spinner-wrap">Loading form view…</div>`, 'Form view');
    const { app, applicant, spouse, assets, income, transfers, checklist, docs, st } = await loadAppData(appId);
    const appName = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') || 'Application';

    function field(label, id, val, type='text') {
      return `<div class="fv-field">
        <label class="fv-label">${esc(label)}</label>
        <input type="${type}" class="fv-input" data-id="${id}" value="${esc(val||'')}" onchange="fvSave('${appId}','${id}',this.value)">
      </div>`;
    }
    function select(label, id, val, opts) {
      return `<div class="fv-field">
        <label class="fv-label">${esc(label)}</label>
        <select class="fv-input" data-id="${id}" onchange="fvSave('${appId}','${id}',this.value)">
          ${opts.map(o => `<option value="${esc(o.v)}" ${val===o.v?'selected':''}>${esc(o.l)}</option>`).join('')}
        </select>
      </div>`;
    }
    function section(title, content) {
      return `<div class="fv-section">
        <div class="fv-section-title">${esc(title)}</div>
        <div class="fv-section-body">${content}</div>
      </div>`;
    }
    function row(...fields) { return `<div class="fv-row">${fields.join('')}</div>`; }

    const totalAssets = assets.reduce((s,a) => s+(parseFloat(a.value)||0), 0);
    const countable   = assets.filter(a => !a.is_exempt).reduce((s,a) => s+(parseFloat(a.value)||0), 0);
    const totalIncome = income.reduce((s,i) => s+(parseFloat(i.amount)||0)*(FREQ_FACTORS[i.frequency]||1), 0);
    const totalUV     = transfers.reduce((s,t) => s+(parseFloat(t.uncompensated_value)||0), 0);

    shell(`
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <div>
          <h2 style="margin:0;">${esc(appName)}</h2>
          <div style="font-size:0.85rem;color:var(--ink-faint);">${st?esc(st.name):'—'} · Form view</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/application/${appId}'">← Question view</button>
          <button class="btn btn-secondary btn-sm" onclick="printChecklist('${appId}')">🖨 Print checklist</button>
          <button class="btn btn-primary btn-sm" onclick="exportPacketPDF('${appId}')">📄 Export packet PDF</button>
        </div>
      </div>

      <style>
        .fv-section { background:#fff; border:1px solid var(--border); border-radius:10px; margin-bottom:16px; overflow:hidden; }
        .fv-section-title { background:#f0f0f0; padding:12px 18px; font-weight:700; font-size:0.9rem; border-bottom:1px solid var(--border); }
        .fv-section-body { padding:18px; }
        .fv-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }
        .fv-field { display:flex; flex-direction:column; gap:5px; }
        .fv-label { font-size:0.8rem; font-weight:600; color:var(--ink-soft); }
        .fv-input { font-size:0.9rem; padding:8px 10px; border:1.5px solid #ccc; border-radius:6px; font-family:inherit; }
        .fv-input:focus { outline:none; border-color:var(--navy); }
        .fv-saved { color:var(--good-ink); font-size:0.75rem; margin-left:8px; }
        .fv-table { width:100%; border-collapse:collapse; font-size:0.875rem; }
        .fv-table th { text-align:left; padding:7px 10px; background:#f8f8f8; border-bottom:2px solid var(--border); font-size:0.75rem; text-transform:uppercase; color:var(--ink-faint); }
        .fv-table td { padding:7px 10px; border-bottom:1px solid #f0f0f0; }
        .fv-total { font-weight:700; border-top:2px solid var(--navy)!important; }
      </style>

      ${section('Facility & Application', row(
        field('State', 'app.state', app.state),
        field('Facility name', 'app.facility_name', app.facility_name),
        field('Admission date', 'app.facility_admission_date', app.facility_admission_date, 'date'),
        select('Marital status', 'app.marital_status', app.marital_status, [{v:'single',l:'Single/widowed/divorced'},{v:'married',l:'Married'}])
      ))}

      ${section('Applicant', row(
        field('First name', 'appl.first_name', applicant.first_name),
        field('Middle name', 'appl.middle_name', applicant.middle_name),
        field('Last name', 'appl.last_name', applicant.last_name),
        field('Date of birth', 'appl.dob', applicant.dob, 'date'),
        field('SSN last 4', 'appl.ssn_last4', applicant.ssn_last4),
        field('Phone', 'appl.phone', applicant.phone, 'tel'),
        field('Email', 'appl.email', applicant.email, 'email'),
        field('Address', 'appl.address1', applicant.address1),
        field('City', 'appl.city', applicant.city),
        field('State', 'appl.state', applicant.state),
        field('ZIP', 'appl.zip', applicant.zip),
        field('Medicare #', 'appl.medicare_number', applicant.medicare_number),
        field('Physician', 'appl.attending_physician', applicant.attending_physician),
        field('Physician phone', 'appl.physician_phone', applicant.physician_phone),
        field('Diagnosis', 'appl.primary_diagnosis', applicant.primary_diagnosis)
      ))}

      ${app.marital_status === 'married' ? section('Community Spouse', row(
        field('First name', 'spou.first_name', spouse.first_name),
        field('Last name', 'spou.last_name', spouse.last_name),
        field('Date of birth', 'spou.dob', spouse.dob, 'date'),
        field('SSN last 4', 'spou.ssn_last4', spouse.ssn_last4),
        field('Phone', 'spou.phone', spouse.phone, 'tel'),
        field('Address', 'spou.address1', spouse.address1),
        field('Medicare #', 'spou.medicare_number', spouse.medicare_number)
      )) : ''}

      ${section(`Assets — Total: ${fmtMoney(totalAssets)} | Countable: ${fmtMoney(countable)}`, `
        <table class="fv-table">
          <tr><th>Owner</th><th>Type</th><th>Institution</th><th>Acct last 4</th><th>Value</th><th>Exempt</th></tr>
          ${assets.map(a => `<tr>
            <td>${esc(a.owner)}</td>
            <td>${ASSET_LABELS[a.asset_type]||esc(a.asset_type)}</td>
            <td>${esc(a.institution||a.description||'')}</td>
            <td>${esc(a.account_last4||'')}</td>
            <td>${fmtMoney(a.value)}</td>
            <td>${a.is_exempt ? '✅ '+esc(a.exempt_reason||'Exempt') : '—'}</td>
          </tr>`).join('') || '<tr><td colspan="6" style="color:#999;">No assets recorded</td></tr>'}
          <tr class="fv-total"><td colspan="3">Total</td><td></td><td>${fmtMoney(totalAssets)}</td><td>Countable: ${fmtMoney(countable)}</td></tr>
        </table>`)}

      ${section(`Income — Total: ${fmtMoney(totalIncome)}/month`, `
        <table class="fv-table">
          <tr><th>Person</th><th>Type</th><th>Payer</th><th>Amount</th><th>Frequency</th><th>Monthly</th></tr>
          ${income.map(i => `<tr>
            <td>${esc(i.person)}</td>
            <td>${INCOME_LABELS[i.income_type]||esc(i.income_type)}</td>
            <td>${esc(i.payer||'')}</td>
            <td>${fmtMoney(i.amount)}</td>
            <td>${esc(i.frequency)}</td>
            <td>${fmtMoney((parseFloat(i.amount)||0)*(FREQ_FACTORS[i.frequency]||1))}</td>
          </tr>`).join('') || '<tr><td colspan="6" style="color:#999;">No income recorded</td></tr>'}
          <tr class="fv-total"><td colspan="5">Total monthly income</td><td>${fmtMoney(totalIncome)}</td></tr>
        </table>`)}

      ${section(`Transfers (${app.state ? (getStateData(app.state)?.lookback||60) : 60}-month lookback)${totalUV > 0 ? ' — ⚠ Uncompensated: '+fmtMoney(totalUV) : ''}`, `
        ${transfers.length ? transfers.map((t,i) => `
          <div style="border:1px solid ${parseFloat(t.uncompensated_value)>0?'#e0a898':'var(--border)'};border-radius:8px;padding:14px;margin-bottom:10px;background:${parseFloat(t.uncompensated_value)>0?'#fff8f8':'#fff'};">
            <div style="font-weight:700;margin-bottom:8px;">Transfer ${i+1}: ${esc(t.asset_description||'(no description)')}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;font-size:0.875rem;">
              <div><span style="color:#666;">Date:</span> ${fmtDate(t.transfer_date)}</div>
              <div><span style="color:#666;">FMV:</span> ${fmtMoney(t.fair_market_value)}</div>
              <div><span style="color:#666;">Received:</span> ${fmtMoney(t.amount_received)}</div>
              <div><span style="color:#666;">Uncompensated:</span> <strong style="color:${parseFloat(t.uncompensated_value)>0?'#b50909':'inherit'}">${fmtMoney(t.uncompensated_value)}</strong></div>
              <div><span style="color:#666;">Recipient:</span> ${esc(t.recipient_name||'—')}</div>
              <div><span style="color:#666;">Relationship:</span> ${esc(t.recipient_relationship||'—')}</div>
            </div>
            ${t.notes ? `<div style="margin-top:8px;font-size:0.85rem;color:#666;">${esc(t.notes)}</div>` : ''}
          </div>`).join('') : '<p style="color:#999;">No transfers recorded</p>'}
      `)}

      ${section(`Documents (${docs.length} uploaded)`, `
        ${docs.length ? docs.map(d => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;">
            <div>
              <div style="font-weight:600;font-size:0.875rem;">${esc(d.file_name||d.storage_path)}</div>
              <div style="font-size:0.78rem;color:#666;">${esc(d.doc_type||'Document')} · ${fmtDate(d.uploaded_at)}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="downloadDocById('${esc(d.storage_path)}')">Download</button>
          </div>`).join('') : '<p style="color:#999;">No documents uploaded yet</p>'}
      `)}
    `, `Form view — ${appName}`);
  };

  /* Form view save handler */
  window.fvSave = async function(appId, fieldPath, value) {
    const [table, field] = fieldPath.split('.');
    const tableMap = { app: 'applications', appl: 'application_people', spou: 'application_people' };
    const tbl = tableMap[table];
    if (!tbl) return;

    if (table === 'app') {
      await sb.from('applications').update({ [field]: value || null, updated_at: new Date().toISOString() }).eq('id', appId);
    } else {
      const role = table === 'appl' ? 'applicant' : 'spouse';
      const { data: person } = await sb.from('application_people').select('id').eq('application_id', appId).eq('person_role', role).single();
      if (person) await sb.from('application_people').update({ [field]: value || null }).eq('id', person.id);
    }
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
    const { app, applicant, checklist, st } = await loadAppData(appId);
    const appName = applicant.first_name ? applicant.first_name + ' ' + (applicant.last_name||'') : 'Applicant';

    const CHECKLIST_INFO = {
      photo_id:               { label: 'Government photo ID', how: 'Driver\'s license, state ID card, or passport. Upload front and back.' },
      birth_certificate:      { label: 'Birth certificate or proof of age', how: 'Contact the vital records office of the state of birth, or the SSA at 1-800-772-1213.' },
      ss_award_letter:        { label: 'Social Security award/benefit letter', how: 'Available instantly at ssa.gov/myaccount, or call 1-800-772-1213 to request by mail.' },
      medicare_card:          { label: 'Medicare card', how: 'If lost, call 1-800-MEDICARE or print at medicare.gov.' },
      citizenship_proof:      { label: 'Proof of U.S. citizenship', how: 'Passport, birth certificate, or naturalization certificate.' },
      immigration_docs:       { label: 'Immigration documents', how: 'Green card, visa, or Employment Authorization Document.' },
      proof_of_residency:     { label: 'Proof of residence before nursing home', how: 'Lease, mortgage statement, utility bill, or bank statement showing home address.' },
      marriage_certificate:   { label: 'Marriage certificate', how: 'Contact the vital records office of the state or county where the marriage took place.' },
      divorce_or_death_cert:  { label: 'Divorce decree or death certificate (prior marriage)', how: 'Contact the county courthouse (divorce) or vital records office (death certificate).' },
      poa_document:           { label: 'Power of attorney or guardianship paperwork', how: 'The signed, notarized POA document or court guardianship order.' },
      nfloc_documentation:    { label: 'Nursing facility level of care documentation', how: 'Ask the facility social worker to provide the physician\'s NFLOC assessment.' },
      admission_records:      { label: 'Nursing home admission records and account statement', how: 'Request from the nursing home billing department.' },
      physician_letter:       { label: 'Letter or records from attending physician', how: 'Request from the attending physician\'s office.' },
      bank_checking_1:        { label: 'Checking account — 60 months of statements', how: 'Download from online banking as PDFs, or request from branch.' },
      bank_checking_2:        { label: 'Second checking account — 60 months of statements', how: 'Download from online banking as PDFs, or request from branch.' },
      bank_savings_1:         { label: 'Savings account — 60 months of statements', how: 'Download from online banking as PDFs, or request from branch.' },
      bank_cd_1:              { label: 'CD — statements', how: 'Most recent statement from the issuing bank, plus any statements from the past 60 months.' },
      investment_stmt_1:      { label: 'Investment/brokerage account — 60 months of statements', how: 'Download quarterly statements from brokerage portal or request from advisor.' },
      retirement_stmt_1:      { label: 'Retirement account — 60 months of statements', how: 'Download quarterly statements from account portal or request from plan administrator.' },
      closed_account_statements: { label: 'Closed account closing statements', how: 'Contact the bank to request a closing statement or account history showing zero balance.' },
      home_deed:              { label: 'Deed to primary home', how: 'Contact the county recorder\'s office — deeds are public records, usually available online.' },
      home_tax_statement:     { label: 'Property tax statement', how: 'Available from the county tax assessor or in the mail each year.' },
      home_insurance:         { label: 'Homeowner\'s insurance declarations page', how: 'Contact your insurance agent or download from the insurer\'s portal.' },
      other_re_deed:          { label: 'Deed to other real estate', how: 'Contact the county recorder\'s office where the property is located.' },
      vehicle_title_1:        { label: 'Vehicle title', how: 'Contact your state DMV if lost — a duplicate title can be ordered.' },
      vehicle_title_2:        { label: 'Second vehicle title', how: 'Contact your state DMV if lost.' },
      life_insurance_policy:  { label: 'Life insurance policy and cash surrender value statement', how: 'Contact the insurance company directly. Ask for the current cash surrender value statement.' },
      burial_contract:        { label: 'Prepaid funeral/burial contract', how: 'Contact the funeral home or burial society that issued the policy.' },
      trust_document:         { label: 'Trust document and Schedule A', how: 'Contact the attorney who drafted the trust, or the trustee.' },
      annuity_contract:       { label: 'Annuity contract', how: 'Contact the insurance company that issued the annuity.' },
      ltc_insurance_policy:   { label: 'Long-term care insurance policy', how: 'Contact the insurance company. Ask for current benefit status statement.' },
      pension_statement:      { label: 'Pension award letter or statement', how: 'Contact the pension administrator or former employer.' },
      va_award_letter:        { label: 'VA benefits award letter', how: 'Available at va.gov or by calling 1-800-827-1000.' },
      nh_trust_account:       { label: 'Nursing home trust/comfort account statement', how: 'Request from the nursing home business office.' },
      transfer_docs_1:        { label: 'Transfer documentation — gift #1', how: 'Cancelled check, bank statement showing withdrawal, deed, or gift letter.' },
      additional_transfer_docs: { label: 'Additional transfer documentation', how: 'Any evidence of additional transfers — bank statements, deeds, gift letters.' },
      promissory_note_1:      { label: 'Promissory note', how: 'The signed promissory note documenting the loan terms.' },
    };

    const done    = Object.entries(checklist).filter(([k,v]) => v === 'done');
    const missing = Object.entries(checklist).filter(([k,v]) => v !== 'done');

    const missingRows = missing.map(([k]) => {
      const info = CHECKLIST_INFO[k] || { label: k, how: '' };
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;width:40%;">
          <strong>${info.label}</strong>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:0.85rem;color:#444;">
          ${info.how}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;width:80px;text-align:center;">
          <div style="width:20px;height:20px;border:1.5px solid #999;border-radius:3px;margin:0 auto;"></div>
        </td>
      </tr>`;
    }).join('');

    const doneRows = done.map(([k]) => {
      const info = CHECKLIST_INFO[k] || { label: k, how: '' };
      return `<tr style="color:#2b5b33;">
        <td style="padding:8px 12px;border-bottom:1px solid #e8f0e8;" colspan="3">✅ ${info.label}</td>
      </tr>`;
    }).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Document Checklist — ${appName}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 14px; color: #222; max-width: 780px; margin: 0 auto; padding: 32px; }
        h1 { font-size: 1.4rem; margin-bottom: 4px; }
        .sub { color: #666; font-size: 0.85rem; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 10px 12px; background: #f0f0f0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 2px solid #ddd; }
        .section-header { font-size: 0.9rem; font-weight: 700; color: #1a4480; padding: 14px 0 6px; border-bottom: 2px solid #1a4480; margin: 20px 0 0; }
        @media print { body { padding: 16px; } }
      </style>
    </head><body>
      <h1>Document Checklist</h1>
      <div class="sub">
        Applicant: <strong>${esc(appName)}</strong> &nbsp;·&nbsp;
        State: <strong>${st ? esc(st.name) : '—'}</strong> &nbsp;·&nbsp;
        Date: <strong>${today()}</strong>
      </div>

      ${missing.length > 0 ? `
        <div class="section-header">Outstanding — ${missing.length} item${missing.length===1?'':'s'} needed</div>
        <table>
          <tr><th>Document</th><th>How to obtain</th><th>Got it?</th></tr>
          ${missingRows}
        </table>` : `<p style="color:#2b5b33;font-weight:700;">✅ All documents collected!</p>`}

      ${done.length > 0 ? `
        <div class="section-header">Already uploaded — ${done.length} item${done.length===1?'':'s'}</div>
        <table>${doneRows}</table>` : ''}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
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
