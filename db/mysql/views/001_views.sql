USE moderntech;

-- Sales summary by day
CREATE OR REPLACE VIEW v_sales_daily AS
SELECT DATE(sold_at) AS day,
       COUNT(*) AS txn_count,
       SUM(subtotal) AS subtotal,
       SUM(tax) AS tax,
       SUM(total) AS total
FROM sales
WHERE status = 'completed'
GROUP BY DATE(sold_at);

-- Stock valuation
CREATE OR REPLACE VIEW v_stock_valuation AS
SELECT p.id  AS product_id,
       p.sku, p.name,
       SUM(sl.quantity) AS on_hand,
       p.cost_price,
       SUM(sl.quantity) * p.cost_price AS value
FROM products p
LEFT JOIN stock_levels sl ON sl.product_id = p.id
GROUP BY p.id;

-- Accounts receivable ageing
CREATE OR REPLACE VIEW v_ar_ageing AS
SELECT c.id, c.name,
       SUM(CASE WHEN s.sold_at >= NOW() - INTERVAL 30 DAY THEN s.total ELSE 0 END) AS d_0_30,
       SUM(CASE WHEN s.sold_at <  NOW() - INTERVAL 30 DAY AND s.sold_at >= NOW() - INTERVAL 60 DAY THEN s.total ELSE 0 END) AS d_31_60,
       SUM(CASE WHEN s.sold_at <  NOW() - INTERVAL 60 DAY THEN s.total ELSE 0 END) AS d_60_plus
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'completed'
GROUP BY c.id;

-- Simple Profit and Loss
CREATE OR REPLACE VIEW v_profit_and_loss AS
SELECT (SELECT IFNULL(SUM(total),0) FROM sales WHERE status='completed') AS revenue,
       (SELECT IFNULL(SUM(amount),0) FROM expenses) AS expenses,
       (SELECT IFNULL(SUM(total),0) FROM sales WHERE status='completed')
       - (SELECT IFNULL(SUM(amount),0) FROM expenses) AS net_profit;
