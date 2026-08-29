// Compatibilidade entre valores legados do HTML administrativo e o schema real.
// Executa antes de admin-central.js para impedir que a UI envie status inválidos.

const mappings = [
  { select: 'quote-status', from: 'vencido', to: 'cancelado', label: 'Cancelado' },
  { select: 'order-status', from: 'em_andamento', to: 'em_execucao', label: 'Em execução' },
  { select: 'order-filter', from: 'em_andamento', to: 'em_execucao', label: 'Em execução' },
];

for (const mapping of mappings) {
  const select = document.getElementById(mapping.select);
  if (!select) continue;
  const option = [...select.options].find((item) => item.value === mapping.from);
  if (!option) continue;
  option.value = mapping.to;
  option.textContent = mapping.label;
}
