// Dashboard: composição dos custos fixos sempre recolhida.
if (typeof renderDashboard === 'function') {
  const _zielRenderDashboardFixedCollapsed = renderDashboard;

  renderDashboard = function(){
    _zielRenderDashboardFixedCollapsed();

    const heads = [...document.querySelectorAll('.section-head')];
    const head = heads.find(h => (h.textContent || '').includes('Composição dos custos fixos'));
    if (!head) return;

    const wrapper = head.parentElement;
    const list = wrapper?.querySelector('.wallet-list');
    if (!wrapper || !list) return;

    const recurring = (state.recurring_payables || []).filter(r =>
      r.active !== false &&
      (!state.businessFilter || r.business_id === state.businessFilter)
    );
    const total = recurring.reduce((sum,r)=>sum+Number(r.amount||0),0);

    list.style.display = 'none';

    let toggle = wrapper.querySelector('#dashboardFixedToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'dashboardFixedToggle';
      toggle.type = 'button';
      toggle.className = 'btn btn-soft';
      head.appendChild(toggle);
    }

    const closedLabel = () => {
      toggle.textContent = `Exibir custos (${recurring.length} · ${fmt(total)}/mês) ▼`;
      toggle.setAttribute('aria-expanded','false');
    };

    closedLabel();

    toggle.onclick = () => {
      const opening = list.style.display === 'none';
      list.style.display = opening ? '' : 'none';
      toggle.textContent = opening
        ? 'Ocultar custos ▲'
        : `Exibir custos (${recurring.length} · ${fmt(total)}/mês) ▼`;
      toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    };
  };
}
