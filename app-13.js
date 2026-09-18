// Ajuste de nomenclatura: o campo da conta usa "Favorecido",
// enquanto a categoria "Fornecedores" permanece intacta.

// Recria o formulário sem substituição global de texto, evitando
// transformar a categoria "Fornecedores" em "Favorecidoes".
accountForm = function(kind){
  const pay=kind==='pay';
  return `<form id="accountForm" class="form-grid">
    <div class="field"><label>Empresa</label><select id="aBiz" required>${businessOptions(false,state.businessFilter)}</select></div>
    <div class="field"><label>${pay?'Favorecido':'Cliente / Origem'}</label><input class="input" id="aParty" required></div>
    <div class="field"><label>Categoria</label><select id="aCat" required>${categoryOptions(pay?'Saída':'Entrada')}</select></div>
    <div class="field"><label>Valor</label><input class="input" id="aAmount" type="number" step="0.01" min="0" required></div>
    <div class="field span-2"><label>Descrição</label><input class="input" id="aDesc" required></div>
    <div class="field"><label>Emissão</label><input class="input" id="aIssue" type="date" value="${iso()}" required></div>
    <div class="field"><label>Vencimento</label><input class="input" id="aDue" type="date" value="${iso()}" required></div>
    <div class="field"><label>Documento</label><input class="input" id="aDoc"></div>
    <div class="actions span-2"><button class="btn btn-primary">Salvar</button></div>
  </form>`;
};

function zielRelabelFavorecidoFinal(){
  document.querySelectorAll('#modalRoot label').forEach(label=>{
    if(label.textContent.trim()==='Fornecedor') label.textContent='Favorecido';
  });
}

if (typeof openRecurringPayable === 'function') {
  const _zielOpenRecurringFavFinal = openRecurringPayable;
  openRecurringPayable = function(){ _zielOpenRecurringFavFinal(); zielRelabelFavorecidoFinal(); };
}
if (typeof openEditRecurringPayable === 'function') {
  const _zielOpenEditRecurringFavFinal = openEditRecurringPayable;
  openEditRecurringPayable = function(id){ _zielOpenEditRecurringFavFinal(id); zielRelabelFavorecidoFinal(); };
}
if (typeof openInstallmentPayables === 'function') {
  const _zielOpenInstallmentFavFinal = openInstallmentPayables;
  openInstallmentPayables = function(){ _zielOpenInstallmentFavFinal(); zielRelabelFavorecidoFinal(); };
}
