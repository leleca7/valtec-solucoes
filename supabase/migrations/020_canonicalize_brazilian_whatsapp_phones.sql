-- Canonicaliza celulares brasileiros para que site e WhatsApp usem o mesmo telefone.

create or replace function public.valtec_normalize_phone_text(value text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(value, ''), '\\D', '', 'g') as digits
  )
  select case
    when digits = '' then ''
    when digits ~ '^55[0-9]{2}[6-9][0-9]{7}$'
      then substring(digits from 1 for 4) || '9' || substring(digits from 5)
    when digits ~ '^[0-9]{2}[6-9][0-9]{7}$'
      then '55' || substring(digits from 1 for 2) || '9' || substring(digits from 3)
    when digits like '55%' then digits
    when length(digits) in (10, 11) then '55' || digits
    else digits
  end
  from cleaned;
$$;

update public.leads set phone = phone where phone is not null;
update public.clients set phone = phone where phone is not null;

update public.whatsapp_threads
set phone = public.valtec_normalize_phone_text(phone),
    updated_at = now()
where phone <> public.valtec_normalize_phone_text(phone);
