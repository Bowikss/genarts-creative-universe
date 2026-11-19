// Applies 0000 + 0001 to an in-memory Postgres (PGlite) with Supabase stand-ins,
// then exercises roles, RLS and triggers. Run: node db/test/migration.test.mjs
// (needs `npm i -D @electric-sql/pglite` or NODE_PATH pointing at it)
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create extension pgcrypto with schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
  grant usage on schema public, auth, extensions, storage to authenticated, anon;
  grant all on storage.objects to authenticated;
`);
await db.exec(readFileSync(path.join(root, "drizzle/migrations/0000_genarts_core.sql"), "utf8"));
await db.exec(readFileSync(path.join(root, "db/0001_operations.sql"), "utf8"));
// Running it twice must not fail (idempotent apart from policies that already exist).

let ok = 0;
const pass = (m) => {
  ok++;
  console.log("  ✓", m);
};
const as = async (uid, sql, params = []) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  if (uid) await db.exec("set role authenticated");
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
};
const fails = async (uid, sql, re, params = []) => {
  try {
    await as(uid, sql, params);
  } catch (e) {
    assert.match(e.message, re);
    return;
  }
  assert.fail("expected failure: " + sql);
};
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];

// users
const mk = async (email) =>
  (
    await one(
      `insert into auth.users (email, raw_user_meta_data) values ($1, '{"full_name":"${email.split("@")[0]}"}') returning id`,
      [email],
    )
  ).id;
const admin = await mk("ann@x.lv"),
  emp = await mk("eve@x.lv"),
  mgr = await mk("max@x.lv"),
  stranger = await mk("sam@x.lv");
assert.equal(
  (await one(`select count(*)::int c from user_roles where user_id=$1 and role='admin'`, [admin]))
    .c,
  1,
);
assert.equal((await one(`select count(*)::int c from user_roles where user_id=$1`, [emp])).c, 0);
pass("first sign-up is admin, later sign-ups wait without a role");

await as(admin, `insert into user_roles (user_id, role) values ($1,'employee'), ($2,'manager')`, [
  emp,
  mgr,
]);
pass("admin grants employee + manager roles");

const st = Object.fromEntries(
  (await db.query(`select number, id from stations`)).rows.map((r) => [r.number, r.id]),
);
const svc = (await one(`select id from services where name='Full Wash'`)).id;
await as(mgr, `insert into station_employees (station_id, user_id) values ($1,$2)`, [st[1], emp]);
pass("manager assigns employee to station 1");

const ins = (station, s, e, reg = "AB1234") =>
  as(
    mgr,
    `insert into appointments (customer_name, reg_number, service_id, station_id, starts_at, ends_at, customer_phone)
   values ('Jānis', $1, $2, $3, $4, $5, '+371 2000') returning id, estimated_end, tracking_token`,
    [reg, svc, station, s, e],
  );
const [a1] = await ins(st[1], "2026-11-20T08:00:00Z", "2026-11-20T08:45:00Z", "ab 1234");
const [a2] = await ins(st[2], "2026-11-20T08:00:00Z", "2026-11-20T08:45:00Z", "XY999");
assert.equal(new Date(a1.estimated_end).toISOString(), "2026-11-20T08:45:00.000Z");
assert.equal(a1.tracking_token.length, 48);
pass("manager books; estimate + 48-hex tracking token set");
assert.equal(
  (await one(`select reg_number from appointments where id=$1`, [a1.id])).reg_number,
  "AB1234",
);
pass("reg number normalised");

await fails(
  mgr,
  `insert into appointments (customer_name, reg_number, service_id, station_id, starts_at, ends_at) values ('x','Z1',$1,$2,'2026-11-20T08:30:00Z','2026-11-20T09:00:00Z')`,
  /appointments_no_overlap/,
  [svc, st[1]],
);
pass("overlapping booking on the same station rejected by the database");
await as(
  mgr,
  `insert into appointments (customer_name, reg_number, service_id, station_id, starts_at, ends_at) values ('x','Z2',$1,$2,'2026-11-20T08:45:00Z','2026-11-20T09:30:00Z')`,
  [svc, st[1]],
);
pass("back-to-back booking allowed");

assert.deepEqual(
  (await as(emp, `select reg_number from appointments order by starts_at`)).map(
    (r) => r.reg_number,
  ),
  ["AB1234", "Z2"],
);
assert.equal((await as(stranger, `select * from appointments`)).length, 0);
pass("employee sees only their station; account without a role sees nothing");
await fails(
  emp,
  `insert into appointments (customer_name, reg_number, service_id, starts_at, ends_at) values ('x','Q',$1,now(),now())`,
  /row-level security/,
  [svc],
);
pass("employee cannot create appointments");

await as(emp, `update appointments set status='arrived' where id=$1`, [a1.id]);
await as(emp, `update appointments set status='washing' where id=$1`, [a1.id]);
let r = await one(
  `select status, started_at, assigned_employee, estimated_end from appointments where id=$1`,
  [a1.id],
);
assert.equal(r.status, "washing");
assert.ok(r.started_at);
assert.equal(r.assigned_employee, emp);
pass("employee steps: started_at stamped, employee recorded");
const ev = await as(
  emp,
  `select step, performed_by, notify from appointment_events where appointment_id=$1 order by created_at, step`,
  [a1.id],
);
assert.deepEqual(
  ev.map((e) => e.step),
  ["confirmed", "arrived", "washing"],
);
assert.ok(ev.every((e) => e.step === "confirmed" || e.performed_by === emp));
pass("every step logged with who + when");
const msgs = await one(`select count(*)::int c from customer_messages where appointment_id=$1`, [
  a1.id,
]);
assert.equal(msgs.c, 3);
pass("customer messages for confirmed/arrived/washing (default notify steps)");
assert.equal(
  (await as(emp, `update appointments set status='arrived' where id=$1 returning id`, [a2.id]))
    .length,
  0,
);
pass("employee cannot touch another station's car");

await fails(
  emp,
  `update appointments set customer_name='Hacker' where id=$1`,
  /only update the workflow/,
  [a1.id],
);
await fails(emp, `update appointments set status='cancelled' where id=$1`, /Only a manager/, [
  a1.id,
]);
await fails(
  emp,
  `update appointments set tracking_token=null where id=$1`,
  /only update the workflow/,
  [a1.id],
);
pass("employee blocked from customer fields, cancelling, links");

const before = (await one(`select estimated_end from appointments where id=$1`, [a1.id]))
  .estimated_end;
await as(
  emp,
  `insert into appointment_delays (appointment_id, minutes, reason, reported_by) values ($1, 20, 'Heavy mud', $2)`,
  [a1.id, emp],
);
r = await one(`select delay_minutes, delay_reason, estimated_end from appointments where id=$1`, [
  a1.id,
]);
assert.equal(r.delay_minutes, 20);
assert.equal(r.delay_reason, "Heavy mud");
assert.equal(new Date(r.estimated_end) - new Date(before), 20 * 60000);
assert.ok(
  (await one(`select body from customer_messages where kind='delay'`)).body.includes(
    "20 more minutes",
  ),
);
pass("delay: estimate +20 min, reason recorded, customer told");

const [x] = await as(
  emp,
  `insert into extra_work (appointment_id, title, price, minutes, requested_by) values ($1, 'Pet hair removal', 15, 25, $2) returning id`,
  [a1.id, emp],
);
assert.equal(
  (await as(emp, `update extra_work set status='approved' where id=$1 returning id`, [x.id]))
    .length,
  0,
);
pass("employee requests extra work but cannot approve it");
await as(mgr, `update extra_work set status='approved' where id=$1`, [x.id]);
r = await one(`select extra_price, extra_minutes from appointments where id=$1`, [a1.id]);
assert.equal(Number(r.extra_price), 15);
assert.equal(r.extra_minutes, 25);
const xr = await one(`select decided_by, decided_at from extra_work where id=$1`, [x.id]);
assert.equal(xr.decided_by, mgr);
assert.ok(xr.decided_at);
assert.ok(
  (await one(`select body from customer_messages where kind='extra'`)).body.includes(
    "Pet hair removal (+€15.00)",
  ),
);
await fails(mgr, `update extra_work set status='rejected' where id=$1`, /already decided/, [x.id]);
pass("manager approves: price + time added, customer told, cannot flip twice");

const notes = await as(emp, `select kind from ops_notifications`);
assert.ok(notes.some((n) => n.kind === "delay") && notes.some((n) => n.kind === "extra_request"));
assert.ok(
  !(await as(emp, `select title from ops_notifications`)).some((n) => n.title.includes("XY999")),
);
assert.ok(
  (await as(mgr, `select title from ops_notifications`)).some((n) => n.title.includes("XY999")),
);
pass("internal notifications scoped by station");

assert.equal((await as(emp, `select * from settings`)).length, 0);
assert.equal((await as(mgr, `select * from settings`)).length, 1);
await fails(mgr, `select rotate_display_key()`, /Not allowed/);
assert.equal((await as(admin, `select rotate_display_key() k`))[0].k.length, 32);
pass("settings: hidden from employees, display key rotation admin-only");

await fails(emp, `select set_tracking_link($1, true)`, /Not allowed/, [a1.id]);
await as(mgr, `select set_tracking_link($1, true)`, [a1.id]);
assert.equal(
  (await one(`select tracking_token from appointments where id=$1`, [a1.id])).tracking_token,
  null,
);
const nt = (await as(mgr, `select set_tracking_link($1) t`, [a1.id]))[0].t;
assert.equal(nt.length, 48);
pass("tracking link revoke + regenerate (managers only)");

// early pickup frees the rest of the slot
await as(
  mgr,
  `update appointments set status='picked_up', completed_at='2026-11-20T08:20:00Z' where id=$1`,
  [a2.id],
);
assert.equal(
  new Date(
    (await one(`select busy_until from appointments where id=$1`, [a2.id])).busy_until,
  ).toISOString(),
  "2026-11-20T08:20:00.000Z",
);
await as(
  mgr,
  `insert into appointments (customer_name, reg_number, service_id, station_id, starts_at, ends_at) values ('x','W1',$1,$2,'2026-11-20T08:20:00Z','2026-11-20T08:40:00Z')`,
  [svc, st[2]],
);
pass("early pickup frees the rest of the slot");

// undo
await as(emp, `update appointments set status='arrived' where id=$1`, [a1.id]);
r = await one(`select started_at from appointments where id=$1`, [a1.id]);
assert.equal(r.started_at, null);
pass("undo back to 'arrived' clears started_at");

const hist = (await as(emp, `select vehicle_history('ab 1234') h`))[0].h;
assert.equal(hist.length, 1);
assert.equal(hist[0].service, "Full Wash");
assert.ok(hist[0].events.length >= 4 && hist[0].extras[0].title === "Pet hair removal");
assert.ok(!("customer_phone" in hist[0]));
await fails(stranger, `select vehicle_history('AB1234')`, /Not allowed/);
pass("vehicle history for staff, no phone/email, blocked for non-staff");

await as(emp, `insert into storage.objects (bucket_id, name) values ('vehicle-photos', $1)`, [
  `${a1.id}/p.jpg`,
]);
await fails(
  emp,
  `insert into storage.objects (bucket_id, name) values ('vehicle-photos', $1)`,
  /row-level security/,
  [`${a2.id}/p.jpg`],
);
pass("photo upload only into own station's appointments");

await as(
  emp,
  `insert into appointment_notes (appointment_id, body, kind, author) values ($1,'Scratch on door','issue',$2)`,
  [a1.id, emp],
);
await fails(
  emp,
  `insert into appointment_notes (appointment_id, body, author) values ($1,'x',$2)`,
  /row-level security/,
  [a2.id, emp],
);
pass("notes scoped to own appointments");

await as(
  mgr,
  `insert into station_unavailability (station_id, starts_at, ends_at, reason) values ($1, now(), now() + interval '1 hour', 'Pump repair')`,
  [st[3]],
);
assert.ok(
  (await as(mgr, `select kind from ops_notifications where kind='maintenance'`)).length === 1,
);
pass("maintenance creates a notification");

console.log(`\n${ok} checks passed`);
