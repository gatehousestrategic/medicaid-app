/* ==========================================================================
   ClearCare — Question Engine (questions.js)
   TurboTax-style conversational intake. One question at a time, full screen.
   Autosaves every answer to Supabase immediately.
   Replaces the old multi-field form (intake.js) with a guided question flow.
   ========================================================================== */

(function () {

  /* ------------------------------------------------------------------------
     State
  ------------------------------------------------------------------------ */
  let appId = null;
  let APP   = {};
  let APPL  = {};
  let SPOU  = {};
  let CHECKLIST = {}; // { key: 'done'|'pending'|'missing' }
  let qIndex = 0;     // current question index in the visible flow
  let FLOW = [];      // computed question list based on answers so far
  let saving = false;

  /* ------------------------------------------------------------------------
     Question definitions
     Each question has:
       id       — unique key, maps to a field in Supabase
       phase    — phase label shown in progress
       text(S)  — the question text, can use applicant name
       sub(S)   — optional explanatory subtext
       type     — 'choice'|'text'|'date'|'number'|'tel'|'email'|'textarea'|'yesno'|'info'
       choices  — array of {label, value, icon} for choice/yesno types
       show(S)  — optional function, returns false to skip this question
       save(val,S) — async function that saves the answer
       getValue(S) — returns current saved value (for back navigation)
       next(val,S)  — optional, returns next question id override
       checklist(val,S) — optional, updates checklist items
       tip      — optional tooltip key
  ------------------------------------------------------------------------ */

  function name() { return APPL.first_name || 'the applicant'; }
  function spouseName() { return SPOU.first_name || 'your spouse'; }

  const QUESTIONS = [

    // ── PHASE 1: Getting started ─────────────────────────────────────────
    {
      id: 'role',
      phase: 'Getting started',
      text: () => 'Who is filling out this application?',
      sub: () => 'This helps us ask the right questions throughout.',
      type: 'choice',
      choices: [
        { label: 'I\'m applying for myself', value: 'self', icon: '🧑' },
        { label: 'I\'m helping a family member or someone I care for', value: 'other', icon: '👨‍👩‍👧' },
      ],
      getValue: () => APP._role,
      save: async (val) => { APP._role = val; },
    },

    {
      id: 'state',
      phase: 'Getting started',
      text: () => 'What state will this Medicaid application be filed in?',
      sub: () => 'Each state runs its own Medicaid program with different rules and limits. This determines everything that follows.',
      type: 'choice',
      choices: () => STATE_LIST.map(s => ({ label: s.name, value: s.code })),
      choiceStyle: 'dropdown',
      getValue: () => APP.state,
      save: async (val) => {
        APP.state = val;
        await sb.from('applications').update({ state: val, updated_at: new Date().toISOString() }).eq('id', appId);
        updateChecklist('state', 'done');
      },
    },

    {
      id: 'first_name',
      phase: 'Getting started',
      text: () => APP._role === 'self' ? 'What is your first name?' : 'What is the first name of the person applying?',
      type: 'text',
      placeholder: 'First name',
      getValue: () => APPL.first_name,
      save: async (val) => {
        APPL.first_name = val;
        await savePerson('applicant', { first_name: val });
      },
    },

    {
      id: 'last_name',
      phase: 'Getting started',
      text: () => `And ${name()}'s last name?`,
      type: 'text',
      placeholder: 'Last name',
      getValue: () => APPL.last_name,
      save: async (val) => {
        APPL.last_name = val;
        await savePerson('applicant', { last_name: val });
      },
    },

    {
      id: 'in_facility',
      phase: 'Getting started',
      text: () => `Is ${name()} currently living in a nursing home or skilled nursing facility?`,
      type: 'yesno',
      getValue: () => APP._in_facility,
      save: async (val) => { APP._in_facility = val; },
    },

    {
      id: 'facility_name',
      phase: 'Getting started',
      text: () => `What is the name of the nursing facility?`,
      type: 'text',
      placeholder: 'Facility name',
      show: () => APP._in_facility === 'yes',
      getValue: () => APP.facility_name,
      save: async (val) => {
        APP.facility_name = val;
        await sb.from('applications').update({ facility_name: val, updated_at: new Date().toISOString() }).eq('id', appId);
      },
    },

    {
      id: 'facility_admission_date',
      phase: 'Getting started',
      text: () => `When did ${name()} move into ${APP.facility_name || 'the facility'}?`,
      sub: () => 'The admission date matters because Medicaid may be able to cover costs back to this date once approved.',
      type: 'date',
      show: () => APP._in_facility === 'yes',
      getValue: () => APP.facility_admission_date,
      save: async (val) => {
        APP.facility_admission_date = val;
        await sb.from('applications').update({ facility_admission_date: val, updated_at: new Date().toISOString() }).eq('id', appId);
        updateChecklist('admission_records', 'pending');
      },
    },

    {
      id: 'intent_return_home',
      phase: 'Getting started',
      text: () => `Does ${name()} intend to return home after the nursing home stay?`,
      sub: () => 'This affects whether the primary home is protected as an exempt asset.',
      type: 'yesno',
      show: () => APP._in_facility === 'yes',
      getValue: () => APP._intent_return,
      save: async (val) => { APP._intent_return = val; },
      tip: 'intent_return',
    },

    {
      id: 'planning_ahead',
      phase: 'Getting started',
      text: () => `Is ${name()} currently paying privately for nursing home care, or planning ahead for future care?`,
      type: 'choice',
      show: () => APP._in_facility === 'no',
      choices: [
        { label: 'Paying privately right now — we need Medicaid as soon as possible', value: 'private_pay', icon: '💰' },
        { label: 'Planning ahead before care is needed', value: 'planning', icon: '📋' },
      ],
      getValue: () => APP._planning_status,
      save: async (val) => { APP._planning_status = val; },
    },

    {
      id: 'marital_status',
      phase: 'Getting started',
      text: () => `Is ${name()} currently married?`,
      sub: () => 'Marriage significantly affects Medicaid rules — a spouse at home is entitled to keep a protected share of the couple\'s assets.',
      type: 'choice',
      choices: [
        { label: 'Yes, currently married', value: 'married', icon: '💑' },
        { label: 'No — single, widowed, or divorced', value: 'single', icon: '🧑' },
      ],
      getValue: () => APP.marital_status,
      save: async (val) => {
        APP.marital_status = val;
        await sb.from('applications').update({ marital_status: val, updated_at: new Date().toISOString() }).eq('id', appId);
      },
      tip: 'marital_status',
    },

    {
      id: 'prior_marital_status',
      phase: 'Getting started',
      text: () => `Has ${name()} ever been married before?`,
      sub: () => 'Previous marriages may affect eligibility in some situations. A divorce decree or death certificate may be required.',
      type: 'yesno',
      show: () => APP.marital_status === 'single',
      getValue: () => APP._prior_married,
      save: async (val) => {
        APP._prior_married = val;
        if (val === 'yes') updateChecklist('divorce_or_death_cert', 'pending');
      },
    },

    // ── PHASE 2: About [name] ─────────────────────────────────────────────
    {
      id: 'dob',
      phase: `About ${name()}`,
      text: () => `What is ${name()}'s date of birth?`,
      type: 'date',
      getValue: () => APPL.dob,
      save: async (val) => {
        APPL.dob = val;
        await savePerson('applicant', { dob: val });
        updateChecklist('birth_certificate', 'pending');
      },
    },

    {
      id: 'ssn_last4',
      phase: `About ${name()}`,
      text: () => `What are the last four digits of ${name()}'s Social Security number?`,
      sub: () => 'We only store the last four digits for security. You\'ll provide the full number on the official state form.',
      type: 'text',
      placeholder: '_ _ _ _',
      maxLength: 4,
      getValue: () => APPL.ssn_last4,
      save: async (val) => {
        APPL.ssn_last4 = val;
        await savePerson('applicant', { ssn_last4: val });
        updateChecklist('social_security_card', 'pending');
      },
      tip: 'a_ssn4',
    },

    {
      id: 'sex',
      phase: `About ${name()}`,
      text: () => `What is ${name()}'s sex?`,
      type: 'choice',
      choices: [
        { label: 'Male', value: 'M', icon: '' },
        { label: 'Female', value: 'F', icon: '' },
        { label: 'Prefer not to say', value: '', icon: '' },
      ],
      getValue: () => APPL.sex,
      save: async (val) => {
        APPL.sex = val;
        await savePerson('applicant', { sex: val });
      },
    },

    {
      id: 'citizen',
      phase: `About ${name()}`,
      text: () => `Is ${name()} a U.S. citizen or U.S. national?`,
      type: 'yesno',
      getValue: () => APPL.citizen === null ? null : APPL.citizen ? 'yes' : 'no',
      save: async (val) => {
        APPL.citizen = val === 'yes';
        await savePerson('applicant', { citizen: APPL.citizen });
        if (val === 'yes') updateChecklist('citizenship_proof', 'pending');
        else updateChecklist('immigration_docs', 'pending');
      },
      tip: 'a_citizen',
    },

    {
      id: 'immigration_status',
      phase: `About ${name()}`,
      text: () => `What type of immigration document does ${name()} have?`,
      sub: () => 'Even with a non-citizen status, many people still qualify for Medicaid — it\'s always worth applying.',
      type: 'choice',
      show: () => APPL.citizen === false,
      choices: [
        { label: 'Permanent resident card (green card)', value: 'green_card', icon: '💳' },
        { label: 'Employment Authorization Document', value: 'ead', icon: '📄' },
        { label: 'Visa', value: 'visa', icon: '📘' },
        { label: 'Other immigration document', value: 'other', icon: '📋' },
      ],
      getValue: () => APPL.immigration_status,
      save: async (val) => {
        APPL.immigration_status = val;
        await savePerson('applicant', { immigration_status: val });
      },
    },

    {
      id: 'education',
      phase: `About ${name()}`,
      text: () => `What is the highest grade or level of school ${name()} completed?`,
      sub: () => 'Several state Medicaid forms ask for this. It doesn\'t affect eligibility.',
      type: 'choice',
      choices: [
        { label: 'Less than high school', value: 'less_than_hs' },
        { label: 'High school diploma or GED', value: 'hs' },
        { label: 'Some college', value: 'some_college' },
        { label: 'College degree or higher', value: 'college' },
      ],
      getValue: () => APPL._education,
      save: async (val) => { APPL._education = val; },
    },

    {
      id: 'phone',
      phase: `About ${name()}`,
      text: () => `What is the best phone number to reach ${APP._role === 'other' ? 'you or a family member' : name()}?`,
      sub: () => 'The state Medicaid office may call with questions about the application.',
      type: 'tel',
      placeholder: '(   )   -    ',
      getValue: () => APPL.phone,
      save: async (val) => {
        APPL.phone = val;
        await savePerson('applicant', { phone: val });
      },
    },

    {
      id: 'email',
      phase: `About ${name()}`,
      text: () => `What is the best email address for updates about this application?`,
      sub: () => 'We\'ll use this to let you know when your application status changes. If the applicant doesn\'t use email, a family member\'s address is fine.',
      type: 'email',
      placeholder: 'email@example.com',
      getValue: () => APPL.email,
      save: async (val) => {
        APPL.email = val;
        await savePerson('applicant', { email: val });
      },
    },

    {
      id: 'address1',
      phase: `About ${name()}`,
      text: () => `What was ${name()}'s home address before entering the nursing home?`,
      sub: () => 'Use the address where they lived before — not the nursing home address. This is important for determining whether the home is protected.',
      type: 'text',
      placeholder: 'Street address',
      getValue: () => APPL.address1,
      save: async (val) => {
        APPL.address1 = val;
        await savePerson('applicant', { address1: val });
        updateChecklist('proof_of_residency', 'pending');
      },
    },

    {
      id: 'address_city',
      phase: `About ${name()}`,
      text: () => 'City, state, and ZIP code?',
      type: 'text',
      placeholder: 'City, State ZIP',
      getValue: () => [APPL.city, APPL.state, APPL.zip].filter(Boolean).join(', '),
      save: async (val) => {
        // Parse city, state, zip from combined input — or just store as city for now
        APPL.city = val;
        await savePerson('applicant', { city: val });
      },
    },

    {
      id: 'lived_with',
      phase: `About ${name()}`,
      text: () => `Who else was living at that address before ${name()} moved into the facility?`,
      sub: () => 'For example: spouse, adult child, nobody else. This can affect which assets are protected.',
      type: 'choice',
      choices: [
        { label: 'Spouse only', value: 'spouse', icon: '💑' },
        { label: 'Adult child or other family member', value: 'family', icon: '👨‍👩‍👧' },
        { label: 'No one else — lived alone', value: 'alone', icon: '🧑' },
        { label: 'Other', value: 'other', icon: '🏠' },
      ],
      getValue: () => APP._lived_with,
      save: async (val) => { APP._lived_with = val; },
    },

    // ── PHASE 3: Medical situation ────────────────────────────────────────
    {
      id: 'phase3_intro',
      phase: 'Medical situation',
      type: 'info',
      text: () => 'Next: a few questions about medical care.',
      sub: () => `To qualify for nursing home Medicaid, ${name()} must need a nursing facility level of care. We'll confirm the details here.`,
    },

    {
      id: 'nfloc',
      phase: 'Medical situation',
      text: () => `Has a doctor confirmed in writing that ${name()} needs nursing home level of care?`,
      sub: () => 'This is called a "Nursing Facility Level of Care" (NFLOC) determination. The nursing home can usually arrange this if it hasn\'t happened yet.',
      type: 'choice',
      choices: [
        { label: 'Yes — a doctor has documented this', value: 'yes', icon: '✅' },
        { label: 'Not yet — we need to arrange it', value: 'no', icon: '⏳' },
        { label: 'Not sure what this means', value: 'unsure', icon: '❓' },
      ],
      getValue: () => APP.level_of_care_documented ? 'yes' : APP._nfloc_status,
      save: async (val) => {
        APP._nfloc_status = val;
        await sb.from('applications').update({ level_of_care_documented: val === 'yes', updated_at: new Date().toISOString() }).eq('id', appId);
        if (val !== 'yes') updateChecklist('nfloc_documentation', 'missing');
        else updateChecklist('nfloc_documentation', 'done');
      },
      tip: 'level_of_care_documented',
    },

    {
      id: 'nfloc_help',
      phase: 'Medical situation',
      type: 'info',
      text: () => 'The facility\'s social worker can help.',
      sub: () => 'Ask the nursing home\'s social worker to arrange a level-of-care assessment. This is a standard part of the admission process and they do this regularly. Once it\'s done, come back and update this answer. Your application can be started now and completed later.',
      show: () => APP._nfloc_status === 'no' || APP._nfloc_status === 'unsure',
    },

    {
      id: 'primary_diagnosis',
      phase: 'Medical situation',
      text: () => `What is ${name()}'s primary diagnosis?`,
      sub: () => 'The main medical condition that led to the nursing home stay. Use the diagnosis from the doctor\'s records if you have them.',
      type: 'text',
      placeholder: "e.g. Alzheimer's disease, stroke, Parkinson's disease",
      getValue: () => APPL.primary_diagnosis,
      save: async (val) => {
        APPL.primary_diagnosis = val;
        await savePerson('applicant', { primary_diagnosis: val });
      },
    },

    {
      id: 'adl_bathing',
      phase: 'Medical situation',
      text: () => `Can ${name()} bathe themselves without help?`,
      sub: () => 'Medicaid requires needing help with at least 2 daily activities. Answer based on what they can actually do on their own today.',
      type: 'choice',
      choices: [
        { label: 'Yes — fully independent', value: 'Independent', icon: '✅' },
        { label: 'Needs some help', value: 'Needs assistance', icon: '🤝' },
        { label: 'Cannot do it at all without help', value: 'Fully dependent', icon: '❌' },
      ],
      getValue: () => APPL.adl_bathing,
      save: async (val) => { APPL.adl_bathing = val; await savePerson('applicant', { adl_bathing: val }); },
    },

    {
      id: 'adl_dressing',
      phase: 'Medical situation',
      text: () => `Can ${name()} dress themselves — including buttons, zippers, and shoes?`,
      type: 'choice',
      choices: [
        { label: 'Yes — fully independent', value: 'Independent', icon: '✅' },
        { label: 'Needs some help', value: 'Needs assistance', icon: '🤝' },
        { label: 'Cannot do it at all without help', value: 'Fully dependent', icon: '❌' },
      ],
      getValue: () => APPL.adl_dressing,
      save: async (val) => { APPL.adl_dressing = val; await savePerson('applicant', { adl_dressing: val }); },
    },

    {
      id: 'adl_eating',
      phase: 'Medical situation',
      text: () => `Once food is in front of them, can ${name()} feed themselves?`,
      type: 'choice',
      choices: [
        { label: 'Yes — fully independent', value: 'Independent', icon: '✅' },
        { label: 'Needs some help', value: 'Needs assistance', icon: '🤝' },
        { label: 'Cannot do it at all without help', value: 'Fully dependent', icon: '❌' },
      ],
      getValue: () => APPL.adl_eating,
      save: async (val) => { APPL.adl_eating = val; await savePerson('applicant', { adl_eating: val }); },
    },

    {
      id: 'adl_transferring',
      phase: 'Medical situation',
      text: () => `Can ${name()} move themselves from a bed to a chair — or stand up from sitting — without help?`,
      type: 'choice',
      choices: [
        { label: 'Yes — fully independent', value: 'Independent', icon: '✅' },
        { label: 'Needs some help', value: 'Needs assistance', icon: '🤝' },
        { label: 'Cannot do it at all without help', value: 'Fully dependent', icon: '❌' },
      ],
      getValue: () => APPL.adl_transferring,
      save: async (val) => { APPL.adl_transferring = val; await savePerson('applicant', { adl_transferring: val }); },
    },

    {
      id: 'adl_toileting',
      phase: 'Medical situation',
      text: () => `Can ${name()} use the toilet and manage their clothing without help?`,
      type: 'choice',
      choices: [
        { label: 'Yes — fully independent', value: 'Independent', icon: '✅' },
        { label: 'Needs some help', value: 'Needs assistance', icon: '🤝' },
        { label: 'Cannot do it at all without help', value: 'Fully dependent', icon: '❌' },
      ],
      getValue: () => APPL.adl_toileting,
      save: async (val) => { APPL.adl_toileting = val; await savePerson('applicant', { adl_toileting: val }); },
    },

    {
      id: 'adl_continence',
      phase: 'Medical situation',
      text: () => `Does ${name()} have control of their bladder and bowels?`,
      type: 'choice',
      choices: [
        { label: 'Yes — fully in control', value: 'Independent', icon: '✅' },
        { label: 'Sometimes has accidents or uses briefs', value: 'Needs assistance', icon: '🤝' },
        { label: 'No control', value: 'Fully dependent', icon: '❌' },
      ],
      getValue: () => APPL.adl_continence,
      save: async (val) => { APPL.adl_continence = val; await savePerson('applicant', { adl_continence: val }); },
    },

    {
      id: 'attending_physician',
      phase: 'Medical situation',
      text: () => `Who is ${name()}'s attending doctor?`,
      sub: () => 'The doctor currently overseeing their care — usually the primary care doctor or the physician at the nursing home.',
      type: 'text',
      placeholder: "Doctor's full name",
      getValue: () => APPL.attending_physician,
      save: async (val) => { APPL.attending_physician = val; await savePerson('applicant', { attending_physician: val }); updateChecklist('physician_letter', 'pending'); },
    },

    {
      id: 'physician_phone',
      phase: 'Medical situation',
      text: () => `What is ${APPL.attending_physician || 'the doctor'}'s phone number?`,
      type: 'tel',
      placeholder: '(   )   -    ',
      getValue: () => APPL.physician_phone,
      save: async (val) => { APPL.physician_phone = val; await savePerson('applicant', { physician_phone: val }); },
    },

    {
      id: 'medicare',
      phase: 'Medical situation',
      text: () => `Is ${name()} enrolled in Medicare?`,
      type: 'yesno',
      getValue: () => APPL._has_medicare,
      save: async (val) => {
        APPL._has_medicare = val;
        if (val === 'yes') updateChecklist('medicare_card', 'pending');
      },
    },

    {
      id: 'medicare_number',
      phase: 'Medical situation',
      text: () => `What is ${name()}'s Medicare number?`,
      sub: () => 'It\'s on the red, white, and blue Medicare card. Looks something like 1EG4-TE5-MK72.',
      type: 'text',
      placeholder: '1EG4-TE5-MK72',
      show: () => APPL._has_medicare === 'yes',
      getValue: () => APPL.medicare_number,
      save: async (val) => { APPL.medicare_number = val; await savePerson('applicant', { medicare_number: val }); updateChecklist('medicare_card', 'done'); },
    },

    {
      id: 'medicare_coverage',
      phase: 'Medical situation',
      text: () => 'Is Medicare currently covering any of the nursing home costs?',
      sub: () => 'Medicare typically covers the first 20 days in full, and days 21–100 with a daily copay, after a qualifying hospital stay of at least 3 days.',
      type: 'choice',
      show: () => APPL._has_medicare === 'yes',
      choices: [
        { label: 'Yes — Medicare is still paying', value: 'active', icon: '✅' },
        { label: 'Medicare coverage has ended', value: 'ended', icon: '❌' },
        { label: 'Medicare never covered this stay', value: 'never', icon: '➖' },
        { label: 'Not sure', value: 'unsure', icon: '❓' },
      ],
      getValue: () => APPL._medicare_coverage,
      save: async (val) => { APPL._medicare_coverage = val; },
    },

    {
      id: 'ltc_insurance',
      phase: 'Medical situation',
      text: () => `Does ${name()} have a long-term care insurance policy?`,
      sub: () => 'A separate insurance policy specifically for nursing home or home care costs — different from Medicare or regular health insurance.',
      type: 'yesno',
      getValue: () => APPL._has_ltc_insurance,
      save: async (val) => {
        APPL._has_ltc_insurance = val;
        if (val === 'yes') updateChecklist('ltc_insurance_policy', 'pending');
      },
    },

    {
      id: 'ltc_insurance_activated',
      phase: 'Medical situation',
      text: () => 'Has the long-term care insurance policy been activated and paying benefits?',
      type: 'yesno',
      show: () => APPL._has_ltc_insurance === 'yes',
      getValue: () => APPL._ltc_activated,
      save: async (val) => { APPL._ltc_activated = val; },
    },

    {
      id: 'other_insurance',
      phase: 'Medical situation',
      text: () => `Does ${name()} have any other health insurance?`,
      sub: () => 'For example: Medigap (Medicare supplement), employer retiree plan, VA health coverage, or a Marketplace plan.',
      type: 'yesno',
      getValue: () => APPL._has_other_insurance,
      save: async (val) => {
        APPL._has_other_insurance = val;
        if (val === 'yes') updateChecklist('other_insurance_cards', 'pending');
      },
    },

    // ── PHASE 4: The people involved ─────────────────────────────────────
    {
      id: 'phase4_intro',
      phase: 'People involved',
      type: 'info',
      text: () => 'Next: a few questions about who else is involved.',
      sub: () => APP.marital_status === 'married'
        ? `We'll need some information about ${name()}'s spouse, and about who has legal authority to act on ${name()}'s behalf if needed.`
        : `We'll ask about who has legal authority to act on ${name()}'s behalf if needed.`,
    },

    // Spouse questions
    {
      id: 'spouse_first',
      phase: 'People involved',
      text: () => `What is the spouse's first name?`,
      show: () => APP.marital_status === 'married',
      type: 'text',
      placeholder: 'First name',
      getValue: () => SPOU.first_name,
      save: async (val) => { SPOU.first_name = val; await savePerson('spouse', { first_name: val }); },
    },

    {
      id: 'spouse_last',
      phase: 'People involved',
      text: () => `And ${spouseName()}'s last name?`,
      show: () => APP.marital_status === 'married',
      type: 'text',
      placeholder: 'Last name',
      getValue: () => SPOU.last_name,
      save: async (val) => { SPOU.last_name = val; await savePerson('spouse', { last_name: val }); },
    },

    {
      id: 'spouse_dob',
      phase: 'People involved',
      text: () => `What is ${spouseName()}'s date of birth?`,
      show: () => APP.marital_status === 'married',
      type: 'date',
      getValue: () => SPOU.dob,
      save: async (val) => { SPOU.dob = val; await savePerson('spouse', { dob: val }); },
    },

    {
      id: 'spouse_ssn4',
      phase: 'People involved',
      text: () => `What are the last four digits of ${spouseName()}'s Social Security number?`,
      show: () => APP.marital_status === 'married',
      type: 'text',
      placeholder: '_ _ _ _',
      maxLength: 4,
      getValue: () => SPOU.ssn_last4,
      save: async (val) => { SPOU.ssn_last4 = val; await savePerson('spouse', { ssn_last4: val }); },
    },

    {
      id: 'spouse_address_same',
      phase: 'People involved',
      text: () => `Is ${spouseName()} still living at ${APPL.address1 || 'the home address we entered earlier'}?`,
      show: () => APP.marital_status === 'married',
      type: 'yesno',
      getValue: () => SPOU._address_same,
      save: async (val) => {
        SPOU._address_same = val;
        if (val === 'yes') {
          SPOU.address1 = APPL.address1;
          SPOU.city = APPL.city;
          SPOU.zip = APPL.zip;
          await savePerson('spouse', { address1: APPL.address1, city: APPL.city, zip: APPL.zip });
        }
      },
    },

    {
      id: 'spouse_address',
      phase: 'People involved',
      text: () => `What is ${spouseName()}'s current address?`,
      show: () => APP.marital_status === 'married' && SPOU._address_same === 'no',
      type: 'text',
      placeholder: 'Street address, city, state, ZIP',
      getValue: () => SPOU.address1,
      save: async (val) => { SPOU.address1 = val; await savePerson('spouse', { address1: val }); },
    },

    {
      id: 'spouse_phone',
      phase: 'People involved',
      text: () => `What is the best phone number for ${spouseName()}?`,
      show: () => APP.marital_status === 'married',
      type: 'tel',
      placeholder: '(   )   -    ',
      getValue: () => SPOU.phone,
      save: async (val) => { SPOU.phone = val; await savePerson('spouse', { phone: val }); },
    },

    {
      id: 'spouse_medicare',
      phase: 'People involved',
      text: () => `Is ${spouseName()} enrolled in Medicare?`,
      show: () => APP.marital_status === 'married',
      type: 'yesno',
      getValue: () => SPOU._has_medicare,
      save: async (val) => { SPOU._has_medicare = val; },
    },

    {
      id: 'spouse_medicare_number',
      phase: 'People involved',
      text: () => `What is ${spouseName()}'s Medicare number?`,
      show: () => APP.marital_status === 'married' && SPOU._has_medicare === 'yes',
      type: 'text',
      placeholder: '1EG4-TE5-MK72',
      getValue: () => SPOU.medicare_number,
      save: async (val) => { SPOU.medicare_number = val; await savePerson('spouse', { medicare_number: val }); },
    },

    {
      id: 'csra_info',
      phase: 'People involved',
      type: 'info',
      show: () => APP.marital_status === 'married',
      text: () => `Good news for ${spouseName()}.`,
      sub: () => {
        const st = APP.state ? getStateData(APP.state) : null;
        const csra = st ? '$' + st.csra.toLocaleString() : '$162,660';
        const mmmna = st ? '$' + st.mmmna.toLocaleString() : '$2,643';
        return `Medicaid has special protections for the spouse who stays home — called the "community spouse." In ${st ? st.name : 'your state'}, ${spouseName()} can keep up to ${csra} in savings (the Community Spouse Resource Allowance) and is guaranteed at least ${mmmna}/month in income (the Monthly Maintenance Needs Allowance). These protections exist specifically so the community spouse isn't left with nothing.`;
      },
      tip: 'csra',
    },

    // POA / Legal representative
    {
      id: 'has_poa',
      phase: 'People involved',
      text: () => `Does ${name()} have a Power of Attorney or legal guardian named?`,
      sub: () => 'A Power of Attorney (POA) gives someone the legal authority to make financial and/or medical decisions on their behalf. If someone is filling out this application on their behalf, they\'ll likely need one.',
      type: 'yesno',
      getValue: () => APP._has_poa,
      save: async (val) => {
        APP._has_poa = val;
        if (val === 'yes') updateChecklist('poa_document', 'pending');
        else if (APP._role === 'other') updateChecklist('poa_document', 'missing');
      },
    },

    {
      id: 'poa_name',
      phase: 'People involved',
      text: () => 'What is the name of the person with Power of Attorney or guardianship?',
      show: () => APP._has_poa === 'yes',
      type: 'text',
      placeholder: 'Full name',
      getValue: () => APP._poa_name,
      save: async (val) => { APP._poa_name = val; },
    },

    {
      id: 'poa_relationship',
      phase: 'People involved',
      text: () => `What is ${APP._poa_name || 'their'} relationship to ${name()}?`,
      show: () => APP._has_poa === 'yes',
      type: 'choice',
      choices: [
        { label: 'Adult child', value: 'adult_child', icon: '👦' },
        { label: 'Spouse', value: 'spouse', icon: '💑' },
        { label: 'Sibling', value: 'sibling', icon: '👫' },
        { label: 'Attorney', value: 'attorney', icon: '⚖️' },
        { label: 'Other', value: 'other', icon: '🧑' },
      ],
      getValue: () => APP._poa_relationship,
      save: async (val) => { APP._poa_relationship = val; },
    },

    {
      id: 'poa_type',
      phase: 'People involved',
      text: () => `What type of legal authority does ${APP._poa_name || 'this person'} have?`,
      show: () => APP._has_poa === 'yes',
      type: 'choice',
      choices: [
        { label: 'Durable Power of Attorney for finances', value: 'financial_poa', icon: '💰' },
        { label: 'Healthcare proxy or medical POA', value: 'medical_poa', icon: '🏥' },
        { label: 'Both financial and medical POA', value: 'both_poa', icon: '📋' },
        { label: 'Court-appointed guardian or conservator', value: 'guardian', icon: '⚖️' },
      ],
      getValue: () => APP._poa_type,
      save: async (val) => { APP._poa_type = val; updateChecklist('poa_document', 'pending'); },
    },

    // Phase 4 complete
    {
      id: 'phase4_complete',
      phase: 'People involved',
      type: 'info',
      text: () => 'Great — that\'s the people section done.',
      sub: () => 'Next we\'ll go through what ' + name() + ' owns. We\'ll take it one type of asset at a time so it\'s not overwhelming. You can pause and come back at any point — everything saves automatically.',
    },


    // ── PHASE 5: What [name] owns (Assets) ───────────────────────────────

    {
      id: 'phase5_intro',
      phase: 'Assets',
      type: 'info',
      text: () => `Now let's go through what ${name()} owns.`,
      sub: () => `We'll take it one type of asset at a time. Every asset needs to be listed — even ones that are protected and don't count toward the limit. For ${APP.state ? getStateData(APP.state)?.name : 'your state'}, the countable asset limit is ${APP.state && getStateData(APP.state)?.assetLimit ? '$'+getStateData(APP.state).assetLimit.toLocaleString() : 'set by your state'}. Don't worry about deciding what's exempt — we'll help you with that.`,
    },

    // Checking accounts
    {
      id: 'has_checking',
      phase: 'Assets',
      text: () => `Does ${name()} have a checking account?`,
      type: 'yesno',
      getValue: () => APP._has_checking,
      save: async (val) => { APP._has_checking = val; },
    },
    {
      id: 'checking_count',
      phase: 'Assets',
      text: () => `How many checking accounts does ${name()} have?`,
      type: 'choice',
      show: () => APP._has_checking === 'yes',
      choices: [
        { label: 'Just one', value: '1' },
        { label: 'Two', value: '2' },
        { label: 'Three or more', value: '3+' },
      ],
      getValue: () => APP._checking_count,
      save: async (val) => { APP._checking_count = val; },
    },
    {
      id: 'checking_1',
      phase: 'Assets',
      text: () => `Tell us about the checking account.`,
      sub: () => 'Bank name, last 4 digits of account number, and current balance.',
      type: 'asset_entry',
      show: () => APP._has_checking === 'yes',
      assetType: 'checking',
      assetIndex: 0,
      getValue: () => APP._checking_1,
      save: async (val) => {
        APP._checking_1 = val;
        await addAssetEntry('checking', val, 0);
        updateChecklist('bank_checking_1', 'pending');
      },
    },
    {
      id: 'checking_2',
      phase: 'Assets',
      text: () => 'Tell us about the second checking account.',
      sub: () => 'Bank name, last 4 digits, and current balance.',
      type: 'asset_entry',
      show: () => APP._has_checking === 'yes' && (APP._checking_count === '2' || APP._checking_count === '3+'),
      assetType: 'checking',
      assetIndex: 1,
      getValue: () => APP._checking_2,
      save: async (val) => { APP._checking_2 = val; await addAssetEntry('checking', val, 1); updateChecklist('bank_checking_2', 'pending'); },
    },

    // Savings accounts
    {
      id: 'has_savings',
      phase: 'Assets',
      text: () => `Does ${name()} have a savings account?`,
      type: 'yesno',
      getValue: () => APP._has_savings,
      save: async (val) => { APP._has_savings = val; },
    },
    {
      id: 'savings_1',
      phase: 'Assets',
      text: () => 'Tell us about the savings account.',
      sub: () => 'Bank name, last 4 digits of account number, and current balance.',
      type: 'asset_entry',
      show: () => APP._has_savings === 'yes',
      assetType: 'savings',
      assetIndex: 0,
      getValue: () => APP._savings_1,
      save: async (val) => { APP._savings_1 = val; await addAssetEntry('savings', val, 0); updateChecklist('bank_savings_1', 'pending'); },
    },

    // CDs
    {
      id: 'has_cd',
      phase: 'Assets',
      text: () => `Does ${name()} have any certificates of deposit (CDs)?`,
      sub: () => 'CDs are savings certificates issued by a bank with a fixed interest rate and maturity date.',
      type: 'yesno',
      getValue: () => APP._has_cd,
      save: async (val) => { APP._has_cd = val; },
    },
    {
      id: 'cd_1',
      phase: 'Assets',
      text: () => 'Tell us about the CD.',
      sub: () => 'Bank name, last 4 digits of account number, and current value.',
      type: 'asset_entry',
      show: () => APP._has_cd === 'yes',
      assetType: 'cd',
      assetIndex: 0,
      getValue: () => APP._cd_1,
      save: async (val) => { APP._cd_1 = val; await addAssetEntry('cd', val, 0); updateChecklist('bank_cd_1', 'pending'); },
    },

    // Brokerage / investments
    {
      id: 'has_brokerage',
      phase: 'Assets',
      text: () => `Does ${name()} have any investment or brokerage accounts — stocks, bonds, or mutual funds?`,
      type: 'yesno',
      getValue: () => APP._has_brokerage,
      save: async (val) => { APP._has_brokerage = val; },
    },
    {
      id: 'brokerage_1',
      phase: 'Assets',
      text: () => 'Tell us about the investment account.',
      sub: () => 'Firm name (e.g. Fidelity, Vanguard), last 4 of account number, and current value.',
      type: 'asset_entry',
      show: () => APP._has_brokerage === 'yes',
      assetType: 'brokerage',
      assetIndex: 0,
      getValue: () => APP._brokerage_1,
      save: async (val) => { APP._brokerage_1 = val; await addAssetEntry('brokerage', val, 0); updateChecklist('investment_stmt_1', 'pending'); },
    },

    // Retirement accounts
    {
      id: 'has_retirement',
      phase: 'Assets',
      text: () => `Does ${name()} have an IRA, 401(k), or other retirement savings account?`,
      type: 'yesno',
      getValue: () => APP._has_retirement,
      save: async (val) => { APP._has_retirement = val; },
    },
    {
      id: 'retirement_payout',
      phase: 'Assets',
      text: () => 'Is this retirement account currently paying out monthly distributions?',
      sub: () => 'If required minimum distributions (RMDs) have started, or the account is being drawn down regularly, that affects how Medicaid treats it.',
      type: 'yesno',
      show: () => APP._has_retirement === 'yes',
      getValue: () => APP._retirement_payout,
      save: async (val) => { APP._retirement_payout = val; },
    },
    {
      id: 'retirement_1',
      phase: 'Assets',
      text: () => 'Tell us about the retirement account.',
      sub: () => 'Institution name, last 4 of account number, current balance, and monthly distribution amount if in payout.',
      type: 'asset_entry',
      show: () => APP._has_retirement === 'yes',
      assetType: 'retirement',
      assetIndex: 0,
      getValue: () => APP._retirement_1,
      save: async (val) => { APP._retirement_1 = val; await addAssetEntry('retirement', val, 0); updateChecklist('retirement_stmt_1', 'pending'); },
    },

    // Primary home
    {
      id: 'has_home',
      phase: 'Assets',
      text: () => `Does ${name()} own a home or other real estate?`,
      type: 'yesno',
      getValue: () => APP._has_home,
      save: async (val) => { APP._has_home = val; },
    },
    {
      id: 'home_spouse_lives_there',
      phase: 'Assets',
      text: () => `Does ${spouseName()} still live in the home?`,
      sub: () => 'If a spouse is still living in the home, it is generally exempt from Medicaid\'s asset count.',
      type: 'yesno',
      show: () => APP._has_home === 'yes' && APP.marital_status === 'married',
      getValue: () => APP._home_spouse_lives,
      save: async (val) => { APP._home_spouse_lives = val; },
      tip: 'intent_return',
    },
    {
      id: 'home_intent_return',
      phase: 'Assets',
      text: () => `Does ${name()} intend to return home?`,
      sub: () => 'If there is a documented intent to return home, the home stays exempt while receiving Medicaid benefits. The nursing home social worker can help document this.',
      type: 'yesno',
      show: () => APP._has_home === 'yes' && APP.marital_status !== 'married',
      getValue: () => APP._intent_return,
      save: async (val) => { APP._intent_return = val; },
    },
    {
      id: 'home_value',
      phase: 'Assets',
      text: () => 'What is the estimated value of the home?',
      sub: () => 'A reasonable estimate is fine — what it would sell for today. The state may request an appraisal later.',
      type: 'number',
      placeholder: 'Estimated value in dollars',
      show: () => APP._has_home === 'yes',
      getValue: () => APP._home_value,
      save: async (val) => {
        APP._home_value = val;
        await addAssetEntry('primary_home', { institution: 'Primary residence', value: val, is_exempt: APP._home_spouse_lives === 'yes' || APP._intent_return === 'yes', exempt_reason: APP._home_spouse_lives === 'yes' ? 'Spouse lives there' : APP._intent_return === 'yes' ? 'Intent to return' : '' }, 0);
        updateChecklist('home_deed', 'pending');
        updateChecklist('home_tax_statement', 'pending');
        updateChecklist('home_insurance', 'pending');
      },
    },
    {
      id: 'home_mortgage',
      phase: 'Assets',
      text: () => 'Is there a mortgage on the home?',
      type: 'yesno',
      show: () => APP._has_home === 'yes',
      getValue: () => APP._home_mortgage,
      save: async (val) => { APP._home_mortgage = val; },
    },
    {
      id: 'other_real_estate',
      phase: 'Assets',
      text: () => `Does ${name()} own any other real estate — a vacation home, rental property, land, or timeshare?`,
      type: 'yesno',
      getValue: () => APP._has_other_re,
      save: async (val) => { APP._has_other_re = val; },
    },
    {
      id: 'other_re_detail',
      phase: 'Assets',
      text: () => 'Tell us about the other property.',
      sub: () => 'Type of property, address or description, and estimated value.',
      type: 'asset_entry',
      show: () => APP._has_other_re === 'yes',
      assetType: 'other_real_estate',
      assetIndex: 0,
      getValue: () => APP._other_re_1,
      save: async (val) => { APP._other_re_1 = val; await addAssetEntry('other_real_estate', val, 0); updateChecklist('other_re_deed', 'pending'); },
    },

    // Vehicles
    {
      id: 'has_vehicle',
      phase: 'Assets',
      text: () => `Does ${name()} own a car or other vehicle?`,
      sub: () => 'One vehicle is typically exempt from Medicaid\'s asset count. Additional vehicles are countable.',
      type: 'yesno',
      getValue: () => APP._has_vehicle,
      save: async (val) => { APP._has_vehicle = val; },
    },
    {
      id: 'vehicle_1',
      phase: 'Assets',
      text: () => 'Tell us about the vehicle.',
      sub: () => 'Year, make, and model. For example: 2019 Toyota Camry.',
      type: 'asset_entry',
      show: () => APP._has_vehicle === 'yes',
      assetType: 'vehicle_primary',
      assetIndex: 0,
      getValue: () => APP._vehicle_1,
      save: async (val) => { APP._vehicle_1 = val; await addAssetEntry('vehicle_primary', { ...val, is_exempt: true, exempt_reason: 'Primary vehicle' }, 0); updateChecklist('vehicle_title_1', 'pending'); },
    },
    {
      id: 'has_vehicle_2',
      phase: 'Assets',
      text: () => `Does ${name()} own any additional vehicles?`,
      type: 'yesno',
      show: () => APP._has_vehicle === 'yes',
      getValue: () => APP._has_vehicle_2,
      save: async (val) => { APP._has_vehicle_2 = val; },
    },
    {
      id: 'vehicle_2',
      phase: 'Assets',
      text: () => 'Tell us about the second vehicle.',
      sub: () => 'Year, make, and model. Additional vehicles are countable assets.',
      type: 'asset_entry',
      show: () => APP._has_vehicle_2 === 'yes',
      assetType: 'vehicle_add',
      assetIndex: 1,
      getValue: () => APP._vehicle_2,
      save: async (val) => { APP._vehicle_2 = val; await addAssetEntry('vehicle_add', val, 1); updateChecklist('vehicle_title_2', 'pending'); },
    },

    // Life insurance
    {
      id: 'has_life_insurance',
      phase: 'Assets',
      text: () => `Does ${name()} have a life insurance policy?`,
      type: 'yesno',
      getValue: () => APP._has_life_ins,
      save: async (val) => { APP._has_life_ins = val; },
    },
    {
      id: 'life_insurance_type',
      phase: 'Assets',
      text: () => 'What type of life insurance is it?',
      sub: () => 'Term life insurance has no cash value and doesn\'t count as an asset. Whole or permanent life insurance builds up a cash value that does count.',
      type: 'choice',
      show: () => APP._has_life_ins === 'yes',
      choices: [
        { label: 'Term life — pure insurance, no cash value', value: 'term', icon: '📄' },
        { label: 'Whole life, universal life, or permanent — has a cash value', value: 'whole', icon: '💰' },
        { label: 'Not sure', value: 'unsure', icon: '❓' },
      ],
      getValue: () => APP._life_ins_type,
      save: async (val) => { APP._life_ins_type = val; if (val !== 'term') updateChecklist('life_insurance_policy', 'pending'); },
    },
    {
      id: 'life_insurance_detail',
      phase: 'Assets',
      text: () => 'What is the cash surrender value of the policy?',
      sub: () => 'The cash surrender value is what the insurance company would pay if the policy was cancelled today. This is what Medicaid counts — not the face value (death benefit). Find it on the most recent policy statement.',
      type: 'asset_entry',
      show: () => APP._has_life_ins === 'yes' && APP._life_ins_type !== 'term',
      assetType: 'life_insurance',
      assetIndex: 0,
      getValue: () => APP._life_ins_detail,
      save: async (val) => { APP._life_ins_detail = val; await addAssetEntry('life_insurance', val, 0); },
    },

    // Burial fund
    {
      id: 'has_burial',
      phase: 'Assets',
      text: () => `Does ${name()} have a prepaid funeral or burial plan?`,
      sub: () => 'Prepaid funeral plans are generally exempt from Medicaid\'s asset count, up to a limit that varies by state. An irrevocable plan (one that can\'t be cancelled) is more likely to be fully exempt.',
      type: 'yesno',
      getValue: () => APP._has_burial,
      save: async (val) => { APP._has_burial = val; },
    },
    {
      id: 'burial_type',
      phase: 'Assets',
      text: () => 'Is the burial plan revocable or irrevocable?',
      sub: () => 'Irrevocable means it can\'t be cancelled and the money can\'t be taken back. Irrevocable plans are more likely to be fully exempt from Medicaid. Revocable plans may count as assets.',
      type: 'choice',
      show: () => APP._has_burial === 'yes',
      choices: [
        { label: 'Irrevocable — cannot be cancelled', value: 'irrevocable', icon: '🔒' },
        { label: 'Revocable — could be cancelled', value: 'revocable', icon: '🔓' },
        { label: 'Not sure', value: 'unsure', icon: '❓' },
      ],
      getValue: () => APP._burial_type,
      save: async (val) => { APP._burial_type = val; updateChecklist('burial_contract', 'pending'); },
    },
    {
      id: 'burial_value',
      phase: 'Assets',
      text: () => 'What is the value of the burial plan?',
      type: 'number',
      placeholder: 'Value in dollars',
      show: () => APP._has_burial === 'yes',
      getValue: () => APP._burial_value,
      save: async (val) => {
        APP._burial_value = val;
        await addAssetEntry('burial_fund', { institution: 'Prepaid burial plan', value: val, is_exempt: APP._burial_type === 'irrevocable', exempt_reason: 'Irrevocable prepaid burial plan' }, 0);
      },
    },

    // Trusts
    {
      id: 'has_trust',
      phase: 'Assets',
      text: () => `Is ${name()} named in any trusts — either as the person who created it or as a beneficiary?`,
      type: 'yesno',
      getValue: () => APP._has_trust,
      save: async (val) => { APP._has_trust = val; },
    },
    {
      id: 'trust_type',
      phase: 'Assets',
      text: () => 'Is the trust revocable or irrevocable?',
      sub: () => 'A revocable trust (also called a living trust) can be changed or cancelled — Medicaid counts those assets as if they still belong to the applicant. An irrevocable trust generally cannot be changed. This distinction matters significantly for eligibility.',
      type: 'choice',
      show: () => APP._has_trust === 'yes',
      choices: [
        { label: 'Revocable living trust', value: 'revocable', icon: '🔓' },
        { label: 'Irrevocable trust', value: 'irrevocable', icon: '🔒' },
        { label: 'Special needs trust', value: 'special_needs', icon: '♿' },
        { label: 'Not sure', value: 'unsure', icon: '❓' },
      ],
      getValue: () => APP._trust_type,
      save: async (val) => { APP._trust_type = val; updateChecklist('trust_document', 'pending'); },
    },
    {
      id: 'trust_value',
      phase: 'Assets',
      text: () => 'What is the approximate value of assets in the trust?',
      type: 'number',
      placeholder: 'Value in dollars',
      show: () => APP._has_trust === 'yes',
      getValue: () => APP._trust_value,
      save: async (val) => {
        APP._trust_value = val;
        const isExempt = APP._trust_type === 'irrevocable' || APP._trust_type === 'special_needs';
        await addAssetEntry('trust_' + (APP._trust_type || 'rev'), { institution: (APP._trust_type || 'revocable') + ' trust', value: val, is_exempt: isExempt, exempt_reason: isExempt ? 'Irrevocable trust' : '' }, 0);
      },
    },
    {
      id: 'trust_when_created',
      phase: 'Assets',
      text: () => 'When was the trust created?',
      sub: () => 'If the trust was created within the past 60 months, it will be reviewed as part of the lookback period.',
      type: 'date',
      show: () => APP._has_trust === 'yes',
      getValue: () => APP._trust_created,
      save: async (val) => { APP._trust_created = val; },
    },

    // Annuities
    {
      id: 'has_annuity',
      phase: 'Assets',
      text: () => `Does ${name()} own an annuity?`,
      sub: () => 'An annuity is a contract with an insurance company that pays out regular income. Annuities have special Medicaid rules — some are counted as assets, others as income, and some must name the state as remainder beneficiary.',
      type: 'yesno',
      getValue: () => APP._has_annuity,
      save: async (val) => { APP._has_annuity = val; },
    },
    {
      id: 'annuity_detail',
      phase: 'Assets',
      text: () => 'Tell us about the annuity.',
      sub: () => 'Insurance company name, current value, monthly payment amount, and the date it was purchased.',
      type: 'asset_entry',
      show: () => APP._has_annuity === 'yes',
      assetType: 'annuity',
      assetIndex: 0,
      getValue: () => APP._annuity_1,
      save: async (val) => { APP._annuity_1 = val; await addAssetEntry('annuity', val, 0); updateChecklist('annuity_contract', 'pending'); },
    },
    {
      id: 'annuity_state_beneficiary',
      phase: 'Assets',
      text: () => 'Is the state named as remainder beneficiary on the annuity?',
      sub: () => 'For Medicaid-compliant annuities, the state must be named as the primary beneficiary for the amount Medicaid has paid, or secondary if there is a community spouse or minor/disabled child. This is a requirement in most states.',
      type: 'yesno',
      show: () => APP._has_annuity === 'yes',
      getValue: () => APP._annuity_state_bene,
      save: async (val) => { APP._annuity_state_bene = val; },
    },

    // Other assets
    {
      id: 'has_hsa',
      phase: 'Assets',
      text: () => `Does ${name()} have a Health Savings Account (HSA)?`,
      type: 'yesno',
      getValue: () => APP._has_hsa,
      save: async (val) => { APP._has_hsa = val; },
    },
    {
      id: 'hsa_value',
      phase: 'Assets',
      text: () => 'What is the current balance of the HSA?',
      type: 'number',
      placeholder: 'Balance in dollars',
      show: () => APP._has_hsa === 'yes',
      getValue: () => APP._hsa_value,
      save: async (val) => { APP._hsa_value = val; await addAssetEntry('other', { institution: 'Health Savings Account', value: val, is_exempt: false }, 0); },
    },
    {
      id: 'has_savings_bonds',
      phase: 'Assets',
      text: () => `Does ${name()} have any U.S. savings bonds?`,
      type: 'yesno',
      getValue: () => APP._has_bonds,
      save: async (val) => { APP._has_bonds = val; },
    },
    {
      id: 'has_nursing_trust_account',
      phase: 'Assets',
      text: () => `Does ${name()} have a trust/comfort account at the nursing home?`,
      sub: () => 'Many nursing homes hold a small account for residents to use for personal purchases. This is a countable asset.',
      type: 'yesno',
      getValue: () => APP._has_nh_trust,
      save: async (val) => { APP._has_nh_trust = val; },
    },
    {
      id: 'nh_trust_balance',
      phase: 'Assets',
      text: () => 'What is the current balance of the nursing home trust account?',
      type: 'number',
      placeholder: 'Balance in dollars',
      show: () => APP._has_nh_trust === 'yes',
      getValue: () => APP._nh_trust_val,
      save: async (val) => { APP._nh_trust_val = val; await addAssetEntry('other', { institution: 'Nursing home trust account', value: val, is_exempt: false }, 99); updateChecklist('nh_trust_account', 'pending'); },
    },
    {
      id: 'closed_accounts',
      phase: 'Assets',
      text: () => `In the past 5 years, were any of ${name()}'s accounts closed?`,
      sub: () => 'Any account that was open at any point in the past 60 months — even if closed now — must be documented with a closing statement showing a zero balance.',
      type: 'yesno',
      getValue: () => APP._has_closed_accounts,
      save: async (val) => { APP._has_closed_accounts = val; if (val === 'yes') updateChecklist('closed_account_statements', 'missing'); },
    },
    {
      id: 'other_assets',
      phase: 'Assets',
      text: () => `Are there any other assets we haven't covered — business interests, livestock, farm equipment, promissory notes owed to ${name()}, or anything else of value?`,
      type: 'yesno',
      getValue: () => APP._has_other_assets,
      save: async (val) => { APP._has_other_assets = val; },
    },
    {
      id: 'other_assets_detail',
      phase: 'Assets',
      text: () => 'Please describe the other asset and its approximate value.',
      type: 'textarea',
      placeholder: 'Description and value — e.g. "50% interest in family business, approx. $40,000"',
      show: () => APP._has_other_assets === 'yes',
      getValue: () => APP._other_assets_desc,
      save: async (val) => { APP._other_assets_desc = val; await addAssetEntry('other', { institution: val, value: 0, is_exempt: false }, 98); },
    },

    // ── PHASE 6: Income ──────────────────────────────────────────────────

    {
      id: 'phase6_intro',
      phase: 'Income',
      type: 'info',
      text: () => `Next: ${name()}'s income.`,
      sub: () => `Once approved for Medicaid, nearly all of ${name()}'s income goes toward the nursing home cost. ${name()} keeps only the Personal Needs Allowance — ${APP.state && getStateData(APP.state) ? '$'+getStateData(APP.state).pna : 'a small monthly amount'} per month${APP.marital_status === 'married' ? `, and some may go to support ${spouseName()}` : ''}. We need to document every source.`,
    },

    {
      id: 'has_social_security',
      phase: 'Income',
      text: () => `Does ${name()} receive Social Security — retirement, survivor, or disability benefits?`,
      type: 'yesno',
      getValue: () => APP._has_ss,
      save: async (val) => { APP._has_ss = val; if (val === 'yes') updateChecklist('ss_award_letter', 'pending'); },
    },
    {
      id: 'social_security_amount',
      phase: 'Income',
      text: () => `What is ${name()}'s gross monthly Social Security benefit?`,
      sub: () => 'Use the gross amount — before Medicare premiums or other deductions are taken out. Find it on the Social Security award letter or benefit verification letter.',
      type: 'number',
      placeholder: 'Monthly amount in dollars',
      show: () => APP._has_ss === 'yes',
      getValue: () => APP._ss_amount,
      save: async (val) => { APP._ss_amount = val; await addIncomeEntry('applicant', 'ss_retirement', 'Social Security Administration', val, 'monthly'); },
    },

    {
      id: 'has_pension',
      phase: 'Income',
      text: () => `Does ${name()} receive a pension or retirement plan distribution?`,
      type: 'yesno',
      getValue: () => APP._has_pension,
      save: async (val) => { APP._has_pension = val; if (val === 'yes') updateChecklist('pension_statement', 'pending'); },
    },
    {
      id: 'pension_payer',
      phase: 'Income',
      text: () => `Who pays the pension?`,
      sub: () => 'For example: a former employer, union, or government agency.',
      type: 'text',
      placeholder: 'Pension payer name',
      show: () => APP._has_pension === 'yes',
      getValue: () => APP._pension_payer,
      save: async (val) => { APP._pension_payer = val; },
    },
    {
      id: 'pension_amount',
      phase: 'Income',
      text: () => `What is the gross monthly pension amount?`,
      type: 'number',
      placeholder: 'Monthly amount in dollars',
      show: () => APP._has_pension === 'yes',
      getValue: () => APP._pension_amount,
      save: async (val) => { APP._pension_amount = val; await addIncomeEntry('applicant', 'pension', APP._pension_payer || 'Pension', val, 'monthly'); },
    },

    {
      id: 'has_va',
      phase: 'Income',
      text: () => `Does ${name()} receive VA (Veterans Administration) benefits?`,
      type: 'yesno',
      getValue: () => APP._has_va,
      save: async (val) => { APP._has_va = val; if (val === 'yes') updateChecklist('va_award_letter', 'pending'); },
    },
    {
      id: 'va_amount',
      phase: 'Income',
      text: () => 'What is the gross monthly VA benefit amount?',
      type: 'number',
      placeholder: 'Monthly amount in dollars',
      show: () => APP._has_va === 'yes',
      getValue: () => APP._va_amount,
      save: async (val) => { APP._va_amount = val; await addIncomeEntry('applicant', 'va', 'Department of Veterans Affairs', val, 'monthly'); },
    },

    {
      id: 'has_rental_income',
      phase: 'Income',
      text: () => `Does ${name()} receive rental income from any property?`,
      type: 'yesno',
      getValue: () => APP._has_rental,
      save: async (val) => { APP._has_rental = val; },
    },
    {
      id: 'rental_gross',
      phase: 'Income',
      text: () => 'What is the gross monthly rental income?',
      sub: () => 'The gross amount before expenses. We\'ll ask about expenses separately — Medicaid allows deductions for mortgage, taxes, insurance, and maintenance on rental properties.',
      type: 'number',
      placeholder: 'Monthly rent received',
      show: () => APP._has_rental === 'yes',
      getValue: () => APP._rental_gross,
      save: async (val) => { APP._rental_gross = val; await addIncomeEntry('applicant', 'rental', 'Rental property', val, 'monthly'); },
    },
    {
      id: 'rental_expenses',
      phase: 'Income',
      text: () => 'What are the total monthly expenses on the rental property?',
      sub: () => 'Include mortgage payment, property taxes (monthly share), insurance, and regular maintenance costs.',
      type: 'number',
      placeholder: 'Monthly expenses',
      show: () => APP._has_rental === 'yes',
      getValue: () => APP._rental_expenses,
      save: async (val) => { APP._rental_expenses = val; },
    },

    {
      id: 'has_annuity_income',
      phase: 'Income',
      text: () => `Does ${name()} receive monthly payments from an annuity?`,
      type: 'yesno',
      show: () => APP._has_annuity !== 'yes', // avoid duplicate if already asked
      getValue: () => APP._has_annuity_income,
      save: async (val) => { APP._has_annuity_income = val; },
    },

    {
      id: 'has_other_income',
      phase: 'Income',
      text: () => `Does ${name()} have any other income — interest, dividends, alimony, or anything else?`,
      type: 'yesno',
      getValue: () => APP._has_other_income,
      save: async (val) => { APP._has_other_income = val; },
    },
    {
      id: 'other_income_detail',
      phase: 'Income',
      text: () => 'Briefly describe the other income and the monthly amount.',
      type: 'textarea',
      placeholder: 'e.g. "Interest from savings bonds, approx. $50/month"',
      show: () => APP._has_other_income === 'yes',
      getValue: () => APP._other_income_desc,
      save: async (val) => { APP._other_income_desc = val; await addIncomeEntry('applicant', 'other', val, 0, 'monthly'); },
    },

    // Spouse income
    {
      id: 'phase6_spouse_intro',
      phase: 'Income',
      type: 'info',
      show: () => APP.marital_status === 'married',
      text: () => `Now let's cover ${spouseName()}'s income.`,
      sub: () => `${spouseName()}'s income is protected — it does not count toward ${name()}'s Medicaid eligibility. But we still need to document it, because it determines how much of ${name()}'s income can be diverted to ${spouseName()} as a Monthly Maintenance Needs Allowance.`,
    },
    {
      id: 'spouse_has_ss',
      phase: 'Income',
      show: () => APP.marital_status === 'married',
      text: () => `Does ${spouseName()} receive Social Security?`,
      type: 'yesno',
      getValue: () => APP._spouse_has_ss,
      save: async (val) => { APP._spouse_has_ss = val; },
    },
    {
      id: 'spouse_ss_amount',
      phase: 'Income',
      text: () => `What is ${spouseName()}'s gross monthly Social Security benefit?`,
      type: 'number',
      placeholder: 'Monthly amount in dollars',
      show: () => APP.marital_status === 'married' && APP._spouse_has_ss === 'yes',
      getValue: () => APP._spouse_ss_amount,
      save: async (val) => { APP._spouse_ss_amount = val; await addIncomeEntry('spouse', 'ss_retirement', 'Social Security Administration', val, 'monthly'); },
    },
    {
      id: 'spouse_has_pension',
      phase: 'Income',
      show: () => APP.marital_status === 'married',
      text: () => `Does ${spouseName()} receive a pension?`,
      type: 'yesno',
      getValue: () => APP._spouse_has_pension,
      save: async (val) => { APP._spouse_has_pension = val; },
    },
    {
      id: 'spouse_pension_amount',
      phase: 'Income',
      text: () => `What is ${spouseName()}'s gross monthly pension?`,
      type: 'number',
      placeholder: 'Monthly amount in dollars',
      show: () => APP.marital_status === 'married' && APP._spouse_has_pension === 'yes',
      getValue: () => APP._spouse_pension_amount,
      save: async (val) => { APP._spouse_pension_amount = val; await addIncomeEntry('spouse', 'pension', 'Pension', val, 'monthly'); },
    },
    {
      id: 'spouse_other_income',
      phase: 'Income',
      show: () => APP.marital_status === 'married',
      text: () => `Does ${spouseName()} have any other income?`,
      type: 'yesno',
      getValue: () => APP._spouse_other_income,
      save: async (val) => { APP._spouse_other_income = val; },
    },

    // ── PHASE 7: Documents ───────────────────────────────────────────────

    {
      id: 'phase7_intro',
      phase: 'Documents',
      type: 'info',
      text: () => 'Now let\'s collect the documents.',
      sub: () => 'This is the most important part. We\'ll go through every document one at a time — what it is, why it\'s needed, and where to get it if you don\'t have it yet. Upload each one right here. The application can\'t be submitted until everything is uploaded.',
    },

    // Identity documents
    {
      id: 'doc_photo_id',
      phase: 'Documents',
      text: () => `We need a government photo ID for ${name()}.`,
      sub: () => 'A driver\'s license, state ID card, or passport. Upload a clear photo or scan of the front (and back if a driver\'s license). If none are available, a Medicare card plus a birth certificate can substitute.',
      type: 'document_upload',
      docKey: 'photo_id',
      getValue: () => CHECKLIST['photo_id'],
      save: async (val) => { updateChecklist('photo_id', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_birth_cert',
      phase: 'Documents',
      text: () => `We need proof of ${name()}'s date of birth.`,
      sub: () => 'A birth certificate, passport, or naturalization certificate. If you can\'t locate the birth certificate, the Social Security Administration can sometimes verify age electronically — let us know and staff can help.',
      type: 'document_upload',
      docKey: 'birth_certificate',
      getValue: () => CHECKLIST['birth_certificate'],
      save: async (val) => { updateChecklist('birth_certificate', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_ss_card',
      phase: 'Documents',
      text: () => `We need the Social Security award letter or benefit verification letter for ${name()}.`,
      sub: () => 'This shows the current gross Social Security benefit. You can get a benefit verification letter instantly at ssa.gov/myaccount, or call 1-800-772-1213 and request one by mail.',
      type: 'document_upload',
      docKey: 'ss_award_letter',
      getValue: () => CHECKLIST['ss_award_letter'],
      save: async (val) => { updateChecklist('ss_award_letter', val === 'uploaded' ? 'done' : 'pending'); },
    },
    {
      id: 'doc_medicare_card',
      phase: 'Documents',
      text: () => `We need ${name()}'s Medicare card.`,
      sub: () => 'Upload a photo of the front and back. If the card is lost, call 1-800-MEDICARE (1-800-633-4227) to request a replacement, or print one at medicare.gov.',
      type: 'document_upload',
      show: () => APPL._has_medicare === 'yes' || APPL.medicare_number,
      docKey: 'medicare_card',
      getValue: () => CHECKLIST['medicare_card'],
      save: async (val) => { updateChecklist('medicare_card', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_marriage_cert',
      phase: 'Documents',
      text: () => 'We need the marriage certificate.',
      sub: () => 'The official marriage certificate showing both names and the date of marriage. If lost, contact the vital records office of the state or county where the marriage took place.',
      type: 'document_upload',
      show: () => APP.marital_status === 'married',
      docKey: 'marriage_certificate',
      getValue: () => CHECKLIST['marriage_certificate'],
      save: async (val) => { updateChecklist('marriage_certificate', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_divorce_decree',
      phase: 'Documents',
      text: () => 'We need the divorce decree or death certificate from the prior marriage.',
      sub: () => 'If there was a prior marriage that ended in divorce, we need the divorce decree. If the prior spouse passed away, a death certificate is needed instead.',
      type: 'document_upload',
      show: () => APP._prior_married === 'yes',
      docKey: 'divorce_or_death_cert',
      getValue: () => CHECKLIST['divorce_or_death_cert'],
      save: async (val) => { updateChecklist('divorce_or_death_cert', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_poa',
      phase: 'Documents',
      text: () => `We need a copy of the Power of Attorney or guardianship paperwork.`,
      sub: () => 'Upload the signed, executed POA document. If it was signed before a notary, include the notarized version. Court guardianship orders should include the court stamp.',
      type: 'document_upload',
      show: () => APP._has_poa === 'yes',
      docKey: 'poa_document',
      getValue: () => CHECKLIST['poa_document'],
      save: async (val) => { updateChecklist('poa_document', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_nfloc',
      phase: 'Documents',
      text: () => 'We need the nursing facility level of care documentation.',
      sub: () => 'This is the physician\'s or facility\'s written assessment confirming that nursing home level of care is required. The facility social worker can provide this — it is a standard part of the admission process.',
      type: 'document_upload',
      docKey: 'nfloc_documentation',
      getValue: () => CHECKLIST['nfloc_documentation'],
      save: async (val) => { updateChecklist('nfloc_documentation', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_admission_records',
      phase: 'Documents',
      text: () => `We need the nursing home admission records and account statement.`,
      sub: () => 'Ask the nursing home billing department for a copy of the admission agreement and current account statement showing the private-pay rate.',
      type: 'document_upload',
      show: () => APP._in_facility === 'yes',
      docKey: 'admission_records',
      getValue: () => CHECKLIST['admission_records'],
      save: async (val) => { updateChecklist('admission_records', val === 'uploaded' ? 'done' : 'missing'); },
    },

    // Bank statements
    {
      id: 'doc_bank_statements_intro',
      phase: 'Documents',
      type: 'info',
      text: () => 'Now: 5 years of bank statements.',
      sub: () => `This is required for every account — checking, savings, CDs — open or closed at any point in the past ${APP.state && getStateData(APP.state) ? getStateData(APP.state).lookback : 60} months. We'll go one account at a time. For each account, you'll need statements from ${new Date(Date.now() - (APP.state && getStateData(APP.state) ? getStateData(APP.state).lookback : 60)*30*24*60*60*1000).toLocaleDateString('en-US',{month:'long',year:'numeric'})} to today.`,
    },
    {
      id: 'doc_checking_stmts',
      phase: 'Documents',
      text: () => `Upload all statements for the checking account${APP._checking_1?.institution ? ' at ' + APP._checking_1.institution : ''}.`,
      sub: () => 'Upload all monthly statements going back 60 months. Most banks let you download these as PDFs through online banking. You can upload multiple files.',
      type: 'document_upload',
      show: () => APP._has_checking === 'yes',
      docKey: 'bank_checking_1',
      getValue: () => CHECKLIST['bank_checking_1'],
      save: async (val) => { updateChecklist('bank_checking_1', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_checking_2_stmts',
      phase: 'Documents',
      text: () => `Upload all statements for the second checking account${APP._checking_2?.institution ? ' at ' + APP._checking_2.institution : ''}.`,
      sub: () => 'All monthly statements going back 60 months.',
      type: 'document_upload',
      show: () => APP._has_checking === 'yes' && (APP._checking_count === '2' || APP._checking_count === '3+'),
      docKey: 'bank_checking_2',
      getValue: () => CHECKLIST['bank_checking_2'],
      save: async (val) => { updateChecklist('bank_checking_2', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_savings_stmts',
      phase: 'Documents',
      text: () => `Upload all statements for the savings account${APP._savings_1?.institution ? ' at ' + APP._savings_1.institution : ''}.`,
      sub: () => 'All monthly or quarterly statements going back 60 months.',
      type: 'document_upload',
      show: () => APP._has_savings === 'yes',
      docKey: 'bank_savings_1',
      getValue: () => CHECKLIST['bank_savings_1'],
      save: async (val) => { updateChecklist('bank_savings_1', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_cd_stmts',
      phase: 'Documents',
      text: () => `Upload statements for the CD.`,
      sub: () => 'The most recent statement showing current value and maturity date, plus any statements from the past 60 months.',
      type: 'document_upload',
      show: () => APP._has_cd === 'yes',
      docKey: 'bank_cd_1',
      getValue: () => CHECKLIST['bank_cd_1'],
      save: async (val) => { updateChecklist('bank_cd_1', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_investment_stmts',
      phase: 'Documents',
      text: () => `Upload statements for the investment or brokerage account.`,
      sub: () => 'Quarterly statements going back 60 months, plus the most recent statement.',
      type: 'document_upload',
      show: () => APP._has_brokerage === 'yes',
      docKey: 'investment_stmt_1',
      getValue: () => CHECKLIST['investment_stmt_1'],
      save: async (val) => { updateChecklist('investment_stmt_1', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_retirement_stmts',
      phase: 'Documents',
      text: () => `Upload statements for the retirement account.`,
      sub: () => 'Quarterly statements going back 60 months, plus the most recent statement showing current balance. If in payout status, include documentation of the required minimum distribution (RMD) amount.',
      type: 'document_upload',
      show: () => APP._has_retirement === 'yes',
      docKey: 'retirement_stmt_1',
      getValue: () => CHECKLIST['retirement_stmt_1'],
      save: async (val) => { updateChecklist('retirement_stmt_1', val === 'uploaded' ? 'done' : 'missing'); },
    },

    // Property documents
    {
      id: 'doc_home_deed',
      phase: 'Documents',
      text: () => 'Upload the deed for the primary home.',
      sub: () => 'The official recorded deed showing ownership. If you can\'t locate the deed, contact the county recorder\'s office — deeds are public records and can usually be obtained online or in person for a small fee.',
      type: 'document_upload',
      show: () => APP._has_home === 'yes',
      docKey: 'home_deed',
      getValue: () => CHECKLIST['home_deed'],
      save: async (val) => { updateChecklist('home_deed', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_home_tax',
      phase: 'Documents',
      text: () => 'Upload the most recent property tax statement for the home.',
      sub: () => 'The annual property tax bill from the county or municipality.',
      type: 'document_upload',
      show: () => APP._has_home === 'yes',
      docKey: 'home_tax_statement',
      getValue: () => CHECKLIST['home_tax_statement'],
      save: async (val) => { updateChecklist('home_tax_statement', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_home_insurance',
      phase: 'Documents',
      text: () => 'Upload proof of homeowner\'s insurance.',
      sub: () => 'The declarations page from the homeowner\'s insurance policy.',
      type: 'document_upload',
      show: () => APP._has_home === 'yes',
      docKey: 'home_insurance',
      getValue: () => CHECKLIST['home_insurance'],
      save: async (val) => { updateChecklist('home_insurance', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_vehicle_title',
      phase: 'Documents',
      text: () => `Upload the vehicle title.`,
      sub: () => 'The certificate of title showing ownership. If the title is lost, contact your state\'s DMV to request a duplicate.',
      type: 'document_upload',
      show: () => APP._has_vehicle === 'yes',
      docKey: 'vehicle_title_1',
      getValue: () => CHECKLIST['vehicle_title_1'],
      save: async (val) => { updateChecklist('vehicle_title_1', val === 'uploaded' ? 'done' : 'missing'); },
    },

    // Insurance and other documents
    {
      id: 'doc_life_insurance',
      phase: 'Documents',
      text: () => 'Upload the life insurance policy and most recent statement showing cash surrender value.',
      sub: () => 'The full policy document plus the most recent annual statement. The cash surrender value figure is what matters for Medicaid.',
      type: 'document_upload',
      show: () => APP._has_life_ins === 'yes' && APP._life_ins_type !== 'term',
      docKey: 'life_insurance_policy',
      getValue: () => CHECKLIST['life_insurance_policy'],
      save: async (val) => { updateChecklist('life_insurance_policy', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_burial_contract',
      phase: 'Documents',
      text: () => 'Upload the prepaid funeral or burial contract.',
      sub: () => 'The contract must state the type of plan, the owner\'s name, current value, and whether it is revocable or irrevocable.',
      type: 'document_upload',
      show: () => APP._has_burial === 'yes',
      docKey: 'burial_contract',
      getValue: () => CHECKLIST['burial_contract'],
      save: async (val) => { updateChecklist('burial_contract', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_trust',
      phase: 'Documents',
      text: () => 'Upload the complete trust document.',
      sub: () => 'Include the full trust agreement, plus Schedule A (the list of assets held in the trust) if there is one. All transactions involving the trust for the past 60 months must also be documented.',
      type: 'document_upload',
      show: () => APP._has_trust === 'yes',
      docKey: 'trust_document',
      getValue: () => CHECKLIST['trust_document'],
      save: async (val) => { updateChecklist('trust_document', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_annuity',
      phase: 'Documents',
      text: () => 'Upload the annuity contract.',
      sub: () => 'The complete annuity contract showing the insurer, owner, annuitant, beneficiaries, current value, and payment terms. Include any amendments or endorsements.',
      type: 'document_upload',
      show: () => APP._has_annuity === 'yes',
      docKey: 'annuity_contract',
      getValue: () => CHECKLIST['annuity_contract'],
      save: async (val) => { updateChecklist('annuity_contract', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_ltc_insurance',
      phase: 'Documents',
      text: () => 'Upload the long-term care insurance policy.',
      sub: () => 'Include the full policy and the most recent benefit statement. If benefits are currently being paid, include the most recent payment confirmation.',
      type: 'document_upload',
      show: () => APPL._has_ltc_insurance === 'yes',
      docKey: 'ltc_insurance_policy',
      getValue: () => CHECKLIST['ltc_insurance_policy'],
      save: async (val) => { updateChecklist('ltc_insurance_policy', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_pension',
      phase: 'Documents',
      text: () => 'Upload the pension award letter or most recent pension statement.',
      sub: () => 'A letter from the pension administrator or the most recent monthly stub showing the gross benefit amount.',
      type: 'document_upload',
      show: () => APP._has_pension === 'yes',
      docKey: 'pension_statement',
      getValue: () => CHECKLIST['pension_statement'],
      save: async (val) => { updateChecklist('pension_statement', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_va',
      phase: 'Documents',
      text: () => 'Upload the VA award letter.',
      sub: () => 'The official letter from the Department of Veterans Affairs showing the current monthly benefit amount.',
      type: 'document_upload',
      show: () => APP._has_va === 'yes',
      docKey: 'va_award_letter',
      getValue: () => CHECKLIST['va_award_letter'],
      save: async (val) => { updateChecklist('va_award_letter', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'doc_closed_accounts',
      phase: 'Documents',
      text: () => 'Upload closing statements for any accounts closed in the past 5 years.',
      sub: () => 'Each closed account needs a final statement showing a zero balance. If you can\'t get the closing statement, contact the bank and ask for account history or a letter confirming the account was closed and the final balance.',
      type: 'document_upload',
      show: () => APP._has_closed_accounts === 'yes',
      docKey: 'closed_account_statements',
      getValue: () => CHECKLIST['closed_account_statements'],
      save: async (val) => { updateChecklist('closed_account_statements', val === 'uploaded' ? 'done' : 'missing'); },
    },

    // ── PHASE 8: Transfers / Lookback ────────────────────────────────────

    {
      id: 'phase8_intro',
      phase: 'Transfers',
      type: 'info',
      text: () => 'Almost done — one more required section.',
      sub: () => `Medicaid is required by law to review every financial transaction made in the past ${APP.state && getStateData(APP.state) ? getStateData(APP.state).lookback : 60} months. This is called the "lookback period." We need to account for any money or property that left ${name()}'s ownership during that time — gifts, donations, sales, transfers to trusts, or anything else. This section is mandatory for everyone — it's not about whether anything was given away, it's about documenting the complete financial history.`,
    },
    {
      id: 'transfers_irs_warning',
      phase: 'Transfers',
      type: 'info',
      text: () => 'Important: the IRS gift tax rules do NOT apply here.',
      sub: () => 'Many families believe that gifts under the annual IRS limit ($19,000 per person in 2026) don\'t need to be disclosed. This is incorrect for Medicaid. Every transfer — regardless of size — must be disclosed. Medicaid and the IRS have completely separate rules. A $5,000 gift to a grandchild is just as important to disclose as a $50,000 one.',
    },
    {
      id: 'has_gifts',
      phase: 'Transfers',
      text: () => `In the past ${APP.state && getStateData(APP.state) ? getStateData(APP.state).lookback : 60} months, did ${name()} or ${APP.marital_status === 'married' ? spouseName() : 'anyone acting on their behalf'} give money or property to anyone?`,
      sub: () => 'Include cash gifts, checks, wire transfers, gifted property, and charitable donations of any amount.',
      type: 'yesno',
      getValue: () => APP._has_gifts,
      save: async (val) => { APP._has_gifts = val; },
    },
    {
      id: 'gift_1_description',
      phase: 'Transfers',
      text: () => 'What was given away?',
      sub: () => 'Describe what was transferred — for example: "Cash gift", "Bank account funds", "Home at 123 Main Street", "Stocks".',
      type: 'text',
      placeholder: 'What was transferred',
      show: () => APP._has_gifts === 'yes',
      getValue: () => APP._gift_1_desc,
      save: async (val) => { APP._gift_1_desc = val; },
    },
    {
      id: 'gift_1_date',
      phase: 'Transfers',
      text: () => 'When did this transfer happen?',
      type: 'date',
      show: () => APP._has_gifts === 'yes',
      getValue: () => APP._gift_1_date,
      save: async (val) => { APP._gift_1_date = val; },
    },
    {
      id: 'gift_1_fmv',
      phase: 'Transfers',
      text: () => 'What was it worth at the time of the transfer?',
      sub: () => 'The fair market value — what it would have sold for to a stranger at that time. For cash, this is simply the amount given.',
      type: 'number',
      placeholder: 'Fair market value in dollars',
      show: () => APP._has_gifts === 'yes',
      getValue: () => APP._gift_1_fmv,
      save: async (val) => { APP._gift_1_fmv = val; },
    },
    {
      id: 'gift_1_received',
      phase: 'Transfers',
      text: () => 'What was received in return?',
      sub: () => 'If nothing was received — it was a pure gift — enter 0. If something was received (for example, a sale), enter the amount received.',
      type: 'number',
      placeholder: '0 if it was a gift',
      show: () => APP._has_gifts === 'yes',
      getValue: () => APP._gift_1_received,
      save: async (val) => {
        APP._gift_1_received = val;
        const uv = Math.max(0, (parseFloat(APP._gift_1_fmv)||0) - (parseFloat(val)||0));
        await addTransferEntry({
          transfer_date: APP._gift_1_date,
          asset_description: APP._gift_1_desc,
          fair_market_value: parseFloat(APP._gift_1_fmv)||0,
          amount_received: parseFloat(val)||0,
          uncompensated_value: uv,
          recipient_name: APP._gift_1_recipient,
          recipient_relationship: APP._gift_1_rel,
          needs_attorney_review: uv > 0,
        }, 0);
        if (uv > 0) updateChecklist('transfer_docs_1', 'missing');
      },
    },
    {
      id: 'gift_1_recipient',
      phase: 'Transfers',
      text: () => 'Who received it?',
      sub: () => 'Name and relationship to the applicant. For example: "David Bernstein, son" or "First Presbyterian Church".',
      type: 'text',
      placeholder: 'Name and relationship',
      show: () => APP._has_gifts === 'yes',
      getValue: () => APP._gift_1_recipient,
      save: async (val) => { APP._gift_1_recipient = val; },
    },
    {
      id: 'gift_1_was_loan',
      phase: 'Transfers',
      text: () => 'Was this a loan that is expected to be repaid?',
      sub: () => 'If the transfer was structured as a loan with a repayment agreement, it may not be counted as a gift. A written promissory note signed before the transfer significantly helps.',
      type: 'yesno',
      show: () => APP._has_gifts === 'yes',
      getValue: () => APP._gift_1_loan,
      save: async (val) => { APP._gift_1_loan = val; if (val === 'yes') updateChecklist('promissory_note_1', 'pending'); },
    },
    {
      id: 'gift_1_doc',
      phase: 'Documents',
      text: () => `Upload documentation for the transfer of ${APP._gift_1_desc || 'the asset'}.`,
      sub: () => 'Any evidence of the transfer — a cancelled check, bank statement showing the withdrawal, deed, or gift letter. If it was a loan, include the promissory note.',
      type: 'document_upload',
      show: () => APP._has_gifts === 'yes',
      docKey: 'transfer_docs_1',
      getValue: () => CHECKLIST['transfer_docs_1'],
      save: async (val) => { updateChecklist('transfer_docs_1', val === 'uploaded' ? 'done' : 'missing'); },
    },
    {
      id: 'has_more_gifts',
      phase: 'Transfers',
      text: () => 'Were there any other transfers, gifts, or sales at below fair market value in the past 5 years?',
      sub: () => 'Include charitable donations, transfers to trusts, property sales at reduced prices, or any other transfer where less than full value was received.',
      type: 'yesno',
      show: () => APP._has_gifts === 'yes',
      getValue: () => APP._has_more_gifts,
      save: async (val) => {
        APP._has_more_gifts = val;
        if (val === 'yes') updateChecklist('additional_transfer_docs', 'missing');
      },
    },
    {
      id: 'more_gifts_note',
      phase: 'Transfers',
      type: 'info',
      show: () => APP._has_more_gifts === 'yes',
      text: () => 'Staff will follow up about additional transfers.',
      sub: () => 'Please upload any documentation you have for additional transfers in the document section. A staff member will reach out to walk through each one in detail to make sure everything is properly documented.',
    },
    {
      id: 'additional_transfer_docs',
      phase: 'Documents',
      text: () => 'Upload documentation for any additional transfers.',
      sub: () => 'Bank statements, cancelled checks, deeds, gift letters, or any other evidence of additional transfers. You can upload multiple files.',
      type: 'document_upload',
      show: () => APP._has_more_gifts === 'yes',
      docKey: 'additional_transfer_docs',
      getValue: () => CHECKLIST['additional_transfer_docs'],
      save: async (val) => { updateChecklist('additional_transfer_docs', val === 'uploaded' ? 'done' : 'pending'); },
    },
    {
      id: 'has_annuity_changes',
      phase: 'Transfers',
      text: () => `In the past 5 years, was any annuity purchased, modified, or annuitized?`,
      sub: () => 'Changes to annuity contracts within the lookback period are specifically reviewed by Medicaid. This includes purchasing a new annuity, adding riders, or changing the beneficiary.',
      type: 'yesno',
      getValue: () => APP._annuity_changes,
      save: async (val) => { APP._annuity_changes = val; },
    },

    // ── PHASE 9: Review ──────────────────────────────────────────────────

    {
      id: 'phase9_intro',
      phase: 'Review',
      type: 'info',
      text: () => `You're almost done, ${name().split(' ')[0]}.`,
      sub: () => 'Let\'s review what\'s been collected and what\'s still needed. Once everything on your checklist is complete, your application will be sent to staff for review.',
    },
    {
      id: 'review_summary',
      phase: 'Review',
      type: 'review_screen',
      text: () => 'Application summary',
      getValue: () => null,
      save: async () => {
        // Mark application as submitted
        if (appId !== 'demo') {
          await sb.from('applications').update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', appId);
          APP.status = 'submitted';
        }
      },
    },


  ]; // end QUESTIONS

  /* ------------------------------------------------------------------------
     Asset / income / transfer save helpers
  ------------------------------------------------------------------------ */
  let _assetEntries = {};  // keyed by type+index
  let _incomeEntries = {}; // keyed by person+type
  let _transferEntries = []; // array

  async function addAssetEntry(assetType, val, idx) {
    if (appId === 'demo') return;
    const key = assetType + '_' + idx;
    const data = {
      application_id: appId,
      owner: val.owner || 'applicant',
      asset_type: assetType,
      institution: val.institution || val.description || String(val),
      account_last4: val.account_last4 || val.last4 || '',
      description: val.institution || val.description || String(val),
      value: parseFloat(val.value || val) || 0,
      is_exempt: val.is_exempt || false,
      exempt_reason: val.exempt_reason || ''
    };
    if (_assetEntries[key]) {
      await sb.from('assets').update(data).eq('id', _assetEntries[key]);
    } else {
      const { data: row } = await sb.from('assets').insert(data).select().single();
      if (row) _assetEntries[key] = row.id;
    }
  }

  async function addIncomeEntry(person, incomeType, payer, amount, frequency) {
    if (appId === 'demo') return;
    const key = person + '_' + incomeType;
    const data = { application_id: appId, person, income_type: incomeType, payer: payer || '', amount: parseFloat(amount)||0, frequency };
    if (_incomeEntries[key]) {
      await sb.from('income_sources').update(data).eq('id', _incomeEntries[key]);
    } else {
      const { data: row } = await sb.from('income_sources').insert(data).select().single();
      if (row) _incomeEntries[key] = row.id;
    }
  }

  async function addTransferEntry(fields, idx) {
    if (appId === 'demo') return;
    if (_transferEntries[idx]) {
      await sb.from('transfers').update(fields).eq('id', _transferEntries[idx]);
    } else {
      const data = { application_id: appId, ...fields };
      const { data: row } = await sb.from('transfers').insert(data).select().single();
      if (row) _transferEntries[idx] = row.id;
    }
  }

  /* ------------------------------------------------------------------------
     Document upload handler
  ------------------------------------------------------------------------ */
  window.handleDocUpload = async function(docKey, input) {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.getElementById('upload_status_' + docKey);
    if (statusEl) { statusEl.textContent = 'Uploading…'; statusEl.style.color = '#c2850c'; }

    if (appId === 'demo') {
      if (statusEl) { statusEl.textContent = '✅ Uploaded (demo mode — not saved)'; statusEl.style.color = '#2b5b33'; }
      updateChecklist(docKey, 'done');
      const q = FLOW[qIndex];
      if (q && q.save) await q.save('uploaded');
      return;
    }

    const path = appId + '/' + docKey + '_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const { error: upErr } = await sb.storage.from('documents').upload(path, file);
    if (upErr) {
      if (statusEl) { statusEl.textContent = 'Upload failed: ' + upErr.message; statusEl.style.color = '#b50909'; }
      return;
    }
    await sb.from('documents').insert({ application_id: appId, uploaded_by: window._currentUserId || null, doc_type: docKey, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
    updateChecklist(docKey, 'done');
    if (statusEl) { statusEl.textContent = '✅ ' + file.name + ' uploaded successfully'; statusEl.style.color = '#2b5b33'; }
    const q = FLOW[qIndex];
    if (q && q.save) await q.save('uploaded');
  };

  /* ------------------------------------------------------------------------
     Asset entry type — renders inline mini-form, saves on Continue
  ------------------------------------------------------------------------ */
  function renderAssetEntryInput(q) {
    const v = q.getValue() || {};
    return `
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        <div>
          <label style="font-weight:700;font-size:0.95rem;display:block;margin-bottom:6px;">Institution or description</label>
          <input type="text" id="ae_inst" class="q-input" value="${esc(v.institution||'')}" placeholder="Bank or institution name">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-weight:700;font-size:0.95rem;display:block;margin-bottom:6px;">Account last 4 digits</label>
            <input type="text" id="ae_last4" class="q-input" maxlength="4" value="${esc(v.account_last4||'')}" placeholder="e.g. 3821">
          </div>
          <div>
            <label style="font-weight:700;font-size:0.95rem;display:block;margin-bottom:6px;">Current value ($)</label>
            <input type="number" id="ae_value" class="q-input" value="${esc(String(v.value||''))}" placeholder="0.00">
          </div>
        </div>
        <button class="qbtn qbtn-primary" onclick="qNextFromAssetEntry()">Continue →</button>
      </div>`;
  }

  window.toggleChecklist = function() {
    const panel = document.getElementById('checklistPanel');
    const icon  = document.getElementById('cl-toggle-icon');
    if (!panel) return;
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (icon) icon.textContent = open ? '▲' : '▼';
  };

  window.qNextDocUpload = function() {
    const q = FLOW[qIndex];
    const status = q && q.docKey ? CHECKLIST[q.docKey] : null;
    qNext(status === 'done' ? 'uploaded' : 'skipped');
  };

  window.qNextFromAssetEntry = function() {
    const inst = document.getElementById('ae_inst')?.value.trim() || '';
    const last4 = document.getElementById('ae_last4')?.value.trim() || '';
    const value = document.getElementById('ae_value')?.value || '0';
    qNext({ institution: inst, account_last4: last4, value: parseFloat(value)||0 });
  };

  /* ------------------------------------------------------------------------
     Document upload type — renders upload zone inline
  ------------------------------------------------------------------------ */
  function renderDocUploadInput(q) {
    const status = CHECKLIST[q.docKey];
    const isDone = status === 'done';
    return `
      <div style="margin-top:8px;">
        ${isDone ? `<div style="background:#ecf3ec;border:1px solid #4d8055;border-radius:8px;padding:14px;color:#2b5b33;font-weight:600;margin-bottom:12px;">✅ Document uploaded</div>` : ''}
        <label style="display:block;border:2px dashed #b0b8c1;border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:#f8f9fa;transition:border-color 0.15s;" onmouseover="this.style.borderColor='#1a4480'" onmouseout="this.style.borderColor='#b0b8c1'">
          <input type="file" style="display:none;" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.tif,.tiff" onchange="handleDocUpload('${q.docKey}', this)">
          <div style="font-size:2rem;margin-bottom:8px;">📎</div>
          <div style="font-weight:700;font-size:1rem;color:#1a4480;">${isDone ? 'Upload a replacement or additional file' : 'Click to choose a file'}</div>
          <div style="font-size:0.85rem;color:#71767a;margin-top:4px;">PDF, JPG, PNG, Word documents accepted</div>
        </label>
        <div id="upload_status_${q.docKey}" style="margin-top:8px;font-size:0.9rem;min-height:20px;"></div>
        <button class="qbtn qbtn-primary" onclick="qNextDocUpload()" style="margin-top:16px;" id="docUploadContinue">${isDone ? 'Continue \u2192' : 'Skip for now \u2014 I will upload this later'}</button>
        ${isDone ? '' : `<div style="font-size:0.82rem;color:#71767a;margin-top:8px;">Missing documents will appear on your checklist. You can come back to upload them at any time.</div>`}
      </div>`;
  }

  /* ------------------------------------------------------------------------
     Review screen type
  ------------------------------------------------------------------------ */
  function renderReviewScreen() {
    const st = APP.state ? getStateData(APP.state) : null;
    const totalAssets = Object.values(_assetEntries).length;
    const totalIncome = Object.values(_incomeEntries).length;
    const done = Object.values(CHECKLIST).filter(v => v === 'done').length;
    const missing = Object.values(CHECKLIST).filter(v => v === 'missing').length;
    const pending = Object.values(CHECKLIST).filter(v => v === 'pending').length;
    const total = done + missing + pending;

    return `
      <div style="margin-top:8px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
          <div style="background:#ecf3ec;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:1.8rem;font-weight:800;color:#2b5b33;">${done}</div>
            <div style="font-size:0.82rem;color:#2b5b33;font-weight:600;">✅ Complete</div>
          </div>
          <div style="background:${missing > 0 ? '#f4e3db' : '#faf3d1'};border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:1.8rem;font-weight:800;color:${missing > 0 ? '#6f3331' : '#5c4809'};">${missing + pending}</div>
            <div style="font-size:0.82rem;color:${missing > 0 ? '#6f3331' : '#5c4809'};font-weight:600;">${missing > 0 ? '🔴 Still needed' : '🟡 In progress'}</div>
          </div>
        </div>
        ${missing > 0 ? `
          <div style="background:#f4e3db;border:1px solid #e0a898;border-radius:8px;padding:14px;margin-bottom:16px;font-size:0.9rem;color:#6f3331;">
            <strong>Some documents are still missing.</strong> You can submit now and a staff member will follow up, or go back and upload the missing items first.
          </div>` : `
          <div style="background:#ecf3ec;border:1px solid #4d8055;border-radius:8px;padding:14px;margin-bottom:16px;font-size:0.9rem;color:#2b5b33;">
            <strong>Everything looks complete!</strong> Your application is ready for staff review.
          </div>`}
        <div style="font-size:0.9rem;color:#3d4551;margin-bottom:20px;">
          <strong>State:</strong> ${st ? st.name + ' — ' + st.programName : '—'}<br>
          <strong>Applicant:</strong> ${[APPL.first_name, APPL.last_name].filter(Boolean).join(' ') || '—'}<br>
          ${APP.marital_status === 'married' ? `<strong>Spouse:</strong> ${[SPOU.first_name, SPOU.last_name].filter(Boolean).join(' ') || '—'}<br>` : ''}
          <strong>Facility:</strong> ${APP.facility_name || '—'}<br>
          <strong>Assets documented:</strong> ${totalAssets} ${totalAssets === 1 ? 'account/asset' : 'accounts/assets'}<br>
          <strong>Income sources:</strong> ${totalIncome}<br>
        </div>
        <button class="qbtn qbtn-primary" onclick="qNext('submit')" style="width:100%;justify-content:center;font-size:1.05rem;padding:16px;">
          Submit application for staff review →
        </button>
        <div style="font-size:0.82rem;color:#71767a;margin-top:10px;text-align:center;">A staff member will review your application and reach out within 1-2 business days.</div>
      </div>`;
  }

  /* ------------------------------------------------------------------------
     Checklist management
  ------------------------------------------------------------------------ */
  const CHECKLIST_LABELS = {
    state:                  'State selected',
    birth_certificate:      'Birth certificate or proof of age',
    social_security_card:   'Social Security card or award letter',
    citizenship_proof:      'Proof of U.S. citizenship (passport or birth certificate)',
    immigration_docs:       'Immigration documents (green card, visa, etc.)',
    proof_of_residency:     'Proof of residence before nursing home',
    divorce_or_death_cert:  'Marriage, divorce, or death certificate (prior marriage)',
    medicare_card:          'Medicare card',
    nfloc_documentation:    'Nursing facility level of care documentation',
    physician_letter:       'Letter or records from attending physician',
    ltc_insurance_policy:   'Long-term care insurance policy and benefit statement',
    other_insurance_cards:  'Other health insurance cards',
    poa_document:           'Power of attorney or guardianship paperwork',
    admission_records:      'Nursing home admission records and account',
    photo_id:               'Government photo ID (driver\'s license or state ID)',
    marriage_certificate:   'Marriage certificate',
    ss_award_letter:        'Social Security award/benefit letter',
    pension_statement:      'Pension award letter or statement',
    va_award_letter:        'VA benefits award letter',
    home_deed:              'Deed to primary home',
    home_tax_statement:     'Property tax statement (home)',
    home_insurance:         'Homeowner\'s insurance declarations page',
    other_re_deed:          'Deed to other real estate',
    vehicle_title_1:        'Vehicle title',
    vehicle_title_2:        'Second vehicle title',
    life_insurance_policy:  'Life insurance policy and cash surrender value statement',
    burial_contract:        'Prepaid funeral/burial contract',
    trust_document:         'Trust document and Schedule A',
    annuity_contract:       'Annuity contract',
    bank_checking_1:        'Checking account — 60 months of statements',
    bank_checking_2:        'Second checking account — 60 months of statements',
    bank_savings_1:         'Savings account — 60 months of statements',
    bank_cd_1:              'CD — statements',
    investment_stmt_1:      'Investment/brokerage account — 60 months of statements',
    retirement_stmt_1:      'Retirement account — 60 months of statements',
    closed_account_statements: 'Closed account closing statements (zero balance)',
    nh_trust_account:       'Nursing home trust/comfort account statement',
    transfer_docs_1:        'Transfer documentation — gift #1',
    additional_transfer_docs: 'Additional transfer documentation',
    promissory_note_1:      'Promissory note for loan',
  };

  function updateChecklist(key, status) {
    CHECKLIST[key] = status;
    window._currentChecklist = CHECKLIST; // expose for packet.js
    renderChecklist();
    if (appId && appId !== 'demo') {
      sb.from('checklist_items').upsert({ application_id: appId, item_key: key, completed: status === 'done' }, { onConflict: 'application_id,item_key' }).then(() => {});
    }
  }

  /* ------------------------------------------------------------------------
     Flow computation — which questions are visible given current answers
  ------------------------------------------------------------------------ */
  function computeFlow() {
    FLOW = QUESTIONS.filter(q => !q.show || q.show());
  }

  function currentQ() { return FLOW[qIndex] || null; }

  /* ------------------------------------------------------------------------
     Supabase helpers
  ------------------------------------------------------------------------ */
  async function savePerson(role, fields) {
    if (appId === 'demo') return;
    const person = role === 'applicant' ? APPL : SPOU;
    if (person.id) {
      await sb.from('application_people').update(fields).eq('id', person.id);
    } else {
      const { data } = await sb.from('application_people').insert({ application_id: appId, person_role: role, ...fields }).select().single();
      if (data) {
        if (role === 'applicant') APPL = { ...APPL, ...data };
        else SPOU = { ...SPOU, ...data };
      }
    }
  }

  /* ------------------------------------------------------------------------
     Load existing data
  ------------------------------------------------------------------------ */
  async function loadAll(id) {
    // Store user id for document uploads
    if (window.currentUser) window._currentUserId = window.currentUser.id;
    if (id === 'demo' && window._demoData) {
      APP  = { ...window._demoData.APP, _role: 'other', _in_facility: 'yes', _nfloc_status: 'yes' };
      APPL = { ...window._demoData.APPL };
      SPOU = { ...window._demoData.SPOU };
      return;
    }
    const [appRes, peopleRes, checklistRes] = await Promise.all([
      sb.from('applications').select('*').eq('id', id).single(),
      sb.from('application_people').select('*').eq('application_id', id),
      sb.from('checklist_items').select('*').eq('application_id', id),
    ]);
    APP  = appRes.data || {};
    APPL = (peopleRes.data || []).find(p => p.person_role === 'applicant') || {};
    SPOU = (peopleRes.data || []).find(p => p.person_role === 'spouse') || {};
    CHECKLIST = {};
    (checklistRes.data || []).forEach(item => {
      CHECKLIST[item.item_key] = item.completed ? 'done' : 'pending';
    });
    // Restore transient flags from saved data
    if (APP.facility_name) APP._in_facility = 'yes';
    if (APP.marital_status) APP._role = APP.marital_status; // placeholder
    if (APP.level_of_care_documented) APP._nfloc_status = 'yes';
    if (APPL.citizen === true) APPL._has_medicare = APPL.medicare_number ? 'yes' : null;
  }

  /* ------------------------------------------------------------------------
     Find the starting question index (resume from where they left off)
  ------------------------------------------------------------------------ */
  function findResumeIndex() {
    // Find the first unanswered question
    for (let i = 0; i < FLOW.length; i++) {
      const q = FLOW[i];
      if (q.type === 'info') continue;
      const val = q.getValue ? q.getValue() : null;
      if (val === null || val === undefined || val === '') return i;
    }
    return FLOW.length - 1; // all done
  }

  /* ------------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------------ */
  let _shellRendered = false;

  function cardInnerHTML(q) {
    computeFlow();
    if (!q) return '';
    const phase = q.phase && typeof q.phase === 'function' ? q.phase() : q.phase;
    const phaseIndex = [...new Set(FLOW.map(x => typeof x.phase === 'function' ? x.phase() : x.phase))].indexOf(phase) + 1;
    const totalPhases = [...new Set(FLOW.map(x => typeof x.phase === 'function' ? x.phase() : x.phase))].length;
    const phasePct = Math.round((qIndex / FLOW.length) * 100);
    const text = typeof q.text === 'function' ? q.text() : q.text;
    const sub  = q.sub ? (typeof q.sub === 'function' ? q.sub() : q.sub) : null;

    let inputHtml = '';
    if (q.type === 'info') {
      inputHtml = `<button class="qbtn qbtn-primary" onclick="qNext(null)">Continue →</button>`;
    } else if (q.type === 'yesno') {
      inputHtml = `
        <div class="q-choices">
          <button class="q-choice" onclick="qNext('yes')"><span class="q-choice-icon">✅</span><span>Yes</span></button>
          <button class="q-choice" onclick="qNext('no')"><span class="q-choice-icon">❌</span><span>No</span></button>
        </div>`;
    } else if (q.type === 'choice') {
      const choices = typeof q.choices === 'function' ? q.choices() : q.choices;
      if (q.choiceStyle === 'dropdown') {
        const opts = choices.map(c => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('');
        inputHtml = `
          <select id="qInput" class="q-select">
            <option value="">Choose a state…</option>
            ${opts}
          </select>
          <button class="qbtn qbtn-primary" onclick="qNextFromSelect()" style="margin-top:16px;">Continue →</button>`;
      } else {
        inputHtml = `<div class="q-choices">
          ${choices.map(c => `<button class="q-choice" onclick="qNext('${esc(c.value)}')">
            ${c.icon ? `<span class="q-choice-icon">${c.icon}</span>` : ''}
            <span>${esc(c.label)}</span>
          </button>`).join('')}
        </div>`;
      }
    } else if (q.type === 'asset_entry') {
      inputHtml = renderAssetEntryInput(q);
    } else if (q.type === 'document_upload') {
      inputHtml = renderDocUploadInput(q);
    } else if (q.type === 'review_screen') {
      inputHtml = renderReviewScreen();
    } else if (q.type === 'textarea') {
      const currentVal = q.getValue ? (q.getValue() || '') : '';
      inputHtml = `
        <textarea id="qInput" class="q-input" rows="4"
          placeholder="${esc(q.placeholder || '')}"
          onkeydown="if(event.ctrlKey&&event.key==='Enter'){qNextFromInput()}"
          autofocus>${esc(currentVal)}</textarea>
        <button class="qbtn qbtn-primary" onclick="qNextFromInput()" style="margin-top:16px;">Continue →</button>`;
    } else {
      const currentVal = q.getValue ? (q.getValue() || '') : '';
      inputHtml = `
        <input type="${q.type}" id="qInput" class="q-input"
          value="${esc(currentVal)}"
          placeholder="${esc(q.placeholder || '')}"
          ${q.maxLength ? `maxlength="${q.maxLength}"` : ''}
          onkeydown="if(event.key==='Enter'){qNextFromInput()}"
          autofocus>
        <button class="qbtn qbtn-primary" onclick="qNextFromInput()" style="margin-top:16px;">Continue →</button>`;
    }

    return { phase, phaseIndex, totalPhases, phasePct, text, sub, inputHtml, tipKey: q.tip };
  }

  function renderQ() {
    computeFlow();
    const q = currentQ();
    if (!q) { renderComplete(); return; }

    const { phase, phaseIndex, totalPhases, phasePct, text, sub, inputHtml, tipKey } = cardInnerHTML(q);

    // First render — build the full shell once
    if (!_shellRendered || !document.getElementById('q-card-inner')) {
      shell(`
        <div class="q-wrap">
          <div class="q-main">
            <div class="q-progress-wrap">
              <div id="q-phase-label" class="q-phase-label">Phase ${phaseIndex} of ${totalPhases} — ${esc(phase)}</div>
              <div class="q-progress-bar"><div id="q-progress-fill" class="q-progress-fill" style="width:${phasePct}%"></div></div>
            </div>
            <div class="q-card">
              <div id="q-card-inner">
                ${tipKey ? `<div style="float:right;">${window.tip ? tip(tipKey) : ''}</div>` : ''}
                <div class="q-text">${esc(text)}</div>
                ${sub ? `<div class="q-sub">${esc(sub)}</div>` : ''}
                <div class="q-input-wrap">${inputHtml}</div>
              </div>
            </div>
            <div id="q-nav" class="q-nav">
              ${qIndex > 0 ? `<button class="qbtn qbtn-ghost" onclick="qBack()">← Back</button>` : '<span></span>'}
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="qbtn-sm-ghost" onclick="qSaveLater()">Save for later</button>
                <div style="width:1px;height:18px;background:#ddd;margin:0 2px;"></div>
                <button class="qbtn-sm-ghost" onclick="go('#/formview/'+(window._currentAppId||'demo'))" title="Form view">⊞</button>
                <button class="qbtn-sm-ghost" onclick="printChecklist(window._currentAppId||'demo')" title="Print checklist">🖨</button>
                <button class="qbtn-sm-ghost" onclick="exportPacketPDF(window._currentAppId||'demo')" title="Export PDF">📄</button>
              </div>
            </div>
          </div>
          <div id="q-checklist-collapse" style="display:none;"></div>
        </div>
      `, `Application — ${name()}`);
      _shellRendered = true;
    } else {
      // Subsequent renders — only update the parts that change
      const inner = document.getElementById('q-card-inner');
      const phaseLabel = document.getElementById('q-phase-label');
      const progressFill = document.getElementById('q-progress-fill');
      const nav = document.getElementById('q-nav');

      if (inner) inner.innerHTML = `
        ${tipKey ? `<div style="float:right;">${window.tip ? tip(tipKey) : ''}</div>` : ''}
        <div class="q-text">${esc(text)}</div>
        ${sub ? `<div class="q-sub">${esc(sub)}</div>` : ''}
        <div class="q-input-wrap">${inputHtml}</div>`;

      if (phaseLabel) phaseLabel.textContent = `Phase ${phaseIndex} of ${totalPhases} — ${phase}`;
      if (progressFill) progressFill.style.width = phasePct + '%';
      if (nav) nav.innerHTML = `
        ${qIndex > 0 ? `<button class="qbtn qbtn-ghost" onclick="qBack()">← Back</button>` : '<span></span>'}
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="qbtn-sm-ghost" onclick="qSaveLater()">Save for later</button>
          <div style="width:1px;height:18px;background:#ddd;margin:0 2px;"></div>
          <button class="qbtn-sm-ghost" onclick="go('#/formview/'+(window._currentAppId||'demo'))" title="Form view">⊞</button>
          <button class="qbtn-sm-ghost" onclick="printChecklist(window._currentAppId||'demo')" title="Print checklist">🖨</button>
          <button class="qbtn-sm-ghost" onclick="exportPacketPDF(window._currentAppId||'demo')" title="Export PDF">📄</button>
        </div>`;

      // Focus text input if present
      const input = document.getElementById('qInput');
      if (input) setTimeout(() => input.focus(), 50);
    }
    renderChecklist();
  }

  function renderChecklistItems() {
    const items = Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
      const status = CHECKLIST[key];
      if (!status) return '';
      const icon = status === 'done' ? '✅' : status === 'pending' ? '🟡' : '🔴';
      const cls  = status === 'done' ? 'cl-done' : status === 'pending' ? 'cl-pending' : 'cl-missing';
      return `<div class="cl-item ${cls}">${icon} ${esc(label)}</div>`;
    }).filter(Boolean).join('');
    return items || `<div style="color:#999;font-size:0.82rem;padding:8px 0;">Items will appear here as you answer questions.</div>`;
  }

  function renderChecklist() {
    // Checklist is accessible via the 🖨 and ⊞ nav buttons — not shown inline during questions
    const el = document.getElementById('checklistItems');
    if (el) el.innerHTML = renderChecklistItems();
  }

  function renderComplete() {
    shell(`
      <div class="q-wrap">
        <div class="q-main">
          <div class="q-card" style="text-align:center;">
            <div style="font-size:3rem;margin-bottom:16px;">✅</div>
            <div class="q-text">Phase complete!</div>
            <div class="q-sub">Everything in this phase is saved. A staff member will review your information and reach out if anything is needed. You can come back any time to continue with the next phase.</div>
            <button class="qbtn qbtn-primary" onclick="go('#/dashboard')" style="margin-top:24px;">Back to my applications</button>
          </div>
        </div>
        <div class="q-sidebar">
          <div class="q-checklist-panel">
            <div class="q-checklist-title">📋 Your checklist</div>
            <div id="checklistItems">${renderChecklistItems()}</div>
          </div>
        </div>
      </div>
    `, `Application — ${name()}`);
  }

  /* ------------------------------------------------------------------------
     Navigation
  ------------------------------------------------------------------------ */
  window.qNext = async function (val) {
    const q = currentQ();
    if (!q) return;
    if (q.type !== 'info' && (val === null || val === undefined || val === '')) return;

    if (saving) return;
    saving = true;

    try {
      if (q.save && val !== null) await q.save(val);
    } catch(e) {
      console.error('save error', e);
    }

    saving = false;
    computeFlow();

    if (qIndex < FLOW.length - 1) {
      qIndex++;
      renderQ();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      renderComplete();
    }
  };

  window.qNextFromInput = function () {
    const el = document.getElementById('qInput');
    if (el) qNext(el.value.trim());
  };

  window.qNextFromSelect = function () {
    const el = document.getElementById('qInput');
    if (el && el.value) qNext(el.value);
  };

  window.qBack = function () {
    if (qIndex > 0) {
      qIndex--;
      computeFlow();
      renderQ();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  window.qSaveLater = function () {
    go('#/dashboard');
  };

  /* ------------------------------------------------------------------------
     CSS
  ------------------------------------------------------------------------ */
  const style = document.createElement('style');
  style.textContent = `
    .q-wrap {
      width: 100%;
      max-width: 660px;
      margin: 0 auto;
      padding: 40px 20px 80px;
      box-sizing: border-box;
    }
    .q-main {
      width: 100%;
      max-width: 660px;
      box-sizing: border-box;
    }
    .q-card {
      width: 100%;
      max-width: 660px;
      box-sizing: border-box;
      overflow: hidden;
    }
    .q-sidebar { display: none; }
    .q-checklist-panel {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
      position: sticky;
      top: 20px;
      min-height: 200px; /* always takes up space even when empty */
    }
    @media (max-width: 720px) {
      .q-wrap { grid-template-columns: 1fr; }
      .q-sidebar { width: 100%; order: -1; }
      .q-checklist-panel { min-height: auto; }
    }

    .qbtn-sm-ghost {
      background: none;
      border: 1.5px solid var(--border);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ink-soft);
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .qbtn-sm-ghost:hover { background: #f0f0f0; border-color: #aaa; }

    .q-progress-wrap { margin-bottom: 28px; }
    .q-phase-label { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--cyan); margin-bottom: 8px; }
    .q-progress-bar { height: 6px; background: #dfe1e2; border-radius: 4px; overflow: hidden; }
    .q-progress-fill { height: 100%; background: var(--navy); border-radius: 4px; transition: width 0.4s ease; }

    .q-card {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 36px 36px 28px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.07);
      min-height: 420px;
      height: 420px;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .q-input-wrap { margin-top: auto; padding-top: 24px; }
    @media (max-width: 600px) {
      .q-card { padding: 24px 18px; height: auto; min-height: 380px; }
    }

    .q-text {
      font-size: 1.55rem;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.3;
      margin-bottom: 12px;
      font-family: 'Public Sans', sans-serif;
    }
    @media (max-width: 600px) { .q-text { font-size: 1.25rem; } }

    .q-sub {
      font-size: 1rem;
      color: var(--ink-soft);
      line-height: 1.6;
      margin-bottom: 28px;
    }

    .q-input-wrap { margin-top: 24px; }

    .q-input {
      width: 100%;
      font-size: 1.15rem;
      padding: 14px 16px;
      border: 2px solid #565c65;
      border-radius: 8px;
      font-family: inherit;
      color: var(--ink);
      background: #fff;
      transition: border-color 0.15s;
    }
    .q-input:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 3px rgba(26,68,128,0.15); }

    .q-select {
      width: 100%;
      font-size: 1.1rem;
      padding: 13px 14px;
      border: 2px solid #565c65;
      border-radius: 8px;
      font-family: inherit;
      color: var(--ink);
      background: #fff;
    }

    .q-choices {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 4px;
      width: 100%;
      box-sizing: border-box;
    }

    .q-choice {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 18px;
      border: 2px solid var(--border);
      border-radius: 10px;
      background: #fff;
      font-size: 1.05rem;
      font-weight: 500;
      color: var(--ink);
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s, background 0.15s;
      font-family: inherit;
      min-height: 56px;
      width: 100%;
      box-sizing: border-box;
      max-width: 100%;
    }
    .q-choice:hover { border-color: var(--navy); background: var(--navy-light); }
    .q-choice:active { transform: scale(0.99); }
    .q-choice-icon { font-size: 1.3rem; flex-shrink: 0; width: 28px; }

    .qbtn {
      border: none;
      border-radius: 8px;
      padding: 13px 26px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .qbtn-primary { background: var(--navy); color: #fff; }
    .qbtn-primary:hover { background: var(--navy-dark); }
    .qbtn-ghost { background: none; color: var(--ink-soft); border: 1.5px solid var(--border); }
    .qbtn-ghost:hover { background: #f0f0f0; }

    .q-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }


    .q-checklist-title { font-weight: 700; font-size: 0.95rem; margin-bottom: 4px; }
    .q-checklist-sub { font-size: 0.78rem; color: var(--ink-faint); margin-bottom: 14px; }

    .cl-item {
      font-size: 0.84rem;
      padding: 7px 0;
      border-bottom: 1px solid #f0f0f0;
      line-height: 1.4;
    }
    .cl-item:last-child { border-bottom: none; }
    .cl-done { color: #2b5b33; }
    .cl-pending { color: #5c4809; }
    .cl-missing { color: #6f3331; font-weight: 600; }
  `;
  document.head.appendChild(style);

  /* ------------------------------------------------------------------------
     Entry point — called from app.js
  ------------------------------------------------------------------------ */
  window.renderApplicationIntake = async function (id) {
    appId = id;
    window._currentAppId = id; // exposed for nav buttons
    qIndex = 0;
    CHECKLIST = {};
    _shellRendered = false;

    shell(`<div style="text-align:center;padding:60px;color:var(--ink-faint);">Loading your application…</div>`, 'Loading');

    await loadAll(id);
    computeFlow();
    // Demo always starts at question 1 so the flow is visible
    qIndex = (id === 'demo') ? 0 : findResumeIndex();
    renderQ();
  };

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

})();
