BEGIN;
DO $$
BEGIN
  IF current_database() <> 'brewlite_s3_demo' THEN
    RAISE EXCEPTION 'Wrong database.';
  END IF;
END;
$$;

INSERT INTO users (id, email, password_hash)
VALUES (
  's3-seed-active-user',
  's3-seed-active@example.invalid',
  'TEST_ONLY_NOT_A_LOGIN_HASH'
);

INSERT INTO orders (
  id, user_id, total, subtotal, request_key, request_hash,
  checkout_policy_version, payment_deadline,
  loyalty_policy_snapshot, loyalty_points_expected
)
VALUES (
  's3-seed-active-order', 's3-seed-active-user',
  35000, 35000, 's3-seed-active-key', repeat('a', 64),
  2, CURRENT_TIMESTAMP + INTERVAL '15 minutes',
  '{"version":1,"divisor":10000}'::jsonb, 3
);

INSERT INTO order_items (
  id, order_id, product_id, product_name, size,
  base_price, size_extra_price, unit_price, qty, line_total
)
VALUES (
  's3-seed-active-item', 's3-seed-active-order',
  'coffee-milk', 'Seed test', 'S',
  35000, 0, 35000, 1, 35000
);

DO $$
BEGIN
  UPDATE products
  SET reserved_stock = 1, stock_version = 2
  WHERE id = 'coffee-milk'
    AND stock = 10
    AND reserved_stock = 0
    AND stock_version = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demo stock is not in the expected initial state.';
  END IF;
END;
$$;

INSERT INTO stock_reservations (
  id, order_id, product_id, qty, state
)
VALUES (
  's3-seed-active-reservation',
  's3-seed-active-order', 'coffee-milk', 1, 'ACTIVE'
);

COMMIT;

SELECT id, stock, reserved_stock, stock_version
FROM products WHERE id = 'coffee-milk';

SELECT id, qty, state
FROM stock_reservations
WHERE id = 's3-seed-active-reservation';