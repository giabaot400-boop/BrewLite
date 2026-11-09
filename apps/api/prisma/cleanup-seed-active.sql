BEGIN;

DO $$
BEGIN
  IF current_database() <> 'brewlite_s3_demo' THEN
    RAISE EXCEPTION 'Wrong database.';
  END IF;

  PERFORM id
  FROM products
  WHERE id = 'coffee-milk'
    AND stock = 10
    AND reserved_stock = 1
    AND stock_version = 2
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock changed; inspect before cleanup.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM stock_reservations r
    JOIN orders o ON o.id = r.order_id
    WHERE r.id = 's3-seed-active-reservation'
      AND r.order_id = 's3-seed-active-order'
      AND o.user_id = 's3-seed-active-user'
      AND r.product_id = 'coffee-milk'
      AND r.qty = 1
      AND r.state = 'ACTIVE'
      AND r.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Test reservation does not match.';
  END IF;

  UPDATE products
  SET reserved_stock = reserved_stock - 1,
      stock_version = stock_version + 1
  WHERE id = 'coffee-milk';
END;
$$;

DELETE FROM stock_reservations
WHERE id = 's3-seed-active-reservation'
  AND order_id = 's3-seed-active-order';

DELETE FROM order_items
WHERE id = 's3-seed-active-item'
  AND order_id = 's3-seed-active-order';

DELETE FROM orders
WHERE id = 's3-seed-active-order'
  AND user_id = 's3-seed-active-user';

DELETE FROM users
WHERE id = 's3-seed-active-user';

COMMIT;

SELECT id, stock, reserved_stock, stock_version
FROM products WHERE id = 'coffee-milk';

SELECT COUNT(*) AS test_reservations
FROM stock_reservations
WHERE id = 's3-seed-active-reservation';