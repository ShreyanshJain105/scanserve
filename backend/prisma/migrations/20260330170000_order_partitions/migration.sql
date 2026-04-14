-- Order partitions (orders + order_items) using created_at

BEGIN;

ALTER TABLE order_items ADD COLUMN order_created_at TIMESTAMP(3);
UPDATE order_items oi
SET order_created_at = o.created_at
FROM orders o
WHERE oi.order_id = o.id;
ALTER TABLE order_items ALTER COLUMN order_created_at SET NOT NULL;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_pkey;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pkey;

CREATE TABLE orders_partitioned (
  id text NOT NULL,
  business_id text NOT NULL,
  table_id text NOT NULL,
  customer_user_id text,
  status "OrderStatus" NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  razorpay_order_id text,
  razorpay_payment_id text,
  payment_status "PaymentStatus" NOT NULL,
  payment_method "PaymentMethod" NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  created_at timestamp(3) NOT NULL,
  updated_at timestamp(3) NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX orders_business_status_idx ON orders_partitioned (business_id, status);
CREATE INDEX orders_business_created_at_idx ON orders_partitioned (business_id, created_at);
CREATE INDEX orders_customer_user_idx ON orders_partitioned (customer_user_id);

CREATE TABLE order_items_partitioned (
  id text NOT NULL,
  order_id text NOT NULL,
  order_created_at timestamp(3) NOT NULL,
  menu_item_id text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  special_instructions text,
  PRIMARY KEY (id, order_created_at),
  FOREIGN KEY (order_id, order_created_at) REFERENCES orders_partitioned (id, created_at) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE
) PARTITION BY RANGE (order_created_at);

CREATE INDEX order_items_order_idx ON order_items_partitioned (order_id, order_created_at);

CREATE TABLE orders_p_default PARTITION OF orders_partitioned DEFAULT;
CREATE TABLE order_items_p_default PARTITION OF order_items_partitioned DEFAULT;

INSERT INTO orders_partitioned (
  id,
  business_id,
  table_id,
  customer_user_id,
  status,
  total_amount,
  razorpay_order_id,
  razorpay_payment_id,
  payment_status,
  payment_method,
  customer_name,
  customer_phone,
  created_at,
  updated_at
)
SELECT
  id,
  business_id,
  table_id,
  customer_user_id,
  status,
  total_amount,
  razorpay_order_id,
  razorpay_payment_id,
  payment_status,
  payment_method,
  customer_name,
  customer_phone,
  created_at,
  updated_at
FROM orders;

INSERT INTO order_items_partitioned (
  id,
  order_id,
  order_created_at,
  menu_item_id,
  quantity,
  unit_price,
  special_instructions
)
SELECT
  id,
  order_id,
  order_created_at,
  menu_item_id,
  quantity,
  unit_price,
  special_instructions
FROM order_items;

DROP TABLE order_items;
DROP TABLE orders;

ALTER TABLE orders_partitioned RENAME TO orders;
ALTER TABLE order_items_partitioned RENAME TO order_items;

COMMIT;
