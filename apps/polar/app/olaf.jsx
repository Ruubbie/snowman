import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text, IconButton, useTheme } from '@snowman/ui';
import { getClient } from '../src/lib/client.js';
import { tokenStore } from '../src/lib/tokenStore.js';

const SUGGESTIONS = ['How does my week look?', 'How did my last run go?', "I'm tired today, what should I do?"];

function chatError(err) {
  const code = err?.body?.error;
  if (code === 'olaf_unavailable') return "I can't think right now: the server has no AI key set.";
  if (code === 'olaf_over_budget') return "I've used this month's AI budget.";
  if (code === 'olaf_refusal') return "I'd rather not answer that one.";
  if (err?.name === 'NetworkError') return "I can't reach the server. Check your connection and try again.";
  return err?.message || 'Something went wrong.';
}

/** How long a reply takes to type out: quick for a line, never more than a few seconds for a long one. */
const TYPE_TICK_MS = 24;
const TYPE_MAX_MS = 3200;

/** Olaf's newest reply appears as if he's typing it; older ones are shown whole. */
function TypedText({ text, active, onDone, ...props }) {
  const [shown, setShown] = useState(active ? 0 : text.length);

  useEffect(() => {
    if (!active) {
      setShown(text.length);
      return undefined;
    }
    let cancelled = false;
    let t;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          setShown(text.length);
          onDone?.();
          return;
        }
        const step = Math.max(1, Math.ceil(text.length / (TYPE_MAX_MS / TYPE_TICK_MS)));
        let n = 0;
        let hold = 0;
        t = setInterval(() => {
          if (hold > 0) {
            hold -= 1;
            return;
          }
          const next = Math.min(text.length, n + step);
          // A short beat after each sentence, like someone thinking mid-reply.
          if (/[.!?]\s/.test(text.slice(n, next + 1))) hold = 7;
          n = next;
          setShown(n);
          if (n >= text.length) {
            clearInterval(t);
            onDone?.();
          }
        }, TYPE_TICK_MS);
      });
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active]);

  return (
    <Text {...props}>
      {text.slice(0, shown)}
    </Text>
  );
}

/** Three dots bouncing in turn while Olaf writes his reply. */
function TypingDots({ color }) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setBeat((b) => (b + 1) % 4), 220);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, height: 20, alignItems: 'center' }} accessibilityLabel="Olaf is typing">
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: beat === i ? 1 : 0.35, transform: [{ translateY: beat === i ? -3 : 0 }] }}
        />
      ))}
    </View>
  );
}

/** Talking with Olaf. The conversation carries on across app launches until "New chat". */
export default function Olaf() {
  const theme = useTheme();
  const c = theme.colors;
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scroller = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const id = await tokenStore.getConversationId();
        if (!id) return;
        setConversationId(id);
        const client = await getClient();
        const res = await client.olaf.conversation(id);
        setMessages(res.messages);
      } catch {
        // deleted or unreachable: start fresh
        setConversationId(null);
        tokenStore.setConversationId(null).catch(() => {});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function send(text = draft) {
    const message = text.trim();
    if (!message || sending) return;
    setDraft('');
    setError(null);
    setSending(true);
    // Sending cuts short a reply still being typed out.
    setMessages((m) => [...m.map((x) => (x.typing ? { ...x, typing: false } : x)), { role: 'user', text: message }]);
    try {
      const client = await getClient();
      const res = await client.olaf.chat({ message, conversationId });
      if (res.conversationId !== conversationId) {
        setConversationId(res.conversationId);
        tokenStore.setConversationId(res.conversationId).catch(() => {});
      }
      setMessages((m) => [...m, { role: 'olaf', text: res.reply || '…', typing: true }]);
    } catch (err) {
      setMessages((m) => m.slice(0, -1));
      setDraft(message);
      setError(chatError(err));
    } finally {
      setSending(false);
    }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setError(null);
    tokenStore.setConversationId(null).catch(() => {});
  }

  const bubble = (role) => ({
    maxWidth: '84%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    backgroundColor: role === 'user' ? c.surfaceCard : c.surfacePanel,
    borderWidth: role === 'user' ? 1 : 0,
    borderColor: c.borderHair,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surfacePage }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.borderHair }}>
          <IconButton icon="arrow-left" variant="plain" label="Back" iconSize={22} onPress={() => router.back()} />
          <Text style={{ flex: 1, textAlign: 'center', fontFamily: theme.typography.h1.fontFamily, fontWeight: '800', fontSize: 20, letterSpacing: -0.03 * 20 }}>
            olaf
          </Text>
          <IconButton icon="square-pen" variant="plain" label="New chat" iconSize={20} onPress={newChat} disabled={sending || !messages.length} />
        </View>

        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        >
          {loading ? (
            <Text muted>Loading…</Text>
          ) : messages.length === 0 ? (
            <View style={{ gap: 14 }}>
              <View style={bubble('olaf')}>
                <Text variant="body">
                  Hi! Ask me how your week looks, move a session, or tell me how you feel. I can see your plan and your runs.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => send(s)}
                    style={{ borderWidth: 1, borderColor: c.borderHair, backgroundColor: c.surfaceCard, paddingHorizontal: 12, paddingVertical: 8 }}
                  >
                    <Text variant="label">{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m, i) => (
              <View key={i} style={bubble(m.role)}>
                {m.role === 'olaf' && (
                  <Text style={{ fontFamily: theme.typography.display.fontFamily, fontWeight: '800', fontSize: 12, marginBottom: 4 }}>olaf</Text>
                )}
                {m.role === 'olaf' ? (
                  <TypedText
                    variant="body"
                    selectable
                    text={m.text}
                    active={Boolean(m.typing)}
                    onDone={() => setMessages((ms) => ms.map((x, j) => (j === i ? { ...x, typing: false } : x)))}
                  />
                ) : (
                  <Text variant="body" selectable>{m.text}</Text>
                )}
              </View>
            ))
          )}
          {sending && (
            <View style={bubble('olaf')}>
              <TypingDots color={c.textMuted} />
            </View>
          )}
          {error && <Text variant="small" color={c.danger}>{error}</Text>}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: c.borderHair, backgroundColor: c.surfaceCard }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message Olaf"
            placeholderTextColor={c.textFaint}
            multiline
            editable={!loading}
            style={{
              flex: 1,
              maxHeight: 120,
              minHeight: 44,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 12,
              borderWidth: 1,
              borderColor: c.borderHair,
              backgroundColor: c.surfacePage,
              fontFamily: theme.typography.h4.fontFamily,
              fontSize: 15,
              color: c.textStrong,
            }}
          />
          <IconButton icon="send" variant="solid" label="Send" size={44} iconSize={18} onPress={() => send()} disabled={!draft.trim() || sending} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
