# Blex Backups and Restore Notes

## App-level backups

Admins can create an app-level backup from Settings > Backups. The API creates a `blex-json-backup-v1` snapshot of the public application tables and stores it in `backup_records.payload_json`. The Settings screen can download that JSON file.

The app-level backup excludes `backup_records` itself so backups do not recursively contain older backups.

## Production backups

For Neon/Vercel production, keep Neon point-in-time/provider snapshots enabled where available. The app-level JSON backup is useful for audit, support, and small restore/export workflows, but provider snapshots remain the recommended disaster-recovery source for the full database.

Required production environment:

- `DATABASE_URL`
- `JWT_SECRET`
- SMTP variables if purchase-order email is enabled

## Restore outline

1. Prefer restoring a Neon provider snapshot when recovering a full production database.
2. For app-level JSON backups, download the backup from Settings > Backups.
3. Review the `format`, `createdAt`, and `tables` keys before importing.
4. Restore into a staging database first, then promote only after checking users, stock, sales, and finance totals.

Do not commit backup files or secrets to Git.
