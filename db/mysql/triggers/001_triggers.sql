USE moderntech;

DELIMITER $$

-- Low-stock notification after every stock movement
DROP TRIGGER IF EXISTS trg_low_stock_notify $$
CREATE TRIGGER trg_low_stock_notify
AFTER INSERT ON stock_movements
FOR EACH ROW
BEGIN
  DECLARE v_on_hand DECIMAL(14,3);
  DECLARE v_reorder DECIMAL(14,3);
  DECLARE v_name VARCHAR(200);

  SELECT IFNULL(SUM(quantity),0) INTO v_on_hand FROM stock_levels WHERE product_id = NEW.product_id;
  SELECT reorder_qty, name INTO v_reorder, v_name FROM products WHERE id = NEW.product_id;

  IF v_on_hand <= v_reorder AND v_reorder > 0 THEN
    INSERT INTO notifications (id, user_id, type, title, body)
    VALUES (UUID(), NULL, 'low_stock',
            CONCAT(v_name, ' below reorder'),
            CONCAT('Stock ', v_on_hand, ' / reorder ', v_reorder));
  END IF;
END$$

-- Audit: capture price changes on products
DROP TRIGGER IF EXISTS trg_product_price_audit $$
CREATE TRIGGER trg_product_price_audit
AFTER UPDATE ON products
FOR EACH ROW
BEGIN
  IF OLD.sell_price <> NEW.sell_price OR OLD.cost_price <> NEW.cost_price THEN
    INSERT INTO audit_log (action, entity, entity_id, detail)
    VALUES ('product.price_change', 'product', NEW.id,
            CONCAT('cost ', OLD.cost_price, '->', NEW.cost_price,
                   ' sell ', OLD.sell_price, '->', NEW.sell_price));
  END IF;
END$$

-- Audit: deletions across critical tables
DROP TRIGGER IF EXISTS trg_user_delete_audit $$
CREATE TRIGGER trg_user_delete_audit
AFTER DELETE ON users
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (action, entity, entity_id, detail)
  VALUES ('user.delete', 'user', OLD.id, CONCAT('Deleted ', OLD.username));
END$$

DELIMITER ;
