/* ==========================================================================
   KTM Solar Platform — Customers Page Logic
   ========================================================================== */
'use strict';

(function () {
  let allCustomers = [];
  let activeCustomerId = null;

  /* ── Toast ── */
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Initials from name ── */
  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  /* ── Relative date ── */
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ── Render customer grid ── */
  function renderGrid(customers) {
    const grid  = document.getElementById('customersGrid');
    const empty = document.getElementById('emptyCustomers');
    if (!customers.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    grid.innerHTML = customers.map(c => {
      const proposals = Store.getProposalsForCustomer(c.id);
      const typeLabel = c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : '';
      return `
        <div class="customer-card animate-fade-in-up" data-id="${escHtml(c.id)}" role="button" tabindex="0" aria-label="View ${escHtml(c.name)}">
          <div class="customer-card-header">
            <div class="customer-avatar">${getInitials(c.name)}</div>
            <span class="badge badge-${c.type || 'draft'}">${typeLabel}</span>
          </div>
          <div class="customer-name">${escHtml(c.name)}</div>
          ${c.company ? `<div class="customer-company">${escHtml(c.company)}</div>` : ''}
          <div class="customer-meta">
            ${c.phone   ? `<div class="customer-meta-item"><span>📞</span><span>${escHtml(c.phone)}</span></div>` : ''}
            ${c.email   ? `<div class="customer-meta-item"><span>✉️</span><span>${escHtml(c.email)}</span></div>` : ''}
            ${c.city    ? `<div class="customer-meta-item"><span>📍</span><span>${escHtml(c.city)}</span></div>` : ''}
          </div>
          <div class="customer-footer">
            <div class="customer-prop-count">
              <strong>${proposals.length}</strong> proposal${proposals.length !== 1 ? 's' : ''}
            </div>
            <div class="text-muted text-xs">${fmtDate(c.createdAt)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Click handlers
    grid.querySelectorAll('.customer-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openDetail(card.dataset.id); });
    });
  }

  /* ── Filter/search ── */
  function applyFilters() {
    const q    = document.getElementById('customerSearch').value.toLowerCase();
    const type = document.getElementById('customerTypeFilter').value;
    const filtered = allCustomers.filter(c => {
      const matchQ = !q || c.name?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) || c.phone?.includes(q);
      const matchType = !type || c.type === type;
      return matchQ && matchType;
    });
    renderGrid(filtered);
  }

  /* ── Open / close modal ── */
  function openModal(customer = null) {
    const modal = document.getElementById('customerModal');
    document.getElementById('modalTitle').textContent = customer ? 'Edit Customer' : 'New Customer';
    document.getElementById('custId').value      = customer?.id || '';
    document.getElementById('custName').value    = customer?.name || '';
    document.getElementById('custCompany').value = customer?.company || '';
    document.getElementById('custPhone').value   = customer?.phone || '';
    document.getElementById('custEmail').value   = customer?.email || '';
    document.getElementById('custAddress').value = customer?.address || '';
    document.getElementById('custCity').value    = customer?.city || '';
    document.getElementById('custType').value    = customer?.type || 'residential';
    document.getElementById('custGST').value     = customer?.gstNumber || '';
    document.getElementById('custNotes').value   = customer?.notes || '';
    modal.classList.remove('hidden');
    document.getElementById('custName').focus();
  }
  function closeModal() {
    document.getElementById('customerModal').classList.add('hidden');
  }

  /* ── Save customer ── */
  function saveCustomer() {
    const name  = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    if (!name)  { showToast('Name is required.', 'error'); return; }
    if (!phone) { showToast('Phone is required.', 'error'); return; }

    const id = document.getElementById('custId').value;
    Store.saveCustomer({
      id:        id || undefined,
      name,
      company:   document.getElementById('custCompany').value.trim(),
      phone,
      email:     document.getElementById('custEmail').value.trim(),
      address:   document.getElementById('custAddress').value.trim(),
      city:      document.getElementById('custCity').value.trim(),
      type:      document.getElementById('custType').value,
      gstNumber: document.getElementById('custGST').value.trim(),
      notes:     document.getElementById('custNotes').value.trim(),
    });
    showToast(id ? 'Customer updated.' : 'Customer added.', 'success');
    closeModal();
    refresh();
    if (activeCustomerId) openDetail(activeCustomerId);
  }

  /* ── Detail panel ── */
  function openDetail(customerId) {
    const c = Store.getCustomer(customerId);
    if (!c) return;
    activeCustomerId = customerId;
    const proposals = Store.getProposalsForCustomer(customerId);

    document.getElementById('detailName').textContent    = c.name;
    document.getElementById('detailCompany').textContent = c.company || '';
    document.getElementById('detailPhone').textContent   = c.phone   || '—';
    document.getElementById('detailEmail').textContent   = c.email   || '—';
    document.getElementById('detailCity').textContent    = c.city    || '—';
    document.getElementById('detailType').textContent    = c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : '—';
    document.getElementById('detailType').className      = `badge badge-${c.type || 'draft'}`;

    document.getElementById('detailEditBtn').onclick = () => { closeDetail(); openModal(c); };
    document.getElementById('detailNewProposalBtn').onclick = () => {
      window.location.href = `builder.html?customerId=${encodeURIComponent(c.id)}`;
    };

    const propContainer = document.getElementById('detailProposals');
    if (!proposals.length) {
      propContainer.innerHTML = `<div class="text-muted text-sm">No proposals yet. <a href="builder.html?customerId=${encodeURIComponent(c.id)}" class="text-solar">Create one →</a></div>`;
    } else {
      propContainer.innerHTML = proposals
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .map(p => `
          <div class="detail-proposal-item">
            <div style="flex:1;">
              <div class="detail-prop-ref">${escHtml(p.ref || p.id)}</div>
              <div class="detail-prop-title">${escHtml(p.title || `${p.system?.capacity || '?'} kWp Proposal`)}</div>
              <div class="detail-prop-date">${fmtDate(p.updatedAt)}</div>
            </div>
            <span class="badge badge-${p.status}">${p.status}</span>
            <a href="proposal.html?id=${encodeURIComponent(p.id)}" class="btn btn-ghost btn-sm" title="Preview proposal">👁️</a>
          </div>
        `).join('');
    }

    document.getElementById('detailOverlay').classList.remove('hidden');
  }

  function closeDetail() {
    activeCustomerId = null;
    document.getElementById('detailOverlay').classList.add('hidden');
  }

  /* ── Refresh ── */
  function refresh() {
    allCustomers = Store.getCustomers().sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    applyFilters();
  }

  /* ── Event wiring ── */
  document.getElementById('newCustomerBtn').addEventListener('click', () => openModal());
  document.getElementById('emptyNewBtn').addEventListener('click',    () => openModal());
  document.getElementById('modalClose').addEventListener('click',     closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalSaveBtn').addEventListener('click',   saveCustomer);
  document.getElementById('detailClose').addEventListener('click',    closeDetail);
  document.getElementById('detailOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('detailOverlay')) closeDetail();
  });
  document.getElementById('customerModal').addEventListener('click', e => {
    if (e.target === document.getElementById('customerModal')) closeModal();
  });
  document.getElementById('customerSearch').addEventListener('input', applyFilters);
  document.getElementById('customerTypeFilter').addEventListener('change', applyFilters);

  /* Keyboard: Esc closes modals */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeDetail(); }
  });

  /* ── Init ── */
  Store.seedIfEmpty();
  refresh();

})();
