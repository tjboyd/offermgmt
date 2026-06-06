# Dev Setup — Jr Chargers Offer Management

Follow these steps to get the app running locally for the first time.

---

## Step 1 — Get a PostgreSQL database

You need a PostgreSQL 15/16 database. The fastest free option with no local install:

### Option A: Neon (recommended — free, no install)

1. Go to **[neon.tech](https://neon.tech)** → Sign up free
2. Create a new project (name it anything, region "US East" is fine)
3. Click **"Connect"** → copy the **Connection string** (starts with `postgresql://`)
4. It looks like: `postgresql://neondb_owner:abc123@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

### Option B: Local PostgreSQL (macOS)

```bash
# Install via Homebrew
brew install postgresql@16
brew services start postgresql@16

# Create the database
createdb jrc_offers
# Connection string: postgresql://postgres@localhost:5432/jrc_offers
```

### Option C: Postgres.app (macOS GUI)
1. Download from **[postgresapp.com](https://postgresapp.com)**
2. Start it, then in the menu bar click the elephant → Open psql
3. Run: `CREATE DATABASE jrc_offers;`
4. Connection string: `postgresql://postgres@localhost:5432/jrc_offers`

---

## Step 2 — Configure .env

Open `server/.env` and paste your database connection string:

```
DATABASE_URL=postgresql://your-connection-string-here
```

The file already has dev-safe placeholders for everything else. **Do not change them** for local dev — they're intentionally weak for convenience.

---

## Step 3 — Install dependencies

```bash
# From the root Offer-Mgmt/ directory:
cd server && npm install
cd ../client && npm install
```

---

## Step 4 — Run database migrations

```bash
cd server
npm run db:migrate
```

This creates all 12 tables. You should see "Migrations complete." with no errors.

> **If you see "relation does not exist":** migrations ran out of order. Delete the `drizzle/` folder contents and re-run `npm run db:generate && npm run db:migrate`.

---

## Step 5 — Seed the database

```bash
cd server
npm run db:dev-seed
```

This creates:
- ✅ Config defaults (password policy, allowed domains)
- ✅ Admin login account
- ✅ 2027 season
- ✅ 5 sample teams (12U AAA, 12U AA, 11U AAA, 11U AA, 10U AAA)
- ✅ Default email templates

Output will show your login credentials:

```
✅  Dev seed complete!

   Login at:  http://localhost:5173/login
   Email:     admin@jrchargersbaseball.com
   Password:  JrChargers2027!
```

---

## Step 6 — Start the servers

Open **two terminals**:

**Terminal 1 — Backend (Express API):**
```bash
cd server
npm run dev
# → Server running on port 3001
```

**Terminal 2 — Frontend (Vite):**
```bash
cd client
npm run dev
# → http://localhost:5173
```

---

## Step 7 — Open the app

Navigate to **[http://localhost:5173](http://localhost:5173)**

Log in with:
```
Email:    admin@jrchargersbaseball.com
Password: JrChargers2027!
```

You should land on the Dashboard with the 2027 season loaded and 5 teams ready to use.

---

## What works right now (Milestones 1–3)

| Feature | Status |
|---|---|
| Login / logout | ✅ |
| Admin invite flow (creates user, sends invite link in dev logs) | ✅ |
| Dashboard — stat tiles, activity feed, status breakdown | ✅ |
| Roster — table, search, filters, bulk-select | ✅ |
| Add Player modal | ✅ |
| Player Detail modal — info, notes, flags, status change, timeline | ✅ |
| Returning Player flag (all roles) | ✅ |
| Early Offer Eligible flag (head coach+) | ✅ |
| Settings → Integrations — SE and SendGrid credential entry | ✅ |
| Settings shell with tab navigation | ✅ |
| SE sync (requires SE credentials in Settings → Integrations) | ✅ |

| Feature | Coming next (M4) |
|---|---|
| Composer modal — send offer/rejection/early offer emails | 🔄 |
| Acceptance/decline landing pages (`/accept/:token`) | 🔄 |
| SendGrid bulk send | 🔄 |
| Copy email to clipboard | 🔄 |

---

## Common issues

**"Cannot find module 'pg'"** — run `npm install` inside `server/`

**"JWT_SIGNING_KEY is not set"** — make sure `.env` is in `server/` not the root

**Login returns 403 "Email not verified"** — the dev-seed sets `email_verified = true` — if you created a user via the invite flow without clicking the link, run `db:dev-seed` again or manually set `email_verified = true` in the DB

**Vite shows blank page** — make sure the backend is running on port 3001; Vite proxies `/api` to it

**"relation users does not exist"** — migrations haven't run yet; run `npm run db:migrate` first

---

## Add more users for testing

Once logged in as admin, go to **Settings → Users → Invite User**. In dev mode the invite token is returned in the API response (check the Network tab) or printed to the server console. Use it at:

```
http://localhost:5173/activate?token=<the-token>
```

Or use the quick-add approach in the DB directly:

```bash
# Connect to your DB (Neon: use their web console; local: psql)
# The dev-seed already has an admin. To add a head coach without email:
# See server/src/db/dev-seed.ts for the pattern — copy/extend it.
```
