/* ==========================================================================
   ClearCare — Demo Mode (demo.js)
   Bypasses login entirely. Loads a prefilled fake application in memory
   so multiple visitors can try the demo simultaneously without touching
   the real database.
   ========================================================================== */

(function () {

  /* ------------------------------------------------------------------------
     Prefilled demo data — a realistic but fictional case
  ------------------------------------------------------------------------ */
  const DEMO_APP = {
    id: 'demo',
    state: 'PA',
    marital_status: 'married',
    facility_name: 'Sunridge Care Center',
    facility_admission_date: '2026-02-14',
    level_of_care_documented: true,
    status: 'draft'
  };

  const DEMO_APPL = {
    id: 'demo-appl',
    person_role: 'applicant',
    first_name: 'Harold',
    middle_name: 'James',
    last_name: 'Bernstein',
    dob: '1942-03-08',
    sex: 'M',
    ssn_last4: '4471',
    citizen: true,
    phone: '(215) 555-0147',
    email: 'harold.bernstein@email.com',
    address1: '814 Maple Grove Drive',
    city: 'Abington',
    state: 'PA',
    zip: '19001',
    medicare_number: '1EG4-TE5-MK72',
    medicaid_number: '',
    attending_physician: 'Dr. Susan Kapoor',
    physician_phone: '(215) 555-0192',
    primary_diagnosis: "Alzheimer's disease, moderate stage",
    adl_bathing: 'Fully dependent',
    adl_dressing: 'Needs assistance',
    adl_eating: 'Needs assistance',
    adl_transferring: 'Fully dependent',
    adl_toileting: 'Fully dependent',
    adl_continence: 'Fully dependent',
  };

  const DEMO_SPOU = {
    id: 'demo-spou',
    person_role: 'spouse',
    first_name: 'Miriam',
    middle_name: 'Ruth',
    last_name: 'Bernstein',
    dob: '1945-09-22',
    sex: 'F',
    ssn_last4: '8834',
    citizen: true,
    phone: '(215) 555-0147',
    email: 'miriam.bernstein@email.com',
    address1: '814 Maple Grove Drive',
    city: 'Abington',
    state: 'PA',
    zip: '19001',
    medicare_number: '2QW7-LE3-NP44',
    medicaid_number: '',
  };

  const DEMO_ASSETS = [
    { _id: 'd1', owner:'joint',     asset_type:'checking',      institution:'First National Bank',      account_last4:'3821', value:4200,    is_exempt:false, exempt_reason:'' },
    { _id: 'd2', owner:'joint',     asset_type:'savings',       institution:'First National Bank',      account_last4:'3822', value:28500,   is_exempt:false, exempt_reason:'' },
    { _id: 'd3', owner:'applicant', asset_type:'cd',            institution:'Citizens Bank',            account_last4:'9104', value:15000,   is_exempt:false, exempt_reason:'' },
    { _id: 'd4', owner:'joint',     asset_type:'primary_home',  institution:'814 Maple Grove Dr, Abington PA', account_last4:'', value:285000,  is_exempt:true,  exempt_reason:'Primary residence — spouse still living there' },
    { _id: 'd5', owner:'joint',     asset_type:'vehicle_primary',institution:'2019 Toyota Camry',      account_last4:'', value:16000,   is_exempt:true,  exempt_reason:'One vehicle exempt' },
    { _id: 'd6', owner:'applicant', asset_type:'life_insurance', institution:'MetLife — whole life policy', account_last4:'', value:8500,    is_exempt:false, exempt_reason:'' },
    { _id: 'd7', owner:'joint',     asset_type:'burial_fund',   institution:'Forest Hills Memorial',   account_last4:'', value:4000,    is_exempt:true,  exempt_reason:'Prepaid burial funds (exempt)' },
  ];

  const DEMO_INCOME = [
    { _id: 'i1', person:'applicant', income_type:'ss_retirement', payer:'Social Security Administration', amount:1840, frequency:'monthly' },
    { _id: 'i2', person:'applicant', income_type:'pension',       payer:'SEPTA Pension Fund',              amount:620,  frequency:'monthly' },
    { _id: 'i3', person:'spouse',    income_type:'ss_retirement', payer:'Social Security Administration', amount:1140, frequency:'monthly' },
  ];

  const DEMO_TRANSFERS = [
    {
      _id: 't1',
      transfer_date: '2024-06-15',
      asset_description: 'Cash gift to granddaughter for college tuition',
      fair_market_value: 12000,
      amount_received: 0,
      uncompensated_value: 12000,
      recipient_name: 'Emma Bernstein',
      recipient_relationship: 'Granddaughter',
      was_loan: false, has_promissory_note: false,
      was_for_care: false, has_care_agreement: false,
      was_returned: false,
      possible_exemption: 'none',
      needs_attorney_review: true,
      notes: 'Annual gift to help with Drexel University tuition. Family was unaware of Medicaid lookback rules at the time.'
    },
    {
      _id: 't2',
      transfer_date: '2023-11-30',
      asset_description: 'Sale of vacation property in the Pocono Mountains',
      fair_market_value: 95000,
      amount_received: 95000,
      uncompensated_value: 0,
      recipient_name: 'Third-party buyer',
      recipient_relationship: 'Unrelated buyer',
      was_loan: false, has_promissory_note: false,
      was_for_care: false, has_care_agreement: false,
      was_returned: false,
      possible_exemption: 'fmv',
      needs_attorney_review: false,
      notes: 'Sold at full appraised value. Proceeds deposited to joint savings account. Closing documents available.'
    }
  ];

  /* ------------------------------------------------------------------------
     Demo mode flag and data injection
  ------------------------------------------------------------------------ */
  window.DEMO_MODE = false;

  window.startDemo = function () {
    window.DEMO_MODE = true;

    // Inject demo data into intake.js state variables directly
    // intake.js exposes these via window for demo injection
    window._demoData = {
      APP: DEMO_APP,
      APPL: DEMO_APPL,
      SPOU: DEMO_SPOU,
      ASSETS: DEMO_ASSETS.map(a => ({...a})),
      INCOME: DEMO_INCOME.map(i => ({...i})),
      TRANSFERS: DEMO_TRANSFERS.map(t => ({...t})),
    };

    // Navigate to the demo application
    window.location.hash = '#/application/demo';
  };

})();
