import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import {
  ThemeProvider, useTheme, Screen, Stack, Row, Text, Card, Button, IconButton, Input, Select,
  Checkbox, Radio, Switch, Tabs, DashPager, Badge, Tag, Metric, Dialog, Toast, Tooltip, Icon,
  GhostWord, Ring, SplitFrame, ListRow, PulseDot, EmptyState, SegmentTimeline, PaceChart, SplitBars,
} from '@snowman/ui';
import { PolarHeader } from '../../src/components/PolarHeader.jsx';

const DEMO_SEGMENTS = [
  { kind: 'warmup', seconds: 300 },
  { kind: 'run', seconds: 600 },
  { kind: 'walk', seconds: 60 },
  { kind: 'run', seconds: 600 },
  { kind: 'cooldown', seconds: 180 },
];

function Section({ title, children }) {
  const theme = useTheme();
  return (
    <Stack gap={theme.spacing.sm} style={{ marginTop: 28 }}>
      <Text variant="eyebrow" muted>{title}</Text>
      {children}
    </Stack>
  );
}

function Swatch({ name, color }) {
  return (
    <Stack gap={4} align="center">
      <View style={{ width: 44, height: 44, backgroundColor: color, borderWidth: 1, borderColor: '#00000010' }} />
      <Text variant="caption" muted>{name}</Text>
    </Stack>
  );
}

function Gallery() {
  const theme = useTheme();
  const c = theme.colors;
  const [toastVisible, setToastVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checked, setChecked] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [radioVal, setRadioVal] = useState('a');
  const [tab, setTab] = useState('Splits');
  const [pill, setPill] = useState('Week');
  const [dashIndex, setDashIndex] = useState(1);
  const [selectVal, setSelectVal] = useState('easy');

  return (
    <Screen contentStyle={{ flexGrow: 1 }} staggerChildren={false}>
      <View style={{ padding: 24, paddingTop: 14, gap: 8 }}>
        <PolarHeader icon="x" label="Close" onPress={() => router.back()} />
        <Text style={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: '800', fontSize: 32, marginTop: 20 }}>
          Design gallery
        </Text>
        <Text variant="small" muted>Every olaf-ds component and foundation, ported 1:1.</Text>

        <Section title="Colour">
          <Row gap={12} wrap>
            <Swatch name="snow-50" color={c.snow[50]} />
            <Swatch name="snow-100" color={c.snow[100]} />
            <Swatch name="snow-200" color={c.snow[200]} />
            <Swatch name="frost-500" color={c.frost[500]} />
            <Swatch name="ink-800" color={c.ink[800]} />
            <Swatch name="carrot-500" color={c.carrot[500]} />
            <Swatch name="ice-500" color={c.ice[500]} />
            <Swatch name="success" color={c.success} />
            <Swatch name="warning" color={c.warning} />
            <Swatch name="danger" color={c.danger} />
          </Row>
        </Section>

        <Section title="Type">
          <Text variant="displayXl">Display XL</Text>
          <Text variant="display">Display</Text>
          <Text variant="h1">Heading 1</Text>
          <Text variant="h2">Heading 2</Text>
          <Text variant="h3">Heading 3</Text>
          <Text variant="bodyLg">Body large — the quick brown fox.</Text>
          <Text variant="body">Body — the quick brown fox jumps.</Text>
          <Text variant="small" muted>Small muted text.</Text>
          <Text variant="eyebrow" color={c.accent}>Eyebrow kicker</Text>
          <Text variant="data">05:12 DM Mono data</Text>
        </Section>

        <Section title="Spacing & shadows">
          <Row gap={theme.spacing.sm} wrap>
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <View key={k} style={{ width: theme.spacing[k], height: 16, backgroundColor: c.accent }} />
            ))}
          </Row>
          <Row gap={20} wrap>
            <View style={{ width: 60, height: 60, backgroundColor: c.surfaceCard, ...theme.elevation.hair }} />
            <View style={{ width: 60, height: 60, backgroundColor: c.surfaceCard, ...theme.elevation.soft }} />
            <View style={{ width: 60, height: 60, backgroundColor: c.surfaceCard, ...theme.elevation.float }} />
            <View style={{ width: 60, height: 60, backgroundColor: c.surfaceCard, ...theme.elevation.drift }} />
          </Row>
        </Section>

        <Section title="Motion">
          <Text variant="small" muted>ease-out 140/240/480ms + 900ms ring drift. See Ring, DashPager, Tabs below.</Text>
        </Section>

        <Section title="Buttons">
          <Row gap={12} wrap>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </Row>
        </Section>

        <Section title="IconButton">
          <Row gap={12}>
            <IconButton icon="bell" variant="plain" label="Plain" />
            <IconButton icon="play" variant="solid" label="Solid" />
            <IconButton icon="lock" variant="outline" label="Outline" />
            <IconButton icon="settings" variant="dark" label="Dark" />
          </Row>
        </Section>

        <Section title="Input / Select">
          <Input label="Note" placeholder="How did it feel?" />
          <Select label="Kind" value={selectVal} onChange={setSelectVal} options={['easy', 'tempo', 'long']} />
        </Section>

        <Section title="Checkbox / Radio / Switch">
          <Row gap={20}>
            <Checkbox checked={checked} onChange={setChecked}>Checkbox</Checkbox>
            <Radio selected={radioVal === 'a'} onPress={() => setRadioVal('a')}>Radio A</Radio>
            <Switch checked={switchOn} onChange={setSwitchOn}>Switch</Switch>
          </Row>
        </Section>

        <Section title="Tabs (line / pill)">
          <Tabs items={['Splits', 'Pace', 'Map']} value={tab} onChange={setTab} />
          <Tabs variant="pill" items={['Week', 'Month', 'Year']} value={pill} onChange={setPill} />
        </Section>

        <Section title="DashPager">
          <DashPager count={5} index={dashIndex} onChange={setDashIndex} />
        </Section>

        <Section title="Badge / Tag">
          <Row gap={8} wrap>
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="info">Info</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="solid">Solid</Badge>
          </Row>
          <Row gap={8} wrap>
            <Tag selected>Selected</Tag>
            <Tag>Unselected</Tag>
            <Tag onRemove={() => {}}>Removable</Tag>
          </Row>
        </Section>

        <Section title="Metric">
          <Row gap={30}>
            <Metric label="Distance" value="8.1" unit="km" delta="+3.2 km vs last" deltaTone="up" size={40} />
            <Metric label="Pace" value="5:26" unit="/km" size={40} />
          </Row>
        </Section>

        <Section title="Card">
          <Card tone="white" eyebrow="Eyebrow" title="White card">
            <Text variant="small" muted>shadow-soft, no border.</Text>
          </Card>
          <Card tone="tint"><Text variant="small">Tint block.</Text></Card>
          <Card tone="outline"><Text variant="small">Outline card.</Text></Card>
          <Card tone="ink"><Text variant="small" color={c.snow[0]}>Ink card.</Text></Card>
        </Section>

        <Section title="Ring">
          <Row gap={20}>
            <Ring size={90} weight={10} />
            <Ring size={90} weight={10} progress={0.65}>
              <Text variant="h4">65%</Text>
            </Ring>
          </Row>
        </Section>

        <Section title="GhostWord + SplitFrame">
          <View style={{ height: 140, position: 'relative', overflow: 'hidden' }}>
            <SplitFrame panelWidth="50%" panelHeight={140}>
              <GhostWord size={90} style={{ position: 'absolute', top: 10, right: -10 }}>Run</GhostWord>
              <Text style={{ padding: 20 }} variant="h3">Split frame</Text>
            </SplitFrame>
          </View>
        </Section>

        <Section title="SegmentTimeline">
          <SegmentTimeline segments={DEMO_SEGMENTS} currentIndex={2} orientation="horizontal" />
        </Section>

        <Section title="ListRow / EmptyState / PulseDot">
          <Card tone="outline">
            <ListRow title="Monday" subtitle="5km easy run" />
            <ListRow title="Tuesday" subtitle="Rest day" />
          </Card>
          <Row gap={12}><PulseDot /><Text variant="small" muted>recording</Text></Row>
          <EmptyState title="Nothing here" subtitle="This is what an empty list looks like." />
        </Section>

        <Section title="PaceChart / SplitBars">
          <PaceChart samples={[340, 335, 330, 328, 325, 322, 330, 333]} targetMin={320} targetMax={335} />
          <SplitBars splits={[330, 328, 340, 322]} />
        </Section>

        <Section title="Dialog / Toast / Tooltip">
          <Row gap={12} wrap>
            <Button variant="secondary" onPress={() => setDialogOpen(true)}>Open dialog</Button>
            <Button variant="secondary" onPress={() => setToastVisible(true)}>Show toast</Button>
          </Row>
          <Toast visible={toastVisible} tone="accent" title="olaf" onHide={() => setToastVisible(false)}>
            Nice pace on that last kilometre.
          </Toast>
          <View style={{ position: 'relative', height: 40 }}>
            <Tooltip visible>Tooltip text</Tooltip>
          </View>
        </Section>

        <Dialog
          open={dialogOpen}
          title="End run?"
          onClose={() => setDialogOpen(false)}
          actions={
            <>
              <Button size="sm" variant="outline" onPress={() => setDialogOpen(false)}>Keep going</Button>
              <Button size="sm" onPress={() => setDialogOpen(false)}>End run</Button>
            </>
          }
        >
          5.03 km in 28:10 will be saved.
        </Dialog>
      </View>
    </Screen>
  );
}

export default function DesignGallery() {
  return (
    <ThemeProvider>
      <Gallery />
    </ThemeProvider>
  );
}
