/* ============================================================
   main.jsx — App entry. Renders the Operations layout.
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "_": ""
}/*EDITMODE-END*/;

function App() {
  return React.createElement(AppProvider, null,
    React.createElement(AppLayout),
    React.createElement(DemoControls)
  );
}

// Lightweight demo-helpers panel inside the host Tweaks toggle.
// Lets reviewers jump between roles + reset the seed without using the sidebar.
function DemoControls() {
  useTweaks(TWEAK_DEFAULTS); // wire host protocol
  const { state, currentUser, isAdmin, setCurrentUser, resetData } = useApp();

  return React.createElement(TweaksPanel, null,
    React.createElement(TweakSection, { label: 'Demo \u2014 Active User' }),
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      state.users.map((u) => React.createElement('button', {
        key: u.id,
        onClick: () => setCurrentUser(u.id),
        style: {
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '8px 10px', borderRadius: 8,
          background: u.id === currentUser?.id ? '#AD0303' : 'rgba(0,0,0,0.04)',
          color: u.id === currentUser?.id ? '#fff' : '#29261b',
          border: '1px solid', borderColor: u.id === currentUser?.id ? '#AD0303' : 'rgba(0,0,0,0.08)',
          cursor: 'pointer', textAlign: 'left', transition: 'all 150ms ease-out',
        },
      },
        React.createElement('div', {
          style: {
            width: 24, height: 24, borderRadius: '50%',
            background: u.id === currentUser?.id ? 'rgba(255,255,255,0.18)' : (u.role === 'admin' ? '#AD0303' : '#888'),
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, fontStyle: 'italic',
            flexShrink: 0,
          },
        }, u.initials),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', { style: { fontSize: 11.5, fontWeight: 600, marginBottom: 1 } }, u.name),
          React.createElement('div', { style: { fontSize: 10, opacity: 0.75, lineHeight: 1.35 } }, `${ROLE_LABEL[u.role]} · ${u.title}`)
        )
      ))
    ),
    React.createElement(TweakSection, { label: 'Data' }),
    React.createElement('button', {
      onClick: () => { if (confirm('Reset all players, offers, and activity to seed values?')) resetData(); },
      style: {
        background: 'rgba(173,3,3,0.08)', color: '#AD0303',
        border: '1px solid rgba(173,3,3,0.25)', borderRadius: 6,
        padding: '8px 10px', cursor: 'pointer',
        fontSize: 11.5, fontWeight: 600, textAlign: 'center',
      },
    }, 'Reset to seed data'),
    React.createElement('div', { style: { fontSize: 10.5, color: 'rgba(41,38,27,0.55)', padding: '4px 2px 0', lineHeight: 1.5 } },
      isAdmin
        ? 'You\u2019re viewing as an admin: full access to all teams, players, and settings.'
        : 'You\u2019re viewing as a coach: scoped to your assigned team(s). Settings are admin-only.'
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
