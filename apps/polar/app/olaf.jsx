import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
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
    setMessages((m) => [...m, { role: 'user', text: message }]);
    try {
      const client = await getClient();
      const res = await client.olaf.chat({ message, conversationId });
      if (res.conversationId !== conversationId) {
        setConversationId(res.conversationId);
        tokenStore.setConversationId(res.conversationId).catch(() => {});
      }
      setMessages((m) => [...m, { role: 'olaf', text: res.reply || '…' }]);
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
                <Text variant="body" selectable>{m.text}</Text>
              </View>
            ))
          )}
          {sending && (
            <View style={bubble('olaf')}>
              <Text variant="body" muted>Thinking…</Text>
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
