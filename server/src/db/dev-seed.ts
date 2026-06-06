/**
 * dev-seed.ts — Bootstrap a development database with a usable admin account.
 *
 * Run ONCE after migrations:
 *   npm run db:dev-seed
 *
 * Creates:
 *   - Config defaults (allowed_domains, password policy, etc.)
 *   - One admin user you can log in with immediately
 *   - One sample season (2027)
 *   - Sample teams
 *
 * Safe to re-run — uses onConflictDoNothing throughout.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { eq } from 'drizzle-orm';

const ADMIN_EMAIL    = 'admin@jrchargersbaseball.com';
const ADMIN_PASSWORD = 'JrChargers2027!';   // change after first login

async function devSeed() {
  if (!process.env.DATABASE_URL) {
    console.error('\n❌  DATABASE_URL is not set in .env\n');
    console.error('   Set it to a Neon or local PostgreSQL connection string, then re-run.\n');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db   = drizzle(pool, { schema });

  console.log('\n🌱  Running dev seed…\n');

  // ─── Config defaults ──────────────────────────────────────────────────────
  const configDefaults = [
    { key: 'allowed_domains',             value: JSON.stringify(['jrchargersbaseball.com']) },
    { key: 'session_timeout_hours',       value: '8' },
    { key: 'password_min_length',         value: '8' },       // relaxed for dev
    { key: 'password_require_mixed_case', value: 'false' },   // relaxed for dev
    { key: 'password_require_number',     value: 'false' },   // relaxed for dev
    { key: 'show_reset_data_ui',          value: 'true' },    // visible in dev
  ];

  for (const row of configDefaults) {
    await db.insert(schema.config).values(row).onConflictDoNothing();
  }
  console.log('  ✓  Config defaults');

  // ─── Admin user ───────────────────────────────────────────────────────────
  const existing = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db.insert(schema.users).values({
      fullName:      'Admin User',
      email:         ADMIN_EMAIL,
      role:          'admin',
      passwordHash,
      emailVerified: true,
      isActive:      true,
    });
    console.log(`  ✓  Admin user created`);
  } else {
    console.log(`  ·  Admin user already exists — skipping`);
  }

  // ─── Sample season ────────────────────────────────────────────────────────
  const [season] = await db.insert(schema.seasons).values({
    label:              '2027',
    seTryoutFormNames:  ['2027 Season Tryouts'],
    seRegistrationUrl:  'https://hamiltonjrchargers.sportsngin.com/register/form/season-2027',
    offerExpiresDays:   14,
    tryoutStart:        '2026-07-10',
    tryoutEnd:          '2026-07-12',
    isActive:           true,
    isArchived:         false,
  }).onConflictDoNothing().returning({ id: schema.seasons.id });

  const seasonId = season?.id ?? (await db.select({ id: schema.seasons.id })
    .from(schema.seasons)
    .where(eq(schema.seasons.label, '2027'))
    .limit(1))[0]?.id;

  console.log('  ✓  Season 2027');

  // ─── Sample teams ─────────────────────────────────────────────────────────
  const sampleTeams = [
    { name: '12U AAA Rep', division: '12U' },
    { name: '12U AA Rep',  division: '12U' },
    { name: '11U AAA Rep', division: '11U' },
    { name: '11U AA Rep',  division: '11U' },
    { name: '10U AAA Rep', division: '10U' },
  ];

  for (const t of sampleTeams) {
    await db.insert(schema.teams).values(t).onConflictDoNothing();
  }
  console.log('  ✓  5 sample teams');

  // ─── Default email templates for the season ───────────────────────────────
  if (seasonId) {
    const templates = [
      {
        seasonId,
        templateKey: 'early_offer' as const,
        subject: 'Welcome Back — Hamilton Jr Chargers {{team}} ({{season}})',
        bodyHtml: `<p>Dear {{parentName}},</p>
<p>We are pleased to welcome {{playerFirstName}} back to the Hamilton Jr Chargers for the {{season}} season on our <strong>{{team}}</strong>.</p>
<p>Please accept your spot before <strong>{{deadline}}</strong> by clicking the button below.</p>
<p>Play hard. Win together.<br/>— Jr Chargers Coaching Staff</p>`,
      },
      {
        seasonId,
        templateKey: 'offer_letter' as const,
        subject: 'Roster Offer — Hamilton Jr Chargers {{team}} ({{season}})',
        bodyHtml: `<p>Dear {{parentName}},</p>
<p>Congratulations! We are pleased to offer {{playerFirstName}} a roster spot on our <strong>{{team}}</strong> for the <strong>{{season}}</strong> season.</p>
<p>Please complete registration before <strong>{{deadline}}</strong> using the button below.</p>
<p>Play hard. Win together.<br/>— Jr Chargers Coaching Staff</p>`,
      },
      {
        seasonId,
        templateKey: 'rejection_letter' as const,
        subject: 'Tryout Results — Hamilton Jr Chargers {{season}}',
        bodyHtml: `<p>Dear {{parentName}},</p>
<p>Thank you for {{playerFirstName}}'s participation in the Hamilton Jr Chargers {{season}} tryouts. After careful consideration, we are unable to offer {{playerFirstName}} a spot on our {{team}} roster this year.</p>
<p>We encourage {{playerFirstName}} to continue playing and to try out again in future seasons.</p>
<p>Thank you again for choosing the Jr Chargers.<br/>— Jr Chargers Coaching Staff</p>`,
      },
    ];

    for (const t of templates) {
      await db.insert(schema.emailTemplates).values(t).onConflictDoNothing();
    }
    console.log('  ✓  Email templates');
  }

  await pool.end();

  console.log(`
✅  Dev seed complete!

   Login at:  http://localhost:5173/login
   Email:     ${ADMIN_EMAIL}
   Password:  ${ADMIN_PASSWORD}

   ⚠️  Change this password after your first login.
   ⚠️  Password policy is relaxed in dev (min 8 chars, no complexity).
       Production policy (min 12, mixed case + number) is enforced via
       the config table — update it in Settings → Security.
`);
}

devSeed().catch((err) => {
  console.error('\n❌  Dev seed failed:', err.message, '\n');
  if (err.message?.includes('does not exist') || err.message?.includes('relation')) {
    console.error('   Hint: run migrations first with:  npm run db:migrate\n');
  }
  process.exit(1);
});
