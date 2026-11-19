
create type public.app_role as enum ('admin','employee');
create type public.appt_status as enum ('confirmed','arrived','checked_in','washing','exterior_done','interior_done','quality_check','ready','picked_up','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

create policy "staff read profiles" on public.profiles for select to authenticated using (public.is_staff(auth.uid()) or id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "read own or admin roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin add roles" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin remove roles" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- First sign-up becomes admin, later sign-ups become employees.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'employee');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_min int not null default 30,
  price numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  number int not null unique,
  name text not null,
  open_time time not null default '08:00',
  close_time time not null default '20:00',
  out_of_service boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.station_services (
  station_id uuid not null references public.stations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (station_id, service_id)
);
create table public.station_employees (
  station_id uuid not null references public.stations(id) on delete cascade,
  user_id uuid not null,
  primary key (station_id, user_id)
);
create table public.station_unavailability (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default 'Maintenance'
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null default '',
  customer_email text not null default '',
  reg_number text not null,
  make text not null default '',
  model text not null default '',
  service_id uuid not null references public.services(id),
  station_id uuid references public.stations(id) on delete set null,
  assigned_employee uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appt_status not null default 'confirmed',
  started_at timestamptz,
  completed_at timestamptz,
  tracking_token text unique default encode(extensions.gen_random_bytes(24),'hex'),
  notify_customer boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.appointments (starts_at);
create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  step public.appt_status not null,
  performed_by uuid,
  notify boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.appointment_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  kind text not null default 'note',
  body text not null,
  author uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.appointment_photos (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  path text not null,
  author uuid default auth.uid(),
  created_at timestamptz not null default now()
);

grant select on public.services, public.stations, public.station_services, public.station_employees, public.station_unavailability to authenticated;
grant insert, update, delete on public.services, public.stations, public.station_services, public.station_employees, public.station_unavailability to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select on public.appointment_events to authenticated;
grant select, insert on public.appointment_notes, public.appointment_photos to authenticated;
grant all on public.services, public.stations, public.station_services, public.station_employees, public.station_unavailability, public.appointments, public.appointment_events, public.appointment_notes, public.appointment_photos to service_role;

alter table public.services enable row level security;
alter table public.stations enable row level security;
alter table public.station_services enable row level security;
alter table public.station_employees enable row level security;
alter table public.station_unavailability enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_events enable row level security;
alter table public.appointment_notes enable row level security;
alter table public.appointment_photos enable row level security;

create policy "staff read" on public.services for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin write" on public.services for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "staff read" on public.stations for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin write" on public.stations for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "staff read" on public.station_services for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin write" on public.station_services for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "staff read" on public.station_employees for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin write" on public.station_employees for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "staff read" on public.station_unavailability for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin write" on public.station_unavailability for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "staff read" on public.appointments for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff update" on public.appointments for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "admin insert" on public.appointments for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete" on public.appointments for delete to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "staff read" on public.appointment_events for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff read" on public.appointment_notes for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff add" on public.appointment_notes for insert to authenticated with check (public.is_staff(auth.uid()) and author = auth.uid());
create policy "staff read" on public.appointment_photos for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff add" on public.appointment_photos for insert to authenticated with check (public.is_staff(auth.uid()) and author = auth.uid());

-- Employees may only change workflow fields; admins anything.
create or replace function public.guard_appointment_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_role(auth.uid(),'admin') then
    if new.customer_name is distinct from old.customer_name or new.customer_phone is distinct from old.customer_phone
       or new.customer_email is distinct from old.customer_email or new.tracking_token is distinct from old.tracking_token
       or new.service_id is distinct from old.service_id or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at or new.station_id is distinct from old.station_id then
      raise exception 'Employees can only update workflow status';
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'washing' and new.started_at is null then new.started_at := now(); end if;
    if new.status = 'picked_up' then new.completed_at := now(); end if;
    if new.assigned_employee is null and auth.uid() is not null then new.assigned_employee := auth.uid(); end if;
  end if;
  return new;
end $$;
create trigger appointments_guard before update on public.appointments for each row execute function public.guard_appointment_update();

create or replace function public.log_appointment_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.appointment_events (appointment_id, step, performed_by, notify)
    values (new.id, new.status, auth.uid(), new.notify_customer and new.status in ('confirmed','washing','ready','picked_up'));
  end if;
  return new;
end $$;
create trigger appointments_log after insert or update on public.appointments for each row execute function public.log_appointment_status();

alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.stations;
alter publication supabase_realtime add table public.station_unavailability;
alter publication supabase_realtime add table public.appointment_notes;

-- Storage policies for vehicle photos (bucket created separately)
create policy "staff read photos" on storage.objects for select to authenticated using (bucket_id = 'vehicle-photos' and public.is_staff(auth.uid()));
create policy "staff upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'vehicle-photos' and public.is_staff(auth.uid()));

-- Seed data
insert into public.services (name, duration_min, price) values
 ('Express Exterior', 20, 12), ('Full Wash', 45, 29), ('Interior Detail', 60, 49), ('Premium Detail', 120, 119);
insert into public.stations (number, name) values (1,'Bay Alpha'),(2,'Bay Bravo'),(3,'Bay Charlie'),(4,'Detail Studio');
insert into public.station_services (station_id, service_id)
 select st.id, sv.id from public.stations st cross join public.services sv
 where (st.number in (1,2,3) and sv.name in ('Express Exterior','Full Wash','Interior Detail'))
    or (st.number = 4 and sv.name in ('Full Wash','Interior Detail','Premium Detail'));
