CREATE TABLE IF NOT EXISTS app_settings (
  key varchar(80) PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value)
VALUES (
  'branding',
  jsonb_build_object(
    'appName', 'ModernTech',
    'appSubtitle', 'Commerce OS',
    'logoDataUrl', null,
    'iconDataUrl', null
  )
)
ON CONFLICT (key) DO NOTHING;
