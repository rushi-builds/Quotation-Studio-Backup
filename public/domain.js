/* Shared deterministic domain logic. No environment, clock, storage or UI dependencies. */
(function (root, factory) {
  if (typeof module === "object") module.exports = factory();
  else root.Domain = factory();
})(globalThis, () => {
  "use strict";
  const finite = (n) => typeof n === "number" && Number.isFinite(n);
  const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fields = {
    capacity: ["DC capacity (kWp)", 0.001, 100000],
    genFactor: ["Specific yield (kWh/kWp/year)", 0, 3000],
    costPerKwp: ["Price per kWp (₹)", 0, 10000000],
    gstPercent: ["GST (%)", 0, 100],
    tariff: ["Self-consumption tariff (₹/kWh)", 0, 1000],
    exportTariff: ["Export credit (₹/kWh)", 0, 1000],
    selfConsumption: ["Self-consumption (%)", 0, 100],
    escalation: ["Tariff escalation (%/year)", -20, 20],
    degradation: ["Generation degradation (%/year)", 0, 10],
    annualOm: ["Annual O&M (₹, constant)", 0, 100000000],
    years: ["Projection years", 1, 40],
    subsidy: ["Subsidy amount (₹)", 0, 100000000],
    payAdvance: ["Advance (%)", 0, 100],
    payDispatch: ["Dispatch (%)", 0, 100],
    payCompletion: ["Completion (%)", 0, 100],
  };
  function validateFinance(f, complete = false) {
    const errors = [];
    for (const [k, [label, min, max]] of Object.entries(fields)) {
      const n = f[k];
      if (n == null) {
        if (complete) errors.push(`${label} is required`);
        continue;
      }
      if (
        !finite(n) ||
        n < min ||
        n > max ||
        (k === "years" && !Number.isInteger(n))
      )
        errors.push(
          `${label} must be ${min}–${max}${k === "years" ? " (whole years)" : ""}`,
        );
    }
    const p = ["payAdvance", "payDispatch", "payCompletion"];
    if (
      p.every((k) => finite(f[k])) &&
      Math.abs(p.reduce((s, k) => s + f[k], 0) - 100) > 0.000001
    )
      errors.push("Payment percentages must total 100%");
    if (
      f.subsidy > 0 &&
      (f.customerType !== "residential" ||
        f.subsidyEligibility !== "confirmed" ||
        !f.subsidySource?.trim())
    )
      errors.push(
        "Positive subsidy requires residential eligibility confirmation and a source/reference",
      );
    if (
      finite(f.capacity) &&
      finite(f.costPerKwp) &&
      finite(f.gstPercent) &&
      finite(f.subsidy) &&
      f.subsidy >
        money(
          money(f.capacity * f.costPerKwp) +
            money((money(f.capacity * f.costPerKwp) * f.gstPercent) / 100),
        )
    )
      errors.push("Subsidy cannot exceed the total project cost");
    if (complete && !f.assumptions?.trim())
      errors.push("Input sources and assumptions are required");
    return errors;
  }
  function irr(flows) {
    if (
      !flows.every(finite) ||
      flows[0] >= 0 ||
      !flows.slice(1).some((x) => x > 0)
    )
      return null;
    const signs = flows.filter((x) => x !== 0).map(Math.sign);
    if (signs.slice(1).filter((s, i) => s !== signs[i]).length !== 1)
      return null;
    const npv = (r) => flows.reduce((s, v, i) => s + v / Math.pow(1 + r, i), 0);
    let lo = -0.999,
      hi = 1;
    while (npv(hi) > 0 && hi < 1000000) hi *= 2;
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (npv(mid) > 0) lo = mid;
      else hi = mid;
    }
    return ((lo + hi) / 2) * 100;
  }
  function compute(f) {
    const errors = validateFinance(f, true);
    if (errors.length) return { available: false, errors };
    const projectCost = money(f.capacity * f.costPerKwp),
      gstAmount = money((projectCost * f.gstPercent) / 100),
      totalCost = money(projectCost + gstAmount),
      netInvestment = money(totalCost - f.subsidy);
    const annualGen = f.capacity * f.genFactor,
      rows = [];
    let cumulative = -netInvestment,
      payback = netInvestment === 0 ? 0 : null;
    for (let year = 1; year <= f.years; year++) {
      const generation =
        annualGen * Math.pow(1 - f.degradation / 100, year - 1);
      const revenue =
        generation *
        ((f.selfConsumption / 100) * f.tariff +
          (1 - f.selfConsumption / 100) * f.exportTariff) *
        Math.pow(1 + f.escalation / 100, year - 1);
      const net = revenue - f.annualOm,
        previous = cumulative;
      cumulative += net;
      if (payback === null && previous < 0 && cumulative >= 0 && net > 0)
        payback = year - 1 + -previous / net;
      rows.push({ year, generation, revenue, om: f.annualOm, net, cumulative });
    }
    return {
      available: true,
      projectCost,
      gstAmount,
      totalCost,
      netInvestment,
      annualGen,
      annualSaving: rows[0].net,
      payback,
      irr: irr([-netInvestment, ...rows.map((r) => r.net)]),
      lifetimeNet: rows.reduce((s, r) => s + r.net, 0) - netInvestment,
      rows,
    };
  }
  function kwh(n) {
    if (!finite(n)) return "Unavailable";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + " GWh";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + " MWh";
    return n.toFixed(0) + " kWh";
  }
  function inr(n) {
    return finite(n)
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        }).format(n)
      : "Unavailable";
  }
  /* Conventional equal-length strings only, homogeneous independent MPPTs.
   Optimizer, hybrid/battery and unequal-string topologies are explicitly unsupported. */
  function design(d) {
    const required = [
      "moduleCount",
      "wp",
      "voc",
      "vmp",
      "isc",
      "imp",
      "tempCoeffVoc",
      "tempCoeffVmp",
      "tempCoeffIsc",
      "minCellTemp",
      "maxCellTemp",
      "mpptMin",
      "mpptMax",
      "maxDCVoltage",
      "mpptCount",
      "inputsPerMppt",
      "maxCurrentPerMppt",
      "maxIscPerMppt",
      "acKw",
      "maxDcKw",
      "currentSafetyFactor",
    ];
    const missing = required.filter((k) => !finite(d?.[k]));
    if (missing.length)
      return {
        available: false,
        errors: missing.map((k) => `${k}: required datasheet/site input`),
      };
    const errors = [];
    for (const k of required.filter(
      (k) =>
        ![
          "tempCoeffVoc",
          "tempCoeffVmp",
          "tempCoeffIsc",
          "minCellTemp",
          "maxCellTemp",
        ].includes(k),
    ))
      if (d[k] <= 0) errors.push(`${k} must be positive`);
    for (const k of ["moduleCount", "mpptCount", "inputsPerMppt"])
      if (!Number.isInteger(d[k])) errors.push(`${k} must be an integer`);
    if (d.moduleCount > 100000 || d.mpptCount > 100 || d.inputsPerMppt > 100)
      errors.push("Design exceeds supported search limits");
    if (
      d.minCellTemp > d.maxCellTemp ||
      d.minCellTemp < -100 ||
      d.maxCellTemp > 150
    )
      errors.push("Invalid cell temperature range");
    if (d.mpptMin > d.mpptMax || d.mpptMax > d.maxDCVoltage)
      errors.push("Invalid inverter voltage limits");
    if (d.currentSafetyFactor < 1 || d.currentSafetyFactor > 3)
      errors.push(
        "Current safety factor must be explicitly specified between 1 and 3",
      );
    if (
      d.tempCoeffVoc > 0 ||
      d.tempCoeffVmp > 0 ||
      Math.abs(d.tempCoeffVoc) > 2 ||
      Math.abs(d.tempCoeffVmp) > 2 ||
      Math.abs(d.tempCoeffIsc) > 2
    )
      errors.push("Unsupported temperature coefficients (%/°C)");
    if (d.vmp >= d.voc || d.imp > d.isc)
      errors.push("Invalid module STC voltage/current relationship");
    const installedKwp = (d.moduleCount * d.wp) / 1000;
    if (installedKwp > d.maxDcKw)
      errors.push("Installed DC exceeds inverter maximum DC power");
    if (errors.length) return { available: false, errors };
    const adjusted = (base, c, t) => base * (1 + (c / 100) * (t - 25));
    const maxVoc = Math.max(
      adjusted(d.voc, d.tempCoeffVoc, d.minCellTemp),
      adjusted(d.voc, d.tempCoeffVoc, d.maxCellTemp),
    );
    const minVmp = Math.min(
      adjusted(d.vmp, d.tempCoeffVmp, d.minCellTemp),
      adjusted(d.vmp, d.tempCoeffVmp, d.maxCellTemp),
    );
    const maxVmp = Math.max(
      adjusted(d.vmp, d.tempCoeffVmp, d.minCellTemp),
      adjusted(d.vmp, d.tempCoeffVmp, d.maxCellTemp),
    );
    const maxIsc =
      Math.max(
        adjusted(d.isc, d.tempCoeffIsc, d.minCellTemp),
        adjusted(d.isc, d.tempCoeffIsc, d.maxCellTemp),
      ) * d.currentSafetyFactor;
    if (Math.min(maxVoc, minVmp, maxVmp, maxIsc) <= 0)
      return {
        available: false,
        errors: ["Temperature adjustment is nonphysical"],
      };
    const minSeries = Math.ceil(d.mpptMin / minVmp),
      maxSeries = Math.min(
        d.moduleCount,
        Math.floor(d.maxDCVoltage / maxVoc),
        Math.floor(d.mpptMax / maxVmp),
      );
    // Conservative operating-current envelope: temperature/safety-adjusted Isc bounds Imp.
    const parallelLimit = Math.min(
      d.inputsPerMppt,
      Math.floor(d.maxCurrentPerMppt / maxIsc),
      Math.floor(d.maxIscPerMppt / maxIsc),
    );
    for (let series = maxSeries; series >= Math.max(1, minSeries); series--) {
      if (d.moduleCount % series) continue;
      const strings = d.moduleCount / series;
      if (strings > d.mpptCount * parallelLimit) continue;
      const allocation = Array.from({ length: d.mpptCount }, (_, i) =>
        Math.min(parallelLimit, Math.max(0, strings - i * parallelLimit)),
      );
      return {
        available: true,
        installedKwp,
        dcacRatio: installedKwp / d.acKw,
        series,
        strings,
        allocation,
        maxStringVoc: series * maxVoc,
        minStringVmp: series * minVmp,
        maxStringVmp: series * maxVmp,
        designCurrentPerString: maxIsc,
        config: `${series} modules/string × ${strings} strings`,
        note: "Conservative preliminary check only. Source verification, tolerances, bifacial gain, protection, startup/full-power ranges, cable/structure and local code review require a qualified engineer.",
      };
    }
    return {
      available: false,
      errors: [
        "No supported equal-string allocation satisfies all supplied voltage, current and MPPT constraints. Do not install from this result.",
      ],
    };
  }
  return {
    version: "2.0.0",
    fields,
    finite,
    validateFinance,
    compute,
    irr,
    kwh,
    inr,
    design,
  };
});
