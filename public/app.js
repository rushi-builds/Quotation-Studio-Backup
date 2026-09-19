"use strict";
const $ = (s) => document.querySelector(s),
  D = Domain;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let user = null,
  dirty = false,
  customers = [],
  current = null;
const retryKeys = new Map();
const token = location.pathname.startsWith("/proposal")
  ? location.hash.slice(1)
  : "";
const notify = (s) => {
  $("#notice").textContent = s;
  setTimeout(() => {
    $("#notice").textContent = "";
  }, 6000);
};
async function api(path, method = "GET", data) {
  const headers = { "Content-Type": "application/json" };
  if (user?.csrf) headers["X-CSRF-Token"] = user.csrf;
  if (token) headers["X-Share-Token"] = token;
  const requestKey = method + path + JSON.stringify(data);
  if (
    (method === "POST" &&
      ["/customers", "/proposals", "/import"].includes(path)) ||
    (method === "PUT" && /^\/(customers|proposals)\/[\w-]+$/.test(path))
  ) {
    if (!retryKeys.has(requestKey))
      retryKeys.set(requestKey, crypto.randomUUID());
    headers["Idempotency-Key"] = retryKeys.get(requestKey);
  }
  let r;
  try {
    r = await fetch("/api" + path, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw Error(
      "Connection unavailable. Your changes have not been confirmed saved. Keep this page open and retry.",
    );
  }
  const result = await r.json();
  if (!r.ok) throw Object.assign(Error(result.error), { status: r.status });
  retryKeys.delete(requestKey);
  return result;
}
const brand = `<a class="brand" href="/"><img src="/assets/images/logo.png" alt="KTM"><span>KTM Energy Experts<small>Quotation Studio</small></span></a>`;
function layout(body, active = "") {
  $("#app").innerHTML =
    `<header class="app-header">${brand}<nav aria-label="Workspace"><a class="${active === "dashboard" ? "active" : ""}" href="/">Overview</a><a class="${active === "customers" ? "active" : ""}" href="/customers">Customers</a><a class="${active === "builder" ? "active" : ""}" href="/builder">New proposal</a></nav><span class="identity">${esc(user.email)}</span><div class="actions"><button id="logout">Sign out</button></div></header><main class="workspace" id="main">${body}</main>`;
  $("#logout").onclick = async () => {
    if (dirty && !confirm("Discard unsaved changes and sign out?")) return;
    try {
      await api("/logout", "POST", {});
      dirty = false;
      location.href = "/";
    } catch (e) {
      notify(e.message);
    }
  };
}
function error(el, e) {
  el.textContent = e.message;
  el.scrollIntoView({ block: "nearest" });
}
async function guarded(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    notify(e.message);
  } finally {
    button.disabled = false;
  }
}
const input = (key, label, value, type = "text", full = false) =>
  `<div class="field ${full ? "full" : ""}"><label for="${key}">${esc(label)}</label><input id="${key}" name="${key}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(value)}"></div>`;
const area = (key, label, value) =>
  `<div class="field full"><label for="${key}">${esc(label)}</label><textarea id="${key}" name="${key}">${esc(value)}</textarea></div>`;
function login() {
  $("#app").innerHTML =
    `<main id="main" class="card login">${brand}<div class="eyebrow">Your solar workspace</div><h1>Welcome back.</h1><p class="muted">Thoughtful proposals. Confident decisions.</p><form id="login"><div class="field"><label for="email">Work email</label><input id="email" type="email" autocomplete="username" required></div><div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required></div><p class="error" id="loginError" role="alert"></p><button class="primary">Sign in securely →</button></form><p class="muted no-margin"><small>Staff access only. Contact your workspace administrator for account access.</small></p></main>`;
  $("#login").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#login button");
    await guarded(btn, async () => {
      try {
        user = await api("/login", "POST", {
          email: $("#email").value,
          password: $("#password").value,
        });
        await route();
      } catch (e) {
        error($("#loginError"), e);
      }
    });
  };
}
async function dashboard() {
  const proposals = await api("/proposals");
  customers = await api("/customers");
  layout(
    `<section class="hero"><div class="eyebrow">KTM / ENERGY EXPERTS</div><h1>A brighter future.<br>A better proposal.</h1><p class="muted">Your customer relationships and solar proposals, in one considered workspace.</p><a class="button" href="/builder">Create a proposal ↗</a></section><div class="stats"><div class="stat"><span>ALL PROPOSALS</span><strong>${proposals.length}</strong><span>Durably stored revisions</span></div><div class="stat"><span>CUSTOMERS</span><strong>${customers.length}</strong><span>Across your workspace</span></div><div class="stat"><span>COMMERCIAL INTENT</span><strong>${proposals.filter((p) => p.acceptance).length}</strong><span>Recorded against an exact revision</span></div><div class="stat"><span>LINK VISITS</span><strong>${proposals.reduce((n, p) => n + p.views, 0)}</strong><span>Anonymous sessions, not verified people</span></div></div><section class="card"><div class="panel-heading"><div><div class="eyebrow">YOUR PIPELINE</div><h2>Proposals</h2></div><input class="search" id="search" aria-label="Search proposals" placeholder="Search customer or proposal…"></div><div id="proposalList"></div></section>${user.role === "admin" ? `<section class="card proposal-section"><div class="panel-heading"><div><h2>Portable data</h2><small>Exports current customer/proposal inputs only. Not an audit backup. Imports create new drafts, never overwrite existing records.</small></div><div class="actions"><button id="export">Export JSON</button><label class="button" for="import">Import drafts</label><input id="import" class="hidden" type="file" accept="application/json"></div></div><p id="importError" role="alert" class="error"></p></section>` : ""}`,
    "dashboard",
  );
  const render = (q) => {
    const rows = proposals.filter((p) =>
      (p.title + " " + p.customer.name).toLowerCase().includes(q.toLowerCase()),
    );
    $("#proposalList").innerHTML = rows.length
      ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Proposal directory"><table><thead><tr><th>Proposal / customer</th><th>Revision</th><th>Investment</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${rows
          .map((p) => {
            const f = p.estimates.financial;
            return `<tr><td><strong>${esc(p.title)}</strong><small>${esc(p.customer.name)}</small></td><td>v${p.revision}</td><td>${f.available ? esc(D.inr(f.netInvestment)) : "Inputs required"}</td><td><span class="badge">${p.acceptance ? "Intent recorded" : esc(p.status)}</span></td><td>${esc(new Date(p.updated).toLocaleDateString("en-IN"))}</td><td><div class="actions"><a href="/builder?id=${encodeURIComponent(p.id)}">Open</a><a href="/proposal?id=${encodeURIComponent(p.id)}">Preview</a></div></td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : `<div class="empty"><h2>${q ? "No matches" : "Your next project starts here."}</h2><p>${q ? "Try another search." : "Create a customer, then build a proposal with explicit project inputs."}</p><a class="button primary" href="/customers">Manage customers →</a></div>`;
  };
  render("");
  $("#search").oninput = (e) => render(e.target.value);
  if ($("#export"))
    $("#export").onclick = (e) =>
      guarded(e.target, async () =>
        download(
          "KTM-portable-" + new Date().toISOString().slice(0, 10) + ".json",
          JSON.stringify(await api("/export"), null, 2),
        ),
      );
  if ($("#import"))
    $("#import").onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024)
          throw Error("Maximum file size is 2 MB");
        if (
          !confirm(
            "Import as NEW drafts? Existing records will not be modified. Acceptance, revisions and share links are not imported.",
          )
        )
          return;
        const data = JSON.parse(await file.text());
        const result = await api("/import", "POST", data);
        await dashboard();
        notify(
          `Imported ${result.customers} customers and ${result.proposals} draft proposals.`,
        );
      } catch (err) {
        error($("#importError"), err);
      } finally {
        e.target.value = "";
      }
    };
}
function download(name, text) {
  const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function customerPage(editId = null) {
  customers = await api("/customers");
  const c = customers.find((c) => c.id === editId) || {};
  layout(
    `<div class="page-heading"><div><div class="eyebrow">RELATIONSHIPS FIRST</div><h1>Your customers</h1><p>Project details that stay connected to every proposal.</p></div><span class="badge">${customers.length} customers</span></div><div class="split"><section class="card"><h2>${c.id ? "Edit customer" : "Add a customer"}</h2><form id="customerForm"><div class="grid">${input("name", "Full name *", c.name)}${input("company", "Company", c.company)}${input("email", "Email", c.email, "email")}${input("phone", "Phone", c.phone, "tel")}<div class="field full"><label for="type">Customer category *</label><select id="type"><option value="">Choose category</option>${["residential", "commercial", "industrial"].map((t) => `<option value="${t}" ${c.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>${area("address", "Site / billing address", c.address)}</div><p class="error" id="customerError" role="alert"></p><div class="savebar"><button class="primary">${c.id ? "Save changes" : "Create customer"}</button>${c.id ? '<a href="/customers">Cancel edit</a>' : ""}</div></form></section><section class="card"><div class="eyebrow">DATA INTEGRITY</div><h2>A reliable starting point.</h2><p class="muted">Customers are stored on the server, not in this browser. Every proposal captures a customer snapshot so future contact edits cannot silently change a released offer.</p><div class="info">Fields remain empty until you provide them. No demonstration records are inserted into your workspace.</div><p class="muted">Changes to a customer appear in a proposal only when staff explicitly save a new proposal revision.</p></section></div><div class="panel-heading proposal-section"><h2>Customer directory</h2><input class="search" id="customerSearch" aria-label="Search customers" placeholder="Search customers…"></div><div id="directory" class="customer-list"></div>`,
    "customers",
  );
  const render = (q) => {
    $("#directory").innerHTML =
      customers
        .filter((c) =>
          (c.name + " " + c.company + " " + c.email)
            .toLowerCase()
            .includes(q.toLowerCase()),
        )
        .map(
          (c) =>
            `<article class="card"><div class="panel-heading"><div class="avatar">${esc(c.name[0])}</div><span class="badge">${esc(c.type)}</span></div><h3>${esc(c.name)}</h3><p class="muted">${esc(c.company || "Individual customer")}</p><small>${esc(c.email || "Email not provided")}<br>${esc(c.phone || "Phone not provided")}</small><div class="actions"><button data-edit="${esc(c.id)}">Edit</button><a class="button primary" href="/builder?customerId=${encodeURIComponent(c.id)}">New proposal</a></div></article>`,
        )
        .join("") || '<p class="muted">No customers found.</p>';
    document.querySelectorAll("[data-edit]").forEach(
      (b) =>
        (b.onclick = () => {
          if (!dirty || confirm("Discard unsaved customer changes?")) {
            dirty = false;
            customerPage(b.dataset.edit).catch((e) => notify(e.message));
          }
        }),
    );
  };
  render("");
  $("#customerSearch").oninput = (e) => render(e.target.value);
  $("#customerForm").oninput = () => (dirty = true);
  $("#customerForm").onsubmit = (e) => {
    e.preventDefault();
    guarded($("#customerForm button"), async () => {
      try {
        const data = Object.fromEntries(
          ["name", "company", "email", "phone", "type", "address"].map((k) => [
            k,
            $("#" + k).value,
          ]),
        );
        if (c.id)
          await api("/customers/" + c.id, "PUT", {
            revision: c.revision,
            data,
          });
        else await api("/customers", "POST", data);
        dirty = false;
        await customerPage();
        notify("Customer saved.");
      } catch (err) {
        error($("#customerError"), err);
      }
    });
  };
}
const engineeringFields = {
  moduleCount: "Number of modules",
  wp: "Module STC power (Wp)",
  voc: "Module Voc (V)",
  vmp: "Module Vmp (V)",
  isc: "Module Isc (A)",
  imp: "Module Imp (A)",
  tempCoeffVoc: "Voc coefficient (%/°C)",
  tempCoeffVmp: "Vmp coefficient (%/°C)",
  tempCoeffIsc: "Isc coefficient (%/°C)",
  minCellTemp: "Minimum cell temperature (°C)",
  maxCellTemp: "Maximum cell temperature (°C)",
  mpptMin: "MPPT minimum (V)",
  mpptMax: "MPPT maximum (V)",
  maxDCVoltage: "Maximum DC input (V)",
  mpptCount: "Independent MPPT count",
  inputsPerMppt: "String inputs per MPPT",
  maxCurrentPerMppt: "Operating current / MPPT (A)",
  maxIscPerMppt: "Short-circuit current / MPPT (A)",
  acKw: "Inverter AC capacity (kW)",
  maxDcKw: "Maximum DC capacity (kWp)",
  currentSafetyFactor: "Explicit current safety factor",
};
const financeGroup = (keys, f) =>
  keys.map((k) => input("f_" + k, D.fields[k][0], f[k], "number")).join("");
function readProposal() {
  const p = {
    title: $("#title").value,
    customerId: $("#customerId").value,
    finance: {},
    engineering: {},
  };
  for (const k of [
    "scope",
    "exclusions",
    "terms",
    "companyPhone",
    "companyEmail",
    "validUntil",
  ])
    p[k] = $("#" + k).value;
  for (const k of Object.keys(D.fields)) {
    const v = $("#f_" + k).value;
    p.finance[k] = v === "" ? null : Number(v);
  }
  p.finance.customerType =
    customers.find((c) => c.id === p.customerId)?.type || "";
  for (const k of ["assumptions", "subsidySource", "subsidyEligibility"])
    p.finance[k] = $("#f_" + k).value;
  for (const k of Object.keys(engineeringFields)) {
    const v = $("#e_" + k).value;
    p.engineering[k] = v === "" ? null : Number(v);
  }
  for (const k of ["moduleModel", "inverterModel", "sourceNotes"])
    p.engineering[k] = $("#e_" + k).value;
  return p;
}
function financialSummary(f) {
  if (!f.available)
    return `<div class="warning"><strong>Calculation unavailable</strong><p>Complete the required inputs. Missing values are never treated as zero.</p><details><summary>${f.errors.length} required input(s) / issue(s)</summary><ul>${f.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></details></div>`;
  return `<div class="metric"><span>Project price, before tax</span><strong>${esc(D.inr(f.projectCost))}</strong></div><div class="metric"><span>GST</span><strong>${esc(D.inr(f.gstAmount))}</strong></div><div class="metric"><span>Gross project cost</span><strong>${esc(D.inr(f.totalCost))}</strong></div><div class="metric total"><span>Net investment</span><strong>${esc(D.inr(f.netInvestment))}</strong></div><div class="metric"><span>First-year generation estimate</span><strong>${esc(D.kwh(f.annualGen))}</strong></div><div class="metric"><span>First-year net savings estimate</span><strong>${esc(D.inr(f.annualSaving))}</strong></div><div class="metric"><span>Undiscounted cash-flow payback</span><strong>${f.payback === null ? "Not reached" : f.payback.toFixed(2) + " years"}</strong></div><div class="metric"><span>Unlevered project IRR estimate</span><strong>${f.irr === null ? "Not applicable" : f.irr.toFixed(2) + "%"}</strong></div>`;
}
async function builder() {
  customers = await api("/customers");
  const params = new URLSearchParams(location.search),
    pid = params.get("id");
  current = pid ? await api("/proposals/" + encodeURIComponent(pid)) : null;
  const p = current || {},
    f = p.finance || {},
    e = p.engineering || {};
  layout(
    `<div class="page-heading"><div><div class="eyebrow">DESIGNED WITH INTENTION</div><h1>${p.id ? "Refine your proposal." : "Build something brighter."}</h1><p>${p.id ? "Revision " + p.revision + " · every save preserves the previous offer" : "Start with facts. State assumptions. Keep the promise clear."}</p></div><div class="actions">${p.id ? `<a class="button" href="/proposal?id=${encodeURIComponent(p.id)}">Preview / PDF ↗</a><button id="historyBtn">History</button>` : ""}<span class="badge" id="saveState">${p.id ? "Saved on server" : "New draft"}</span></div></div>${p.acceptance ? '<div class="warning">Commercial intent has been recorded. This proposal is locked. Create a new proposal for any new offer.</div>' : ""}<div class="builder-layout"><form id="proposalForm"><section class="form-section"><h2><span class="section-number">01</span>Project & customer</h2><div class="grid">${input("title", "Proposal title *", p.title, "text", true)}<div class="field full"><label for="customerId">Customer *</label><select id="customerId"><option value="">Choose a customer</option>${customers.map((c) => `<option value="${esc(c.id)}" ${(p.customerId || params.get("customerId")) === c.id ? "selected" : ""}>${esc(c.name)} · ${esc(c.type)}</option>`).join("")}</select><small>No customer yet? <a href="/customers">Create one first</a>.</small></div>${input("validUntil", "Offer valid through (end of day UTC)", p.validUntil, "date")}${input("companyPhone", "KTM contact phone", p.companyPhone, "tel")}${input("companyEmail", "KTM contact email", p.companyEmail, "email")}</div></section><section class="form-section"><h2><span class="section-number">02</span>Price & energy assumptions</h2><p class="muted">All numeric values are explicitly entered. Use 0 only when zero is genuinely intended. Projections are estimates, not guarantees.</p><div class="grid">${financeGroup(["capacity", "costPerKwp", "gstPercent", "genFactor", "tariff", "exportTariff", "selfConsumption", "escalation", "degradation", "annualOm", "years"], f)}${area("f_assumptions", "Sources & assumptions * — tariff bill/date, yield report, tax review, escalation, costs, exclusions", f.assumptions)}</div><div class="info">Method: annual generation × blended self-consumption/export value, less constant annual O&M. No financing, tax benefits, replacement costs or discount rate are implied. Document omissions here.</div></section><section class="form-section"><h2><span class="section-number">03</span>Subsidy & payment schedule</h2><div class="grid">${financeGroup(["subsidy"], f)}<div class="field"><label for="f_subsidyEligibility">Eligibility evidence</label><select id="f_subsidyEligibility"><option value="">Not assessed</option><option value="confirmed" ${f.subsidyEligibility === "confirmed" ? "selected" : ""}>Confirmed by staff with source</option><option value="not-applicable" ${f.subsidyEligibility === "not-applicable" ? "selected" : ""}>Not applicable</option></select></div>${area("f_subsidySource", "Subsidy source / eligibility reference (required if amount > 0)", f.subsidySource)}${financeGroup(["payAdvance", "payDispatch", "payCompletion"], f)}</div><small>No automatic subsidy. Positive subsidy is restricted to residential customers with explicit eligibility evidence. Actual sanction and tax treatment need external verification.</small></section><section class="form-section"><h2><span class="section-number">04</span>Equipment & electrical review</h2><div class="warning">Legacy catalogue claims are not verified evidence. Enter exact model references and source documents. Missing electrical data yields “review required”, never a fabricated string layout.</div><div class="grid">${input("e_moduleModel", "Module model", e.moduleModel)}${input("e_inverterModel", "Inverter model", e.inverterModel)}${area("e_sourceNotes", "Datasheet references, site conditions, provenance & engineering review notes", e.sourceNotes)}</div><details><summary>Electrical design inputs · ${Object.keys(engineeringFields).length} explicit parameters</summary><div class="grid">${Object.entries(
      engineeringFields,
    )
      .map(([k, l]) => input("e_" + k, l, e[k], "number"))
      .join(
        "",
      )}</div></details><small>Supported: identical modules, equal string lengths, conventional inverter with identical independent MPPT limits. Optimizers, hybrid/battery and unequal MPPT topologies require a separate engineered design.</small></section><section class="form-section"><h2><span class="section-number">05</span>Scope & commercial agreement</h2><div class="grid">${area("scope", "Included equipment, work & deliverables", p.scope)}${area("exclusions", "Exclusions — explicitly enter “None” only if reviewed", p.exclusions)}${area("terms", "Terms, warranty references, responsibilities & next steps", p.terms)}</div></section><p class="error" id="saveError" role="alert"></p><div class="savebar"><button class="primary" id="saveBtn" ${p.acceptance ? "disabled" : ""}>Save ${p.id ? "new revision" : "draft"} →</button><small>Nothing is saved until you confirm.</small></div></form><aside class="summary"><section class="card"><div class="eyebrow">LIVE PROJECT SUMMARY</div><h2>Transparent by design.</h2><div id="financeSummary"></div><div id="designSummary"></div></section><section class="card proposal-section"><h3>Customer release</h3><p class="muted">Secure links show this saved revision only. Editing revokes old links. The link is a bearer credential: share it only with the intended recipient.</p><div class="actions"><button class="primary" id="shareBtn" ${!p.id || p.acceptance ? "disabled" : ""}>Create secure link</button><button id="revokeBtn" ${!p.id ? "disabled" : ""}>Revoke links</button></div><div id="shareResult"></div><p class="error" id="shareError" role="alert"></p><small>Commercial-intent records are not identity-verified e-signatures. No installation approval is implied.</small></section><section id="history" class="card hidden"></section></aside></div>`,
    "builder",
  );
  const update = () => {
    const data = readProposal(),
      f = D.compute(data.finance),
      d = D.design(data.engineering);
    $("#financeSummary").innerHTML = financialSummary(f);
    $("#designSummary").innerHTML = d.available
      ? `<div class="info"><strong>Preliminary electrical check</strong><p>${esc(d.config)}<br>MPPT allocation: ${esc(d.allocation.join(" / "))} strings<br>Installed DC: ${d.installedKwp.toFixed(3)} kWp · DC/AC: ${d.dcacRatio.toFixed(2)}</p><small>${esc(d.note)}</small></div>`
      : `<div class="warning"><strong>Electrical design review required</strong><details><summary>${d.errors.length} missing inputs / constraint issues</summary><ul>${d.errors.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details></div>`;
    if (d.available && data.finance.capacity !== d.installedKwp)
      $("#designSummary").insertAdjacentHTML(
        "beforeend",
        '<div class="warning">Quoted DC capacity differs from the module-derived installed capacity. Resolve or explain before release.</div>',
      );
  };
  update();
  $("#proposalForm").oninput = () => {
    dirty = true;
    $("#saveState").textContent = "Unsaved changes";
    update();
  };
  $("#proposalForm").onsubmit = (evt) => {
    evt.preventDefault();
    guarded($("#saveBtn"), async () => {
      try {
        const data = readProposal();
        const result = current
          ? await api("/proposals/" + current.id, "PUT", {
              revision: current.revision,
              data,
            })
          : await api("/proposals", "POST", data);
        dirty = false;
        history.replaceState(
          {},
          "",
          "/builder?id=" + encodeURIComponent(result.id),
        );
        await builder();
        notify("Saved as revision " + result.revision + ".");
      } catch (err) {
        error($("#saveError"), err);
      }
    });
  };
  $("#shareBtn").onclick = (evt) =>
    guarded(evt.target, async () => {
      try {
        if (dirty) throw Error("Save your changes before sharing.");
        const r = await api("/proposals/" + current.id + "/share", "POST", {
          revision: current.revision,
        });
        $("#shareResult").innerHTML =
          `<div class="share-box"><label for="shareUrl">Private customer link · expires ${esc(new Date(r.expires).toLocaleDateString())}</label><input id="shareUrl" readonly value="${esc(location.origin + r.path)}"><div class="actions"><button id="copyLink">Copy link</button><a class="button" href="${esc(r.path)}" target="_blank" rel="noopener noreferrer">Open ↗</a></div></div>`;
        $("#copyLink").onclick = () =>
          guarded($("#copyLink"), async () => {
            await navigator.clipboard.writeText($("#shareUrl").value);
            notify("Private link copied.");
          });
        $("#shareError").textContent = "";
      } catch (err) {
        error($("#shareError"), err);
      }
    });
  $("#revokeBtn").onclick = (evt) =>
    guarded(evt.target, async () => {
      if (!confirm("Revoke every customer link for this proposal?")) return;
      await api("/proposals/" + current.id + "/revoke", "POST", {});
      $("#shareResult").textContent = "All links revoked.";
      notify("Links revoked.");
    });
  if ($("#historyBtn"))
    $("#historyBtn").onclick = (evt) =>
      guarded(evt.target, async () => {
        const h = await api("/proposals/" + current.id + "/history");
        $("#history").classList.remove("hidden");
        $("#history").innerHTML =
          `<h3>Revision & audit history</h3><div class="audit">${h.events.map((e) => `<p><strong>${esc(e.event)}</strong><br>${esc(e.created)}<br><small>${esc(e.detail)}</small></p>`).join("")}</div>`;
      });
}
function fieldMetric(label, value) {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value ?? "Unavailable")}</strong></div>`;
}
async function proposalView() {
  let result,
    staffPreview = !token;
  const pid = new URLSearchParams(location.search).get("id");
  if (token) result = await api("/public/proposal");
  else {
    if (!pid)
      throw Error(
        "A specific proposal ID or secure customer link is required.",
      );
    const p = await api("/proposals/" + encodeURIComponent(pid));
    result = {
      proposal: p,
      financial: p.estimates.financial,
      design: p.estimates.design,
      acceptance: p.acceptance,
    };
  }
  staffPreview = staffPreview || Boolean(result.staffPreview);
  const { proposal: p, financial: f, design: d } = result;
  $("#app").innerHTML =
    `<main id="main" class="proposal-wrap"><div class="proposal-tools">${token ? `<div class="brand"><img src="/assets/images/logo.png" alt="KTM"><span>KTM Energy Experts<small>Your solar proposal</small></span></div>` : brand}<div class="actions">${staffPreview ? `<a class="button" href="/builder?id=${encodeURIComponent(p.id)}">Back to workspace</a>` : ""}<button id="printBtn">Print / Save PDF ↓</button></div></div>${staffPreview ? '<div class="draft-watermark no-print">STAFF PREVIEW · does not count as a customer visit. Incomplete proposals must not be issued as final offers.</div>' : ""}${!f.available ? '<div class="warning">DRAFT / INCOMPLETE — NOT FOR CUSTOMER RELEASE</div>' : ""}<header class="proposal-hero"><span class="badge">PREPARED EXCLUSIVELY FOR ${esc(p.customer.name.toUpperCase())}</span><div class="eyebrow">ROOFTOP SOLAR / PROJECT PROPOSAL</div><h1>${esc(p.title)}</h1><p>Clear scope. Transparent estimates.<br>A considered next step toward solar energy.</p><div class="ref">REVISION ${p.revision} · VALID THROUGH ${esc(p.validUntil || "NOT SPECIFIED")} (UTC)</div></header><div class="proposal-grid"><section class="card"><div class="eyebrow">01 / YOUR PROJECT</div><h2>A solution for your site.</h2>${fieldMetric("Customer", p.customer.name)}${fieldMetric("Category", p.customer.type)}${fieldMetric("Location", p.customer.address || "Required input")}${fieldMetric("Quoted DC capacity", D.finite(p.finance.capacity) ? p.finance.capacity + " kWp" : "Required input")}${fieldMetric("Module model", p.engineering.moduleModel || "Not specified")}${fieldMetric("Inverter model", p.engineering.inverterModel || "Not specified")}<div class="proposal-photo" role="img" aria-label="Solar installation illustration; not a photograph of your proposed site"></div><small>Illustrative solar installation. No site-specific survey or certification is implied.</small></section><section class="card"><div class="eyebrow">02 / INVESTMENT OVERVIEW</div><h2>Know what goes in.<br>Understand what comes out.</h2>${financialSummary(f)}${fieldMetric("Subsidy entered by staff", D.inr(p.finance.subsidy))}<div class="warning">Generation and savings are estimates based on the inputs below, not a performance guarantee. Subsidy is subject to actual eligibility and sanction.</div></section></div><section class="card proposal-section"><div class="eyebrow">03 / A CLEAR AGREEMENT</div><div class="grid"><div><h2>What is included</h2><p class="text-block">${esc(p.scope || "Scope required — not ready for release")}</p></div><div><h2>What is excluded</h2><p class="text-block">${esc(p.exclusions || "Exclusions not provided")}</p></div><div class="field full"><h2>Terms & responsibilities</h2><p class="text-block">${esc(p.terms || "Terms required")}</p></div></div><h3>Payment schedule</h3><div class="grid">${fieldMetric("Advance", p.finance.payAdvance == null ? "Required" : p.finance.payAdvance + "%")}${fieldMetric("Dispatch", p.finance.payDispatch == null ? "Required" : p.finance.payDispatch + "%")}${fieldMetric("Completion", p.finance.payCompletion == null ? "Required" : p.finance.payCompletion + "%")}</div></section><section class="card proposal-section"><div class="eyebrow">04 / ENGINEERING TRANSPARENCY</div><h2>${d.available ? "Preliminary electrical constraint check" : "Engineering review required"}</h2><p class="text-block">${esc(p.engineering.sourceNotes || "Datasheet references and site review have not been provided.")}</p>${d.available ? `${fieldMetric("Equal-string arrangement", d.config)}${fieldMetric("Strings per MPPT", d.allocation.join(" / "))}${fieldMetric("Installed DC / DC:AC", d.installedKwp.toFixed(3) + " kWp / " + d.dcacRatio.toFixed(2))}${fieldMetric("Worst-case open-circuit voltage", d.maxStringVoc.toFixed(2) + " V")}<p class="warning">${esc(d.note)}</p>` : '<div class="warning">An installation-ready electrical design is unavailable. Exact datasheets, site temperatures, inverter limits, protection and qualified engineer sign-off are required before installation. No string configuration has been invented.</div>'}<p class="muted">Equipment inputs are staff-supplied, not independently manufacturer-verified by this application.</p><details><summary>Electrical input record</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Electrical inputs"><table><thead><tr><th>Site / datasheet input</th><th>Staff-supplied value</th></tr></thead><tbody>${Object.entries(
      engineeringFields,
    )
      .map(
        ([k, l]) =>
          `<tr><td>${esc(l)}</td><td>${esc(p.engineering[k] ?? "Required input")}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div></details></section><section class="card proposal-section projection"><div class="eyebrow">05 / THE BASIS OF YOUR ESTIMATE</div><h2>Every assumption, in the open.</h2><p class="text-block">${esc(p.finance.assumptions || "Sources and assumptions required")}</p><p class="text-block">Subsidy evidence: ${esc(p.finance.subsidySource || "No positive subsidy evidence supplied")}</p><div class="table-scroll" tabindex="0" role="region" aria-label="Financial inputs"><table><thead><tr><th>Input / staff supplied</th><th>Value</th></tr></thead><tbody>${Object.entries(
      D.fields,
    )
      .map(
        ([k, [label]]) =>
          `<tr><td>${esc(label)}</td><td>${esc(p.finance[k] ?? "Required input")}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div class="info">Methodology: annual yield degrades at the entered rate; self-consumption and export values escalate at the entered tariff rate. Constant annual O&M is deducted. Payback is the interpolated undiscounted cumulative cash-flow crossover; IRR is unlevered. Tax benefits, financing and replacements are not included. These omissions must be considered before investment.</div></section>${f.available ? `<section class="card proposal-section projection"><div class="eyebrow">06 / LONG-TERM VIEW</div><h2>Projected cash flows</h2><p class="muted">Nominal estimates · ${p.finance.years} years · excludes unentered costs</p><div class="table-scroll" tabindex="0" role="region" aria-label="Projected cash flows"><table><thead><tr><th>Year</th><th>Generation (kWh)</th><th>Net operating saving</th><th>Cumulative after investment</th></tr></thead><tbody>${f.rows.map((r) => `<tr><td>${r.year}</td><td>${Math.round(r.generation).toLocaleString("en-IN")}</td><td>${esc(D.inr(r.net))}</td><td>${esc(D.inr(r.cumulative))}</td></tr>`).join("")}</tbody></table></div></section>` : ""}<section class="card proposal-section"><div class="eyebrow">YOUR NEXT STEP</div><h2>Let’s discuss your solar project.</h2><p>Contact your KTM representative to clarify scope, validate the site and agree the next steps.</p>${fieldMetric("KTM phone", p.companyPhone || "Not provided")}${fieldMetric("KTM email", p.companyEmail || "Not provided")}</section><section class="card acceptance no-print" id="acceptance"></section><footer class="proposal-footer">KTM Energy Experts · Proposal ${esc(p.id)} · Revision ${p.revision}<br>Financial outputs are derived estimates; source inputs are staff-supplied. Electrical calculations are preliminary, not installation approval.<p class="signature">Calculation engine: ${esc(p.estimates.engineVersion)} · Revision SHA-256: ${esc(p.digest)}</p></footer></main>`;
  $("#printBtn").onclick = (evt) =>
    guarded(evt.target, async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((img) => img.decode().catch(() => {})),
      );
      window.print();
    });
  if (staffPreview) {
    $("#acceptance").innerHTML =
      "<h3>Staff preview</h3><p>Customer interaction is available only through a secure release link. Staff cannot record customer intent from this preview.</p>";
    return;
  }
  const accepted = (a) => {
    $("#acceptance").innerHTML =
      `<h2>Thank you. Your intent is recorded.</h2><p>Revision ${a.revision} · ${esc(new Date(a.created).toLocaleString("en-IN"))}</p><p>Your KTM representative can now follow up. This record does not replace identity verification, a signed contract or an approved installation design.</p>`;
  };
  if (result.acceptance) accepted(result.acceptance);
  else {
    $("#acceptance").innerHTML =
      `<h2>Ready to take the next step?</h2><p>Record your commercial intent against this exact revision. A forwarded link can be used by its holder; identity is not independently verified.</p><form id="acceptForm"><div class="grid">${input("acceptName", "Your full name", "")}${input("acceptEmail", "Your email", "", "email")}<div class="field full check"><input type="checkbox" id="consent" required><label for="consent">${esc(result.consent)}</label></div></div><p class="error" id="acceptError" role="alert"></p><button class="primary" id="acceptBtn">Record intent to proceed →</button></form>`;
    $("#acceptForm").onsubmit = (evt) => {
      evt.preventDefault();
      guarded($("#acceptBtn"), async () => {
        try {
          const a = await api("/public/accept", "POST", {
            name: $("#acceptName").value,
            email: $("#acceptEmail").value,
            consent: $("#consent").checked,
            digest: p.digest,
          });
          accepted(a);
        } catch (e) {
          error($("#acceptError"), e);
        }
      });
    };
  }
  api("/public/view", "POST", {}).catch(() => {
    /* Analytics failure must not block reading; no claim of a recorded view. */
  });
}
async function route() {
  const path = location.pathname;
  if (path.startsWith("/proposal")) return proposalView();
  if (path.startsWith("/customers")) return customerPage();
  if (path.startsWith("/builder") || path.startsWith("/quotation"))
    return builder();
  return dashboard();
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
(async () => {
  try {
    if (token) return await proposalView();
    try {
      user = await api("/me");
    } catch (e) {
      if (e.status === 401) return login();
      throw e;
    }
    await route();
  } catch (e) {
    $("#app").innerHTML =
      `<main id="main" class="card login">${brand}<h1>We couldn’t open this page.</h1><p class="error" role="alert">${esc(e.message)}</p><p>No other customer's proposal will be shown in its place.</p>${token ? "<p>Ask your KTM representative for a current private link.</p>" : '<a class="button" href="/">Back to workspace</a>'}</main>`;
  }
})();

// Expand disclosure sections for print without permanently changing the reading view.
let printClosed = [];
window.addEventListener("beforeprint", () => {
  printClosed = [...document.querySelectorAll("details:not([open])")];
  printClosed.forEach((el) => (el.open = true));
});
window.addEventListener("afterprint", () => {
  printClosed.forEach((el) => (el.open = false));
  printClosed = [];
});
