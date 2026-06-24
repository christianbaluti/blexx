ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS grn_id uuid REFERENCES grn(id);
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS attachment_name varchar(240);
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS attachment_mime varchar(120);
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS attachment_data text;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);
ALTER TABLE grn ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES outlets(id);
ALTER TABLE grn ADD COLUMN IF NOT EXISTS note text;
