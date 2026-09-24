import { Mic, Send } from 'lucide-react';
import { Card, IconButton, Page, Ring } from '../components/ui.jsx';

/** Placeholder: chat with Olaf from the desktop (and the hotkey overlay) comes later. */
export function Talk() {
  return (
    <Page eyebrow="Olaf · Talk" title="Talk to me" ghost="Hi" sub="Soon you can talk to me here, and from a small overlay on any screen with a hotkey and your voice.">
      <Card tone="white" i={1} style={{ maxWidth: 640 }}>
        <div className="row" style={{ gap: 20, marginBottom: 24 }}>
          <Ring size={48} weight={7} />
          <p className="small" style={{ margin: 0 }}>
            <span className="olaf-says__name">olaf</span> — I’m not listening here yet. For now, talk to me from the phone; those conversations show up under Conversations.
          </p>
        </div>
        <div className="row">
          <div className="ol-inputwrap ol-inputwrap--disabled" style={{ flex: 1 }}>
            <input className="ol-input" placeholder="Message Olaf" disabled />
          </div>
          <IconButton icon={Mic} variant="outline" label="Voice (coming later)" disabled />
          <IconButton icon={Send} variant="dark" label="Send (coming later)" disabled />
        </div>
      </Card>
    </Page>
  );
}
