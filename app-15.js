// Contas fixas recorrentes: iniciar sempre recolhidas na tela de Contas a Pagar.
if (typeof renderPayables === 'function') {
  const _zielRenderPayablesCollapsed = renderPayables;
  renderPayables = function(){
    _zielRenderPayablesCollapsed();

    const fixedList = document.getElementById('fixedList');
    if (!fixedList) return;

    const card = fixedList.closest('.card');
    const head = card?.querySelector('.section-head');
    if (!card || !head) return;

    const fixed = filtered(state.recurring_payables || []);
    const active = fixed.filter(r => r.active !== false);
    const total = active.reduce((sum,r)=>sum+Number(r.amount||0),0);

    fixedList.style.display = 'none';

    let toggle = document.getElementById('fixedToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'fixedToggle';
      toggle.type = 'button';
      toggle.className = 'btn btn-soft';
      head.appendChild(toggle);
    }

    const setClosedLabel = ()=>{
      toggle.textContent = `Exibir contas (${active.length} · ${fmt(total)}/mês) ▼`;
      toggle.setAttribute('aria-expanded','false');
    };

    setClosedLabel();

    toggle.onclick = ()=>{
      const opening = fixedList.style.display === 'none';
      fixedList.style.display = opening ? '' : 'none';
      toggle.textContent = opening ? 'Ocultar contas ▲' : `Exibir contas (${active.length} · ${fmt(total)}/mês) ▼`;
      toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    };
  };
}
