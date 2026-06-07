import 'dotenv/config';
import { Pool } from 'pg';
import { createApp } from './app';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function initSchema() {
  if (process.env.NODE_ENV !== 'production') return;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const SQL = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      invite_token TEXT,
      invite_token_exp TIMESTAMPTZ,
      reset_token TEXT,
      reset_token_exp TIMESTAMPTZ,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      division TEXT,
      head_coach UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_teams (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS divisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      age_group TEXT,
      eligibility_mode TEXT NOT NULL DEFAULT 'age',
      min_birth_year INTEGER,
      max_birth_year INTEGER,
      min_grade INTEGER,
      max_grade INTEGER,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      label TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT false,
      offer_expires_days INTEGER NOT NULL DEFAULT 14,
      se_program_id TEXT,
      se_registration_url TEXT,
      registration_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      parent_first_name TEXT,
      parent_last_name TEXT,
      parent_email TEXT,
      birth_date DATE,
      graduation_year INTEGER,
      grade INTEGER,
      team_id UUID REFERENCES teams(id),
      season_id UUID REFERENCES seasons(id),
      division_id UUID REFERENCES divisions(id),
      status TEXT NOT NULL DEFAULT 'draft',
      offer_type TEXT,
      early_offer_eligible BOOLEAN NOT NULL DEFAULT false,
      notes TEXT,
      se_data JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS players_season_idx ON players(season_id);
    CREATE INDEX IF NOT EXISTS players_team_idx ON players(team_id);
    CREATE INDEX IF NOT EXISTS players_status_idx ON players(status);
    CREATE INDEX IF NOT EXISTS players_profile_idx ON players(profile_id);

    CREATE TABLE IF NOT EXISTS offers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id UUID NOT NULL REFERENCES players(id),
      season_id UUID NOT NULL REFERENCES seasons(id),
      sent_by UUID REFERENCES users(id),
      offer_type TEXT NOT NULL,
      sent_method TEXT NOT NULL DEFAULT 'sendgrid',
      accept_token TEXT UNIQUE,
      decline_token TEXT UNIQUE,
      expires_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      declined_at TIMESTAMPTZ,
      sendgrid_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS offers_player_idx ON offers(player_id);
    CREATE INDEX IF NOT EXISTS offers_season_idx ON offers(season_id);
    CREATE INDEX IF NOT EXISTS offers_accept_token_idx ON offers(accept_token);
    CREATE INDEX IF NOT EXISTS offers_decline_token_idx ON offers(decline_token);

    CREATE TABLE IF NOT EXISTS email_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_key TEXT NOT NULL UNIQUE,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id UUID REFERENCES users(id),
      actor_name TEXT,
      event_type TEXT NOT NULL,
      player_id UUID REFERENCES players(id),
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS activity_log_player_idx ON activity_log(player_id);
    CREATE INDEX IF NOT EXISTS activity_log_actor_idx ON activity_log(actor_id);
  `;

  try {
    console.log('Initializing database schema…');
    await pool.query(SQL);
    console.log('Schema ready.');
  } catch (err) {
    console.error('Schema init failed (non-fatal):', err);
  } finally {
    await pool.end();
  }
}

// Start HTTP server immediately so /health responds during schema init
const app = createApp();
app.listen(PORT, () => {
  console.log(`JRC Offer Management server running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
  // Run schema init after server is listening — non-blocking
  initSchema();
});
