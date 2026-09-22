-- VALTEC — hardening/performance do módulo WhatsApp + evidências

create index if not exists whatsapp_threads_client_idx
  on public.whatsapp_threads(client_id)
  where client_id is not null;

create index if not exists whatsapp_jobs_lead_idx
  on public.whatsapp_automation_jobs(lead_id)
  where lead_id is not null;

create index if not exists service_evidence_sessions_client_idx
  on public.service_evidence_sessions(client_id)
  where client_id is not null;

create index if not exists service_evidence_sessions_thread_idx
  on public.service_evidence_sessions(whatsapp_thread_id)
  where whatsapp_thread_id is not null;

create index if not exists staff_whatsapp_states_session_idx
  on public.staff_whatsapp_states(session_id)
  where session_id is not null;

create index if not exists staff_whatsapp_states_lead_idx
  on public.staff_whatsapp_states(lead_id)
  where lead_id is not null;

create index if not exists staff_whatsapp_states_client_idx
  on public.staff_whatsapp_states(client_id)
  where client_id is not null;

create index if not exists staff_whatsapp_states_order_idx
  on public.staff_whatsapp_states(service_order_id)
  where service_order_id is not null;

drop policy if exists "deny client access to staff whatsapp states" on public.staff_whatsapp_states;
create policy "deny client access to staff whatsapp states"
on public.staff_whatsapp_states
for all
to anon, authenticated
using (false)
with check (false);

update storage.buckets
set allowed_mime_types = array[
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf'
]::text[]
where id = 'lead-media';
