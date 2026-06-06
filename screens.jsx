/* ============================================================
   screens.jsx — All app screens
   Exposes: Dashboard, Roster, PlayerDetailModal, ComposerModal,
            AddPlayerModal, Settings, ActivityFeed, StatTiles
   ============================================================ */

// ---------- Stat Tiles ----------
function StatTiles({ compact }) {
  const { counts } = useApp();
  const tiles = [
    { label: 'Offers Out', value: counts.sent, sub: 'Awaiting response', accent: true },
    { label: 'Accepted',   value: counts.accepted, sub: 'Registered on SE' },
    { label: 'Declined',   value: counts.declined + counts.expired, sub: `${counts.declined} declined · ${counts.expired} expired` },
    { label: 'In Pipeline', value: counts.draft + counts.waitlisted, sub: `${counts.draft} draft · ${counts.waitlisted} waitlist` },
  ];
  return React.createElement('div', {
    style: { display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: compact ? 10 : 16 },
  },
    tiles.map((t, i) => React.createElement('div', { key: i, className: `stat-tile ${t.accent ? 'accent' : ''}` },
      React.createElement('div', { className: 'stat-label' }, t.label),
      React.createElement('div', { className: 'stat-value', style: compact ? { fontSize: 32 } : null }, t.value),
      React.createElement('div', { className: 'stat-sub' }, t.sub)
    ))
  );
}

// ---------- Activity Feed ----------
function ActivityFeed({ limit = 12, filterPlayerId }) {
  const { state, playerById, visibleActivity, activityForPlayer } = useApp();
  const items = (filterPlayerId
    ? activityForPlayer(filterPlayerId)
    : visibleActivity
  ).slice(0, limit);

  if (items.length === 0) {
    return React.createElement(Empty, { title: 'No activity yet', sub: 'Offer events will appear here.' });
  }

  return React.createElement('div', { className: 'timeline' },
    items.map((a) => {
      const p = playerById(a.playerId);
      const isHot = ['accepted', 'sent', 'clicked'].includes(a.type);
      return React.createElement('div', { key: a.id, className: 'timeline-item' },
        React.createElement('div', { className: `tl-dot ${!isHot ? 'muted' : ''}` }),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('div', { className: 'tl-text' }, a.detail),
          React.createElement('div', { className: 'tl-time' },
            fmtRelative(a.ts),
            p && !filterPlayerId ? ` · ${p.firstName} ${p.lastName}` : null
          )
        )
      );
    })
  );
}

// ---------- Dashboard ----------
function Dashboard({ onOpenPlayer, onCompose, onAddPlayer }) {
  const { state, counts, visiblePlayers, currentUser, isAdmin } = useApp();
  const recentPlayers = [...visiblePlayers]
    .sort((a, b) => (b.offer?.sentAt || b.createdAt).localeCompare(a.offer?.sentAt || a.createdAt))
    .slice(0, 5);

  return React.createElement('div', { className: 'scroll', style: { padding: 32, height: '100%', display: 'flex', flexDirection: 'column', gap: 28 } },
    // Header
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' } },
      React.createElement('div', null,
        React.createElement('div', { className: 'overline' },
          `${state.config.season} Season`,
          !isAdmin && currentUser && React.createElement('span', { style: { color: 'var(--gray-400)', marginLeft: 10, fontWeight: 600 } },
            `· Viewing ${currentUser.teamIds.length === 1 ? state.teams.find((t) => t.id === currentUser.teamIds[0])?.name : `${currentUser.teamIds.length} teams`}`
          )
        ),
        React.createElement('h1', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 42, textTransform: 'uppercase', lineHeight: 1, marginTop: 6, letterSpacing: '-0.01em' } },
          'Offer Pipeline'
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        React.createElement(Button, { variant: 'outline', size: 'md', onClick: onAddPlayer },
          React.createElement(Icon, { name: 'plus', size: 14 }), 'Add Player'
        ),
        React.createElement(Button, { variant: 'primary', size: 'md', onClick: () => onCompose('offer') },
          React.createElement(Icon, { name: 'send', size: 14 }), 'Send Offer'
        )
      )
    ),

    // Stats
    React.createElement(StatTiles),

    // Two-column: Activity + Recent players
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, flex: 1, minHeight: 0 } },
      // Activity
      React.createElement('div', { className: 'card', style: { padding: 22, display: 'flex', flexDirection: 'column', minHeight: 0 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
          React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.04em' } }, 'Activity Feed'),
          React.createElement('span', { style: { fontSize: 11, color: 'var(--gray-500)', letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'Last 30 days')
        ),
        React.createElement('div', { className: 'scroll', style: { flex: 1, minHeight: 0, paddingRight: 4 } },
          React.createElement(ActivityFeed, { limit: 20 })
        )
      ),
      // Status breakdown + recent players
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 } },
        React.createElement('div', { className: 'card', style: { padding: 22 } },
          React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 } }, 'Status Breakdown'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            ['sent', 'accepted', 'declined', 'expired', 'waitlisted', 'rejected', 'draft'].map((s) => {
              const c = counts[s] || 0;
              const pct = counts.total ? (c / counts.total) * 100 : 0;
              return React.createElement('div', { key: s, style: { display: 'flex', alignItems: 'center', gap: 10 } },
                React.createElement('div', { style: { width: 110 } }, React.createElement(Badge, { status: s })),
                React.createElement('div', { style: { flex: 1, height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' } },
                  React.createElement('div', {
                    style: {
                      width: `${pct}%`, height: '100%',
                      background: s === 'accepted' ? '#66C97A' : s === 'sent' ? '#E5A567' : s === 'declined' ? '#E07070' : 'var(--gray-500)',
                      transition: 'width 300ms ease',
                    }
                  })
                ),
                React.createElement('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 18, minWidth: 30, textAlign: 'right' } }, c)
              );
            })
          )
        ),
        React.createElement('div', { className: 'card', style: { padding: 22, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
          React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 } }, 'Recent Players'),
          React.createElement('div', { className: 'scroll', style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 } },
            recentPlayers.map((p) => React.createElement(PlayerRow, { key: p.id, player: p, onClick: () => onOpenPlayer(p.id) }))
          )
        )
      )
    )
  );
}

// ---------- Compact Player Row (used in dashboard + triage list) ----------
function PlayerRow({ player, onClick, selected }) {
  const { teamById } = useApp();
  const team = teamById(player.teamId);
  return React.createElement('button', {
    onClick,
    style: {
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px', borderRadius: 'var(--radius-sm)',
      background: selected ? 'rgba(173,3,3,0.12)' : 'transparent',
      border: '1px solid', borderColor: selected ? 'rgba(173,3,3,0.4)' : 'var(--color-border)',
      cursor: 'pointer', textAlign: 'left', width: '100%', color: '#fff',
      transition: 'all 150ms ease-out',
    },
    onMouseEnter: (e) => !selected && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)'),
    onMouseLeave: (e) => !selected && (e.currentTarget.style.background = 'transparent'),
  },
    React.createElement(Avatar, { player }),
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', { style: { fontWeight: 600, fontSize: 14 } },
        `${player.firstName} ${player.lastName}`
      ),
      React.createElement('div', { style: { fontSize: 11, color: 'var(--gray-400)', letterSpacing: '0.04em' } },
        `${team?.name || '—'} · Age ${player.age}`
      )
    ),
    React.createElement(Badge, { status: player.status })
  );
}

// ---------- Roster (table) ----------
function Roster({ onOpenPlayer, onCompose, onAddPlayer, fullHeight = true }) {
  const { state, teamById, sendOffer, sendRejection, visiblePlayers, visibleTeams, isAdmin, currentUser } = useApp();
  const [selected, setSelected] = React.useState(new Set());
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [teamFilter, setTeamFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');

  const filtered = visiblePlayers.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (teamFilter !== 'all' && p.teamId !== teamFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${p.firstName} ${p.lastName} ${p.parentName} ${p.parentEmail}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const toggleOne = (id) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };
  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  const selectedArr = [...selected];
  const canBulkOffer = selectedArr.length > 0 &&
    selectedArr.every((id) => ['draft', 'waitlisted', 'expired'].includes(visiblePlayers.find((p) => p.id === id)?.status));
  const canBulkReject = selectedArr.length > 0 &&
    selectedArr.every((id) => ['draft', 'waitlisted'].includes(visiblePlayers.find((p) => p.id === id)?.status));

  return React.createElement('div', { style: { padding: 32, height: fullHeight ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 } },
    // Header row
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' } },
      React.createElement('div', null,
        React.createElement('div', { className: 'overline' },
          `${visiblePlayers.length} Player${visiblePlayers.length === 1 ? '' : 's'} · ${state.config.season} Season`,
          !isAdmin && currentUser && React.createElement('span', { style: { color: 'var(--gray-400)', marginLeft: 10, fontWeight: 600 } },
            `· ${visibleTeams.map((t) => t.name).join(' + ')}`
          )
        ),
        React.createElement('h1', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 42, textTransform: 'uppercase', lineHeight: 1, marginTop: 6, letterSpacing: '-0.01em' } }, 'Roster')
      ),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        React.createElement(Button, { variant: 'outline', size: 'md', onClick: onAddPlayer },
          React.createElement(Icon, { name: 'plus', size: 14 }), 'Add Player'
        )
      )
    ),

    // Filters bar
    React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
      React.createElement('div', { style: { position: 'relative', flex: '1 1 240px', maxWidth: 360 } },
        React.createElement('span', { style: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-500)', pointerEvents: 'none' } },
          React.createElement(Icon, { name: 'search', size: 14 })
        ),
        React.createElement('input', {
          className: 'input', placeholder: 'Search player or parent…',
          value: search, onChange: (e) => setSearch(e.target.value),
          style: { paddingLeft: 34 },
        })
      ),
      React.createElement('select', { className: 'select', value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), style: { width: 'auto', minWidth: 130 } },
        React.createElement('option', { value: 'all' }, 'All statuses'),
        Object.entries(STATUS_LABELS).map(([k, v]) => React.createElement('option', { key: k, value: k }, v.label))
      ),
      React.createElement('select', { className: 'select', value: teamFilter, onChange: (e) => setTeamFilter(e.target.value), style: { width: 'auto', minWidth: 140 } },
        React.createElement('option', { value: 'all' }, isAdmin ? 'All teams' : `${visibleTeams.length > 1 ? 'My teams' : 'My team'}`),
        visibleTeams.map((t) => React.createElement('option', { key: t.id, value: t.id }, t.name))
      ),

      // Bulk action zone (right-aligned)
      React.createElement('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 } },
        selected.size > 0 && React.createElement(React.Fragment, null,
          React.createElement('span', { style: { fontSize: 12, color: 'var(--gray-300)', fontWeight: 600 } },
            `${selected.size} selected`
          ),
          React.createElement(Button, {
            variant: 'danger', size: 'sm',
            disabled: !canBulkReject,
            onClick: () => { sendRejection(selectedArr); setSelected(new Set()); },
          },
            React.createElement(Icon, { name: 'ban', size: 13 }), 'Send Rejection'
          ),
          React.createElement(Button, {
            variant: 'primary', size: 'sm',
            disabled: !canBulkOffer,
            onClick: () => { onCompose('offer', selectedArr); },
          },
            React.createElement(Icon, { name: 'send', size: 13 }), `Offer ${selected.size}`
          )
        )
      )
    ),

    // Table
    React.createElement('div', { className: 'card scroll', style: { flex: 1, minHeight: 0, overflow: 'auto' } },
      React.createElement('table', { className: 'tbl' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { style: { width: 36 } },
              React.createElement('input', { type: 'checkbox', className: 'checkbox', checked: allSelected, onChange: toggleAll })
            ),
            React.createElement('th', null, 'Player'),
            React.createElement('th', null, 'Team'),
            React.createElement('th', null, 'Parent / Guardian'),
            React.createElement('th', null, 'Status'),
            React.createElement('th', null, 'Last Activity'),
            React.createElement('th', { style: { width: 60 } })
          )
        ),
        React.createElement('tbody', null,
          filtered.length === 0
            ? React.createElement('tr', null,
                React.createElement('td', { colSpan: 7, style: { padding: 0 } },
                  React.createElement(Empty, { title: 'No players match', sub: 'Try changing the filters or search.' })
                )
              )
            : filtered.map((p) => {
                const team = teamById(p.teamId);
                const lastTs = p.offer?.acceptedAt || p.offer?.declinedAt || p.offer?.clickedAt || p.offer?.openedAt || p.offer?.sentAt || p.createdAt;
                return React.createElement('tr', {
                  key: p.id, className: selected.has(p.id) ? 'selected' : '',
                  onClick: () => onOpenPlayer(p.id),
                  style: { cursor: 'pointer' },
                },
                  React.createElement('td', { onClick: (e) => e.stopPropagation() },
                    React.createElement('input', {
                      type: 'checkbox', className: 'checkbox',
                      checked: selected.has(p.id),
                      onChange: () => toggleOne(p.id),
                    })
                  ),
                  React.createElement('td', null,
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                      React.createElement(Avatar, { player: p, size: 'sm' }),
                      React.createElement('div', null,
                        React.createElement('div', { style: { fontWeight: 600 } }, `${p.firstName} ${p.lastName}`),
                        React.createElement('div', { style: { fontSize: 11, color: 'var(--gray-500)' } }, `Age ${p.age} · Grade ${p.grade}`)
                      )
                    )
                  ),
                  React.createElement('td', null,
                    React.createElement('span', { style: { fontSize: 12, color: 'var(--gray-300)' } }, team?.name || '—')
                  ),
                  React.createElement('td', null,
                    React.createElement('div', null,
                      React.createElement('div', { style: { fontSize: 12 } }, p.parentName),
                      React.createElement('div', { style: { fontSize: 11, color: 'var(--gray-500)' } }, p.parentEmail)
                    )
                  ),
                  React.createElement('td', null, React.createElement(Badge, { status: p.status })),
                  React.createElement('td', null,
                    React.createElement('span', { style: { fontSize: 12, color: 'var(--gray-300)' } }, fmtRelative(lastTs))
                  ),
                  React.createElement('td', { style: { textAlign: 'right' } },
                    React.createElement('span', { style: { color: 'var(--gray-500)' } },
                      React.createElement(Icon, { name: 'chev_right', size: 14 })
                    )
                  )
                );
              })
        )
      )
    )
  );
}

// ---------- Add Player Modal ----------
function AddPlayerModal({ open, onClose }) {
  const { addPlayer, visibleTeams } = useApp();
  const [form, setForm] = React.useState({
    firstName: '', lastName: '', age: '', grade: '',
    parentName: '', parentEmail: '', teamId: visibleTeams[0]?.id || '', notes: '',
  });

  React.useEffect(() => {
    if (open) setForm({
      firstName: '', lastName: '', age: '', grade: '',
      parentName: '', parentEmail: '', teamId: visibleTeams[0]?.id || '', notes: '',
    });
  }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.firstName && form.lastName && form.parentEmail && form.teamId;

  const submit = () => {
    if (!valid) return;
    addPlayer({ ...form, age: parseInt(form.age) || 0 });
    onClose();
  };

  return React.createElement(Modal, {
    open, onClose, title: 'Add Player',
    width: 560,
    footer: React.createElement(React.Fragment, null,
      React.createElement('span', { style: { fontSize: 12, color: 'var(--gray-500)' } }, 'New players are added as Draft. Send an offer to notify the family.'),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        React.createElement(Button, { variant: 'ghost', onClick: onClose }, 'Cancel'),
        React.createElement(Button, { variant: 'primary', onClick: submit, disabled: !valid }, 'Add to Roster')
      )
    ),
  },
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
        Field('First Name', React.createElement('input', { className: 'input', value: form.firstName, onChange: (e) => set('firstName', e.target.value) })),
        Field('Last Name', React.createElement('input', { className: 'input', value: form.lastName, onChange: (e) => set('lastName', e.target.value) }))
      ),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
        Field('Age', React.createElement('input', { className: 'input', type: 'number', value: form.age, onChange: (e) => set('age', e.target.value) })),
        Field('Grade', React.createElement('input', { className: 'input', value: form.grade, onChange: (e) => set('grade', e.target.value), placeholder: 'e.g. 6' }))
      ),
      Field('Team', React.createElement('select', { className: 'select', value: form.teamId, onChange: (e) => set('teamId', e.target.value) },
        visibleTeams.map((t) => React.createElement('option', { key: t.id, value: t.id }, t.name))
      )),
      Field('Parent / Guardian Name', React.createElement('input', { className: 'input', value: form.parentName, onChange: (e) => set('parentName', e.target.value) })),
      Field('Parent / Guardian Email', React.createElement('input', { className: 'input', type: 'email', value: form.parentEmail, onChange: (e) => set('parentEmail', e.target.value), placeholder: 'parent@email.com' })),
      Field('Coach Notes (private)', React.createElement('textarea', { className: 'textarea', value: form.notes, onChange: (e) => set('notes', e.target.value), rows: 3 }))
    )
  );
}

function Field(label, control) {
  return React.createElement('div', null,
    React.createElement('label', { className: 'field-label' }, label),
    control
  );
}

// ---------- Composer Modal (Offer / Rejection) ----------
function ComposerModal({ open, onClose, mode = 'offer', initialPlayerIds = [] }) {
  const { state, sendOffer, sendRejection, teamById, visiblePlayers } = useApp();
  const [playerIds, setPlayerIds] = React.useState(initialPlayerIds);
  const [deadline, setDeadline] = React.useState(() =>
    new Date(Date.now() + (state.config.offerExpiresInDays * 86400000)).toISOString().slice(0, 10)
  );
  const [previewIdx, setPreviewIdx] = React.useState(0);

  React.useEffect(() => {
    if (open) {
      setPlayerIds(initialPlayerIds);
      setPreviewIdx(0);
      setDeadline(new Date(Date.now() + state.config.offerExpiresInDays * 86400000).toISOString().slice(0, 10));
    }
  }, [open, initialPlayerIds.join(',')]);

  // Players eligible to receive this kind of message (scoped to user's visible roster)
  const eligible = visiblePlayers.filter((p) =>
    mode === 'offer'
      ? ['draft', 'waitlisted', 'expired'].includes(p.status)
      : ['draft', 'waitlisted'].includes(p.status)
  );

  const selectedPlayers = playerIds.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const previewPlayer = selectedPlayers[previewIdx] || selectedPlayers[0];

  const togglePlayer = (id) => setPlayerIds((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const template = mode === 'offer' ? state.templates.offer : state.templates.rejection;
  const ctx = previewPlayer
    ? offerCtx(previewPlayer, teamById(previewPlayer.teamId), state.config, deadline)
    : { parentName: '[Parent Name]', playerFirstName: '[Player]', team: '[Team]', season: state.config.season, deadline: '[Deadline]' };

  const subject = mergeFields(template.subject, ctx);
  const bodyText = mergeFields(template.body, ctx);

  const send = () => {
    if (playerIds.length === 0) return;
    if (mode === 'offer') sendOffer(playerIds);
    else sendRejection(playerIds);
    onClose();
  };

  return React.createElement(Modal, {
    open, onClose,
    title: mode === 'offer' ? 'Send Offer Letters' : 'Send Rejection Letters',
    width: 1100,
    footer: React.createElement(React.Fragment, null,
      React.createElement('div', { style: { fontSize: 12, color: 'var(--gray-400)' } },
        playerIds.length === 0 ? 'Select at least one player' :
          `${playerIds.length} email${playerIds.length > 1 ? 's' : ''} ready · Sent from coach@hamiltonjrchargers.com`
      ),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        React.createElement(Button, { variant: 'ghost', onClick: onClose }, 'Cancel'),
        React.createElement(Button, {
          variant: mode === 'offer' ? 'primary' : 'danger',
          onClick: send, disabled: playerIds.length === 0,
        },
          React.createElement(Icon, { name: mode === 'offer' ? 'send' : 'ban', size: 14 }),
          mode === 'offer' ? `Send ${playerIds.length || ''} Offer${playerIds.length > 1 ? 's' : ''}` : `Send ${playerIds.length || ''} Rejection${playerIds.length > 1 ? 's' : ''}`
        )
      )
    ),
  },
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, minHeight: 480 } },
      // Left: recipient picker
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        React.createElement('div', null,
          React.createElement('label', { className: 'field-label' }, `Recipients (${playerIds.length})`),
          React.createElement('div', { className: 'scroll', style: { maxHeight: 320, display: 'flex', flexDirection: 'column', gap: 6, padding: 4, background: 'var(--gray-950)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' } },
            eligible.length === 0
              ? React.createElement('div', { style: { padding: 16, fontSize: 12, color: 'var(--gray-500)', textAlign: 'center' } }, 'No eligible players')
              : eligible.map((p) => React.createElement('label', {
                  key: p.id,
                  style: {
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                    borderRadius: 4, cursor: 'pointer',
                    background: playerIds.includes(p.id) ? 'rgba(173,3,3,0.12)' : 'transparent',
                    border: '1px solid', borderColor: playerIds.includes(p.id) ? 'rgba(173,3,3,0.35)' : 'transparent',
                  },
                },
                  React.createElement('input', { type: 'checkbox', className: 'checkbox', checked: playerIds.includes(p.id), onChange: () => togglePlayer(p.id) }),
                  React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                    React.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, `${p.firstName} ${p.lastName}`),
                    React.createElement('div', { style: { fontSize: 11, color: 'var(--gray-500)' } }, teamById(p.teamId)?.name || '—')
                  )
                ))
          )
        ),
        mode === 'offer' && React.createElement('div', null,
          React.createElement('label', { className: 'field-label' }, 'Acceptance Deadline'),
          React.createElement('input', { className: 'input', type: 'date', value: deadline, onChange: (e) => setDeadline(e.target.value) })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'field-label' }, 'Template'),
          React.createElement('div', { style: { padding: 10, background: 'var(--gray-800)', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12, color: 'var(--gray-300)' } },
            React.createElement('div', { style: { fontWeight: 600, color: '#fff', marginBottom: 4 } },
              mode === 'offer' ? 'Roster Offer (default)' : 'Tryout Result — Not Selected'
            ),
            React.createElement('div', null, 'Edit in Settings → Email Templates')
          )
        )
      ),

      // Right: email preview
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          React.createElement('div', { className: 'overline' }, 'Preview'),
          selectedPlayers.length > 1 && React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--gray-400)' } },
            React.createElement('button', { className: 'icon-btn', onClick: () => setPreviewIdx((i) => Math.max(0, i - 1)), disabled: previewIdx === 0 },
              React.createElement(Icon, { name: 'chev_right', size: 14, color: 'currentColor' })
            ),
            React.createElement('span', null, `${previewIdx + 1} / ${selectedPlayers.length}`),
            React.createElement('button', { className: 'icon-btn', onClick: () => setPreviewIdx((i) => Math.min(selectedPlayers.length - 1, i + 1)) },
              React.createElement(Icon, { name: 'chev_right', size: 14, color: 'currentColor' })
            )
          )
        ),
        React.createElement('div', { style: { background: '#0F0F0F', padding: 14, border: '1px solid var(--color-border)', borderRadius: 4 } },
          React.createElement('div', { style: { fontSize: 11, color: 'var(--gray-500)', marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'To'),
          React.createElement('div', { style: { fontSize: 13, color: '#fff' } },
            previewPlayer
              ? `${previewPlayer.parentName} <${previewPlayer.parentEmail}>`
              : '— select recipient —'
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--gray-500)', marginTop: 10, marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'Subject'),
          React.createElement('div', { style: { fontSize: 13, color: '#fff' } }, subject)
        ),
        React.createElement('div', { className: 'scroll', style: { maxHeight: 360, overflowY: 'auto' } },
          React.createElement(EmailBody, { mode, bodyText, ctx, sportsEngineUrl: state.config.sportsEngineUrl })
        )
      )
    )
  );
}

function EmailBody({ mode, bodyText, ctx, sportsEngineUrl }) {
  const paragraphs = bodyText.split(/\n\n+/);
  return React.createElement('div', { className: 'email-preview' },
    React.createElement('div', { className: 'header-bar' }),
    React.createElement('h1', null, mode === 'offer'
      ? `Welcome to the ${ctx.team}`
      : `${ctx.orgName || 'Hamilton Jr Chargers'} Tryout Results`
    ),
    paragraphs.map((para, i) =>
      React.createElement('p', { key: i, style: { whiteSpace: 'pre-wrap' } }, para)
    ),
    mode === 'offer' && React.createElement('div', { style: { textAlign: 'center', margin: '24px 0 16px' } },
      React.createElement('a', { className: 'accept-btn', href: sportsEngineUrl, target: '_blank', rel: 'noreferrer' }, 'Accept & Register')
    ),
    mode === 'offer' && React.createElement('p', { style: { fontSize: 12, color: '#666', textAlign: 'center' } },
      'Or paste this link: ', React.createElement('span', { style: { color: '#AD0303' } }, sportsEngineUrl)
    ),
    React.createElement('div', { className: 'meta' },
      `Hamilton Jr Chargers Baseball · Heritage Park, Hamilton, ON · coach@hamiltonjrchargers.com`
    )
  );
}

// ---------- Player Detail Modal ----------
function PlayerDetailModal({ open, playerId, onClose, onCompose }) {
  const { playerById, teamById, sendOffer, sendRejection, setStatus, deletePlayer, state, visibleTeams, isAdmin } = useApp();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const { updatePlayer } = useApp();
  const p = playerId ? playerById(playerId) : null;

  React.useEffect(() => { setEditing(false); setDraft(null); }, [playerId, open]);

  if (!open || !p) return null;
  const team = teamById(p.teamId);

  const timeline = [
    { ts: p.createdAt, label: 'Added to roster', icon: 'plus', muted: true },
    p.offer?.sentAt && { ts: p.offer.sentAt, label: 'Offer email sent', icon: 'send' },
    p.offer?.openedAt && { ts: p.offer.openedAt, label: 'Email opened', icon: 'eye' },
    p.offer?.clickedAt && { ts: p.offer.clickedAt, label: 'Clicked SportsEngine link', icon: 'click' },
    p.offer?.acceptedAt && { ts: p.offer.acceptedAt, label: 'Completed registration', icon: 'check', hot: true },
    p.offer?.declinedAt && { ts: p.offer.declinedAt, label: 'Declined the offer', icon: 'ban' },
    p.offer?.expiresAt && new Date(p.offer.expiresAt) < new Date() && !p.offer.acceptedAt && !p.offer.declinedAt &&
      { ts: p.offer.expiresAt, label: 'Offer expired', icon: 'clock', muted: true },
  ].filter(Boolean);

  const startEdit = () => { setDraft({ ...p }); setEditing(true); };
  const saveEdit = () => { updatePlayer(p.id, draft); setEditing(false); };

  return React.createElement(Modal, {
    open, onClose, width: 760,
    title: `${p.firstName} ${p.lastName}`,
    footer: React.createElement(React.Fragment, null,
      React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: () => { if (confirm('Remove this player from the system?')) { deletePlayer(p.id); onClose(); } } },
        React.createElement(Icon, { name: 'trash', size: 13 }), 'Remove'
      ),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        editing
          ? React.createElement(React.Fragment, null,
              React.createElement(Button, { variant: 'ghost', onClick: () => setEditing(false) }, 'Cancel'),
              React.createElement(Button, { variant: 'primary', onClick: saveEdit }, 'Save Changes')
            )
          : React.createElement(React.Fragment, null,
              ['draft', 'waitlisted'].includes(p.status) && React.createElement(Button, { variant: 'danger', size: 'md', onClick: () => { sendRejection(p.id); onClose(); } },
                React.createElement(Icon, { name: 'ban', size: 13 }), 'Send Rejection'
              ),
              ['draft', 'waitlisted', 'expired'].includes(p.status) && React.createElement(Button, { variant: 'primary', onClick: () => { onCompose('offer', [p.id]); onClose(); } },
                React.createElement(Icon, { name: 'send', size: 13 }), 'Send Offer'
              ),
              p.status === 'sent' && React.createElement(Button, { variant: 'outline', onClick: () => { sendOffer(p.id); } },
                React.createElement(Icon, { name: 'refresh', size: 13 }), 'Resend Offer'
              )
            )
      )
    ),
  },
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 } },
      // Left column — Player info
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 18 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
          React.createElement(Avatar, { player: p, size: 'lg' }),
          React.createElement('div', null,
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
              React.createElement(Badge, { status: p.status })
            ),
            React.createElement('div', { style: { fontSize: 13, color: 'var(--gray-300)' } },
              `${team?.name || '—'} · Age ${p.age} · Grade ${p.grade}`
            )
          )
        ),
        editing
          ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
                Field('First', React.createElement('input', { className: 'input', value: draft.firstName, onChange: (e) => setDraft({ ...draft, firstName: e.target.value }) })),
                Field('Last', React.createElement('input', { className: 'input', value: draft.lastName, onChange: (e) => setDraft({ ...draft, lastName: e.target.value }) }))
              ),
              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
                Field('Age', React.createElement('input', { className: 'input', type: 'number', value: draft.age, onChange: (e) => setDraft({ ...draft, age: parseInt(e.target.value) || 0 }) })),
                Field('Grade', React.createElement('input', { className: 'input', value: draft.grade, onChange: (e) => setDraft({ ...draft, grade: e.target.value }) }))
              ),
              Field('Team', React.createElement('select', { className: 'select', value: draft.teamId, onChange: (e) => setDraft({ ...draft, teamId: e.target.value }) },
                visibleTeams.map((t) => React.createElement('option', { key: t.id, value: t.id }, t.name))
              )),
              Field('Parent Name', React.createElement('input', { className: 'input', value: draft.parentName, onChange: (e) => setDraft({ ...draft, parentName: e.target.value }) })),
              Field('Parent Email', React.createElement('input', { className: 'input', value: draft.parentEmail, onChange: (e) => setDraft({ ...draft, parentEmail: e.target.value }) })),
              Field('Notes', React.createElement('textarea', { className: 'textarea', value: draft.notes || '', onChange: (e) => setDraft({ ...draft, notes: e.target.value }), rows: 3 }))
            )
          : React.createElement('div', { className: 'card', style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 } },
              InfoRow('Parent / Guardian', p.parentName),
              InfoRow('Email', React.createElement('span', { style: { color: 'var(--color-brand)', fontWeight: 500 } }, p.parentEmail)),
              InfoRow('Added', fmtDate(p.createdAt)),
              p.offer?.expiresAt && InfoRow('Offer Expires', fmtDate(p.offer.expiresAt)),
              React.createElement('div', null,
                React.createElement('div', { style: { fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: 6 } }, 'Coach Notes'),
                React.createElement('div', { style: { fontSize: 13, color: 'var(--gray-200)', lineHeight: 1.5, fontStyle: p.notes ? 'normal' : 'italic' } },
                  p.notes || 'No notes added'
                )
              ),
              React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: startEdit, style: { alignSelf: 'flex-start' } },
                React.createElement(Icon, { name: 'edit', size: 13 }), 'Edit details'
              )
            ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          React.createElement('div', null,
            React.createElement('label', { className: 'field-label' }, 'Team'),
            React.createElement('select', { className: 'select', value: p.teamId, onChange: (e) => updatePlayer(p.id, { teamId: e.target.value }) },
              visibleTeams.map((t) => React.createElement('option', { key: t.id, value: t.id }, t.name))
            )
          ),
          React.createElement('div', null,
            React.createElement('label', { className: 'field-label' }, 'Change Status'),
            React.createElement('select', { className: 'select', value: p.status, onChange: (e) => setStatus(p.id, e.target.value) },
              Object.entries(STATUS_LABELS).map(([k, v]) => React.createElement('option', { key: k, value: k }, v.label))
            )
          )
        )
      ),

      // Right column — Email tracking timeline
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.04em' } }, 'Offer Timeline'),
          p.offer?.acceptedAt && React.createElement('a', { href: state.config.sportsEngineUrl, target: '_blank', rel: 'noreferrer', style: { fontSize: 11, color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 4, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 700 } },
            'View SE Registration ', React.createElement(Icon, { name: 'external', size: 11 })
          )
        ),
        timeline.length === 0
          ? React.createElement(Empty, { title: 'No offer sent yet', sub: 'Send an offer to start tracking opens, clicks, and acceptance.' })
          : React.createElement('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: 4 } },
              timeline.map((t, i) => React.createElement('div', { key: i, style: { display: 'flex', gap: 14, paddingBottom: 16, position: 'relative' } },
                i < timeline.length - 1 && React.createElement('div', { style: { position: 'absolute', left: 13, top: 24, bottom: 0, width: 1, background: 'var(--color-border)' } }),
                React.createElement('div', {
                  style: {
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: t.hot ? 'var(--color-brand)' : t.muted ? 'var(--gray-800)' : 'rgba(173,3,3,0.18)',
                    border: '1px solid', borderColor: t.hot ? 'var(--color-brand)' : t.muted ? 'var(--color-border)' : 'rgba(173,3,3,0.4)',
                    color: t.hot ? '#fff' : t.muted ? 'var(--gray-500)' : 'var(--color-brand)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  },
                }, React.createElement(Icon, { name: t.icon, size: 13 })),
                React.createElement('div', { style: { flex: 1, paddingTop: 4 } },
                  React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: '#fff' } }, t.label),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--gray-500)', marginTop: 2 } }, fmtDateTime(t.ts))
                )
              ))
            ),
        p.status === 'sent' && React.createElement('div', { style: { marginTop: 'auto', padding: 12, background: 'rgba(229,165,103,0.06)', border: '1px solid rgba(229,165,103,0.2)', borderRadius: 4, fontSize: 12, color: '#E5A567' } },
          React.createElement('strong', null, 'Awaiting response.'),
          ` Offer expires ${fmtDate(p.offer?.expiresAt)}.`
        )
      )
    )
  );
}

function InfoRow(label, value) {
  return React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 } },
    React.createElement('span', { style: { color: 'var(--gray-400)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 } }, label),
    React.createElement('span', { style: { color: '#fff', textAlign: 'right', fontWeight: 500 } }, value)
  );
}

// ---------- Settings ----------
function Settings() {
  const { state, updateConfig, updateTemplate, addTeam, removeTeam, resetData, isAdmin, currentUser } = useApp();
  const [newTeam, setNewTeam] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('season');

  if (!isAdmin) {
    return React.createElement('div', { style: { padding: 32, height: '100%' } },
      React.createElement('div', null,
        React.createElement('div', { className: 'overline' }, 'Configuration'),
        React.createElement('h1', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 42, textTransform: 'uppercase', lineHeight: 1, marginTop: 6, letterSpacing: '-0.01em' } }, 'Settings')
      ),
      React.createElement('div', { className: 'card', style: { marginTop: 24, padding: 32, maxWidth: 560, textAlign: 'center', borderColor: 'rgba(173,3,3,0.25)' } },
        React.createElement('div', { style: { width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', background: 'rgba(173,3,3,0.12)', color: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          React.createElement(Icon, { name: 'ban', size: 24 })
        ),
        React.createElement('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 6 } }, 'Admins Only'),
        React.createElement('p', { style: { fontSize: 13, color: 'var(--gray-300)', lineHeight: 1.6 } },
          `Settings — season config, SportsEngine URL, email templates, and team management — are reserved for board admins. You're signed in as ${currentUser?.name} (${currentUser?.title}).`
        ),
        React.createElement('p', { style: { fontSize: 12, color: 'var(--gray-500)', marginTop: 14 } },
          'Need a change? Contact a board admin.'
        )
      )
    );
  }

  return React.createElement('div', { className: 'scroll', style: { padding: 32, height: '100%', display: 'flex', flexDirection: 'column', gap: 22, minHeight: 0 } },
    React.createElement('div', null,
      React.createElement('div', { className: 'overline' }, 'Configuration'),
      React.createElement('h1', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 42, textTransform: 'uppercase', lineHeight: 1, marginTop: 6, letterSpacing: '-0.01em' } }, 'Settings')
    ),

    React.createElement('div', { style: { display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)' } },
      [
        { id: 'season', label: 'Season' },
        { id: 'teams', label: 'Teams' },
        { id: 'templates', label: 'Email Templates' },
        { id: 'danger', label: 'Reset Data' },
      ].map((t) => React.createElement('button', {
        key: t.id,
        onClick: () => setActiveTab(t.id),
        style: {
          background: 'transparent', border: 'none', borderBottom: '2px solid', borderColor: activeTab === t.id ? 'var(--color-brand)' : 'transparent',
          padding: '12px 18px',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontStyle: 'italic', fontSize: 14,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          color: activeTab === t.id ? '#fff' : 'var(--gray-400)',
          cursor: 'pointer', transition: 'all 150ms ease-out',
        },
      }, t.label))
    ),

    activeTab === 'season' && React.createElement('div', { className: 'card', style: { padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 } },
      React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 } }, 'Season & Registration'),
      Field('Active Season', React.createElement('input', { className: 'input', value: state.config.season, onChange: (e) => updateConfig({ season: e.target.value }) })),
      Field('SportsEngine Registration URL',
        React.createElement('input', { className: 'input', value: state.config.sportsEngineUrl, onChange: (e) => updateConfig({ sportsEngineUrl: e.target.value }) })
      ),
      React.createElement('div', { style: { fontSize: 12, color: 'var(--gray-500)', marginTop: -8 } },
        'The "Accept & Register" button in offer emails will direct families to this URL.'
      ),
      Field('Offer Expiration (days)',
        React.createElement('input', { className: 'input', type: 'number', value: state.config.offerExpiresInDays, onChange: (e) => updateConfig({ offerExpiresInDays: parseInt(e.target.value) || 7 }), style: { maxWidth: 140 } })
      )
    ),

    activeTab === 'teams' && React.createElement('div', { className: 'card', style: { padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 } },
      React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 } }, 'Teams'),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        React.createElement('input', { className: 'input', placeholder: 'e.g. 13U AAA Rep', value: newTeam, onChange: (e) => setNewTeam(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && newTeam.trim()) { addTeam(newTeam.trim()); setNewTeam(''); } } }),
        React.createElement(Button, { variant: 'primary', onClick: () => { if (newTeam.trim()) { addTeam(newTeam.trim()); setNewTeam(''); } } },
          React.createElement(Icon, { name: 'plus', size: 14 }), 'Add Team'
        )
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        state.teams.map((t) => React.createElement('div', { key: t.id, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--gray-800)', borderRadius: 4, border: '1px solid var(--color-border)' } },
          React.createElement('span', { style: { fontWeight: 500 } }, t.name),
          React.createElement('button', { className: 'icon-btn', onClick: () => { if (confirm(`Remove ${t.name}?`)) removeTeam(t.id); } },
            React.createElement(Icon, { name: 'trash', size: 13 })
          )
        ))
      )
    ),

    activeTab === 'templates' && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 920 } },
      ['offer', 'rejection'].map((key) => React.createElement('div', { key, className: 'card', style: { padding: 22, display: 'flex', flexDirection: 'column', gap: 14 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.04em' } },
            key === 'offer' ? 'Offer Letter Template' : 'Rejection Letter Template'
          ),
          React.createElement('span', { style: { fontSize: 11, color: 'var(--gray-500)', letterSpacing: '0.08em' } },
            'Available: ', React.createElement('code', { style: { color: 'var(--color-brand)' } }, '{{playerFirstName}} {{parentName}} {{team}} {{season}} {{deadline}}')
          )
        ),
        Field('Subject',
          React.createElement('input', { className: 'input', value: state.templates[key].subject, onChange: (e) => updateTemplate(key, { subject: e.target.value }) })
        ),
        Field('Body',
          React.createElement('textarea', { className: 'textarea', value: state.templates[key].body, onChange: (e) => updateTemplate(key, { body: e.target.value }), rows: 10 })
        )
      ))
    ),

    activeTab === 'danger' && React.createElement('div', { className: 'card', style: { padding: 24, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720, borderColor: 'rgba(173,3,3,0.3)' } },
      React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-brand)' } }, 'Reset Demo Data'),
      React.createElement('p', { style: { fontSize: 13, color: 'var(--gray-300)', lineHeight: 1.6 } },
        'This wipes all locally-stored players, activity, and settings and restores the seeded demo data. Useful for a fresh demo.'
      ),
      React.createElement(Button, { variant: 'outline-red', onClick: () => { if (confirm('Reset all data to seed values?')) resetData(); }, style: { alignSelf: 'flex-start' } },
        React.createElement(Icon, { name: 'refresh', size: 14 }), 'Reset to Seed Data'
      )
    )
  );
}

Object.assign(window, {
  Dashboard, Roster, AddPlayerModal, ComposerModal, PlayerDetailModal, Settings,
  StatTiles, ActivityFeed, PlayerRow,
});
