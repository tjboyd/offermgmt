# Product Requirements Document
# Hamilton Jr Chargers — Offer Management System

**Version:** 1.7  
**Date:** 2026-05-31  
**Status:** Draft

---

## 1. Overview

The Offer Management System is an internal web application for Hamilton Jr Chargers Baseball coaches and board administrators to manage player recruitment, send offer and rejection communications, and track acceptance through SportsEngine registration. It replaces ad-hoc email tracking with a structured pipeline that maintains a full audit trail per player.

---

## 2. Goals

- Centralize the player offer pipeline in a single tool accessible to coaches and board admins.
- Support two distinct offer workflows: **early (pre-tryout)** offers for returning players and **post-tryout** offers for new and returning players.
- Provide distinct, editable email templates for each communication type.
- Track email engagement (sent → opened → clicked → registered) per player.
- Integrate with SportsEngine so that the offer email's "Accept & Register" button links directly to the season registration form.
- Enforce role-based access so coaches only see and act on their assigned team(s).

---

## 3. User Roles

Four roles are supported, ordered from most to least privileged:

### 3.1 Admin
- Superuser. Full access to all teams, all players, all activity, all Settings.
- Can create/edit/deactivate any user of any role.
- Can flag any player as "returning" (early offer eligible).
- Can send offers and rejections across all teams.

### 3.2 Board
- Same access as Admin for player and offer management (all teams, all players, Settings).
- Cannot manage user accounts (user management is Admin-only).
- Can flag players as returning / early-offer eligible.

### 3.3 Head Coach
- Scoped to their assigned team(s): roster, dashboard, composer, Add Player, and pipeline sidebar are all filtered.
- Can add players, send offers, send rejections, and edit player details within their team(s).
- Can **manually flag a player as eligible for an early offer** within their assigned team(s).
- Cannot access Settings.

### 3.4 Assistant Coach
- Same team scope as Head Coach.
- Can view Dashboard (read-only)
- Can view individual player detail and offer timeline (read-only — to check a player's response status)
- Can set or clear the "Returning Player" flag on players within their assigned team(s)
- Can add and edit coach notes on players within their assigned team(s)
- CANNOT send offers (standard, early, or otherwise)
- CANNOT send rejections
- CANNOT access Settings

Sending offers and rejections is restricted to Head Coaches, Board members, and Admins only.

### 3.5 Role Assignment Rules
- **Admin** role can only be assigned by another Admin.
- **Board** role can be assigned by an Admin.
- **Head Coach** and **Assistant Coach** roles can be assigned by an Admin or Board member.
- No user can self-assign or self-elevate a role.
- Team assignments (which coach covers which team) are managed by Admins and Board members — see §12.

### 3.6 Authentication
- **All roles** get individual logins in the initial build. Every user (Admin, Board, Head Coach, Assistant Coach) has their own account provisioned by an Admin via the invite flow described in §12.
- Authentication uses username (email) + password, bcrypt hashed, with signed JWT sessions (short expiry + refresh token).
- No shared credentials. Each login is tied to a specific named user and role.

---

## 4. Offer Workflow Types

### 4.1 Early (Pre-Tryout) Offers
- Extended to **returning players only** — identified by either:
  - **SportsEngine prior season data**: player appeared on a prior season's roster in SportsEngine (matched by name + DOB or parent email).
  - **Manual flag**: an Admin, Board member, or Head Coach explicitly marks the player as "Early Offer Eligible" in the app regardless of SE history.
- Early offer eligibility must be **manually confirmed** by a Head Coach, Board member, or Admin before the offer can be sent — it is not automatically triggered.
- Initiated before tryouts occur (Jr Chargers tryouts are held in July 2026 for the 2027 season).
- Uses a distinct **Early Offer** email template with messaging appropriate for a returning player (tone: welcoming back, confirming spot).
- The offer email contains an "Accept & Register" button linking to the configured SportsEngine registration URL.
- Players receiving early offers enter the standard status pipeline (Draft → Sent → Accepted / Declined / Expired).

### 4.2 Post-Tryout Offers
- Extended after tryouts conclude; can go to both **new** and **returning** players.
- Uses the standard **Offer Letter** email template referencing tryout performance.
- A separate **Rejection Letter** template is sent to players not receiving a spot.
- Both templates use merge fields and link to the SportsEngine registration URL for offer emails.

### 4.3 Template Summary

| Template | Trigger | Recipients |
|---|---|---|
| Early Offer Letter | Pre-tryout; manually flagged returning players only | Returning players (SE history or manual flag) |
| Offer Letter | Post-tryout | New and returning players |
| Rejection Letter | Post-tryout | Players not selected |

All three templates are editable by Admins and Board members in Settings → Email Templates.

---

## 5. SportsEngine Integration

### 5.1 API Authentication
- The app authenticates to the SportsEngine API using **OAuth 2.0 client credentials** (client ID + client secret).
- Both the client ID and client secret are **configurable through the admin UI** in Settings → Integrations → SportsEngine. No code change or redeployment is needed to update or rotate credentials.
- Credentials are stored **server-side only**, encrypted at rest. They are never returned to the browser after being saved — the fields display masked placeholders (e.g. `••••••••`) after the initial save.
- The app exchanges client credentials for a bearer token and handles token refresh transparently.
- If credentials are missing or invalid, any feature that depends on the SE API (sync, returning player lookup) displays a clear inline error with a direct link to Settings → Integrations to resolve it.

### 5.2 Read-Only Policy
**All SportsEngine API calls are strictly read-only.** The app will never write to, update, or delete any data in SportsEngine — including registration records, team rosters, member profiles, or any other SE-managed data. This is an intentional hard constraint. The SE API credentials should be provisioned with read-only scope where the SE API allows scope restriction.

### 5.3 Season & Tryout Context
- The current active season is **2027**. Tryouts for the 2027 season are held in **July 2026**.
- The SportsEngine tryout registration form is named **"2027 Season Tryouts"**.
- The app is initialized with the current season's data only; prior seasons are retained in the database for reference (returning player lookup) but are not the primary working dataset.

### 5.4 Tryout Registration Sync (Repeatable, Read-Only)
- Each season, players register for tryouts via the SportsEngine registration form. Registration can happen:
  - **Online before tryouts** (most common)
  - **Onsite at the tryout event** (walk-up registrations on the day)
  - **Post-tryout**, for players who attend a private or individual tryout date arranged by a coach (schedule conflict, injury, etc.)
- Because registrations arrive across an extended window, the sync with SportsEngine is **repeatable and on-demand**, not a one-time import. Admins and Board members can trigger a sync at any time from Settings → Season or from the Roster screen.
- Each sync fetches the current registrant list from the SE API for the configured tryout form and performs an **upsert**:
  - New registrants → create as Draft player records.
  - Existing players (matched by SE member ID, or parent email + player name if no SE ID) → update contact info if changed; do not overwrite any app-managed data (team assignment, status, notes, flags, offer records).
  - Players already in the app but not (yet) in SE (e.g., manually added players or early-offer returning players) → left untouched; the sync only adds/updates, never deletes.
- A **sync log** records the timestamp of each sync, who triggered it, how many records were fetched, how many were new, and how many were updated. Visible in Settings → Season.
- The Roster screen shows a "Last synced from SE" timestamp so coaches know how fresh the data is.
- Syncing does not change any player's offer status, team assignment, or coach-entered data.

### 5.5 Returning Player Identification (Read-Only SE Lookup)
- To identify returning players, the app queries SportsEngine for prior season roster and registration data — read-only.
- A player is flagged as "returning" automatically if they appear in any prior season's SportsEngine registration or roster, matched by SE member ID (preferred) or player first name + last name + date of birth. Parent name and parent email are NOT used as default matching keys: different parents or guardians may register a returning player in different seasons, and a player's last name may differ from their legal guardian's last name. Using parent fields as match keys would produce unreliable results. If no SE-based match is found, Admins, Board members, Head Coaches, and Assistant Coaches can manually set the returning flag.
- Manual flags override or supplement SE-derived flags.
- The returning flag gates access to the Early Offer workflow — a player must be both flagged returning **and** explicitly marked "Early Offer Eligible" by an Admin, Board member, or Head Coach before an early offer can be sent.
- The returning player lookup from SE can be re-run independently of the tryout sync (useful before tryouts, to identify early-offer candidates from the prior season's roster).

### 5.6 Season Registration Link
- Each season has a single SportsEngine season registration URL configured by an Admin or Board member in Settings.
- This URL is embedded in all offer emails and is the redirect destination after a parent accepts an offer via the tokenized landing page.
- The URL is configurable per season; changing it in Settings immediately affects all new emails sent and all future acceptance redirects.

### 5.7 SportsEngine API Explorer (Admin Diagnostic Tool)
The SE API Explorer is an admin-only panel within Settings → Integrations that provides a safe, read-only window into raw SportsEngine API responses. Its purpose is validation and confidence-building — admins can inspect what the SE credentials can see and verify the correct data attributes are present before any sync or import is run.

**Access:** Admin role only. Not visible to any other role. Clearly labelled as a diagnostic tool.

**Read-only guarantee:** The explorer makes no writes to the app database or to SportsEngine. It is a passive inspection tool only.

**PII policy:** The explorer surfaces structural / schema-level data only — field names, types, required flags, season metadata, team names. If the SE API requires fetching member records to infer schema, responses are limited to 1–3 example records and all personal fields (names, emails, phone numbers, date of birth) are redacted before reaching the browser.

**Panels available:**

| Panel | What it shows | Why it matters |
|---|---|---|
| **Connection Status** | Live token exchange result: org name, token validity, scopes granted by SE | Confirms credentials are correctly configured and SE is reachable |
| **Seasons & Programs** | All seasons/programs visible to the credentials: IDs, names, dates | Confirms the integration is pointed at the correct org and season |
| **Teams** | Team list for a selected season: team names, IDs, division/age group metadata | Validates team structure before any team-import feature is used |
| **Tryout Form Schema** | Field definitions for the selected tryout registration form: attribute names, types, required flags — no member records | Confirms the form returns expected attributes (player name, DOB, parent email, etc.) before syncing |
| **Coaches Form Schema** | Same field-level inspection for the separate coaches registration form | Validates that coach name, email, and team assignment fields are present before any coaches-import is built |

Each panel shows a "Last fetched" timestamp and a refresh button. Responses are pretty-printed with collapsible sections. Errors (credential failure, endpoint not found, rate limit) display inline with actionable guidance.

### 5.7 Offer Acceptance — Tokenized URL Flow
Offer acceptance is handled via a **unique, per-player acceptance URL** embedded in every offer email. This replaces unstructured email replies and eliminates the need to monitor individual coach inboxes.

**Flow:**
1. When an offer is sent (via SendGrid or copied for manual send), the system generates a unique, cryptographically random acceptance token for that offer and stores it server-side with the player record and an expiry timestamp.
2. The offer email contains an **"Accept Your Spot"** button/link pointing to a URL of the form:
   `https://offers.hamiltonjrchargers.com/accept/{token}`
3. When the parent clicks the link, they are taken to an **acceptance landing page** hosted by this app. The page:
   - Confirms the player's name, team, and season.
   - Shows the offer expiry date.
   - Has a single "Confirm Acceptance" button.
4. On confirmation, the app:
   - Marks the offer as **Accepted** with a timestamp.
   - Logs the acceptance event in the player's activity timeline.
   - Immediately **redirects the parent to the SportsEngine season registration URL** to complete registration.
   - Sends a **confirmation email** to the parent (via SendGrid) acknowledging their acceptance and reminding them to complete SportsEngine registration if the redirect doesn't work.
   - Notifies the assigned Head Coach and any board admin (via email or in-app notification) that the offer has been accepted.
5. The acceptance token is **single-use** and **expires** on the offer expiry date. After expiry, the landing page shows a friendly "This offer has expired" message with contact information.
6. If a token has already been used, the landing page shows a "You've already accepted this offer" confirmation.

**Decline flow:**
- The offer email also contains a smaller "Decline this offer" link using a separate decline token.
- Clicking it takes the parent to a simple decline confirmation page.
- On confirmation, the offer is marked **Declined** and the coaching staff is notified.

**Why not email replies:**
- Email replies go to individual coach inboxes, are unstructured, and can be missed or lost.
- Tokenized URLs give instant, automated, auditable acceptance with zero manual monitoring required.

---

## 6. Player Data Model

| Field | Type | Notes |
|---|---|---|
| `id` | string | System-generated |
| `seId` | string | SportsEngine member ID (if imported) |
| `firstName` | string | |
| `lastName` | string | |
| `dateOfBirth` | date | Used for returning-player matching |
| `age` | number | Derived from DOB or entered manually |
| `grade` | string | e.g. "6" |
| `parentName` | string | |
| `parentEmail` | string | Primary communication address |
| `teamId` | string | FK → Teams |
| `seasonId` | string | FK → Seasons |
| `status` | enum | See §7 |
| `offerType` | enum | `early` or `post-tryout` |
| `isReturning` | boolean | Set by SE history match or manual flag |
| `returningFlaggedBy` | string | User ID who set the flag (if manual) |
| `earlyOfferEligible` | boolean | Explicitly approved for early offer by Head Coach/Board/Admin |
| `notes` | string | Coach-only; never sent to parents |
| `importedFromSE` | boolean | True if created via SE import |
| `createdAt` | ISO datetime | |
| `offer.sentAt` | ISO datetime | |
| `offer.sentMethod` | enum | `sendgrid` or `manual-copy` |
| `offer.openedAt` | ISO datetime | Email open (SendGrid webhook; null if manual) |
| `offer.acceptToken` | string | Cryptographically random UUID; single-use |
| `offer.declineToken` | string | Cryptographically random UUID; single-use |
| `offer.tokenLandingViewedAt` | ISO datetime | Parent loaded the acceptance landing page |
| `offer.acceptedAt` | ISO datetime | Parent clicked "Confirm Acceptance" on landing page |
| `offer.declinedAt` | ISO datetime | Parent clicked "Decline" on landing page |
| `offer.expiresAt` | ISO datetime | Computed from offerExpiresInDays; tokens invalid after this |
| `offer.seRedirectedAt` | ISO datetime | Parent was redirected to SportsEngine registration |

---

## 7. Player Status Pipeline

| Status | Description | Who can be offered |
|---|---|---|
| `draft` | Added, no offer sent | Yes (offer or rejection) |
| `sent` | Offer email sent, awaiting response | Resend offer only |
| `accepted` | Completed SportsEngine registration | — |
| `declined` | Family declined offer | — |
| `expired` | Offer deadline passed with no response | Yes (re-offer) |
| `waitlisted` | Borderline; holding pending roster spots | Yes (offer or rejection) |
| `rejected` | Not Selected — rejection email sent | — |

---

## 8. Screens & Features

### 8.1 Dashboard
- Season label + "Offer Pipeline" headline.
- **Stat Tiles** (4 across): Offers Out (sent count), Accepted, Declined/Expired, In Pipeline (draft + waitlist).
- **Activity Feed**: chronological log of offer events (sent, opened, clicked, accepted, declined). Last 30 days. Coach-scoped.
- **Status Breakdown**: bar chart per status with count.
- **Recent Players**: last 5 players by offer send date or creation date.
- Quick-action buttons: "Add Player", "Send Offer".

### 8.2 Roster
- Full paginated table of players visible to the current user.
- Columns: Player (avatar + name + age/grade), Team, Parent/Guardian (name + email), Status, Returning flag, Last Activity, chevron.
- **Search**: filters by player name, parent name, or email.
- **Status filter** dropdown.
- **Team filter** dropdown (admins see all; coaches see their team(s)).
- **Returning filter**: toggle to show only returning / early-offer-eligible players.
- **Bulk select**: checkboxes; selected count shown; "Send Offer" and "Send Rejection" bulk action buttons appear; actions are disabled unless all selected players are eligible.
- **"Sync from SE"** button (Admin/Board only) in the Roster header — triggers an on-demand sync and shows a spinner + "Last synced X ago" label. Provides quick access without navigating to Settings.
- Row click opens Player Detail modal.

### 8.3 Player Detail Modal
- Left pane: Avatar, status badge, team/age/grade, parent info card, coach notes, "Edit Details" toggle, "Change Status" dropdown.
- Right pane: **Offer Timeline** — vertical timeline with icon nodes for: Added, Offer Sent, Email Opened, SE Link Clicked, Completed Registration, Declined, Expired. "Awaiting response" callout if status is `sent`.
- Footer actions (context-aware):
  - Draft/Waitlisted: "Send Rejection" + "Send Offer"
  - Expired: "Send Offer"
  - Sent: "Resend Offer"
  - All: "Remove Player" (destructive, confirm dialog)
- Inline edit mode: fields for first/last name, age, grade, team, parent name, parent email, notes.

### 8.4 Composer Modal (Offer / Rejection)
- Triggered from Roster bulk-select, Dashboard "Send Offer" button, or Player Detail.
- **Mode**: "Send Offer Letters", "Send Early Offer Letters", or "Send Rejection Letters" — controls template, button styling, and eligible player list.
- Left panel: recipient checklist (only eligible players shown), acceptance deadline date picker (offer modes only), template reference with link to Settings.
- Right panel: email preview — To/Subject header bar + rendered email body with merged fields. Paginator when multiple recipients selected (preview one at a time).
- **Copy for manual send**: Each player's personalized email (subject + body, fully merged) can be copied to clipboard individually from the preview pane. This allows coaches who prefer to send through their own email client to do so without the app's SMTP integration.
- **Bulk send via SendGrid**: A "Send via SendGrid" button dispatches all selected emails through the configured SendGrid API key in one action. Requires SendGrid credentials in Settings.
- Footer: recipient count + send address, Cancel, Copy (single player), Send via SendGrid (all selected).
- Role restriction: Assistant Coaches cannot access the Composer modal.

### 8.5 Add Player Modal
- Fields: First Name, Last Name, Age, Grade, Team (dropdown scoped to user's teams), Parent/Guardian Name, Parent/Guardian Email, Coach Notes.
- New players created in `draft` status.
- Validation: First Name, Last Name, Parent Email, and Team are required.

### 8.6 Settings (Admin + Board — No Code Changes Required)
All configuration that could change season-to-season or org-to-org is managed through admin UI screens. No code changes or redeployments are needed to configure a new season, point to a different SE form, adjust allowed domains, or update integrations.

Settings is accessible to Admins and Board members only. Head Coaches and Assistant Coaches see a locked "Admins Only" notice.

Tab navigation: **Seasons**, **Teams**, **Email Templates**, **Integrations**, **Security**, **Users** (Admin only), **Reset Data** (Admin only).

---

#### Seasons (`Settings → Seasons`)
- **Season list**: All configured seasons with the active season highlighted. Each row shows season label, SE tryout form name(s), SE registration URL, status (Active / Archived).
- **Add Season**: Creates a new season record. Fields:
  - Season label (e.g. `2027`, `2028`)
  - SE tryout registration form name(s) — **free-text, multi-value field**; no code change or redeployment needed when the form name changes in a future year. Multiple form names can be added (e.g. a separate private-tryout form).
  - SE season registration URL (the "Accept & Register" redirect destination for offer emails)
  - Offer expiration default (days)
  - Tryout date range (informational; displayed on the dashboard)
- **Set Active Season**: One season is active at a time. Archiving a season retains all its data for returning player lookups and historical reference.
- **Edit Season**: Any field — including the SE form name — can be updated at any time without a code change. Updating the SE form name immediately changes which form the next sync queries.
- **Sync Now** button per season: triggers an on-demand SE sync for that season's configured form names.
- **Sync Log** per season: table of past syncs — timestamp, triggered by, records fetched, new, updated, errors.

---

#### Teams (`Settings → Teams`)
- Add, rename, or deactivate teams. Deactivated teams are hidden from dropdowns but retained for historical records.
- Each team shows: name, age group / division label, assigned head coaches, assigned assistant coaches.
- Coach assignments editable here or from Settings → Users.

#### Bulk Team Management
- **Multi-select:** A checkbox appears on each team row when the user hovers or enters selection mode. Selecting one or more teams reveals a "Delete Selected (N)" button in the header.
- **Bulk delete:** Deletes the selected teams permanently. Players assigned to deleted teams are unassigned (teamId set to null) but not deleted. Coach assignments for the deleted teams are removed. Requires Admin role. Prompts for confirmation before executing.
- **Reset all teams:** A "Reset All" danger button permanently deletes every team in the app. Players are unassigned but not deleted. Requires Admin role. Requires the user to type "DELETE" in a confirmation dialog before executing — this action cannot be undone.

---

#### Email Templates (`Settings → Email Templates`)
- Editable Subject + Body for all three templates: Early Offer, Offer Letter, Rejection Letter.
- **Live merge-field preview**: enter a sample player name and the preview renders merged output in real time.
- Available merge fields listed inline: `{{playerFirstName}}`, `{{playerLastName}}`, `{{parentName}}`, `{{team}}`, `{{season}}`, `{{deadline}}`, `{{acceptUrl}}`, `{{declineUrl}}`, `{{orgName}}`.
- Templates are per-season — each new season starts by copying the prior season's templates, which can then be edited independently.
- Template changes take effect immediately for new sends; previously sent emails are unaffected.

---

#### Integrations (`Settings → Integrations`)
- **SportsEngine**:
  - **Client ID** — text input, stored encrypted server-side, masked (••••••••) after save.
  - **Client Secret** — text input, stored encrypted server-side, masked after save. Never returned to the browser.
  - Both fields are editable at any time (e.g. when credentials are rotated). Saving new values immediately takes effect for all subsequent API calls — no redeployment needed.
  - **"Test Connection"** button — exchanges current credentials for a token and returns the authenticated organisation name from SE, confirming the credentials are valid. Shows a clear error message if authentication fails.
  - **"Disconnect"** button — clears both fields and revokes the cached token. Sync and returning-player lookups will show an error until new credentials are saved.
- **SendGrid**: API key (masked after save). Sender display name (e.g. "Hamilton Jr Chargers") and verified sender email address (e.g. offers@hamiltonjrchargers.com) — both configurable UI fields, no code change required. "Test Connection" sends a test email to the logged-in admin's address. "Disconnect" clears credentials.
- All credential values stored encrypted server-side; never returned to the browser after initial save (write-only from the UI).

---

#### Security (`Settings → Security`) — Admin Only
- **Allowed Email Domains**: editable list of domains permitted for account creation (default: `jrchargersbaseball.com`). Add or remove without any code change. Removing a domain does not affect existing accounts.
- **Session timeout**: configurable idle-session expiry (default: 8 hours).
- **Password policy**: minimum length and complexity (min 12 chars, mixed case + number by default; configurable).
- **Force all password resets**: invalidates all active sessions and requires every user to reset their password. Confirmation phrase required.

---

#### Users (`Settings → Users`) — Admin Only
See §12.6 for full specification.

---

#### Reset Data (`Settings → Reset Data`) — Admin Only
"Reset to seed data" for development/demo use only. Requires typing a confirmation phrase. Hidden in production via environment flag.

### 8.7 Acceptance Landing Page (Public — No Login Required)
- Served at `https://offers.hamiltonjrchargers.com/accept/{token}` (or a subdirectory of the main app domain).
- Accessible to parents without any authentication — the token itself is the credential.
- **States:**
  - **Valid & pending**: Shows Jr Chargers branding, player name, team, season, offer expiry date, and a prominent "Confirm Acceptance" button + a smaller "Decline this offer" link.
  - **Already accepted**: "You've already accepted this offer. Complete your SportsEngine registration if you haven't yet." with the SE registration link.
  - **Already declined**: "You've indicated you won't be joining us this season. Contact your coach if this was a mistake."
  - **Expired**: "This offer expired on [date]. Please contact your coach or board@hamiltonjrchargers.com."
  - **Invalid token**: Generic "This link is not valid" message.
- On "Confirm Acceptance": records the acceptance, sends confirmation email to parent, notifies coaching staff, and immediately redirects to the SportsEngine season registration URL.
- On "Decline": records the decline, notifies coaching staff, shows a thank-you message.
- Page is mobile-responsive (parents will open this on their phones from email).

### 8.9 New Season Wizard
A guided step-by-step workflow for rolling over to a new season. Accessible from:
- Settings → Seasons → "Start New Season" button
- A dashboard prompt shown when the active season's tryout date has passed ("Ready to set up the 2028 season?")

The wizard does not require completing all steps in one session — progress is saved and the admin can return to it.

**Step 1 — Season Details**
- Season label (e.g. "2028")
- SE tryout registration form name(s) — pre-filled with prior season's name as a starting point, editable. Instruction: "Update this to match the exact form name in SportsEngine for the new season."
- SE season registration URL
- Offer expiration default (days)
- Tryout date range (start and end date)
- Summary of what will be carried forward from the prior season (templates, teams, integrations)

**Step 2 — Email Templates**
- Displays all three templates (Early Offer, Offer Letter, Rejection Letter) copied from the prior season.
- Admin can review and edit each template before the season goes live.
- Merge field reference shown alongside each template.
- "Keep as-is" or "Edit" option per template.

**Step 3 — Integration Check**
- Runs a live test of both the SportsEngine API connection and the SendGrid connection.
- Displays green checkmark or red error for each, with a brief status message.
- SE check: verifies credentials are valid and the new season's form name returns results (or a warning if 0 registrants found — form name may be wrong or registrations not yet open).
- SendGrid check: verifies API key is valid and sender identity is verified.
- Admin can update credentials here if a check fails without leaving the wizard.

**Step 4 — Activate & Archive**
- Summary screen showing:
  - New season that will become active
  - Prior season that will be archived
  - Count of players, offers, and activity records that will be archived
- Explicit confirmation: "Archive [prior season] and activate [new season]"
- On confirm: prior season status set to Archived, new season status set to Active, dashboard switches to new season context.
- Coaches immediately see the new season on next login.

### 8.8 Sidebar Navigation (V1 Operations Layout)
- Jr Chargers logo + "Offer Mgmt" wordmark at top.
- Nav links: Dashboard, Roster, Settings (admin/board only).
- **Pipeline shortcuts** section: Awaiting Response, Accepted, Waitlisted, Drafts — each shows live count and links to a filtered Roster view.
- **Your Teams** section (coach only): lists assigned team names.
- **User card** at bottom: avatar initials, full name, role badge, email. **Clicking opens the Account page** — not a logout button. Logout is intentionally placed inside the Account page to prevent accidental sign-outs.
- Top sub-bar: current page label · season label · "N offers awaiting response" indicator.

### 8.9 Account Page
Every user has an Account page reachable by clicking their user card in the sidebar. It provides:
- **Profile section**: read-only display of email (cannot be changed by the user), editable display name. Changes take effect immediately.
- **Password section**: self-service password change form — current password (required to verify identity) + new password + confirm. New password must meet the org's configured password policy.
- **Sign out**: a clearly labelled "Sign Out" button at the bottom of the Account page. This is the only path to logging out — it is not triggered by clicking the user card.
- The Account page is accessible to all roles and is not in the sidebar nav — it is accessed exclusively via the user card.

---

## 9. Email Templates

All templates support merge fields and are fully editable by Admins and Board members in Settings → Email Templates. The merged, player-specific version of any email can be **copied to clipboard** from the Composer for manual sending. Bulk sending uses **SendGrid**.

### 9.1 Early Offer Letter (Pre-Tryout / Returning Players Only)
- **Subject**: `Welcome Back — Hamilton Jr Chargers {{team}} ({{season}})`
- **Tone**: Warm, confirming returning player's spot proactively before tryouts.
- **Merge fields**: `{{playerFirstName}}`, `{{parentName}}`, `{{team}}`, `{{season}}`, `{{deadline}}`.
- Includes "Accept & Register" button → SportsEngine URL.
- Only available for players flagged as "Returning" (by SE history or manual flag).

### 9.2 Offer Letter (Post-Tryout)
- **Subject**: `Roster Offer — Hamilton Jr Chargers {{team}} ({{season}})`
- **Tone**: Congratulatory, references tryout performance.
- **Merge fields**: `{{playerFirstName}}`, `{{parentName}}`, `{{team}}`, `{{season}}`, `{{deadline}}`, `{{sportsEngineUrl}}`.
- Includes "Accept & Register" button → SportsEngine URL.
- Available for any player in Draft, Waitlisted, or Expired status.

### 9.3 Rejection Letter (Post-Tryout)
- **Subject**: `Tryout Results — Hamilton Jr Chargers {{season}}`
- **Tone**: Respectful, encouraging, no door-closing language.
- **Merge fields**: `{{playerFirstName}}`, `{{parentName}}`, `{{team}}`, `{{season}}`.
- No registration button.
- Available for players in Draft or Waitlisted status.

### 9.4 Send Mechanisms
- **Copy to clipboard**: From the Composer preview, a "Copy Email" button generates the fully merged subject + body for the currently previewed player and copies it. Coaches can paste into their own email client and send manually. Tracked as "manually sent" (no open/click tracking).
- **Bulk send via SendGrid**: The "Send via SendGrid" button in the Composer footer dispatches personalized emails to all selected recipients through the SendGrid API. Supports open and click tracking webhooks for per-player engagement events.

---

## 10. Activity Tracking

Per-player event log with timestamp and description for:
- Player added to roster
- Returning player flag set (and by whom)
- Early offer eligibility flag set (and by whom)
- Offer email sent (method: SendGrid or manual copy)
- Email opened (SendGrid open webhook; not available for manual-copy sends)
- Acceptance landing page viewed by parent
- Offer accepted by parent (via tokenized URL)
- Parent redirected to SportsEngine registration
- Offer declined by parent (via tokenized URL)
- Offer expired (token invalidated)
- Status manually changed by staff (and by whom)
- Coach note added or edited

Activity is displayed in the Player Detail timeline, the Dashboard feed, and is filterable by player. Coaches see only activity for their team's players. Each event records the actor (staff user or "parent via link").

---

## 11. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Persistence** | Backend database (PostgreSQL recommended). Multi-season data retained; current season is the primary working dataset. Prior seasons retained for returning player lookups. |
| **Email delivery** | **SendGrid** for bulk sends with open/click tracking webhooks. Copy-to-clipboard for manual sends (no tracking). SendGrid API key configured in Settings → Integrations. |
| **Authentication** | Individual logins for all roles in the initial build. Email + password (bcrypt hashed). Sessions use signed JWT tokens (short expiry + refresh token). Admin-provisioned via invite flow. |
| **Role enforcement** | Server-side on every API endpoint; client-side scoping is display-only. |
| **Account security** | Email domain allowlist, mandatory email verification, admin-managed accounts — see §12. |
| **SportsEngine API** | OAuth 2.0 client credentials (client ID + secret). Both fields are editable admin UI fields in Settings → Integrations — no code change to rotate or update. Stored encrypted server-side, never returned to browser. |
| **Multi-season** | Data is retained across seasons. Current season: **2027** (tryouts July 2026). Prior seasons in DB for returning player identification; starting from current season for roster data. |
| **Responsive design** | Coaching app: desktop-first (coaches use laptops during tryouts). Acceptance landing page: **fully mobile-responsive** — parents will open offer emails on phones. |
| **Browser support** | Modern evergreen browsers (Chrome, Safari, Firefox, Edge). |

---

## 12. User & Account Management

### 12.1 Email Domain Allowlist
- Account creation is restricted to email addresses from approved domains.
- Default allowed domain: **jrchargersbaseball.com**.
- Admins can add or remove allowed domains in Settings → Users → Allowed Domains.
- The allowlist applies at both the invitation step and the account activation step — if a domain is later removed, existing accounts are not affected, but new sign-ups from that domain will be rejected.
- No self-service account creation. All accounts are provisioned by an Admin via invitation (see §12.3).

### 12.2 Email Verification
- Every new user account requires **email verification** before access is granted.
- When an Admin creates an account (or sends an invitation), the system sends a verification email to the user's address containing a time-limited link (expires in 24 hours).
- The user must click the link to verify their address and set their password before they can log in.
- If the link expires, an Admin can re-send the invitation from the Users admin screen.
- Unverified accounts are shown in the Users list with a "Pending" status and cannot log in.

### 12.3 Admin-Managed Account Provisioning
All accounts are created and managed by Admins. There is no public sign-up flow.

**Creating an account:**
- Admin navigates to Settings → Users → "Invite User".
- Enters the user's email address (must match an allowed domain), full name, and role.
- For Head Coach and Assistant Coach roles, one or more team assignments are required at creation time.
- The system validates the email domain against the allowlist before sending the invitation.
- A verification + password-set email is sent to the user.

**Editing an account:**
- Admin can update name, role, and team assignments for any user.
- Only Admins can change a user's role to Admin or Board.
- Admins and Board members can change a user's role to Head Coach or Assistant Coach.

**Forcing a password reset:**
- Admin can trigger a password-reset email for any user from the Users list.
- The user receives a time-limited reset link (expires in 1 hour).
- Until the reset is completed, the user's existing session(s) are invalidated.

**Deactivating / deleting an account:**
- Admin can deactivate an account (user cannot log in; their historical data and activity is retained) or permanently delete it.
- Deactivated accounts are shown in the Users list with a "Deactivated" badge and can be reactivated.
- Permanently deleted accounts prompt a confirmation dialog. Associated player notes and activity log entries retain the user's name as a string but the account record is removed.
- An Admin cannot deactivate or delete their own account.

### 12.4 Coach–Team Assignment
- Every Head Coach and Assistant Coach must be assigned to at least one team.
- Assignments are managed by Admins and Board members from two places:
  1. **Settings → Users**: edit a user and change their team assignments.
  2. **Settings → Teams**: view a team and see / edit which coaches are assigned to it.
- A coach can be assigned to multiple teams (e.g., "12U AA / 11U AA Head Coach").
- Removing a coach's team assignment does not affect any player records or offer history — it only changes what that coach can see going forward.

### 12.5 Coach Import from SportsEngine (Optional Assist)
- When SportsEngine season registration data includes staff/coach registrations, the app can surface a list of coach email addresses found in the SE data as a convenience for account provisioning.
- Because coaches may use a personal email address for their SE account rather than their `jrchargersbaseball.com` address, this is an **informational suggestion only** — the Admin must still manually create the account with the correct `jrchargersbaseball.com` address.
- The SE-derived coach list is read-only and is displayed in Settings → Users as a reference panel ("Coaches found in SE registration") alongside the Users list.
- This data is pulled via the same read-only SE API integration — no SE data is modified.

### 12.6 Users Admin Screen (Settings → Users)
- Accessible to Admins only (Board members can assign teams but cannot create/delete accounts).
- **Users list**: table showing name, email, role badge, assigned teams, account status (Active / Pending / Deactivated), last login.
- **Actions per row**: Edit, Force Password Reset, Deactivate / Reactivate, Delete.
- **Invite User** button: opens a form for name, email, role, and team assignment(s).
- **Allowed Domains** panel: list of permitted email domains with add/remove controls.
- **SE Coach Reference** panel: coaches found in SE registration data (informational).

## 14. Design System

- **Color**: Dark theme — `#0A0A0A` primary background, `#1A1A1A` card background, `#AD0303` brand red.
- **Typography**: Barlow Condensed (ExtraBold Italic, display/headings), Barlow (body), JetBrains Mono (code/textarea).
- **Status badge colors**: Sent = amber `#E5A567`, Accepted = green `#66C97A`, Declined/Rejected = red `#E07070`, Waitlisted = blue `#6BAEFF`, Draft/Expired = gray.
- **Brand assets**: HC logo icon, Jr Chargers banner logo (in `/assets/`).

---

## 15. Out of Scope (v1)

- Mobile / tablet layout for the coaching app (acceptance landing page is mobile-responsive).
- Self-service account creation or OAuth/SSO login (Google, etc.) — admin-invite only for v1.
- Per-player tokenized acceptance links (would require backend).
- Automated SportsEngine webhook callbacks for acceptance.
- Multi-season history / archive.
- Player photo upload.
- Coach-to-coach messaging.
- Parent portal / self-service status view.
- Payment tracking.

> **Note on team deletion:** Hard delete (permanent removal) of teams is in scope via bulk delete and the Reset All Teams action (§8.6 Settings → Teams). This is distinct from *deactivate* (soft disable, which hides the team from dropdowns but retains historical records). Deactivation remains the default non-destructive option; bulk delete and Reset All are irreversible Admin-only operations.

---

## 16. Resolved Decisions

| Decision | Resolution |
|---|---|
| SportsEngine access | OAuth 2.0 client credentials (client ID + secret), configured in Settings. **Strictly read-only** — no writes to SE data ever. |
| SE sync behavior | On-demand, repeatable upsert — safe to run multiple times. Adds new registrants, updates contact info, never overwrites app-managed data or deletes players. |
| Late/onsite registrations | Supported — coaches re-run the sync after tryouts to pick up onsite and private-tryout registrations. |
| Email provider | SendGrid — bulk send via API + copy-to-clipboard for manual sends |
| Authentication | Individual logins for all roles in the initial build — no shared credentials, no Phase 2 deferral |
| Offer status tracking | Yes — full pipeline per player |
| Multiple teams | Yes — multiple age groups (e.g., 12U AAA, 12U AA, 11U AAA, etc.) |
| Offer acceptance mechanism | Unique tokenized URL per player — no email replies, no manual tracking. Parent clicks "Accept" → app records it → redirects to SportsEngine registration. |
| Roles | Four roles: Admin, Board, Head Coach, Assistant Coach |
| Returning player identification | SportsEngine prior season data **or** manual flag by Admin/Board/Head Coach |
| Early offer gating | Manual flag required; head coaches, board, and admins can set it |
| Multi-season data | Retained across seasons; current active season is 2027 (tryouts July 2026) |
| Tryout form name | "2027 Season Tryouts" |
| Prior season roster data | Not back-filling; starting from current (2027) season for roster records |
| Individual coach logins | In scope for initial build — all roles get individual accounts |
| Account creation | Admin-invite only; no public sign-up |
| Email domain restriction | Default: `jrchargersbaseball.com`; editable allowlist in Settings → Security. No code change to add/remove domains. |
| SE form name configuration | Free-text field per season in Settings → Seasons. No code change or redeployment to target a new form name in a future year. Multiple form names supported per season. |
| Season configuration | Fully admin-managed: label, SE form name(s), SE registration URL, offer expiry, tryout dates — all editable in Settings → Seasons without touching code. |
| Email verification | Required before first login; 24-hour link expiry |
| Admin/Board role assignment | Admin-only |
| Coach/team assignment | Admin or Board; can also reference SE coach data as a read-only assist |
| User management screens | Settings → Users (Admin only): invite, edit, force reset, deactivate, delete |
| Returning player match keys | First name + last name + DOB only. Parent name and email not used by default (unreliable across seasons). Manual flag as fallback. |
| Assistant coach send permissions | Cannot send offers or rejections. Read-only on offers plus returning-flag management. Only Head Coaches, Board, and Admins send offers/rejections. |
| SendGrid sender identity | Sender display name and email both configurable in Settings → Integrations. No code change required. |
| Season progression | Guided New Season Wizard (4-step: Details → Templates → Integration Check → Activate & Archive). |

## 17. Open Questions

All previously listed open questions have been resolved and moved to §16:
- Returning player matching logic → resolved: first name + last name + DOB; parent fields not used.
- SendGrid sender identity → resolved: configurable display name and email in Settings → Integrations.
- Assistant coach access to email copy → resolved: assistant coaches cannot access the Composer at all.
- Season progression → resolved: guided New Season Wizard (4-step flow).
