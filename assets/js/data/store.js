/* ==========================================================================
   KTM Solar Platform — Data Store (localStorage)
   --------------------------------------------------------------------------
   Single source of truth for all in-browser data.
   Models: Customer, Proposal
   Phase 5-6 will replace this with a real backend API;
   the interface (getCustomers, saveProposal, etc.) stays the same.
   ========================================================================== */
'use strict';

const Store = (() => {
  const KEYS = {
    CUSTOMERS:   'ktm_customers',
    PROPOSALS:   'ktm_proposals',
    SEQUENCE:    'ktm_seq',
    LAST_BACKUP: 'ktm_last_backup',
  };

  /* ── Internal helpers ── */
  function _read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }
  function _write(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }
  function _nextId(prefix) {
    const seq = (_read(KEYS.SEQUENCE) || {});
    seq[prefix] = (seq[prefix] || 0) + 1;
    _write(KEYS.SEQUENCE, seq);
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${String(seq[prefix]).padStart(3, '0')}`;
  }
  function _now() { return new Date().toISOString(); }

  /* ── Customer model ──────────────────────────────────────────────────────
   * {
   *   id:          string   'CUST-2026-001'
   *   name:        string   Full name
   *   company:     string   Company / organisation
   *   phone:       string
   *   email:       string
   *   address:     string   Site / billing address
   *   city:        string
   *   type:        string   'residential' | 'commercial' | 'industrial'
   *   gstNumber:   string
   *   notes:       string
   *   createdAt:   ISO string
   *   updatedAt:   ISO string
   * }
   * ─────────────────────────────────────────────────────────────────────── */

  function getCustomers() {
    return _read(KEYS.CUSTOMERS) || [];
  }
  function getCustomer(id) {
    return getCustomers().find(c => c.id === id) || null;
  }
  function saveCustomer(data) {
    const customers = getCustomers();
    if (data.id) {
      // Update existing
      const idx = customers.findIndex(c => c.id === data.id);
      if (idx === -1) throw new Error(`Customer ${data.id} not found`);
      customers[idx] = { ...customers[idx], ...data, updatedAt: _now() };
      _write(KEYS.CUSTOMERS, customers);
      return customers[idx];
    } else {
      // Create new
      const customer = {
        id: _nextId('CUST'),
        name: '',
        company: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        type: 'residential',
        gstNumber: '',
        notes: '',
        ...data,
        createdAt: _now(),
        updatedAt: _now(),
      };
      customers.push(customer);
      _write(KEYS.CUSTOMERS, customers);
      return customer;
    }
  }
  function deleteCustomer(id) {
    const customers = getCustomers().filter(c => c.id !== id);
    _write(KEYS.CUSTOMERS, customers);
  }

  /* ── Proposal model ──────────────────────────────────────────────────────
   * {
   *   id:          string   'PROP-2026-013'
   *   customerId:  string   Links to Customer.id
   *   version:     number   1, 2, 3 …
   *   status:      string   draft|sent|viewed|negotiation|accepted|rejected|expired|archived
   *   ref:         string   Human-readable ref e.g. 'KTME-2026-013'
   *   title:       string   e.g. '7 kWp Rooftop Solar — Bhooshan Waghmare'
   *
   *   system: {             ← Solar EPC design data
   *     capacity:     number  kWp
   *     genFactor:    number  kWh/kWp/year
   *     moduleId:     string  from equipment.js
   *     inverterId:   string  from equipment.js
   *     mountMake:    string
   *     cableMake:    string
   *     moduleCount:  number  auto-calculated
   *     stringConfig: string  e.g. '2S x 7P'
   *     areaRequired: number  m²
   *     dcacRatio:    number
   *   }
   *
   *   financial: {          ← Outputs from financial.js engine
   *     costPerKwp:      number
   *     gstPercent:      number
   *     projectCost:     number
   *     gstAmount:       number
   *     totalCost:       number
   *     subsidy:         number
   *     netInvestment:   number
   *     tariff:          number   ₹/kWh
   *     escalation:      number   fraction e.g. 0.03
   *     degradation:     number   fraction e.g. 0.005
   *     annualGen:       number   kWh
   *     annualSaving:    number   ₹
   *     lifetimeSaving:  number   ₹
   *     payback:         number   years
   *     irr:             number   %
   *   }
   *
   *   commercial: {
   *     payAdvance:     number  %
   *     payDispatch:    number  %
   *     payCompletion:  number  %
   *     validityDays:   number
   *     terms:          string
   *     exclusions:     string
   *   }
   *
   *   customer: {           ← Snapshot at proposal creation time
   *     name: string
   *     company: string
   *     address: string
   *     phone: string
   *     email: string
   *   }
   *
   *   meta: {
   *     propDate:    string  ISO date
   *     expiryDate:  string  ISO date
   *     template:    string  'residential-premium' | 'commercial-premium' | 'industrial-premium'
   *     sentAt:      string  ISO datetime | null
   *     firstViewAt: string  ISO datetime | null
   *     lastViewAt:  string  ISO datetime | null
   *     viewCount:   number
   *     acceptedAt:  string  ISO datetime | null
   *   }
   *
   *   createdAt:   ISO string
   *   updatedAt:   ISO string
   * }
   * ─────────────────────────────────────────────────────────────────────── */

  function getProposals() {
    return _read(KEYS.PROPOSALS) || [];
  }
  function getProposal(id) {
    return getProposals().find(p => p.id === id) || null;
  }
  function getProposalsForCustomer(customerId) {
    return getProposals().filter(p => p.customerId === customerId);
  }
  function saveProposal(data) {
    const proposals = getProposals();
    if (data.id) {
      // Update existing
      const idx = proposals.findIndex(p => p.id === data.id);
      if (idx === -1) throw new Error(`Proposal ${data.id} not found`);
      proposals[idx] = { ...proposals[idx], ...data, updatedAt: _now() };
      _write(KEYS.PROPOSALS, proposals);
      return proposals[idx];
    } else {
      // Create new — build a clean skeleton and merge provided data
      const propId = _nextId('PROP');
      const seqNum = propId.split('-')[2]; // '013'
      const year   = new Date().getFullYear();

      // Find the highest version for this customer (for initial proposals, version = 1)
      const existingVersions = data.customerId
        ? getProposalsForCustomer(data.customerId).map(p => p.version || 1)
        : [];
      const version = existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1;

      const proposal = {
        id: propId,
        customerId: null,
        version,
        status: 'draft',
        ref: `KTME-${year}-${seqNum}`,
        title: '',
        system: {
          capacity:     0,
          genFactor:    1400,
          moduleId:     null,
          inverterId:   null,
          mountMake:    '',
          cableMake:    '',
          moduleCount:  0,
          stringConfig: '',
          areaRequired: 0,
          dcacRatio:    0,
        },
        financial: {
          costPerKwp:   0,
          gstPercent:   13.8, // 13.8% composite (Notification No. 8/2021-Central Tax) or 18% standard EPC
          projectCost:  0,
          gstAmount:    0,
          totalCost:    0,
          subsidy:      0,
          netInvestment:0,
          tariff:       8,
          escalation:   0.03,
          degradation:  0.005,
          annualGen:    0,
          annualSaving: 0,
          lifetimeSaving: 0,
          payback:      0,
          irr:          0,
        },
        commercial: {
          payAdvance:    30,
          payDispatch:   60,
          payCompletion: 10,
          validityDays:  30,
          terms:         '',
          exclusions:    '',
        },
        customer: {
          name:    '',
          company: '',
          address: '',
          phone:   '',
          email:   '',
        },
        meta: {
          propDate:    new Date().toISOString().slice(0, 10),
          expiryDate:  null,
          template:    'residential-premium',
          sentAt:      null,
          firstViewAt: null,
          lastViewAt:  null,
          viewCount:   0,
          acceptedAt:  null,
        },
        ...data,
        createdAt: _now(),
        updatedAt: _now(),
      };
      proposals.push(proposal);
      _write(KEYS.PROPOSALS, proposals);
      return proposal;
    }
  }
  function updateProposalStatus(id, status) {
    const proposal = getProposal(id);
    if (!proposal) throw new Error(`Proposal ${id} not found`);
    const update = { id, status };
    if (status === 'sent'     && !proposal.meta.sentAt)     update.meta = { ...proposal.meta, sentAt: _now() };
    if (status === 'accepted' && !proposal.meta.acceptedAt) update.meta = { ...proposal.meta, acceptedAt: _now() };
    return saveProposal(update);
  }
  function recordProposalView(id) {
    const proposal = getProposal(id);
    if (!proposal) return;
    const now = _now();
    saveProposal({
      id,
      status: proposal.status === 'sent' ? 'viewed' : proposal.status,
      meta: {
        ...proposal.meta,
        firstViewAt: proposal.meta.firstViewAt || now,
        lastViewAt:  now,
        viewCount:   (proposal.meta.viewCount || 0) + 1,
      }
    });
  }
  function deleteProposal(id) {
    const proposals = getProposals().filter(p => p.id !== id);
    _write(KEYS.PROPOSALS, proposals);
  }

  /* ── Dashboard stats ── */
  function getDashboardStats() {
    const proposals = getProposals();
    const customers = getCustomers();
    const totalKwp = proposals
      .filter(p => ['accepted','viewed','sent','negotiation'].includes(p.status))
      .reduce((sum, p) => sum + (p.system?.capacity || 0), 0);

    return {
      totalCustomers:   customers.length,
      activeProposals:  proposals.filter(p => ['draft','sent','viewed','negotiation'].includes(p.status)).length,
      proposalsSent:    proposals.filter(p => p.status !== 'draft' && p.status !== 'archived').length,
      proposalsViewed:  proposals.filter(p => ['viewed','negotiation','accepted'].includes(p.status)).length,
      proposalsAccepted:proposals.filter(p => p.status === 'accepted').length,
      totalKwpProposed: totalKwp,
      recentProposals:  [...proposals]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 8),
    };
  }

  /* ── Export / Import (backup) ── */
  function exportAll() {
    const data = {
      version:   1,
      exportedAt: _now(),
      customers: getCustomers(),
      proposals: getProposals(),
      sequence:  _read(KEYS.SEQUENCE),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KTM_Solar_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    _write(KEYS.LAST_BACKUP, _now());
  }
  function importAll(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.version !== 1) throw new Error('Unsupported backup version');
    if (data.customers) _write(KEYS.CUSTOMERS, data.customers);
    if (data.proposals) _write(KEYS.PROPOSALS, data.proposals);
    if (data.sequence)  _write(KEYS.SEQUENCE,  data.sequence);
    return { customers: data.customers?.length, proposals: data.proposals?.length };
  }

  /* ── Seed demo data (first launch only) ── */
  function seedIfEmpty() {
    if (getCustomers().length > 0) return; // already seeded

    const demoCustomer = saveCustomer({
      name:    'Bhooshan Waghmare',
      company: 'Waghmare Residence',
      phone:   '+91 98765 43210',
      email:   'bhooshan@example.com',
      address: 'Flat 4B, Bramha Heights, NIBM Road',
      city:    'Pune',
      type:    'residential',
      notes:   'Demo customer — replace with real data.',
    });

    saveProposal({
      customerId: demoCustomer.id,
      title: '[SAMPLE DEMO] 7 kWp Rooftop Solar — Bhooshan Waghmare',
      isDemo: true,
      status: 'draft',
      notes: 'Sample demonstration proposal. Replace with verified project data.',
      system: {
        capacity:     7, // Demo capacity (not a universal verified default)
        genFactor:    1400, // Planning assumption (~3.84 kWh/kWp/day)
        moduleId:     'waaree-ws-580',
        inverterId:   'sungrow-sg7k',
        mountMake:    'Mahindra Susten',
        cableMake:    'Polycab',
        moduleCount:  13,
        stringConfig: '13S × 1P',
        areaRequired: 42,
        dcacRatio:    1.06,
      },
      financial: {
        costPerKwp:    48000,
        gstPercent:    18,
        projectCost:   336000,
        gstAmount:     60480,
        totalCost:     396480,
        subsidy:       78000,
        netInvestment: 318480,
        tariff:        8.5,
        escalation:    0.03,
        degradation:   0.005,
        annualGen:     9800,
        annualSaving:  83300,
        lifetimeSaving:2490000,
        payback:       3.8,
        irr:           27,
      },
      commercial: {
        payAdvance:    30,
        payDispatch:   60,
        payCompletion: 10,
        validityDays:  30,
      },
      customer: {
        name:    demoCustomer.name,
        company: demoCustomer.company,
        address: demoCustomer.address,
        phone:   demoCustomer.phone,
        email:   demoCustomer.email,
      },
    });
  }

  return {
    getCustomers, getCustomer, saveCustomer, deleteCustomer,
    getProposals, getProposal, getProposalsForCustomer, saveProposal,
    updateProposalStatus, recordProposalView, deleteProposal,
    getDashboardStats,
    exportAll, importAll, seedIfEmpty,
  };
})();
