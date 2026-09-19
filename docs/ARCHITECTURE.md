# Architecture and calculation contract

## Data model

- **users / sessions**: operator-provisioned company staff; salted password hashes,
  hashed session bearer, CSRF token, server expiry and active-account checks.
- **customers**: UUID, optimistic revision, current contact data and timestamps.
- **proposals**: stable UUID, customer FK, latest revision and timestamps.
- **revisions**: immutable input + customer snapshot + frozen financial/electrical
  outputs + engine version; SHA-256 digest; author FK and timestamp.
- **shares**: hashed random token, exact revision FK, expiry and revocation state.
- **views**: unique hashed visitor-cookie/link pair; no “verified human” claim.
- **acceptances**: one record/proposal, exact revision FK, digest, consent, typed
  name/email and timestamp. Self-asserted identity. Immutable by trigger.
- **audit**: append-only application events with actor/entity/time.
- **idempotency**: actor + route + request key, input digest and committed response;
  saved within the same transaction as the mutation.
- **limits**: persistent coarse abuse counters.

New revisions and share revocation occur in one transaction. Acceptance rechecks
link validity inside its transaction after reading the request body; it cannot
race a revision into accepting a revoked offer. Accepted proposals are locked.
Draft → released → expired/draft is derived from live links; intent-recorded is
derived from the acceptance record. Staff cannot send arbitrary statuses.

Portable imports assign fresh UUIDs and remap relationships. All validation precedes
one transaction. Full database recovery is separate from portable data exchange.

## Financial engine 2.0.0

`public/domain.js` is shared by server and browser. The server alone creates the
canonical revision snapshot. Existing snapshots are read, not recalculated when a
later engine changes. A new staff save explicitly recalculates into a new revision.

No financial input defaults exist. Blank is null, not 0. Drafts can be incomplete,
but a customer release requires all numeric inputs, sources/assumptions, commercial
scope, exclusions, terms, company contact, site/address and future expiry.

- Price = entered DC kWp × price/kWp; rounded to paise.
- GST = rounded project price × entered percentage; rounded to paise.
- Net investment = gross cost minus explicitly entered subsidy.
- Subsidy cannot exceed cost. A positive amount needs residential category,
  confirmed eligibility and a source/reference. No live policy validation occurs.
- Generation year y = capacity × specific yield × (1 − degradation)^(y−1).
- Revenue = generation × [self-consumption fraction × tariff + export fraction ×
  export credit] × (1 + tariff escalation)^(y−1).
- Net operating saving = revenue − explicit constant annual O&M.
- Payback = first interpolated undiscounted cumulative cash-flow crossover.
  “Not reached” is returned if no crossover exists within the projection horizon.
- IRR uses bounded bisection for a conventional cash-flow sign pattern. Missing
  roots, zero initial investment and multiple sign changes return unavailable,
  rather than choosing an arbitrary rate.
- Lifetime net = sum of nominal net operating savings minus net investment.

No NPV/discounted-payback claim. No implied loan, tax benefit, inverter replacement,
carbon/tree conversion or valuation. The model is intentionally limited; omission
of real costs can overstate returns and must be documented/reviewed.

Input ranges are **supported product bounds**, not statutory/physical evidence:
capacity 0.001–100,000 kWp, specific yield 0–3,000 kWh/kWp/year, horizon 1–40 whole
years, escalation −20–20%, degradation 0–10%, payment fields 0–100 summing to 100.
API rejects non-finite numbers, numeric strings, unknown fields and out-of-range
values. These bounds do not certify plausible project inputs.

All numeric inputs are staff-supplied. Sources and assumptions are explicit text
records. Derived values and estimates are labelled. There is no “verified” status
that a catalogue value can acquire just by existing in source code.

## Electrical engine: deliberately preliminary

Supported topology: homogeneous modules; equal string length; a conventional
inverter whose MPPTs share identical supplied limits. Inputs include exact count,
STC power/Voc/Vmp/Isc/Imp, Voc/Vmp/Isc temperature coefficients, minimum/maximum
**cell** temperatures, MPPT min/max, absolute DC voltage, MPPT count, string-input
count, operating/short-circuit current limits, AC/DC power and an explicit current
safety factor.

The solver:

1. Rejects missing/non-finite/nonphysical inputs and unsupported search sizes.
2. Calculates worst-case voltage/current across both cell-temperature endpoints.
3. Bounds series count by hot/cold MPPT voltage and absolute DC Voc limits.
4. Searches only divisors of the actual module count.
5. Allocates whole strings across the actual MPPT/input capacity.
6. Uses safety-adjusted, temperature-adjusted Isc as a **conservative upper bound**
   for operating current as well as the inverter short-circuit constraint.
7. Requires installed DC ≤ the explicitly supplied inverter DC limit.
8. Returns no layout if a supported safe candidate cannot be established.

Every returned layout satisfies series × strings = module count and allocation
sum = strings. The capacity used for a released quote must match module-derived
capacity when both module count and Wp have been entered.

This may reject a feasible design (e.g. unequal strings across independent MPPTs)
rather than invent one. It does NOT model optimizer constraints, bifacial gain,
manufacturer tolerances, startup/full-power MPPT ranges, transients, cable derating,
earthing/protection, structural loads, shading, roof setbacks or local installation
standards. Required independent engineering is displayed even for a candidate
that passes the implemented constraints. Source authenticity is not machine-verified.

## UI and export

The active UI has a light, green/gold design system, local fonts/assets, associated
labels, keyboard focus styles, scrollable-table focus access and mobile breakpoints.
Untrusted text is escaped for HTML/attribute contexts; executable URLs are not
accepted as user inputs. No inline handlers, eval or external CDNs are used.

PDF is browser print with A4 CSS, selectable text, repeated table headings,
expanded engineering disclosure, source inputs, method/engine version and digest.
Content flows naturally rather than being stretched into 11 rasterized pages.
Browser print headers may include URLs: customers should disable browser-added
headers/footers before printing a private-link page. A downloaded PDF cannot be
revoked. No server PDF signing, PDF/A archival conformance or universal printer
pagination guarantee is claimed.
