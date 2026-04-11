# Sample Data Seed

This repo includes a sample seed script that creates realistic demo data across Postgres (primary DB) and ClickHouse (warehouse events).

## What It Creates

### Users
- Admin: `admin@scan2serve.com` / `admin123`
- Owner: `owner@samplebiz.com` / `owner123`
- Manager: `manager@samplebiz.com` / `manager123`
- Customer: `customer@samplebiz.com` / `customer123`
- Additional customers: `guest1@samplebiz.com` → `guest8@samplebiz.com` (same password as the main customer)

### Org + Memberships
- Org: `Sample Hospitality Group`
- Owner is the org owner
- Manager is a member of the org
- Manager assigned to `Cafe Aurora` as `manager`

### Businesses
1. **Cafe Aurora** (`cafe-aurora`) — approved
2. **Bistro Nova** (`bistro-nova`) — approved

### Menu + Categories
- Cafe Aurora: Breakfast, Coffee, Dessert, Sandwiches, Bakery
- Bistro Nova: Starters, Mains, Drinks, Salads, Desserts
- Each category has multiple items (to populate top-category/top-item analytics)

### Tables + QR
- Cafe Aurora: Tables 1–3, QR codes `sample-qr-cafe-<tableNumber>`
- Bistro Nova: Tables 10–12, QR codes `sample-qr-bistro-<tableNumber>`

### Orders + Items
- Orders per business (only if fewer than ~160 exist already)
- Orders span recent hours and the last ~180 days
- Mix of paid/unpaid and cancelled/active statuses, including refunded payments
- Order items tied to seeded menu items
- Status actors are populated with owner/manager user ids and emails
- Orders rotate across multiple customer accounts and tables to make “new vs returning” and “orders per active table” realistic

### Reviews + Likes
- Reviews are created for a slice of completed orders
- Ratings include 1–5 distribution and short comments
- Review likes are created from other seeded customers

### ClickHouse (order_events + reviews)
- Inserts `order_created`, `order_payment_updated` (paid orders), and `order_status_updated` events
- Supports warehouse-backed analytics windows (last week/month/quarter/year)
- Ensures ClickHouse `reviews` table exists; review likes aggregate into `likes_count`

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
