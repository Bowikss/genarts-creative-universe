-- Genarts 0001 — operations layer on top of 0000_genarts_core.
-- Adds: manager role, station-scoped access for employees, overlap-proof bookings,
-- estimates, delays, extra-work requests, customer messages, internal notifications,
-- settings (TV display key, which steps notify the customer), vehicle history.
-- Safe to run once on a database that already has 0000 applied.

create extension if not exists btree_gist with schema extensions;

-- New enum value. It is never cast inside this migration (role::text is used instead),
-- so it is safe in the same transaction.
alter type public.app_role add value if not exists 'manager';

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.is_manager(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role::text in ('admin','manager'))
$$;

create or replace function public.employee_station_ids(_user_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select station_id from public.station_employees where user_id = _user_id
$$;

create or replace function public.can_access_appointment(_user_id uuid, _appointment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager(_user_id) or exists (
    select 1 from public.appointments a
    where a.id = _appointment_id
      and public.is_staff(_user_id)
      and (a.assigned_employee = _user_id
           or a.station_id in (select station_id from public.station_employees where user_id = _user_id))
  )
$$;

-- New sign-ups no longer become employees automatically: the first account is the admin,
-- everyone after waits until an admin gives them a role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;

-- ───────────────────────── settings ─────────────────────────
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Genarts',
  display_key text not null default encode(extensions.gen_random_bytes(16),'hex'),
  notify_steps public.appt_status[] not null default '{confirmed,arrived,washing,ready,picked_up}',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ───────────────────────── appointments: new columns ─────────────────────────
alter table public.appointments
  add column if not exists customer_note text not null default '',
  add column if not exists extra_price numeric(10,2) not null default 0,
  add column if not exists extra_minutes int not null default 0,
  add column if not exists delay_minutes int not null default 0,
  add column if not exists delay_reason text not null default '',
  add column if not exists station_locked boolean not null default false,
  add column if not exists ready_at timestamptz,
  add column if not exists estimated_end timestamptz,
  add column if not exists busy_until timestamptz;

update public.appointments set busy_until = ends_at where busy_until is null;
update public.appointments a set estimated_end = coalesce(a.started_at, a.starts_at) + make_interval(mins => s.duration_min)
  from public.services s where s.id = a.service_id and a.estimated_end is null;
alter table public.appointments alter column busy_until set not null;

create index if not exists appointments_reg_idx on public.appointments (upper(replace(reg_number,' ','')));
create index if not exists appointments_station_idx on public.appointments (station_id, starts_at);

-- A station can never hold two overlapping live bookings. Enforced by the database,
-- so two people booking the same slot at once cannot both win.
-- busy_until = ends_at, or the pickup time if the car left early (frees the rest of the slot).
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (station_id with =, tstzrange(starts_at, busy_until, '[)') with &&)
  where (status <> 'cancelled' and station_id is not null);

-- ───────────────────────── new tables ─────────────────────────
create table if not exists public.appointment_delays (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  minutes int not null check (minutes between 1 and 600),
  reason text not null check (length(trim(reason)) > 0),
  reported_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.extra_work (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  details text not null default '',
  price numeric(10,2) not null default 0 check (price >= 0),
  minutes int not null default 0 check (minutes between 0 and 600),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid default auth.uid(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now()
);

-- What the customer is told. Shown on the tracking page; an SMS/e-mail sender can
-- pick up rows where sent_at is null.
create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  kind text not null,
  step public.appt_status,
  body text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Internal operational notifications for staff.
create table if not exists public.ops_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text not null default '',
  appointment_id uuid references public.appointments(id) on delete cascade,
  station_id uuid references public.stations(id) on delete cascade,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists ops_notifications_created_idx on public.ops_notifications (created_at desc);

-- ───────────────────────── grants ─────────────────────────
revoke all on public.settings, public.appointment_delays, public.extra_work, public.customer_messages, public.ops_notifications from anon;
grant select, update on public.settings to authenticated;
grant select, insert on public.appointment_delays to authenticated;
grant select, insert, update on public.extra_work to authenticated;
grant select on public.customer_messages, public.ops_notifications to authenticated;
grant all on public.settings, public.appointment_delays, public.extra_work, public.customer_messages, public.ops_notifications to service_role;
grant insert, update, delete on public.appointment_notes, public.appointment_photos to authenticated;

alter table public.settings enable row level security;
alter table public.appointment_delays enable row level security;
alter table public.extra_work enable row level security;
alter table public.customer_messages enable row level security;
alter table public.ops_notifications enable row level security;

-- ───────────────────────── policies ─────────────────────────
-- Roles: admins & managers see everything. Employees see only stations they are assigned to.
drop policy if exists "read own or admin roles" on public.user_roles;
create policy "read own or manager roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager(auth.uid()));

-- Managers run the day: maintenance windows and who works which station.
drop policy if exists "admin write" on public.station_unavailability;
create policy "manager write" on public.station_unavailability for all to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));
drop policy if exists "admin write" on public.station_employees;
create policy "manager write" on public.station_employees for all to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

drop policy if exists "staff read" on public.appointments;
drop policy if exists "staff update" on public.appointments;
drop policy if exists "admin insert" on public.appointments;
drop policy if exists "admin delete" on public.appointments;
create policy "scoped read" on public.appointments for select to authenticated using (
  public.is_manager(auth.uid()) or (public.is_staff(auth.uid()) and (
    assigned_employee = auth.uid() or station_id in (select public.employee_station_ids(auth.uid())))));
create policy "scoped update" on public.appointments for update to authenticated using (
  public.is_manager(auth.uid()) or (public.is_staff(auth.uid()) and (
    assigned_employee = auth.uid() or station_id in (select public.employee_station_ids(auth.uid())))))
  with check (public.is_staff(auth.uid()));
create policy "manager insert" on public.appointments for insert to authenticated with check (public.is_manager(auth.uid()));
create policy "manager delete" on public.appointments for delete to authenticated using (public.is_manager(auth.uid()));

drop policy if exists "staff read" on public.appointment_events;
create policy "scoped read" on public.appointment_events for select to authenticated
  using (public.can_access_appointment(auth.uid(), appointment_id));

drop policy if exists "staff read" on public.appointment_notes;
drop policy if exists "staff add" on public.appointment_notes;
create policy "scoped read" on public.appointment_notes for select to authenticated
  using (public.can_access_appointment(auth.uid(), appointment_id));
create policy "scoped add" on public.appointment_notes for insert to authenticated
  with check (author = auth.uid() and public.can_access_appointment(auth.uid(), appointment_id));
create policy "own or manager delete" on public.appointment_notes for delete to authenticated
  using (author = auth.uid() or public.is_manager(auth.uid()));

drop policy if exists "staff read" on public.appointment_photos;
drop policy if exists "staff add" on public.appointment_photos;
create policy "scoped read" on public.appointment_photos for select to authenticated
  using (public.can_access_appointment(auth.uid(), appointment_id));
create policy "scoped add" on public.appointment_photos for insert to authenticated
  with check (author = auth.uid() and public.can_access_appointment(auth.uid(), appointment_id));
create policy "own or manager delete" on public.appointment_photos for delete to authenticated
  using (author = auth.uid() or public.is_manager(auth.uid()));

create policy "manager read" on public.settings for select to authenticated using (public.is_manager(auth.uid()));
create policy "admin update" on public.settings for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "scoped read" on public.appointment_delays for select to authenticated
  using (public.can_access_appointment(auth.uid(), appointment_id));
create policy "scoped add" on public.appointment_delays for insert to authenticated
  with check (reported_by = auth.uid() and public.can_access_appointment(auth.uid(), appointment_id));

create policy "scoped read" on public.extra_work for select to authenticated
  using (public.can_access_appointment(auth.uid(), appointment_id));
create policy "scoped request" on public.extra_work for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending' and public.can_access_appointment(auth.uid(), appointment_id));
create policy "manager decide" on public.extra_work for update to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

create policy "scoped read" on public.customer_messages for select to authenticated
  using (public.can_access_appointment(auth.uid(), appointment_id));

create policy "scoped read" on public.ops_notifications for select to authenticated using (
  public.is_manager(auth.uid())
  or (public.is_staff(auth.uid()) and station_id in (select public.employee_station_ids(auth.uid()))));

-- Photos: only people who can see the appointment (path = <appointment_id>/<file>).
insert into storage.buckets (id, name, public) values ('vehicle-photos','vehicle-photos', false) on conflict (id) do nothing;
drop policy if exists "staff read photos" on storage.objects;
create policy "staff read photos" on storage.objects for select to authenticated using (
  bucket_id = 'vehicle-photos' and public.is_staff(auth.uid())
  and public.can_access_appointment(auth.uid(), nullif(split_part(name,'/',1),'')::uuid));
drop policy if exists "staff upload photos" on storage.objects;
create policy "staff upload photos" on storage.objects for insert to authenticated with check (
  bucket_id = 'vehicle-photos' and public.is_staff(auth.uid())
  and public.can_access_appointment(auth.uid(), nullif(split_part(name,'/',1),'')::uuid));

-- ───────────────────────── triggers ─────────────────────────
-- One BEFORE trigger: guards what employees may change, stamps workflow times,
-- keeps estimated_end and busy_until right.
drop trigger if exists appointments_guard on public.appointments;
create or replace function public.appointment_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare dur int;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() = 1 and auth.uid() is not null and not public.is_manager(auth.uid()) then
    if new.customer_name is distinct from old.customer_name or new.customer_phone is distinct from old.customer_phone
       or new.customer_email is distinct from old.customer_email or new.tracking_token is distinct from old.tracking_token
       or new.service_id is distinct from old.service_id or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at or new.station_id is distinct from old.station_id
       or new.reg_number is distinct from old.reg_number or new.extra_price is distinct from old.extra_price
       or new.extra_minutes is distinct from old.extra_minutes or new.delay_minutes is distinct from old.delay_minutes
       or new.notify_customer is distinct from old.notify_customer or new.station_locked is distinct from old.station_locked
       or new.customer_note is distinct from old.customer_note then
      raise exception 'Employees can only update the workflow status';
    end if;
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      raise exception 'Only a manager can cancel an appointment';
    end if;
  end if;

  new.reg_number := upper(regexp_replace(new.reg_number, '\s+', '', 'g'));

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'washing' and new.started_at is null then new.started_at := now(); end if;
    if new.status = 'ready' and new.ready_at is null then new.ready_at := now(); end if;
    if new.status = 'picked_up' then new.completed_at := coalesce(new.completed_at, now()); end if;
    -- Going back a step (undo) clears the stamps that no longer apply.
    if new.status in ('confirmed','arrived','checked_in') then new.started_at := null; end if;
    if new.status not in ('ready','picked_up') then new.ready_at := null; end if;
    if new.status <> 'picked_up' then new.completed_at := null; end if;
    if tg_op = 'UPDATE' and new.assigned_employee is null and auth.uid() is not null and new.status <> 'cancelled' then
      new.assigned_employee := auth.uid();
    end if;
  end if;

  -- Early pickup frees the rest of the slot.
  if new.status = 'picked_up' and new.completed_at is not null then
    new.busy_until := greatest(new.starts_at + interval '1 minute', least(new.ends_at, new.completed_at));
  else
    new.busy_until := new.ends_at;
  end if;

  select duration_min into dur from public.services where id = new.service_id;
  new.estimated_end := coalesce(new.started_at, new.starts_at)
    + make_interval(mins => coalesce(dur, 0) + new.extra_minutes + new.delay_minutes);
  return new;
end $$;
create trigger appointments_guard before insert or update on public.appointments
  for each row execute function public.appointment_before_write();
drop function if exists public.guard_appointment_update();

create or replace function public.step_label(_s public.appt_status)
returns text language sql immutable as $$
  select case _s
    when 'confirmed' then 'Appointment confirmed' when 'arrived' then 'Vehicle arrived'
    when 'checked_in' then 'Vehicle checked in' when 'washing' then 'Washing started'
    when 'exterior_done' then 'Exterior completed' when 'interior_done' then 'Interior completed'
    when 'quality_check' then 'Quality check' when 'ready' then 'Ready for pickup'
    when 'picked_up' then 'Vehicle picked up' when 'cancelled' then 'Cancelled' end
$$;

create or replace function public.riga_time(_t timestamptz)
returns text language sql stable as $$ select to_char(_t at time zone 'Europe/Riga', 'HH24:MI') $$;

-- AFTER trigger: workflow history, customer messages, internal notifications.
create or replace function public.log_appointment_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  steps public.appt_status[];
  should_notify boolean;
  msg text;
  svc text;
  st text;
begin
  select name into svc from public.services where id = new.service_id;
  select '#' || number || ' ' || name into st from public.stations where id = new.station_id;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    select notify_steps into steps from public.settings where id = 1;
    should_notify := new.notify_customer and new.status = any(coalesce(steps, '{confirmed,washing,ready,picked_up}'::public.appt_status[]));
    insert into public.appointment_events (appointment_id, step, performed_by, notify)
    values (new.id, new.status, auth.uid(), should_notify);

    if should_notify then
      msg := case new.status
        when 'confirmed' then format('Your %s is booked for %s at %s.', svc, to_char(new.starts_at at time zone 'Europe/Riga','DD.MM.YYYY'), public.riga_time(new.starts_at))
        when 'arrived' then 'We have received your vehicle.'
        when 'checked_in' then 'Your vehicle is checked in and queued for washing.'
        when 'washing' then format('Washing has started. Estimated completion: %s.', public.riga_time(new.estimated_end))
        when 'exterior_done' then 'Exterior cleaning is complete.'
        when 'interior_done' then 'Interior cleaning is complete.'
        when 'quality_check' then 'Your vehicle is in the final quality check.'
        when 'ready' then 'Your vehicle is ready for pickup!'
        when 'picked_up' then 'Thank you for visiting. Drive safely!'
        when 'cancelled' then 'Your appointment has been cancelled.'
      end;
      insert into public.customer_messages (appointment_id, kind, step, body) values (new.id, 'status', new.status, msg);
    end if;

    if tg_op = 'INSERT' then
      insert into public.ops_notifications (kind, title, body, appointment_id, station_id, actor)
      values ('new_appointment', 'New appointment ' || new.reg_number,
              format('%s · %s %s · %s', svc, to_char(new.starts_at at time zone 'Europe/Riga','DD.MM'), public.riga_time(new.starts_at), coalesce(st,'no station')),
              new.id, new.station_id, auth.uid());
    else
      insert into public.ops_notifications (kind, title, body, appointment_id, station_id, actor)
      values (case new.status when 'arrived' then 'arrived' when 'ready' then 'ready' when 'cancelled' then 'cancelled' else 'workflow' end,
              new.reg_number || ': ' || public.step_label(new.status),
              coalesce(st, '') , new.id, new.station_id, auth.uid());
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.station_id is distinct from old.station_id or new.starts_at is distinct from old.starts_at) then
    insert into public.ops_notifications (kind, title, body, appointment_id, station_id, actor)
    values ('rescheduled', new.reg_number || ' moved',
            format('%s %s · %s', to_char(new.starts_at at time zone 'Europe/Riga','DD.MM'), public.riga_time(new.starts_at), coalesce(st,'no station')),
            new.id, new.station_id, auth.uid());
  end if;
  return new;
end $$;

create or replace function public.on_delay_reported()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  update public.appointments set delay_minutes = delay_minutes + new.minutes, delay_reason = new.reason
    where id = new.appointment_id returning * into a;
  if a.notify_customer then
    insert into public.customer_messages (appointment_id, kind, body)
    values (a.id, 'delay', format('Sorry, your vehicle needs about %s more minutes. New estimated completion: %s.', new.minutes, public.riga_time(a.estimated_end)));
  end if;
  insert into public.ops_notifications (kind, title, body, appointment_id, station_id, actor)
  values ('delay', a.reg_number || ' delayed +' || new.minutes || ' min', new.reason, a.id, a.station_id, auth.uid());
  return new;
end $$;
drop trigger if exists appointment_delays_after on public.appointment_delays;
create trigger appointment_delays_after after insert on public.appointment_delays
  for each row execute function public.on_delay_reported();

create or replace function public.on_extra_work()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  if tg_op = 'INSERT' then
    select * into a from public.appointments where id = new.appointment_id;
    insert into public.ops_notifications (kind, title, body, appointment_id, station_id, actor)
    values ('extra_request', 'Extra work requested · ' || a.reg_number,
            new.title || case when new.price > 0 then ' · €' || new.price else '' end, a.id, a.station_id, auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status and old.status = 'pending' then
    new.decided_by := coalesce(new.decided_by, auth.uid());
    new.decided_at := now();
    if new.status = 'approved' then
      update public.appointments set extra_price = extra_price + new.price, extra_minutes = extra_minutes + new.minutes
        where id = new.appointment_id returning * into a;
      if a.notify_customer then
        insert into public.customer_messages (appointment_id, kind, body)
        values (a.id, 'extra', format('Added: %s%s. Estimated completion: %s.', new.title,
          case when new.price > 0 then ' (+€' || new.price || ')' else '' end, public.riga_time(a.estimated_end)));
      end if;
    else
      select * into a from public.appointments where id = new.appointment_id;
    end if;
    insert into public.ops_notifications (kind, title, body, appointment_id, station_id, actor)
    values ('extra_decision', 'Extra work ' || new.status || ' · ' || a.reg_number, new.title, a.id, a.station_id, auth.uid());
  elsif old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request was already decided';
  end if;
  return new;
end $$;
drop trigger if exists extra_work_after_insert on public.extra_work;
create trigger extra_work_after_insert after insert on public.extra_work
  for each row execute function public.on_extra_work();
drop trigger if exists extra_work_before_update on public.extra_work;
create trigger extra_work_before_update before update on public.extra_work
  for each row execute function public.on_extra_work();

create or replace function public.on_unavailability()
returns trigger language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select '#' || number || ' ' || name into st from public.stations where id = new.station_id;
  insert into public.ops_notifications (kind, title, body, station_id, actor)
  values ('maintenance', st || ' unavailable',
          format('%s – %s · %s', to_char(new.starts_at at time zone 'Europe/Riga','DD.MM HH24:MI'), to_char(new.ends_at at time zone 'Europe/Riga','DD.MM HH24:MI'), new.reason),
          new.station_id, auth.uid());
  return new;
end $$;
drop trigger if exists station_unavailability_after on public.station_unavailability;
create trigger station_unavailability_after after insert on public.station_unavailability
  for each row execute function public.on_unavailability();

-- ───────────────────────── RPCs ─────────────────────────
-- Revoke or regenerate a customer's tracking link.
create or replace function public.set_tracking_link(_appointment_id uuid, _revoke boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not public.is_manager(auth.uid()) then raise exception 'Not allowed'; end if;
  tok := case when _revoke then null else encode(extensions.gen_random_bytes(24),'hex') end;
  update public.appointments set tracking_token = tok where id = _appointment_id;
  return tok;
end $$;

-- Regenerate the public TV display key.
create or replace function public.rotate_display_key()
returns text language plpgsql security definer set search_path = public as $$
declare k text := encode(extensions.gen_random_bytes(16),'hex');
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Not allowed'; end if;
  update public.settings set display_key = k, updated_at = now() where id = 1;
  return k;
end $$;

-- Full history of one vehicle, for any staff member (no phone/e-mail).
create or replace function public.vehicle_history(_reg text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare norm text := upper(regexp_replace(coalesce(_reg,''), '\s+', '', 'g'));
begin
  if not public.is_staff(auth.uid()) then raise exception 'Not allowed'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(h) order by h.starts_at desc) from (
      select a.id, a.reg_number, a.make, a.model, a.customer_name, a.customer_note, a.starts_at, a.status,
             a.started_at, a.completed_at, a.extra_price, a.delay_minutes, a.delay_reason,
             s.name as service, s.price as service_price, st.number as station_number, st.name as station_name,
             p.full_name as employee,
             (select coalesce(jsonb_agg(jsonb_build_object('step', e.step, 'at', e.created_at, 'by', pe.full_name) order by e.created_at), '[]')
                from public.appointment_events e left join public.profiles pe on pe.id = e.performed_by where e.appointment_id = a.id) as events,
             (select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'body', n.body, 'at', n.created_at, 'by', pn.full_name) order by n.created_at), '[]')
                from public.appointment_notes n left join public.profiles pn on pn.id = n.author where n.appointment_id = a.id) as notes,
             (select coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'price', x.price, 'status', x.status) order by x.created_at), '[]')
                from public.extra_work x where x.appointment_id = a.id) as extras
      from public.appointments a
      join public.services s on s.id = a.service_id
      left join public.stations st on st.id = a.station_id
      left join public.profiles p on p.id = a.assigned_employee
      where upper(replace(a.reg_number,' ','')) = norm
    ) h), '[]'::jsonb);
end $$;

revoke execute on function public.set_tracking_link(uuid, boolean), public.rotate_display_key(), public.vehicle_history(text) from anon, public;
grant execute on function public.set_tracking_link(uuid, boolean), public.rotate_display_key(), public.vehicle_history(text) to authenticated;

-- ───────────────────────── realtime ─────────────────────────
alter publication supabase_realtime add table public.appointment_events;
alter publication supabase_realtime add table public.appointment_delays;
alter publication supabase_realtime add table public.extra_work;
alter publication supabase_realtime add table public.ops_notifications;
alter publication supabase_realtime add table public.station_employees;
alter publication supabase_realtime add table public.appointment_photos;
