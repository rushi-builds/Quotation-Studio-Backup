/* ==========================================================================
   KTM Solar Platform — Proposal Builder Logic
   --------------------------------------------------------------------------
   Connects the 11-page quotation builder with:
   - Store (localStorage proposals & customers)
   - FinancialEngine (single source of truth for financial math)
   - SolarEngine (live solar engineering sizing)
   - EquipmentDB (modules & inverters)
   - Offline-capable PDF export & advanced brochure editor
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------------- 0. State & Helpers ---------------- */
  let currentProposalId = null;
  let currentCustomerId = null;

  function showToast(msg, type = 'info') {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function escapeHtml(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fillTemplate(tpl, s, f) {
    f = f || {};
    return tpl
      .replace(/{capacity}/g, s.capacity + ' kWp')
      .replace(/{annualGen}/g, FinancialEngine.fmtNum(f.annualGen || 0) + ' kWh')
      .replace(/{co2Annual}/g, (f.co2Annual || 0).toFixed(1))
      .replace(/{treesAnnual}/g, FinancialEngine.fmtNum(f.treesAnnual || 0))
      .replace(/{company}/g, s.companyName);
  }

  /* ---------------- 1. Form reading ---------------- */
  function readMain() {
    return {
      proposalId: $('proposalId')?.value || currentProposalId,
      customerId: $('customerId')?.value || currentCustomerId,
      propStatus: $('propStatus')?.value || 'draft',
      companyName: $('companyName').value,
      companyTagline: $('companyTagline').value,
      companyPhone: $('companyPhone').value,
      companyEmail: $('companyEmail').value,
      companyAddress: $('companyAddress').value,
      companyWebsite: $('companyWebsite').value,
      statYears: $('statYears').value,
      statProjects: $('statProjects').value,
      statCapacity: $('statCapacity').value,
      custName: $('custName').value,
      custAddress: $('custAddress').value,
      custPhone: $('custPhone')?.value || '',
      custEmail: $('custEmail')?.value || '',
      propDate: $('propDate').value,
      propRef: $('propRef').value,
      capacity: parseFloat($('capacity').value) || 0,
      genFactor: parseFloat($('genFactor').value) || 0,
      moduleId: $('moduleSelect')?.value || null,
      inverterId: $('inverterSelect')?.value || null,
      moduleMake: $('moduleMake').value,
      inverterMake: $('inverterMake').value,
      mountMake: $('mountMake').value,
      cableMake: $('cableMake').value,
      costPerKwp: parseFloat($('costPerKwp').value) || 0,
      gstPercent: parseFloat($('gstPercent').value) || 0,
      tariff: parseFloat($('tariff').value) || 0,
      escalation: (parseFloat($('escalation').value) || 0) / 100,
      degradation: (parseFloat($('degradation').value) || 0) / 100,
      subsidyOverride: $('subsidyOverride').value,
      payAdvance: parseFloat($('payAdvance').value) || 0,
      payDispatch: parseFloat($('payDispatch').value) || 0,
      payCompletion: parseFloat($('payCompletion').value) || 0
    };
  }

  /* ---------------- 2. Financial calculation via FinancialEngine ---------------- */
  function computeFinancials(s) {
    const subOverride = (s.subsidyOverride !== '' && !isNaN(parseFloat(s.subsidyOverride)))
      ? parseFloat(s.subsidyOverride)
      : null;

    const res = FinancialEngine.compute({
      capacity: s.capacity,
      genFactor: s.genFactor,
      costPerKwp: s.costPerKwp,
      gstPercent: s.gstPercent,
      subsidyOverride: subOverride,
      tariff: s.tariff,
      escalation: s.escalation,
      degradation: s.degradation
    });

    // Provide legacy properties expected by 11-page templates
    return {
      ...res,
      co2TonnesLifetime: res.co2Lifetime,
      treesEquivalent: res.treesLifetime
    };
  }

  /* ---------------- 3. Card builders for 11 pages ---------------- */
  function statCard(it) {
    return '<div class="card" style="text-align:center;">' +
      '<div class="icon-circle" style="margin:0 auto 6px;">' + it.icon + '</div>' +
      '<div class="card-value">' + escapeHtml(it.value) + '</div>' +
      '<div class="card-title" style="margin:2px 0 3px;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(it.desc) + '</div></div>';
  }
  function featItem(it) {
    return '<div class="card" style="display:flex;gap:8px;align-items:flex-start;">' +
      '<div class="icon-circle">&#10003;</div>' +
      '<div><div class="card-title" style="margin:0;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(it.desc) + '</div></div></div>';
  }
  function benefitCard(it, s, f) {
    const desc = it.desc.indexOf('{') >= 0 ? fillTemplate(it.desc, s, f) : it.desc;
    return '<div class="card"><div class="card-title" style="margin-top:0;">' + escapeHtml(it.title) +
      '</div><div class="card-desc">' + escapeHtml(desc) + '</div></div>';
  }
  function specCard(it) {
    return '<div class="card" style="text-align:center;">' +
      '<div class="card-title" style="margin-top:0;font-size:10.5px;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(it.desc) + '</div></div>';
  }
  function delivCard(it) {
    return '<div class="deliv-box"><div class="icon-circle">&#9881;</div>' +
      '<div class="card-title">' + escapeHtml(it.title) + '</div></div>';
  }
  function respItem(it) {
    return '<div class="resp-item"><div class="icon-circle">&#127968;</div>' +
      '<div><div class="rt">' + escapeHtml(it.title) + '</div>' +
      '<div class="rd">' + escapeHtml(it.desc) + '</div></div></div>';
  }
  function addlItem(it) {
    return '<div class="addl-box"><div class="card-title" style="margin:0 0 2px;font-size:10px;">' +
      escapeHtml(it.title) + '</div><div class="card-desc">' + escapeHtml(it.desc) + '</div></div>';
  }
  function diffCard(it) {
    return '<div class="card"><div class="card-title" style="margin-top:0;">' + escapeHtml(it.title) +
      '</div><div class="card-desc">' + escapeHtml(it.desc) + '</div></div>';
  }
  function checkItem(it) {
    return '<div class="card check-card"><div class="icon-circle">&#10003;</div>' +
      '<div><div class="card-title" style="margin-top:0;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(it.desc) + '</div></div></div>';
  }
  function commitCard(it) {
    return '<div class="card" style="text-align:center;padding:8px 6px;">' +
      '<div class="card-title" style="margin-top:0;font-size:9.5px;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc" style="font-size:8.4px;">' + escapeHtml(it.desc) + '</div></div>';
  }

  /* ---------------- 4. Page renderers (11 A4 pages) ---------------- */
  function renderCover(s) {
    $('v_p1_companyName').textContent = s.companyName;
    $('v_p1_custName').textContent = s.custName;
    $('v_p1_capacity').textContent = s.capacity + ' kWp Solar PV System';
    $('v_p1_propRef').textContent = s.propRef;
    $('v_p1_propDate').textContent = FinancialEngine.fmtDate(s.propDate);
    $('v_p1_custAddress').textContent = s.custAddress;
    $('v_p1_footerTagline').textContent = s.companyTagline;
    $('v_p1_footerPhone').textContent = s.companyPhone;
    $('v_p1_footerEmail').textContent = s.companyEmail;
  }

  function renderAbout(s) {
    $('v_p2_statYears').textContent = s.statYears;
    $('v_p2_statProjects').textContent = s.statProjects;
    $('v_p2_statCapacity').textContent = s.statCapacity;
    $('v_p2_whyChooseGrid').innerHTML = CONTENT.page2.whyChoose.map(statCard).join('');
    $('v_p2_capabilitiesGrid').innerHTML = CONTENT.page2.capabilities.map(featItem).join('');
    $('v_p2_certificationsGrid').innerHTML = CONTENT.page2.certifications.map(featItem).join('');
  }

  function renderWhySolar(s, f) {
    $('v_p3_annualGen').textContent = FinancialEngine.fmtNum(f.annualGen) + ' kWh';
    $('v_p3_annualSaving').textContent = FinancialEngine.fmtINR(f.annualSaving);
    $('v_p3_lifetimeSaving').textContent = FinancialEngine.fmtINR(f.lifetimeSaving);
    $('v_p3_co2Annual').textContent = f.co2Annual.toFixed(1) + ' Tonnes';
    $('v_p3_treesAnnual').textContent = FinancialEngine.fmtNum(f.treesAnnual) + ' Trees';
    $('v_p3_paybackYears').textContent = f.payback.toFixed(1) + ' Years';
    $('v_p3_roiGrid').innerHTML = CONTENT.page3.roiBenefits.map((it) => benefitCard(it, s, f)).join('');
    $('v_p3_envGrid').innerHTML = CONTENT.page3.envBenefits.map((it) => benefitCard(it, s, f)).join('');
  }

  function renderSpecs(s) {
    $('v_p4_capacity').textContent = s.capacity + ' kWp';
    $('v_p4_moduleMake').textContent = s.moduleMake;
    $('v_p4_inverterMake').textContent = s.inverterMake;
    $('v_p4_mountMake').textContent = s.mountMake;
    $('v_p4_cableMake').textContent = s.cableMake;
    $('v_p4_electricalGrid').innerHTML = CONTENT.page4.electrical.map(specCard).join('');
    $('v_p4_protectionGrid').innerHTML = CONTENT.page4.protection.map(specCard).join('');
  }

  function renderInvestment(s, f) {
    $('v_p5_capacity').textContent = s.capacity + ' kWp';
    $('v_p5_costPerKwp').textContent = FinancialEngine.fmtINR(s.costPerKwp);
    $('v_p5_projectCost').textContent = FinancialEngine.fmtINR(f.projectCost);
    $('v_p5_gstAmount').textContent = FinancialEngine.fmtINR(f.gstAmount);
    $('v_p5_gstPercent').textContent = s.gstPercent + '%';
    $('v_p5_totalCost').textContent = FinancialEngine.fmtINR(f.totalCost);
    $('v_p5_subsidy').textContent = FinancialEngine.fmtINR(f.subsidy);
    $('v_p5_netInvestment').textContent = FinancialEngine.fmtINR(f.netInvestment);
    $('v_p5_annualSaving').textContent = FinancialEngine.fmtINR(f.annualSaving);
    $('v_p5_paybackYears').textContent = f.payback.toFixed(1) + ' Years';
    $('v_p5_lifetimeSaving').textContent = FinancialEngine.fmtINR(f.lifetimeSaving);
    $('v_p5_irr').textContent = f.irr > 0 ? f.irr.toFixed(1) + '%' : '—';
    $('v_p5_co2Lifetime').textContent = f.co2TonnesLifetime.toFixed(1) + ' Tonnes';
    $('v_p5_treesLifetime').textContent = FinancialEngine.fmtNum(f.treesEquivalent) + ' Trees';
  }

  function renderScope(s) {
    $('v_p6_scopeKtmGrid').innerHTML = CONTENT.page5.scopeKtm.map(delivCard).join('');
    $('v_p6_scopeClientGrid').innerHTML = CONTENT.page5.scopeClient.map(respItem).join('');
    $('v_p6_additionalGrid').innerHTML = CONTENT.page5.additional.map(addlItem).join('');
  }

  function renderExecution(s) {
    $('v_p7_stages').innerHTML = CONTENT.page6.stages.map((st) =>
      '<div class="step-card"><div class="icon-circle" style="background:#f97316;color:#ffffff;">' +
      st.step + '</div><div><div class="card-title" style="margin:0 0 2px;">' +
      escapeHtml(st.title) + '</div><div class="card-desc">' + escapeHtml(st.desc) +
      '</div></div></div>'
    ).join('');
    $('v_p7_payAdvancePct').textContent = s.payAdvance + '%';
    $('v_p7_payDispatchPct').textContent = s.payDispatch + '%';
    $('v_p7_payCompletionPct').textContent = s.payCompletion + '%';
    $('v_p7_payAdvanceVal').textContent = FinancialEngine.fmtINR(s.payAdvance * (s.capacity * s.costPerKwp * (1 + s.gstPercent / 100)) / 100);
    $('v_p7_payDispatchVal').textContent = FinancialEngine.fmtINR(s.payDispatch * (s.capacity * s.costPerKwp * (1 + s.gstPercent / 100)) / 100);
    $('v_p7_payCompletionVal').textContent = FinancialEngine.fmtINR(s.payCompletion * (s.capacity * s.costPerKwp * (1 + s.gstPercent / 100)) / 100);
  }

  function renderWarranty(s) {
    $('v_p8_moduleMake').textContent = s.moduleMake;
    $('v_p8_inverterMake').textContent = s.inverterMake;
    $('v_p8_mountMake').textContent = s.mountMake;
    $('v_p8_standardsGrid').innerHTML = CONTENT.page7.standards.map((it) =>
      '<div class="std-chip"><strong>' + escapeHtml(it.code) + '</strong>: ' +
      escapeHtml(it.title) + '</div>'
    ).join('');
  }

  function renderProjects() {
    $('v_p9_projectGrid').innerHTML = PROJECT_IMAGES.map((p) =>
      '<div class="proj-card"><img src="' + p.file + '" alt="' + escapeHtml(p.caption) +
      '" loading="lazy"><div class="caption">' + escapeHtml(p.caption) + '</div></div>'
    ).join('');
  }

  function renderWhyKtm(s) {
    $('v_p10_diffGrid').innerHTML = CONTENT.page9.differentiators.map(diffCard).join('');
    $('v_p10_qaGrid').innerHTML = CONTENT.page9.qaChecks.map(checkItem).join('');
    $('v_p10_commitGrid').innerHTML = CONTENT.page9.commitments.map(commitCard).join('');
  }

  function renderContact(s) {
    $('v_p11_companyName').textContent = s.companyName;
    $('v_p11_companyTagline').textContent = s.companyTagline;
    $('v_p11_companyAddress').textContent = s.companyAddress;
    $('v_p11_companyPhone').textContent = s.companyPhone;
    $('v_p11_companyEmail').textContent = s.companyEmail;
    $('v_p11_companyWebsite').textContent = s.companyWebsite;
    $('v_p11_ctaPhone').textContent = s.companyPhone;
    $('v_p11_footerTagline').textContent = s.companyTagline;
    $('v_p11_footerContact').textContent = s.companyPhone + '  |  ' + s.companyEmail + '  |  ' + s.companyWebsite;
    $('pv_p11_ready').innerHTML = CONTENT.page10.ready.map((it) =>
      '<div class="contact-item"><div class="icon-circle">&#9733;</div><div><div class="rt">' +
      escapeHtml(it.title) + '</div><div class="rd">' + escapeHtml(it.desc) + '</div></div></div>'
    ).join('');
    $('pv_p11_para').textContent = fillTemplate(CONTENT.page10.para, s, {});
    $('pv_p11_disclaimer').textContent = fillTemplate(CONTENT.page10.disclaimer, s, {});
  }

  function updateFooters(s) {
    ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'].forEach((p) => {
      const el = $('v_' + p + '_footer');
      if (el) el.textContent = s.companyName + '  •  ' + s.companyTagline + '  •  ' + s.companyPhone;
    });
  }

  /* ---------------- 5. Solar Engineering Specs Calculation ---------------- */
  function updateEngineeringSpecs(s) {
    const mod = EquipmentDB.getModule(s.moduleId);
    const inv = EquipmentDB.getInverter(s.inverterId);

    const design = SolarEngine.runDesign({
      capacityKwp: s.capacity,
      module: mod,
      inverter: inv
    });

    if ($('engModuleCount')) {
      $('engModuleCount').textContent = design.moduleCount ? `${design.moduleCount} panels` : '—';
    }
    if ($('engArea')) {
      $('engArea').textContent = design.areaRequired ? `${design.areaRequired} m² (~${Math.round(design.areaRequired * 10.764)} sq.ft)` : '—';
      $('engArea').title = 'Planning/layout assumption: 75% utilization factor for inter-row pitch, walkways & setbacks. Subject to physical roof survey.';
    }
    if ($('engDcAc')) {
      $('engDcAc').textContent = design.dcacRatio ? design.dcacRatio.toFixed(2) : '—';
    }
    if ($('engString')) {
      $('engString').textContent = design.stringConfig || 'Standard';
    }

    return design;
  }

  /* ---------------- 6. Master render ---------------- */
  function renderAll() {
    const s = readMain();
    const f = computeFinancials(s);
    renderCover(s);
    renderAbout(s);
    renderWhySolar(s, f);
    renderSpecs(s);
    renderInvestment(s, f);
    renderScope(s);
    renderExecution(s);
    renderWarranty(s);
    renderProjects();
    renderWhyKtm(s);
    renderContact(s);
    updateFooters(s);
    updateEngineeringSpecs(s);
  }

  /* ---------------- 7. Advanced text editor ---------------- */
  function buildAdvancedEditor() {
    const root = $('advEditor');
    if (!root) return;
    root.innerHTML = '';

    const mkGroup = (parent, title) => {
      const g = document.createElement('div');
      g.className = 'adv-group';
      g.innerHTML = '<div class="adv-group-title">' + escapeHtml(title) + '</div>';
      parent.appendChild(g);
      return g;
    };
    const mkField = (parent, label, value, onChange, multiline) => {
      const f = document.createElement('div');
      f.className = 'adv-field';
      f.innerHTML = '<label>' + escapeHtml(label) + '</label>';
      const input = document.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.value = value || '';
      input.addEventListener('input', () => { onChange(input.value); renderAll(); });
      f.appendChild(input);
      parent.appendChild(f);
    };
    const mkDomField = (parent, label, targetId, multiline) => {
      const target = $(targetId);
      if (!target) return;
      mkField(parent, label, target.textContent, (v) => { target.textContent = v; }, multiline);
    };
    const mkItemBlock = (parent, title) => {
      const b = document.createElement('div');
      b.className = 'adv-item';
      b.innerHTML = '<div class="adv-item-title">' + escapeHtml(title) + '</div>';
      parent.appendChild(b);
      return b;
    };

    // Page 2
    let g = mkGroup(root, 'Page 2 — About Company');
    mkField(g, 'Heading', CONTENT.page2.heading, (v) => { CONTENT.page2.heading = v; });
    mkField(g, 'Subheading', CONTENT.page2.sub, (v) => { CONTENT.page2.sub = v; });
    mkDomField(g, '"Why Choose" section label', 'pv_p2_whyChooseLabel');
    CONTENT.page2.whyChoose.forEach((it, i) => {
      const b = mkItemBlock(g, 'Stat card ' + (i + 1));
      mkField(b, 'Value', it.value, (v) => { it.value = v; });
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });

    // Page 3
    g = mkGroup(root, 'Page 3 — Why Solar / Financial & Environmental Benefits');
    mkField(g, 'Heading', CONTENT.page3.heading, (v) => { CONTENT.page3.heading = v; });
    mkField(g, 'Subheading', CONTENT.page3.sub, (v) => { CONTENT.page3.sub = v; });

    // Page 4
    g = mkGroup(root, 'Page 4 — System Specification');
    mkField(g, 'Heading', CONTENT.page4.heading, (v) => { CONTENT.page4.heading = v; });
    mkField(g, 'Subheading', CONTENT.page4.sub, (v) => { CONTENT.page4.sub = v; });

    // Page 11
    g = mkGroup(root, 'Page 11 — Contact / Closing');
    mkField(g, 'Heading', CONTENT.page10.heading, (v) => { CONTENT.page10.heading = v; });
    mkField(g, 'Subheading', CONTENT.page10.sub, (v) => { CONTENT.page10.sub = v; });
    mkField(g, 'Thank-you paragraph (use {company} for dynamic company name)', CONTENT.page10.para,
      (v) => { CONTENT.page10.para = v; }, true);
    mkDomField(g, '"Get in Touch" section label', 'pv_p11_contactLabel');
    mkField(g, '"Ready to Go Solar" section label', CONTENT.page10.readyLabel,
      (v) => { CONTENT.page10.readyLabel = v; });
    CONTENT.page10.ready.forEach((it, i) => {
      const b = mkItemBlock(g, 'Ready item ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });
    mkField(g, 'Call-to-action text', CONTENT.page10.cta, (v) => { CONTENT.page10.cta = v; });
    mkField(g, 'Disclaimer text', CONTENT.page10.disclaimer, (v) => { CONTENT.page10.disclaimer = v; }, true);
  }

  /* ---------------- 8. Platform Store Integration ---------------- */
  function populateCustomerDropdown() {
    const select = $('customerSelect');
    if (!select) return;
    const customers = Store.getCustomers();
    select.innerHTML = '<option value="">-- Choose existing customer or enter below --</option>' +
      customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ` (${escapeHtml(c.company)})` : ''}</option>`).join('');
  }

  function populateEquipmentDropdowns() {
    const modSel = $('moduleSelect');
    if (modSel) {
      const modules = EquipmentDB.getModules();
      modSel.innerHTML = '<option value="">-- Select from Equipment DB --</option>' +
        modules.map(m => `<option value="${m.id}">${escapeHtml(m.manufacturer)} ${escapeHtml(m.model)} (${m.wp}Wp, ${m.technology})</option>`).join('') +
        '<option value="custom">Custom / Other</option>';
    }

    const invSel = $('inverterSelect');
    if (invSel) {
      const inverters = EquipmentDB.getInverters();
      invSel.innerHTML = '<option value="">-- Select from Equipment DB --</option>' +
        inverters.map(inv => `<option value="${inv.id}">${escapeHtml(inv.manufacturer)} ${escapeHtml(inv.model)} (${inv.ratedPowerKw}kW, ${inv.phases}Ph)</option>`).join('') +
        '<option value="custom">Custom / Other</option>';
    }
  }

  function loadFromStore() {
    const params = new URLSearchParams(window.location.search);
    const propId = params.get('id');
    const custId = params.get('customerId');

    populateCustomerDropdown();
    populateEquipmentDropdowns();

    if (propId) {
      const p = Store.getProposal(propId);
      if (p) {
        currentProposalId = p.id;
        currentCustomerId = p.customerId;
        if ($('proposalId')) $('proposalId').value = p.id;
        if ($('customerId')) $('customerId').value = p.customerId || '';
        if ($('customerSelect') && p.customerId) $('customerSelect').value = p.customerId;
        if ($('propStatus') && p.status) $('propStatus').value = p.status;
        if ($('propRef') && p.ref) $('propRef').value = p.ref;
        if ($('propDate') && p.meta?.propDate) $('propDate').value = p.meta.propDate;

        if (p.customer) {
          if ($('custName')) $('custName').value = p.customer.name || '';
          if ($('custAddress')) $('custAddress').value = p.customer.address || '';
          if ($('custPhone')) $('custPhone').value = p.customer.phone || '';
          if ($('custEmail')) $('custEmail').value = p.customer.email || '';
        }

        if (p.system) {
          if ($('capacity') && p.system.capacity) $('capacity').value = p.system.capacity;
          if ($('genFactor') && p.system.genFactor) $('genFactor').value = p.system.genFactor;
          if ($('moduleSelect') && p.system.moduleId) $('moduleSelect').value = p.system.moduleId;
          if ($('inverterSelect') && p.system.inverterId) $('inverterSelect').value = p.system.inverterId;
          if ($('mountMake') && p.system.mountMake) $('mountMake').value = p.system.mountMake;
          if ($('cableMake') && p.system.cableMake) $('cableMake').value = p.system.cableMake;
        }

        if (p.financial) {
          if ($('costPerKwp') && p.financial.costPerKwp) $('costPerKwp').value = p.financial.costPerKwp;
          if ($('gstPercent') && p.financial.gstPercent) $('gstPercent').value = p.financial.gstPercent;
          if ($('tariff') && p.financial.tariff) $('tariff').value = p.financial.tariff;
          if ($('escalation') && p.financial.escalation !== undefined) $('escalation').value = (p.financial.escalation * 100);
          if ($('degradation') && p.financial.degradation !== undefined) $('degradation').value = (p.financial.degradation * 100);
          if ($('subsidyOverride')) $('subsidyOverride').value = p.financial.subsidy ? p.financial.subsidy : '';
        }

        if (p.commercial) {
          if ($('payAdvance') && p.commercial.payAdvance) $('payAdvance').value = p.commercial.payAdvance;
          if ($('payDispatch') && p.commercial.payDispatch) $('payDispatch').value = p.commercial.payDispatch;
          if ($('payCompletion') && p.commercial.payCompletion) $('payCompletion').value = p.commercial.payCompletion;
        }

        updateHeaderStatus(p);
        return;
      }
    }

    if (custId) {
      const c = Store.getCustomer(custId);
      if (c) {
        currentCustomerId = c.id;
        if ($('customerId')) $('customerId').value = c.id;
        if ($('customerSelect')) $('customerSelect').value = c.id;
        if ($('custName')) $('custName').value = c.name || '';
        if ($('custAddress')) $('custAddress').value = c.address || '';
        if ($('custPhone')) $('custPhone').value = c.phone || '';
        if ($('custEmail')) $('custEmail').value = c.email || '';
      }
    }

    // Default new proposal badge
    updateHeaderStatus({ id: null, status: 'draft', isDemo: false });
  }

  function updateHeaderStatus(p) {
    const badge = $('headerPropBadge');
    if (badge) {
      if (p.isDemo) {
        badge.textContent = `SAMPLE DEMO (${p.ref || p.id})`;
        badge.style.background = 'rgba(245, 158, 11, 0.15)';
        badge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        badge.style.color = '#fbbf24';
      } else if (p.id) {
        badge.textContent = `${p.status.toUpperCase()} (${p.ref || p.id})`;
        badge.style.background = '';
        badge.style.borderColor = '';
        badge.style.color = '';
      } else {
        badge.textContent = 'NEW PROPOSAL (UNSAVED)';
        badge.style.background = 'rgba(255, 255, 255, 0.05)';
        badge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        badge.style.color = '#8fa3c8';
      }
    }
    const viewBtn = $('viewProposalBtn');
    if (viewBtn) {
      if (p.id) {
        viewBtn.href = `proposal.html?id=${encodeURIComponent(p.id)}`;
        viewBtn.classList.remove('hidden');
      } else {
        viewBtn.href = 'proposal.html';
      }
    }
  }

  function saveToStore() {
    const s = readMain();
    const f = computeFinancials(s);
    const mod = EquipmentDB.getModule(s.moduleId);
    const inv = EquipmentDB.getInverter(s.inverterId);
    const design = SolarEngine.runDesign({ capacityKwp: s.capacity, module: mod, inverter: inv });

    // If no existing customer selected but name is provided, auto-create or update customer
    let custId = currentCustomerId || s.customerId;
    if (s.custName && (!custId || custId === '')) {
      const newCust = Store.saveCustomer({
        name: s.custName,
        phone: s.custPhone || '',
        email: s.custEmail || '',
        address: s.custAddress || '',
        type: 'residential'
      });
      custId = newCust.id;
      currentCustomerId = custId;
      if ($('customerId')) $('customerId').value = custId;
      populateCustomerDropdown();
      if ($('customerSelect')) $('customerSelect').value = custId;
    }

    const proposalData = {
      id: currentProposalId || undefined,
      customerId: custId,
      status: s.propStatus || 'draft',
      ref: s.propRef,
      title: `${s.capacity} kWp Rooftop Solar — ${s.custName || 'Proposal'}`,
      customer: {
        name: s.custName,
        address: s.custAddress,
        phone: s.custPhone,
        email: s.custEmail
      },
      system: {
        capacity: s.capacity,
        genFactor: s.genFactor,
        moduleId: s.moduleId,
        inverterId: s.inverterId,
        moduleMake: s.moduleMake,
        inverterMake: s.inverterMake,
        mountMake: s.mountMake,
        cableMake: s.cableMake,
        moduleCount: design.moduleCount,
        stringConfig: design.stringConfig,
        areaRequired: design.areaRequired,
        dcacRatio: design.dcacRatio
      },
      financial: {
        costPerKwp: s.costPerKwp,
        gstPercent: s.gstPercent,
        projectCost: f.projectCost,
        gstAmount: f.gstAmount,
        totalCost: f.totalCost,
        subsidy: f.subsidy,
        netInvestment: f.netInvestment,
        tariff: s.tariff,
        escalation: s.escalation,
        degradation: s.degradation,
        annualGen: f.annualGen,
        annualSaving: f.annualSaving,
        lifetimeSaving: f.lifetimeSaving,
        payback: f.payback,
        irr: f.irr
      },
      commercial: {
        payAdvance: s.payAdvance,
        payDispatch: s.payDispatch,
        payCompletion: s.payCompletion
      },
      meta: {
        propDate: s.propDate
      }
    };

    const saved = Store.saveProposal(proposalData);
    currentProposalId = saved.id;
    if ($('proposalId')) $('proposalId').value = saved.id;

    // Update browser URL without reloading
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', saved.id);
    window.history.replaceState({}, '', newUrl.toString());

    updateHeaderStatus(saved);
    showToast(`Proposal saved (${saved.ref || saved.id})`, 'success');
  }

  /* ---------------- 9. Event wiring ---------------- */
  function wireEvents() {
    // Logo upload
    $('logoUpload')?.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        document.querySelectorAll('#formLogo, #previewLogo, .pg-logo img').forEach((img) => {
          img.src = ev.target.result;
        });
      };
      reader.readAsDataURL(file);
    });

    // Per-page photo uploads
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9', 'p10', 'p11'].forEach((key) => {
      const input = $('up_' + key);
      if (!input) return;
      input.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const img = $('img_' + key);
          if (img) img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    });

    // Customer dropdown select
    $('customerSelect')?.addEventListener('change', function (e) {
      const cId = e.target.value;
      if (!cId) return;
      const c = Store.getCustomer(cId);
      if (c) {
        currentCustomerId = c.id;
        if ($('customerId')) $('customerId').value = c.id;
        if ($('custName')) $('custName').value = c.name || '';
        if ($('custAddress')) $('custAddress').value = c.address || '';
        if ($('custPhone')) $('custPhone').value = c.phone || '';
        if ($('custEmail')) $('custEmail').value = c.email || '';
        renderAll();
      }
    });

    // Equipment module dropdown select
    $('moduleSelect')?.addEventListener('change', function (e) {
      const modId = e.target.value;
      if (modId && modId !== 'custom') {
        const mod = EquipmentDB.getModule(modId);
        if (mod && $('moduleMake')) {
          $('moduleMake').value = `${mod.manufacturer} ${mod.model} (${mod.wp}Wp)`;
        }
      }
      renderAll();
    });

    // Equipment inverter dropdown select
    $('inverterSelect')?.addEventListener('change', function (e) {
      const invId = e.target.value;
      if (invId && invId !== 'custom') {
        const inv = EquipmentDB.getInverter(invId);
        if (inv && $('inverterMake')) {
          $('inverterMake').value = `${inv.manufacturer} ${inv.model} (${inv.ratedPowerKw} kW)`;
        }
      }
      renderAll();
    });

    // Save button
    $('saveProposalBtn')?.addEventListener('click', saveToStore);

    // Header PDF button
    $('headerPdfBtn')?.addEventListener('click', () => $('downloadBtn')?.click());

    // Re-render on form panel changes
    document.querySelectorAll('.form-panel input, .form-panel select').forEach((el) => {
      el.addEventListener('input', renderAll);
      el.addEventListener('change', renderAll);
    });
  }

  /* ---------------- 10. PDF Export (11 pages) ---------------- */
  function wireExport() {
    $('downloadBtn')?.addEventListener('click', async function () {
      const btn = this;
      const status = $('statusMsg');
      btn.disabled = true;
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageIds = ['page1', 'page2', 'page3', 'page4', 'page5', 'page6', 'page7', 'page8', 'page9', 'page10', 'page11'];
        for (let i = 0; i < pageIds.length; i++) {
          if (status) status.textContent = 'Rendering page ' + (i + 1) + ' of ' + pageIds.length + '…';
          const canvas = await html2canvas($(pageIds[i]), { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/jpeg', 0.92);
          const pageW = pdf.internal.pageSize.getWidth();
          const pageH = pdf.internal.pageSize.getHeight();
          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
        }
        const s = readMain();
        const filename = 'KTM_Quotation_' + (s.custName || 'Customer').replace(/[^a-z0-9]+/gi, '_') +
          '_' + s.capacity + 'kWp.pdf';
        pdf.save(filename);
        if (status) status.textContent = 'Downloaded ✓ (11 pages)';
        showToast('PDF quotation downloaded!', 'success');
      } catch (err) {
        console.error(err);
        if (status) status.textContent = 'Something went wrong — please try again.';
        showToast('PDF export error — please try again', 'danger');
      } finally {
        btn.disabled = false;
        if (status) setTimeout(() => { status.textContent = ''; }, 5000);
      }
    });
  }

  /* ---------------- 11. Initialization ---------------- */
  Store.seedIfEmpty();
  loadFromStore();
  wireEvents();
  buildAdvancedEditor();
  renderAll();
  wireExport();
})();
