import { LogOut } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { fmtDateTime } from '../lib/format.js';
import { Button, Card, Page, Section, Tabs } from '../components/ui.jsx';
import { useOverlay } from '../components/overlay.jsx';

const STORAGE_TEXT = {
  encrypted: 'Encrypted on this computer with the operating system keychain (Electron safeStorage).',
  memory: 'Kept in memory only (encryption is unavailable here), so you will need to pair again after a restart.',
  'browser-dev': 'Browser dev mode: stored unencrypted in this browser. Use the Electron app for real use.',
  none: 'No token stored.',
};

export function Settings() {
  const { state, setTheme, unpair } = useApp();
  const { confirm } = useOverlay();

  async function doUnpair() {
    const ok = await confirm({
      title: 'Unpair this computer?',
      body: 'The token is removed from this computer. The server keeps listing the device until you revoke it from another device.',
      what: `${state.deviceName || 'This device'} on ${state.serverUrl}`,
      confirmLabel: 'Unpair',
      icon: null,
    });
    if (ok) unpair();
  }

  return (
    <Page eyebrow="Settings" title="This computer" ghost="Setup">
      <div className="grid grid--2">
        <Card tone="white" i={1} eyebrow="Server">
          <dl className="kv">
            <dt>Address</dt>
            <dd className="mono">{state.serverUrl}</dd>
            <dt>Device name</dt>
            <dd>{state.deviceName}</dd>
            <dt>Device id</dt>
            <dd className="mono">{state.deviceId}</dd>
            <dt>Paired</dt>
            <dd>{fmtDateTime(state.pairedAt)}</dd>
            <dt>Token</dt>
            <dd>{STORAGE_TEXT[state.tokenStorage] || state.tokenStorage}</dd>
          </dl>
          <div style={{ marginTop: 24 }}>
            <Button variant="outline" iconLeft={LogOut} onClick={doUnpair}>
              Unpair
            </Button>
          </div>
        </Card>
        <Card tone="tint" i={2} eyebrow="Appearance">
          <p className="small" style={{ margin: '0 0 16px' }}>
            Snow-light is the design system’s home. Dark is derived from the same tokens.
          </p>
          <Tabs
            variant="pill"
            items={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={state.theme}
            onChange={setTheme}
          />
        </Card>
      </div>
      <Section title="About" i={3}>
        <dl className="kv">
          <dt>App</dt>
          <dd>olaf desktop {state.appVersion}</dd>
          <dt>Shell</dt>
          <dd>{state.shell === 'desktop' ? 'Electron' : 'Browser (dev)'}</dd>
        </dl>
      </Section>
    </Page>
  );
}
