-- VALTEC — operação delegável por ordem de serviço
-- Campos aditivos e compatíveis com o fluxo atual. Aplicar antes de ativar a interface da etapa 2.

alter table public.service_orders
  add column if not exists equipment_brand text,
  add column if not exists equipment_model text,
  add column if not exists assigned_technician text,
  add column if not exists service_type text not null default 'corretiva',
  add column if not exists priority text not null default 'normal',
  add column if not exists started_at timestamptz,
  add column if not exists technician_minutes integer,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists parts_cost numeric(12,2) not null default 0,
  add column if not exists consumables_cost numeric(12,2) not null default 0,
  add column if not exists travel_cost numeric(12,2) not null default 0,
  add column if not exists payment_fee numeric(12,2) not null default 0,
  add column if not exists warranty_rework_cost numeric(12,2) not null default 0,
  add column if not exists other_variable_cost numeric(12,2) not null default 0,
  add column if not exists amount_received numeric(12,2) not null default 0,
  add column if not exists payment_due_at timestamptz,
  add column if not exists payment_received_at timestamptz,
  add column if not exists pending_reason text,
  add column if not exists return_required boolean not null default false,
  add column if not exists return_scheduled_for timestamptz,
  add column if not exists founder_executed boolean,
  add column if not exists completion_notes text;

create index if not exists service_orders_assigned_technician_idx
  on public.service_orders(assigned_technician)
  where assigned_technician is not null;

create index if not exists service_orders_return_scheduled_idx
  on public.service_orders(return_scheduled_for)
  where return_required = true and return_scheduled_for is not null;

create index if not exists service_orders_payment_due_idx
  on public.service_orders(payment_due_at)
  where payment_due_at is not null;

comment on column public.service_orders.assigned_technician is 'Responsável pela execução física do atendimento.';
comment on column public.service_orders.service_type is 'Tipo operacional: corretiva, preventiva, instalação, diagnóstico ou garantia.';
comment on column public.service_orders.technician_minutes is 'Tempo técnico total dedicado à OS, em minutos.';
comment on column public.service_orders.discount_amount is 'Desconto concedido sobre o valor bruto da OS.';
comment on column public.service_orders.parts_cost is 'Custo real das peças utilizadas na OS.';
comment on column public.service_orders.consumables_cost is 'Material de consumo diretamente atribuído à OS.';
comment on column public.service_orders.travel_cost is 'Custo variável estimado/real de deslocamento desta OS.';
comment on column public.service_orders.payment_fee is 'Taxa de cartão, gateway ou outro meio de pagamento atribuída à OS.';
comment on column public.service_orders.warranty_rework_cost is 'Custo de retrabalho ou garantia diretamente atribuído à OS.';
comment on column public.service_orders.other_variable_cost is 'Outros custos variáveis diretamente atribuíveis à OS.';
comment on column public.service_orders.amount_received is 'Valor efetivamente recebido do cliente referente à OS.';
comment on column public.service_orders.payment_due_at is 'Data limite combinada para recebimento da OS quando houver saldo pendente.';
comment on column public.service_orders.founder_executed is 'Indica se o fundador precisou executar fisicamente o serviço; base do indicador de delegação.';
comment on column public.service_orders.pending_reason is 'Pendência que impede encerramento normal da OS.';
comment on column public.service_orders.return_required is 'Indica necessidade de retorno técnico ao cliente.';
