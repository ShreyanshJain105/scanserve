# Sample Data Seed

This repo includes a sample seed script that creates realistic demo data across Postgres (primary DB) and ClickHouse (warehouse events).

## What It Creates

### Users
- Admin: `admin@scan2serve.com` / `admin123`
- Owner: `owner@samplebiz.com` / `owner123`
- Manager: `manager@samplebiz.com` / `manager123`
- Customer: `customer@samplebiz.com` / `customer123`

### Org + Memberships
- Org: `Sample Hospitality Group`
- Owner is the org owner
- Manager is a member of the org
- Manager assigned to `Cafe Aurora` as `manager`

### Businesses
1. **Cafe Aurora** (`cafe-aurora`) — approved
2. **Bistro Nova** (`bistro-nova`) — approved

### Menu + Categories
- Cafe Aurora: Breakfast, Coffee, Dessert
- Bistro Nova: Starters, Mains, Drinks

### Tables + QR
- Cafe Aurora: Table 1, QR `sample-qr-cafe`
- Bistro Nova: Table 10, QR `sample-qr-bistro`

### Orders + Items
- Orders per business (only if fewer than ~120 exist already)
- Orders span recent hours and the last ~180 days
- Mix of paid/unpaid and cancelled/active statuses
- Order items tied to seeded menu items
- Status actors are populated with owner/manager user ids and emails

### ClickHouse (order_events)
- Inserts `order_created`, `order_payment_updated` (paid orders), and `order_status_updated` events
- Supports warehouse-backed analytics windows (last week/month/quarter/year)

## How To Run

1. Ensure Postgres + ClickHouse are running (via docker-compose or local services).
2. Run migrations (if needed):

```bash
pnpm --filter @scan2serve/api db:migrate
```

3. Run base seed (admin + QR smoke data):

```bash
pnpm --filter @scan2serve/api db:seed
```

4. Run the sample data seed:

```bash
pnpm --filter @scan2serve/api db:seed:sample
```

## Notes
- The script is safe to re-run; it upserts users/businesses and skips duplicates where possible.
- ClickHouse table `order_events` is created if missing.
- The seed uses ClickHouse auth from `CLICKHOUSE_BOOTSTRAP_*` or `CLICKHOUSE_*` env vars.
- Analytics dashboards will show data immediately after this seed.
