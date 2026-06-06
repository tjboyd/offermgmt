import 'dotenv/config';
import { db, config } from './index';

/** Seed the config table with default values. Safe to re-run (upsert). */
async function seed() {
  const defaults = [
    { key: 'allowed_domains',            value: JSON.stringify(['jrchargersbaseball.com']) },
    { key: 'session_timeout_hours',      value: '8' },
    { key: 'password_min_length',        value: '12' },
    { key: 'password_require_mixed_case',value: 'true' },
    { key: 'password_require_number',    value: 'true' },
    { key: 'show_reset_data_ui',         value: 'false' },
  ];

  for (const row of defaults) {
    await db.insert(config).values(row).onConflictDoNothing();
  }

  console.log('Config seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
