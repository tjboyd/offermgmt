/* ============================================================
   core.jsx — Data layer + Shared UI primitives + Hooks
   Exposes globals: useApp, AppProvider, Badge, Button, Modal,
   Avatar, Toast, useToast, fmtDate, fmtDateTime, STATUS_LABELS,
   renderEmail, ICONS
   ============================================================ */

const STORAGE_KEY = 'jrc_offers_state_v2';

const STATUS_LABELS = {
  draft:      { label: 'Draft',      cls: 'badge-draft' },
  sent:       { label: 'Sent',       cls: 'badge-sent' },
  accepted:   { label: 'Accepted',   cls: 'badge-accepted' },
  declined:   { label: 'Declined',   cls: 'badge-declined' },
  expired:    { label: 'Expired',    cls: 'badge-expired' },
  waitlisted: { label: 'Waitlisted', cls: 'badge-waitlisted' },
  rejected:   { label: 'Not Selected', cls: 'badge-rejected' },
};

// ---------- Seed Data ----------
const SEED_TEAMS = [
  { id: 't_12u_aaa', name: '12U AAA Rep' },
  { id: 't_12u_aa',  name: '12U AA Rep' },
  { id: 't_11u_aaa', name: '11U AAA Rep' },
  { id: 't_11u_aa',  name: '11U AA Rep' },
  { id: 't_10u_aaa', name: '10U AAA Rep' },
];

// ---------- Seed Users ----------
// Admins see all teams; coaches only see their assigned team(s).
const SEED_USERS = [
  { id: 'u_admin',  name: 'Cara Kowalski', initials: 'CK', role: 'admin', title: 'Board · Player Development', teamIds: [] },
  { id: 'u_coach1', name: 'Mike Reilly',   initials: 'MR', role: 'coach', title: '12U AAA Head Coach',          teamIds: ['t_12u_aaa'] },
  { id: 'u_coach2', name: 'Sarah Bell',    initials: 'SB', role: 'coach', title: '11U AAA Head Coach',          teamIds: ['t_11u_aaa'] },
  { id: 'u_coach3', name: 'James Doyle',   initials: 'JD', role: 'coach', title: '12U AA / 11U AA Head Coach',  teamIds: ['t_12u_aa', 't_11u_aa'] },
];

const ROLE_LABEL = { admin: 'Admin', coach: 'Coach' };

const SEED_TEMPLATES = {
  offer: {
    subject: 'Roster Offer — Hamilton Jr Chargers {{team}} ({{season}})',
    body:
`Dear {{parentName}},

Congratulations! On behalf of the Hamilton Jr Chargers coaching staff, we are pleased to offer {{playerFirstName}} a roster spot on our {{team}} team for the {{season}} season.

This offer is based on {{playerFirstName}}'s performance at tryouts, attitude, work ethic, and projected fit with our program. We're excited about what {{playerFirstName}} can bring to the team this year.

To accept your spot, please complete season registration on SportsEngine using the button in this email. Registration must be completed by {{deadline}} to secure {{playerFirstName}}'s place on the roster.

If you have any questions, please reach out to your team coach directly.

Play hard. Win together.
— Jr Chargers Coaching Staff`,
  },
  rejection: {
    subject: 'Tryout Results — Hamilton Jr Chargers {{season}}',
    body:
`Dear {{parentName}},

Thank you for {{playerFirstName}}'s participation in tryouts for the Hamilton Jr Chargers {{season}} season. We appreciate the time and effort {{playerFirstName}} put into the process.

After careful consideration, we are unable to offer {{playerFirstName}} a spot on our {{team}} roster this year. Selection was extremely competitive, and this decision is not a reflection of {{playerFirstName}}'s talent or potential as a player.

We encourage {{playerFirstName}} to continue playing baseball — in house league or another competitive program — and to try out again in future seasons. Many of our current players have followed exactly that path.

Thank you again for choosing the Jr Chargers.

— Jr Chargers Coaching Staff`,
  },
};

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }
function daysFromNow(n) { return new Date(Date.now() + n * 86400000).toISOString(); }

const SEED_PLAYERS = [
  {
    id: 'p_001', firstName: 'Ethan', lastName: 'Boudreau', age: 11, grade: '6',
    parentName: 'Marc Boudreau', parentEmail: 'mboudreau@example.com',
    teamId: 't_12u_aaa', status: 'accepted', notes: 'Strong arm. Plays SS/3B.',
    createdAt: daysAgo(14),
    offer: {
      sentAt: daysAgo(8), openedAt: daysAgo(8), clickedAt: daysAgo(7),
      acceptedAt: daysAgo(6), expiresAt: daysFromNow(-1),
    },
  },
  {
    id: 'p_002', firstName: 'Maya', lastName: 'Tran', age: 11, grade: '6',
    parentName: 'Linh Tran', parentEmail: 'l.tran@example.com',
    teamId: 't_12u_aaa', status: 'sent', notes: 'Power hitter, catcher.',
    createdAt: daysAgo(10),
    offer: {
      sentAt: daysAgo(3), openedAt: daysAgo(3), clickedAt: daysAgo(2),
      expiresAt: daysFromNow(4),
    },
  },
  {
    id: 'p_003', firstName: 'Jaxon', lastName: 'Reilly', age: 12, grade: '7',
    parentName: 'Kate Reilly', parentEmail: 'kreilly@example.com',
    teamId: 't_12u_aaa', status: 'sent', notes: 'Pitcher. Improving control.',
    createdAt: daysAgo(10),
    offer: {
      sentAt: daysAgo(3), openedAt: daysAgo(2),
      expiresAt: daysFromNow(4),
    },
  },
  {
    id: 'p_004', firstName: 'Sofia', lastName: 'Marchetti', age: 11, grade: '6',
    parentName: 'Tony Marchetti', parentEmail: 'tony.m@example.com',
    teamId: 't_12u_aaa', status: 'sent', notes: 'Speed. Outfield, 2B.',
    createdAt: daysAgo(10),
    offer: { sentAt: daysAgo(3), expiresAt: daysFromNow(4) },
  },
  {
    id: 'p_005', firstName: 'Owen', lastName: 'Patel', age: 10, grade: '5',
    parentName: 'Anjali Patel', parentEmail: 'apatel@example.com',
    teamId: 't_11u_aaa', status: 'accepted', notes: 'Smart base runner.',
    createdAt: daysAgo(13),
    offer: {
      sentAt: daysAgo(6), openedAt: daysAgo(6), clickedAt: daysAgo(5),
      acceptedAt: daysAgo(4), expiresAt: daysFromNow(1),
    },
  },
  {
    id: 'p_006', firstName: 'Mason', lastName: 'O\'Brien', age: 10, grade: '5',
    parentName: 'Sean O\'Brien', parentEmail: 'sob@example.com',
    teamId: 't_11u_aaa', status: 'declined', notes: 'Conflict w/ travel team.',
    createdAt: daysAgo(13),
    offer: {
      sentAt: daysAgo(6), openedAt: daysAgo(5),
      declinedAt: daysAgo(4), expiresAt: daysFromNow(1),
    },
  },
  {
    id: 'p_007', firstName: 'Ava', lastName: 'Nguyen', age: 10, grade: '5',
    parentName: 'Trang Nguyen', parentEmail: 'tnguyen@example.com',
    teamId: 't_11u_aaa', status: 'waitlisted', notes: 'Borderline. Strong potential.',
    createdAt: daysAgo(11),
  },
  {
    id: 'p_008', firstName: 'Liam', lastName: 'Carter', age: 12, grade: '7',
    parentName: 'Rachel Carter', parentEmail: 'rcarter@example.com',
    teamId: 't_12u_aa', status: 'sent', notes: 'Reliable defense.',
    createdAt: daysAgo(9),
    offer: {
      sentAt: daysAgo(2), openedAt: daysAgo(2),
      expiresAt: daysFromNow(5),
    },
  },
  {
    id: 'p_009', firstName: 'Noah', lastName: 'Singh', age: 11, grade: '6',
    parentName: 'Priya Singh', parentEmail: 'psingh@example.com',
    teamId: 't_12u_aa', status: 'draft', notes: 'Tryout standout, late add.',
    createdAt: daysAgo(2),
  },
  {
    id: 'p_010', firstName: 'Charlotte', lastName: 'Wei', age: 9, grade: '4',
    parentName: 'David Wei', parentEmail: 'dwei@example.com',
    teamId: 't_10u_aaa', status: 'expired', notes: 'No response after 2 reminders.',
    createdAt: daysAgo(20),
    offer: {
      sentAt: daysAgo(14), openedAt: daysAgo(13),
      expiresAt: daysAgo(7),
    },
  },
  {
    id: 'p_011', firstName: 'Zoe', lastName: 'Kowalski', age: 12, grade: '7',
    parentName: 'Eva Kowalski', parentEmail: 'eva.k@example.com',
    teamId: 't_12u_aaa', status: 'rejected', notes: 'Not a fit this year.',
    createdAt: daysAgo(12),
  },
];

function buildSeedActivity(players) {
  const activity = [];
  let counter = 0;
  for (const p of players) {
    if (!p.offer) continue;
    const push = (ts, type, detail) => {
      if (!ts) return;
      activity.push({ id: `a_${++counter}`, ts, playerId: p.id, type, detail });
    };
    push(p.offer.sentAt,     'sent',     `Offer sent to ${p.firstName} ${p.lastName}`);
    push(p.offer.openedAt,   'opened',   `${p.parentName} opened the offer email`);
    push(p.offer.clickedAt,  'clicked',  `${p.parentName} clicked the registration link`);
    push(p.offer.acceptedAt, 'accepted', `${p.firstName} ${p.lastName} completed SportsEngine registration`);
    push(p.offer.declinedAt, 'declined', `${p.parentName} declined the offer`);
  }
  return activity.sort((a, b) => b.ts.localeCompare(a.ts));
}

const SEED_STATE = {
  config: {
    season: '2026',
    sportsEngineUrl: 'https://hamiltonjrchargers.sportsngin.com/register/form/season-2026',
    offerExpiresInDays: 7,
    orgName: 'Hamilton Jr Chargers',
  },
  users: SEED_USERS,
  currentUserId: 'u_admin',
  teams: SEED_TEAMS,
  templates: SEED_TEMPLATES,
  players: SEED_PLAYERS,
  activity: buildSeedActivity(SEED_PLAYERS),
};

// ---------- Persistence ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_STATE;
    const parsed = JSON.parse(raw);
    // shallow safety: ensure required keys exist
    return { ...SEED_STATE, ...parsed };
  } catch (e) {
    console.warn('Could not load state, using seed', e);
    return SEED_STATE;
  }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch (e) { console.warn('Could not save state', e); }
}
function resetState() { localStorage.removeItem(STORAGE_KEY); }

// ---------- Context ----------
const AppCtx = React.createContext(null);

function AppProvider({ children }) {
  const [state, setState] = React.useState(loadState);
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => { saveState(state); }, [state]);

  const update = React.useCallback((fn) => setState((s) => fn(s)), []);

  const toast = React.useCallback((msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  // ---------- Domain actions ----------
  const addPlayer = (p) => {
    const id = 'p_' + Math.random().toString(36).slice(2, 8);
    update((s) => ({
      ...s,
      players: [{ id, status: 'draft', createdAt: new Date().toISOString(), ...p }, ...s.players],
    }));
    return id;
  };

  const updatePlayer = (id, patch) => update((s) => ({
    ...s,
    players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));

  const deletePlayer = (id) => update((s) => ({
    ...s,
    players: s.players.filter((p) => p.id !== id),
    activity: s.activity.filter((a) => a.playerId !== id),
  }));

  const logActivity = (s, playerId, type, detail) => {
    const a = { id: 'a_' + Math.random().toString(36).slice(2, 8), ts: new Date().toISOString(), playerId, type, detail };
    return { ...s, activity: [a, ...s.activity] };
  };

  const sendOffer = (playerIds) => {
    update((s) => {
      const ids = Array.isArray(playerIds) ? playerIds : [playerIds];
      const now = new Date();
      const exp = new Date(now.getTime() + s.config.offerExpiresInDays * 86400000).toISOString();
      let next = {
        ...s,
        players: s.players.map((p) =>
          ids.includes(p.id)
            ? { ...p, status: 'sent', offer: { sentAt: now.toISOString(), expiresAt: exp } }
            : p
        ),
      };
      for (const id of ids) {
        const p = s.players.find((x) => x.id === id);
        if (p) next = logActivity(next, id, 'sent', `Offer sent to ${p.firstName} ${p.lastName}`);
      }
      return next;
    });
    toast(`Offer${(Array.isArray(playerIds) ? playerIds.length : 1) > 1 ? 's' : ''} sent`);
  };

  const sendRejection = (playerIds) => {
    update((s) => {
      const ids = Array.isArray(playerIds) ? playerIds : [playerIds];
      let next = {
        ...s,
        players: s.players.map((p) => (ids.includes(p.id) ? { ...p, status: 'rejected' } : p)),
      };
      for (const id of ids) {
        const p = s.players.find((x) => x.id === id);
        if (p) next = logActivity(next, id, 'rejected', `Rejection email sent to ${p.firstName} ${p.lastName}`);
      }
      return next;
    });
    toast(`Rejection notice${(Array.isArray(playerIds) ? playerIds.length : 1) > 1 ? 's' : ''} sent`);
  };

  const setStatus = (id, status) => {
    updatePlayer(id, { status });
    update((s) => logActivity(s, id, 'status', `Status changed to ${STATUS_LABELS[status]?.label || status}`));
  };

  const updateConfig = (patch) => update((s) => ({ ...s, config: { ...s.config, ...patch } }));
  const updateTemplate = (key, patch) => update((s) => ({
    ...s, templates: { ...s.templates, [key]: { ...s.templates[key], ...patch } },
  }));
  const addTeam = (name) => update((s) => ({
    ...s, teams: [...s.teams, { id: 't_' + Math.random().toString(36).slice(2, 6), name }],
  }));
  const removeTeam = (id) => update((s) => ({ ...s, teams: s.teams.filter((t) => t.id !== id) }));

  const setCurrentUser = (id) => update((s) => ({ ...s, currentUserId: id }));

  const resetData = () => { resetState(); setState(SEED_STATE); toast('Data reset to seed values'); };

  // ---------- Selectors ----------
  const teamById = (id) => state.teams.find((t) => t.id === id);
  const playerById = (id) => state.players.find((p) => p.id === id);
  const activityForPlayer = (id) => state.activity.filter((a) => a.playerId === id);

  // ---------- Role / permission helpers ----------
  const currentUser = state.users?.find((u) => u.id === state.currentUserId) || state.users?.[0];
  const isAdmin = currentUser?.role === 'admin';
  const visibleTeamIds = isAdmin
    ? state.teams.map((t) => t.id)
    : (currentUser?.teamIds || []);
  const canSeePlayer = (p) => isAdmin || visibleTeamIds.includes(p.teamId);
  const visiblePlayers = state.players.filter(canSeePlayer);
  const visibleTeams = state.teams.filter((t) => isAdmin || visibleTeamIds.includes(t.id));
  const visibleActivity = state.activity.filter((a) => {
    if (isAdmin) return true;
    const p = state.players.find((x) => x.id === a.playerId);
    return p && visibleTeamIds.includes(p.teamId);
  });

  const counts = React.useMemo(() => {
    const c = { total: visiblePlayers.length, draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0, waitlisted: 0, rejected: 0 };
    visiblePlayers.forEach((p) => { c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  }, [visiblePlayers]);

  const value = {
    state, update, toast,
    addPlayer, updatePlayer, deletePlayer,
    sendOffer, sendRejection, setStatus,
    updateConfig, updateTemplate, addTeam, removeTeam,
    setCurrentUser, resetData,
    teamById, playerById, activityForPlayer, counts,
    currentUser, isAdmin, visibleTeamIds, canSeePlayer,
    visiblePlayers, visibleTeams, visibleActivity,
    toasts,
  };

  return React.createElement(AppCtx.Provider, { value }, children);
}

function useApp() {
  const v = React.useContext(AppCtx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

// ---------- Formatters ----------
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}
function initials(p) {
  return ((p.firstName?.[0] || '') + (p.lastName?.[0] || '')).toUpperCase();
}

// ---------- Email rendering ----------
function mergeFields(text, ctx) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? `{{${k}}}`);
}
function offerCtx(player, team, config, deadline) {
  return {
    playerFirstName: player.firstName,
    playerLastName: player.lastName,
    parentName: player.parentName || 'Parent / Guardian',
    parentEmail: player.parentEmail,
    team: team?.name || 'Jr Chargers',
    season: config.season,
    deadline: deadline ? new Date(deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'the listed deadline',
    sportsEngineUrl: config.sportsEngineUrl,
    orgName: config.orgName,
  };
}

// ---------- Shared UI components ----------
function Badge({ status, children }) {
  const meta = STATUS_LABELS[status] || { label: status, cls: 'badge-draft' };
  return React.createElement('span', { className: `badge ${meta.cls}` },
    React.createElement('span', { className: 'dot' }),
    children || meta.label
  );
}

function Button({ variant = 'outline', size = 'md', children, ...rest }) {
  const cls = `btn btn-${variant} btn-${size}`;
  return React.createElement('button', { className: cls, ...rest }, children);
}

function Avatar({ player, size = 'md' }) {
  const sz = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : '';
  return React.createElement('span', { className: `avatar ${sz}` }, initials(player));
}

function Modal({ open, onClose, title, children, footer, width = 640 }) {
  if (!open) return null;
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return React.createElement('div', { className: 'modal-overlay', onClick: (e) => e.target === e.currentTarget && onClose?.() },
    React.createElement('div', { className: 'modal', style: { maxWidth: width } },
      React.createElement('div', { className: 'modal-head' },
        React.createElement('div', { className: 'modal-title' }, title),
        React.createElement('button', { className: 'icon-btn', onClick: onClose, 'aria-label': 'Close' },
          React.createElement(Icon, { name: 'x' })
        )
      ),
      React.createElement('div', { className: 'modal-body scroll' }, children),
      footer && React.createElement('div', { className: 'modal-foot' }, footer)
    )
  );
}

function ToastStack() {
  const { toasts } = useApp();
  return React.createElement('div', { className: 'toast-stack' },
    toasts.map((t) => React.createElement('div', { key: t.id, className: 'toast' }, t.msg))
  );
}

// ---------- Icons (inline SVG, stroke-based) ----------
const ICONS = {
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z',
  mail: 'M4 4h16v16H4zM4 4l8 8 8-8',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM4.93 4.93l14.14 14.14',
  check: 'M20 6 9 17l-5-5',
  eye: 'M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  click: 'M9 9l5 12 1.8-5.2L21 14 9 9Z M3 12h2 M12 3v2 M5.6 5.6l1.4 1.4 M16.7 5.6l-1.4 1.4 M5.6 18.4l1.4-1.4',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  trash: 'M3 6h18 M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6 M10 11v6 M14 11v6 M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3Z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  home: 'M3 12 12 3l9 9 M5 10v10h14V10',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z',
  chev_right: 'm9 18 6-6-6-6',
  chev_down: 'm6 9 6 6 6-6',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  reply: 'M9 17 4 12l5-5 M20 18v-2a4 4 0 0 0-4-4H4',
};

function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 2 }) {
  const d = ICONS[name];
  if (!d) return null;
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' },
  }, React.createElement('path', { d }));
}

// ---------- Empty state component ----------
function Empty({ title, sub, action }) {
  return React.createElement('div', { className: 'empty' },
    React.createElement('div', { className: 'empty-title' }, title),
    sub && React.createElement('div', { className: 'empty-sub' }, sub),
    action
  );
}

// Export to global
Object.assign(window, {
  AppProvider, useApp, AppCtx,
  Badge, Button, Modal, Avatar, Icon, Empty, ToastStack,
  fmtDate, fmtDateTime, fmtRelative, initials,
  mergeFields, offerCtx,
  STATUS_LABELS, ROLE_LABEL, STORAGE_KEY,
});
