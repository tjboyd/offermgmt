# Phase 2 — Feature Backlog
# Hamilton Jr Chargers — Offer Management System

**Status:** Planning  
**Phase 1 baseline:** All six milestones (M1–M6) complete. Auth, roster, offer pipeline, email/acceptance, full settings, dashboard.  
**How to use this document:** Add items under the appropriate section as you identify them. Each item should capture the *what* and the *why* — the build details come later when an item is promoted to the active backlog.

---

## How to Add an Item

Use this format for new entries:

```
### [Short Title]
**Request:** What the feature does from the user's point of view.  
**Why / Problem solved:** What gap or friction this addresses.  
**Affected roles:** Which roles benefit or are impacted.  
**Notes / open questions:** Anything that needs to be decided before building.  
**Priority:** Low / Medium / High (rough, can change)
```

---

## 1. Communication & Offers

*Features that extend how offers, rejections, and other emails are sent and tracked.*

<!-- Add items here -->

---

## 2. SportsEngine Integration

*Deeper or bidirectional SE integration beyond the current read-only sync.*

### ~~Team Import from SportsEngine Season Management~~ ✅ Promoted to active backlog — see USER-STORIES.md Milestone 8
**Request:** Admins and Board members can import teams directly from a SportsEngine season rather than creating them manually in Settings → Teams. A "Import from SportsEngine" button on the Teams tab triggers an API call to SE's season management endpoints, fetches the team roster from the selected season, and upserts matching teams into the app. Existing teams matched by name are updated; new teams are created; teams no longer in SE can be flagged for review.  
**Why / Problem solved:** Currently teams must be entered manually one at a time. When the org configures a new season in SE (e.g., 12 teams across multiple age groups), there is no way to pull that structure into the app without tedious re-entry. This eliminates duplicate data entry and keeps the team list consistent with what was set up in SE.  
**Affected roles:** Admin, Board (import trigger). All roles benefit from accurate team data.  
**Notes / open questions:**
- Requires investigation of the SportsEngine API surface — specifically whether the SE API exposes season team listings (teams within a season/program, not just tryout registrations). The current Phase 1 integration uses the SE read-only OAuth client credentials flow, so the auth mechanism is already in place if the endpoint exists.
- Need to confirm SE API endpoints: likely something under `/programs/{id}/teams` or `/seasons/{id}/teams` — to be validated against SE API docs.
- Matching logic: match on team name exact, name fuzzy, or SE internal team ID if exposed.
- Conflict resolution: what happens if a team exists in the app with the same name but different division? Prompt the admin to confirm or override.
- Should division/age group (e.g., "AAA", "AA") be inferred from SE data or remain manually editable post-import?
- Consider a dry-run / preview step before committing: show the admin "3 teams will be created, 1 updated, 0 removed" before writing to the DB.
- This is read-only from SE's perspective — no data is written back to SE.  
**Priority:** High

### ~~SportsEngine API Explorer (Admin Diagnostic Tool)~~ ✅ Promoted to active backlog — see PRD §5.7 and Milestone 7

**Request:** An admin-only screen (e.g., Settings → Integrations → SE Explorer, or a dedicated dev/diagnostic tab) that lets admins browse raw SportsEngine API responses in a structured, readable way — without touching the database. The goal is validation and confidence-building: confirm the connection works, confirm the correct forms and fields are being returned, and spot-check the data shape before any sync or import is run.

The explorer should surface at minimum:
- **Connection status** — live token exchange result (org name, token expiry, scopes granted)
- **Season / program listing** — what seasons and programs the SE credentials can see
- **Team listing per season** — teams returned under a given season, their names, IDs, and any division/age group metadata
- **Registration form schema** — for a selected tryout form or registration form: what fields/attributes are configured (field names, types, whether required) — *not* the member records themselves, just the form structure. This answers "are we set up to receive `parentEmail`, `playerDOB`, etc.?"
- **Coaches registration form schema** — same field-level inspection for the separate coaches registration form, to validate it can drive user provisioning and team assignment in the offer management tool. Confirms the right form is pointed at and that expected attributes (coach name, email, assigned team) are present before any import is built

**Why / Problem solved:** Without this, the only way to validate SE data is to run a full sync and inspect the DB — a destructive-direction operation that can pollute real data with bad imports. The explorer provides a safe, read-only window into SE before any data flows into the app. It also dramatically reduces the time to diagnose SE credential or form configuration issues, and gives the admin confidence that a new coaches-import or team-import feature will work correctly before it is enabled.

**Affected roles:** Admin only. The screen is not visible to any other role.

**Notes / open questions:**
- All calls are strictly read-only — nothing is written to SE or the app DB from this screen.
- Response data should be pretty-printed JSON with collapsible sections, not a raw dump. A two-panel layout (endpoint picker on the left, response viewer on the right) works well.
- Should be clearly labelled as a diagnostic tool, not a data entry screen, to avoid confusion.
- Sensitive member data (PII from registration submissions) should NOT be surfaced here — only structural / schema-level data. If the SE API requires fetching actual records to discover schema, show only the first 1–3 sample records with a clear warning, or redact personal fields.
- Consider a "last tested" timestamp per endpoint so admins can see freshness without re-fetching.
- This screen gives admins everything they need to validate before flipping on the Team Import (above) or Coaches Import features.
- The existing `SEApiClient` and `IntegrationsService` from Phase 1 provide the auth and HTTP layer — the explorer is mostly a thin frontend calling new read-only diagnostic endpoints on the server.

**Priority:** High

<!-- Add items here -->

---

## 3. Player & Roster Management

*Enhancements to how players are added, tracked, and managed across seasons.*

### ~~CSV Import — Teams and Players~~ ✅ Promoted to active backlog — see USER-STORIES.md Milestone 9
**Request:** Admins and Board members can download a pre-formatted CSV template for teams and a separate one for players, fill them out offline, then upload the populated file to bulk-import that data into the app. A preview step shows exactly what will be created/updated/skipped before any data is written. Row-level validation errors are surfaced clearly so the user can fix their file and re-upload.
**Why / Problem solved:** The SportsEngine import is convenient for SE users but many organizations don't use SE, or need to set up a season before SE data is available. CSV gives every org a universal fallback for bulk data entry that works offline and requires no third-party integration.
**Affected roles:** Admin, Board (import trigger). All roles benefit from the imported data.
**Notes / open questions:**
- Teams template: `name`, `division` columns.
- Players template: `first_name`, `last_name`, `team_name`, `grade`, `date_of_birth` (YYYY-MM-DD), `parent_name`, `parent_email`, `notes`.
- `team_name` in the players CSV matches against existing teams by case-insensitive name; warn if no match found (player still imports, just unassigned).
- Players require a target season — use the currently active season, or let the user pick if multiple are active.
- Client reads the file with FileReader and sends CSV text as JSON — no multipart/file server complexity needed.
- Preview shows created/updated/skipped/error counts per row before commit.
**Priority:** High

<!-- Add items here -->

---

## 4. Reporting & Analytics

*Dashboards, exports, and data views beyond the current pipeline tiles.*

<!-- Add items here -->

---

## 5. Settings & Branding

*Org-level configuration that personalizes the app for the organization.*

### ~~Organization Name & Logo~~ ✅ Promoted to active backlog — see USER-STORIES.md Milestone 8
**Request:** Admins can upload/update the organization's display name and logo from a Settings → Organization screen. The uploaded logo replaces the current hardcoded `HC-logo-icon.png` in the sidebar and wherever the org mark appears (email templates, acceptance landing pages). The org name replaces the hardcoded "Jr Chargers" wordmark.  
**Why / Problem solved:** The app is currently hardcoded to Hamilton Jr Chargers branding. Making these configurable lets the app be reused by other organizations without a code change, and lets the current org update their branding without a developer.  
**Affected roles:** Admin only (upload/update). All roles see the result in the sidebar and emails.  
**Notes / open questions:**
- Logo upload: file size limit, accepted formats (PNG, SVG, JPG), storage location (local disk, S3, or DB blob).
- Should the org name also propagate into email template default subjects, or only the UI chrome?
- Consider a "preview before save" step so admins can confirm how the logo renders in the sidebar before committing.
- Acceptance/decline landing pages are server-rendered HTML — they'll need to read org config from DB rather than using hardcoded strings.
- What happens if no logo is uploaded? Fall back to initials or a default mark.  
**Priority:** Medium

### Primary & Secondary Color Customization
**Request:** Admins can set a primary hex color and an optional secondary hex color in Settings → Organization. The primary color replaces the current hardcoded red (#AD0303) throughout the app — buttons, active nav items, focus rings, badges, links. The secondary color is used for accents and highlights where a contrasting tone is appropriate.
**Why / Problem solved:** The app is hardcoded to Jr Chargers red. Making colors configurable lets the app be reused by other organizations without a code change, and lets the org update their palette if branding changes.
**Affected roles:** Admin only (configure). All roles see the result.
**Notes / open questions:**
- Colors stored as hex strings in the existing config table (keys: `brand_primary`, `brand_secondary`).
- Apply at runtime via CSS custom properties injected into :root on app load, so Tailwind's `brand` color resolves dynamically.
- Validate hex format (#RRGGBB or #RGB) on both client and server.
- Show a live preview swatch next to each input before saving.
- Default to current hardcoded values if no config is set.
**Priority:** High

<!-- Add items here -->

---

## 7. User & Account Management

*Improvements to how staff accounts, roles, and permissions are managed.*

<!-- Add items here -->

---

## 8. Season & Team Operations

*Workflow improvements around managing seasons, tryouts, and teams.*

<!-- Add items here -->

---

## 9. Notifications & Automation

*Automated reminders, scheduled actions, and system-generated communications.*

<!-- Add items here -->

---

## 10. Mobile & Accessibility

*Improvements to the mobile experience and accessibility compliance.*

<!-- Add items here -->

---

## 11. Infrastructure & DevOps

*Hosting, monitoring, backup, CI/CD, and operational improvements.*

<!-- Add items here -->

---

## 12. Miscellaneous / Uncategorized

*Ideas that don't fit a category yet — move them once a pattern emerges.*

<!-- Add items here -->

---

## Promoted to Active Backlog

*Items moved from this document into the main USER-STORIES.md or a sprint.*

| Item | Promoted | Notes |
|---|---|---|
| SE API Explorer (Admin Diagnostic Tool) | 2026-06-01 | Moved to PRD §5.7, USER-STORIES SE-14–SE-20, Milestone 7 (M7-01–M7-04) |
| Team Import from SportsEngine Season Management | 2026-06-02 | Moved to USER-STORIES.md Milestone 8 |
| Organization Name & Logo | 2026-06-02 | Moved to USER-STORIES.md Milestone 8 |
| Primary & Secondary Color Customization | 2026-06-02 | Moved to USER-STORIES.md Milestone 8 |
| CSV Import — Teams and Players | 2026-06-02 | Moved to USER-STORIES.md Milestone 9 |

---

*Last updated: 2026-06-02*
