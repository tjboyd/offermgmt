/* ============================================================
   layouts.jsx — V1 "Operations" layout (sidebar admin)
   ============================================================ */

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home',     adminOnly: false },
  { id: 'roster',    label: 'Roster',    icon: 'users',    adminOnly: false },
  { id: 'settings',  label: 'Settings',  icon: 'settings', adminOnly: true  },
];

// ---------- Shared host that wires Modals + Toasts ----------
function AppHost({ children, page, setPage }) {
  const [composer, setComposer] = React.useState({ open: false, mode: 'offer', ids: [] });
  const [addOpen, setAddOpen] = React.useState(false);
  const [detail, setDetail] = React.useState({ open: false, id: null });

  const openCompose = (mode = 'offer', ids = []) => setComposer({ open: true, mode, ids });
  const openPlayer = (id) => setDetail({ open: true, id });
  const openAdd = () => setAddOpen(true);

  const ctx = { openCompose, openPlayer, openAdd, page, setPage };

  return React.createElement(React.Fragment, null,
    children(ctx),
    React.createElement(ComposerModal, {
      open: composer.open,
      onClose: () => setComposer({ open: false, mode: 'offer', ids: [] }),
      mode: composer.mode,
      initialPlayerIds: composer.ids,
    }),
    React.createElement(AddPlayerModal, { open: addOpen, onClose: () => setAddOpen(false) }),
    React.createElement(PlayerDetailModal, {
      open: detail.open, playerId: detail.id,
      onClose: () => setDetail({ open: false, id: null }),
      onCompose: openCompose,
    }),
    React.createElement(ToastStack)
  );
}

// ---------- Screen router ----------
function CurrentScreen({ page, ctx }) {
  if (page === 'dashboard') {
    return React.createElement(Dashboard, {
      onOpenPlayer: ctx.openPlayer,
      onCompose: ctx.openCompose,
      onAddPlayer: ctx.openAdd,
    });
  }
  if (page === 'roster') {
    return React.createElement(Roster, {
      onOpenPlayer: ctx.openPlayer,
      onCompose: ctx.openCompose,
      onAddPlayer: ctx.openAdd,
    });
  }
  if (page === 'settings') return React.createElement(Settings);
  return null;
}

// ============================================================
// LAYOUT — OPERATIONS (sidebar admin)
// ============================================================
function AppLayout() {
  const { state, counts, isAdmin, currentUser, setCurrentUser, visibleTeams } = useApp();

  const navItems = PAGES.filter((p) => !p.adminOnly || isAdmin);

  const [page, setPage] = React.useState(() => {
    const stored = localStorage.getItem('jrc_page');
    const valid = navItems.find((n) => n.id === stored);
    return valid ? stored : 'dashboard';
  });

  // If role changes and current page becomes inaccessible, fall back to dashboard
  React.useEffect(() => {
    if (!navItems.find((n) => n.id === page)) {
      setPage('dashboard');
      localStorage.setItem('jrc_page', 'dashboard');
    }
  }, [isAdmin]);

  const navigate = (p) => { setPage(p); localStorage.setItem('jrc_page', p); };

  return React.createElement(AppHost, { page, setPage: navigate },
    (ctx) => React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '240px 1fr', height: '100vh', overflow: 'hidden' } },
      // Sidebar
      React.createElement('aside', { style: { background: 'var(--gray-900)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
        // Logo
        React.createElement('div', { style: { padding: '18px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12 } },
          React.createElement('img', { src: 'assets/HC-logo-icon.png', alt: 'HC', style: { width: 40, height: 40, borderRadius: 4 } }),
          React.createElement('div', null,
            React.createElement('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic', fontSize: 15, textTransform: 'uppercase', lineHeight: 1.1, letterSpacing: '0.02em' } }, 'Jr Chargers'),
            React.createElement('div', { style: { fontSize: 10, color: 'var(--gray-400)', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 600, marginTop: 2 } }, 'Offer Mgmt')
          )
        ),
        // Nav
        React.createElement('nav', { style: { padding: 12, display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflow: 'hidden' } },
          React.createElement('div', { style: { fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--gray-500)', textTransform: 'uppercase', padding: '12px 12px 6px' } }, 'Workspace'),
          navItems.map((p) => React.createElement('button', {
            key: p.id, onClick: () => navigate(p.id),
            style: {
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              border: 'none', background: page === p.id ? 'rgba(173,3,3,0.14)' : 'transparent',
              color: page === p.id ? '#fff' : 'var(--gray-300)',
              borderRadius: 4, cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 14,
              borderLeft: '3px solid', borderColor: page === p.id ? 'var(--color-brand)' : 'transparent',
              transition: 'all 150ms ease-out',
            },
          },
            React.createElement(Icon, { name: p.icon, size: 16 }),
            React.createElement('span', { style: { flex: 1 } }, p.label),
            p.id === 'roster' && React.createElement('span', { style: { fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 } }, counts.total)
          )),

          // Pipeline shortcuts
          React.createElement('div', { style: { fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--gray-500)', textTransform: 'uppercase', padding: '20px 12px 6px' } },
            isAdmin ? 'Pipeline' : 'My Pipeline'
          ),
          React.createElement(PipelineLink, { label: 'Awaiting Response', count: counts.sent, color: '#E5A567' }),
          React.createElement(PipelineLink, { label: 'Accepted', count: counts.accepted, color: '#66C97A' }),
          React.createElement(PipelineLink, { label: 'Waitlisted', count: counts.waitlisted, color: '#6BAEFF' }),
          React.createElement(PipelineLink, { label: 'Drafts', count: counts.draft, color: 'var(--gray-500)' }),

          // Team scope for coaches
          !isAdmin && visibleTeams.length > 0 && React.createElement(React.Fragment, null,
            React.createElement('div', { style: { fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--gray-500)', textTransform: 'uppercase', padding: '20px 12px 6px' } }, 'Your Teams'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' } },
              visibleTeams.map((t) => React.createElement('div', {
                key: t.id,
                style: {
                  fontSize: 12, color: 'var(--gray-300)', padding: '5px 0',
                  display: 'flex', alignItems: 'center', gap: 8,
                },
              },
                React.createElement('span', { style: { width: 3, height: 14, background: 'var(--color-brand)', borderRadius: 1, flexShrink: 0 } }),
                t.name
              ))
            )
          )
        ),

        // User card (clickable -> opens user switcher)
        React.createElement(UserCard, { user: currentUser, allUsers: state.users, onSelect: setCurrentUser })
      ),

      // Main panel
      React.createElement('main', { style: { background: 'var(--color-bg-primary)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } },
        // Top sub-bar
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 32px', borderBottom: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.2)' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--gray-400)' } },
            React.createElement('span', null, navItems.find((p) => p.id === page)?.label),
            React.createElement('span', { style: { color: 'var(--gray-600)' } }, '·'),
            React.createElement('span', { style: { color: 'var(--color-brand)', fontWeight: 600, letterSpacing: '0.04em' } }, `${state.config.season} Season`),
            !isAdmin && React.createElement(React.Fragment, null,
              React.createElement('span', { style: { color: 'var(--gray-600)' } }, '·'),
              React.createElement('span', { style: { color: 'var(--gray-400)', fontWeight: 600 } },
                'Scoped to your team', visibleTeams.length > 1 ? 's' : ''
              )
            )
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--gray-500)' } },
            React.createElement(Icon, { name: 'bolt', size: 12, color: 'var(--color-brand)' }),
            React.createElement('span', null, `${counts.sent} offer${counts.sent !== 1 ? 's' : ''} awaiting response`)
          )
        ),
        React.createElement('div', { style: { flex: 1, minHeight: 0, overflow: 'hidden' } },
          React.createElement(CurrentScreen, { page, ctx })
        )
      )
    )
  );
}

function PipelineLink({ label, count, color }) {
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px 7px 24px',
      fontSize: 12, color: 'var(--gray-400)',
    },
  },
    React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 } }),
    React.createElement('span', { style: { flex: 1 } }, label),
    React.createElement('span', { style: { fontWeight: 700, color: '#fff' } }, count)
  );
}

// ---------- User card with role badge + switcher ----------
function UserCard({ user, allUsers, onSelect }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;

  return React.createElement('div', { ref: wrapRef, style: { position: 'relative', borderTop: '1px solid var(--color-border)' } },
    // Dropdown menu (above)
    open && React.createElement('div', {
      style: {
        position: 'absolute', left: 8, right: 8, bottom: 'calc(100% + 6px)',
        background: 'var(--gray-900)', border: '1px solid var(--color-border-strong)',
        borderRadius: 8, boxShadow: 'var(--shadow-lg)',
        padding: 6, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 10,
      },
    },
      React.createElement('div', { style: { fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--gray-500)', textTransform: 'uppercase', padding: '8px 10px 6px' } },
        'Switch User (demo)'
      ),
      allUsers.map((u) => React.createElement('button', {
        key: u.id,
        onClick: () => { onSelect(u.id); setOpen(false); },
        style: {
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
          background: u.id === user.id ? 'rgba(173,3,3,0.14)' : 'transparent',
          border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
          color: '#fff', transition: 'background 150ms ease-out',
        },
        onMouseEnter: (e) => u.id !== user.id && (e.currentTarget.style.background = 'rgba(255,255,255,0.04)'),
        onMouseLeave: (e) => u.id !== user.id && (e.currentTarget.style.background = 'transparent'),
      },
        React.createElement('div', {
          style: {
            width: 28, height: 28, borderRadius: '50%',
            background: u.role === 'admin' ? 'var(--color-brand)' : 'var(--gray-700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
            fontSize: 11, color: '#fff', flexShrink: 0,
          },
        }, u.initials),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 } },
            u.name,
            React.createElement('span', {
              style: {
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '1px 5px', borderRadius: 3,
                background: u.role === 'admin' ? 'rgba(173,3,3,0.2)' : 'rgba(255,255,255,0.06)',
                color: u.role === 'admin' ? '#E07070' : 'var(--gray-300)',
                border: '1px solid', borderColor: u.role === 'admin' ? 'rgba(173,3,3,0.4)' : 'var(--color-border)',
              },
            }, ROLE_LABEL[u.role])
          ),
          React.createElement('div', { style: { fontSize: 10.5, color: 'var(--gray-500)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, u.title)
        )
      ))
    ),

    React.createElement('button', {
      onClick: () => setOpen((o) => !o),
      style: {
        display: 'flex', alignItems: 'center', gap: 10, padding: 14, width: '100%',
        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        color: '#fff', transition: 'background 150ms ease-out',
      },
      onMouseEnter: (e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)'),
      onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'),
    },
      React.createElement('div', {
        style: {
          width: 34, height: 34, borderRadius: '50%',
          background: user.role === 'admin' ? 'var(--color-brand)' : 'var(--gray-700)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
          fontSize: 13, color: '#fff', flexShrink: 0,
        },
      }, user.initials),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
          React.createElement('span', { style: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, user.name),
          React.createElement('span', {
            style: {
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '1px 5px', borderRadius: 3,
              background: user.role === 'admin' ? 'rgba(173,3,3,0.2)' : 'rgba(255,255,255,0.06)',
              color: user.role === 'admin' ? '#E07070' : 'var(--gray-300)',
              border: '1px solid', borderColor: user.role === 'admin' ? 'rgba(173,3,3,0.4)' : 'var(--color-border)',
              flexShrink: 0,
            },
          }, ROLE_LABEL[user.role])
        ),
        React.createElement('div', { style: { fontSize: 11, color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, user.title)
      ),
      React.createElement('span', { style: { color: 'var(--gray-500)', flexShrink: 0 } },
        React.createElement(Icon, { name: open ? 'chev_down' : 'chev_right', size: 14 })
      )
    )
  );
}

Object.assign(window, { AppLayout });
