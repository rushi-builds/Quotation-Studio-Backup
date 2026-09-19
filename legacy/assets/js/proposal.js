/* ==========================================================================
   KTM Solar Platform — Customer Proposal Logic
   --------------------------------------------------------------------------
   Reads proposal data from Store (localStorage).
   Uses FinancialEngine for all calculations — same engine as builder.
   Uses EquipmentDB for module/inverter specs.
   Uses SolarEngine for design validation.
   ========================================================================== */
'use strict';

(function () {

  /* ── Helpers ── */
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function $(id) { return document.getElementById(id); }
  function fI(n) { return FinancialEngine.fmtINR(n); }
  function fN(n) { return FinancialEngine.fmtNum(n); }

  function showToast(msg, type = 'info') {
    const c = $('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  /* ── Load proposal ── */
  function loadProposal() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      const p = Store.getProposal(id);
      if (p) return p;
    }
    // Fall back to demo (first proposal in store)
    const all = Store.getProposals();
    if (all.length) return all[0];
    return null;
  }

  /* ── Chart.js defaults ── */
  function setChartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.color = '#8fa3c8';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.borderColor = 'rgba(255,255,255,0.07)';
  }

  /* ── Navigation ── */
  let activeSection = 'overview';
  function initNav() {
    const navBtns = document.querySelectorAll('.pnav-item');
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        const sectionEl = document.getElementById(`section-${section}`);
        if (sectionEl) {
          sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeSection = section;
      });
    });

    // Update active nav on scroll
    const sections = document.querySelectorAll('.proposal-section[id]');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('section-', '');
          navBtns.forEach(b => b.classList.toggle('active', b.dataset.section === id));
        }
      });
    }, { threshold: 0.3 });
    sections.forEach(s => observer.observe(s));
  }

  /* ── Hero particles ── */
  function initParticles() {
    const container = $('heroParticles');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('span');
      p.className = 'hero-particle';
      const size = Math.random() * 6 + 2;
      p.style.cssText = `
        width:${size}px;height:${size}px;
        left:${Math.random() * 100}%;
        animation-duration:${Math.random() * 15 + 10}s;
        animation-delay:${Math.random() * 10}s;
      `;
      container.appendChild(p);
    }
  }

  /* ── Hero ── */
  function renderHero(p, fin) {
    const isDemo = Boolean(p.isDemo);
    $('heroCustName').textContent = p.customer?.name || '—';
    $('heroCapacity').textContent = `${p.system?.capacity || '—'} kWp Solar PV System${isDemo ? ' [SAMPLE DEMO]' : ''}`;
    $('heroPropRef').textContent  = isDemo ? `[SAMPLE DEMO] ${p.ref || p.id}` : (p.ref || p.id);
    $('heroPropDate').textContent = FinancialEngine.fmtDate(p.meta?.propDate) || '';
    $('topbarRef').textContent    = isDemo ? `SAMPLE DEMO (${p.ref || p.id})` : (p.ref || p.id);
    document.title = `Solar Proposal — ${p.customer?.name || 'Customer'}${isDemo ? ' [DEMO]' : ''} | KTM Energy Experts`;

    // Explore button scrolls to overview
    $('heroExploreBtn').addEventListener('click', () => {
      $('section-overview').scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ── Overview cards ── */
  function renderOverview(p, fin) {
    const cap = p.system?.capacity || 0;
    const mod = EquipmentDB.getModule(p.system?.moduleId);
    const inv = EquipmentDB.getInverter(p.system?.inverterId);

    $('overviewSub').textContent = `A ${cap} kWp professionally engineered rooftop solar system delivering guaranteed savings for 25+ years.`;

    const cards = [
      { icon: '⚡', value: cap + ' kWp', label: 'System Capacity', color: 'solar' },
      { icon: '🔲', value: p.system?.moduleCount || '—', label: 'Solar Modules', color: '' },
      { icon: '🔁', value: inv ? `${inv.ratedPowerKw} kW` : '—', label: 'Inverter', color: '' },
      { icon: '📊', value: fN(fin.annualGen) + ' kWh', label: 'Annual Generation', color: '' },
      { icon: '💰', value: fI(fin.annualSaving), label: 'Annual Savings', color: 'gold' },
      { icon: '📅', value: FinancialEngine.fmtPayback(fin.payback), label: 'Payback Period', color: 'green' },
    ];

    $('overviewGrid').innerHTML = cards.map((c, i) => `
      <div class="overview-card animate-fade-in-up" style="animation-delay:${i * 80}ms">
        <div class="overview-icon">${c.icon}</div>
        <div class="overview-value ${c.color}">${esc(String(c.value))}</div>
        <div class="overview-label">${esc(c.label)}</div>
      </div>
    `).join('');
  }

  /* ── Property ── */
  function renderProperty(p) {
    $('propAddress').textContent = p.customer?.address || '—';
    $('propArea').textContent    = p.system?.areaRequired ? `~${p.system.areaRequired} m² (~${Math.round(p.system.areaRequired * 10.764)} sq.ft)` : 'DATA REQUIRED';
    $('propLayout').textContent  = p.system?.moduleCount  ? `${p.system.moduleCount} modules` : '—';
  }

  /* ── Solar design ── */
  function renderDesign(p, fin) {
    const mod = EquipmentDB.getModule(p.system?.moduleId);
    const inv = EquipmentDB.getInverter(p.system?.inverterId);
    const cap = p.system?.capacity || 0;

    const cards = [
      { icon: '⚡', label: 'Installed Capacity',  value: cap ? `${cap} kWp` : 'DATA REQUIRED' },
      { icon: '🔲', label: 'PV Modules',           value: p.system?.moduleCount ? `${p.system.moduleCount} Nos` : '—', sub: mod ? EquipmentDB.moduleLabel(mod) : p.system?.moduleId || '—' },
      { icon: '🔁', label: 'Inverter',             value: inv ? `${inv.ratedPowerKw} kW` : '—', sub: inv ? EquipmentDB.inverterLabel(inv) : p.system?.inverterId || '—' },
      { icon: '📡', label: 'String Config',        value: p.system?.stringConfig || '—', sub: 'Series × Parallel' },
      { icon: '📐', label: 'Est. Roof Area',       value: p.system?.areaRequired ? `~${p.system.areaRequired} m² (~${Math.round(p.system.areaRequired * 10.764)} sq.ft)` : 'DATA REQUIRED', sub: 'Planning layout estimate (75% factor) · Subject to physical site survey' },
      { icon: '⚖️', label: 'DC/AC Ratio',          value: p.system?.dcacRatio ? p.system.dcacRatio.toFixed(2) : '—', sub: 'DC/AC sizing ratio' },
      { icon: '🏗️', label: 'Mounting Structure',   value: p.system?.mountMake || '—' },
      { icon: '🔌', label: 'Cabling',              value: p.system?.cableMake || '—' },
    ];

    $('designGrid').innerHTML = cards.map((c, i) => `
      <div class="design-card animate-fade-in-up" style="animation-delay:${i * 60}ms">
        <div class="design-card-icon">${c.icon}</div>
        <div class="design-card-label">${esc(c.label)}</div>
        <div class="design-card-value">${esc(c.value)}</div>
        ${c.sub ? `<div class="design-card-sub">${esc(c.sub)}</div>` : ''}
      </div>
    `).join('');

    // Validation warnings from SolarEngine
    if (p.system?.dcacRatio) {
      const validation = SolarEngine.validateDesign(p.system);
      if (!validation.valid) {
        $('designValidation').classList.remove('hidden');
        $('designValidation').innerHTML = '⚠️ Design note: ' + validation.warnings.join('; ');
      }
    }
  }

  /* ── Energy chart ── */
  let energyChart = null;
  let selectedYears = 1;

  function renderEnergyChart(fin, years) {
    const data = fin.yearlyData.slice(0, years);
    const labels = data.map(d => `Yr ${d.year}`);
    const values = data.map(d => d.generation);

    const canvas = $('energyChart');
    if (!canvas || !window.Chart) return;

    if (energyChart) energyChart.destroy();
    energyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Generation (kWh)',
          data: values,
          backgroundColor: 'rgba(249,115,22,0.7)',
          borderColor: '#f97316',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${fN(ctx.parsed.y)} kWh`,
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: { callback: v => fN(v) + ' kWh' },
            beginAtZero: true,
          }
        }
      }
    });
  }

  function renderEnergySection(fin) {
    $('genFactorNote').textContent = fin.annualGen && fin.annualGen > 0
      ? Math.round(fin.annualGen / (currentProposal?.system?.capacity || 1)).toLocaleString('en-IN')
      : '—';

    const kpis = [
      { label: 'Year 1 Generation', value: fN(fin.annualGen) + ' kWh', icon: '☀️' },
      { label: '25-Year Generation', value: FinancialEngine.fmtKwh(fin.lifetimeGenKWh), icon: '📊' },
      { label: 'CO₂ Offset / Year', value: fin.co2Annual.toFixed(2) + ' T', icon: '🌿' },
    ];

    $('energyKpis').innerHTML = kpis.map((k, i) => `
      <div class="metric-card animate-fade-in-up" style="animation-delay:${i * 80}ms">
        <div class="metric-icon">${k.icon}</div>
        <div class="metric-label">${esc(k.label)}</div>
        <div class="metric-value solar">${esc(k.value)}</div>
      </div>
    `).join('');

    // Year selector
    document.querySelectorAll('.year-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedYears = parseInt(btn.dataset.years);
        renderEnergyChart(fin, selectedYears);
        $('energyChartTitle').textContent =
          selectedYears === 1 ? 'Annual Generation — Year 1'
          : `Cumulative Generation — ${selectedYears} Years`;
      });
    });

    renderEnergyChart(fin, 1);
  }

  /* ── Financial charts ── */
  let savingsChart = null;
  let annualSavingsChart = null;

  function renderFinancials(p, fin) {
    const kpis = [
      { label: 'Net Investment',   value: fI(fin.netInvestment), color: 'solar', icon: '💳' },
      { label: 'Annual Savings',   value: fI(fin.annualSaving),  color: 'gold',  icon: '💰' },
      { label: 'Payback Period',   value: FinancialEngine.fmtPayback(fin.payback), color: 'green', icon: '📅' },
      { label: '25-Year Savings',  value: FinancialEngine.fmtINRCrore(fin.lifetimeSaving), color: '',   icon: '📈' },
    ];

    $('finKpis').innerHTML = kpis.map((k, i) => `
      <div class="metric-card animate-fade-in-up" style="animation-delay:${i * 80}ms">
        <div class="metric-icon">${k.icon}</div>
        <div class="metric-label">${esc(k.label)}</div>
        <div class="metric-value ${k.color}">${esc(k.value)}</div>
      </div>
    `).join('');

    // Cumulative savings vs investment chart
    const labels = fin.yearlyData.map(d => `Yr ${d.year}`);
    const cumData = fin.yearlyData.map(d => d.cumSaving);
    const invLine = fin.yearlyData.map(() => Math.round(fin.netInvestment));

    if ($('savingsChart') && window.Chart) {
      if (savingsChart) savingsChart.destroy();
      savingsChart = new Chart($('savingsChart'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Cumulative Savings',
              data: cumData,
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34,197,94,0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 2,
            },
            {
              label: 'Investment',
              data: invLine,
              borderColor: 'rgba(249,115,22,0.6)',
              borderDash: [6, 4],
              pointRadius: 0,
              borderWidth: 1.5,
              fill: false,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fI(ctx.parsed.y)}` } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
            y: { ticks: { callback: v => FinancialEngine.fmtINRCrore(v) }, beginAtZero: true }
          }
        }
      });
    }

    // Annual savings bar chart
    const annualData = fin.yearlyData.map(d => d.saving);
    if ($('annualSavingsChart') && window.Chart) {
      if (annualSavingsChart) annualSavingsChart.destroy();
      annualSavingsChart = new Chart($('annualSavingsChart'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Annual Savings (₹)',
            data: annualData,
            backgroundColor: 'rgba(251,191,36,0.7)',
            borderColor: '#fbbf24',
            borderWidth: 1,
            borderRadius: 3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: ctx => fI(ctx.parsed.y) } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
            y: { ticks: { callback: v => FinancialEngine.fmtINRCrore(v) }, beginAtZero: true }
          }
        }
      });
    }

    // Payback banner
    if (fin.payback > 0) {
      $('paybackBanner').innerHTML = `
        <div class="payback-icon">🎯</div>
        <div class="payback-text">
          <div class="payback-headline">Break-even in ${fin.payback.toFixed(1)} Years</div>
          <div class="payback-sub">After that, every unit generated is pure savings — for 25+ years.</div>
        </div>
      `;
    } else {
      $('paybackBanner').style.display = 'none';
    }

    // Assumptions
    const fin_in = p.financial || {};
    $('assumptionsGrid').innerHTML = [
      { label: 'Generation Factor',  value: (fin_in.genFactor || p.system?.genFactor || 1400) + ' kWh/kWp/year' },
      { label: 'Electricity Tariff', value: '₹' + (fin_in.tariff || 0).toFixed(2) + '/kWh' },
      { label: 'Tariff Escalation',  value: ((fin_in.escalation || 0.03) * 100).toFixed(1) + '% /year' },
      { label: 'Panel Degradation',  value: ((fin_in.degradation || 0.005) * 100).toFixed(1) + '% /year' },
      { label: 'GST',                value: (fin_in.gstPercent || 18) + '%' },
      { label: 'Subsidy Applied',    value: fI(fin.subsidy) },
    ].map(a => `
      <div class="assumption-item">
        <div class="assumption-label">${esc(a.label)}</div>
        <div class="assumption-value">${esc(a.value)}</div>
      </div>
    `).join('');
  }

  /* ── Simulator ── */
  let currentProposal = null;

  function runSimulator(capacityKwp, proposal) {
    const fin_in = proposal.financial || {};
    const inputs = {
      capacity:         capacityKwp,
      genFactor:        fin_in.genFactor || proposal.system?.genFactor || 1400,
      costPerKwp:       fin_in.costPerKwp || 0,
      gstPercent:       fin_in.gstPercent || 18,
      subsidyOverride:  null,
      tariff:           fin_in.tariff || 0,
      escalation:       fin_in.escalation || 0.03,
      degradation:      fin_in.degradation || 0.005,
    };
    return FinancialEngine.compute(inputs);
  }

  function initSimulator(proposal) {
    const slider = $('simSlider');
    const bubble = $('simBubble');
    if (!slider) return;

    // Set initial value to proposal capacity
    const cap = proposal.system?.capacity || 7;
    slider.value = cap;
    bubble.textContent = `${cap} kWp`;

    function updateSimulator() {
      const val = parseFloat(slider.value);
      bubble.textContent = `${val} kWp`;

      // Position bubble
      const pct = (val - parseFloat(slider.min)) / (parseFloat(slider.max) - parseFloat(slider.min));
      bubble.style.left = `calc(${pct * 100}% - ${pct * 60 - 30}px)`;

      const fin = runSimulator(val, proposal);

      $('simResults').innerHTML = [
        { label: 'System Size',   value: val + ' kWp',                color: 'var(--clr-solar)' },
        { label: 'Annual Gen',    value: fN(fin.annualGen) + ' kWh',  color: '' },
        { label: 'Net Investment',value: fI(fin.netInvestment),        color: '' },
        { label: 'Annual Savings',value: fI(fin.annualSaving),         color: 'var(--clr-gold)' },
        { label: 'Payback',       value: FinancialEngine.fmtPayback(fin.payback), color: 'var(--clr-success)' },
        { label: 'Subsidy',       value: fI(fin.subsidy),              color: '' },
        { label: '25-yr Savings', value: FinancialEngine.fmtINRCrore(fin.lifetimeSaving), color: '' },
        { label: 'IRR',           value: fin.irr.toFixed(1) + '%',     color: '' },
      ].map((r, i) => `
        <div class="sim-result-card animate-fade-in-up" style="animation-delay:${i * 40}ms">
          <div class="sim-result-label">${esc(r.label)}</div>
          <div class="sim-result-value" style="color:${r.color || 'var(--clr-text-primary)'}">${esc(r.value)}</div>
        </div>
      `).join('');
    }

    slider.addEventListener('input', updateSimulator);
    updateSimulator();
  }

  /* ── Equipment cards ── */
  function renderEquipment(p) {
    const mod = EquipmentDB.getModule(p.system?.moduleId);
    const inv = EquipmentDB.getInverter(p.system?.inverterId);

    const cards = [];

    if (mod) {
      cards.push({
        icon: '🔲',
        type: 'PV Module',
        name: `${mod.manufacturer} ${mod.model}`,
        specs: [
          { l: 'Rated Power',    v: `${mod.wp} Wp` },
          { l: 'Technology',     v: mod.technology },
          { l: 'Efficiency',     v: `${mod.efficiency}%` },
          { l: 'Voc',            v: `${mod.voc} V` },
          { l: 'Dimensions',     v: mod.dimensions ? `${mod.dimensions.lengthMm}×${mod.dimensions.widthMm} mm` : '—' },
          { l: 'Product Warranty', v: `${mod.warrantyYears?.product || '—'} years` },
        ]
      });
    }

    if (inv) {
      cards.push({
        icon: '🔁',
        type: 'String Inverter',
        name: `${inv.manufacturer} ${inv.model}`,
        specs: [
          { l: 'Rated Power',    v: `${inv.ratedPowerKw} kW` },
          { l: 'Efficiency',     v: `${inv.efficiency}%` },
          { l: 'MPPT Count',     v: inv.mpptCount },
          { l: 'Max DC Voltage', v: `${inv.vmaxDC} V` },
          { l: 'IP Rating',      v: inv.ipRating },
          { l: 'Warranty',       v: `${inv.warrantyYears} years` },
        ]
      });
    }

    // Add mounting and cable cards (text only)
    if (p.system?.mountMake) {
      cards.push({
        icon: '🏗️',
        type: 'Mounting Structure',
        name: p.system.mountMake,
        specs: [
          { l: 'Type',     v: 'Hot-Dip Galvanized / Aluminium' },
          { l: 'Standard', v: 'IS 2062 Grade' },
        ]
      });
    }
    if (p.system?.cableMake) {
      cards.push({
        icon: '🔌',
        type: 'DC/AC Cabling',
        name: p.system.cableMake,
        specs: [
          { l: 'DC Cable', v: '4 mm² / 6 mm² — TÜV approved' },
          { l: 'AC Cable', v: 'As per system rating' },
        ]
      });
    }

    if (!cards.length) {
      $('equipmentGrid').innerHTML = '<p class="text-muted">Equipment details not specified in this proposal.</p>';
      return;
    }

    $('equipmentGrid').innerHTML = cards.map((c, i) => `
      <div class="equipment-card animate-fade-in-up" style="animation-delay:${i * 80}ms">
        <div class="equipment-card-header">${c.icon}</div>
        <div class="equipment-card-body">
          <div class="equipment-card-type">${esc(c.type)}</div>
          <div class="equipment-card-name">${esc(c.name)}</div>
          <div class="equipment-specs">
            ${c.specs.map(s => `
              <div class="equip-spec-row">
                <span class="equip-spec-label">${esc(s.l)}</span>
                <span class="equip-spec-value">${esc(String(s.v))}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `).join('');
  }

  /* ── Projects gallery ── */
  const KTM_PROJECTS = [
    { name: 'Agarwal Industries',    img: 'assets/images/site-agarwal.jpg',    cat: 'industrial',   cap: '45 kWp',   loc: 'Pune' },
    { name: 'Bramha Corp',           img: 'assets/images/site-bramha.jpg',     cat: 'commercial',   cap: '28 kWp',   loc: 'Pune' },
    { name: 'City Pride Mall',       img: 'assets/images/site-citypride.jpg',  cat: 'commercial',   cap: '120 kWp',  loc: 'Pune' },
    { name: 'GRP Limited',           img: 'assets/images/site-grp.jpg',        cat: 'industrial',   cap: '200 kWp',  loc: 'Nashik' },
    { name: 'Nerolac Paints',        img: 'assets/images/site-nerolac.jpg',    cat: 'industrial',   cap: '350 kWp',  loc: 'Pune' },
    { name: 'PAR Industries',        img: 'assets/images/site-par.jpg',        cat: 'industrial',   cap: '175 kWp',  loc: 'Aurangabad' },
    { name: 'Prorigo Software',      img: 'assets/images/site-prorigo.jpg',    cat: 'commercial',   cap: '35 kWp',   loc: 'Pune' },
    { name: 'Reach Global',         img: 'assets/images/site-reachglobal.jpg', cat: 'commercial',   cap: '50 kWp',   loc: 'Mumbai' },
    { name: 'Serum Institute',       img: 'assets/images/site-serum.jpg',      cat: 'industrial',   cap: '500 kWp',  loc: 'Pune' },
  ];

  function renderProjects() {
    const gallery = $('projectsGallery');
    gallery.innerHTML = KTM_PROJECTS.map((proj, i) => `
      <div class="project-card" data-cat="${proj.cat}" style="animation-delay:${i * 60}ms">
        <img src="${proj.img}" alt="${esc(proj.name)}" loading="lazy">
        <div class="project-card-overlay">
          <div class="proj-card-name">${esc(proj.name)}</div>
          <div class="proj-card-meta">
            <span>📍 ${esc(proj.loc)}</span>
            <span>⚡ ${esc(proj.cap)}</span>
          </div>
        </div>
      </div>
    `).join('');

    // Filter
    document.querySelectorAll('.proj-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.proj-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.cat;
        gallery.querySelectorAll('.project-card').forEach(card => {
          card.classList.toggle('hidden', cat !== 'all' && card.dataset.cat !== cat);
        });
      });
    });
  }

  /* ── Journey timeline ── */
  const JOURNEY_STEPS = [
    { title: 'Site Survey',       desc: 'Our engineers conduct a detailed site assessment — roof structure, orientation, shading, and electrical capacity.' },
    { title: 'Engineering Design', desc: 'CAD layout, stringing diagram, SLD, and structural drawings prepared by our engineering team.' },
    { title: 'Procurement',        desc: 'Equipment ordered from verified manufacturers. No compromises on quality.' },
    { title: 'Civil & Structural', desc: 'Mounting structure installed per structural drawings. Foundation work completed.' },
    { title: 'Module Installation', desc: 'PV modules mounted and wired per stringing diagram under quality supervision.' },
    { title: 'Electrical Work',    desc: 'Inverter, DCDB, ACDB, protection devices, earthing, and monitoring system installed.' },
    { title: 'Testing & Commissioning', desc: 'End-to-end system testing, open-circuit checks, insulation test, and commissioning report.' },
    { title: 'DISCOM Net Metering', desc: 'Net meter application filed and installation. Subsidy paperwork handled by KTM.' },
    { title: 'Handover & Training', desc: 'System walkthrough, monitoring app setup, handover documents, and O&M guidance.' },
  ];

  function renderJourney() {
    $('journeyTimeline').innerHTML = JOURNEY_STEPS.map((step, i) => `
      <div class="journey-step" style="animation-delay:${i * 80}ms">
        <div class="journey-step-dot">${i + 1}</div>
        <div class="journey-step-body">
          <div class="journey-step-title">${esc(step.title)}</div>
          <div class="journey-step-desc">${esc(step.desc)}</div>
        </div>
      </div>
    `).join('');

    // Animate on scroll
    const steps = document.querySelectorAll('.journey-step');
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.2 });
    steps.forEach(s => io.observe(s));
  }

  /* ── Warranty ── */
  function renderWarranty(p) {
    const mod = EquipmentDB.getModule(p.system?.moduleId);
    const inv = EquipmentDB.getInverter(p.system?.inverterId);

    const cards = [
      {
        icon: '🔲',
        title: 'PV Module — Product',
        years: mod?.warrantyYears?.product || 12,
        label: 'Year Manufacturer Warranty',
        desc: 'Covers manufacturing defects and product failures under normal use.',
      },
      {
        icon: '📈',
        title: 'PV Module — Performance',
        years: 25,
        label: 'Year Linear Performance Guarantee',
        desc: `≥${mod?.warrantyYears?.performance10 || 91}% at Year 10, ≥${mod?.warrantyYears?.performance25 || 80.7}% at Year 25.`,
      },
      {
        icon: '🔁',
        title: 'Inverter',
        years: inv?.warrantyYears || 5,
        label: 'Year Manufacturer Warranty',
        desc: 'Covers component failures. Extended warranty available.',
      },
      {
        icon: '🏗️',
        title: 'Mounting Structure',
        years: 10,
        label: 'Year Structural Warranty',
        desc: 'Hot-dip galvanised / aluminium structure against corrosion.',
      },
      {
        icon: '🔧',
        title: 'Workmanship',
        years: 2,
        label: 'Year KTM Workmanship Warranty',
        desc: 'Covers installation quality issues directly from KTM Energy Experts.',
      },
      {
        icon: '📞',
        title: 'O&M Support',
        years: '∞',
        label: 'Lifetime Technical Support',
        desc: 'Annual maintenance service available. WhatsApp + email support.',
      },
    ];

    $('warrantyGrid').innerHTML = cards.map((c, i) => `
      <div class="warranty-card animate-fade-in-up" style="animation-delay:${i * 60}ms">
        <div class="warranty-card-icon">${c.icon}</div>
        <div class="warranty-card-title">${esc(c.title)}</div>
        <div class="warranty-card-years">${esc(String(c.years))}</div>
        <div class="warranty-card-label">${esc(c.label)}</div>
        <div class="warranty-card-desc">${esc(c.desc)}</div>
      </div>
    `).join('');
  }

  /* ── Commercial ── */
  function renderCommercial(p, fin) {
    const cap = p.system?.capacity || 0;
    const mod = EquipmentDB.getModule(p.system?.moduleId);
    const inv = EquipmentDB.getInverter(p.system?.inverterId);

    // BOM table
    const bomItems = [
      { name: 'PV Module', detail: mod ? EquipmentDB.moduleLabel(mod) : (p.system?.moduleId || '—'), qty: `${p.system?.moduleCount || '—'} Nos` },
      { name: 'Grid-Tie Inverter', detail: inv ? EquipmentDB.inverterLabel(inv) : (p.system?.inverterId || '—'), qty: '1 No' },
      { name: 'Mounting Structure', detail: p.system?.mountMake || '—', qty: '1 Lot' },
      { name: 'DC Cabling', detail: p.system?.cableMake || '—', qty: '1 Lot' },
      { name: 'AC Cabling', detail: p.system?.cableMake || '—', qty: '1 Lot' },
      { name: 'DCDB / ACDB', detail: 'Junction Boxes + Protection Devices', qty: '1 Set' },
      { name: 'Earthing System', detail: 'Plate Earthing — IS 3043', qty: '1 Lot' },
      { name: 'Remote Monitoring', detail: 'Datalogger + Mobile App', qty: '1 No' },
      { name: 'EPC Installation', detail: 'Civil, Electrical & Commissioning', qty: '1 Lot' },
    ];

    $('commercialBOM').innerHTML = `
      <div class="chart-card-title" style="padding:var(--space-4) var(--space-4) 0;">Bill of Materials</div>
      <table class="bom-table">
        <thead><tr><th>Item</th><th>Specification</th><th style="text-align:right;">Qty</th></tr></thead>
        <tbody>
          ${bomItems.map(item => `
            <tr>
              <td><div class="bom-item-name">${esc(item.name)}</div></td>
              <td><div class="bom-item-detail">${esc(item.detail)}</div></td>
              <td class="bom-qty">${esc(item.qty)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Cost breakdown
    $('costBreakdown').innerHTML = `
      <div class="chart-card-title">Cost Breakdown</div>
      <div class="cost-row">
        <span class="cost-label">Project Cost (ex-GST)</span>
        <span class="cost-value">${fI(fin.projectCost)}</span>
      </div>
      <div class="cost-row">
        <span class="cost-label">GST (${p.financial?.gstPercent || 18}%)</span>
        <span class="cost-value">${fI(fin.gstAmount)}</span>
      </div>
      <div class="cost-row total">
        <span class="cost-label">Total Project Cost</span>
        <span class="cost-value">${fI(fin.totalCost)}</span>
      </div>
      <div class="cost-row subsidy">
        <span class="cost-label">PM Surya Ghar Subsidy</span>
        <span class="cost-value">− ${fI(fin.subsidy)}</span>
      </div>
      <div class="cost-row net-investment">
        <span class="cost-label">Net Investment</span>
        <span class="cost-value">${fI(fin.netInvestment)}</span>
      </div>
    `;

    // Payment terms
    const comm = p.commercial || {};
    $('paymentTerms').innerHTML = `
      <div class="payment-terms-title">Payment Schedule</div>
      <div class="payment-row"><span>Advance on order</span><span><strong>${comm.payAdvance || 30}%</strong></span></div>
      <div class="payment-row"><span>On equipment dispatch</span><span><strong>${comm.payDispatch || 60}%</strong></span></div>
      <div class="payment-row"><span>On completion</span><span><strong>${comm.payCompletion || 10}%</strong></span></div>
    `;

    const validity = comm.validityDays || 30;
    const expiryDate = p.meta?.expiryDate
      ? FinancialEngine.fmtDate(p.meta.expiryDate)
      : `${validity} days from proposal date`;
    $('validityNote').textContent = `Proposal valid for ${validity} days (${expiryDate})`;
  }

  /* ── Contact section ── */
  function renderContact(p) {
    const phone   = p.customer?.phone || '';
    const wpNum   = phone.replace(/\D/g, '');
    const propRef = p.ref || p.id;

    $('contactWhatsapp').href = `https://wa.me/${wpNum}?text=Hi KTM Energy Experts, I am reviewing proposal ${propRef}.`;
    $('contactCall').href = `tel:${phone}`;
    $('contactPhone').textContent = phone || '—';
    $('cdetPhone').textContent   = phone   || '—';
    $('cdetEmail').textContent   = p.customer?.email   || '—';

    $('contactModify').addEventListener('click', () => {
      const msg = encodeURIComponent(`Hi KTM, I'd like to request a modification to proposal ${propRef}.`);
      window.open(`https://wa.me/${wpNum}?text=${msg}`, '_blank');
    });

    // WhatsApp share from topbar
    $('topbarWhatsapp').href = `https://wa.me/?text=${encodeURIComponent(`Hello, here is your solar proposal from KTM Energy Experts:\n${window.location.href}`)}`;

    // Accept proposal
    $('acceptBtn').addEventListener('click', () => {
      Store.updateProposalStatus(p.id, 'accepted');
      $('acceptModal').classList.remove('hidden');
    });
    $('acceptModalClose').addEventListener('click', () => {
      $('acceptModal').classList.add('hidden');
    });
  }

  /* ── PDF download (uses existing jsPDF if loaded, else link) ── */
  function wireDownload() {
    $('downloadPdfBtn').addEventListener('click', () => {
      showToast('Opening PDF builder…', 'info');
      const p = currentProposal;
      if (p) {
        window.open(`builder.html?id=${encodeURIComponent(p.id)}`, '_blank');
      }
    });
    $('topbarPdfBtn').addEventListener('click', () => {
      $('downloadPdfBtn').click();
    });
  }

  /* ── Main init ── */
  function init() {
    Store.seedIfEmpty();
    setChartDefaults();
    initParticles();
    initNav();

    const proposal = loadProposal();
    if (!proposal) {
      document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;flex-direction:column;gap:16px;color:#8fa3c8;font-family:Inter,sans-serif;">
          <div style="font-size:3rem">📄</div>
          <div style="font-size:1.5rem;font-weight:700;color:#f0f4ff;">No Proposal Found</div>
          <div>Create a proposal first in the <a href="builder.html" style="color:#f97316;">Proposal Builder</a>.</div>
        </div>
      `;
      return;
    }

    currentProposal = proposal;
    Store.recordProposalView(proposal.id);

    // Build financial inputs from proposal data
    const fin_inputs = {
      capacity:        proposal.system?.capacity    || 0,
      genFactor:       proposal.system?.genFactor   || proposal.financial?.genFactor || 1400,
      costPerKwp:      proposal.financial?.costPerKwp  || 0,
      gstPercent:      proposal.financial?.gstPercent  || 18,
      subsidyOverride: (proposal.financial?.subsidy >= 0) ? proposal.financial.subsidy : null,
      tariff:          proposal.financial?.tariff       || 0,
      escalation:      proposal.financial?.escalation   || 0.03,
      degradation:     proposal.financial?.degradation  || 0.005,
    };
    const fin = FinancialEngine.compute(fin_inputs);

    // Render all sections
    renderHero(proposal, fin);
    renderOverview(proposal, fin);
    renderProperty(proposal);
    renderDesign(proposal, fin);
    renderEnergySection(fin);
    renderFinancials(proposal, fin);
    initSimulator(proposal);
    renderEquipment(proposal);
    renderProjects();
    renderJourney();
    renderWarranty(proposal);
    renderCommercial(proposal, fin);
    renderContact(proposal);
    wireDownload();
  }

  init();

})();
