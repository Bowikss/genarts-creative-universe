# Database changes

`drizzle/migrations/0000_genarts_core.sql` is what Lovable created (live).
`0001_operations.sql` adds everything the operations app needs. **Apply it once** in Lovable
(the project rules say Lovable owns schema changes):

> Apply the SQL in `db/0001_operations.sql` as a new migration, unchanged, and regenerate the Supabase types.

What it adds:

| Area | What |
| --- | --- |
| Roles | `manager` role. New sign-ups get **no access** until an admin gives them a role (before: everyone became an employee). |
| Access (RLS) | Admins/managers see everything; employees only appointments on stations they are assigned to (`station_employees`) or that they worked on. |
| Bookings | Database-level no-overlap rule per station (`appointments_no_overlap`), so two simultaneous bookings can never get the same slot. Early pickup frees the rest of the slot (`busy_until`). |
| Workflow | `estimated_end`, `ready_at`, stamps on every step; employees can only change the status (and can't cancel). Undo clears stamps. |
| Delays | `appointment_delays` → pushes the estimate, records the reason, tells the customer. |
| Extra work | `extra_work` requests by employees; managers approve/reject → price + time added, customer told. |
| Customer messages | `customer_messages` — shown on the tracking page; ready for an SMS/e-mail sender (rows with `sent_at is null`). |
| Notifications | `ops_notifications` — new booking, arrival, ready, delay, extra work, maintenance, cancellations, reschedules. |
| Settings | Business name, which steps notify customers, the lobby-TV display key. |
| RPCs | `set_tracking_link` (revoke/regenerate), `rotate_display_key`, `vehicle_history`. |
| Photos | `vehicle-photos` private bucket; staff can only read/upload photos for appointments they can see. |

Test it locally (in-memory Postgres, no Docker): `npm run test:db` — 26 checks of roles, RLS and triggers.
