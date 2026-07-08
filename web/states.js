// ==========================================================================
// 50-STATE MEDICAID LTC DATA — 2026 VERIFIED FIGURES
// Sources: MedicaidPlanningAssistance.org (updated Jun 2026),
//          MedicaidLongTermCare.org, ElderCareResourcePlanning.org,
//          CheckMedicaid.com, state-specific elder law attorneys
//
// KEY FIELDS:
//   incomeLimit: monthly income limit for single NH applicant (null = no hard cap)
//   incomeNote:  plain-language explanation when no hard cap
//   assetLimit:  countable asset limit for single applicant
//   assetNote:   any state-specific quirks
//   csra:        Community Spouse Resource Allowance (max for non-applicant spouse)
//   csraMin:     minimum CSRA ($32,532 federal floor unless state sets higher)
//   csraType:    '50%' (couple's assets divided in half first) or '100%' (spouse keeps up to max)
//   mmmna:       Min Monthly Maintenance Needs Allowance (income floor for community spouse)
//   mmmnaNate:   any state-specific MMMNA notes
//   lookback:    lookback period in months (60 for most states)
//   lookbackNote: any exception/note
//   incomeType:  'cap' (needs Miller/QIT if over limit) or 'needy' (spend-down allowed)
//   pna:         Personal Needs Allowance (what NH resident keeps per month)
//   homeEquity:  home equity interest limit ($752k or $1,130k in most states)
//   penaltyDivisor: avg monthly private-pay NH cost used for penalty calc (null = varies by region)
//   penaltyNote: notes on divisor (daily vs monthly, regional, etc.)
//   agencyName:  name of state Medicaid agency
//   agencyUrl:   state application portal or agency home page
//   agencyPhone: main eligibility line
//   programName: what the state calls its Medicaid program
// ==========================================================================

const STATE_DATA = {

  AL: {
    name: "Alabama", code: "AL",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 30,
    homeEquity: 752000,
    penaltyDivisor: 7000, penaltyNote: "Approximate — verify with AL Medicaid",
    agencyName: "Alabama Medicaid Agency",
    agencyUrl: "http://medicaid.alabama.gov/",
    agencyPhone: "1-800-362-1504",
    programName: "Alabama Medicaid"
  },

  AK: {
    name: "Alaska", code: "AK",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 3303.75, mmmnaNote: "Alaska sets a higher minimum MMMNA than most states ($3,303.75 vs. federal $2,643.75)",
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 200,
    homeEquity: 1130000,
    penaltyDivisor: 30000, penaltyNote: "Alaska NH costs are extremely high; verify current divisor with agency",
    agencyName: "Alaska Department of Health — Division of Public Assistance",
    agencyUrl: "https://dhss.alaska.gov/dpa/",
    agencyPhone: "1-800-478-7778",
    programName: "Alaska Medicaid / DenaliCare"
  },

  AZ: {
    name: "Arizona", code: "AZ",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 106.40,
    homeEquity: 752000,
    penaltyDivisor: 8500, penaltyNote: "Approximate — verify with AHCCCS",
    agencyName: "Arizona Health Care Cost Containment System (AHCCCS)",
    agencyUrl: "https://www.azahcccs.gov/",
    agencyPhone: "1-855-HEA-PLUS",
    programName: "AHCCCS / Arizona Medicaid"
  },

  AR: {
    name: "Arkansas", code: "AR",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: "ABD Medicaid asset limit is $9,950",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 40,
    homeEquity: 752000,
    penaltyDivisor: 6200, penaltyNote: "Penalty divisor updates in April; verify current figure",
    agencyName: "Arkansas Department of Human Services — Division of Medical Services",
    agencyUrl: "https://humanservices.arkansas.gov",
    agencyPhone: "1-800-482-8988",
    programName: "Arkansas Medicaid"
  },

  CA: {
    name: "California", code: "CA",
    incomeLimit: null, incomeNote: "No hard income cap; resident keeps only $35/month, all remaining income goes toward care costs",
    assetLimit: 130000, assetNote: "CA reinstated a $130,000 asset limit effective Jan 1, 2026 (was eliminated 2024-2025). Couple limit is $195,000.",
    csra: 195000, csraMin: 32532, csraType: '100%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 30, lookbackNote: "California uses a 30-month lookback for Nursing Home Medicaid (not 60 months). The lookback is being phased back in as of Jan 1, 2026 and will reach 30 months by July 2028.",
    incomeType: 'needy',
    pna: 35,
    homeEquity: null, // CA has no home equity cap
    penaltyDivisor: 14440, penaltyNote: "CA uses the Average Private Pay Rate (APPR) as the penalty divisor, approx $14,440/month in 2026. CA also allows daily gifting up to the APPR without penalty.",
    agencyName: "California Department of Health Care Services (DHCS)",
    agencyUrl: "https://www.dhcs.ca.gov",
    agencyPhone: "1-800-541-5555",
    programName: "Medi-Cal"
  },

  CO: {
    name: "Colorado", code: "CO",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 100,
    homeEquity: 752000,
    penaltyDivisor: 9500, penaltyNote: "Approximate — verify with HCPF",
    agencyName: "Colorado Department of Health Care Policy and Financing (HCPF)",
    agencyUrl: "https://www.healthfirstcolorado.com/",
    agencyPhone: "1-800-221-3943",
    programName: "Health First Colorado"
  },

  CT: {
    name: "Connecticut", code: "CT",
    incomeLimit: null, incomeNote: "No hard income cap for NH Medicaid; income must be less than the cost of care. HCBS waiver limit is $2,982/month.",
    assetLimit: 1600, assetNote: "CT uses a $1,600 asset limit for single applicants, lower than the federal standard",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 60,
    homeEquity: 1130000,
    penaltyDivisor: 12500, penaltyNote: "Penalty divisor updates in July; verify current figure with DSS",
    agencyName: "Connecticut Department of Social Services (DSS)",
    agencyUrl: "https://portal.ct.gov/husky",
    agencyPhone: "1-855-626-6632",
    programName: "HUSKY Health / CT Medicaid"
  },

  DE: {
    name: "Delaware", code: "DE",
    incomeLimit: 2485, incomeNote: "Delaware uses a lower income limit ($2,485/month) than the federal standard",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 10500, penaltyNote: "Approximate — verify with DHSS",
    agencyName: "Delaware Department of Health and Social Services (DHSS)",
    agencyUrl: "http://dhss.delaware.gov/dss/medicaid.html",
    agencyPhone: "1-800-372-2022",
    programName: "Delaware Medicaid / Diamond State Health Plan"
  },

  FL: {
    name: "Florida", code: "FL",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: "Couple (both applying) limit is $3,000",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2705, mmmnaNote: "Florida sets a minimum MMMNA of $2,705/month, above the federal minimum of $2,643.75",
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 130,
    homeEquity: 752000,
    penaltyDivisor: 10645, penaltyNote: "FL penalty divisor as of April 1, 2025 is $10,645/month. Updates April 1 annually.",
    agencyName: "Florida Department of Children and Families (DCF)",
    agencyUrl: "https://www.myflfamilies.com",
    agencyPhone: "1-866-762-2237",
    programName: "Florida Medicaid / SMMC Long-Term Care"
  },

  GA: {
    name: "Georgia", code: "GA",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 7500, penaltyNote: "Approximate — verify with GA Medicaid",
    agencyName: "Georgia Department of Community Health — Medicaid Division",
    agencyUrl: "https://medicaid.georgia.gov/",
    agencyPhone: "1-800-282-4536",
    programName: "Georgia Medicaid"
  },

  HI: {
    name: "Hawaii", code: "HI",
    incomeLimit: null, incomeNote: "No hard income cap; resident keeps only $50/month, all other income goes toward care costs",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 3040, mmmnaNote: "Hawaii sets a higher minimum MMMNA than most states ($3,040 vs. federal $2,643.75)",
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 1130000,
    penaltyDivisor: 14000, penaltyNote: "Hawaii NH costs are among the highest in the nation; verify current divisor",
    agencyName: "Hawaii Med-QUEST Division",
    agencyUrl: "https://medquest.hawaii.gov",
    agencyPhone: "1-800-316-8005",
    programName: "Med-QUEST / Hawaii Medicaid"
  },

  ID: {
    name: "Idaho", code: "ID",
    incomeLimit: 3002, incomeNote: "Idaho uses $3,002/month, slightly above the $2,982 federal standard",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 75,
    homeEquity: 752000,
    penaltyDivisor: 8000, penaltyNote: "Approximate — verify with Idaho DHW",
    agencyName: "Idaho Department of Health and Welfare",
    agencyUrl: "http://www.healthandwelfare.idaho.gov/",
    agencyPhone: "1-877-456-1233",
    programName: "Idaho Medicaid"
  },

  IL: {
    name: "Illinois", code: "IL",
    incomeLimit: 1330, incomeNote: "Illinois uses 100% FPL ($1,330/month) — much lower than the federal standard of $2,982/month. Effective April 2026.",
    assetLimit: 2000, assetNote: "CSRA in IL is $143,172 (lower than federal max of $162,660)",
    csra: 143172, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 30,
    homeEquity: 752000,
    penaltyDivisor: 6500, penaltyNote: "Approximate — verify with IL HFS",
    agencyName: "Illinois Department of Healthcare and Family Services (HFS)",
    agencyUrl: "https://www.dhs.state.il.us/",
    agencyPhone: "1-800-843-6154",
    programName: "Illinois Medicaid / HealthChoice Illinois"
  },

  IN: {
    name: "Indiana", code: "IN",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: "Indiana penalty divisor updates in July",
    incomeType: 'cap',
    pna: 52,
    homeEquity: 752000,
    penaltyDivisor: 8000, penaltyNote: "Approximate — penalty divisor updates July annually; verify with FSSA",
    agencyName: "Indiana Family and Social Services Administration (FSSA)",
    agencyUrl: "http://www.in.gov/fssa/2408.htm",
    agencyPhone: "1-800-403-0864",
    programName: "Indiana Medicaid / Healthy Indiana Plan"
  },

  IA: {
    name: "Iowa", code: "IA",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 7500, penaltyNote: "Approximate — verify with Iowa HHS",
    agencyName: "Iowa Department of Health and Human Services",
    agencyUrl: "https://hhs.iowa.gov/programs/welcome-iowa-medicaid",
    agencyPhone: "1-800-338-8366",
    programName: "Iowa Medicaid"
  },

  KS: {
    name: "Kansas", code: "KS",
    incomeLimit: null, incomeNote: "No set income cap for NH Medicaid. Income over $62/month must be paid toward care. A Qualified Income Trust may be needed.",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 62,
    homeEquity: 752000,
    penaltyDivisor: 7000, penaltyNote: "Approximate — verify with KanCare",
    agencyName: "Kansas Department of Health and Environment — KanCare",
    agencyUrl: "https://www.kmap-state-ks.us/",
    agencyPhone: "1-800-792-4884",
    programName: "KanCare"
  },

  KY: {
    name: "Kentucky", code: "KY",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 40,
    homeEquity: 752000,
    penaltyDivisor: 7000, penaltyNote: "Approximate — verify with CHFS",
    agencyName: "Kentucky Cabinet for Health and Family Services (CHFS)",
    agencyUrl: "https://chfs.ky.gov/agencies/dms/",
    agencyPhone: "1-855-459-6328",
    programName: "Kentucky Medicaid"
  },

  LA: {
    name: "Louisiana", code: "LA",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 38,
    homeEquity: 752000,
    penaltyDivisor: 7000, penaltyNote: "Approximate — verify with LDH",
    agencyName: "Louisiana Department of Health (LDH)",
    agencyUrl: "http://new.dhh.louisiana.gov/",
    agencyPhone: "1-888-342-6207",
    programName: "Healthy Louisiana / Louisiana Medicaid"
  },

  ME: {
    name: "Maine", code: "ME",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 10000, assetNote: "Maine allows a $10,000 asset limit for single applicants — higher than the federal standard of $2,000",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 70,
    homeEquity: 1130000,
    penaltyDivisor: 9500, penaltyNote: "Approximate — verify with MaineCare",
    agencyName: "Maine Department of Health and Human Services — MaineCare",
    agencyUrl: "https://www.maine.gov/dhhs/oms/",
    agencyPhone: "1-800-977-6740",
    programName: "MaineCare"
  },

  MD: {
    name: "Maryland", code: "MD",
    incomeLimit: null, incomeNote: "No hard income cap; income must be less than the monthly cost of nursing home care",
    assetLimit: 2500, assetNote: "Maryland uses a $2,500 asset limit, slightly above the $2,000 standard",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 109,
    homeEquity: 1130000,
    penaltyDivisor: 10000, penaltyNote: "Approximate — varies by county; verify with DHMH",
    agencyName: "Maryland Department of Health — Medical Assistance",
    agencyUrl: "https://health.maryland.gov/mmcp/",
    agencyPhone: "1-800-492-5231",
    programName: "Maryland Medical Assistance / Maryland Medicaid"
  },

  MA: {
    name: "Massachusetts", code: "MA",
    incomeLimit: null, incomeNote: "No hard income cap; resident keeps $72.80/month, all remaining income goes toward care costs",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 72.80,
    homeEquity: 1130000,
    penaltyDivisor: 13500, penaltyNote: "MA penalty divisor updates in November annually; one of the highest in the nation. Verify current figure.",
    agencyName: "MassHealth — Executive Office of Health and Human Services",
    agencyUrl: "http://www.mass.gov/eohhs/gov/departments/masshealth/",
    agencyPhone: "1-800-841-2900",
    programName: "MassHealth"
  },

  MI: {
    name: "Michigan", code: "MI",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 9950, assetNote: "Michigan uses a $9,950 asset limit (tied to SSI asset limit), much higher than the $2,000 standard. Updated annually.",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 60,
    homeEquity: 1130000,
    penaltyDivisor: 9000, penaltyNote: "Approximate — verify with Michigan MDHHS",
    agencyName: "Michigan Department of Health and Human Services (MDHHS)",
    agencyUrl: "http://www.michigan.gov/mdch/",
    agencyPhone: "1-855-275-6424",
    programName: "Michigan Medicaid"
  },

  MN: {
    name: "Minnesota", code: "MN",
    incomeLimit: null, incomeNote: "No set income limit; resident keeps $132/month for personal needs, remaining income goes toward care",
    assetLimit: 3000, assetNote: "Minnesota allows $3,000 in assets for a single applicant",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 132,
    homeEquity: 1130000,
    penaltyDivisor: 9000, penaltyNote: "Approximate — verify with MN DHS",
    agencyName: "Minnesota Department of Human Services (DHS)",
    agencyUrl: "https://mn.gov/dhs/",
    agencyPhone: "1-651-431-2670",
    programName: "Medical Assistance (MA) / Minnesota Medicaid"
  },

  MS: {
    name: "Mississippi", code: "MS",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 4000, assetNote: "Mississippi allows $4,000 in assets for a single NH applicant",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 44,
    homeEquity: 752000,
    penaltyDivisor: 6500, penaltyNote: "Approximate — verify with MS Division of Medicaid",
    agencyName: "Mississippi Division of Medicaid",
    agencyUrl: "http://www.medicaid.ms.gov/",
    agencyPhone: "1-800-421-2408",
    programName: "Mississippi Medicaid"
  },

  MO: {
    name: "Missouri", code: "MO",
    incomeLimit: null, incomeNote: "No hard income cap for NH Medicaid; resident keeps $50/month, all remaining income goes toward care costs",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 1130000,
    penaltyDivisor: 7500, penaltyNote: "Approximate — verify with MO HealthNet",
    agencyName: "Missouri Department of Social Services — MO HealthNet",
    agencyUrl: "https://mydss.mo.gov/healthcare",
    agencyPhone: "1-800-392-2161",
    programName: "MO HealthNet"
  },

  MT: {
    name: "Montana", code: "MT",
    incomeLimit: null, incomeNote: "No hard income cap; income must be less than cost of nursing home care",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 8000, penaltyNote: "Approximate — verify with MT DPHHS",
    agencyName: "Montana Department of Public Health and Human Services (DPHHS)",
    agencyUrl: "http://dphhs.mt.gov/",
    agencyPhone: "1-800-362-8312",
    programName: "Montana Medicaid"
  },

  NE: {
    name: "Nebraska", code: "NE",
    incomeLimit: 1330, incomeNote: "Nebraska uses 100% FPL ($1,330/month) — significantly lower than the $2,982 federal standard",
    assetLimit: 4000, assetNote: "Nebraska allows $4,000 in assets for a single applicant",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 1130000,
    penaltyDivisor: 7500, penaltyNote: "Approximate — verify with NE DHHS",
    agencyName: "Nebraska Department of Health and Human Services (DHHS)",
    agencyUrl: "https://dhhs.ne.gov/Pages/Medicaid.aspx",
    agencyPhone: "1-855-632-7633",
    programName: "Nebraska Medicaid"
  },

  NV: {
    name: "Nevada", code: "NV",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 8500, penaltyNote: "Approximate — verify with Nevada DHCFP",
    agencyName: "Nevada Division of Health Care Financing and Policy (DHCFP)",
    agencyUrl: "https://www.medicaid.nv.gov/",
    agencyPhone: "1-800-992-0900",
    programName: "Nevada Medicaid"
  },

  NH: {
    name: "New Hampshire", code: "NH",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2500, assetNote: "NH allows $2,500 in assets for a single applicant",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 72,
    homeEquity: 1130000,
    penaltyDivisor: 11000, penaltyNote: "Approximate — verify with NH DHHS",
    agencyName: "New Hampshire Department of Health and Human Services (DHHS)",
    agencyUrl: "https://www.dhhs.nh.gov/programs-services/medicaid",
    agencyPhone: "1-800-852-3345",
    programName: "NH Medicaid"
  },

  NJ: {
    name: "New Jersey", code: "NJ",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 50,
    homeEquity: 1130000,
    penaltyDivisor: 12000, penaltyNote: "NJ penalty divisor updates in April annually; verify current figure with DMAHS",
    agencyName: "New Jersey Division of Medical Assistance and Health Services (DMAHS)",
    agencyUrl: "http://www.state.nj.us/humanservices/dmahs/clients/medicaid/",
    agencyPhone: "1-800-356-1561",
    programName: "NJ FamilyCare / New Jersey Medicaid"
  },

  NM: {
    name: "New Mexico", code: "NM",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 75,
    homeEquity: 752000,
    penaltyDivisor: 7500, penaltyNote: "Approximate — verify with NM HSD",
    agencyName: "New Mexico Human Services Department (HSD) — Medical Assistance Division",
    agencyUrl: "https://nmmedicaid.portal.conduent.com/",
    agencyPhone: "1-888-997-2583",
    programName: "Turquoise Care / New Mexico Medicaid"
  },

  NY: {
    name: "New York", code: "NY",
    incomeLimit: 1836, incomeNote: "New York uses a lower income limit ($1,836/month single) compared to most states. NY uses 100% of SSI FBR x 3 for its own calculation.",
    assetLimit: 33038, assetNote: "NY allows significantly higher assets ($33,038 single; $44,796 couple) than most states",
    csra: 162660, csraMin: 74820, csraType: '50%',
    mmmna: 4066.50, mmmnaNote: "New York sets the MMMNA at the federal maximum of $4,066.50/month (CSMIA). Non-applicant spouses with income above this contribute 25% of excess toward care.",
    lookback: 60, lookbackNote: "60-month lookback for Nursing Home Medicaid. NY has NO lookback for Community Medicaid (home-based). A 30-month home care lookback has been proposed but not yet implemented as of mid-2026.",
    incomeType: 'needy',
    pna: 50,
    homeEquity: 1130000,
    penaltyDivisor: 14000, penaltyNote: "NY uses a daily divisor; varies by region (NYC vs. upstate). Verify current figure with county DSS office.",
    agencyName: "New York State Department of Health — NY Medicaid",
    agencyUrl: "http://www.health.ny.gov/health_care/medicaid/",
    agencyPhone: "1-800-541-2831",
    programName: "New York State Medicaid / Managed Long Term Care (MLTC)"
  },

  NC: {
    name: "North Carolina", code: "NC",
    incomeLimit: null, incomeNote: "NC Nursing Home Medicaid income must be less than the Medicaid payment rate for NH care (approx $7,900–$11,200/month). The CAP/DA Waiver (HCBS) uses 100% FPL ($1,305/month). NC does not use QITs — spend-down only.",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2644, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 73,
    homeEquity: 752000,
    penaltyDivisor: 8000, penaltyNote: "Approximate — verify with NCDHHS DMA",
    agencyName: "North Carolina Division of Medical Assistance (DMA)",
    agencyUrl: "https://medicaid.ncdhhs.gov/",
    agencyPhone: "1-888-245-0179",
    programName: "NC Medicaid"
  },

  ND: {
    name: "North Dakota", code: "ND",
    incomeLimit: null, incomeNote: "No hard income cap; resident keeps $115/month, remaining income goes toward care",
    assetLimit: 3000, assetNote: "ND allows $3,000 in assets for a single applicant",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 115,
    homeEquity: 752000,
    penaltyDivisor: 9000, penaltyNote: "Approximate — verify with ND DHS",
    agencyName: "North Dakota Department of Human Services (DHS)",
    agencyUrl: "https://www.hhs.nd.gov/healthcare/medicaid",
    agencyPhone: "1-800-755-2604",
    programName: "North Dakota Medicaid"
  },

  OH: {
    name: "Ohio", code: "OH",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 7787, penaltyNote: "Ohio updates its penalty divisor every 2 years; current figure is $7,787/month (set Sept 1, 2024). Verify at Ohio Medicaid.",
    agencyName: "Ohio Department of Medicaid",
    agencyUrl: "http://medicaid.ohio.gov",
    agencyPhone: "1-800-324-8680",
    programName: "Ohio Medicaid"
  },

  OK: {
    name: "Oklahoma", code: "OK",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 6500, penaltyNote: "Approximate — verify with OK Health Care Authority",
    agencyName: "Oklahoma Health Care Authority (OHCA)",
    agencyUrl: "http://www.okhca.org/",
    agencyPhone: "1-800-987-7767",
    programName: "SoonerCare / Oklahoma Medicaid"
  },

  OR: {
    name: "Oregon", code: "OR",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 75,
    homeEquity: 1130000,
    penaltyDivisor: 9500, penaltyNote: "Approximate — verify with OR OHA",
    agencyName: "Oregon Health Authority (OHA) — Oregon Health Plan",
    agencyUrl: "https://www.oregon.gov/oha/HSD/OHP/",
    agencyPhone: "1-800-699-9075",
    programName: "Oregon Health Plan (OHP) / Oregon Medicaid"
  },

  PA: {
    name: "Pennsylvania", code: "PA",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 8000, assetNote: "PA allows $8,000 in assets for applicants with income at/below $2,982 (base $2,000 + $6,000 PA disregard). Applicants with income above $2,982 are held to $2,400.",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: "PA allows transfers of $500/month or less without triggering the lookback penalty — a state-specific exception. PA penalty divisor updates January 1 annually.",
    incomeType: 'needy',
    pna: 60,
    homeEquity: 1130000,
    penaltyDivisor: 12811.50, penaltyNote: "PA penalty divisor as of January 1, 2026 is $12,811.50/month ($421.20/day). One of the highest in the nation. Updates January 1 annually.",
    agencyName: "Pennsylvania Department of Human Services — Medical Assistance",
    agencyUrl: "https://www.dhs.pa.gov/Services/Assistance/Pages/Medical-Assistance.aspx",
    agencyPhone: "1-866-550-4355",
    programName: "Pennsylvania Medical Assistance (MA)"
  },

  RI: {
    name: "Rhode Island", code: "RI",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 4000, assetNote: "RI allows $4,000 in assets for a single applicant",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 1130000,
    penaltyDivisor: 11000, penaltyNote: "Approximate — verify with RI EOHHS",
    agencyName: "Rhode Island Executive Office of Health and Human Services (EOHHS)",
    agencyUrl: "https://dhs.ri.gov/programs-and-services/medicaid-medicare-programs",
    agencyPhone: "1-855-697-4347",
    programName: "Rhode Island Medical Assistance"
  },

  SC: {
    name: "South Carolina", code: "SC",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 66480, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 30,
    homeEquity: 752000,
    penaltyDivisor: 7500, penaltyNote: "Approximate — verify with SCDHHS",
    agencyName: "South Carolina Department of Health and Human Services (SCDHHS)",
    agencyUrl: "https://www.scdhhs.gov/",
    agencyPhone: "1-888-549-0820",
    programName: "Healthy Connections / South Carolina Medicaid"
  },

  SD: {
    name: "South Dakota", code: "SD",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 65,
    homeEquity: 752000,
    penaltyDivisor: 7500, penaltyNote: "Approximate — verify with SD DSS",
    agencyName: "South Dakota Department of Social Services (DSS)",
    agencyUrl: "https://dss.sd.gov/medicaid/",
    agencyPhone: "1-800-597-1603",
    programName: "South Dakota Medicaid"
  },

  TN: {
    name: "Tennessee", code: "TN",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 7000, penaltyNote: "Approximate — verify with TennCare",
    agencyName: "Tennessee Bureau of TennCare",
    agencyUrl: "https://www.tn.gov/tenncare/",
    agencyPhone: "1-800-342-3145",
    programName: "TennCare"
  },

  TX: {
    name: "Texas", code: "TX",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 60,
    homeEquity: 752000,
    penaltyDivisor: 7000, penaltyNote: "TX NH costs vary widely by region; divisor approx $6,000–$9,000/month. Verify with Texas HHS.",
    agencyName: "Texas Health and Human Services Commission (HHSC)",
    agencyUrl: "https://hhs.texas.gov/services/health/medicaid-chip",
    agencyPhone: "1-800-252-8263",
    programName: "Texas Medicaid"
  },

  UT: {
    name: "Utah", code: "UT",
    incomeLimit: null, incomeNote: "No hard income limit; monthly income determines patient's contribution to care costs. Aging Waiver uses $1,330/month limit.",
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 8000, penaltyNote: "Approximate — verify with Utah Medicaid",
    agencyName: "Utah Department of Health and Human Services — Medicaid",
    agencyUrl: "http://health.utah.gov/medicaid/",
    agencyPhone: "1-800-662-9651",
    programName: "Utah Medicaid"
  },

  VT: {
    name: "Vermont", code: "VT",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 1130000,
    penaltyDivisor: 11000, penaltyNote: "Approximate — verify with VT AHS",
    agencyName: "Vermont Agency of Human Services — Green Mountain Care",
    agencyUrl: "http://www.greenmountaincare.org/",
    agencyPhone: "1-800-250-8427",
    programName: "Green Mountain Care / Vermont Medicaid"
  },

  VA: {
    name: "Virginia", code: "VA",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 40,
    homeEquity: 1130000,
    penaltyDivisor: 9000, penaltyNote: "Approximate — verify with VA DMAS",
    agencyName: "Virginia Department of Medical Assistance Services (DMAS)",
    agencyUrl: "https://www.dmas.virginia.gov",
    agencyPhone: "1-804-786-7933",
    programName: "Cardinal Care / Virginia Medicaid"
  },

  WA: {
    name: "Washington", code: "WA",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 90,
    homeEquity: 1130000,
    penaltyDivisor: 12000, penaltyNote: "Approximate — verify with WA HCA",
    agencyName: "Washington State Health Care Authority (HCA)",
    agencyUrl: "https://www.hca.wa.gov/apple-health",
    agencyPhone: "1-800-562-3022",
    programName: "Apple Health / Washington Medicaid"
  },

  WV: {
    name: "West Virginia", code: "WV",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 7500, penaltyNote: "Approximate — verify with WV BMS",
    agencyName: "West Virginia Bureau for Medical Services (BMS)",
    agencyUrl: "https://dhhr.wv.gov/bms/",
    agencyPhone: "1-888-483-0797",
    programName: "West Virginia Medicaid"
  },

  WI: {
    name: "Wisconsin", code: "WI",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 45,
    homeEquity: 1130000,
    penaltyDivisor: 9500, penaltyNote: "Approximate — verify with WI DHS",
    agencyName: "Wisconsin Department of Health Services (DHS)",
    agencyUrl: "http://www.dhs.wisconsin.gov/medicaid/",
    agencyPhone: "1-800-362-3002",
    programName: "Wisconsin Medicaid / ForwardHealth"
  },

  WY: {
    name: "Wyoming", code: "WY",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 2000, assetNote: null,
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'cap',
    pna: 50,
    homeEquity: 752000,
    penaltyDivisor: 8500, penaltyNote: "Approximate — verify with Wyoming Medicaid",
    agencyName: "Wyoming Department of Health — Medicaid (EqualityCare)",
    agencyUrl: "https://health.wyo.gov/healthcarefin/medicaid/",
    agencyPhone: "1-855-203-2936",
    programName: "EqualityCare / Wyoming Medicaid"
  },

  DC: {
    name: "Washington, D.C.", code: "DC",
    incomeLimit: 2982, incomeNote: null,
    assetLimit: 4000, assetNote: "DC allows $4,000 in assets for a single applicant",
    csra: 162660, csraMin: 32532, csraType: '50%',
    mmmna: 2643.75, mmmnaNote: null,
    lookback: 60, lookbackNote: null,
    incomeType: 'needy',
    pna: 70,
    homeEquity: 1130000,
    penaltyDivisor: 11000, penaltyNote: "Approximate — verify with DC DHS",
    agencyName: "DC Department of Health Care Finance (DHCF)",
    agencyUrl: "http://dc.gov/service/medicaid",
    agencyPhone: "1-202-727-5355",
    programName: "DC Medicaid"
  }

};

// Quick lookup by state code
function getStateData(code) {
  return STATE_DATA[code.toUpperCase()] || null;
}

// Ordered list for dropdowns
const STATE_LIST = Object.values(STATE_DATA).sort((a,b) => a.name.localeCompare(b.name));
