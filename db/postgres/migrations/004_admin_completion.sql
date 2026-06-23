ALTER TABLE products ALTER COLUMN image_url TYPE text;

INSERT INTO app_settings (key, value)
VALUES (
  'settings',
  jsonb_build_object(
    'company', jsonb_build_object(
      'tradingName', 'POS & Inventory +',
      'currency', 'MWK',
      'vatRate', 16.5,
      'address', ''
    ),
    'downloads', jsonb_build_object(
      'androidUrl', 'https://expo.dev/accounts/christianbaluti/projects/pos-inventory-plus',
      'iosUrl', 'Ask your administrator for the TestFlight invite'
    ),
    'security', jsonb_build_object(
      'requireTwoFactor', false,
      'biometricUnlock', true,
      'sessionAutoLockMinutes', 15,
      'passwordExpiryDays', 0
    ),
    'notifications', jsonb_build_object(
      'lowStockEmailEnabled', true,
      'expiryEmailEnabled', true
    )
  )
)
ON CONFLICT (key) DO NOTHING;
