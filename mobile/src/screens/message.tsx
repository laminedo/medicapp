import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useAcknowledge, useMarkRead, useMessages, useReply } from '@/api/hooks';
import type { Reply } from '@/api/types';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Callout } from '@/components/callout';
import { EmptyState, LoadingState } from '@/components/state-views';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { colors, gutter, radius, spacing, useBrand } from '@/theme';
import { formatWhen } from '@/utils/format';

// The staff member's own replies sit on the right, in the accent wash.
function Bubble({ reply }: { reply: Reply }) {
  const brand = useBrand();
  return (
    <View
      style={{
        alignSelf: reply.from_staff ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
        gap: 2,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: reply.from_staff ? brand.accentWash : colors.fill,
      }}>
      <ThemedText variant="subhead" selectable style={{ color: colors.label }}>
        {reply.body}
      </ThemedText>
      <ThemedText variant="footnote">{`${reply.from_staff ? 'You' : reply.author_name} · ${formatWhen(reply.created_at)}`}</ThemedText>
    </View>
  );
}

export function MessageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const messages = useMessages();
  const markRead = useMarkRead();
  const acknowledge = useAcknowledge();
  const reply = useReply();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const message = messages.data?.find((m) => String(m.id) === id);

  // Opening a message marks it, and any admin answers in its thread, as read.
  const { mutate: read } = markRead;
  const unread = message?.unread ?? false;
  const messageId = message?.id;
  useEffect(() => {
    if (messageId != null && unread) read(messageId);
  }, [messageId, unread, read]);

  if (!message) {
    return <View style={{ flex: 1, backgroundColor: colors.background }}>{messages.data ? <EmptyState icon="inbox" title="This message is no longer in your inbox" /> : <LoadingState />}</View>;
  }

  async function send() {
    if (!message || reply.isPending || !draft.trim()) return;
    setError(null);
    try {
      await reply.mutateAsync({ id: message.id, body: draft });
      setDraft(''); // cleared only once it has been sent
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your reply was not sent. Try again.');
    }
  }

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      bottomOffset={spacing.xl}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: gutter, gap: spacing.lg, paddingBottom: spacing.xxxl }}>
      <View style={{ gap: spacing.sm }}>
        {message.priority === 'important' && <Badge tone="danger" label="Important" />}
        <ThemedText variant="title">{message.subject}</ThemedText>
        <ThemedText variant="subhead">{`${[message.sender_name, message.sender_title].filter(Boolean).join(', ')} · ${formatWhen(message.created_at)}`}</ThemedText>
      </View>

      <View style={{ gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surface }}>
        {message.body.split(/\n{2,}/).map((paragraph, index) => (
          <ThemedText key={index} variant="body" selectable>
            {paragraph}
          </ThemedText>
        ))}
      </View>

      {message.acknowledged_at ? (
        <Callout tone="ok" title={`You acknowledged this ${formatWhen(message.acknowledged_at)}.`} />
      ) : (
        <Button title="Acknowledge" variant="primary" icon="check" loading={acknowledge.isPending} onPress={() => acknowledge.mutate(message.id)} />
      )}
      {acknowledge.error && <Callout tone="danger" title={acknowledge.error.message} />}

      {message.replies.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          {message.replies.map((item) => (
            <Bubble key={item.id} reply={item} />
          ))}
        </View>
      )}

      <View style={{ gap: spacing.sm }}>
        <TextField label={`Reply to ${message.sender_name.split(' ')[0]}`} multiline maxLength={2000} value={draft} onChangeText={setDraft} placeholder="Write a reply" />
        {error && <Callout tone="danger" title={error} />}
        <Button title="Send reply" icon="send" loading={reply.isPending} disabled={!draft.trim()} onPress={() => void send()} />
      </View>
    </KeyboardAwareScrollView>
  );
}
