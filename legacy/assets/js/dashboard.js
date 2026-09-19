/* ==========================================================================
   KTM Solar Platform — Dashboard Logic
   ========================================================================== */
'use strict';

(function () {

  /* ── Toast helper ── */
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  /* ── Relative time ── */
  function relativeTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)   return 'Just now';
    if (mins  < 60)  return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days  < 7)   return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  /* ── Render KPI cards ── */
  function renderKPIs(stats) {
    document.getElementById('kpi-active').textContent    = stats.activeProposals;
    document.getElementById('kpi-sent').textContent      = stats.proposalsSent;
    document.getElementById('kpi-viewed').textContent    = stats.proposalsViewed;
    document.getElementById('kpi-accepted').textContent  = stats.proposalsAccepted;
    document.getElementById('kpi-customers').textContent = stats.totalCustomers;
    document.getElementById('kpi-kwp').textContent       =
      stats.totalKwpProposed > 0
        ? stats.totalKwpProposed.toFixed(1) + ' kWp'
        : '— kWp';
  }

  /* ── Render funnel ── */
  function renderFunnel(proposals) {
    const statuses = ['draft', 'sent', 'viewed', 'negotiation', 'accepted'];
    const labels   = ['Draft', 'Sent', 'Viewed', 'Negotiation', 'Accepted'];
    const colors   = ['var(--clr-draft)', 'var(--clr-sent)', 'var(--clr-viewed)', 'var(--clr-negotiation)', 'var(--clr-accepted)'];
    const counts   = statuses.map(s => proposals.filter(p => p.status === s).length);
    const row = document.getElementById('funnelRow');
    row.innerHTML = statuses.map((s, i) => `
      <div class="funnel-step">
        <div class="funnel-count" style="color:${colors[i]}">${counts[i]}</div>
        <div class="funnel-label">${labels[i]}</div>
      </div>
    `).join('');
  }

  /* ── Render proposals table ── */
  function renderProposals(proposals) {
    const tbody = document.getElementById('proposalsBody');
    const empty = document.getElementById('emptyProposals');
    const table = document.getElementById('recentProposals');

    if (!proposals.length) {
      table.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    table.classList.remove('hidden');
    empty.classList.add('hidden');

    tbody.innerHTML = proposals.map(p => {
      const badgeClass = `badge badge-${p.status}`;
      const capacity = p.system?.capacity ? `${p.system.capacity} kWp` : '—';
      return `
        <tr>
          <td><div class="proposal-ref">${p.ref || p.id}</div></td>
          <td>
            <div class="proposal-customer-name">${escHtml(p.customer?.name || '—')}</div>
            <div class="proposal-customer-company">${escHtml(p.customer?.company || '')}</div>
          </td>
          <td>${capacity}</td>
          <td><span class="${badgeClass}">${p.status}</span></td>
          <td><div class="proposal-date">${relativeTime(p.updatedAt)}</div></td>
          <td>
            <div class="proposal-actions">
              <a href="proposal.html?id=${encodeURIComponent(p.id)}" class="btn btn-ghost btn-sm" title="View customer proposal">👁️ Preview</a>
              <a href="builder.html?id=${encodeURIComponent(p.id)}" class="btn btn-secondary btn-sm" title="Edit in builder">✏️ Edit</a>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Wire export/import ── */
  function wireActions() {
    document.getElementById('exportBtn').addEventListener('click', () => {
      Store.exportAll();
      showToast('Backup downloaded.', 'success');
    });
    document.getElementById('qa-export').addEventListener('click', () => {
      Store.exportAll();
      showToast('Backup downloaded.', 'success');
    });
    document.getElementById('importFile').addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        try {
          const result = Store.importAll(ev.target.result);
          showToast(`Imported ${result.customers} customers, ${result.proposals} proposals.`, 'success');
          renderDashboard();
        } catch (err) {
          showToast('Import failed: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  /* ── Set date ── */
  function setDate() {
    const el = document.getElementById('dashDate');
    const now = new Date();
    const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    el.textContent = now.toLocaleDateString('en-IN', opts);
  }

  /* ── Main render ── */
  function renderDashboard() {
    const stats = Store.getDashboardStats();
    renderKPIs(stats);
    renderFunnel(Store.getProposals());
    renderProposals(stats.recentProposals);
  }

  /* ── Init ── */
  Store.seedIfEmpty();
  setDate();
  renderDashboard();
  wireActions();

})();
