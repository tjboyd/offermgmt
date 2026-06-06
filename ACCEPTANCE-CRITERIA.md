# Acceptance Criteria & Automated Test Cases
# Hamilton Jr Chargers — Offer Management System

Each section maps to a user story or development task. Format:
- **AC:** Acceptance Criteria (testable conditions that must be true for the story to be done)
- **Tests:** Automated test descriptions (Jest/Supertest format)

---

## Auth & Session Management

### A-01 — Log in with email and password
**AC:**
- Valid email + correct password → 200 with `accessToken` + `jrc_refresh` httpOnly cookie
- Wrong password → 401 `"Invalid credentials"`
- Deactivated account → 403 `"Account deactivated"`
- Unverified account → 403 `"Email not verified"`
- Missing email field → 400 validation error
- Invalid email format → 400 validation error

**Tests:**
- `POST /auth/login — 200 + accessToken for valid credentials`
- `POST /auth/login — sets httpOnly jrc_refresh cookie`
- `POST /auth/login — 401 for wrong password`
- `POST /auth/login — 403 for deactivated account`
- `POST /auth/login — 403 for unverified account`
- `POST /auth/login — 400 for missing email`

### A-02/03/04 — Role-specific login
**AC:**
- Each role (admin, board, head_coach, assistant_coach) receives `role` field in login response
- JWT payload contains `sub`, `role`, `tokenVersion`
- Head coach and assistant coach `teamIds` injected on scope middleware

**Tests:**
- `JWT payload contains correct role for each user type`
- `injectTeamScope — returns undefined teamIds for admin/board`
- `injectTeamScope — returns assigned teamIds for head_coach`

### A-05 — Session timeout
**AC:**
- Idle session expires after `session_timeout_hours` config value
- Expired access token returns 401 on any protected route
- Config change takes effect within 60 seconds (cache TTL)

**Tests:**
- `Expired JWT returns 401 on GET /auth/me`
- `Config cache invalidates within TTL window`

### A-06 — JWT refresh
**AC:**
- `POST /auth/refresh` with valid cookie issues new access token
- Expired or absent cookie returns 401
- Token version mismatch (after forced reset) returns 401

**Tests:**
- `POST /auth/refresh — 401 without cookie`
- `Incremented token_version invalidates existing JWT`

### A-07 — Redirect on session expiry
**AC:**
- React app redirects unauthenticated requests to `/login`
- Post-login redirect returns user to originally requested URL

**Tests:**
- `RequireAuth component redirects to /login when user is null`
- `Successful login navigates to /dashboard`

---

## User & Account Management

### U-01/02 — Invite user with domain validation
**AC:**
- `POST /users/invite` with valid domain email → 201, creates pending user
- Email outside allowed domain → 403 `"Email domain is not in the allowed list"`
- Non-admin calling invite → 403 `"Insufficient permissions"`
- Duplicate email → 409 conflict

**Tests:**
- `POST /users/invite — 201 for valid jrchargersbaseball.com email`
- `POST /users/invite — 403 for gmail.com domain`
- `POST /users/invite — 403 when called by head_coach`
- `POST /users/invite — 409 for duplicate email`

### U-03 — Invite email verification
**AC:**
- Invite token is UUID, expires in 24 hours
- `POST /auth/activate` with valid token + compliant password → activates account, `email_verified = true`
- Expired token → 400 error
- Invalid token → 400 error
- Non-compliant password → 400 with policy message

**Tests:**
- `POST /auth/activate — 200 for valid token + strong password`
- `POST /auth/activate — sets email_verified = true in DB`
- `POST /auth/activate — 400 for expired token`
- `POST /auth/activate — 400 for password below min length`

### U-07 — Force password reset
**AC:**
- `POST /users/:id/force-reset` (admin only) → increments `token_version`
- All existing JWTs for that user immediately return 401
- User receives reset email (stubbed in M1; real in M4)

**Tests:**
- `Force reset increments token_version in DB`
- `JWT issued before force-reset returns 401 after reset`
- `POST /users/:id/force-reset — 403 for non-admin caller`

### U-08/09 — Deactivate / reactivate
**AC:**
- Deactivated user cannot log in (403)
- Deactivated user's `token_version` incremented (immediate session kill)
- Admin cannot deactivate their own account → 400
- Reactivated user can log in normally

**Tests:**
- `Deactivated account returns 403 on login`
- `Admin self-deactivation returns 400`
- `Reactivated account returns 200 on login`

### U-11 — Cannot delete own account
**AC:**
- `DELETE /users/:id` where `id === req.user.id` → 400

**Tests:**
- `DELETE /users/self — 400 self-delete blocked`

### U-14 — Role assignment rules
**AC:**
- Admin can assign any role including admin/board
- Board member cannot assign admin or board role → 403
- Head coach / assistant coach cannot assign any roles → 403

**Tests:**
- `Board assigning admin role returns 403`
- `Head coach calling invite endpoint returns 403`

---

## Security Settings

### S-01 — Domain allowlist management
**AC:**
- `PATCH /config` with `{ allowed_domains: ["jrchargersbaseball.com", "example.com"] }` → saved and immediately enforced
- New invite to `example.com` succeeds after domain added
- Existing accounts unaffected by domain removal

**Tests:**
- `Adding a domain to allowlist allows invite to that domain`
- `Removing a domain blocks new invites but not existing accounts`

### S-04 — Force all password resets
**AC:**
- Increments `token_version` for every active user
- All active sessions invalidated within one request

**Tests:**
- `Force-all-reset increments token_version for all users`
- `All pre-reset JWTs return 401 after bulk reset`

---

## SportsEngine Integration

### SE-01/02 — SE credentials admin UI
**AC:**
- `PUT /integrations/sportsengine` stores AES-256-GCM encrypted values
- `GET /integrations` returns `{ sportsengine: { configured: true, maskedClientId: "••••abc" } }` — never raw values
- Fields masked in browser after save

**Tests:**
- `PUT /integrations/sportsengine — encrypts value before DB write`
- `GET /integrations — never returns raw client_secret`
- `decrypt(encrypt(payload)) === payload`

### SE-03 — Test connection button
**AC:**
- Valid credentials → 200 with SE org name
- Invalid credentials → 502 `"SE_AUTH_FAILED"`
- Missing credentials → 503 `"SE_CREDENTIALS_MISSING"` with settings link

**Tests:**
- `POST /sync/test-se — 503 when no credentials stored`
- `POST /sync/test-se — 502 when SE returns 401`

### SE-06/07 — Upsert sync preserves app data
**AC:**
- New SE registrant → player created with `status = 'draft'`, `imported_from_se = true`
- Existing player (matched by se_id) → only SE-sourced fields updated; `status`, `notes`, `team_id`, flags untouched
- Player in app not in SE → not deleted, not modified
- Sync log row written on every sync with counts

**Tests:**
- `Sync creates new player for SE registrant not in DB`
- `Sync updates contact info but not status for existing player`
- `Sync does not delete players absent from SE response`
- `Sync writes se_sync_log row with records_fetched, records_new, records_updated`

### SE-11 — Returning player matching
**AC:**
- Player matched by SE member ID → `is_returning = true`, `returning_source = 'se_match'`
- Player matched by first_name + last_name + DOB → `is_returning = true`, `returning_source = 'se_match'`
- No match → `is_returning` unchanged
- Manual flag not overwritten by SE match

**Tests:**
- `SE match by se_id sets is_returning = true`
- `SE match by name+DOB sets is_returning = true`
- `Manually-set returning flag not cleared by SE lookup`

### SE-13 — Read-only enforcement
**AC:**
- `SEApiClient` class has no `post()`, `put()`, `patch()`, or `delete()` methods
- Any attempt to call a write method throws a compile-time error (TypeScript)

**Tests:**
- `SEApiClient — only get() method exists on class`
- `TypeScript compilation fails if write method added to SEApiClient`

---

## Season & Team Management

### SM-01/02 — Season CRUD
**AC:**
- Creating a season with duplicate label → 409 conflict
- `seasons_one_active` partial unique index prevents two active seasons
- Editing SE form name takes effect on next sync without code change

**Tests:**
- `POST /seasons — 409 for duplicate season label`
- `POST /seasons/:id/activate — deactivates previously active season`
- `Sync uses updated se_tryout_form_names after edit`

---

## Player Management

### P-01 — Add player manually
**AC:**
- Player created with `status = 'draft'`, `imported_from_se = false`
- Requires: first name, last name, parent email, team
- Head coach can only add to their assigned teams → 403 for other teams
- `player_added` activity log event written

**Tests:**
- `POST /players — 201 with all required fields`
- `POST /players — 400 missing parent email`
- `POST /players — 403 when head_coach assigns to unassigned team`
- `player_added activity_log event written on create`

### P-07 — Coach notes never in emails
**AC:**
- `notes` field excluded from all email merge contexts
- Template renderer has no access to `notes` field

**Tests:**
- `buildMergeContext does not include notes field`
- `Rendered offer email body does not contain player notes text`

---

## Returning Player & Early Offer Flags

### R-01 — Manual returning flag
**AC:**
- Admin, Board, Head Coach, Assistant Coach can set `is_returning = true/false`
- `returning_flagged_by` and `returning_flagged_at` recorded
- `returning_source = 'manual'` when set manually

**Tests:**
- `PATCH /players/:id/returning-flag — 200 for head_coach on own team`
- `PATCH /players/:id/returning-flag — 403 for head_coach on other team`
- `returning_flagged_by set to req.user.id`

### R-03 — Early offer eligible (head coach and above only)
**AC:**
- Assistant coach calling `PATCH /players/:id/early-offer-eligible` → 403
- Head coach on own team → 200

**Tests:**
- `PATCH /players/:id/early-offer-eligible — 403 for assistant_coach`
- `PATCH /players/:id/early-offer-eligible — 200 for head_coach on own team`

---

## Offer & Rejection Workflow

### O-08 — Copy email for manual send
**AC:**
- `POST /offers/render` returns `{ subject, bodyText, bodyHtml }` with all merge fields resolved
- `accept_token` and `decline_token` generated and stored even for manual copies
- `sent_method = 'manual_copy'` recorded on offer row

**Tests:**
- `POST /offers/render — returns merged subject and body`
- `Manual copy offer has accept_token and decline_token in DB`
- `sent_method = manual_copy on manual copy offer`

### O-11 — Assistant coach blocked from composer
**AC:**
- `POST /offers` called by assistant_coach → 403
- `POST /offers/render` called by assistant_coach → 403

**Tests:**
- `POST /offers — 403 for assistant_coach`
- `POST /offers/render — 403 for assistant_coach`

---

## Tokenized Acceptance Flow

### T-01 — Unique tokens generated per offer
**AC:**
- Each offer row has unique `accept_token` and `decline_token` (UUIDs)
- Tokens are unique across all offer rows (`UNIQUE` constraint)
- Tokens not null when offer is sent

**Tests:**
- `accept_token and decline_token are UUID format`
- `Two offers never share the same accept_token`
- `accept_token is not null after offer sent`

### T-02/03 — Acceptance landing page states
**AC:**
- Valid token → 200 HTML with player name, team, season, expiry, Confirm button
- Already accepted → page shows "already accepted" state
- Already declined → page shows "already declined" state
- Expired → page shows expiry message with contact info
- Invalid token → generic "link not valid" message

**Tests:**
- `GET /accept/:token — 200 with player name in HTML for valid token`
- `GET /accept/:token — shows already_accepted state when accepted_at set`
- `GET /accept/:token — shows expired state when expires_at in past`
- `GET /accept/:token — shows invalid state for unknown token`

### T-03/04 — Confirm acceptance
**AC:**
- `POST /accept/:token` → sets `accepted_at`, `status = 'accepted'`, redirects to SE URL
- Idempotent: second POST returns already-accepted page, no duplicate DB writes
- `offer_accepted` activity log event written with `actor_label = 'Parent via link'`
- Race condition handled via transaction (`UPDATE ... WHERE accepted_at IS NULL`)

**Tests:**
- `POST /accept/:token — sets offer.accepted_at and player.status = accepted`
- `POST /accept/:token — 302 redirect to se_registration_url`
- `POST /accept/:token — second call returns already_accepted page, no DB change`
- `activity_log has offer_accepted event with actor_label = Parent via link`

### T-06 — Decline flow
**AC:**
- `POST /decline/:token` → sets `declined_at`, `status = 'declined'`
- Does not redirect to SE

**Tests:**
- `POST /decline/:token — sets declined_at and player.status = declined`
- `POST /decline/:token — no redirect to SE registration URL`

### T-08 — Expired token
**AC:**
- Token with `expires_at < NOW()` → expiry page shown
- `POST /accept/:token` with expired token → rejected, no state change

**Tests:**
- `Expired token returns expired state page`
- `POST /accept/expired-token — no DB state change`

### T-12 — Mobile-responsive landing page
**AC:**
- Landing page renders without JavaScript (pure HTML form POST)
- Confirm button and Decline link visible at 375px viewport width
- No horizontal scroll at 320px

**Tests:**
- `GET /accept/:token — response is plain HTML, no React bundle dependency`
- `Landing page HTML contains <form method="POST"> element`

---

## SendGrid Integration

### SG-01/02 — SendGrid credentials
**AC:**
- `PUT /integrations/sendgrid` stores encrypted API key, sender name, sender email
- `GET /integrations` returns masked `{ sendgrid: { configured: true, senderEmail: "o...@jrchargersbaseball.com" } }`

**Tests:**
- `PUT /integrations/sendgrid — stores encrypted value`
- `GET /integrations — does not return raw api_key`

### SG-05 — Open tracking via webhook
**AC:**
- `POST /webhooks/sendgrid` with `event: "open"` → sets `offers.opened_at` for matching `sendgrid_message_id`
- Invalid webhook signature → 401
- Missing `sendgrid_message_id` match → no-op, still returns 200

**Tests:**
- `POST /webhooks/sendgrid — sets opened_at for matching message ID`
- `POST /webhooks/sendgrid — 401 for invalid signature`
- `POST /webhooks/sendgrid — 200 even when message ID not found`

---

## Email Templates

### ET-01 — Template editing
**AC:**
- `PUT /email-templates/:seasonId/offer_letter` updates subject and body in DB
- Change takes effect immediately for next send
- Previously sent emails not retroactively changed

**Tests:**
- `PUT /email-templates/:seasonId/offer_letter — updates DB row`
- `Render after template update uses new template body`

### ET-02 — Merge field preview
**AC:**
- All `{{field}}` placeholders replaced in preview output
- Unknown fields left as `{{fieldName}}` (not blank)
- HTML-injected values escaped

**Tests:**
- `mergeFields replaces all known fields`
- `mergeFields leaves unknown fields as-is`
- `mergeFields HTML-escapes injected values`

---

## Dashboard

### D-01/02 — Stat tiles scoped by role
**AC:**
- Head coach sees only counts for their assigned team(s)
- Admin/Board see aggregate counts across all teams
- Counts match actual DB state

**Tests:**
- `GET /dashboard/stats — head_coach returns only own-team player counts`
- `GET /dashboard/stats — admin returns all-team counts`
- `Stat tile counts match SELECT COUNT(*) queries by status`

### D-03 — Activity feed
**AC:**
- Returns last 30 days of events
- Head coach feed scoped to own teams
- Events include actor_label and ts

**Tests:**
- `GET /dashboard/activity — events older than 30 days excluded`
- `GET /dashboard/activity — head_coach sees only own-team events`

---

## Role-Permission Integration Tests

These are the M6-13 cross-cutting tests:

**Tests:**
- `Assistant coach POST /offers — 403`
- `Assistant coach POST /offers/render — 403`
- `Head coach GET /players — returns only own-team players`
- `Head coach PATCH /players/:id/early-offer-eligible on other team — 403`
- `Board PATCH /users/:id with role=admin — 403`
- `Head coach GET /settings/users — 403 (Settings is admin/board only)`
- `Admin GET /players — returns all teams`
- `Non-admin POST /seasons — 403`
- `Non-admin POST /sync/tryouts — 403`
- `Deactivated user JWT returns 403 on any protected route`

---

## End-to-End Offer Flow (M6-12)

Full flow test covering the critical path:

1. Admin invites head coach → coach activates account
2. SE sync creates player in Draft status
3. Head coach flags player as returning + early offer eligible
4. Head coach opens Composer, selects player, sends early offer via SendGrid
5. Player `status` → `sent`, `accept_token` generated
6. Parent visits `/accept/:token` → confirmation page shown
7. Parent clicks Confirm → `accepted_at` set, `status` → `accepted`
8. Redirect to SE registration URL occurs
9. Activity log contains: `player_added`, `offer_sent`, `offer_accepted`, `se_redirected`
10. Coach sees updated status in Roster

**Tests:**
- `Full offer flow: draft → sent → accepted with correct DB state at each step`
- `accept_token single-use: second acceptance POST is no-op`
- `Activity log contains all expected events in correct order`
- `Expired offer: POST /accept/:token after expiry returns expired page`
- `Rejection flow: player status = rejected after rejection sent`

---

*Acceptance criteria version: 1.0 — aligned with PRD v1.7 and USER-STORIES.md v1.0*
