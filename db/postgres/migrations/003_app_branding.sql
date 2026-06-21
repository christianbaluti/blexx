CREATE TABLE IF NOT EXISTS app_settings (
  key varchar(80) PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value)
VALUES (
  'branding',
  jsonb_build_object(
    'appName', 'POS & Inventory +',
    'appSubtitle', 'Sales, stock and operations',
    'logoDataUrl', null,
    'iconDataUrl', null
  )
)
ON CONFLICT (key) DO UPDATE
SET value = excluded.value,
    updated_at = now();
