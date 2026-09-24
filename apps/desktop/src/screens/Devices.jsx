import { KeyRound, Laptop, Smartphone } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { useLoad } from '../lib/hooks.js';
import { errorMessage } from '../lib/api.js';
import { fmtAgo, fmtDateTime, plural } from '../lib/format.js';
import { Badge, Button, Empty, ErrorNote, Icon, Loading, Page } from '../components/ui.jsx';
import { useOverlay } from '../components/overlay.jsx';

function iconFor(name = '') {
  return /phone|iphone|polar/i.test(name) ? Smartphone : Laptop;
}

export function Devices() {
  const { client } = useApp();
  const { toast, confirm } = useOverlay();
  const { data, error, loading, reload, setData } = useLoad(() => client.admin.devices(), [client]);

  async function revoke(d) {
    const ok = await confirm({
      title: 'Revoke this device?',
      body: 'Its token stops working immediately. To use it again, pair it with a new code.',
      what: `${d.name} — paired ${fmtDateTime(d.createdAt)}`,
      confirmLabel: 'Revoke',
      icon: null,
    });
    if (!ok) return;
    const before = data;
    setData((x) => ({ devices: x.devices.map((y) => (y.id === d.id ? { ...y, revokedAt: new Date().toISOString() } : y)) }));
    try {
      await client.admin.revokeDevice(d.id);
      toast({ tone: 'success', title: 'Device revoked', body: d.name });
    } catch (err) {
      setData(before);
      toast({ tone: 'danger', title: 'Could not revoke', body: errorMessage(err) });
    }
  }

  return (
    <Page eyebrow="Olaf · Devices" title="Paired devices" ghost="Keys" sub="Everything that can talk to me. Revoke anything you no longer use.">
      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && !data.devices.length && <Empty>No devices.</Empty>}
      <div className="list">
        {data?.devices.map((d, i) => (
          <div key={d.id} className="list-row rise" style={{ '--i': i, opacity: d.revokedAt ? 0.55 : 1, transition: 'opacity var(--dur-slow) var(--ease-out)' }}>
            <Icon icon={iconFor(d.name)} size={22} />
            <div className="list-row__main">
              <div className="row" style={{ gap: 8 }}>
                <span className="list-row__title">{d.name}</span>
                {d.current && <Badge tone="accent">This device</Badge>}
                {d.revokedAt && <Badge tone="danger">Revoked</Badge>}
              </div>
              <div className="list-row__meta">
                <span>Paired {fmtDateTime(d.createdAt)}</span>
                {d.revokedAt && <span>revoked {fmtAgo(d.revokedAt)}</span>}
                <span>{plural(d.conversationCount, 'conversation')}</span>
                <span className="hide-narrow">{d.id}</span>
              </div>
            </div>
            {!d.revokedAt && !d.current && (
              <Button variant="outline" size="sm" iconLeft={KeyRound} onClick={() => revoke(d)}>
                Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </Page>
  );
}
