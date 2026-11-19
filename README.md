# Genarts — car wash operations

Booking, live station board (TV), employee tablet, customer live tracking, automatic station
assignment, vehicle history, extra-work approvals, delays and notifications. Built on Lovable Cloud (Supabase).

| Page | Who | What |
| --- | --- | --- |
| `/book` | customers | pick service → free time → details; station chosen automatically; closest alternatives if a slot is gone |
| `/track/<token>` | customers | live progress, estimate, updates, price; no login |
| `/display/<key>` | lobby TV | public board, masked plates, no names (link in Admin → Settings) |
| `/overview` | managers | today's numbers, approvals, delays, late arrivals, pickups, maintenance |
| `/dashboard` | staff | live station board, full screen, public mode |
| `/tablet` | staff | my stations' cars → big step buttons, notes, issues, photos, extra work, delays |
| `/appointments` | managers | day list, walk-ins, reschedule, manual station override, cancel, tracking links |
| `/vehicles` | staff | full history per plate |
| `/admin` | managers / admins | maintenance, station staff · stations, services, staff accounts, settings, reports |

**Database:** see [db/README.md](db/README.md) — `db/0001_operations.sql` must be applied in Lovable once.

Tests: `npm test` (app logic) · `npm run test:db` (database rules).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/84b6bccf-9d66-42ac-bdad-73a198f0c270).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
