// Impede que a roda do mouse altere valores de campos numéricos.
// Ao rolar sobre um campo numérico focado, remove o foco antes da ação nativa;
// assim a página continua rolando e o valor permanece inalterado.
document.addEventListener('wheel',function(e){
  const el=e.target instanceof Element?e.target.closest('input[type="number"]'):null;
  if(!el)return;
  if(document.activeElement===el){
    el.blur();
  }
},{capture:true,passive:true});
