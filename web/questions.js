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

  ]; // end QUESTIONS

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
  };

  function updateChecklist(key, status) {
    CHECKLIST[key] = status;
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
              <button class="qbtn qbtn-ghost" onclick="qSaveLater()">Save & continue later</button>
            </div>
          </div>
          <div class="q-sidebar">
            <div class="q-checklist-panel">
              <div class="q-checklist-title">📋 Your checklist</div>
              <div class="q-checklist-sub">Updates as you answer questions</div>
              <div id="checklistItems">${renderChecklistItems()}</div>
            </div>
          </div>
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
        <button class="qbtn qbtn-ghost" onclick="qSaveLater()">Save & continue later</button>`;

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
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 24px;
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px 20px 80px;
      align-items: start;
    }
    @media (max-width: 720px) {
      .q-wrap { grid-template-columns: 1fr; }
      .q-sidebar { order: -1; }
    }

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
    }
    .q-choice:hover { border-color: var(--navy); background: var(--navy-light); }
    .q-choice:active { transform: scale(0.99); }
    .q-choice-icon { font-size: 1.3rem; flex-shrink: 0; }

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

    .q-checklist-panel {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
      position: sticky;
      top: 20px;
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
