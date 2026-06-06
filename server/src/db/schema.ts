import {
  pgTable, uuid, text, boolean, integer, smallint,
  timestamp, date, unique, index, jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:               uuid('id').primaryKey().defaultRandom(),
  fullName:         text('full_name').notNull(),
  email:            text('email').notNull().unique(),
  role:             text('role').notNull()
                      .$type<'admin' | 'board' | 'head_coach' | 'assistant_coach'>(),
  passwordHash:     text('password_hash'),
  emailVerified:    boolean('email_verified').notNull().default(false),
  isActive:         boolean('is_active').notNull().default(true),
  inviteToken:      text('invite_token'),
  inviteTokenExp:   timestamp('invite_token_exp', { withTimezone: true }),
  resetToken:       text('reset_token'),
  resetTokenExp:    timestamp('reset_token_exp', { withTimezone: true }),
  tokenVersion:     integer('token_version').notNull().default(0),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt:      timestamp('last_login_at', { withTimezone: true }),
}, (t) => ({
  emailIdx: index('users_email_idx').on(t.email),
}));

// ─── Teams ────────────────────────────────────────────────────────────────────

export const teams = pgTable('teams', {
  id:        uuid('id').primaryKey().defaultRandom(),
  seasonId:  uuid('season_id'),   // nullable — set for SE-imported teams, null for manually created
  seId:      text('se_id'),       // SportsEngine team UUID, set on import, null for manual teams
  divisionId: uuid('division_id'), // FK to divisions, nullable — set null if division deleted
  name:      text('name').notNull(),
  division:  text('division'),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── User–Team Assignments ────────────────────────────────────────────────────

export const userTeamAssignments = pgTable('user_team_assignments', {
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teamId:     uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  roleAtTeam: text('role_at_team').notNull()
                .$type<'head_coach' | 'assistant_coach'>(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: unique().on(t.userId, t.teamId),
}));

// ─── Seasons ──────────────────────────────────────────────────────────────────

export const seasons = pgTable('seasons', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  label:              text('label').notNull().unique(),
  seTryoutFormNames:  text('se_tryout_form_names').array().notNull().default([]),
  seRegistrationUrl:  text('se_registration_url'),
  seRegistrationId:   text('se_registration_id'),   // SE registration form ID for player import
  registrationUrl:    text('registration_url'),           // post-acceptance registration link
  offerExpiresDays:   integer('offer_expires_days').notNull().default(14),
  tryoutStart:        date('tryout_start'),
  tryoutEnd:          date('tryout_end'),
  seasonStartDate:    date('season_start_date'),
  isActive:           boolean('is_active').notNull().default(false),
  isArchived:         boolean('is_archived').notNull().default(false),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Divisions ────────────────────────────────────────────────────────────────

export const divisions = pgTable('divisions', {
  id:                uuid('id').primaryKey().defaultRandom(),
  seasonId:          uuid('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
  name:              text('name').notNull(),
  // 'none' = no rules enforced, 'age' = age only, 'grade' = grade only, 'either' = grade OR age
  eligibilityMode:   text('eligibility_mode').notNull().default('none')
                       .$type<'none' | 'age' | 'grade' | 'either'>(),
  // 'max_only' = cannot exceed maxAge, but younger players are eligible (no min enforced)
  // 'range'    = must be within exact min–max range
  ageConstraint:     text('age_constraint').notNull().default('max_only')
                       .$type<'max_only' | 'range'>(),
  minAgeYears:       smallint('min_age_years'),      // age as of season start date, null = no min
  maxAgeYears:       smallint('max_age_years'),      // age as of season start date, null = no max
  // 'exact'      = player must be in one of the listed grades (cannot play up)
  // 'not_exceed' = player can be in any listed grade OR a lower grade (younger grades may play up)
  gradeConstraint:   text('grade_constraint').notNull().default('exact')
                       .$type<'exact' | 'not_exceed'>(),
  allowedGrades:     text('allowed_grades').array(), // null = any grade allowed
  isActive:          boolean('is_active').notNull().default(true),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  seasonIdx: index('divisions_season_idx').on(t.seasonId),
}));

// ─── Players ──────────────────────────────────────────────────────────────────

export const players = pgTable('players', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  seasonId:             uuid('season_id').notNull().references(() => seasons.id),
  teamId:               uuid('team_id').references(() => teams.id),
  profileId:            text('profile_id'),   // external platform profile ID (SE or future platforms)
  firstName:            text('first_name').notNull(),
  lastName:             text('last_name').notNull(),
  dateOfBirth:          date('date_of_birth'),
  ageOverride:          smallint('age_override'),
  grade:                text('grade'),
  parentName:           text('parent_name'),
  parentEmail:          text('parent_email').notNull(),
  status:               text('status').notNull().default('draft')
                          .$type<'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'waitlisted' | 'rejected'>(),
  offerType:            text('offer_type')
                          .$type<'early' | 'post_tryout'>(),
  isReturning:          boolean('is_returning').notNull().default(false),
  returningFlaggedBy:   uuid('returning_flagged_by').references(() => users.id, { onDelete: 'set null' }),
  returningFlaggedAt:   timestamp('returning_flagged_at', { withTimezone: true }),
  returningSource:      text('returning_source')
                          .$type<'se_match' | 'manual'>(),
  earlyOfferEligible:   boolean('early_offer_eligible').notNull().default(false),
  earlyOfferSetBy:      uuid('early_offer_set_by').references(() => users.id, { onDelete: 'set null' }),
  earlyOfferSetAt:      timestamp('early_offer_set_at', { withTimezone: true }),
  notes:                text('notes'),
  importedFromSe:       boolean('imported_from_se').notNull().default(false),
  createdBy:            uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  seasonIdx:    index('players_season_idx').on(t.seasonId),
  teamIdx:      index('players_team_idx').on(t.teamId),
  profileIdIdx: index('players_profile_id_idx').on(t.profileId),
  dobNameIdx:   index('players_dob_name_idx').on(t.firstName, t.lastName, t.dateOfBirth),
}));

// ─── Offers ───────────────────────────────────────────────────────────────────

export const offers = pgTable('offers', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  playerId:           uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  seasonId:           uuid('season_id').notNull().references(() => seasons.id),
  sentBy:             uuid('sent_by').references(() => users.id, { onDelete: 'set null' }),
  offerType:          text('offer_type').notNull()
                        .$type<'early' | 'post_tryout' | 'rejection'>(),
  sentMethod:         text('sent_method')
                        .$type<'sendgrid' | 'manual_copy'>(),
  acceptToken:        text('accept_token').unique(),
  declineToken:       text('decline_token').unique(),
  sendgridMessageId:  text('sendgrid_message_id').unique(),
  sentAt:             timestamp('sent_at', { withTimezone: true }),
  openedAt:           timestamp('opened_at', { withTimezone: true }),
  landingViewedAt:    timestamp('landing_viewed_at', { withTimezone: true }),
  acceptedAt:         timestamp('accepted_at', { withTimezone: true }),
  declinedAt:         timestamp('declined_at', { withTimezone: true }),
  seRedirectedAt:     timestamp('se_redirected_at', { withTimezone: true }),
  expiresAt:          timestamp('expires_at', { withTimezone: true }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  playerIdx:        index('offers_player_idx').on(t.playerId),
  acceptTokenIdx:   index('offers_accept_token_idx').on(t.acceptToken),
  declineTokenIdx:  index('offers_decline_token_idx').on(t.declineToken),
  sgMsgIdx:         index('offers_sendgrid_msg_idx').on(t.sendgridMessageId),
}));

// ─── Activity Log ─────────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'player_added' | 'player_edited' | 'player_removed'
  | 'returning_flag_set' | 'returning_flag_cleared'
  | 'early_offer_eligible_set' | 'early_offer_eligible_cleared'
  | 'offer_sent' | 'offer_resent' | 'rejection_sent'
  | 'email_opened' | 'landing_page_viewed'
  | 'offer_accepted' | 'offer_declined' | 'offer_expired'
  | 'se_redirected' | 'confirmation_email_sent'
  | 'status_changed' | 'note_added' | 'note_edited';

export const activityLog = pgTable('activity_log', {
  id:         uuid('id').primaryKey().defaultRandom(),
  playerId:   uuid('player_id').references(() => players.id, { onDelete: 'set null' }),
  offerId:    uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
  userId:     uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actorLabel: text('actor_label'),
  eventType:  text('event_type').notNull().$type<ActivityEventType>(),
  detail:     jsonb('detail'),
  ts:         timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  playerTsIdx: index('activity_log_player_idx').on(t.playerId, t.ts),
  tsIdx:       index('activity_log_ts_idx').on(t.ts),
}));

// ─── SE Sync Log ──────────────────────────────────────────────────────────────

export const seSyncLog = pgTable('se_sync_log', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  seasonId:            uuid('season_id').notNull().references(() => seasons.id),
  triggeredByUserId:   uuid('triggered_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  triggeredAt:         timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  formNamesQueried:    text('form_names_queried').array(),
  recordsFetched:      integer('records_fetched'),
  recordsNew:          integer('records_new'),
  recordsUpdated:      integer('records_updated'),
  recordsSkipped:      integer('records_skipped'),
  errorMessage:        text('error_message'),
  completedAt:         timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  seasonIdx: index('se_sync_log_season_idx').on(t.seasonId, t.triggeredAt),
}));

// ─── Email Templates ──────────────────────────────────────────────────────────

export const emailTemplates = pgTable('email_templates', {
  id:          uuid('id').primaryKey().defaultRandom(),
  seasonId:    uuid('season_id').notNull().references(() => seasons.id),
  templateKey: text('template_key').notNull()
                 .$type<'early_offer' | 'offer_letter' | 'rejection_letter'>(),
  subject:     text('subject').notNull(),
  bodyHtml:    text('body_html').notNull(),
  updatedBy:   uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  seasonKeyUnique: unique().on(t.seasonId, t.templateKey),
}));

// ─── Config ───────────────────────────────────────────────────────────────────

export const config = pgTable('config', {
  key:       text('key').primaryKey(),
  value:     text('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Integrations ─────────────────────────────────────────────────────────────

export const integrations = pgTable('integrations', {
  key:            text('key').primaryKey(),
  encryptedValue: text('encrypted_value').notNull(),
  iv:             text('iv').notNull(),
  authTag:        text('auth_tag').notNull(),
  updatedBy:      uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Wizard Progress ──────────────────────────────────────────────────────────

export const wizardProgress = pgTable('wizard_progress', {
  id:        uuid('id').primaryKey().defaultRandom(),
  seasonId:  uuid('season_id').references(() => seasons.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  step:      smallint('step').notNull().default(1),
  draftData: jsonb('draft_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  teamAssignments: many(userTeamAssignments),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  userAssignments: many(userTeamAssignments),
  players:         many(players),
  division:        one(divisions, { fields: [teams.divisionId], references: [divisions.id] }),
}));

export const userTeamAssignmentsRelations = relations(userTeamAssignments, ({ one }) => ({
  user: one(users, { fields: [userTeamAssignments.userId], references: [users.id] }),
  team: one(teams, { fields: [userTeamAssignments.teamId], references: [teams.id] }),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
  players:        many(players),
  emailTemplates: many(emailTemplates),
  seSyncLogs:     many(seSyncLog),
  divisions:      many(divisions),
}));

export const divisionsRelations = relations(divisions, ({ one }) => ({
  season: one(seasons, { fields: [divisions.seasonId], references: [seasons.id] }),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  season:  one(seasons, { fields: [players.seasonId], references: [seasons.id] }),
  team:    one(teams, { fields: [players.teamId], references: [teams.id] }),
  offers:  many(offers),
  activity: many(activityLog),
}));

export const offersRelations = relations(offers, ({ one, many }) => ({
  player:   one(players, { fields: [offers.playerId], references: [players.id] }),
  season:   one(seasons, { fields: [offers.seasonId], references: [seasons.id] }),
  activity: many(activityLog),
}));
