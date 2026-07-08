/* ==========================================================================
   ClearCare — Full Intake Form (intake.js)
   Multi-step form saving to Supabase at each step.
   Defines window.renderApplicationIntake(id) called from app.js.
   ========================================================================== */

(function () {

  /* ------------------------------------------------------------------------
     Local state for the current application session
  ------------------------------------------------------------------------ */
  let appId = null;
  let APP   = {};   // applications row
  let APPL  = {};   // application_people: applicant
  let SPOU  = {};   // application_people: spouse
  let ASSETS    = [];
  let INCOME    = [];
  let TRANSFERS = [];
  let currentStep = 0;

  const STEPS = [
    'Facility & state',
    'Applicant',
    'Medical',
    'Spouse',
    'Assets',
    'Income',
    'Transfers',
    'Packet'
  ];

  /* ------------------------------------------------------------------------
     Asset / income / transfer type lists
  ------------------------------------------------------------------------ */
  const ASSET_TYPES = [
    { v:'checking',         label:'Checking account' },
    { v:'savings',          label:'Savings account' },
    { v:'cd',               label:'Certificate of deposit (CD)' },
    { v:'brokerage',        label:'Brokerage / investment account' },
    { v:'retirement',       label:'IRA / 401(k) / retirement account' },
    { v:'life_insurance',   label:'Life insurance (whole/permanent — has cash value)' },
    { v:'primary_home',     label:'Primary residence' },
    { v:'other_real_estate',label:'Other real estate' },
    { v:'vehicle_primary',  label:'Primary vehicle (usually exempt)' },
    { v:'vehicle_add',      label:'Additional vehicle' },
    { v:'burial_fund',      label:'Burial fund / prepaid funeral (usually exempt)' },
    { v:'trust_irrev',      label:'Irrevocable trust' },
    { v:'trust_rev',        label:'Revocable trust (counts as an asset)' },
    { v:'annuity',          label:'Annuity' },
    { v:'business',         label:'Business interest' },
    { v:'other',            label:'Other asset' },
  ];

  const INCOME_TYPES = [
    { v:'ss_retirement',  label:'Social Security (retirement or survivor)' },
    { v:'ssdi',           label:'Social Security Disability (SSDI)' },
    { v:'ssi',            label:'Supplemental Security Income (SSI)' },
    { v:'pension',        label:'Pension / retirement plan distribution' },
    { v:'va',             label:'VA benefits' },
    { v:'wages',          label:'Wages / salary' },
    { v:'annuity',        label:'Annuity payments' },
    { v:'rental',         label:'Rental income' },
    { v:'alimony',        label:'Alimony received' },
    { v:'other',          label:'Other income' },
  ];

  const FREQS = [
    { v:'weekly',       label:'Per week',        f: 52/12 },
    { v:'biweekly',     label:'Every 2 weeks',   f: 26/12 },
    { v:'monthly',      label:'Per month',       f: 1 },
    { v:'yearly',       label:'Per year',        f: 1/12 },
  ];

  const TRANSFER_EXEMPTIONS = [
    { v:'spouse',           label:'Transfer to spouse or for spouse\'s sole benefit' },
    { v:'disabled_child',   label:'Transfer to a blind or permanently disabled child' },
    { v:'caretaker_child',  label:'Transfer of home to caretaker child (lived there 2+ years providing care)' },
    { v:'sibling',          label:'Transfer of home to sibling with equity interest (lived there 1+ year)' },
    { v:'fmv',              label:'Sold or transferred for full fair market value' },
    { v:'returned',         label:'Asset has been fully returned' },
    { v:'none',             label:'No exemption applies / unknown' },
  ];

  const ADL_OPTIONS = ['Independent', 'Needs assistance', 'Fully dependent'];

  /* ------------------------------------------------------------------------
     Helpers
  ------------------------------------------------------------------------ */
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function uid() { return Math.random().toString(36).slice(2,9); }
  function fmtMoney(n) {
    n = parseFloat(n) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function monthlyAmt(amt, freq) {
    const f = FREQS.find(x => x.v === freq);
    return (parseFloat(amt) || 0) * (f ? f.f : 1);
  }
  function totalMonthlyIncome() {
    return [...INCOME].reduce((sum, s) => sum + monthlyAmt(s.amount, s.frequency), 0);
  }
  function totalAssets() {
    return ASSETS.reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
  }
  function countableAssets() {
    return ASSETS.filter(a => !a.is_exempt).reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
  }
  function totalUncompensated() {
    return TRANSFERS.reduce((sum, t) => sum + (parseFloat(t.uncompensated_value) || 0), 0);
  }
  function visibleSteps() {
    if (APP.marital_status !== 'married') return STEPS.filter(s => s !== 'Spouse');
    return STEPS;
  }
  function stepIndex(label) { return visibleSteps().indexOf(label); }
  function currentLabel() { return visibleSteps()[currentStep]; }

  function stepIndicatorHTML() {
    const steps = visibleSteps();
    return `<div class="step-indicator">` + steps.map((label, i) => {
      const done   = i < currentStep;
      const active = i === currentStep;
      return `
        <div class="step-item">
          <div class="step-dot ${done?'done':active?'active':''}">${done?'✓':(i+1)}</div>
          <div class="step-label ${active?'active':''}">${esc(label)}</div>
        </div>
        ${i < steps.length-1 ? `<div class="step-connector ${done?'done':''}"></div>` : ''}`;
    }).join('') + `</div>`;
  }

  function selectOpts(list, val, valKey='v', labelKey='label') {
    return list.map(o =>
      `<option value="${esc(o[valKey])}" ${o[valKey]===val?'selected':''}>${esc(o[labelKey])}</option>`
    ).join('');
  }

  function saveMsg(id, msg, isErr) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'alert ' + (isErr ? 'alert-error' : 'alert-success');
    el.style.display = 'block';
    el.textContent = msg;
    if (!isErr) setTimeout(() => { if(el) el.style.display='none'; }, 2500);
  }

  /* ------------------------------------------------------------------------
     Load all data for an application
  ------------------------------------------------------------------------ */
  async function loadAll(id) {
    // Demo mode — load prefilled data from demo.js, no database calls
    if (id === 'demo' && window._demoData) {
      APP       = {...window._demoData.APP};
      APPL      = {...window._demoData.APPL};
      SPOU      = {...window._demoData.SPOU};
      ASSETS    = window._demoData.ASSETS.map(a => ({...a}));
      INCOME    = window._demoData.INCOME.map(i => ({...i}));
      TRANSFERS = window._demoData.TRANSFERS.map(t => ({...t}));
      return;
    }
    const [appRes, peopleRes, assetsRes, incRes, transRes] = await Promise.all([
      sb.from('applications').select('*').eq('id', id).single(),
      sb.from('application_people').select('*').eq('application_id', id),
      sb.from('assets').select('*').eq('application_id', id),
      sb.from('income_sources').select('*').eq('application_id', id),
      sb.from('transfers').select('*').eq('application_id', id).order('transfer_date', { ascending: false }),
    ]);
    APP       = appRes.data || {};
    APPL      = (peopleRes.data||[]).find(p => p.person_role === 'applicant') || {};
    SPOU      = (peopleRes.data||[]).find(p => p.person_role === 'spouse') || {};
    ASSETS    = (assetsRes.data||[]).map(a => ({...a, _id: a.id || uid()}));
    INCOME    = (incRes.data||[]).map(i => ({...i, _id: i.id || uid()}));
    TRANSFERS = (transRes.data||[]).map(t => ({...t, _id: t.id || uid()}));
    if (ASSETS.length === 0)    addAsset();
    if (INCOME.length === 0)    addIncome('applicant');
    if (TRANSFERS.length === 0) addTransfer();
  }

  function addAsset() {
    ASSETS.push({ _id: uid(), application_id: appId, owner: 'applicant', asset_type: 'checking', institution: '', account_last4: '', description: '', value: '', is_exempt: false, exempt_reason: '' });
  }
  function addIncome(person) {
    INCOME.push({ _id: uid(), application_id: appId, person: person||'applicant', income_type: 'ss_retirement', payer: '', amount: '', frequency: 'monthly' });
  }
  function addTransfer() {
    TRANSFERS.push({ _id: uid(), application_id: appId, transfer_date: '', asset_description: '', fair_market_value: '', amount_received: '', uncompensated_value: '', recipient_name: '', recipient_relationship: '', was_loan: false, has_promissory_note: false, was_for_care: false, has_care_agreement: false, was_returned: false, possible_exemption: 'none', needs_attorney_review: true, notes: '' });
  }

  function getFieldValues(prefix, fields) {
    const obj = {};
    fields.forEach(f => {
      const el = document.getElementById(prefix + f);
      if (!el) return;
      if (el.type === 'checkbox') obj[f] = el.checked;
      else obj[f] = el.value;
    });
    return obj;
  }

  /* ------------------------------------------------------------------------
     STEP 0 — Facility & state
  ------------------------------------------------------------------------ */
  function renderStep0() {
    const stateOpts = STATE_LIST.map(s =>
      `<option value="${s.code}" ${APP.state===s.code?'selected':''}>${esc(s.name)}</option>`
    ).join('');
    return `
      <div class="eyebrow">Step 1 of ${visibleSteps().length}</div>
      <h2>Facility & state</h2>
      <p class="text-faint text-sm" style="margin-bottom:24px;">Basic information about where the applicant is receiving care and which state's rules apply.</p>
      <div class="field-row col2">
        <div class="field">
          <label class="label" for="s0_state">State <span class="req">*</span> ${window.tip&&tip("state")||""}</label>
          <select id="s0_state">
            <option value="">Select a state…</option>
            ${stateOpts}
          </select>
        </div>
        <div class="field">
          <label class="label" for="s0_marital">Marital status <span class="req">*</span> ${window.tip&&tip("marital_status")||""}</label>
          <select id="s0_marital">
            <option value="">Select…</option>
            <option value="single" ${APP.marital_status==='single'?'selected':''}>Single / widowed / divorced</option>
            <option value="married" ${APP.marital_status==='married'?'selected':''}>Married</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="label" for="s0_facility">Nursing facility name ${window.tip&&tip("facility_name")||""}</label>
        <input type="text" id="s0_facility" value="${esc(APP.facility_name||'')}">
      </div>
      <div class="field-row col2">
        <div class="field">
          <label class="label" for="s0_admit">Admission date ${window.tip&&tip("facility_admission_date")||""}</label>
          <input type="date" id="s0_admit" value="${esc(APP.facility_admission_date||'')}">
        </div>
        <div class="field">
          <label class="label">Level of care documentation</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
            <input type="checkbox" id="s0_loc" ${APP.level_of_care_documented?'checked':''} style="width:20px;height:20px;accent-color:var(--navy);">
            <label for="s0_loc" style="font-size:0.9rem;">A physician has documented nursing facility level of care (NFLOC)</label>
          </div>
        </div>
      </div>
      <div id="s0msg" style="display:none;"></div>
      ${stateInfoBox()}
    `;
  }

  function stateInfoBox() {
    if (!APP.state) return '';
    const st = getStateData(APP.state);
    if (!st) return '';
    return `
      <div class="alert alert-info" style="margin-top:16px;">
        <strong>${esc(st.name)} — ${esc(st.programName)}</strong><br>
        Individual asset limit: <strong>${st.assetLimit != null ? '$'+st.assetLimit.toLocaleString() : 'See note'}</strong>
        ${st.assetNote ? ` <em>(${esc(st.assetNote)})</em>` : ''} &nbsp;·&nbsp;
        Income limit: <strong>${st.incomeLimit ? '$'+st.incomeLimit.toLocaleString()+'/mo' : 'No hard cap'}</strong>
        ${st.incomeNote ? ` <em>(${esc(st.incomeNote)})</em>` : ''} &nbsp;·&nbsp;
        Lookback: <strong>${st.lookback} months</strong>
        ${st.lookbackNote ? ` <em>(${esc(st.lookbackNote)})</em>` : ''}<br>
        CSRA: <strong>up to $${st.csra.toLocaleString()}</strong> &nbsp;·&nbsp;
        Personal needs allowance: <strong>$${st.pna}/mo</strong><br>
        Agency: <a href="${esc(st.agencyUrl)}" target="_blank" rel="noopener">${esc(st.agencyName)}</a> · ${esc(st.agencyPhone)}
      </div>`;
  }

  async function saveStep0() {
    if (appId === 'demo') { APP.state = document.getElementById('s0_state').value; APP.marital_status = document.getElementById('s0_marital').value; return true; }
    const state    = document.getElementById('s0_state').value;
    const marital  = document.getElementById('s0_marital').value;
    const facility = document.getElementById('s0_facility').value.trim();
    const admit    = document.getElementById('s0_admit').value;
    const loc      = document.getElementById('s0_loc').checked;
    if (!state || !marital) { saveMsg('s0msg','Please select a state and marital status.',true); return false; }
    const { error } = await sb.from('applications').update({
      state, marital_status: marital, facility_name: facility,
      facility_admission_date: admit || null, level_of_care_documented: loc, updated_at: new Date().toISOString()
    }).eq('id', appId);
    if (error) { saveMsg('s0msg', error.message, true); return false; }
    APP.state = state; APP.marital_status = marital; APP.facility_name = facility;
    APP.facility_admission_date = admit; APP.level_of_care_documented = loc;
    return true;
  }

  /* ------------------------------------------------------------------------
     STEP 1 — Applicant personal info
  ------------------------------------------------------------------------ */
  function personFields(prefix, p, label) {
    return `
      <div class="field-row col2">
        <div class="field"><label class="label">First name <span class="req">*</span></label><input type="text" id="${prefix}_first" value="${esc(p.first_name||'')}"></div>
        <div class="field"><label class="label">Last name <span class="req">*</span></label><input type="text" id="${prefix}_last" value="${esc(p.last_name||'')}"></div>
      </div>
      <div class="field-row col3">
        <div class="field"><label class="label">Middle name</label><input type="text" id="${prefix}_mid" value="${esc(p.middle_name||'')}"></div>
        <div class="field"><label class="label">Date of birth <span class="req">*</span></label><input type="date" id="${prefix}_dob" value="${esc(p.dob||'')}"></div>
        <div class="field"><label class="label">Sex</label>
          <select id="${prefix}_sex">
            <option value="">—</option>
            <option value="M" ${p.sex==='M'?'selected':''}>Male</option>
            <option value="F" ${p.sex==='F'?'selected':''}>Female</option>
          </select>
        </div>
      </div>
      <div class="field-row col2">
        <div class="field"><label class="label">SSN — last 4 digits only</label><input type="text" id="${prefix}_ssn4" maxlength="4" placeholder="••••" value="${esc(p.ssn_last4||'')}"><div class="hint">Full SSN is never stored. Provide it only on the official state form.</div></div>
        <div class="field"><label class="label">U.S. citizen or national?</label>
          <select id="${prefix}_citizen">
            <option value="">—</option>
            <option value="true" ${p.citizen===true?'selected':''}>Yes</option>
            <option value="false" ${p.citizen===false?'selected':''}>No</option>
          </select>
        </div>
      </div>
      <div class="field-row col2">
        <div class="field"><label class="label">Phone</label><input type="tel" id="${prefix}_phone" value="${esc(p.phone||'')}"></div>
        <div class="field"><label class="label">Email</label><input type="email" id="${prefix}_email" value="${esc(p.email||'')}"></div>
      </div>
      <div class="field"><label class="label">Street address</label><input type="text" id="${prefix}_addr1" value="${esc(p.address1||'')}"></div>
      <div class="field-row col3">
        <div class="field"><label class="label">City</label><input type="text" id="${prefix}_city" value="${esc(p.city||'')}"></div>
        <div class="field"><label class="label">State</label><input type="text" id="${prefix}_st" value="${esc(p.state||'')}"></div>
        <div class="field"><label class="label">ZIP</label><input type="text" id="${prefix}_zip" value="${esc(p.zip||'')}"></div>
      </div>
      <div class="field-row col2">
        <div class="field"><label class="label">Medicare number</label><input type="text" id="${prefix}_medicare" value="${esc(p.medicare_number||'')}"></div>
        <div class="field"><label class="label">Medicaid number (if already enrolled)</label><input type="text" id="${prefix}_medicaid" value="${esc(p.medicaid_number||'')}"></div>
      </div>`;
  }

  function renderStep1() {
    return `
      <div class="eyebrow">Step 2 of ${visibleSteps().length}</div>
      <h2>Applicant information</h2>
      <p class="text-faint text-sm" style="margin-bottom:24px;">Personal and contact details for the person applying for Medicaid.</p>
      ${personFields('a', APPL, 'Applicant')}
      <div id="s1msg" style="display:none;"></div>`;
  }

  async function saveStep1() {
    if (appId === 'demo') { return true; }
    const data = {
      application_id: appId, person_role: 'applicant',
      first_name: document.getElementById('a_first').value.trim(),
      last_name: document.getElementById('a_last').value.trim(),
      middle_name: document.getElementById('a_mid').value.trim(),
      dob: document.getElementById('a_dob').value || null,
      sex: document.getElementById('a_sex').value,
      ssn_last4: document.getElementById('a_ssn4').value.trim(),
      citizen: document.getElementById('a_citizen').value === 'true' ? true : document.getElementById('a_citizen').value === 'false' ? false : null,
      phone: document.getElementById('a_phone').value.trim(),
      email: document.getElementById('a_email').value.trim(),
      address1: document.getElementById('a_addr1').value.trim(),
      city: document.getElementById('a_city').value.trim(),
      state: document.getElementById('a_st').value.trim(),
      zip: document.getElementById('a_zip').value.trim(),
      medicare_number: document.getElementById('a_medicare').value.trim(),
      medicaid_number: document.getElementById('a_medicaid').value.trim(),
    };
    if (!data.first_name || !data.last_name) { saveMsg('s1msg','First and last name are required.',true); return false; }
    const { data: saved, error } = await sb.from('application_people')
      .upsert(APPL.id ? {...data, id: APPL.id} : data, { onConflict: 'id' })
      .select().single();
    if (error) { saveMsg('s1msg', error.message, true); return false; }
    APPL = saved;
    return true;
  }

  /* ------------------------------------------------------------------------
     STEP 2 — Medical / ADLs
  ------------------------------------------------------------------------ */
  function adlRow(prefix, field, label, val, tipKey) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--border);gap:16px;">
      <span style="font-size:1rem;font-weight:600;flex:1;">${esc(label)} ${window.tip&&tipKey?tip(tipKey):''}</span>
      <select id="${prefix}_adl_${field}" style="width:230px;font-size:1rem;padding:9px 12px;">
        <option value="">Not answered</option>
        ${ADL_OPTIONS.map(o=>`<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('')}
      </select>
    </div>`;
  }

  function renderStep2() {
    const p = APPL;
    return `
      <div class="eyebrow">Step 3 of ${visibleSteps().length}</div>
      <h2>Medical information</h2>
      <p class="text-faint text-sm" style="margin-bottom:24px;">Medical eligibility requires the applicant to need assistance with at least 2 activities of daily living (ADLs).</p>
      <div class="field-row col2">
        <div class="field"><label class="label">Attending physician ${window.tip&&tip("m_phys")||""}</label><input type="text" id="m_phys" value="${esc(p.attending_physician||'')}"></div>
        <div class="field"><label class="label">Physician phone</label><input type="tel" id="m_physph" value="${esc(p.physician_phone||'')}"></div>
      </div>
      <div class="field"><label class="label">Primary diagnosis ${window.tip&&tip("m_diag")||""}</label><input type="text" id="m_diag" value="${esc(p.primary_diagnosis||'')}" placeholder="e.g. Alzheimer's disease, stroke, hip fracture"></div>
      <div style="margin-top:20px;margin-bottom:8px;font-weight:700;">Activities of Daily Living (ADLs) ${window.tip&&tip("adl")||""}</div>
      <div class="alert alert-info" style="margin-bottom:12px;">Rate each activity. Nursing facility level of care typically requires assistance with 2 or more.</div>
      ${adlRow('m','bathing','Bathing',p.adl_bathing,'adl_bathing')}
      ${adlRow('m','dressing','Dressing',p.adl_dressing,'adl_dressing')}
      ${adlRow('m','eating','Eating',p.adl_eating,'adl_eating')}
      ${adlRow('m','transferring','Transferring (bed to chair, etc.)',p.adl_transferring,'adl_transferring')}
      ${adlRow('m','toileting','Toileting',p.adl_toileting,'adl_toileting')}
      ${adlRow('m','continence','Continence',p.adl_continence,'adl_continence')}
      <div id="s2msg" style="display:none;margin-top:12px;"></div>`;
  }

  async function saveStep2() {
    if (appId === 'demo') { return true; }
    const data = {
      attending_physician: document.getElementById('m_phys').value.trim(),
      physician_phone: document.getElementById('m_physph').value.trim(),
      primary_diagnosis: document.getElementById('m_diag').value.trim(),
      adl_bathing: document.getElementById('m_adl_bathing').value,
      adl_dressing: document.getElementById('m_adl_dressing').value,
      adl_eating: document.getElementById('m_adl_eating').value,
      adl_transferring: document.getElementById('m_adl_transferring').value,
      adl_toileting: document.getElementById('m_adl_toileting').value,
      adl_continence: document.getElementById('m_adl_continence').value,
    };
    if (!APPL.id) { saveMsg('s2msg','Please complete applicant info first.',true); return false; }
    const { error } = await sb.from('application_people').update(data).eq('id', APPL.id);
    if (error) { saveMsg('s2msg', error.message, true); return false; }
    Object.assign(APPL, data);
    return true;
  }

  /* ------------------------------------------------------------------------
     STEP 3 — Spouse (only if married)
  ------------------------------------------------------------------------ */
  function renderStep3() {
    return `
      <div class="eyebrow">Step ${stepIndex('Spouse')+1} of ${visibleSteps().length}</div>
      <h2>Spouse / community spouse information</h2>
      <p class="text-faint text-sm" style="margin-bottom:16px;">The community spouse (the one not in the nursing home) is entitled to keep assets up to the Community Spouse Resource Allowance and a monthly income allowance.</p>
      <div class="alert alert-info" style="margin-bottom:20px;">
        For <strong>${APP.state ? esc(getStateData(APP.state)?.name||APP.state) : 'your state'}</strong>: 
        CSRA up to <strong>$${(getStateData(APP.state)?.csra||162660).toLocaleString()}</strong> ${window.tip&&tip("csra")||""} &nbsp;·&nbsp; 
        Monthly Maintenance Needs Allowance up to <strong>$${(getStateData(APP.state)?.mmmna||4066.50).toLocaleString()}/mo</strong> ${window.tip&&tip("mmmna")||""}
      </div>
      ${personFields('sp', SPOU, 'Spouse')}
      <div id="s3msg" style="display:none;"></div>`;
  }

  async function saveStep3() {
    if (appId === 'demo') { return true; }
    const data = {
      application_id: appId, person_role: 'spouse',
      first_name: document.getElementById('sp_first').value.trim(),
      last_name: document.getElementById('sp_last').value.trim(),
      middle_name: document.getElementById('sp_mid').value.trim(),
      dob: document.getElementById('sp_dob').value || null,
      sex: document.getElementById('sp_sex').value,
      ssn_last4: document.getElementById('sp_ssn4').value.trim(),
      citizen: document.getElementById('sp_citizen').value === 'true' ? true : document.getElementById('sp_citizen').value === 'false' ? false : null,
      phone: document.getElementById('sp_phone').value.trim(),
      email: document.getElementById('sp_email').value.trim(),
      address1: document.getElementById('sp_addr1').value.trim(),
      city: document.getElementById('sp_city').value.trim(),
      state: document.getElementById('sp_st').value.trim(),
      zip: document.getElementById('sp_zip').value.trim(),
      medicare_number: document.getElementById('sp_medicare').value.trim(),
      medicaid_number: document.getElementById('sp_medicaid').value.trim(),
    };
    if (!data.first_name) { saveMsg('s3msg','Please enter the spouse\'s first name.',true); return false; }
    const { data: saved, error } = await sb.from('application_people')
      .upsert(SPOU.id ? {...data, id: SPOU.id} : data, { onConflict: 'id' })
      .select().single();
    if (error) { saveMsg('s3msg', error.message, true); return false; }
    SPOU = saved;
    return true;
  }

  /* ------------------------------------------------------------------------
     STEP 4 — Assets
  ------------------------------------------------------------------------ */
  function renderAssetRow(a, i) {
    const typeOpts = selectOpts(ASSET_TYPES, a.asset_type);
    const ownerOpts = `
      <option value="applicant" ${a.owner==='applicant'?'selected':''}>Applicant</option>
      ${APP.marital_status==='married'?`<option value="spouse" ${a.owner==='spouse'?'selected':''}>Spouse</option><option value="joint" ${a.owner==='joint'?'selected':''}>Joint</option>`:''}`;
    return `
      <div class="card" style="margin-bottom:16px;padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <strong style="font-size:1rem;">Asset ${i+1}</strong>
          <button class="btn btn-danger btn-sm" onclick="removeAsset('${a._id}')">Remove</button>
        </div>

        <div class="field-row col2" style="margin-bottom:0;">
          <div class="field">
            <label class="label">Asset type ${window.tip&&tip("asset_type")||""}</label>
            <select id="ast_type_${a._id}" onchange="updateAssetField('${a._id}','asset_type',this.value)">${typeOpts}</select>
          </div>
          <div class="field">
            <label class="label">Owner ${window.tip&&tip("asset_owner")||""}</label>
            <select id="ast_own_${a._id}" onchange="updateAssetField('${a._id}','owner',this.value)">${ownerOpts}</select>
          </div>
        </div>

        <div class="field-row col2" style="margin-bottom:0;">
          <div class="field">
            <label class="label">Bank or institution ${window.tip&&tip("asset_institution")||""}</label>
            <input type="text" id="ast_inst_${a._id}" value="${esc(a.institution||a.description||'')}" oninput="updateAssetField('${a._id}','institution',this.value)" placeholder="e.g. First National Bank">
          </div>
          <div class="field">
            <label class="label">Account last 4 digits ${window.tip&&tip("asset_account_last4")||""}</label>
            <input type="text" id="ast_acct_${a._id}" maxlength="4" value="${esc(a.account_last4||'')}" oninput="updateAssetField('${a._id}','account_last4',this.value)" placeholder="e.g. 3821">
          </div>
        </div>

        <div class="field">
          <label class="label">Current value ${window.tip&&tip("asset_value")||""}</label>
          <input type="number" id="ast_val_${a._id}" min="0" step="0.01" value="${a.value||''}" oninput="updateAssetField('${a._id}','value',this.value);refreshAssetTotal()" placeholder="0.00" style="max-width:240px;">
        </div>

        <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:#f8f9fa;border-radius:8px;margin-top:4px;">
          <input type="checkbox" id="ast_ex_${a._id}" ${a.is_exempt?'checked':''} onchange="updateAssetField('${a._id}','is_exempt',this.checked)" style="width:22px;height:22px;accent-color:var(--navy);flex-shrink:0;margin-top:2px;">
          <div style="flex:1;">
            <label for="ast_ex_${a._id}" style="font-size:1rem;font-weight:600;cursor:pointer;">
              This asset is exempt ${window.tip&&tip("asset_is_exempt")||""}
            </label>
            <div style="font-size:0.85rem;color:var(--ink-faint);margin-top:3px;">Does not count toward the Medicaid asset limit</div>
            <input type="text" id="ast_exr_${a._id}" placeholder="Reason — e.g. primary residence, one vehicle" value="${esc(a.exempt_reason||'')}" oninput="updateAssetField('${a._id}','exempt_reason',this.value)" style="margin-top:10px;font-size:0.9rem;">
          </div>
        </div>
      </div>`;
  }

  
  function renderStep4() {
    const st = APP.state ? getStateData(APP.state) : null;
    return `
      <div class="eyebrow">Step ${stepIndex('Assets')+1} of ${visibleSteps().length}</div>
      <h2>Asset inventory</h2>
      <p class="text-faint text-sm" style="margin-bottom:12px;">List every asset — bank accounts, property, investments, insurance, vehicles, trusts, and anything else. Check the exempt box for assets that don't count toward the limit.</p>
      ${st ? `<div class="alert alert-info" style="margin-bottom:16px;">
        <strong>${esc(st.name)}</strong> — individual asset limit: <strong>${st.assetLimit != null ? '$'+st.assetLimit.toLocaleString() : 'See note'}</strong>
        ${st.assetNote ? ` · ${esc(st.assetNote)}` : ''}
        ${APP.marital_status==='married' ? ` · CSRA: <strong>up to $${st.csra.toLocaleString()}</strong>` : ''}
      </div>` : ''}
      <div id="assetRows">${ASSETS.map((a,i)=>renderAssetRow(a,i)).join('')}</div>
      <button class="btn btn-secondary btn-sm" onclick="addAssetClick()" style="margin-bottom:16px;">+ Add another asset</button>
      <div style="background:var(--navy-light);border-radius:8px;padding:14px 16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <span style="font-size:0.9rem;">Total assets: <strong id="totalAssets">${fmtMoney(totalAssets())}</strong></span>
        <span style="font-size:0.9rem;">Countable (non-exempt): <strong id="countableAssets">${fmtMoney(countableAssets())}</strong></span>
      </div>
      <div id="s4msg" style="display:none;margin-top:12px;"></div>`;
  }

  window.updateAssetField = function(id, field, val) {
    const a = ASSETS.find(x => x._id === id);
    if (a) a[field] = val;
  };
  window.refreshAssetTotal = function() {
    const t = document.getElementById('totalAssets');
    const c = document.getElementById('countableAssets');
    if (t) t.textContent = fmtMoney(totalAssets());
    if (c) c.textContent = fmtMoney(countableAssets());
  };
  window.addAssetClick = function() {
    addAsset();
    const container = document.getElementById('assetRows');
    if (container) {
      const a = ASSETS[ASSETS.length-1];
      const div = document.createElement('div');
      div.innerHTML = renderAssetRow(a, ASSETS.length-1);
      container.appendChild(div.firstElementChild);
    }
  };
  window.removeAsset = function(id) {
    ASSETS = ASSETS.filter(a => a._id !== id);
    const container = document.getElementById('assetRows');
    if (container) container.innerHTML = ASSETS.map((a,i) => renderAssetRow(a,i)).join('');
    window.refreshAssetTotal();
  };

  async function saveStep4() {
    if (appId === 'demo') { return true; }
    const { error: delErr } = await sb.from('assets').delete().eq('application_id', appId);
    if (delErr) { saveMsg('s4msg', delErr.message, true); return false; }
    if (ASSETS.length > 0) {
      const rows = ASSETS.map(a => ({
        application_id: appId, owner: a.owner, asset_type: a.asset_type,
        institution: a.institution, account_last4: a.account_last4,
        description: a.institution, value: parseFloat(a.value)||0,
        is_exempt: !!a.is_exempt, exempt_reason: a.exempt_reason
      }));
      const { error } = await sb.from('assets').insert(rows);
      if (error) { saveMsg('s4msg', error.message, true); return false; }
    }
    return true;
  }

  /* ------------------------------------------------------------------------
     STEP 5 — Income
  ------------------------------------------------------------------------ */
  function renderIncomeRow(s, i) {
    const typeOpts = selectOpts(INCOME_TYPES, s.income_type);
    const freqOpts = selectOpts(FREQS, s.frequency, 'v', 'label');
    const personOpts = `
      <option value="applicant" ${s.person==='applicant'?'selected':''}>Applicant</option>
      ${APP.marital_status==='married'?`<option value="spouse" ${s.person==='spouse'?'selected':''}>Spouse</option>`:''}`;
    return `
      <div class="card" style="margin-bottom:12px;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <strong style="font-size:0.9rem;">Income source ${i+1}</strong>
          <button class="btn btn-danger btn-sm" onclick="removeIncome('${s._id}')">Remove</button>
        </div>
        <div class="field-row col2">
          <div class="field"><label class="label">Type ${window.tip&&tip("income_type")||""}</label>
            <select id="inc_type_${s._id}" onchange="updateIncomeField('${s._id}','income_type',this.value)">${typeOpts}</select>
          </div>
          <div class="field"><label class="label">Person ${window.tip&&tip("income_person")||""}</label>
            <select id="inc_per_${s._id}" onchange="updateIncomeField('${s._id}','person',this.value)">${personOpts}</select>
          </div>
        </div>
        <div class="field-row col3">
          <div class="field"><label class="label">Payer / source ${window.tip&&tip("income_payer")||""}</label><input type="text" id="inc_pay_${s._id}" value="${esc(s.payer||'')}" oninput="updateIncomeField('${s._id}','payer',this.value)" placeholder="e.g. Social Security Administration"></div>
          <div class="field"><label class="label">Amount ${window.tip&&tip("income_amount")||""}</label><input type="number" id="inc_amt_${s._id}" min="0" step="0.01" value="${s.amount||''}" oninput="updateIncomeField('${s._id}','amount',this.value);refreshIncomeTotal()"></div>
          <div class="field"><label class="label">Frequency ${window.tip&&tip("income_frequency")||""}</label>
            <select id="inc_frq_${s._id}" onchange="updateIncomeField('${s._id}','frequency',this.value);refreshIncomeTotal()">${freqOpts}</select>
          </div>
        </div>
      </div>`;
  }

  function renderStep5() {
    const st = APP.state ? getStateData(APP.state) : null;
    return `
      <div class="eyebrow">Step ${stepIndex('Income')+1} of ${visibleSteps().length}</div>
      <h2>Income sources</h2>
      <p class="text-faint text-sm" style="margin-bottom:12px;">List all income for the applicant${APP.marital_status==='married'?' and spouse':''}. Once approved, nearly all income (except the personal needs allowance of $${st?.pna||50}/mo) goes toward the nursing home cost.</p>
      ${st ? `<div class="alert alert-info" style="margin-bottom:16px;"><strong>${esc(st.name)}</strong> — income limit: <strong>${st.incomeLimit ? '$'+st.incomeLimit.toLocaleString()+'/mo' : 'No hard cap'}</strong>${st.incomeNote?' · '+esc(st.incomeNote):''} · Income type: <strong>${st.incomeType==='cap'?'Income cap state (Miller Trust may be needed if over limit)':'Medically needy / spend-down'}</strong></div>` : ''}
      <div id="incomeRows">${INCOME.map((s,i)=>renderIncomeRow(s,i)).join('')}</div>
      <button class="btn btn-secondary btn-sm" onclick="addIncomeClick()" style="margin-bottom:16px;">+ Add income source</button>
      <div style="background:var(--navy-light);border-radius:8px;padding:14px 16px;">
        Total monthly income: <strong id="totalIncome">${fmtMoney(totalMonthlyIncome())}</strong>
      </div>
      <div id="s5msg" style="display:none;margin-top:12px;"></div>`;
  }

  window.updateIncomeField = function(id, field, val) {
    const s = INCOME.find(x => x._id === id);
    if (s) s[field] = val;
  };
  window.refreshIncomeTotal = function() {
    const el = document.getElementById('totalIncome');
    if (el) el.textContent = fmtMoney(totalMonthlyIncome());
  };
  window.addIncomeClick = function() {
    addIncome('applicant');
    const container = document.getElementById('incomeRows');
    if (container) {
      const s = INCOME[INCOME.length-1];
      const div = document.createElement('div');
      div.innerHTML = renderIncomeRow(s, INCOME.length-1);
      container.appendChild(div.firstElementChild);
    }
  };
  window.removeIncome = function(id) {
    INCOME = INCOME.filter(s => s._id !== id);
    const container = document.getElementById('incomeRows');
    if (container) container.innerHTML = INCOME.map((s,i) => renderIncomeRow(s,i)).join('');
    window.refreshIncomeTotal();
  };

  async function saveStep5() {
    if (appId === 'demo') { return true; }
    const { error: delErr } = await sb.from('income_sources').delete().eq('application_id', appId);
    if (delErr) { saveMsg('s5msg', delErr.message, true); return false; }
    if (INCOME.length > 0) {
      const rows = INCOME.map(s => ({
        application_id: appId, person: s.person, income_type: s.income_type,
        payer: s.payer, amount: parseFloat(s.amount)||0, frequency: s.frequency
      }));
      const { error } = await sb.from('income_sources').insert(rows);
      if (error) { saveMsg('s5msg', error.message, true); return false; }
    }
    return true;
  }

  /* ------------------------------------------------------------------------
     STEP 6 — Transfers / lookback
  ------------------------------------------------------------------------ */
  function renderTransferRow(t, i) {
    const exOpts = selectOpts(TRANSFER_EXEMPTIONS, t.possible_exemption);
    const uv = (parseFloat(t.fair_market_value)||0) - (parseFloat(t.amount_received)||0);
    return `
      <div class="card" style="margin-bottom:16px;padding:20px;border-left:4px solid ${uv>0?'#b50909':'var(--border)'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <strong style="font-size:0.9rem;">Transfer ${i+1}${uv>0?' — ⚠ Uncompensated value: '+fmtMoney(uv):''}</strong>
          <button class="btn btn-danger btn-sm" onclick="removeTransfer('${t._id}')">Remove</button>
        </div>
        <div class="field-row col2">
          <div class="field"><label class="label">Date of transfer <span class="req">*</span> ${window.tip&&tip("transfer_date")||""}</label><input type="date" id="tr_date_${t._id}" value="${esc(t.transfer_date||'')}" oninput="updateTransferField('${t._id}','transfer_date',this.value)"></div>
          <div class="field"><label class="label">What was transferred <span class="req">*</span> ${window.tip&&tip("transfer_description")||""}</label><input type="text" id="tr_desc_${t._id}" value="${esc(t.asset_description||'')}" oninput="updateTransferField('${t._id}','asset_description',this.value)" placeholder="e.g. Cash gift, home at 123 Main St"></div>
        </div>
        <div class="field-row col3">
          <div class="field"><label class="label">Fair market value at time of transfer ${window.tip&&tip("transfer_fmv")||""}</label><input type="number" id="tr_fmv_${t._id}" min="0" step="0.01" value="${t.fair_market_value||''}" oninput="updateTransferCalc('${t._id}')"></div>
          <div class="field"><label class="label">Amount actually received ${window.tip&&tip("transfer_received")||""}</label><input type="number" id="tr_rcv_${t._id}" min="0" step="0.01" value="${t.amount_received||''}" oninput="updateTransferCalc('${t._id}')"></div>
          <div class="field"><label class="label">Uncompensated value ${window.tip&&tip("transfer_uncompensated")||""}</label><input type="number" id="tr_uv_${t._id}" readonly value="${uv>0?uv:''}" style="background:#f5f5f5;"></div>
        </div>
        <div class="field-row col2">
          <div class="field"><label class="label">Recipient name ${window.tip&&tip("transfer_recipient")||""}</label><input type="text" id="tr_rn_${t._id}" value="${esc(t.recipient_name||'')}" oninput="updateTransferField('${t._id}','recipient_name',this.value)"></div>
          <div class="field"><label class="label">Relationship to applicant</label><input type="text" id="tr_rr_${t._id}" value="${esc(t.recipient_relationship||'')}" oninput="updateTransferField('${t._id}','recipient_relationship',this.value)" placeholder="e.g. Adult daughter"></div>
        </div>
        <div class="field"><label class="label">Possible exemption ${window.tip&&tip("transfer_exemption")||""}</label><select id="tr_ex_${t._id}" onchange="updateTransferField('${t._id}','possible_exemption',this.value)">${exOpts}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;"><input type="checkbox" id="tr_loan_${t._id}" ${t.was_loan?'checked':''} onchange="updateTransferField('${t._id}','was_loan',this.checked)" style="accent-color:var(--navy);width:16px;height:16px;"> This was a loan (not a gift)</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;"><input type="checkbox" id="tr_pn_${t._id}" ${t.has_promissory_note?'checked':''} onchange="updateTransferField('${t._id}','has_promissory_note',this.checked)" style="accent-color:var(--navy);width:16px;height:16px;"> Has a signed promissory note</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;"><input type="checkbox" id="tr_care_${t._id}" ${t.was_for_care?'checked':''} onchange="updateTransferField('${t._id}','was_for_care',this.checked)" style="accent-color:var(--navy);width:16px;height:16px;"> Transfer was payment for care provided</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;"><input type="checkbox" id="tr_ca_${t._id}" ${t.has_care_agreement?'checked':''} onchange="updateTransferField('${t._id}','has_care_agreement',this.checked)" style="accent-color:var(--navy);width:16px;height:16px;"> Has a written care agreement</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;"><input type="checkbox" id="tr_ret_${t._id}" ${t.was_returned?'checked':''} onchange="updateTransferField('${t._id}','was_returned',this.checked)" style="accent-color:var(--navy);width:16px;height:16px;"> Asset has been fully returned</label>
        </div>
        <div class="field" style="margin-top:12px;"><label class="label">Notes ${window.tip&&tip("attorney_review")||""}</label><textarea id="tr_notes_${t._id}" rows="2" style="font-size:0.875rem;" oninput="updateTransferField('${t._id}','notes',this.value)">${esc(t.notes||'')}</textarea></div>
      </div>`;
  }

  function renderStep6() {
    const st = APP.state ? getStateData(APP.state) : null;
    const totalUV = totalUncompensated();
    const penDiv = st?.penaltyDivisor;
    const penMonths = penDiv && totalUV > 0 ? (totalUV / penDiv).toFixed(1) : null;
    return `
      <div class="eyebrow">Step ${stepIndex('Transfers')+1} of ${visibleSteps().length}</div>
      <h2>5-year lookback — asset transfers</h2>
      <div class="alert alert-warn" style="margin-bottom:16px;">
        <strong>This section is mandatory.</strong> Medicaid reviews every transfer, gift, or below-market sale made in the ${st?.lookback||60} months before the application date. Failure to disclose transfers can result in denial. The IRS gift tax exemption ($19,000/recipient in 2026) has <strong>no bearing</strong> on Medicaid rules — every dollar given away within the lookback window is reviewable.
        ${window.tip&&tip("transfer_intro")||""}
      </div>
      ${st && penDiv ? `<div class="alert alert-info" style="margin-bottom:16px;"><strong>${esc(st.name)}</strong> penalty divisor: <strong>${fmtMoney(penDiv)}/month</strong>${st.penaltyNote?' · '+esc(st.penaltyNote):''}</div>` : ''}
      ${totalUV > 0 ? `<div class="alert alert-error" style="margin-bottom:16px;">
        Total uncompensated transfers: <strong>${fmtMoney(totalUV)}</strong>
        ${penMonths ? ` · Estimated penalty period: <strong>~${penMonths} months</strong> (estimate only — consult an elder law attorney)` : ''}
      </div>` : ''}
      <p class="text-faint text-sm" style="margin-bottom:16px;">Add every transfer — even small ones. If there were no transfers in the past ${st?.lookback||60} months, keep the one row below and leave it blank.</p>
      <div id="transferRows">${TRANSFERS.map((t,i)=>renderTransferRow(t,i)).join('')}</div>
      <button class="btn btn-secondary btn-sm" onclick="addTransferClick()" style="margin-bottom:16px;">+ Add another transfer</button>
      <div id="s6msg" style="display:none;"></div>`;
  }

  window.updateTransferField = function(id, field, val) {
    const t = TRANSFERS.find(x => x._id === id);
    if (t) t[field] = val;
  };
  window.updateTransferCalc = function(id) {
    const t = TRANSFERS.find(x => x._id === id);
    if (!t) return;
    const fmv = parseFloat(document.getElementById('tr_fmv_'+id)?.value)||0;
    const rcv = parseFloat(document.getElementById('tr_rcv_'+id)?.value)||0;
    t.fair_market_value = fmv; t.amount_received = rcv;
    const uv = Math.max(0, fmv - rcv);
    t.uncompensated_value = uv;
    const uvEl = document.getElementById('tr_uv_'+id);
    if (uvEl) uvEl.value = uv > 0 ? uv : '';
  };
  window.addTransferClick = function() {
    addTransfer();
    const container = document.getElementById('transferRows');
    if (container) {
      const t = TRANSFERS[TRANSFERS.length-1];
      const div = document.createElement('div');
      div.innerHTML = renderTransferRow(t, TRANSFERS.length-1);
      container.appendChild(div.firstElementChild);
    }
  };
  window.removeTransfer = function(id) {
    TRANSFERS = TRANSFERS.filter(t => t._id !== id);
    const container = document.getElementById('transferRows');
    if (container) container.innerHTML = TRANSFERS.map((t,i) => renderTransferRow(t,i)).join('');
  };

  async function saveStep6() {
    if (appId === 'demo') { return true; }
    const { error: delErr } = await sb.from('transfers').delete().eq('application_id', appId);
    if (delErr) { saveMsg('s6msg', delErr.message, true); return false; }
    const meaningful = TRANSFERS.filter(t => t.transfer_date || t.asset_description);
    if (meaningful.length > 0) {
      const rows = meaningful.map(t => ({
        application_id: appId,
        transfer_date: t.transfer_date || null,
        asset_description: t.asset_description,
        fair_market_value: parseFloat(t.fair_market_value)||0,
        amount_received: parseFloat(t.amount_received)||0,
        uncompensated_value: Math.max(0,(parseFloat(t.fair_market_value)||0)-(parseFloat(t.amount_received)||0)),
        recipient_name: t.recipient_name,
        recipient_relationship: t.recipient_relationship,
        was_loan: !!t.was_loan,
        has_promissory_note: !!t.has_promissory_note,
        was_for_care: !!t.was_for_care,
        has_care_agreement: !!t.has_care_agreement,
        was_returned: !!t.was_returned,
        possible_exemption: t.possible_exemption || 'none',
        needs_attorney_review: !t.was_returned && Math.max(0,(parseFloat(t.fair_market_value)||0)-(parseFloat(t.amount_received)||0)) > 0,
        notes: t.notes
      }));
      const { error } = await sb.from('transfers').insert(rows);
      if (error) { saveMsg('s6msg', error.message, true); return false; }
    }
    return true;
  }

  /* ------------------------------------------------------------------------
     STEP 7 — Packet
  ------------------------------------------------------------------------ */
  function renderStep7() {
    const st = APP.state ? getStateData(APP.state) : null;
    const today = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
    const totalUV = totalUncompensated();
    const penDiv = st?.penaltyDivisor;
    const penMonths = penDiv && totalUV > 0 ? (totalUV / penDiv).toFixed(1) : null;
    const flaggedTransfers = TRANSFERS.filter(t => t.needs_attorney_review && t.asset_description);

    return `
      <div class="eyebrow">Step ${visibleSteps().length} of ${visibleSteps().length} — Final packet</div>
      <h2>Your application packet is ready.</h2>
      <p class="text-faint" style="margin-bottom:24px;">Review the summary below, then print or save as PDF. Submit through ${st ? esc(st.name)+"'s" : "your state's"} official Medicaid agency.</p>

      ${st ? `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div><div style="font-weight:700;">${esc(st.agencyName)}</div><div class="text-sm text-faint">${esc(st.name)} official Medicaid program · ${esc(st.agencyPhone)}</div></div>
        <a class="btn btn-primary" href="${esc(st.agencyUrl)}" target="_blank" rel="noopener">Go to agency site →</a>
      </div>` : ''}

      ${flaggedTransfers.length > 0 ? `<div class="alert alert-error" style="margin-bottom:16px;">
        <strong>⚠ Attorney review recommended.</strong> This application includes ${flaggedTransfers.length} transfer(s) with uncompensated value totaling ${fmtMoney(totalUV)}. ${penMonths?'Estimated penalty period: ~'+penMonths+' months. ':''} Consult a Certified Medicaid Planner or elder law attorney before submitting.
      </div>` : ''}

      <div style="margin:20px 0;"><button class="btn btn-primary" onclick="window.print()" style="font-size:1.05rem;padding:14px 28px;">Print or save as PDF</button></div>

      <div id="printablePacket" style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:32px;font-size:0.9rem;line-height:1.6;">
        ${buildPacketHTML(st, today, totalUV, penMonths)}
      </div>

      <div style="margin-top:20px;"><button class="btn btn-primary" onclick="window.print()">Print or save as PDF</button></div>
    `;
  }

  function buildPacketHTML(st, today, totalUV, penMonths) {
    const a = APPL; const sp = SPOU;
    const flag = TRANSFERS.filter(t => t.needs_attorney_review && t.asset_description);

    function kv(label, val) {
      return `<tr><td style="color:#666;width:200px;padding:5px 8px;vertical-align:top;">${esc(label)}</td><td style="padding:5px 8px;">${val||'—'}</td></tr>`;
    }
    function section(title, content) {
      return `<h3 style="font-family:sans-serif;font-size:1rem;font-weight:700;color:#162e51;border-bottom:2px solid #1a4480;padding-bottom:6px;margin:24px 0 12px;">${title}</h3>${content}`;
    }
    function table(rows) {
      return `<table style="width:100%;border-collapse:collapse;font-size:0.875rem;">${rows}</table>`;
    }

    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #1a4480;">
        <div>
          <div style="font-size:1.4rem;font-weight:800;color:#162e51;">ClearCare</div>
          <div style="font-size:0.75rem;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Medicaid Application Preparation Packet</div>
        </div>
        <div style="text-align:right;font-size:0.8rem;color:#666;">
          Prepared: ${today}<br>
          ${st ? esc(st.name)+' · '+esc(st.programName) : ''}
        </div>
      </div>

      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px 14px;margin-bottom:16px;font-size:0.82rem;color:#664d03;">
        <strong>Preparation document — not an official government form.</strong> This packet organizes your information for submission to ${st?esc(st.agencyName):'your state Medicaid agency'}. Nothing here has been submitted to any agency. Provide the full SSN on the official state form.
      </div>

      ${flag.length>0 ? `<div style="background:#f8d7da;border:1px solid #f5c2c7;border-radius:6px;padding:12px 14px;margin-bottom:16px;font-size:0.82rem;color:#842029;">
        <strong>⚠ Attorney review recommended.</strong> ${flag.length} transfer(s) flagged with total uncompensated value of ${fmtMoney(totalUV)}.${penMonths?' Estimated penalty period: ~'+penMonths+' months.':''} Consult an elder law attorney or Certified Medicaid Planner before submitting.
      </div>` : ''}

      ${section('1. Facility & Application Details', table(
        kv('State / program', st ? esc(st.name)+' — '+esc(st.programName) : '—') +
        kv('Nursing facility', APP.facility_name || '—') +
        kv('Admission date', APP.facility_admission_date || '—') +
        kv('Level of care documented', APP.level_of_care_documented ? 'Yes' : 'Not yet confirmed') +
        kv('Marital status', APP.marital_status === 'married' ? 'Married' : 'Single / widowed / divorced') +
        (st ? kv('Agency', esc(st.agencyName)+' · '+esc(st.agencyPhone)+' · '+esc(st.agencyUrl)) : '')
      ))}

      ${section('2. Applicant', table(
        kv('Full name', [a.first_name, a.middle_name, a.last_name].filter(Boolean).map(s=>esc(s)).join(' ') || '—') +
        kv('Date of birth', a.dob || '—') +
        kv('Sex', a.sex === 'M' ? 'Male' : a.sex === 'F' ? 'Female' : '—') +
        kv('SSN (last 4)', a.ssn_last4 ? '•••-••-'+esc(a.ssn_last4) : 'Provide on official form') +
        kv('U.S. citizen', a.citizen === true ? 'Yes' : a.citizen === false ? 'No' : '—') +
        kv('Phone', a.phone || '—') +
        kv('Email', a.email || '—') +
        kv('Address', [a.address1, a.city, a.state, a.zip].filter(Boolean).map(s=>esc(s)).join(', ') || '—') +
        kv('Medicare number', a.medicare_number || '—') +
        kv('Medicaid number', a.medicaid_number || '—')
      ))}

      ${section('3. Medical / Level of Care', table(
        kv('Attending physician', a.attending_physician || '—') +
        kv('Physician phone', a.physician_phone || '—') +
        kv('Primary diagnosis', a.primary_diagnosis || '—') +
        kv('Bathing', a.adl_bathing || '—') +
        kv('Dressing', a.adl_dressing || '—') +
        kv('Eating', a.adl_eating || '—') +
        kv('Transferring', a.adl_transferring || '—') +
        kv('Toileting', a.adl_toileting || '—') +
        kv('Continence', a.adl_continence || '—')
      ))}

      ${APP.marital_status === 'married' ? section('4. Community Spouse', table(
        kv('Full name', [sp.first_name, sp.middle_name, sp.last_name].filter(Boolean).map(s=>esc(s)).join(' ') || '—') +
        kv('Date of birth', sp.dob || '—') +
        kv('SSN (last 4)', sp.ssn_last4 ? '•••-••-'+esc(sp.ssn_last4) : 'Provide on official form') +
        kv('Phone', sp.phone || '—') +
        kv('Address', [sp.address1, sp.city, sp.state, sp.zip].filter(Boolean).map(s=>esc(s)).join(', ') || '—') +
        kv('Medicare number', sp.medicare_number || '—') +
        (st ? kv('CSRA (max assets spouse may keep)', '$'+st.csra.toLocaleString()) + kv('MMMNA (monthly income floor for spouse)', '$'+st.mmmna.toLocaleString()+'/mo') : '')
      )) : ''}

      ${section('5. Asset Inventory', (() => {
        if (ASSETS.length === 0) return '<p style="color:#666;font-size:0.875rem;">No assets entered.</p>';
        const header = `<tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px 8px;font-size:0.78rem;">Owner</th><th style="text-align:left;padding:6px 8px;font-size:0.78rem;">Type</th><th style="text-align:left;padding:6px 8px;font-size:0.78rem;">Institution</th><th style="text-align:right;padding:6px 8px;font-size:0.78rem;">Value</th><th style="text-align:left;padding:6px 8px;font-size:0.78rem;">Exempt?</th></tr>`;
        const rows = ASSETS.map(a => {
          const t = ASSET_TYPES.find(x=>x.v===a.asset_type);
          return `<tr style="border-bottom:1px solid #eee;"><td style="padding:5px 8px;">${esc(a.owner)}</td><td style="padding:5px 8px;">${t?esc(t.label):esc(a.asset_type)}</td><td style="padding:5px 8px;">${esc(a.institution||a.description||'')}</td><td style="padding:5px 8px;text-align:right;">${fmtMoney(a.value)}</td><td style="padding:5px 8px;">${a.is_exempt?'Yes — '+esc(a.exempt_reason||'exempt'):'No'}</td></tr>`;
        }).join('');
        const foot = `<tr style="font-weight:700;border-top:2px solid #1a4480;"><td colspan="3" style="padding:6px 8px;">Total</td><td style="padding:6px 8px;text-align:right;">${fmtMoney(totalAssets())}</td><td style="padding:6px 8px;color:#1a4480;">Countable: ${fmtMoney(countableAssets())}</td></tr>`;
        return `<table style="width:100%;border-collapse:collapse;font-size:0.875rem;">${header}${rows}${foot}</table>`;
      })())}

      ${section('6. Income', (() => {
        if (INCOME.length === 0) return '<p style="color:#666;font-size:0.875rem;">No income entered.</p>';
        const header = `<tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px 8px;font-size:0.78rem;">Person</th><th style="text-align:left;padding:6px 8px;font-size:0.78rem;">Type</th><th style="text-align:left;padding:6px 8px;font-size:0.78rem;">Payer</th><th style="text-align:right;padding:6px 8px;font-size:0.78rem;">Amount</th><th style="text-align:left;padding:6px 8px;font-size:0.78rem;">Frequency</th><th style="text-align:right;padding:6px 8px;font-size:0.78rem;">Monthly</th></tr>`;
        const rows = INCOME.map(s => {
          const t = INCOME_TYPES.find(x=>x.v===s.income_type);
          const f = FREQS.find(x=>x.v===s.frequency);
          return `<tr style="border-bottom:1px solid #eee;"><td style="padding:5px 8px;">${esc(s.person)}</td><td style="padding:5px 8px;">${t?esc(t.label):esc(s.income_type)}</td><td style="padding:5px 8px;">${esc(s.payer||'')}</td><td style="padding:5px 8px;text-align:right;">${fmtMoney(s.amount)}</td><td style="padding:5px 8px;">${f?esc(f.label):esc(s.frequency)}</td><td style="padding:5px 8px;text-align:right;">${fmtMoney(monthlyAmt(s.amount,s.frequency))}</td></tr>`;
        }).join('');
        const foot = `<tr style="font-weight:700;border-top:2px solid #1a4480;"><td colspan="5" style="padding:6px 8px;">Total monthly income</td><td style="padding:6px 8px;text-align:right;">${fmtMoney(totalMonthlyIncome())}</td></tr>`;
        return `<table style="width:100%;border-collapse:collapse;font-size:0.875rem;">${header}${rows}${foot}</table>`;
      })())}

      ${section('7. Transfer / Lookback History ('+( APP.state?((getStateData(APP.state)?.lookback||60)+'-month'):60+'-month')+' lookback)', (() => {
        const meaningful = TRANSFERS.filter(t => t.transfer_date || t.asset_description);
        if (meaningful.length === 0) return '<p style="color:#666;font-size:0.875rem;">No transfers disclosed.</p>';
        return meaningful.map((t,i) => {
          const ex = TRANSFER_EXEMPTIONS.find(x=>x.v===t.possible_exemption);
          const uv = Math.max(0,(parseFloat(t.fair_market_value)||0)-(parseFloat(t.amount_received)||0));
          return `<div style="border:1px solid ${uv>0?'#f5c2c7':'#dee2e6'};border-radius:6px;padding:12px;margin-bottom:10px;background:${uv>0?'#fff8f8':'#fff'};">
            <div style="font-weight:700;margin-bottom:6px;">Transfer ${i+1}: ${esc(t.asset_description||'(no description)')}</div>
            ${table(
              kv('Date', t.transfer_date || '—') +
              kv('Fair market value', fmtMoney(t.fair_market_value)) +
              kv('Amount received', fmtMoney(t.amount_received)) +
              kv('Uncompensated value', uv>0?'<strong style="color:#842029;">'+fmtMoney(uv)+'</strong>':fmtMoney(0)) +
              kv('Recipient', [t.recipient_name, t.recipient_relationship].filter(Boolean).map(s=>esc(s)).join(' — ') || '—') +
              kv('Possible exemption', ex?esc(ex.label):'—') +
              kv('Notes', t.notes ? esc(t.notes) : '—') +
              (t.was_loan?kv('','Documented as a loan'+(t.has_promissory_note?' with promissory note':'')):'') +
              (t.was_for_care?kv('','Payment for care provided'+(t.has_care_agreement?' with written care agreement':'')):'') +
              (t.was_returned?kv('','Asset has been returned'):'') +
              (uv>0&&!t.was_returned?kv('Attorney review','⚠ Recommended — potential penalty period'):'')
            )}
          </div>`;
        }).join('');
      })())}

      ${section('8. Where to Submit', `
        ${st ? `<p><strong>${esc(st.agencyName)}</strong><br>${esc(st.agencyPhone)}<br><a href="${esc(st.agencyUrl)}">${esc(st.agencyUrl)}</a></p>` : ''}
        <p>Federal resource: <a href="https://www.medicaid.gov/about-us/where-can-people-get-help-medicaid-chip/index.html">medicaid.gov state contacts</a></p>
      `)}

      ${section('9. Certification', `
        <p style="font-size:0.875rem;">I certify that the information provided in this packet is true, accurate, and complete to the best of my knowledge. I understand that providing false information may result in denial of benefits and other penalties.</p>
        <div style="display:flex;gap:60px;flex-wrap:wrap;margin-top:32px;">
          <div style="border-top:1px solid #333;width:260px;padding-top:6px;font-size:0.78rem;color:#666;">Applicant signature &amp; date</div>
          ${APP.marital_status==='married'?'<div style="border-top:1px solid #333;width:260px;padding-top:6px;font-size:0.78rem;color:#666;">Community spouse signature &amp; date</div>':''}
          <div style="border-top:1px solid #333;width:260px;padding-top:6px;font-size:0.78rem;color:#666;">Authorized representative signature &amp; date (if applicable)</div>
        </div>
      `)}
    `;
  }

  /* ------------------------------------------------------------------------
     Navigation
  ------------------------------------------------------------------------ */
  const SAVE_FNS = [saveStep0, saveStep1, saveStep2, saveStep3, saveStep4, saveStep5, saveStep6, null];

  function getStepFnIndex(label) {
    const allSteps = ['Facility & state','Applicant','Medical','Spouse','Assets','Income','Transfers','Packet'];
    return allSteps.indexOf(label);
  }

  async function goNext() {
    const label = currentLabel();
    const fnIdx = getStepFnIndex(label);
    const saveFn = SAVE_FNS[fnIdx];
    if (saveFn) {
      const ok = await saveFn();
      if (!ok) return;
    }
    if (currentStep < visibleSteps().length - 1) {
      currentStep++;
      renderIntake();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goBack() {
    if (currentStep > 0) {
      currentStep--;
      renderIntake();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goToStep(i) {
    if (i <= currentStep) { currentStep = i; renderIntake(); window.scrollTo({top:0,behavior:'smooth'}); }
  }

  /* ------------------------------------------------------------------------
     Main render
  ------------------------------------------------------------------------ */
  const STEP_RENDERERS = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];

  function getAllStepRenderers() {
    const allLabels = ['Facility & state','Applicant','Medical','Spouse','Assets','Income','Transfers','Packet'];
    const visible   = visibleSteps();
    return visible.map(label => STEP_RENDERERS[allLabels.indexOf(label)]);
  }

  function renderIntake() {
    const renderers = getAllStepRenderers();
    const renderer  = renderers[currentStep];
    const isLast    = currentStep === visibleSteps().length - 1;
    const isFirst   = currentStep === 0;

    const content = renderer ? renderer() : '<p>Unknown step.</p>';

    shell(`
      <div class="page-header">
        <div class="page-header-inner">
          <div class="eyebrow">Application</div>
          <h1>${esc(APPL.first_name ? APPL.first_name+' '+(APPL.last_name||'') : 'New application')}</h1>
          <p>${APP.state ? esc((getStateData(APP.state)||{}).name||APP.state) : 'State not yet selected'} · <span class="badge badge-draft" style="vertical-align:middle;">Draft</span></p>
        </div>
      </div>
      <div class="page-wrap medium" style="padding-top:28px;">
        ${stepIndicatorHTML()}
        <div class="card">
          ${content}
          <div class="form-actions">
            ${isFirst
              ? `<a href="#/dashboard" class="btn btn-secondary">← My applications</a>`
              : `<button class="btn btn-secondary" onclick="intakeBack()">← Back</button>`
            }
            ${isLast
              ? `<button class="btn btn-primary" onclick="window.print()">Print or save as PDF</button>`
              : `<button class="btn btn-primary" onclick="intakeNext()">Save & continue →</button>`
            }
          </div>
        </div>
      </div>
      <style>
        @media print {
          .site-header,.site-footer,.page-header,.step-indicator,.form-actions,.btn { display:none!important; }
          .page-wrap { padding:0!important; max-width:100%!important; }
          .card { box-shadow:none!important; border:none!important; padding:0!important; }
          #printablePacket { border:none!important; padding:0!important; }
        }
      </style>
    `);
  }

  window.intakeNext = goNext;
  window.intakeBack = goBack;
  window.intakeGoTo = goToStep;

  /* ------------------------------------------------------------------------
     Entry point
  ------------------------------------------------------------------------ */
  window.renderApplicationIntake = async function (id) {
    appId = id;
    currentStep = 0;
    shell(`<div class="spinner-wrap">Loading application…</div>`);
    await loadAll(id);
    renderIntake();
  };

})();
