# Genarts – Car Wash Operations App

The uploaded brief is section 14 of a larger spec and cuts off mid-sentence in part D (station assignment). The plan covers parts A–D, plus the basic booking, stations and staff they depend on.

## What gets built
1. **Foundation (Lovable Cloud)**: staff sign-in with roles (admin, employee), washing stations (services supported, working hours, maintenance periods), services, customers, vehicles, appointments.
2. **Booking page**: a customer picks a service and time. The system assigns a station automatically and creates a private tracking link.
3. **Live Station Dashboard (TV mode)**: color-coded cards for any number of stations, a clock, upcoming appointments, a full-screen button, and a public mode that hides customer details. It updates live.
4. **Employee Tablet Interface**: assigned stations and vehicles, large buttons for the 8 workflow steps (each one saves the time and the employee), notes, photos, issue reports and the next vehicle. Employees can't open admin areas.
5. **Customer Tracking Page**: no login needed, opened with a hard-to-guess link. It shows a progress bar and steps, with no internal notes. Admins can revoke or regenerate links.
6. **Automatic Station Assignment**: checks which stations support the service, their hours, existing bookings and maintenance periods, then picks the least-loaded free station.
7. **Admin area**: manage stations, services, employees, appointments and tracking links.

Customer notifications are recorded as events for each step. Sending real SMS or email needs a provider, which can be added later.

## Design
A bold, industrial look: deep graphite with a bright aqua accent, a strong display font and large touch targets. Dashboard status colors match the spec.

## Technical details
- Postgres tables with RLS. Roles live in a separate `user_roles` table with `has_role()`.
- Supabase realtime powers the dashboard, tablet and tracking pages.
- Tracking uses a random 32-byte token and a server function that returns only safe fields.
- Assignment runs in a server function. Photos go to a private storage bucket.
