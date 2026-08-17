-- Índices para relacionamentos usados no painel e histórico.
create index if not exists service_orders_client_id_idx on public.service_orders(client_id);
create index if not exists service_orders_lead_id_idx on public.service_orders(lead_id);
create index if not exists quotes_client_id_idx on public.quotes(client_id);
create index if not exists quotes_lead_id_idx on public.quotes(lead_id);
create index if not exists quotes_service_order_id_idx on public.quotes(service_order_id);
