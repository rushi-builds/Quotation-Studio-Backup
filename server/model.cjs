"use strict";
const D = require("../public/domain.js");
function fail(message, status = 422) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function object(x, label) {
  if (!x || typeof x !== "object" || Array.isArray(x))
    fail(`${label} must be an object`);
  return x;
}
function keys(x, allowed) {
  object(x, "Record");
  for (const k of Object.keys(x))
    if (!allowed.includes(k)) fail(`Unexpected field: ${k}`);
}
function text(x, label, max = 500, required = false) {
  if (x == null && !required) return "";
  if (typeof x !== "string" || x.length > max || (required && !x.trim()))
    fail(`${label} is required or exceeds ${max} characters`);
  return x.trim();
}
function customer(x) {
  keys(x, ["name", "company", "email", "phone", "address", "type"]);
  const c = {};
  for (const k of ["name", "company", "email", "phone", "address"])
    c[k] = text(x[k], k, k === "address" ? 2000 : 200, k === "name");
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
    fail("Invalid email");
  if (!["residential", "commercial", "industrial"].includes(x.type))
    fail("Customer type required");
  c.type = x.type;
  return c;
}
function proposal(x) {
  keys(x, [
    "title",
    "customerId",
    "finance",
    "engineering",
    "scope",
    "exclusions",
    "terms",
    "companyPhone",
    "companyEmail",
    "validUntil",
  ]);
  const p = {
    title: text(x.title, "Title", 200, true),
    customerId: text(x.customerId, "Customer ID", 100, true),
  };
  for (const k of ["scope", "exclusions", "terms"]) p[k] = text(x[k], k, 12000);
  p.companyPhone = text(x.companyPhone, "Company phone", 60);
  p.companyEmail = text(x.companyEmail, "Company email", 200);
  if (p.companyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.companyEmail))
    fail("Invalid company email");
  p.validUntil = text(x.validUntil, "Valid until", 10);
  if (
    p.validUntil &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(p.validUntil) ||
      !Number.isFinite(Date.parse(p.validUntil + "T23:59:59Z")) ||
      new Date(p.validUntil + "T23:59:59Z").toISOString().slice(0, 10) !==
        p.validUntil)
  )
    fail("Invalid expiry date");
  const f = object(x.finance, "Finance");
  keys(f, [
    ...Object.keys(D.fields),
    "customerType",
    "subsidyEligibility",
    "subsidySource",
    "assumptions",
  ]);
  p.finance = {};
  for (const k of Object.keys(D.fields)) p.finance[k] = f[k] ?? null;
  p.finance.customerType = text(f.customerType, "Customer type", 20);
  p.finance.subsidyEligibility = text(f.subsidyEligibility, "Eligibility", 30);
  p.finance.subsidySource = text(f.subsidySource, "Subsidy source", 2000);
  p.finance.assumptions = text(f.assumptions, "Assumptions", 12000);
  const errs = D.validateFinance(p.finance);
  if (errs.length) fail(errs.join("; "));
  const e = object(x.engineering ?? {}, "Engineering");
  const numeric = [
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
  keys(e, [...numeric, "moduleModel", "inverterModel", "sourceNotes"]);
  p.engineering = {};
  for (const k of numeric) {
    if (e[k] != null && (!D.finite(e[k]) || Math.abs(e[k]) > 1e8))
      fail(`Invalid engineering value: ${k}`);
    p.engineering[k] = e[k] ?? null;
  }
  for (const k of ["moduleModel", "inverterModel", "sourceNotes"])
    p.engineering[k] = text(e[k], k, k === "sourceNotes" ? 12000 : 200);
  return p;
}
function shareErrors(p) {
  const e = D.validateFinance(p.finance, true);
  for (const k of [
    "scope",
    "exclusions",
    "terms",
    "companyPhone",
    "companyEmail",
    "validUntil",
  ])
    if (!p[k]) e.push(`${k} required for customer release`);
  if (p.validUntil && Date.parse(p.validUntil + "T23:59:59Z") <= Date.now())
    e.push("Proposal expiry must be in the future");
  if (!p.customer.address) e.push("Customer site/address required");
  const eng = p.engineering;
  if (
    D.finite(eng.moduleCount) &&
    D.finite(eng.wp) &&
    D.finite(p.finance.capacity) &&
    Math.abs((eng.moduleCount * eng.wp) / 1000 - p.finance.capacity) > 0.000001
  )
    e.push(
      "Quoted DC capacity must equal the module-derived installed capacity",
    );
  return e;
}
module.exports = { fail, keys, text, customer, proposal, shareErrors };
