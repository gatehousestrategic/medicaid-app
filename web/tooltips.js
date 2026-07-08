/* ==========================================================================
   ClearCare — Tooltip System (tooltips.js)
   Warm, plain-English explanations written for elderly users and their
   families. Tap or hover the ? button next to any field label to see
   a friendly explanation — no jargon, no legalese.
   ========================================================================== */

(function () {

  /* ------------------------------------------------------------------------
     Tooltip content — keyed by field id or topic
     Tone: like a knowledgeable friend sitting at the kitchen table with you
  ------------------------------------------------------------------------ */
  window.TIPS = {

    // --- Facility & State ---
    state:
      "Each state runs its own Medicaid program with its own rules and limits. Once you pick a state, we'll automatically show you the right income limits, asset limits, and which agency to contact. You'll apply through that state's office, not the federal government.",

    marital_status:
      "This matters a lot for Medicaid. If you're married, your spouse gets to keep a larger share of your savings — that's called the Community Spouse Resource Allowance, and it's there specifically to make sure your husband or wife doesn't go broke while you're in the nursing home.",

    facility_name:
      "The name of the nursing home or skilled nursing facility where your loved one is living — or where they're about to move. If you're not sure yet, you can leave this blank and come back to it.",

    facility_admission_date:
      "The date your loved one moved into the nursing home. This date matters because Medicaid can sometimes pay back to the month of admission if the application is approved.",

    level_of_care_documented:
      "To qualify for nursing home Medicaid, a doctor has to confirm in writing that your loved one needs the level of care that a nursing home provides — things like help with bathing, eating, and getting around. This is called a 'nursing facility level of care' (NFLOC) determination. Check this box if a doctor has already put this in writing.",

    // --- Applicant ---
    a_first:
      "The legal first name exactly as it appears on a government ID like a driver's license, passport, or Social Security card.",

    a_last:
      "The legal last name. If there's been a name change due to marriage or divorce, use the name on the most recent government ID.",

    a_dob:
      "Date of birth from the birth certificate or government ID. Medicaid uses this to verify identity and determine which programs apply.",

    a_ssn4:
      "We only ask for the last four digits of the Social Security number — the four numbers at the end, like the ones you'd give when someone says 'last four of your Social.' We never store the full number. You'll write the complete number directly on the official state form.",

    a_citizen:
      "U.S. citizenship or national status affects which Medicaid programs you can apply for. Even if the answer is no, it's still worth applying — many states cover emergencies and nursing home care for legal residents and others.",

    a_phone:
      "A good phone number where the state Medicaid office can reach you or a family member. They may call with questions about the application.",

    a_email:
      "An email address isn't always required, but it can be helpful for receiving updates. If the applicant doesn't use email, put a family member's address instead.",

    a_addr1:
      "The address where the applicant lived before moving into the nursing home — not the nursing home address itself. This is usually the home address. If a spouse still lives there, it's especially important to list it correctly.",

    a_medicare:
      "Medicare is the federal health insurance program most people get when they turn 65 or receive disability benefits. The Medicare number is on the red, white, and blue Medicare card. It looks something like 1EG4-TE5-MK72.",

    a_medicaid:
      "If the applicant is already enrolled in Medicaid for other coverage, put that number here. Most people applying for nursing home Medicaid for the first time won't have this yet — that's fine, leave it blank.",

    // --- Medical ---
    m_phys:
      "The name of the doctor currently overseeing the applicant's care — usually the primary care doctor or the attending physician at the nursing home. Medicaid may contact them to verify the level of care needed.",

    m_diag:
      "The main medical condition that led to the nursing home stay. For example: Alzheimer's disease, stroke, Parkinson's disease, hip fracture, or heart failure. Use the diagnosis from the doctor's records if you have them.",

    adl:
      "ADL stands for 'Activities of Daily Living' — the basic things people do every day. Medicaid requires the applicant to need help with at least two of these to qualify for nursing home coverage. Answer honestly based on what the person can actually do on their own, not what they used to be able to do.",

    adl_bathing:
      "Can they wash themselves in the bath or shower without help? 'Independent' means they can do it alone. 'Needs assistance' means someone has to help. 'Fully dependent' means someone else does it entirely for them.",

    adl_dressing:
      "Can they choose and put on their own clothes — including buttons, zippers, and shoes — without help?",

    adl_eating:
      "Can they feed themselves once food is in front of them? This is about the physical act of eating, not cooking.",

    adl_transferring:
      "Can they move themselves from the bed to a chair, or from a chair to standing, without someone helping them? Falls are common when this becomes difficult.",

    adl_toileting:
      "Can they get to the toilet, manage their clothing, and clean themselves without assistance?",

    adl_continence:
      "Are they able to control their bladder and bowels? If they use adult briefs or have accidents, that counts as needing assistance or being fully dependent.",

    // --- Spouse ---
    sp_first:
      "The spouse who stays at home while the other is in the nursing home is called the 'community spouse.' Medicaid has special protections to make sure the community spouse has enough money to live on.",

    csra:
      "The Community Spouse Resource Allowance — this is the amount of savings and assets your husband or wife is allowed to keep while you're in the nursing home. It's there so the spouse at home doesn't lose everything. In most states in 2026 it's up to $162,660.",

    mmmna:
      "The Monthly Maintenance Needs Allowance — a monthly income protection for the spouse at home. If the community spouse doesn't have enough income of their own, some of the nursing home resident's income can be transferred to them to bring them up to this minimum amount.",

    // --- Assets ---
    asset_type:
      "Choose the category that best describes this asset. If you're not sure where something fits, choose 'Other asset' and describe it in the institution/description field.",

    asset_owner:
      "Who owns this asset? 'Joint' means both spouses' names are on it. Even if an account is technically in one person's name, Medicaid usually considers all assets of a married couple to be jointly owned.",

    asset_institution:
      "The name of the bank, investment firm, or other institution where this asset is held. For property, put the address. For life insurance, put the insurance company name.",

    asset_account_last4:
      "The last four digits of the account number — helpful for the caseworker to identify the account when they request statements. You don't need to share the full account number here.",

    asset_value:
      "The current market value of this asset today — not what you paid for it originally. For bank accounts, use the current balance. For investments, use today's value. For real estate, use a reasonable estimate of what it would sell for.",

    asset_is_exempt:
      "Some assets don't count toward Medicaid's asset limit — these are called 'exempt assets.' The most common ones are: the primary home (if a spouse still lives there), one vehicle, household furniture and belongings, and prepaid burial funds. Check this box if the asset is exempt and explain why.",

    // --- Income ---
    income_type:
      "Choose the category that best matches this income. Social Security retirement is the most common for seniors. If you're not sure, choose 'Other income' and describe it.",

    income_person:
      "Whose income is this? When only one spouse is in the nursing home, only that person's income counts toward the income limit — the at-home spouse's income is protected and not counted.",

    income_payer:
      "Who pays this income? For Social Security, it's the Social Security Administration. For a pension, it's the company or union. This helps the caseworker verify the amount.",

    income_amount:
      "The gross amount — before any taxes or deductions are taken out. Use the full amount shown on the award letter or check.",

    income_frequency:
      "How often this income comes in. Most Social Security and pension payments are monthly. If it's weekly or every two weeks, we'll convert it to monthly automatically.",

    // --- Transfers ---
    transfer_intro:
      "Medicaid looks back at the past 5 years (60 months) to see if any money or property was given away or sold for less than it was worth. This is called the 'lookback period.' If something was given away — even as a gift to a grandchild — it needs to be listed here. The IRS rules about gifts have nothing to do with Medicaid's rules, so even gifts under the IRS annual limit must be listed.",

    transfer_date:
      "The date the transfer or gift took place. If you're not sure of the exact date, use the closest date you can remember and make a note in the Notes field.",

    transfer_description:
      "What was given away or sold? Be specific. For example: 'Cash gift to son David,' 'House at 22 Oak Street transferred to daughter,' or 'Stocks sold to niece at below-market price.'",

    transfer_fmv:
      "The fair market value is what the item was actually worth at the time of the transfer — what a stranger would have paid for it. For cash gifts, this is simply the amount of cash given. For property, it's the appraised or market value at the time.",

    transfer_received:
      "The amount actually received in return for the item. For a pure gift where nothing was received, enter 0. For a sale, enter the sale price. The difference between the fair market value and what was received is the 'uncompensated value' — that's what Medicaid focuses on.",

    transfer_uncompensated:
      "This is calculated automatically. It's the difference between what the item was worth and what was actually received for it. If money was given as a pure gift, the full amount is uncompensated. This is what Medicaid may use to calculate a penalty period.",

    transfer_recipient:
      "Who received the gift or payment? List their full name and their relationship to the applicant — for example, 'David Bernstein, son' or 'Oak Street Community Church, charitable organization.'",

    transfer_exemption:
      "Some transfers don't cause a penalty — these are called 'exempt transfers.' The most common ones are: transfers to a spouse, transfers to a disabled child of any age, and transfers of the home to a child who lived there and provided care for at least 2 years. If any of these apply, select the best match.",

    transfer_loan:
      "If the transfer was structured as a loan rather than a gift — meaning the person is expected to pay it back — check this box. A written promissory note (a signed document stating the repayment terms) can help show it was genuinely a loan and not a gift.",

    transfer_care:
      "If the money was paid to a family member in exchange for care they provided — like a daughter who lived in and cared for the parent full-time — check this box. A written personal care agreement signed before the care began can help prove this wasn't a disguised gift.",

    transfer_returned:
      "If the money or property has been fully returned to the applicant, check this box. Returning a gift can eliminate or reduce the penalty period in most states.",

    // --- General ---
    penalty_divisor:
      "Each state has a 'penalty divisor' — the average monthly cost of a private nursing home stay in that state. Medicaid divides the total amount of uncompensated transfers by this number to calculate how many months the applicant must wait before Medicaid will pay. A $60,000 gift in a state with a $10,000/month divisor means a 6-month waiting period. This is why the lookback period is so important.",

    attorney_review:
      "Some transfers are complicated — they might be exempt, partially exempt, or structured in a way that affects the penalty. An elder law attorney or Certified Medicaid Planner can review your specific situation and may be able to reduce or eliminate the penalty. We flag these for attorney review so nothing slips through.",
  };

  /* ------------------------------------------------------------------------
     Tooltip rendering — a ? button that opens a speech bubble
  ------------------------------------------------------------------------ */

  // Add tooltip CSS to the document
  const style = document.createElement('style');
  style.textContent = `
    .tip-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #e8f0fb;
      color: #1a4480;
      border: 1.5px solid #aac0e8;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      margin-left: 8px;
      flex-shrink: 0;
      vertical-align: middle;
      transition: background 0.15s;
      font-family: Georgia, serif;
      font-style: italic;
      line-height: 1;
    }
    .tip-btn:hover, .tip-btn:focus { background: #1a4480; color: #fff; outline: none; }

    .tip-bubble {
      position: fixed;
      z-index: 9999;
      max-width: 340px;
      background: #fffef0;
      border: 2px solid #f0c040;
      border-radius: 12px;
      padding: 16px 18px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
      font-size: 0.9rem;
      line-height: 1.6;
      color: #1b1b1b;
      font-family: 'Public Sans', sans-serif;
    }
    .tip-bubble-close {
      float: right;
      background: none;
      border: none;
      font-size: 1.1rem;
      cursor: pointer;
      color: #666;
      margin-left: 8px;
      margin-top: -2px;
      padding: 0;
      line-height: 1;
    }
    .tip-bubble-close:hover { color: #333; }
    .tip-bubble-icon {
      font-size: 1.4rem;
      display: block;
      margin-bottom: 6px;
    }
    .tip-bubble-title {
      font-weight: 700;
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #b08800;
      margin-bottom: 6px;
    }

    /* Larger tap targets and text for elderly users */
    .label { font-size: 1rem !important; }
    .hint  { font-size: 0.875rem !important; }
    select, input[type=text], input[type=email], input[type=password],
    input[type=date], input[type=number], input[type=tel], textarea {
      font-size: 1rem !important;
      padding: 12px 14px !important;
    }
    .btn { padding: 13px 26px !important; font-size: 1rem !important; }
    .btn-sm { padding: 9px 16px !important; font-size: 0.9rem !important; }
  `;
  document.head.appendChild(style);

  // Active bubble reference
  let activeBubble = null;

  function closeBubble() {
    if (activeBubble && activeBubble.parentNode) {
      activeBubble.parentNode.removeChild(activeBubble);
    }
    activeBubble = null;
  }

  function showBubble(btn, tipKey) {
    closeBubble();
    const text = window.TIPS[tipKey];
    if (!text) return;

    const bubble = document.createElement('div');
    bubble.className = 'tip-bubble';
    bubble.setAttribute('role', 'tooltip');
    bubble.innerHTML = `
      <button class="tip-bubble-close" onclick="closeTip()" aria-label="Close tip">✕</button>
      <div class="tip-bubble-icon">💬</div>
      <div class="tip-bubble-title">Helpful tip</div>
      ${text}
    `;

    document.body.appendChild(bubble);
    activeBubble = bubble;

    // Position near the button
    const rect = btn.getBoundingClientRect();
    const bw = bubble.offsetWidth || 340;
    const bh = bubble.offsetHeight || 160;
    let left = rect.left + window.scrollX;
    let top  = rect.bottom + window.scrollY + 8;

    // Don't overflow right edge
    if (left + bw > window.innerWidth - 16) left = window.innerWidth - bw - 16;
    if (left < 8) left = 8;
    // Don't overflow bottom — show above instead
    if (top + bh > window.scrollY + window.innerHeight - 16) {
      top = rect.top + window.scrollY - bh - 8;
    }

    bubble.style.left = left + 'px';
    bubble.style.top  = top  + 'px';
  }

  window.closeTip = closeBubble;

  // Close bubble when clicking outside
  document.addEventListener('click', function (e) {
    if (activeBubble && !activeBubble.contains(e.target) && !e.target.classList.contains('tip-btn')) {
      closeBubble();
    }
  });

  /* ------------------------------------------------------------------------
     Public API: tip(key) returns HTML for a ? button
  ------------------------------------------------------------------------ */
  window.tip = function (key) {
    if (!window.TIPS[key]) return '';
    return `<button type="button" class="tip-btn" onclick="showTip(this,'${key}')" aria-label="What does this mean?">?</button>`;
  };

  window.showTip = function (btn, key) {
    showBubble(btn, key);
  };

  /* ------------------------------------------------------------------------
     Helper: wrap a label with a tooltip button
     Usage: tipLabel('State', 'state') →  State <?>
  ------------------------------------------------------------------------ */
  window.tipLabel = function (label, key, required) {
    const req = required ? `<span class="req" style="color:#b50909;margin-left:2px;">*</span>` : '';
    return `${label}${req} ${window.tip(key)}`;
  };

})();
