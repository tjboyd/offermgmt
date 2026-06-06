# Technical Architecture Document
# Hamilton Jr Chargers — Offer Management System

**Version:** 1.0  
**Date:** 2026-05-31  
**Status:** Draft — For Developer Review  
**Companion document:** PRD v1.7

---

## 1. System Overview

The Hamilton Jr Chargers Offer Management System is an internal web application that manages the full player recruitment pipeline for a youth baseball organization. It replaces ad-hoc email tracking with a structured, auditable workflow covering offer creation, email delivery, tokenized acceptance, and SportsEngine registration handoff.

### What the system does

- Maintains a multi-season roster of tryout registrants, with status tracking through the offer pipeline (draft → sent → accepted / declined / expired / rejected / waitlisted).
- Supports two offer workflows: **early (pre-tryout) offers** for returning players and **post-tryout offers** for new and returning players.
- Sends personalized offer and rejection emails via SendGrid, or generates fully merged email copy for manual paste-and-send.
- Tracks email engagement (sent, opened, link clicked) via SendGrid webhooks.
- Provides a **publicly accessible, tokenized acceptance landing page** where parents confirm or decline an offer without any login — the token itself is the credential.
- Syncs tryout registrant data from SportsEngine (read-only) on demand, with upsert logic that preserves all app-managed data.
- Stores a complete per-player activity log (every state transition, flag set, email sent, parent action).

### Primary users

| Role | Count (estimated) | Primary device |
|---|---|---|
| Admin | 1–2 | Desktop |
| Board | 2–4 | Desktop |
| Head Coach | 4–8 | Desktop / laptop during tryouts |
| Assistant Coach | 4–12 | Desktop (read-only, limited actions) |
| Parents (landing page only) | Varies per season | Mobile phone |

### Key integrations

| Integration | Direction | Purpose |
|---|---|---|
| SportsEngine API | Read-only inbound | Tryout registrant sync, returning player lookup |
| SendGrid API | Outbound | Transactional offer / rejection / confirmation emails |
| SendGrid Webhooks | Inbound | Open and click tracking (update `offer.opened_at`) |

---

## 2. Technology Stack

### Recommended stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend framework | **React (Vite)** | Dominant ecosystem, excellent component libraries, Vite for fast dev iteration |
| UI component library | **shadcn/ui + Tailwind CSS** | Unstyled-first, dark-theme friendly, small bundle, easy long-term maintenance |
| Backend framework | **Node.js + Express (TypeScript)** | Same language both sides reduces context switching for a small team; large ecosystem; TypeScript eliminates a class of runtime bugs |
| Database | **PostgreSQL 16** | Relational integrity for FK chains (players → offers → activity); JSONB available for flexible fields; robust managed offerings on all major PaaS |
| ORM / query layer | **Drizzle ORM** | Type-safe, lightweight, close-to-SQL philosophy; schema-as-code; excellent migration story; lower magic than Prisma |
| Authentication | **Custom JWT — access + refresh token** (no Auth0 / Clerk) | Admin-invite-only model fits naturally in custom code; avoids external auth service dependency and monthly cost; bcrypt + httpOnly cookie straightforward to implement |
| Email | **SendGrid** (confirmed in PRD) | Transactional send, open/click webhooks, sender identity management |
| Hosting | **Render** | Free-tier PostgreSQL for dev, predictable paid tiers, GitHub-linked auto-deploy, managed TLS, no DevOps overhead |
| File/asset storage | None (v1) | No file uploads in scope |
| Secret/key storage | **Environment variables** for app-level secrets (JWT signing key, encryption key); all third-party credentials (SE, SendGrid) in the encrypted `integrations` DB table | Separates app bootstrap secrets from runtime-configurable credentials |

### Tradeoffs and flags

- **Node + Express over Next.js**: Next.js would add SSR complexity and framework opinions that don't benefit a desktop-first SPA with a clear API boundary. A plain Express API + Vite SPA is simpler to reason about and easier for a new dev to take over.
- **Drizzle over Prisma**: Prisma's generated client has historically caused issues with connection pooling on PaaS (especially serverless); Drizzle's query builder compiles directly to SQL and makes migrations explicit and portable.
- **Render over Vercel + Supabase combo**: Keeping web service and database on a single PaaS reduces the number of vendor relationships and dashboards for a small non-profit team.
- **Custom auth over Auth0/Clerk**: The admin-invite-only model, email domain allowlist enforcement, and forced password reset with token versioning are all non-standard enough that wrapping a managed auth service would require more glue code than just doing it directly. For a small internal app this is the right call.
- **No separate CDN in v1**: Traffic volume is low. Render serves static assets adequately. Add Cloudflare if performance becomes a concern.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSERS                            │
│                                                                     │
│  ┌──────────────────────────────┐   ┌────────────────────────────┐  │
│  │   Coaching App (SPA)         │   │  Acceptance Landing Page   │  │
│  │   React + Vite               │   │  (public, no auth)         │  │
│  │   Desktop-first              │   │  Mobile-first              │  │
│  │   Served as static bundle    │   │  Served by Express         │  │
│  └──────────────┬───────────────┘   └───────────┬────────────────┘  │
└─────────────────┼─────────────────────────────── ┼ ─────────────────┘
                  │ HTTPS / JSON REST               │ HTTPS
                  ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXPRESS API SERVER (Node.js / TypeScript)        │
│                                                                     │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────────┐    │
│  │  Auth        │  │  API Routes    │  │  Public Routes       │    │
│  │  Middleware  │  │  (JWT-gated)   │  │  /accept/:token      │    │
│  │  JWT verify  │  │  /api/v1/...   │  │  /decline/:token     │    │
│  │  RBAC checks │  │                │  │  /webhooks/sendgrid  │    │
│  └──────────────┘  └───────┬────────┘  └──────────────────────┘    │
│                             │                                       │
│  ┌──────────────────────────┴──────────────────────────────────┐    │
│  │                    Service Layer                            │    │
│  │  AuthService | PlayerService | OfferService | SyncService  │    │
│  │  EmailService | TokenService | ConfigService               │    │
│  └────────────┬───────────────────────────┬────────────────────┘    │
│               │                           │                         │
│  ┌────────────▼──────────┐   ┌────────────▼──────────────────────┐  │
│  │  Drizzle ORM          │   │  External API Clients             │  │
│  │  PostgreSQL driver    │   │  SEApiClient (read-only)          │  │
│  └────────────┬──────────┘   │  SendGridClient                   │  │
│               │              └────────────┬──────────────────────┘  │
└───────────────┼──────────────────────── ───┼─────────────────────────┘
                │                            │
                ▼                            ▼
┌───────────────────────┐      ┌─────────────────────────────────────┐
│   PostgreSQL 16        │      │   External APIs                     │
│   (Render managed)     │      │                                     │
│                        │      │  SportsEngine API (read-only)       │
│  - All app tables      │      │  oauth2/token + registrants         │
│  - Encrypted creds     │      │                                     │
│    in integrations     │      │  SendGrid API                       │
│    table               │      │  send + webhooks                    │
└───────────────────────┘      └─────────────────────────────────────┘
```

**Static asset delivery**: The React SPA is built to `/dist` and served by Express as static files. A single Express server handles both the SPA (`GET *` → `index.html`) and the API (`/api/v1/*`). Public routes (`/accept/:token`, `/decline/:token`, `/webhooks/sendgrid`) are also on the same server.

**Acceptance landing page**: Not a separate deployment. It is a public Express route that renders a minimal server-side HTML page (or serves the React SPA with a public route component). Recommend rendering it server-side (Express + a simple template) to eliminate any authentication bootstrapping from the React app on the public token path.

---

## 4. Data Model

All tables use `uuid` primary keys generated by the application layer (`crypto.randomUUID()`). Timestamps are `timestamptz` (UTC). Enum types are defined as PostgreSQL `TEXT` with check constraints so that adding a new value is a non-breaking migration.

---

### 4.1 `users`

```sql
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL UNIQUE,
  role                TEXT NOT NULL CHECK (role IN ('admin','board','head_coach','assistant_coach')),
  password_hash       TEXT,                        -- null until account activated
  email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  invite_token        TEXT,                        -- time-limited invite/verify link token
  invite_token_exp    TIMESTAMPTZ,
  reset_token         TEXT,                        -- password reset token
  reset_token_exp     TIMESTAMPTZ,
  token_version       INTEGER NOT NULL DEFAULT 0,  -- incremented on forced reset; invalidates all JWTs
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at       TIMESTAMPTZ
);

CREATE INDEX users_email_idx ON users (email);
```

**Notes:**
- `token_version` is embedded in the JWT payload. On validation, the server checks the JWT's `token_version` against the DB. If they differ, the token is rejected.
- `invite_token` and `reset_token` are single-use, short-lived, and cleared after use.
- `password_hash` is null for accounts that have been invited but not yet activated.

---

### 4.2 `teams`

```sql
CREATE TABLE teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,          -- e.g. "12U AAA"
  division_id  UUID REFERENCES divisions(id) ON DELETE SET NULL,  -- optional division assignment
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 4.3 `user_team_assignments`

```sql
CREATE TABLE user_team_assignments (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role_at_team  TEXT NOT NULL CHECK (role_at_team IN ('head_coach','assistant_coach')),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, team_id)
);
```

---

### 4.4 `seasons`

```sql
CREATE TABLE seasons (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label                 TEXT NOT NULL UNIQUE,       -- e.g. "2027"
  se_tryout_form_names  TEXT[] NOT NULL DEFAULT '{}', -- e.g. '{"2027 Season Tryouts","2027 Private Tryouts"}'
  se_registration_url   TEXT,                       -- "Accept & Register" redirect destination
  offer_expires_days    INTEGER NOT NULL DEFAULT 14,
  tryout_start          DATE,
  tryout_end            DATE,
  season_start_date     DATE,                       -- used for age eligibility calculations in divisions
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one season can be active at a time — enforce in application logic.
-- Partial unique index as a guard:
CREATE UNIQUE INDEX seasons_one_active ON seasons (is_active) WHERE is_active = TRUE;
```

**Notes:**
- `season_start_date` is used by `EligibilityService` to compute a player's age at the start of the season. If not set, age-based eligibility checks are skipped and a warning is surfaced in the Composer.

---

### 4.5 `divisions`

One row per division per season. Divisions define the eligibility rules (age range and/or allowed grades) that apply to the teams assigned to them.

```sql
CREATE TABLE divisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,          -- e.g. "12U", "10U AA"
  min_age         SMALLINT,               -- minimum age as of season_start_date (inclusive), null = no lower bound
  max_age         SMALLINT,               -- maximum age as of season_start_date (inclusive), null = no upper bound
  allowed_grades  TEXT[],                 -- e.g. '{"5","6"}'; null or empty = any grade allowed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_id, name)
);

CREATE INDEX divisions_season_idx ON divisions (season_id);
```

**Notes:**
- At least one of `min_age`, `max_age`, or `allowed_grades` should be set for a division to have any effect; an entirely unconstrained division is allowed (no-op for eligibility).
- `min_age` and `max_age` are enforced to satisfy `min_age <= max_age` at the application layer when both are provided.
- Age is calculated as `floor((season_start_date - player.date_of_birth) / 365.25)`. If `seasons.season_start_date` or `players.date_of_birth` is null, the age check is skipped and an advisory warning is returned.
- `allowed_grades` comparison is case-insensitive string matching against `players.grade`.
- Deleting a division sets `teams.division_id` to null via the FK's `ON DELETE SET NULL` cascade — teams are not affected.

---

### 4.7 `players`

```sql
CREATE TABLE players (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id               UUID NOT NULL REFERENCES seasons(id),
  team_id                 UUID REFERENCES teams(id),
  se_id                   TEXT,                      -- SportsEngine member ID, unique within season
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  date_of_birth           DATE,
  grade                   TEXT,                      -- e.g. "6"
  parent_name             TEXT,
  parent_email            TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','sent','accepted','declined',
                                              'expired','waitlisted','rejected')),
  offer_type              TEXT CHECK (offer_type IN ('early','post_tryout')),
  is_returning            BOOLEAN NOT NULL DEFAULT FALSE,
  returning_flagged_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  returning_flagged_at    TIMESTAMPTZ,
  returning_source        TEXT CHECK (returning_source IN ('se_match','manual')),
  early_offer_eligible    BOOLEAN NOT NULL DEFAULT FALSE,
  early_offer_set_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  early_offer_set_at      TIMESTAMPTZ,
  notes                   TEXT,                      -- coach-only, never sent to parents
  imported_from_se        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX players_season_idx ON players (season_id);
CREATE INDEX players_team_idx ON players (team_id);
CREATE INDEX players_se_id_idx ON players (se_id) WHERE se_id IS NOT NULL;
CREATE INDEX players_dob_name_idx ON players (lower(first_name), lower(last_name), date_of_birth);
```

**Notes:**
- `se_id` is not globally unique — the same person may have the same SE ID across multiple seasons. Unique within `(season_id, se_id)` can be enforced with a partial unique index if desired.
- `age` is derived at read-time from `date_of_birth` (or from `players_age_override` if manually entered). Do not persist a computed `age` column — it goes stale.

```sql
-- Optional: store age override only when manually entered and DOB unknown
ALTER TABLE players ADD COLUMN age_override SMALLINT;
```

---

### 4.8 `offers`

One row per offer attempt. A player can have multiple offers over time (e.g., re-offer after expiry). The **current active offer** for a player is the most recent row.

```sql
CREATE TABLE offers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id             UUID NOT NULL REFERENCES seasons(id),
  sent_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  offer_type            TEXT NOT NULL CHECK (offer_type IN ('early','post_tryout','rejection')),
  sent_method           TEXT CHECK (sent_method IN ('sendgrid','manual_copy')),
  accept_token          TEXT UNIQUE,                -- crypto.randomUUID(), set on send
  decline_token         TEXT UNIQUE,
  sendgrid_message_id   TEXT,                       -- for webhook correlation
  sent_at               TIMESTAMPTZ,
  opened_at             TIMESTAMPTZ,                -- set by SendGrid open webhook
  landing_viewed_at     TIMESTAMPTZ,                -- parent loaded /accept/:token page
  accepted_at           TIMESTAMPTZ,
  declined_at           TIMESTAMPTZ,
  se_redirected_at      TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX offers_player_idx ON offers (player_id);
CREATE INDEX offers_accept_token_idx ON offers (accept_token) WHERE accept_token IS NOT NULL;
CREATE INDEX offers_decline_token_idx ON offers (decline_token) WHERE decline_token IS NOT NULL;
CREATE INDEX offers_sendgrid_msg_idx ON offers (sendgrid_message_id) WHERE sendgrid_message_id IS NOT NULL;
```

**Notes:**
- `rejection` offers have no `accept_token` / `decline_token` — they are send-only.
- `expires_at` is computed at send time as `sent_at + INTERVAL '<offer_expires_days> days'` from the season's `offer_expires_days` setting (or the deadline manually chosen in the Composer).

---

### 4.9 `activity_log`

```sql
CREATE TABLE activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID REFERENCES players(id) ON DELETE SET NULL,
  offer_id    UUID REFERENCES offers(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,   -- null for parent-triggered events
  actor_label TEXT,      -- denormalized name for display: "Coach Smith" or "Parent via link"
  event_type  TEXT NOT NULL,
  -- event_type values:
  -- player_added | returning_flag_set | returning_flag_cleared
  -- early_offer_eligible_set | early_offer_eligible_cleared
  -- offer_sent | offer_resent | rejection_sent
  -- email_opened | landing_page_viewed
  -- offer_accepted | offer_declined | offer_expired
  -- se_redirected | confirmation_email_sent
  -- status_changed | note_added | note_edited
  -- player_edited | player_removed
  detail      JSONB,     -- arbitrary structured detail (e.g. {from:"draft", to:"sent"})
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_log_player_idx ON activity_log (player_id, ts DESC);
CREATE INDEX activity_log_ts_idx ON activity_log (ts DESC);
```

---

### 4.10 `se_sync_log`

```sql
CREATE TABLE se_sync_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id             UUID NOT NULL REFERENCES seasons(id),
  triggered_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  triggered_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  form_names_queried    TEXT[],
  records_fetched       INTEGER,
  records_new           INTEGER,
  records_updated       INTEGER,
  records_skipped       INTEGER,
  error_message         TEXT,        -- null on success
  completed_at          TIMESTAMPTZ
);

CREATE INDEX se_sync_log_season_idx ON se_sync_log (season_id, triggered_at DESC);
```

---

### 4.11 `email_templates`

```sql
CREATE TABLE email_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id    UUID NOT NULL REFERENCES seasons(id),
  template_key TEXT NOT NULL CHECK (template_key IN ('early_offer','offer_letter','rejection_letter')),
  subject      TEXT NOT NULL,
  body_html    TEXT NOT NULL,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_id, template_key)
);
```

---

### 4.12 `config`

Key/value store for admin-configurable application settings. Values are stored as JSON text to accommodate scalars, arrays, and objects without schema changes.

```sql
CREATE TABLE config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,    -- JSON-encoded value
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Seed rows** (values JSON-encoded):

| key | default value | notes |
|---|---|---|
| `allowed_domains` | `["jrchargersbaseball.com"]` | Array of permitted email domains |
| `session_timeout_hours` | `8` | Idle session expiry |
| `password_min_length` | `12` | |
| `password_require_mixed_case` | `true` | |
| `password_require_number` | `true` | |
| `show_reset_data_ui` | `false` | Set to `true` in dev/demo only |

---

### 4.13 `integrations`

Encrypted credential storage. AES-256-GCM encryption applied at the application layer before write; decrypted only server-side, never returned to the browser.

```sql
CREATE TABLE integrations (
  key             TEXT PRIMARY KEY,
  encrypted_value TEXT NOT NULL,    -- AES-256-GCM encrypted JSON blob
  iv              TEXT NOT NULL,    -- base64-encoded initialization vector
  auth_tag        TEXT NOT NULL,    -- base64-encoded GCM auth tag
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Stored keys:**

| key | decrypted structure |
|---|---|
| `sportsengine` | `{ client_id, client_secret, cached_token, cached_token_exp }` |
| `sendgrid` | `{ api_key, sender_name, sender_email }` |

**Note:** The `cached_token` in the `sportsengine` entry stores the most recently obtained SE bearer token and its expiry. On each SE API call, the service layer checks if the cached token is still valid before re-exchanging credentials. This avoids unnecessary token request overhead.

---

### 4.14 `wizard_progress`

Persists new season wizard state across sessions. Minimal table.

```sql
CREATE TABLE wizard_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID REFERENCES seasons(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id) ON DELETE CASCADE,
  step        SMALLINT NOT NULL DEFAULT 1,
  draft_data  JSONB,     -- partial wizard form state
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. Authentication & Authorization

### 5.1 Token architecture

- **Access token**: JWT signed with `HS256`, expiry **15 minutes**. Payload: `{ sub: user.id, role, token_version, iat, exp }`.
- **Refresh token**: Opaque random token (32-byte hex), stored in the DB as a hash, sent to the client as an **httpOnly, Secure, SameSite=Strict cookie**. Expiry: **7 days** (or `session_timeout_hours` if shorter).
- The React SPA stores the access token **in memory only** (not localStorage, not sessionStorage). On page refresh, the SPA calls `POST /api/v1/auth/refresh` with the httpOnly cookie to get a new access token.
- All API routes (except public routes and `/api/v1/auth/*`) require a valid `Authorization: Bearer <access_token>` header.

### 5.2 Invite and activation flow

```
Admin creates account (Settings → Users → Invite User)
  → server validates email domain against config.allowed_domains
  → creates users row (email_verified=false, password_hash=null)
  → generates invite_token = crypto.randomUUID()
  → stores bcrypt hash of invite_token + expiry (24h) in users row
  → sends email via SendGrid: "Set up your account" link
      https://app.hamiltonjrchargers.com/activate?token={raw_invite_token}

User clicks link:
  → GET /activate?token=... → React SPA loads ActivatePage component
  → SPA calls POST /api/v1/auth/activate { token, password }
  → server: hash token, look up user by invite_token hash, check expiry
  → set password_hash = bcrypt.hash(password, 12)
  → set email_verified=true, invite_token=null, invite_token_exp=null
  → return access token + set refresh token cookie
  → user lands on Dashboard
```

### 5.3 Password reset flow

```
Admin triggers reset (Settings → Users → Force Password Reset)
  → server: generate reset_token, store hash + 1h expiry in users row
  → increment users.token_version  ← immediately invalidates all JWTs
  → send password reset email via SendGrid

User clicks link → sets new password → token_version unchanged
  (version was already incremented at trigger time)
```

### 5.4 Password policy enforcement

The configured policy from the `config` table is enforced server-side in the `AuthService.validatePassword()` function. The values are read at request time (cached in memory with a short TTL) so that an admin changing the policy in Settings takes effect without a restart.

### 5.5 Role-based access control (RBAC)

Implemented as Express middleware applied per route. A `requireRole(...roles)` middleware factory checks `req.user.role` against the allowed list and returns `403` if the role is not permitted.

| Resource | admin | board | head_coach | assistant_coach |
|---|---|---|---|---|
| View dashboard (own scope) | ✓ | ✓ | ✓ | ✓ |
| View roster (own scope) | ✓ | ✓ | ✓ | ✓ |
| View player detail | ✓ | ✓ | ✓ | ✓ |
| Add / edit player | ✓ | ✓ | ✓ (own teams) | ✗ |
| Set returning flag | ✓ | ✓ | ✓ (own teams) | ✓ (own teams) |
| Set early offer eligible | ✓ | ✓ | ✓ (own teams) | ✗ |
| Add / edit coach notes | ✓ | ✓ | ✓ (own teams) | ✓ (own teams) |
| Send offer / rejection | ✓ | ✓ | ✓ (own teams) | ✗ |
| Access Settings | ✓ | ✓ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ | ✗ |
| Assign roles (admin/board) | ✓ | ✗ | ✗ | ✗ |
| Assign roles (coach) | ✓ | ✓ | ✗ | ✗ |
| Trigger SE sync | ✓ | ✓ | ✗ | ✗ |

**Team scope enforcement**: For head coaches and assistant coaches, every data-access query includes a `WHERE players.team_id IN (SELECT team_id FROM user_team_assignments WHERE user_id = $userId)` clause, applied in the service layer. The role middleware alone is not sufficient — team scope must be enforced in the service layer too.

### 5.6 Domain allowlist enforcement

`AuthService.validateEmailDomain(email)` reads `config.allowed_domains` and is called at two points:
1. When an Admin creates an invite (`POST /api/v1/users/invite`)
2. When a user activates their account (`POST /api/v1/auth/activate`)

If the domain is not in the allowlist at either check, the request fails with `403 Forbidden`.

---

## 6. SportsEngine Integration

### 6.1 OAuth 2.0 client credentials flow

```
SEApiClient.getToken():
  1. Read integration row key='sportsengine' from DB, decrypt value
  2. If cached_token exists AND cached_token_exp > NOW() + 60s → return cached_token
  3. POST https://api.sportsengine.com/oauth2/token
       Content-Type: application/x-www-form-urlencoded
       Body: grant_type=client_credentials&client_id=...&client_secret=...
  4. On success: update cached_token + cached_token_exp in integrations table (re-encrypt)
  5. Return access_token
```

All SE API calls are made through a single `SEApiClient` class that calls `getToken()` before every request. This is the only place SE credentials are decrypted or used.

### 6.2 Credential storage

SE credentials are stored in the `integrations` table as an AES-256-GCM encrypted JSON blob. The encryption key is an environment variable (`INTEGRATION_ENCRYPTION_KEY`), 32-byte hex. The IV is randomly generated per write. This means:

- Credentials are never in code, environment variables, or config files.
- They are set through the admin UI (Settings → Integrations → SportsEngine).
- They are never returned to the browser after save — the API endpoint that reads integration settings returns masked placeholders.
- Rotating credentials requires only an update through the admin UI; no redeployment.

### 6.3 Tryout sync: endpoint, response shape, and upsert logic

**Assumed SE API endpoint** (confirm with SE API docs at build time):

```
GET https://api.sportsengine.com/v3/registrations
  ?form_name={urlencoded_form_name}
  &page={n}
  &per_page=100
Authorization: Bearer {access_token}
```

**Assumed response shape:**

```json
{
  "data": [
    {
      "id": "se_member_id",
      "first_name": "Jake",
      "last_name": "Smith",
      "date_of_birth": "2014-03-15",
      "grade": "6",
      "guardian_name": "Mike Smith",
      "guardian_email": "msmith@example.com",
      "registered_at": "2026-06-01T14:00:00Z"
    }
  ],
  "meta": { "total": 42, "page": 1, "per_page": 100 }
}
```

**Upsert logic** (`SyncService.syncSeason(seasonId, triggeredByUserId)`):

```
For each registrant record from SE API:
  1. Try to match existing player:
     - First: WHERE season_id = ? AND se_id = registrant.id
     - Fallback: WHERE season_id = ? AND lower(first_name) = lower(?) 
                   AND lower(last_name) = lower(?) AND date_of_birth = ?
  
  2a. No match found → INSERT new player (status='draft', imported_from_se=true)
      → log activity event: player_added (detail: {source:'se_sync'})
  
  2b. Match found → UPDATE only SE-sourced fields:
        se_id, first_name, last_name, date_of_birth, grade,
        parent_name, parent_email
      → DO NOT TOUCH: team_id, status, offer_type, is_returning,
        early_offer_eligible, notes, any offer data
      → log activity event if contact info changed (detail: {changed_fields:[...]})
  
  3. Players already in DB but not in SE → leave untouched (no delete, no flag)

  4. Write se_sync_log row on completion with counts and any errors
```

**Pagination**: The sync loops until all pages are fetched. If `se_tryout_form_names` has multiple values, the sync runs once per form name and combines results.

### 6.4 Returning player lookup

```
SyncService.lookupReturningPlayers(currentSeasonId):
  1. Get all prior seasons (is_archived = true OR (id != currentSeasonId))
  2. For each prior season, call SE API for historical roster/registration data
     (same endpoint pattern, by prior season's form names)
  3. For each result, try to match players in the current season by:
     a. se_id match (preferred)
     b. lower(first_name) + lower(last_name) + date_of_birth (fallback)
  4. For matched current-season players:
     → SET is_returning = true, returning_source = 'se_match'
     → DO NOT overwrite is_returning if already manually set
     → log activity event: returning_flag_set (detail: {source:'se_match'})
```

### 6.5 Error handling

| Condition | Behavior |
|---|---|
| Credentials missing (integrations row empty) | 503 with `{ error: 'SE_CREDENTIALS_MISSING', settingsPath: '/settings/integrations' }` |
| Token exchange fails (401 from SE) | 502 with `SE_AUTH_FAILED`; clear cached token |
| Form name not found / zero results | Return success with `records_fetched: 0`; write warning to sync log |
| SE API rate limit (429) | Retry with exponential backoff (3 attempts: 1s, 4s, 16s), then fail with `SE_RATE_LIMITED` |
| SE API 5xx | Retry once after 2s, then fail with `SE_API_ERROR`; write error to sync log |
| Partial failure mid-sync | Write partial counts to sync log with `error_message` describing where it stopped |

### 6.6 Read-only enforcement

- The `SEApiClient` class only implements `get()`. There is no `post()`, `put()`, `patch()`, or `delete()` method.
- A lint rule (ESLint custom rule or comment convention) flags any non-GET call to the SE API base URL.
- Code review checklist item: verify no SE write calls exist.

---

## 7. SendGrid Integration

### 7.1 Transactional send flow

All outbound emails go through `EmailService.send(options)`, which:

1. Reads `integrations` row `key='sendgrid'`, decrypts to get `api_key`, `sender_name`, `sender_email`.
2. Merges template variables into the `body_html` from the `email_templates` table using a simple `{{variable}}` interpolation function (server-side, no template engine dependency needed).
3. Calls the SendGrid REST API (`POST https://api.sendgrid.com/v3/mail/send`).
4. Sets `tracking_settings.open_tracking.enable = true` and `click_tracking.enable = true`.
5. Stores the `X-Message-ID` response header as `offers.sendgrid_message_id` for webhook correlation.
6. Logs `offer_sent` activity event.

### 7.2 Template approach

Templates are stored in the `email_templates` table (body as HTML string with `{{merge_field}}` placeholders). SendGrid's **dynamic templates** feature is NOT used — templates are managed in this app's database, merged server-side, and sent as pre-rendered HTML. This keeps templates fully under admin control without any SendGrid dashboard access.

Merge fields supported: `{{playerFirstName}}`, `{{playerLastName}}`, `{{parentName}}`, `{{team}}`, `{{season}}`, `{{deadline}}`, `{{acceptUrl}}`, `{{declineUrl}}`, `{{orgName}}`.

The merge function escapes HTML in all inserted values to prevent injection.

### 7.3 Acceptance token embedding

At send time, `OfferService.prepareOffer(playerId, offerType, expiresAt)`:

1. Generates two tokens: `accept_token = crypto.randomUUID()` and `decline_token = crypto.randomUUID()`.
2. Stores both (plaintext, no hash needed — they are unpredictable and short-lived) on the `offers` row.
3. Constructs URLs: `https://offers.hamiltonjrchargers.com/accept/{accept_token}` and `/decline/{decline_token}`.
4. Passes `acceptUrl` and `declineUrl` as merge fields to the template.

Tokens are stored as plaintext (not hashed) because they need to be looked up directly. Their security comes from being cryptographically random (UUID v4 has 122 bits of entropy) and expiring. They are single-use: once an offer is accepted or declined, the token cannot be used again (the offer's accepted/declined timestamp is set and checked at lookup time).

### 7.4 Open and click tracking webhooks

SendGrid posts event data to a configured webhook endpoint. Configure in SendGrid dashboard:

```
Webhook URL: https://app.hamiltonjrchargers.com/webhooks/sendgrid
Events: open, click
```

**Webhook handler** (`POST /webhooks/sendgrid`):

```
1. Verify SendGrid signature header (X-Twilio-Email-Event-Webhook-Signature)
   using SENDGRID_WEBHOOK_SIGNING_KEY env var.
2. Parse event array from body.
3. For each event:
   - event.event = 'open': 
       UPDATE offers SET opened_at = event.timestamp 
       WHERE sendgrid_message_id = event.sg_message_id AND opened_at IS NULL
       → log activity: email_opened
   - event.event = 'click':
       (click on the accept/decline link will also be captured by the landing page,
        so webhook click events are supplemental tracking only)
4. Return 200 immediately to avoid SendGrid retry storms.
```

This endpoint is **public** (no JWT required) but validates the SendGrid signature.

### 7.5 Manual copy path

`EmailService.renderForCopy(playerId, offerId)`:

1. Fetches template, merges all fields server-side (including `acceptUrl`, `declineUrl`).
2. Returns `{ subject: string, bodyText: string, bodyHtml: string }` to the client.
3. The Composer UI displays the rendered output and provides a "Copy Email" button that copies `subject + "\n\n" + bodyText` to the clipboard.
4. Records `offer.sent_method = 'manual_copy'` and logs `offer_sent` activity.
5. Sets `accept_token`, `decline_token`, and `expires_at` on the offer record identically to SendGrid sends — the tokenized landing page works regardless of send method.

---

## 8. Tokenized Offer Acceptance Flow

### 8.1 Token generation and storage

At the moment an offer is committed (user clicks "Send via SendGrid" or "Copy Email" in Composer):

```javascript
const accept_token = crypto.randomUUID();   // 36-char UUID v4
const decline_token = crypto.randomUUID();
const expires_at = new Date(sent_at.getTime() + offer_expires_days * 86_400_000);

INSERT INTO offers (player_id, season_id, sent_by, offer_type, sent_method,
                    accept_token, decline_token, expires_at, sent_at, ...)
VALUES (...)
```

Tokens are stored as plaintext in the `offers` table. The `accept_token` and `decline_token` columns have `UNIQUE` constraints and partial indexes.

### 8.2 Token validation

`TokenService.validateAcceptToken(token)`:

```
1. SELECT o.*, p.*, s.se_registration_url
   FROM offers o
   JOIN players p ON p.id = o.player_id
   JOIN seasons s ON s.id = o.season_id
   WHERE o.accept_token = $1

2. If no row: return { state: 'invalid' }
3. If o.accepted_at IS NOT NULL: return { state: 'already_accepted', se_url }
4. If o.declined_at IS NOT NULL: return { state: 'already_declined' }
5. If NOW() > o.expires_at: return { state: 'expired', expired_on: o.expires_at }
6. Return { state: 'valid', player, team, season, expires_at, se_url }
```

### 8.3 Acceptance landing page

Route: `GET /accept/:token` (public Express route, no JWT middleware)

The server renders a minimal HTML response (not the React SPA) to avoid requiring JS for the parent's experience and to keep the token validation entirely server-side.

```
Render flow:
  1. Call TokenService.validateAcceptToken(req.params.token)
  2. Render appropriate HTML state (valid, already_accepted, already_declined, expired, invalid)
  3. For valid state: render branded page with player name, team, season, expiry,
     "Confirm Acceptance" form (POST /accept/:token) + "Decline this offer" link (/decline/:token)
```

The "Confirm Acceptance" and "Decline" actions are standard HTML form POSTs — no JavaScript required. This ensures the flow works on any mobile browser regardless of JS loading.

### 8.4 State machine and idempotency

```
POST /accept/:token:
  1. Re-validate token (call TokenService.validateAcceptToken again)
  2. BEGIN TRANSACTION
  3. UPDATE offers SET accepted_at = NOW(), landing_viewed_at = COALESCE(landing_viewed_at, NOW())
     WHERE accept_token = $1 AND accepted_at IS NULL AND declined_at IS NULL AND expires_at > NOW()
     RETURNING id
  4. If no rows updated (race condition / already accepted):
     → ROLLBACK; re-validate and return appropriate state page
  5. UPDATE players SET status = 'accepted' WHERE id = offer.player_id
  6. INSERT INTO activity_log (player_id, offer_id, event_type='offer_accepted', actor_label='Parent via link')
  7. COMMIT
  8. Send confirmation email to parent via SendGrid (async — do not block redirect)
  9. Send notification to assigned head coach + admin users (async)
  10. HTTP 302 redirect to season.se_registration_url
```

### 8.5 Decline flow

`POST /decline/:token` follows the same pattern but sets `offers.declined_at` and `players.status = 'declined'`. No redirect to SE registration.

### 8.6 Landing page states

| State | What happened | Page shows |
|---|---|---|
| `valid` | Token valid, offer pending | Player name, team, season, expiry date, Confirm button, Decline link |
| `already_accepted` | `accepted_at IS NOT NULL` | "You've already accepted. Complete SportsEngine registration." + SE link |
| `already_declined` | `declined_at IS NOT NULL` | "You've indicated you won't be joining us. Contact your coach if this was a mistake." |
| `expired` | `NOW() > expires_at` | "This offer expired on [date]. Contact board@hamiltonjrchargers.com." |
| `invalid` | No matching token | "This link is not valid." |

---

## 9. API Design

All routes under `/api/v1/`. Auth routes are unauthenticated. All others require `Authorization: Bearer <access_token>` unless marked Public.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Public | Email + password → access token + refresh cookie |
| POST | `/api/v1/auth/refresh` | Cookie | Exchange refresh cookie → new access token |
| POST | `/api/v1/auth/logout` | JWT | Invalidate refresh token |
| POST | `/api/v1/auth/activate` | Public | Activate account with invite token + set password |
| POST | `/api/v1/auth/reset-password` | Public | Set new password with reset token |
| GET | `/api/v1/auth/me` | JWT | Current user profile + role + team assignments |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/users` | admin | List all users with status |
| POST | `/api/v1/users/invite` | admin | Create account + send invite email |
| GET | `/api/v1/users/:id` | admin | Get user detail |
| PATCH | `/api/v1/users/:id` | admin | Update name, role, team assignments |
| POST | `/api/v1/users/:id/force-reset` | admin | Trigger password reset + invalidate sessions |
| PATCH | `/api/v1/users/:id/deactivate` | admin | Deactivate account |
| PATCH | `/api/v1/users/:id/reactivate` | admin | Reactivate account |
| DELETE | `/api/v1/users/:id` | admin | Permanently delete account |
| POST | `/api/v1/users/:id/resend-invite` | admin | Re-send invite email |

### Teams

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/teams` | JWT | List teams (active only unless admin) |
| POST | `/api/v1/teams` | admin, board | Create team |
| PATCH | `/api/v1/teams/:id` | admin, board | Update name / division |
| PATCH | `/api/v1/teams/:id/deactivate` | admin, board | Deactivate team |
| GET | `/api/v1/teams/:id/coaches` | admin, board | List assigned coaches for team |
| PATCH | `/api/v1/teams/:id/coaches` | admin, board | Update coach assignments for team |

### Divisions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/divisions` | JWT | List divisions for a season (`?seasonId=` required) |
| POST | `/api/v1/divisions` | admin | Create a division for a season |
| GET | `/api/v1/divisions/:id` | JWT | Get division detail |
| PATCH | `/api/v1/divisions/:id` | admin | Update division name, age range, or allowed grades |
| DELETE | `/api/v1/divisions/:id` | admin | Delete division (sets teams.division_id to null via FK cascade) |

**Notes:**
- `POST` and `PATCH` validate that `min_age <= max_age` when both are provided; returns 422 otherwise.
- All routes return 403 for non-admin roles except `GET` (list and detail), which is readable by all authenticated users.

### Seasons

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/seasons` | JWT | List all seasons |
| POST | `/api/v1/seasons` | admin, board | Create season |
| GET | `/api/v1/seasons/:id` | JWT | Get season detail |
| PATCH | `/api/v1/seasons/:id` | admin, board | Update season fields |
| POST | `/api/v1/seasons/:id/activate` | admin, board | Set as active season |
| POST | `/api/v1/seasons/:id/archive` | admin, board | Archive season |
| GET | `/api/v1/seasons/:id/sync-log` | admin, board | List sync log entries |

### Players

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/players` | JWT | List players (scoped by role + team) |
| POST | `/api/v1/players` | admin, board, head_coach | Add player manually |
| GET | `/api/v1/players/:id` | JWT | Player detail + current offer |
| PATCH | `/api/v1/players/:id` | admin, board, head_coach | Update player fields |
| DELETE | `/api/v1/players/:id` | admin, board, head_coach | Remove player (soft delete recommended) |
| PATCH | `/api/v1/players/:id/returning-flag` | admin, board, head_coach, assistant_coach | Set / clear returning flag |
| PATCH | `/api/v1/players/:id/early-offer-eligible` | admin, board, head_coach | Set / clear early offer eligible flag |
| PATCH | `/api/v1/players/:id/notes` | admin, board, head_coach, assistant_coach | Update coach notes |
| PATCH | `/api/v1/players/:id/status` | admin, board, head_coach | Manual status override |
| GET | `/api/v1/players/:id/activity` | JWT | Activity log for player |

### Offers

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/offers` | admin, board, head_coach | Create offer(s) — one or bulk array |
| POST | `/api/v1/offers/render` | admin, board, head_coach | Server-renders merged email for copy path |
| GET | `/api/v1/offers/:id` | JWT | Get offer detail |

### Sync

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/sync/tryouts` | admin, board | Trigger tryout registrant sync for active season |
| POST | `/api/v1/sync/returning` | admin, board | Trigger returning player lookup from SE |
| POST | `/api/v1/sync/test-se` | admin, board | Test SE credentials (used in wizard + settings) |

### Settings / Config

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/config` | admin, board | Get all config key/values |
| PATCH | `/api/v1/config` | admin | Update config values |

### Integrations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/integrations` | admin, board | Get masked integration status (never returns raw values) |
| PUT | `/api/v1/integrations/sportsengine` | admin | Save SE credentials (write-only) |
| DELETE | `/api/v1/integrations/sportsengine` | admin | Clear SE credentials |
| PUT | `/api/v1/integrations/sendgrid` | admin | Save SendGrid credentials (write-only) |
| DELETE | `/api/v1/integrations/sendgrid` | admin | Clear SendGrid credentials |
| POST | `/api/v1/integrations/sendgrid/test` | admin | Send test email to current user |

### Email Templates

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/email-templates/:seasonId` | admin, board | Get all three templates for a season |
| PUT | `/api/v1/email-templates/:seasonId/:key` | admin, board | Update a template (key: early_offer, offer_letter, rejection_letter) |

### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/dashboard/stats` | JWT | Stat tile counts (scoped by role) |
| GET | `/api/v1/dashboard/activity` | JWT | Activity feed, last 30 days (scoped) |

### Wizard

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/wizard` | admin, board | Get in-progress wizard state |
| POST | `/api/v1/wizard` | admin, board | Start or update wizard draft |
| POST | `/api/v1/wizard/activate` | admin, board | Execute season activation + archive |

### Public Routes (no JWT)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/accept/:token` | Public | Acceptance landing page |
| POST | `/accept/:token` | Public | Confirm acceptance |
| GET | `/decline/:token` | Public | Decline confirmation page |
| POST | `/decline/:token` | Public | Confirm decline |
| POST | `/webhooks/sendgrid` | Signature | SendGrid event webhook |

---

## 10. Security Considerations

### Credential encryption at rest

SE and SendGrid credentials in the `integrations` table are encrypted with AES-256-GCM before write. The encryption key is 32 bytes of random hex stored as `INTEGRATION_ENCRYPTION_KEY` in the environment. A unique IV is generated per write. The decryption key never leaves the server process. Credentials are never returned to the browser in any API response.

### Token security

- Refresh tokens are sent only via `httpOnly; Secure; SameSite=Strict` cookies — inaccessible to JavaScript.
- Access tokens are held in React component state (memory) and sent as `Authorization` headers — never written to localStorage or cookies.
- The `token_version` field in `users` allows immediate invalidation of all tokens for a user on forced password reset without requiring a token blacklist table.

### Acceptance tokens

- Generated with `crypto.randomUUID()` — 122 bits of entropy, effectively unguessable.
- Single-use: once accepted or declined, the state check in the validation logic prevents re-use regardless of token knowledge.
- Expiring: hard timestamp check against `offers.expires_at`.
- No authentication bypass risk: tokens reveal only the player's name, team, season, and the SE registration URL — no user account data.

### Rate limiting

Apply `express-rate-limit` middleware:

| Route | Limit |
|---|---|
| `POST /api/v1/auth/login` | 10 requests per 15 minutes per IP |
| `POST /api/v1/auth/refresh` | 60 requests per 15 minutes per IP |
| `POST /api/v1/auth/activate` | 10 requests per hour per IP |
| `POST /api/v1/auth/reset-password` | 10 requests per hour per IP |
| `GET /accept/:token` | 30 requests per minute per IP |
| `POST /accept/:token` | 10 requests per minute per IP |
| All other API routes | 300 requests per minute per authenticated user |

### HTTPS

Enforce HTTPS at the Render platform level (automatic TLS). The Express app sets:

```javascript
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});
```

### Input validation

All request bodies are validated with **Zod** schemas before reaching service layer code. Drizzle ORM uses parameterized queries exclusively — no string interpolation in SQL. `pg` driver's native parameterization handles the rest.

### SE write enforcement

The `SEApiClient` class exposes only a `get(path, params)` method. There is no mechanism to make a non-GET call through it. This is a structural (not just policy) constraint.

### Environment variables

The following secrets live in environment variables (not in the DB):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SIGNING_KEY` | HMAC-SHA256 signing key for access tokens (32+ bytes) |
| `INTEGRATION_ENCRYPTION_KEY` | AES-256-GCM key for `integrations` table (32 bytes hex) |
| `SENDGRID_WEBHOOK_SIGNING_KEY` | For verifying SendGrid webhook signatures |
| `APP_BASE_URL` | e.g. `https://app.hamiltonjrchargers.com` |
| `OFFERS_BASE_URL` | e.g. `https://app.hamiltonjrchargers.com` (same app) |
| `NODE_ENV` | `production` or `development` |

Third-party API credentials (SE client ID/secret, SendGrid API key) live only in the encrypted `integrations` table.

---

## 11. Hosting & Infrastructure

### Recommended setup: Render

All services on Render (render.com). GitHub repository connected for automatic deployments on push to `main`.

| Service | Render product | Spec | Est. monthly cost |
|---|---|---|---|
| Web service (Express + React static) | Web Service | Starter ($7/mo) or Standard ($25/mo) | $7–25 |
| PostgreSQL | Managed PostgreSQL | Starter (1GB, $7/mo) | $7 |
| **Total** | | | **~$14–32/mo** |

The Starter web service ($7) is sufficient for a low-traffic internal app with < 20 concurrent users. Upgrade to Standard ($25) if you want zero cold-start time (Starter instances spin down after inactivity).

### Deployment pipeline

```
GitHub main branch push
  → Render auto-detects push via webhook
  → Build: npm ci && npm run build
      (Vite builds React SPA to /dist, tsc compiles Express to /dist-server)
  → Drizzle migrate: node dist-server/db/migrate.js (runs pending migrations)
  → Render deploys new instance with zero-downtime swap
  → Health check: GET /health → 200
```

For database migrations: Drizzle's migration runner is invoked as part of the build/start sequence. All migrations are forward-only (no destructive alterations in v1). Schema changes go through Drizzle's `drizzle-kit generate` + `drizzle-kit push` workflow in development, and the generated migration SQL files are committed to the repository.

### Environment configuration

Render's environment variable UI stores all secrets listed in §10. `DATABASE_URL` is auto-injected by Render when the web service is linked to the Postgres instance.

### Custom domain

Point `app.hamiltonjrchargers.com` (or `offers.hamiltonjrchargers.com` if using a subdomain for the landing page) to the Render web service via CNAME. Render provisions TLS automatically via Let's Encrypt.

### Backups

Render Starter Postgres includes daily backups retained for 7 days. For a production season (July 2026 tryouts), consider upgrading to Render Pro Postgres for 30-day backup retention.

### Monitoring

- Render provides basic request logs and CPU/memory metrics in the dashboard.
- Add `pino` logging to Express with structured JSON output — Render streams logs to the dashboard.
- For error alerting: add Sentry (free tier) for unhandled exception tracking. This is strongly recommended given the small team and limited monitoring capacity.

---

## 12. Key Engineering Decisions & Tradeoffs

### Decision 1: Monorepo, single Express server for API + static serving + public pages

**Chosen**: One Express server handles the JSON API (`/api/v1/*`), serves the built React SPA (`GET *`), and handles public routes (`/accept/:token`, `/webhooks/sendgrid`).

**Rejected**: Separate frontend deployment (Netlify/Vercel) + API service. Would require CORS configuration, two deployment pipelines, two Render services, and complicates the "same app handles the public landing page" requirement.

**Why**: For a small internal app with one team and predictable traffic, the simplicity benefit of a single deployable unit outweighs the theoretical scalability benefit of separation.

---

### Decision 2: Server-rendered acceptance landing page (not React SPA route)

**Chosen**: `/accept/:token` is rendered server-side by Express as plain HTML — no React hydration required.

**Rejected**: Making it a React SPA route that calls `GET /api/v1/token/:token` and renders the UI client-side.

**Why**: The token validation and page rendering happen in the same server request with no extra round trip. The page works on any mobile browser without JavaScript. No risk of a blank page while React loads. This is a parent-facing, mobile, single-action page — simplicity is paramount.

---

### Decision 3: Templates stored in DB, not SendGrid dynamic templates

**Chosen**: Email template HTML stored in the `email_templates` table, merged server-side, sent as pre-rendered HTML via SendGrid.

**Rejected**: Using SendGrid's dynamic template feature (templates stored in SendGrid dashboard, merge via `personalizations`).

**Why**: Templates must be admin-editable through this app's UI without any SendGrid dashboard access. Storing them in our DB keeps the admin UI self-contained. Merge field rendering is a trivial string interpolation — no template engine needed.

---

### Decision 4: Plaintext acceptance tokens (not hashed)

**Chosen**: `accept_token` and `decline_token` stored as plaintext in the `offers` table.

**Rejected**: Storing only a bcrypt hash of the token (similar to password reset token best practice).

**Why**: Offer tokens are looked up by value as a direct DB lookup (`WHERE accept_token = $1`). If hashed, every token validation requires a full table scan or a separate hash-to-id mapping. UUID v4 tokens have 122 bits of entropy — they are not brute-forceable, are short-lived, and are single-use. The marginal security benefit of hashing does not justify the query complexity at this scale.

---

### Decision 5: Custom JWT auth instead of a managed auth provider

**Chosen**: Roll JWT authentication with bcrypt, refresh tokens, invite flow, and token versioning in application code.

**Rejected**: Auth0, Clerk, Supabase Auth.

**Why**: The admin-invite-only model, email domain allowlist, team-scoped roles, and forced-reset-with-token-invalidation are all non-standard. Mapping these onto a managed auth provider requires significant glue code and vendor lock-in. For a small app with a finite, admin-controlled user base (< 20 users), custom auth is well within the complexity budget and eliminates an external dependency and monthly cost.

---

### Decision 6: Drizzle ORM over Prisma

**Chosen**: Drizzle ORM for all database access.

**Rejected**: Prisma.

**Why**: Prisma's generated client introduces a binary engine dependency that has historically caused connection pooling issues on PaaS environments (especially with long-running Express processes vs. serverless). Drizzle compiles directly to SQL, has a lower runtime footprint, and keeps migrations as plain SQL files that are easy to inspect, audit, and run manually if needed. The schema-as-code approach in TypeScript also fits the project's stack naturally.

---

### Decision 7: Offer history as separate `offers` table (not embedded on `players`)

**Chosen**: A dedicated `offers` table with one row per offer attempt, linked to `players` by FK.

**Rejected**: Embedding offer fields directly on the `players` table (as the PRD data model initially suggests with `offer.*` notation).

**Why**: A player can have multiple offer attempts (e.g., first offer expires, player is re-offered). Embedding offer data on the player row makes history impossible. The PRD's timeline requirement (Offer Timeline showing all past events) implies history is needed. A separate table with the current active offer being the most recent row cleanly supports both current-state queries and history display.

---

### Decision 8: Render over Railway or Fly.io

**Chosen**: Render for hosting.

**Rejected**: Railway (newer platform, less mature managed Postgres), Fly.io (more DevOps-oriented, requires more configuration).

**Why**: Render has the most straightforward GitHub → auto-deploy story with managed Postgres, automatic TLS, and a web UI appropriate for a non-profit organization where the primary maintainer may not be a dedicated DevOps engineer. The cost ($14–32/mo) is appropriate. Railway is a viable alternative if Render's free tier limitations become an issue.

---

*End of Technical Architecture Document*
