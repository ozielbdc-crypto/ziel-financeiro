// Restaura a nomenclatura Fornecedor na interface de contas a pagar.
if (typeof accountForm === 'function') {
  const _zielAccountFormFornecedor = accountForm;
  accountForm = function(kind){
    return _zielAccountFormFornecedor(kind).replace(/Favorecido/g,'Fornecedor');
  };
}

function zielRelabelFornecedor(){
  document.querySelectorAll('#modalRoot label').forEach(label=>{
    if(label.textContent.trim()==='Favorecido') label.textContent='Fornecedor';
  });
}

if (typeof openRecurringPayable === 'function') {
  const _zielOpenRecurringFornecedor = openRecurringPayable;
  openRecurringPayable = function(){ _zielOpenRecurringFornecedor(); zielRelabelFornecedor(); };
}
if (typeof openEditRecurringPayable === 'function') {
  const _zielOpenEditRecurringFornecedor = openEditRecurringPayable;
  openEditRecurringPayable = function(id){ _zielOpenEditRecurringFornecedor(id); zielRelabelFornecedor(); };
}
if (typeof openInstallmentPayables === 'function') {
  const _zielOpenInstallmentFornecedor = openInstallmentPayables;
  openInstallmentPayables = function(){ _zielOpenInstallmentFornecedor(); zielRelabelFornecedor(); };
}

if (typeof payableTable === 'function') {
  const _zielPayableTableFornecedor = payableTable;
  payableTable = function(arr,actions=true){
    return _zielPayableTableFornecedor(arr,actions).replace(/Favorecido/g,'Fornecedor');
  };
}
