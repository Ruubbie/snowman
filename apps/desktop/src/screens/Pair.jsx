import { useState } from 'react';
import { ArrowRight, KeyRound, Laptop, Server } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { Button, ErrorNote, GhostWord, Input, Ring } from '../components/ui.jsx';

export function Pair() {
  const { pair } = useApp();
  const [serverUrl, setServerUrl] = useState('');
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('Desktop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await pair({ serverUrl, code, deviceName });
    if (res?.error) setError(res.error);
    setBusy(false);
  }

  return (
    <div className="main" style={{ background: 'var(--surface-page)' }}>
      <div className="page" style={{ maxWidth: 'none', display: 'flex', alignItems: 'center', minHeight: '100%' }}>
        <div className="page__panel" style={{ width: '48%', height: '100%' }} />
        <GhostWord>olaf</GhostWord>
        <div className="page__content" style={{ width: '100%', maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 48, alignItems: 'center' }}>
          <div className="rise">
            <div className="brand" style={{ padding: 0, marginBottom: 40 }}>
              <span className="brand__word">olaf</span>
              <span className="brand__ring" />
            </div>
            <div className="eyebrow eyebrow--accent" style={{ marginBottom: 14 }}>
              New device
            </div>
            <h1 className="h1" style={{ fontSize: 56 }}>
              Pair this
              <br />
              computer
            </h1>
            <p className="page__sub">Enter your Snowman server and a pairing code. I keep the token encrypted on this computer.</p>
            <p className="small muted" style={{ marginTop: 18 }}>
              Get a code on the server with <span className="mono strong">npm run pair -w @snowman/backbone -- Desktop</span>
            </p>
            <div style={{ marginTop: 28 }}>
              <Ring size={64} weight={9} />
            </div>
          </div>
          <form className="ol-card ol-card--white rise stack" style={{ padding: 36, gap: 20, boxShadow: 'var(--shadow-drift)', '--i': 2 }} onSubmit={submit}>
            <Input label="Server" icon={Server} value={serverUrl} onChange={setServerUrl} placeholder="http://127.0.0.1:4000" />
            <Input
              label="Pairing code"
              icon={KeyRound}
              value={code}
              onChange={(v) => setCode(v.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              autoFocus
              hint="6 characters, valid for 10 minutes."
              inputProps={{ style: { letterSpacing: '0.3em', fontFamily: 'var(--font-mono)' } }}
            />
            <Input label="Device name" icon={Laptop} value={deviceName} onChange={setDeviceName} />
            <ErrorNote error={error} />
            <Button type="submit" size="lg" block iconRight={ArrowRight} disabled={busy || code.length !== 6 || !serverUrl}>
              {busy ? 'Pairing…' : 'Pair device'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
