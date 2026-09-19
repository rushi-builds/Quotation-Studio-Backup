/* ==========================================================================
   KTM Solar Platform — Financial Engine
   --------------------------------------------------------------------------
   Single source of truth for all financial calculations.
   Imported by: builder.js, proposal.js
   No UI code here. Pure calculation functions only.

   Engineering data rule:
   If a required input is 0 or missing, the affected output is returned
   as 0 / NaN — never fabricated. Callers must check for DATA_REQUIRED state.
   ========================================================================== */
'use strict';

const FinancialEngine = (() => {

  /* ── Subsidy calculation ──────────────────────────────────────────────────
   * PM Surya Ghar Muft Bijli Yojana (residential) slabs:
   *   ≤ 2 kW: ₹30,000/kW
   *   2–3 kW: ₹30,000 × 2 + ₹18,000 × (kWp − 2)
   *   ≥ 3 kW: ₹78,000 (capped)
   * Source: Ministry of New & Renewable Energy, 2024.
   * Non-residential (commercial/industrial): typically ₹0 — override via form.
   * ─────────────────────────────────────────────────────────────────────── */
  function calcSubsidy(kwp) {
    if (!kwp || kwp <= 0) return 0;
    if (kwp <= 2) return 30000 * kwp;
    if (kwp < 3)  return 60000 + 18000 * (kwp - 2);
    return 78000;
  }

  /* ── IRR via bisection ── */
  function calcIRR(cashflows) {
    const npv = (rate) => {
      let v = 0;
      for (let i = 0; i < cashflows.length; i++) {
        v += cashflows[i] / Math.pow(1 + rate, i);
      }
      return v;
    };
    let low = -0.95, high = 10, mid = 0;
    for (let i = 0; i < 200; i++) {
      mid = (low + high) / 2;
      const val = npv(mid);
      if (Math.abs(val) < 1) break;
      if (val > 0) low = mid; else high = mid;
    }
    return mid * 100; // percent
  }

  /* ── Main computation ────────────────────────────────────────────────────
   * @param {object} inputs
   *   capacity     {number}  kWp
   *   genFactor    {number}  kWh / kWp / year (planning benchmark ~1400–1460 for Western India; not site-validated)
   *   costPerKwp   {number}  ₹ per kWp (before GST)
   *   gstPercent   {number}  % (13.8% composite [70% goods @ 12% + 30% services @ 18%] or 18% standard EPC)
   *   subsidyOverride {number|null}  if provided, overrides calcSubsidy()
   *   tariff       {number}  ₹ per kWh
   *   escalation   {number}  annual tariff escalation fraction (e.g. 0.03 planning assumption)
   *   degradation  {number}  annual panel degradation fraction (e.g. 0.005 warranty curve)
   *
   * @returns {object}  All output values. Zero if input missing/zero.
   *   Also returns yearlyData[] for charting (25 years).
   * ─────────────────────────────────────────────────────────────────────── */
  function compute(inputs) {
    const {
      capacity    = 0,
      genFactor   = 0,
      costPerKwp  = 0,
      gstPercent  = 13.8, // 13.8% statutory composite (Notification No. 8/2021-Central Tax) or 18% standard EPC
      subsidyOverride = null,
      tariff      = 0,
      escalation  = 0.03,
      degradation = 0.005,
    } = inputs;

    const projectCost   = capacity * costPerKwp;
    const gstAmount     = projectCost * gstPercent / 100;
    const totalCost     = projectCost + gstAmount;
    const subsidy       = (subsidyOverride !== null && subsidyOverride >= 0)
                            ? subsidyOverride
                            : calcSubsidy(capacity);
    const netInvestment = totalCost - subsidy;
    const annualGen     = capacity * genFactor;
    const annualSaving  = annualGen * tariff;

    // 25-year DCF with degradation + escalation
    const YEARS = 25;
    let gen = annualGen;
    let t   = tariff;
    let lifetimeSaving  = 0;
    let lifetimeGenKWh  = 0;
    const cashflows     = [-netInvestment];
    const yearlyData    = [];

    for (let y = 0; y < YEARS; y++) {
      const yearGen     = gen;
      const yearTariff  = t;
      const yearSaving  = yearGen * yearTariff;
      let   cumSaving   = 0;
      lifetimeSaving   += yearSaving;
      lifetimeGenKWh   += yearGen;
      cashflows.push(yearSaving);

      yearlyData.push({
        year:        y + 1,
        generation:  Math.round(yearGen),     // kWh
        saving:      Math.round(yearSaving),  // ₹
        cumSaving:   Math.round(lifetimeSaving), // ₹ cumulative
      });

      gen = gen * (1 - degradation);
      t   = t   * (1 + escalation);
    }

    const payback = annualSaving > 0 ? netInvestment / annualSaving : 0;
    const irr     = netInvestment > 0 && annualSaving > 0 ? calcIRR(cashflows) : 0;

    // Environmental impact
    // CO₂ emission factor: 0.79 kg CO₂ per kWh (India average, CEA 2023)
    // Tree sequestration: ~21.77 kg CO₂/tree/year → 25yr ≈ 544.3 kg/tree
    const CO2_PER_KWH  = 0.79;  // kg
    const KG_PER_TREE  = 58.4;  // kg CO₂ / tree (lifetime basis used by MoEFCC)
    const co2Annual    = (annualGen    * CO2_PER_KWH) / 1000; // tonnes
    const co2Lifetime  = (lifetimeGenKWh * CO2_PER_KWH) / 1000; // tonnes
    const treesAnnual  = (co2Annual    * 1000) / KG_PER_TREE;
    const treesLifetime= (co2Lifetime  * 1000) / KG_PER_TREE;

    // Payback crossover index in yearlyData
    let paybackYear = null;
    let runningCum = 0;
    for (let i = 0; i < yearlyData.length; i++) {
      runningCum += yearlyData[i].saving;
      yearlyData[i].cumSaving = Math.round(runningCum);
      if (paybackYear === null && runningCum >= netInvestment) {
        paybackYear = i + 1;
      }
    }

    return {
      // Cost
      projectCost, gstAmount, totalCost, subsidy, netInvestment,
      // Generation
      annualGen, lifetimeGenKWh,
      // Financial
      annualSaving, lifetimeSaving, payback, irr,
      // Environmental
      co2Annual, co2Lifetime, treesAnnual, treesLifetime,
      // Derived
      paybackYear,
      // Chart data
      yearlyData,
    };
  }

  /* ── Validators — expose DATA_REQUIRED state to callers ── */
  function validate(inputs) {
    const issues = [];
    if (!inputs.capacity    || inputs.capacity    <= 0) issues.push('System capacity (kWp)');
    if (!inputs.genFactor   || inputs.genFactor   <= 0) issues.push('Generation factor (kWh/kWp)');
    if (!inputs.costPerKwp  || inputs.costPerKwp  <= 0) issues.push('Cost per kWp (₹)');
    if (!inputs.tariff      || inputs.tariff      <= 0) issues.push('Electricity tariff (₹/kWh)');
    return { valid: issues.length === 0, missing: issues };
  }

  /* ── Formatting helpers ── */
  function fmtINR(n) {
    if (!n && n !== 0) return '—';
    if (isNaN(n)) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
  function fmtNum(n) {
    if (!n && n !== 0) return '—';
    if (isNaN(n)) return '—';
    return Math.round(n).toLocaleString('en-IN');
  }
  function fmtKwh(n) {
    if (!n || isNaN(n)) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + ' MWh';
    if (n >= 1000)    return (n / 1000).toFixed(1) + ' MWh';
    return Math.round(n).toLocaleString('en-IN') + ' kWh';
  }
  function fmtPayback(years) {
    if (!years || isNaN(years)) return '—';
    return years.toFixed(1) + ' yrs';
  }
  function fmtDate(dstr) {
    if (!dstr) return '';
    const d = new Date(dstr + 'T00:00:00');
    const day  = d.getDate();
    const suf  = (day % 10 === 1 && day !== 11) ? 'st'
               : (day % 10 === 2 && day !== 12) ? 'nd'
               : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    return `${day}${suf} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  function fmtINRCrore(n) {
    if (!n || isNaN(n)) return '—';
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
    if (n >= 100000)   return '₹' + (n / 100000).toFixed(2) + ' L';
    return fmtINR(n);
  }

  return { compute, calcSubsidy, calcIRR, validate, fmtINR, fmtNum, fmtKwh, fmtPayback, fmtDate, fmtINRCrore };
})();
