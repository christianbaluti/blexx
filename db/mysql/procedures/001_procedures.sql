USE moderntech;

DELIMITER $$

-- Finalize a sale: insert lines/payments, reduce stock, post to GL.
-- Inputs: JSON cart payload; outputs: sale_id.
DROP PROCEDURE IF EXISTS sp_finalize_sale $$
CREATE PROCEDURE sp_finalize_sale (
  IN  p_sale_id    CHAR(36),
  IN  p_outlet_id  CHAR(36),
  IN  p_cashier_id CHAR(36),
  IN  p_customer_id CHAR(36),
  IN  p_lines      JSON,         -- [{product_id, qty, unit_price, discount}]
  IN  p_payment_method VARCHAR(20),
  IN  p_tax_rate   DECIMAL(5,4)
)
BEGIN
  DECLARE i INT DEFAULT 0;
  DECLARE n INT DEFAULT JSON_LENGTH(p_lines);
  DECLARE v_pid CHAR(36);
  DECLARE v_qty DECIMAL(14,3);
  DECLARE v_price DECIMAL(14,2);
  DECLARE v_disc DECIMAL(14,2);
  DECLARE v_subtotal DECIMAL(14,2) DEFAULT 0;
  DECLARE v_tax DECIMAL(14,2);
  DECLARE v_total DECIMAL(14,2);

  START TRANSACTION;

  INSERT INTO sales (id, ref_no, outlet_id, cashier_id, customer_id, subtotal, tax, total, status)
  VALUES (p_sale_id, CONCAT('SL-', UNIX_TIMESTAMP()), p_outlet_id, p_cashier_id, p_customer_id, 0, 0, 0, 'completed');

  WHILE i < n DO
    SET v_pid   = JSON_UNQUOTE(JSON_EXTRACT(p_lines, CONCAT('$[',i,'].product_id')));
    SET v_qty   = JSON_EXTRACT(p_lines, CONCAT('$[',i,'].qty'));
    SET v_price = JSON_EXTRACT(p_lines, CONCAT('$[',i,'].unit_price'));
    SET v_disc  = IFNULL(JSON_EXTRACT(p_lines, CONCAT('$[',i,'].discount')), 0);

    INSERT INTO sale_lines (sale_id, product_id, qty, unit_price, discount)
    VALUES (p_sale_id, v_pid, v_qty, v_price, v_disc);

    INSERT INTO stock_movements (product_id, outlet_id, movement, qty, unit_cost, ref_type, ref_id, created_by)
    VALUES (v_pid, p_outlet_id, 'sale', -v_qty,
            (SELECT cost_price FROM products WHERE id = v_pid),
            'sale', p_sale_id, p_cashier_id);

    UPDATE stock_levels SET quantity = quantity - v_qty
     WHERE outlet_id = p_outlet_id AND product_id = v_pid;

    SET v_subtotal = v_subtotal + (v_qty * v_price - v_disc);
    SET i = i + 1;
  END WHILE;

  SET v_tax   = ROUND(v_subtotal * p_tax_rate, 2);
  SET v_total = v_subtotal + v_tax;

  UPDATE sales SET subtotal = v_subtotal, tax = v_tax, total = v_total WHERE id = p_sale_id;

  INSERT INTO sale_payments (sale_id, method, amount) VALUES (p_sale_id, p_payment_method, v_total);

  -- Post to GL: DR cash, CR sales revenue + VAT payable
  INSERT INTO gl_entries (ref_type, ref_id, account_id, debit, credit, memo)
  VALUES ('sale', p_sale_id, (SELECT id FROM gl_accounts WHERE code='1000'), v_total, 0, 'POS sale'),
         ('sale', p_sale_id, (SELECT id FROM gl_accounts WHERE code='4000'), 0, v_subtotal, 'Sales revenue'),
         ('sale', p_sale_id, (SELECT id FROM gl_accounts WHERE code='2100'), 0, v_tax, 'VAT collected');

  COMMIT;
END$$

-- Run a production batch: consume materials, add finished good stock.
DROP PROCEDURE IF EXISTS sp_run_production $$
CREATE PROCEDURE sp_run_production (
  IN  p_batch_id  CHAR(36),
  IN  p_bom_id    CHAR(36),
  IN  p_outlet_id CHAR(36),
  IN  p_runs      DECIMAL(14,3),
  IN  p_waste     DECIMAL(14,3),
  IN  p_user_id   CHAR(36)
)
BEGIN
  DECLARE v_output_qty DECIMAL(14,3);
  DECLARE v_product CHAR(36);
  DECLARE v_labor DECIMAL(14,2);
  DECLARE v_overhead DECIMAL(14,2);
  DECLARE v_material_cost DECIMAL(14,2) DEFAULT 0;

  SELECT product_id, output_qty, labor_cost, overhead_cost
    INTO v_product, v_output_qty, v_labor, v_overhead
    FROM boms WHERE id = p_bom_id;

  START TRANSACTION;

  -- Consume materials
  INSERT INTO stock_movements (product_id, outlet_id, movement, qty, unit_cost, ref_type, ref_id, created_by)
  SELECT bc.material_id, p_outlet_id, 'production_consume', -(bc.qty * p_runs),
         p.cost_price, 'production', p_batch_id, p_user_id
    FROM bom_components bc JOIN products p ON p.id = bc.material_id
   WHERE bc.bom_id = p_bom_id;

  UPDATE stock_levels sl
    JOIN bom_components bc ON bc.material_id = sl.product_id
   SET sl.quantity = sl.quantity - (bc.qty * p_runs)
   WHERE bc.bom_id = p_bom_id AND sl.outlet_id = p_outlet_id;

  SELECT IFNULL(SUM(bc.qty * p_runs * p.cost_price),0) INTO v_material_cost
    FROM bom_components bc JOIN products p ON p.id = bc.material_id
   WHERE bc.bom_id = p_bom_id;

  -- Add finished good
  INSERT INTO stock_movements (product_id, outlet_id, movement, qty, unit_cost, ref_type, ref_id, created_by)
  VALUES (v_product, p_outlet_id, 'production_in', (v_output_qty * p_runs) - p_waste,
          (v_material_cost + v_labor + v_overhead) / NULLIF(v_output_qty * p_runs, 0),
          'production', p_batch_id, p_user_id);

  INSERT INTO stock_levels (outlet_id, product_id, quantity)
  VALUES (p_outlet_id, v_product, (v_output_qty * p_runs) - p_waste)
  ON DUPLICATE KEY UPDATE quantity = quantity + (v_output_qty * p_runs) - p_waste;

  INSERT INTO production_batches (id, ref_no, bom_id, outlet_id, qty_produced, qty_waste, total_cost, produced_by)
  VALUES (p_batch_id, CONCAT('PB-', UNIX_TIMESTAMP()), p_bom_id, p_outlet_id,
          (v_output_qty * p_runs) - p_waste, p_waste, v_material_cost + v_labor + v_overhead, p_user_id);

  COMMIT;
END$$

DELIMITER ;
