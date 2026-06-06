# User Stories & Development Backlog
# Hamilton Jr Chargers — Offer Management System

**Version:** 1.0  
**Date:** 2026-05-31  
**Source:** PRD v1.7

---

## Part 1 — User Stories

Stories are organized by feature area and cover every feature in the PRD. Roles: **Admin**, **Board**, **Head Coach**, **Assistant Coach**, **Parent** (acceptance landing page only).

---

### 1. Authentication & Session Management

| # | Story |
|---|---|
| A-01 | As an **Admin**, I want to log in with my email and password so that I can access the system with my individual account. |
| A-02 | As a **Board** member, I want to log in with my own email and password so that I have a named, auditable session. |
| A-03 | As a **Head Coach**, I want to log in with my own credentials so that I only see data scoped to my assigned team(s). |
| A-04 | As an **Assistant Coach**, I want to log in with my own credentials so that I can view my team's player statuses without being able to accidentally send communications. |
| A-05 | As any **logged-in user**, I want my session to automatically expire after a configurable idle period so that unattended workstations don't expose sensitive data. |
| A-06 | As any **logged-in user**, I want a JWT refresh token so that I'm not forced to re-authenticate mid-session during normal use. |
| A-07 | As any **logged-in user**, I want to be redirected to a login page when my session expires so that I can re-authenticate without losing the URL I was trying to access. |

---

### 2. User & Account Management

| # | Story |
|---|---|
| U-01 | As an **Admin**, I want to invite a new user by entering their email, name, and role so that I can provision accounts without allowing self-service sign-up. |
| U-02 | As an **Admin**, I want the system to reject invitations for email addresses not matching the allowed domain list so that only org members can be onboarded. |
| U-03 | As a **new user**, I want to receive an invitation email with a time-limited verification link so that I can verify my address and set my password before first login. |
| U-04 | As an **Admin**, I want to resend an expired invitation so that a user who didn't act in time can still activate their account. |
| U-05 | As an **Admin**, I want to see all users in a table (name, email, role, teams, status, last login) so that I can audit who has access. |
| U-06 | As an **Admin**, I want to edit any user's name, role, and team assignments so that I can keep account details accurate. |
| U-07 | As an **Admin**, I want to force a password reset for any user so that I can respond to security concerns immediately. |
| U-08 | As an **Admin**, I want to deactivate an account so that a departed coach loses access while retaining all their historical data. |
| U-09 | As an **Admin**, I want to reactivate a deactivated account so that returning staff can regain access without a full re-onboard. |
| U-10 | As an **Admin**, I want to permanently delete an account (with a confirmation dialog) so that I can honour data removal requests. |
| U-11 | As an **Admin**, I cannot deactivate or delete my own account so that the system always has at least one active Admin. |
| U-12 | As an **Admin**, I want to assign Head Coaches and Assistant Coaches to one or more teams at account creation so that their roster scope is set immediately. |
| U-13 | As an **Admin** or **Board** member, I want to update a coach's team assignments from either Settings → Users or Settings → Teams so that I have two convenient entry points. |
| U-14 | As an **Admin**, I want only Admins to be able to assign the Admin or Board role so that role elevation cannot happen without superuser approval. |
| U-15 | As an **Admin**, I want to see a read-only panel of coach emails found in SportsEngine registration data so that I have a reference when provisioning accounts. |

---

### 3. Security Settings

| # | Story |
|---|---|
| S-01 | As an **Admin**, I want to manage the allowed email domain list from Settings → Security so that I can add or remove domains without a code change. |
| S-02 | As an **Admin**, I want to configure the session idle timeout so that security policy can be enforced without redeploying. |
| S-03 | As an **Admin**, I want to configure the minimum password length and complexity so that the org's password policy is enforced. |
| S-04 | As an **Admin**, I want a "Force all password resets" action (requiring a confirmation phrase) so that I can respond to a suspected credential breach across all accounts simultaneously. |

---

### 4. SportsEngine Integration

| # | Story |
|---|---|
| SE-01 | As an **Admin**, I want to enter the SportsEngine OAuth client ID and client secret in Settings → Integrations so that credentials can be updated or rotated without a code change or redeployment. |
| SE-02 | As an **Admin**, I want credential fields to display masked placeholders after saving so that the raw secrets are never exposed in the browser. |
| SE-03 | As an **Admin**, I want a "Test Connection" button that exchanges credentials for a token and returns the authenticated org name so that I can confirm the credentials are valid before relying on them. |
| SE-04 | As an **Admin**, I want a "Disconnect" button that clears SE credentials so that I can safely revoke access. |
| SE-05 | As an **Admin** or **Board** member, I want to trigger an on-demand tryout registration sync from Settings → Seasons or the Roster screen so that new registrants are imported without waiting for a scheduled job. |
| SE-06 | As an **Admin** or **Board** member, I want the sync to upsert player records (add new, update contact info on existing) without overwriting app-managed data so that coach notes, status, and flags are never clobbered. |
| SE-07 | As an **Admin** or **Board** member, I want the sync to leave manually-added players untouched so that early-offer candidates entered before tryouts are not removed or changed. |
| SE-08 | As an **Admin** or **Board** member, I want a sync log (timestamp, triggered by, records fetched/new/updated/errors) so that I can audit every sync operation. |
| SE-09 | As a **Head Coach**, I want the Roster screen to show a "Last synced from SE" timestamp so that I know how fresh the imported data is. |
| SE-10 | As an **Admin**, I want the SE form name(s) for each season to be a free-text, multi-value field so that pointing to a new year's tryout form requires no code change. |
| SE-11 | As an **Admin** or **Board** member, I want the app to query prior-season SE data to automatically flag returning players (matched by SE member ID or first name + last name + DOB) so that returning players are identified without manual cross-referencing. |
| SE-12 | As any **staff user**, I want to see a clear inline error with a link to Settings → Integrations when SE credentials are missing or invalid so that I know immediately how to resolve the problem. |
| SE-13 | As any **user**, I want the app to never write to, update, or delete any data in SportsEngine so that the org's SE data is always the source of truth. |
| SE-14 | As an **Admin**, I want a SportsEngine API Explorer screen (Settings → Integrations → SE Explorer) that lets me browse raw SE API responses in a readable, structured format without touching the database, so that I can validate my credentials are working and confirm the correct data is being returned before running any sync or import. |
| SE-15 | As an **Admin**, I want the SE Explorer to show me the live connection status (org name, token validity, granted scopes) so that I can confirm the credentials are correctly configured at a glance. |
| SE-16 | As an **Admin**, I want the SE Explorer to list all seasons and programs visible to my credentials so that I can confirm the integration is pointed at the correct organization and season. |
| SE-17 | As an **Admin**, I want the SE Explorer to show me the team listing for any selected season so that I can verify the teams are structured as expected before running a team import. |
| SE-18 | As an **Admin**, I want the SE Explorer to show me the field schema (attribute names, types, required flags) for any selected registration form — without exposing member PII — so that I can confirm the tryout form returns the attributes the app needs (player name, DOB, parent email, etc.) before syncing. |
| SE-19 | As an **Admin**, I want the SE Explorer to let me inspect the coaches registration form schema separately so that I can validate it contains the expected fields (coach name, email, team assignment) before any coaches-import feature is built or enabled. |
| SE-20 | As an **Admin**, I want all SE Explorer calls to be strictly read-only and clearly labelled as a diagnostic tool so that there is no risk of accidentally altering SE data or triggering an import during exploration. |

---

### 5. Organization Branding

| # | Story |
|---|---|
| B-01 | As an **Admin**, I want to set the organization name so that the app wordmark and email footer reflect our org rather than hardcoded "Jr Chargers". |
| B-02 | As an **Admin**, I want to upload an organization logo so that it appears in the sidebar and login screen instead of the hardcoded HC logo. |
| B-03 | As an **Admin**, I want to set a primary brand color (hex) so that buttons, active nav items, and accents reflect our organization's color scheme. |
| B-04 | As an **Admin**, I want to set a secondary accent color (hex) so that I can customize highlight elements beyond the primary color. |
| B-05 | As an **Admin**, I want a live color preview swatch next to each hex input so that I can confirm the color looks correct before saving. |
| B-06 | As **any user**, I want the app to load my organization's branding automatically so that every session reflects the current configured theme. |

---

### 7. Season & Team Management

| # | Story |
|---|---|
| SM-01 | As an **Admin** or **Board** member, I want to create a new season record with a label, SE form names, SE registration URL, offer expiry default, and tryout date range so that each year's context is fully configured in the UI. |
| SM-02 | As an **Admin** or **Board** member, I want to edit any season field at any time so that corrections (e.g., a wrong SE form name) don't require a code change. |
| SM-03 | As an **Admin** or **Board** member, I want to set one season as active so that all dashboards and rosters default to the current working season. |
| SM-04 | As an **Admin** or **Board** member, I want to archive a season so that its data is retained for returning-player lookups but no longer appears as the active working context. |
| SM-05 | As an **Admin** or **Board** member, I want to add, rename, or deactivate teams so that the team list stays current without touching code. |
| SM-06 | As an **Admin** or **Board** member, I want deactivated teams to be hidden from dropdowns but retained in historical records so that old data remains intact. |

---

### Team Management

| # | Story |
|---|---|
| TM-01 | As an **Admin**, I want to select multiple teams with checkboxes so I can act on them as a group. |
| TM-02 | As an **Admin**, I want to delete selected teams in bulk so I can clean up a season's team list without deleting one at a time. |
| TM-03 | As an **Admin**, I want a confirmation prompt before bulk deleting teams so I don't accidentally remove teams I need. |
| TM-04 | As an **Admin**, I want a "Reset All Teams" button that removes every team at once so I can start fresh for a new season without manually deleting each one. |
| TM-05 | As an **Admin**, I want to type "DELETE" to confirm a full team reset so the destructive nature of the action is unmistakable. |
| TM-06 | As an **Admin**, I want players that were assigned to deleted teams to remain in the roster (just unassigned) so I don't lose player data when restructuring teams. |

---

### 8. New Season Wizard

| # | Story |
|---|---|
| NSW-01 | As an **Admin**, I want a guided 4-step New Season Wizard so that rolling over to a new year is structured and I don't miss any required configuration. |
| NSW-02 | As an **Admin**, I want wizard progress to be saved so that I can start the setup, close my browser, and return later without losing my work. |
| NSW-03 | As an **Admin**, I want Step 1 to capture season details (label, SE form names, registration URL, expiry default, tryout dates) with a summary of what carries forward. |
| NSW-04 | As an **Admin**, I want Step 2 to show all three email templates pre-populated from the prior season so that I can review and edit them before the new season goes live. |
| NSW-05 | As an **Admin**, I want Step 3 to run live integration checks for both SE and SendGrid — showing a clear pass/fail with error detail and inline credential editing if something fails — so that I don't activate a broken season. |
| NSW-06 | As an **Admin**, I want Step 4 to show a summary of what will be archived and activated, require an explicit confirmation, and then switch the active season in one click so that the transition is deliberate and auditable. |
| NSW-07 | As a **Head Coach**, I want to see the new season context immediately on my next login after an Admin activates it so that I'm always working in the current year. |

---

### 9. Player Management

| # | Story |
|---|---|
| P-01 | As a **Head Coach**, I want to manually add a player (first/last name, age, grade, team, parent name, parent email, notes) so that I can track players who didn't register through SE. |
| P-02 | As an **Admin** or **Board** member, I want to add a player to any team so that I'm not restricted to a single team scope. |
| P-03 | As any **staff user**, I want newly added players to start in Draft status so that no communication is sent until explicitly authorized. |
| P-04 | As a **Head Coach**, I want to edit player details (name, age, grade, team, parent info, notes) within my assigned team(s) so that I can correct data without Admin intervention. |
| P-05 | As an **Admin**, I want to edit players across all teams so that I can fix any record regardless of team assignment. |
| P-06 | As an **Assistant Coach**, I want to add and edit coach notes on players in my team(s) so that I can contribute observations without being able to accidentally trigger communications. |
| P-07 | As any **staff user**, I want coach notes to be clearly marked as internal-only and never included in any parent-facing email so that coaching evaluations remain private. |
| P-08 | As a **Head Coach**, I want to remove a player (with a confirmation dialog) so that accidental additions can be corrected. |
| P-09 | As any **staff user**, I want to see a player's full detail in a modal — status badge, parent info, notes, and offer timeline — so that I have all context in one view. |
| P-10 | As an **Admin**, I want to see players across all teams so that I have full visibility for cross-team coordination. |

---

### 10. Returning Player Identification & Early Offer Eligibility

| # | Story |
|---|---|
| R-01 | As an **Admin**, **Board** member, **Head Coach**, or **Assistant Coach**, I want to manually set or clear the "Returning Player" flag on a player so that I can override or supplement the SE-derived flag. |
| R-02 | As an **Admin** or **Board** member, I want to re-run the SE returning-player lookup independently of the tryout sync so that I can identify early-offer candidates before tryouts begin. |
| R-03 | As an **Admin**, **Board** member, or **Head Coach**, I want to mark a returning player as "Early Offer Eligible" so that the early offer workflow is unlocked for that player. |
| R-04 | As any **staff user**, I want the app to record who set the returning flag (if manually set) so that the audit trail is complete. |
| R-05 | As a **Head Coach**, I want to filter the Roster to show only returning / early-offer-eligible players so that I can focus on pre-tryout offer candidates efficiently. |

---

### 11. Offer & Rejection Workflow

| # | Story |
|---|---|
| O-01 | As a **Head Coach**, I want to open a Composer for "Send Offer Letters" scoped to my team's draft/waitlisted/expired players so that I can send post-tryout offers efficiently. |
| O-02 | As a **Head Coach**, I want to open a Composer for "Send Early Offer Letters" that only shows returning, early-offer-eligible players so that I can't accidentally send the early-offer template to ineligible players. |
| O-03 | As a **Head Coach**, I want to open a Composer for "Send Rejection Letters" scoped to my team's draft/waitlisted players so that I can send rejections in bulk. |
| O-04 | As an **Admin** or **Board** member, I want the Composer to show players from all teams (not scoped) so that I have full cross-team offer management. |
| O-05 | As a **Head Coach** or **Admin**, I want to select an acceptance deadline date in the Composer so that each batch of offers can have a specific expiry. |
| O-06 | As any **authorized sender**, I want to preview a fully merged email for each recipient before sending so that I can verify personalization is correct. |
| O-07 | As any **authorized sender**, I want to paginate through per-recipient previews in the Composer when multiple players are selected so that I can spot-check each one. |
| O-08 | As any **authorized sender**, I want a "Copy Email" button in the Composer that copies the fully merged subject and body for the currently previewed player so that I can send it from my own email client. |
| O-09 | As any **authorized sender**, I want a "Send via SendGrid" button that dispatches personalized emails to all selected recipients so that I can send in bulk with a single action. |
| O-10 | As an **Admin** or **Board** member, I want to send or reject offers for any team, overriding team scope, so that I can cover for absent coaches. |
| O-11 | As an **Assistant Coach**, I want to be prevented from accessing the Composer so that I cannot accidentally send offers or rejections. |
| O-12 | As any **authorized sender**, I want sent offers to immediately transition the player's status to "Sent" so that the pipeline reflects reality. |
| O-13 | As a **Head Coach**, I want to resend an offer to a player in "Sent" status so that a parent who missed the first email can be re-contacted. |
| O-14 | As any **authorized sender**, I want to re-offer a player in "Expired" status so that late-deciding families can still be accepted. |

---

### 12. Acceptance & Decline Token Flow

| # | Story |
|---|---|
| T-01 | As any **authorized sender**, I want a unique, cryptographically random accept token and decline token to be generated for each offer so that only the intended recipient can respond. |
| T-02 | As a **Parent**, I want to click the "Accept Your Spot" link in the offer email and land on a branded page showing my child's name, team, season, and offer expiry so that I can confirm the details before accepting. |
| T-03 | As a **Parent**, I want to click "Confirm Acceptance" on the landing page so that my child's spot is officially recorded without me needing to email a coach. |
| T-04 | As a **Parent**, after confirming acceptance I want to be immediately redirected to the SportsEngine registration page so that I can complete my child's registration in one flow. |
| T-05 | As a **Parent**, I want to receive a confirmation email after accepting so that I have a record and a reminder to complete SE registration if the redirect didn't work. |
| T-06 | As a **Parent**, I want to see a "Decline this offer" link on the landing page so that I can formally decline without emailing anyone. |
| T-07 | As a **Parent**, if I click an accept or decline link that has already been used, I want to see a clear "already accepted / already declined" message so that I'm not confused. |
| T-08 | As a **Parent**, if I click an expired acceptance link I want to see a friendly expiry message with contact information so that I know how to follow up. |
| T-09 | As a **Parent**, if I click an invalid or malformed token I want to see a generic "link not valid" message so that I'm not shown confusing technical errors. |
| T-10 | As a **Head Coach**, I want to receive a notification (email or in-app) when a player I coach accepts or declines an offer so that I know the roster status without manually checking. |
| T-11 | As an **Admin** or **Board** member, I want acceptance and decline events to be recorded with timestamps in the player's activity timeline so that there is a full audit trail. |
| T-12 | As a **Parent**, I want the acceptance landing page to be fully mobile-responsive so that I can accept from my phone when I first see the offer email. |

---

### 13. Email Templates

| # | Story |
|---|---|
| ET-01 | As an **Admin** or **Board** member, I want to edit the subject and body of all three templates (Early Offer, Offer Letter, Rejection Letter) in Settings → Email Templates so that messaging can be updated without a code change. |
| ET-02 | As an **Admin** or **Board** member, I want to see a live merge-field preview with a sample player name so that I can see exactly what a parent will receive before any real emails are sent. |
| ET-03 | As an **Admin** or **Board** member, I want to see a list of available merge fields inline so that I don't have to remember the syntax. |
| ET-04 | As an **Admin**, I want each new season to start with templates copied from the prior season so that I have a working starting point with minimal rework. |
| ET-05 | As an **Admin**, I want template changes to take effect immediately for new sends but leave previously sent emails unaffected so that changes can be made mid-season without retroactive confusion. |
| ET-06 | As an **Admin** or **Board** member, I want the SE registration URL to be embedded automatically via the `{{acceptUrl}}` merge field so that I never need to manually paste a URL into a template. |

---

### 14. SendGrid Integration

| # | Story |
|---|---|
| SG-01 | As an **Admin**, I want to enter the SendGrid API key, sender display name, and verified sender email in Settings → Integrations so that email delivery is fully configured in the UI with no code change. |
| SG-02 | As an **Admin**, I want the API key to be masked after saving so that it's never visible in the browser. |
| SG-03 | As an **Admin**, I want a "Test Connection" button that sends a test email to my address so that I can verify the SendGrid integration is working before a real send. |
| SG-04 | As an **Admin**, I want a "Disconnect" button that clears the SendGrid API key so that I can safely rotate credentials. |
| SG-05 | As any **authorized sender**, I want email opens and link clicks from SendGrid webhooks to be recorded per player so that engagement is tracked automatically. |
| SG-06 | As any **authorized sender**, I want manually copied emails to be recorded as "manual send" without open/click tracking so that the activity log accurately reflects the send method. |

---

### 15. Roster Screen

| # | Story |
|---|---|
| RS-01 | As a **Head Coach**, I want to see a paginated roster table scoped to my assigned team(s) so that I'm not distracted by players from other teams. |
| RS-02 | As an **Admin** or **Board** member, I want to see the full roster across all teams so that I have complete visibility. |
| RS-03 | As any **staff user**, I want to search by player name, parent name, or email so that I can find a specific player quickly. |
| RS-04 | As any **staff user**, I want to filter by status, team, and returning/early-offer-eligible flag so that I can create focused working lists. |
| RS-05 | As any **authorized sender**, I want to bulk-select players and trigger "Send Offer" or "Send Rejection" from the Roster so that I don't have to open each player individually. |
| RS-06 | As any **staff user**, I want bulk action buttons to be disabled unless all selected players are eligible for the action so that I can't accidentally send an offer to an already-accepted player. |
| RS-07 | As an **Admin** or **Board** member, I want a "Sync from SE" button in the Roster header so that I can trigger a sync without navigating to Settings. |
| RS-08 | As any **staff user**, I want to see the "Last synced from SE" timestamp in the Roster so that I know the freshness of imported data at a glance. |

---

### 16. Dashboard

| # | Story |
|---|---|
| D-01 | As a **Head Coach**, I want to see a dashboard scoped to my team(s) showing key offer pipeline stats (Offers Out, Accepted, Declined/Expired, In Pipeline) so that I have a quick status overview. |
| D-02 | As an **Admin** or **Board** member, I want to see aggregate stats across all teams so that I can monitor the overall pipeline health. |
| D-03 | As any **staff user**, I want an activity feed showing the last 30 days of offer events so that I can quickly spot recent activity without hunting through individual player records. |
| D-04 | As any **staff user**, I want a status breakdown bar chart so that I can see the distribution of player statuses at a glance. |
| D-05 | As any **staff user**, I want a "Recent Players" list showing the last 5 players by activity so that I can resume work on the most recent additions. |
| D-06 | As any **staff user**, I want quick-action "Add Player" and "Send Offer" buttons on the dashboard so that common actions are one click away. |
| D-07 | As an **Admin**, I want a prompt on the dashboard after tryout dates pass ("Ready to set up the next season?") so that I'm reminded to start the New Season Wizard. |

---

### 17. Sidebar Navigation

| # | Story |
|---|---|
| N-01 | As any **staff user**, I want persistent sidebar navigation with links to Dashboard and Roster so that I can move between screens without a page reload. |
| N-02 | As an **Admin** or **Board** member, I want a Settings link in the sidebar so that I can access configuration quickly. |
| N-03 | As any **staff user**, I want pipeline shortcut counts (Awaiting Response, Accepted, Waitlisted, Drafts) in the sidebar so that I can jump directly to a filtered roster view. |
| N-04 | As a **Head Coach** or **Assistant Coach**, I want a "Your Teams" section in the sidebar listing my assigned teams so that I always know my scope. |
| N-05 | As any **staff user**, I want a user card at the bottom of the sidebar showing my name and role badge so that clicking it opens my Account page, not a logout button, so that I can manage my own profile without confusion. |
| N-06 | As any **staff user**, I want a top sub-bar showing the current page, season label, and pending offer count so that context is always visible. |
| N-07 | As any **staff user**, I want an Account page (reachable from the sidebar user card) where I can view my name, email, and role, update my display name, change my password, and sign out — so that self-service account management is in one predictable place and logout is intentional. |
| N-08 | As any **staff user**, I want to change my own password from the Account page by supplying my current password and a new one that meets policy, so that I can rotate credentials without admin intervention. |

---

### 18. Activity Tracking

| # | Story |
|---|---|
| AT-01 | As any **staff user**, I want every significant event (player added, flag set, offer sent, email opened, landing page viewed, accepted, declined, expired, status changed, note added) logged with a timestamp and actor so that a complete audit trail exists. |
| AT-02 | As any **staff user**, I want the Player Detail modal to show a vertical offer timeline so that I can review the full history for an individual player. |
| AT-03 | As an **Admin** or **Board** member, I want the activity feed to include events across all teams so that I have org-wide visibility. |
| AT-04 | As a **Head Coach**, I want the activity feed to be scoped to my team(s) so that I'm not distracted by unrelated activity. |

---

### CSV Import

| # | Story |
|---|---|
| CSV-01 | As an **Admin**, I want to download a teams CSV template so I know the exact column format expected for import. |
| CSV-02 | As an **Admin**, I want to download a players CSV template so I can bulk-add players without manual entry. |
| CSV-03 | As an **Admin**, I want to upload a filled teams CSV and see a preview of what will be created/updated before committing. |
| CSV-04 | As an **Admin**, I want to upload a filled players CSV and see a preview with row-level validation errors highlighted. |
| CSV-05 | As an **Admin**, I want CSV row errors (missing required fields, bad date format, unknown team name) reported per-row so I can fix my file and re-upload. |
| CSV-06 | As a **Board** member, I want the same CSV import access as Admin so I can set up seasons without depending on an Admin. |

---

---

## Divisions & Eligibility

| # | Story |
|---|---|
| DIV-01 | As an **Admin**, I want to create divisions for a season — specifying a name and optional min/max age range and/or allowed grade list — so that eligibility rules are formally captured in the system rather than tracked in a spreadsheet. |
| DIV-02 | As an **Admin**, I want to edit or delete divisions at any time so that rule changes during the off-season don't require a code deployment. |
| DIV-03 | As an **Admin**, I want to assign a team to a division (or leave it unassigned) so that eligibility rules apply automatically to all players on that team. |
| DIV-04 | As an **Admin**, I want to set a season start date on each season so that player ages are calculated accurately as of the correct date when evaluating division eligibility. |
| DIV-05 | As a **Head Coach**, I want to see eligibility warnings in the Composer when I am about to send offers to players who may not meet their team's division requirements so that I can make an informed decision before sending. |
| DIV-06 | As a **Head Coach**, I want eligibility warnings to be advisory only and not block me from sending an offer so that I retain the ability to override the system when I have additional context. |
| DIV-07 | As an **Admin**, I want to filter the Roster by birth date range and grade so that I can pre-screen players against division eligibility requirements before offers go out. |
| DIV-08 | As a **Head Coach** or **Assistant Coach**, I want to see what division requirements are associated with a player's assigned team in the Player Detail modal so that I understand what eligibility rules apply to that player. |

---

## Part 2 — Development Backlog

---

### Milestone 1 — Foundation

| Status | # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|---|
| ✅ | M1-01 | Initialize project repository and toolchain | Monorepo: `server/` (Express+TypeScript+Drizzle) and `client/` (React+Vite+Tailwind). Root workspace `package.json`, `tsconfig`, ESLint, Prettier, Jest. | S | Infra | — |
| ✅ | M1-02 | Provision PostgreSQL database | Drizzle ORM configured, `db/index.ts` pool, `.env.example`, `drizzle.config.ts`, `db/migrate.ts` runner. | S | Infra | M1-01 |
| ✅ | M1-03 | Define core DB schema | All 12 tables: `users`, `teams`, `user_team_assignments`, `seasons`, `players`, `offers`, `activity_log`, `se_sync_log`, `email_templates`, `config`, `integrations`, `wizard_progress`. Full FK chains, indexes, Drizzle relations. | L | Backend | M1-02 |
| ✅ | M1-04 | Implement bcrypt password hashing | `hashPassword`, `verifyPassword` in `AuthService`. Unit tests covering correct hash, wrong password rejection. | XS | Auth | M1-02 |
| ✅ | M1-05 | Implement JWT auth (access + refresh tokens) | 15-min access tokens (HS256), `token_version` invalidation, `signAccessToken`, `verifyAccessToken`. Login flow in `AuthService.login`. Auth routes: login, logout, activate, reset-password, me. | M | Auth | M1-04 |
| ✅ | M1-06 | Auth middleware (server-side role enforcement) | `authenticate` middleware (JWT verify + DB token_version check), `requireRole(...roles)` factory, 401/403 responses. | M | Auth | M1-05 |
| ✅ | M1-07 | Team-scoping middleware | `injectTeamScope` middleware — injects `req.user.teamIds` for coaches; undefined (all teams) for admin/board. `canAccessTeam` helper. | M | Backend | M1-06 |
| ✅ | M1-08 | Login page (UI) | `LoginPage.tsx` — dark-theme email+password form, error display, redirect to `/dashboard` on success. | S | Frontend | M1-05 |
| ✅ | M1-09 | Admin invite flow — backend | `UserService`: `inviteUser`, `activateAccount`, `forcePasswordReset`, `resetPassword`, `resendInvite`, `deactivateUser`, `reactivateUser`, `deleteUser`, `updateUser`, `listUsers`. `/api/v1/users` routes. | L | Backend | M1-06 |
| ✅ | M1-10 | Admin invite flow — verification email | Invite and reset tokens generated and stored. Email send stubbed with `// TODO` comment; `devInviteToken` returned in non-production responses for manual sharing. | M | Backend | M1-09 |
| ✅ | M1-11 | Email domain allowlist enforcement | `validateEmailDomain` checked at both invite creation and account activation. Config-table driven, cache-invalidated on update. | S | Backend | M1-09 |
| ✅ | M1-12 | Settings → Users screen (UI) | `ActivatePage.tsx` (account setup flow). Full Users admin screen deferred to M5-01 (Settings shell). API client `usersApi` ready. | L | Frontend | M1-09 |
| ✅ | M1-13 | Sidebar navigation shell (UI) | `Sidebar.tsx` — logo, nav links (Dashboard, Roster, Settings for admin/board), pipeline shortcut counts, user card with logout. | M | Frontend | M1-05 |
| ✅ | M1-14 | Top sub-bar (UI) | `AppShell.tsx` — page label, season label, pending offer count in top bar. `Outlet` for child routes. | S | Frontend | M1-13 |
| ✅ | M1-15 | Design system tokens and base components | `tailwind.config.ts` brand colors, Barlow fonts. `Button`, `StatusBadge`, `RoleBadge`, `Input`, `Select` components. `cn`, `fmtDate`, `fmtRelative` utilities. | M | Frontend | M1-01 |

---

### Milestone 2 — SportsEngine Integration

| Status | # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|---|
| ✅ | M2-01 | Encrypted credential storage utility | `IntegrationsService`: AES-256-GCM encrypt/decrypt, `setIntegration`, `getIntegration`, `getIntegrationStatus` (masked). Token cache helpers. | S | Backend | M1-03 |
| ✅ | M2-02 | SE OAuth 2.0 client credentials flow | `SEApiClient` class — read-only `get()` only, token exchange + server-side caching, exponential backoff retry (1s/4s/16s for 429, once for 5xx). `SEApiError` with typed codes. | M | Integration | M2-01 |
| ✅ | M2-03 | Settings → Integrations — SE config (UI + API) | `IntegrationsTab.tsx` — SE card (client ID + secret, masked after save, Test Connection, Disconnect) + SendGrid card (API key, sender name/email, Test, Disconnect). `/api/v1/integrations` routes. | M | Frontend | M2-02 |
| ✅ | M2-04 | SE tryout registration sync — backend | `SyncService.syncSeason()` — paginated SE fetch, se_id + name+DOB upsert, app-managed field protection, `se_sync_log` write. | L | Backend | M2-02, M1-03 |
| ✅ | M2-05 | Sync trigger endpoints | `POST /sync/tryouts`, `POST /sync/returning`, `POST /sync/test-se`, `GET /sync/log`. Admin + Board only. Defaults to active season. | S | Backend | M2-04 |
| ✅ | M2-06 | Sync log UI (Settings → Seasons) | `syncApi.log()` in API client. Sync log display deferred to `SeasonsTab` (M5-02); data layer complete. | S | Frontend | M2-05 |
| ✅ | M2-07 | SE returning-player lookup | `SyncService.lookupReturningPlayers()` — iterates prior seasons, matches by se_id then name+DOB (no parent email matching), sets `is_returning + returning_source = se_match`. Skips manual flags. | M | Backend | M2-02, M1-03 |
| ✅ | M2-08 | SE inline error state (UI) | `SEErrorBanner` component — handles `SE_CREDENTIALS_MISSING`, `SE_AUTH_FAILED`, generic error with direct Settings link. | S | Frontend | M2-03 |
| ✅ | M2-09 | SE coach reference panel | `integrationsApi` extended. Panel deferred to M5 Users tab; SE data-fetch infrastructure complete. | S | Frontend | M2-07 |

---

### Milestone 3 — Roster & Offer Pipeline

| Status | # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|---|
| ✅ | M3-01 | Player CRUD — backend | `PlayerService`: create, list (filtered+paginated), get, update, delete. Team-scope enforced server-side. Offer expiry checked on-read via `checkAndExpireOffer`. All routes in `/api/v1/players`. | M | Backend | M1-07 |
| ✅ | M3-02 | Add Player modal (UI) | `AddPlayerModal.tsx` — all required fields, team dropdown (active teams only), coach notes field, draft status default. | M | Frontend | M3-01 |
| ✅ | M3-03 | Roster screen — table and filters (UI) | `RosterPage.tsx` — paginated table, search, status/team/returning filters, "Last synced" timestamp, SE sync button (admin/board), responsive columns. | L | Frontend | M3-01, M2-05 |
| ✅ | M3-04 | Roster screen — bulk select and actions (UI) | Checkboxes, select-all, "Send Offer" / "Send Rejection" bulk buttons with eligibility guards. Composer stub (wired in M4). | M | Frontend | M3-03 |
| ✅ | M3-05 | Player Detail modal (UI) | `PlayerDetailModal.tsx` — left pane (status, flags, info card, inline edit, notes editor, status override), right pane (full activity timeline with icons). Context-aware footer actions. | L | Frontend | M3-01 |
| ✅ | M3-06 | Offer status pipeline — backend | `setPlayerStatus` with activity logging. Status transitions enforced. `checkAndExpireOffer` runs on `getPlayer`. | M | Backend | M3-01 |
| ✅ | M3-07 | Returning player flag API | `PATCH /players/:id/returning-flag` (all roles, team-scoped) and `PATCH /players/:id/early-offer-eligible` (admin/board/head_coach only, blocks if not returning). Activity logged. | S | Backend | M1-07 |
| ✅ | M3-08 | Returning player flag (UI) | `FlagToggle` component in Player Detail modal — returning (all roles), early offer eligible (head_coach+, disabled if not returning). Inline feedback. | S | Frontend | M3-07 |
| ✅ | M3-09 | Offer expiry check-on-read | `checkAndExpireOffer` triggered by `getPlayer`. Marks player `expired`, logs `offer_expired` activity. | S | Backend | M3-06 |
| ✅ | M3-10 | Activity log — backend | `ActivityService`: `logEvent`, `logStaffEvent`, `logParentEvent`. All CRUD, flag, notes, and status events logged. `/api/v1/players/:id/activity` and `/api/v1/dashboard/activity` endpoints. | M | Backend | M1-03 |
| ✅ | M3-11 | Coach notes — backend | `PATCH /players/:id/notes` — all roles (team-scoped). Notes excluded from all merge contexts. `note_added`/`note_edited` activity events. | S | Backend | M1-07 |

---

### Milestone 4 — Email & Acceptance

| Status | # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|---|
| ✅ | M4-01 | SendGrid integration service | `EmailService`: `renderTemplate` (merge fields + button injection), `sendViaSendGrid` (per-player send, message ID tracking), `htmlToText`. | M | Integration | M2-01 |
| ✅ | M4-02 | Settings → Integrations — SendGrid config | Done in M2 — `IntegrationsTab` SendGrid card (API key, sender name/email, Test, Disconnect). | M | Frontend | M4-01 |
| ✅ | M4-03 | Email template rendering engine | Server-side `{{merge_field}}` substitution via `mergeFields`/`buildMergeContext`. HTML-escapes all values. Accept/decline URLs injected as buttons for offer templates. | M | Backend | M1-03 |
| ✅ | M4-04 | Acceptance token generation | `crypto.randomUUID()` accept + decline tokens on every offer send. Stored plaintext on `offers` row. `expiresAt` computed from season default or composer deadline. | S | Backend | M3-06 |
| ✅ | M4-05 | Composer modal — backend | `POST /offers` (send bulk, role-gated to admin/board/head_coach), `POST /offers/render` (preview, no side effects), `GET /offers/:id`. `OfferService` handles eligibility checks + status transitions + token creation. | M | Backend | M4-01, M4-03, M4-04 |
| ✅ | M4-06 | Composer modal (UI) | `ComposerModal.tsx` — mode (offer/early_offer/rejection), recipient checklist with eligibility filter, deadline picker, live paginated preview, "Copy Email" (clipboard + manual-copy offer record), "Send via SendGrid" bulk send. Wired into Roster bulk-select, Player Detail, Dashboard. | XL | Frontend | M4-05 |
| ✅ | M4-07 | Acceptance landing page — backend | `TokenService`: `validateAcceptToken`/`validateDeclineToken` (5 states). `POST /accept/:token` — transactional update, status change, confirmation email, coach notification, SE redirect. `POST /decline/:token` — parallel flow. | M | Backend | M4-04, M4-01, M3-10 |
| ✅ | M4-08 | Acceptance landing page (HTML) | Server-rendered plain HTML at `/accept/:token` — 5 states (valid, already_accepted, already_declined, expired, invalid). No-JS form POST. Jr Chargers branding. Mobile-responsive CSS. | L | Frontend | M4-07 |
| ✅ | M4-09 | Decline landing page (HTML) | `/decline/:token` — valid state shows confirmation dialog, already_declined shows thank-you. Same server-rendered HTML pattern. | S | Frontend | M4-07 |
| ✅ | M4-10 | SendGrid webhook handler | `POST /webhooks/sendgrid` — HMAC-SHA256 signature verification, `event=open` → sets `offers.opened_at` + logs activity. Returns 200 immediately to prevent retries. | M | Backend | M4-01, M3-10 |
| ✅ | M4-11 | Confirmation email on acceptance | `sendConfirmationEmail` called async after accept — sends parent a plain-text confirmation with SE registration link. Logs `confirmation_email_sent`. | S | Backend | M4-07, M4-01 |
| ✅ | M4-12 | Coach notification on accept/decline | `notifyCoaches` called async — emails all head coaches assigned to the player's team. | S | Backend | M4-07 |

---

### Milestone 5 — Settings & Admin

| # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|
| M5-01 | Settings shell and tab navigation (UI) | Build the Settings page layout with tab navigation (Seasons, Teams, Email Templates, Integrations, Security, Users, Reset Data). Show "Admins Only" notice for Head Coach and Assistant Coach. | S | Frontend | M1-15 |
| M5-02 | Settings → Seasons — CRUD (UI + API) | Season list, Add Season form (label, SE form names, registration URL, offer expiry, tryout dates), Edit Season, Set Active, Archive. Sync Now button per season. | L | Frontend | M1-03, M2-05 |
| M5-03 | Settings → Teams — CRUD (UI + API) | Team list with add, rename, deactivate. Show assigned coaches per team. Coach assignment editing from this screen. | M | Frontend | M1-03 |
| M5-04 | Settings → Email Templates (UI + API) | Template editor for all three templates (subject + body). Live merge-field preview with sample player input. Merge field reference. Per-season templates with copy-from-prior-season on new season creation. | L | Frontend | M4-03 |
| M5-05 | Settings → Security (UI + API) | Allowed email domains panel (add/remove), session timeout config, password policy config, "Force all password resets" action with confirmation phrase. Admin-only. | M | Frontend | M1-11 |
| M5-06 | New Season Wizard — backend | Endpoints to: create a new season record (Step 1), copy templates from prior season, run integration health checks (Step 3), commit the archive/activate transition (Step 4). Save wizard progress between sessions. | L | Backend | M1-03, M2-02, M4-01 |
| M5-07 | New Season Wizard — UI | Build the 4-step wizard: Step 1 (season details + carry-forward summary), Step 2 (template review and edit), Step 3 (live integration checks with inline credential editing), Step 4 (confirmation summary + activate). Persist progress. | XL | Frontend | M5-06, M5-04 |
| M5-08 | Settings → Reset Data (UI + API) | "Reset to seed data" action requiring a confirmation phrase. Hidden in production via environment flag. Admin-only. | S | Backend | M1-03 |

---

### Milestone 6 — Dashboard & Polish

| # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|
| M6-01 | Dashboard stat tiles — API | Endpoint returning pipeline counts (offers out, accepted, declined/expired, in pipeline) for the current season, scoped by role/team. | S | Backend | M3-06 |
| M6-02 | Dashboard stat tiles (UI) | Four tile layout rendering counts from M6-01. Refreshes on load. | S | Frontend | M6-01 |
| M6-03 | Dashboard activity feed — API | Endpoint returning the last 30 days of activity log entries, scoped by role/team, with actor names and event descriptions. | S | Backend | M3-10 |
| M6-04 | Dashboard activity feed (UI) | Chronological activity list with timestamps, event icons, and player links. | M | Frontend | M6-03 |
| M6-05 | Dashboard status breakdown chart (UI) | Bar chart of player counts per status for the current season. | S | Frontend | M6-01 |
| M6-06 | Dashboard recent players (UI) | List of last 5 players by offer send date or creation date with status badges and quick-open links to Player Detail. | S | Frontend | M6-01 |
| M6-07 | Pipeline sidebar counts — API | Endpoint (or extend existing) returning live counts for Awaiting Response, Accepted, Waitlisted, Drafts for sidebar shortcut display. | S | Backend | M3-06 |
| M6-08 | Pipeline sidebar counts (UI) | Wire sidebar shortcut badges to M6-07 API. Each badge links to a filtered roster view. | S | Frontend | M6-07, M1-13 |
| M6-09 | "Last synced" timestamp in Roster header | Display `lastSyncedAt` from the most recent sync log entry for the active season in the Roster header. Auto-refresh after sync completes. | XS | Frontend | M2-06 |
| M6-10 | New season prompt on Dashboard | Show a "Ready to set up [next year]?" prompt on the Dashboard when the active season's tryout end date has passed and no next season is configured. Links to New Season Wizard. | S | Frontend | M5-07 |
| M6-11 | Mobile-responsive audit pass for landing page | Final responsive QA pass on the acceptance and decline landing pages across common mobile viewports (375px, 390px, 414px). Fix any layout regressions. | S | Frontend | M4-08, M4-09 |
| M6-12 | End-to-end offer flow integration test | Automated test covering: add player → send offer → visit accept token URL → confirm acceptance → verify status = accepted, activity logged, confirmation email queued, SE redirect recorded. | M | Backend | M4-08, M4-11, M4-12 |
| M6-13 | Role-permission integration tests | Automated tests asserting: Assistant Coach cannot access Composer API; non-Admin cannot access Users API; team-scoped queries return only scoped data; returning/early-offer flag permissions per role. | M | Backend | M1-06, M1-07 |

---

### Milestone 7 — SportsEngine API Explorer

| # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|
| M7-01 | SE Explorer — backend diagnostic endpoints | New admin-only routes under `/api/v1/integrations/se-explorer`: `GET /status` (live token exchange + org name + scopes), `GET /seasons` (program/season listing), `GET /seasons/:id/teams` (team list for a season), `GET /forms/:id/schema` (registration form field definitions with PII stripped). All calls proxy through the existing `SEApiClient`; nothing is written to the DB. | M | Backend | M2-02 |
| M7-02 | SE Explorer — UI (Settings → Integrations tab) | New collapsible "SE Data Explorer" panel in the Integrations tab, visible only to Admin. Left pane: endpoint picker (Connection Status, Seasons, Teams, Form Schema — tryout and coaches forms). Right pane: pretty-printed, collapsible JSON response with a "Last fetched" timestamp. Loading and error states per endpoint. Clear "Diagnostic only — read-only" label. | L | Frontend | M7-01, M2-03 |
| M7-03 | SE Explorer — PII guard | Server-side middleware on all explorer endpoints that strips or redacts personal member data (names, emails, phone numbers, DOB) from any SE response before it reaches the browser. Only structural / schema-level data is returned. If member records must be fetched to infer schema, limit to 1–3 samples and clearly mark them as examples. | S | Backend | M7-01 |
| M7-04 | SE Explorer — acceptance tests | Tests asserting: endpoints return 403 for non-admin roles; connection status endpoint returns correct shape; PII guard strips personal fields from sample records; all explorer routes are read-only (no DB writes triggered). | S | Backend | M7-01, M7-03 |

---

### Milestone 8 — Organization Branding

| # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|
| M8-01 | Org branding — DB & API | Add `org_name`, `logo_url`, `brand_primary`, `brand_secondary` keys to the existing `config` table. New admin-only routes: `GET /api/v1/org/branding` (returns all four values with defaults), `PATCH /api/v1/org/branding` (validates and saves). Hex color validation on server (#RRGGBB or #RGB). Logo stored as URL path referencing an uploaded file. | M | Backend | — |
| M8-02 | Org branding — color CSS variables | On app load, fetch branding config and inject CSS custom properties (`--brand`, `--brand-hover`, `--brand-pressed`) into `:root`. Update `tailwind.config.ts` to resolve `brand` color to `var(--brand)` so all existing `text-brand`, `bg-brand`, `border-brand` classes pick up the dynamic value automatically. Default to `#AD0303` if not configured. | M | Frontend | M8-01 |
| M8-03 | Org branding — logo & name | Replace hardcoded `HC-logo-icon.png` and "Jr Chargers" wordmark in the Sidebar and LoginPage with values from branding config. Logo upload: accept PNG/JPG/SVG up to 2 MB, store under `public/uploads/`. Org name used in sidebar wordmark and email footer. Fall back to initials avatar and "My Organization" if not configured. | M | Full-stack | M8-01 |
| M8-04 | Org branding — Settings UI | New "Organization" tab in Settings (visible to Admin only, positioned before Seasons). Form with: org name text field, logo upload with preview, primary color hex input with live swatch, secondary color hex input with live swatch. Save button. Live preview updates the color swatches instantly as the user types a valid hex. | L | Frontend | M8-01, M8-02, M8-03 |
| M8-05 | Org branding — acceptance tests | Tests: `GET /org/branding` returns defaults when unconfigured; `PATCH /org/branding` saves valid hex and rejects invalid; non-admin `PATCH` returns 403; logo upload rejects oversized files; CSS variable injection uses saved values. | S | Backend | M8-01 |

---

---

### Milestone 9 — CSV Import

| # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|
| M9-01 | CSV import — server routes | New admin/board routes: `GET /api/v1/import/template/teams` and `GET /api/v1/import/template/players` return CSV text with headers + one example row. `POST /api/v1/import/teams` and `POST /api/v1/import/players` accept `{ csv: string, seasonId?: string, commit?: boolean }` JSON. Parse CSV, validate rows, return preview object (created/updated/skipped/errors arrays). When `commit=true`, write valid rows to DB and return final counts. | L | Backend | — |
| M9-02 | CSV import — client UI | "Import from CSV" button on Settings → Teams tab and on the Roster page. Clicking opens a modal: download template link, file picker (`.csv`), FileReader parses to text, POST preview, show results table (green=create, yellow=update, red=error), Confirm button triggers commit POST, success message. | L | Frontend | M9-01 |
| M9-03 | CSV import — acceptance tests | Tests: template endpoints return correct headers; valid teams CSV creates teams; duplicate name updates division; missing required field returns row error; players CSV assigns team by name; players with unknown team import as unassigned with warning; non-admin/board returns 403. | M | Backend | M9-01 |

---

---

### Milestone 10 — Bulk Team Management

| # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|
| M10-01 | Bulk team delete — server | `POST /api/v1/teams/bulk-delete` (admin only): accepts `{ ids: string[] }`, unassigns players (sets teamId null), removes coach assignments, hard-deletes teams. `DELETE /api/v1/teams` (admin only): same but for ALL teams. Both return `{ ok, deleted: number }`. | S | Backend | — |
| M10-02 | Bulk team delete — client | Checkbox on each TeamCard; header shows "Delete Selected (N)" button when ≥1 selected; confirmation modal before executing. "Reset All Teams" danger button with type-to-confirm dialog ("type DELETE to confirm"). Both reload the team list on success. | M | Frontend | M10-01 |

---

### Milestone 11 — Divisions & Eligibility

| # | Title | Description | Size | Category | Dependencies |
|---|---|---|---|---|---|
| M11-01 | Divisions — DB schema & migration | Add `divisions` table (id, season_id, name, min_age, max_age, allowed_grades[]). Add `division_id FK` to `teams`. Add `season_start_date` to `seasons`. Generate and commit Drizzle migration. | S | Backend | M1-03 |
| M11-02 | Divisions — CRUD API | Admin-only routes: `GET /api/v1/divisions?seasonId=`, `POST /api/v1/divisions`, `PATCH /api/v1/divisions/:id`, `DELETE /api/v1/divisions/:id`. Validate that min_age ≤ max_age when both are provided. | M | Backend | M11-01 |
| M11-03 | Team division assignment — API | Extend `PATCH /api/v1/teams/:id` to accept `divisionId` (nullable). Return `divisionId` and division name in team list and detail responses. | S | Backend | M11-02 |
| M11-04 | Season start date — API | Extend season create/update endpoints to accept and persist `seasonStartDate`. Return it in all season responses. | XS | Backend | M11-01 |
| M11-05 | Eligibility evaluation service | `EligibilityService.evaluate(playerId, divisionId, seasonStartDate)` — computes player age as of `seasonStartDate`, checks against division min/max age, checks grade against `allowed_grades`. Returns `{ eligible: boolean, warnings: string[] }`. | M | Backend | M11-02 |
| M11-06 | Eligibility warnings in Offer Composer | Before sending, `OfferService` calls `EligibilityService.evaluate` for each player whose team has a division. Eligibility result returned in `POST /offers/render` response and surfaced as advisory warnings in the Composer UI. Does not block send. | M | Backend | M11-05, M4-05 |
| M11-07 | Settings → Divisions tab (UI) | New "Divisions" tab in Settings (admin only). Division list for the active season: name, age range, allowed grades, assigned teams. Add/Edit/Delete division forms with season start date picker. Team-to-division assignment dropdown in the Teams tab. | L | Frontend | M11-02, M11-03, M11-04 |
| M11-08 | Eligibility warnings in Composer UI | Display per-player eligibility warnings in the Composer recipient list (advisory badge, tooltip with reason). "Send via SendGrid" and "Copy Email" remain enabled regardless of eligibility status. | M | Frontend | M11-06 |
| M11-09 | Division info in Player Detail modal | Show the division name and its eligibility requirements (age range, allowed grades) in the Player Detail modal when the player's team has an assigned division. | S | Frontend | M11-07 |
| M11-10 | Player eligibility filter in Roster | Add birth date range and grade filter controls to the Roster screen so admins can pre-screen players against division requirements before sending offers. | M | Frontend | M11-07, M3-03 |
| M11-11 | Divisions acceptance tests | Tests: create division with valid/invalid age ranges; assign team to division; age calculation uses season_start_date correctly; eligibility service returns correct warnings; non-admin division routes return 403; deleting a division does not delete teams (nullifies division_id). | M | Backend | M11-05 |

---

*End of USER-STORIES.md*
