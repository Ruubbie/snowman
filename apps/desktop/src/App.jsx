import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity as ActivityIcon, House, LayoutDashboard, MessageSquare, MonitorSmartphone, Settings as SettingsIcon, Wallet } from 'lucide-react';
import { bridge } from './lib/bridge.js';
import { api } from './lib/api.js';
import { AppContext } from './lib/app-context.js';
import { navigate, useRoute } from './lib/hooks.js';
import { hostOf } from './lib/format.js';
import { Badge, Empty, Icon, Page } from './components/ui.jsx';
import { OverlayProvider } from './components/overlay.jsx';
import { modules, findModule } from './modules/index.js';
import { Home } from './screens/Home.jsx';
import { Overview } from './screens/Overview.jsx';
import { Conversations } from './screens/Conversations.jsx';
import { Activity } from './screens/Activity.jsx';
import { Usage } from './screens/Usage.jsx';
import { Devices } from './screens/Devices.jsx';
import { Settings } from './screens/Settings.jsx';
import { Pair } from './screens/Pair.jsx';

const CORE_NAV = [
  { path: '/', label: 'Olaf', icon: House },
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/conversations', label: 'Conversations', icon: MessageSquare },
  { path: '/activity', label: 'Activity', icon: ActivityIcon },
  { path: '/usage', label: 'Olaf usage', icon: Wallet },
  { path: '/devices', label: 'Devices', icon: MonitorSmartphone },
];

/** Resolve theme 'system' against the OS preference and set html[data-theme]. */
function useThemeAttr(theme) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = theme === 'system' || !theme ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = t;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

function NavItem({ path, label, icon, badge, active, sub }) {
  return (
    <button type="button" className={`nav-item${sub ? ' nav-item--sub' : ''}${active ? ' nav-item--active' : ''}`} onClick={() => navigate(path)} title={label} aria-current={active ? 'page' : undefined}>
      <Icon icon={icon} size={sub ? 16 : 18} />
      <span className="nav-item__label">{label}</span>
      {badge && <Badge>{badge}</Badge>}
    </button>
  );
}

function Sidebar({ path, state }) {
  const isActive = (p) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`));
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <span className="brand__word">olaf</span>
        <span className="brand__ring" />
      </div>
      {CORE_NAV.map((n) => (
        <NavItem key={n.path} {...n} active={isActive(n.path)} />
      ))}
      <div className="nav-group eyebrow">Modules</div>
      {modules.map((m) => (
        <div key={m.id}>
          <NavItem path={`/m/${m.id}/${m.screens[0].id}`} label={m.name} icon={m.icon} active={false} />
          {m.screens.map((s) => (
            <NavItem key={s.id} sub path={`/m/${m.id}/${s.id}`} label={s.label} icon={s.icon} active={isActive(`/m/${m.id}/${s.id}`)} />
          ))}
        </div>
      ))}
      <div className="sidebar__foot">
        <NavItem path="/settings" label="Settings" icon={SettingsIcon} active={isActive('/settings')} />
        <div className="device-chip" title={state.serverUrl}>
          <span className="status-dot status-dot--on" />
          <span>
            {state.deviceName} · {hostOf(state.serverUrl)}
          </span>
        </div>
      </div>
    </nav>
  );
}

function Screen({ parts }) {
  const [head, a, b, c] = parts;
  switch (head) {
    case undefined:
      return <Home />;
    case 'talk': // old link: talking to Olaf lives on Home now
      return <Home />;
    case 'overview':
      return <Overview />;
    case 'conversations':
      return <Conversations id={a} />;
    case 'activity':
      return <Activity />;
    case 'usage':
      return <Usage />;
    case 'devices':
      return <Devices />;
    case 'settings':
      return <Settings />;
    case 'm': {
      const mod = findModule(a);
      const screen = mod?.screens.find((s) => s.id === (b || mod.screens[0].id));
      if (screen) {
        const C = screen.component;
        return <C param={c} />;
      }
      break;
    }
    default:
  }
  return (
    <Page title="Not here" ghost="?">
      <Empty>That page does not exist.</Empty>
    </Page>
  );
}

export function App() {
  const [state, setState] = useState(null);
  const { path, parts } = useRoute();

  const refresh = useCallback(() => bridge.getState().then(setState), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useThemeAttr(state?.theme);

  const ctx = useMemo(() => {
    if (!state) return null;
    return {
      state,
      client: state.serverUrl ? api(state.serverUrl) : null,
      refresh,
      async pair(args) {
        const res = await bridge.pair(args);
        if (res.state) {
          setState(res.state);
          navigate('/');
        }
        return res;
      },
      async unpair() {
        setState(await bridge.unpair());
        navigate('/');
      },
      async setTheme(theme) {
        setState(await bridge.setTheme(theme));
      },
    };
  }, [state, refresh]);

  if (!ctx) return null;
  return (
    <AppContext.Provider value={ctx}>
      <OverlayProvider>
        {!state.paired ? (
          <Pair />
        ) : (
          <div className="shell">
            <Sidebar path={path} state={state} />
            <main className="main" key={parts[0] === 'm' ? parts.join('/') : parts[0] || 'home'}>
              <Screen parts={parts} />
            </main>
          </div>
        )}
      </OverlayProvider>
    </AppContext.Provider>
  );
}
