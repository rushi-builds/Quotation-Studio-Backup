const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  D = require("../public/domain.js"),
  M = require("../server/model.cjs"),
  { finance, engineering, proposal } = require("./fixtures.cjs");
test("explicit zero tax, escalation, export and payment values survive", () => {
  const r = D.compute(finance);
  assert.equal(r.available, true);
  assert.equal(r.gstAmount, 0);
  assert.equal(r.annualSaving, 56000);
  assert.equal(r.rows[24].net, 56000);
  assert.equal(r.netInvestment, 250000);
  assert.equal(r.payback, 250000 / 56000);
  assert.equal(r.lifetimeNet, 1150000);
});
test("missing inputs never silently default or coerce", () => {
  for (const k of Object.keys(D.fields)) {
    assert.equal(D.compute({ ...finance, [k]: null }).available, false, k);
    assert.equal(D.compute({ ...finance, [k]: "" }).available, false, k);
  }
  assert.equal(D.compute({}).available, false);
});
test("negative, non-finite, extreme and fractional-year data rejected", () => {
  for (const f of [
    { tariff: -1 },
    { capacity: Infinity },
    { costPerKwp: NaN },
    { years: 2.5 },
    { years: 41 },
    { capacity: 1e50 },
    { degradation: 101 },
  ])
    assert.equal(D.compute({ ...finance, ...f }).available, false);
});
test("subsidy is explicit, eligibility-controlled and cannot exceed cost", () => {
  assert.equal(D.compute({ ...finance, subsidy: 78000 }).available, false);
  assert.equal(
    D.compute({
      ...finance,
      subsidy: 78000,
      subsidyEligibility: "confirmed",
      subsidySource: "test source",
    }).available,
    true,
  );
  assert.equal(
    D.compute({
      ...finance,
      subsidy: 1,
      customerType: "commercial",
      subsidyEligibility: "confirmed",
      subsidySource: "source",
    }).available,
    false,
  );
  assert.equal(
    D.compute({
      ...finance,
      subsidy: 250001,
      subsidyEligibility: "confirmed",
      subsidySource: "source",
    }).available,
    false,
  );
});
test("payment schedule must add to 100 including zero", () => {
  assert.deepEqual(D.validateFinance(finance), []);
  assert.equal(D.compute({ ...finance, payAdvance: 30 }).available, false);
});
test("zero savings is not zero-year payback; zero investment IRR unavailable", () => {
  const r = D.compute({ ...finance, tariff: 0 });
  assert.equal(r.payback, null);
  assert.equal(r.irr, null);
  const free = D.compute({ ...finance, costPerKwp: 0 });
  assert.equal(free.payback, 0);
  assert.equal(free.irr, null);
});
test("IRR numeric regression and energy units", () => {
  assert.ok(Math.abs(D.irr([-100, 110]) - 10) < 1e-8);
  assert.equal(D.kwh(1e6), "1.00 GWh");
  assert.equal(D.kwh(1000), "1.00 MWh");
  assert.equal(D.kwh(null), "Unavailable");
  assert.equal(D.inr(null), "Unavailable");
});
test("net savings include O&M and blended export revenues", () => {
  const f = D.compute({
    ...finance,
    selfConsumption: 50,
    exportTariff: 2,
    annualOm: 1000,
  });
  assert.equal(f.annualSaving, 34000);
});
test("equal-string sizing consumes exactly available modules", () => {
  const d = D.design(engineering);
  assert.equal(d.available, true);
  assert.equal(d.series * d.strings, engineering.moduleCount);
  assert.equal(
    d.allocation.reduce((a, b) => a + b, 0),
    d.strings,
  );
  assert.ok(d.maxStringVoc <= engineering.maxDCVoltage);
  assert.ok(d.minStringVmp >= engineering.mpptMin);
});
test("three modules cannot become twenty; missing parameters never fabricated", () => {
  assert.equal(D.design({ ...engineering, moduleCount: 3 }).available, false);
  assert.equal(D.design({ moduleCount: 3 }).available, false);
  for (const k of Object.keys(engineering))
    assert.equal(D.design({ ...engineering, [k]: null }).available, false, k);
});
test("temperature, current, DC power and bad physical relationships block layout", () => {
  for (const change of [
    { maxCurrentPerMppt: 1 },
    { maxIscPerMppt: 1 },
    { maxDcKw: 1 },
    { minCellTemp: 100, maxCellTemp: 0 },
    { vmp: 100 },
    { imp: 99 },
    { currentSafetyFactor: 0 },
    { moduleCount: 1.2 },
    { mpptCount: 0 },
    { tempCoeffVoc: 50 },
  ])
    assert.equal(
      D.design({ ...engineering, ...change }).available,
      false,
      JSON.stringify(change),
    );
});
test("deterministic sweep of possible designs respects all reported constraints", () => {
  for (let n = 1; n < 200; n++) {
    const e = { ...engineering, moduleCount: n, maxDcKw: 1000 },
      r = D.design(e);
    if (!r.available) continue;
    assert.equal(r.series * r.strings, n);
    assert.ok(
      r.allocation.every(
        (x) =>
          x <= e.inputsPerMppt &&
          x * r.designCurrentPerString <= e.maxCurrentPerMppt &&
          x * r.designCurrentPerString <= e.maxIscPerMppt,
      ),
    );
    assert.ok(r.maxStringVoc <= e.maxDCVoltage);
    assert.ok(r.maxStringVmp <= e.mpptMax);
    assert.ok(r.minStringVmp >= e.mpptMin);
  }
});
test("strict schema rejects unknown fields and preserves zero", () => {
  assert.throws(() => M.proposal({ ...proposal("id"), status: "accepted" }));
  assert.throws(() =>
    M.customer({ name: "x", type: "residential", __unexpected: 1 }),
  );
  assert.equal(M.proposal(proposal("id")).finance.payAdvance, 0);
});
test("IRR unavailable for multiple sign changes rather than selecting an arbitrary root", () => {
  assert.equal(D.irr([-100, 230, -132]), null);
});
test("invalid calendar dates reject as validation errors, not internal failures", () => {
  for (const date of ["2026-99-99", "2026-02-30", "not-a-date"])
    assert.throws(
      () => M.proposal({ ...proposal("id"), validUntil: date }),
      (e) => e.status === 422,
    );
});
