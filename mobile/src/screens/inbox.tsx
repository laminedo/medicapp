import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useMessages } from '@/api/hooks';
import type { Message } from '@/api/types';
import { Badge } from '@/components/badge';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState, StaleNotice } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { colors, gutter, radius, spacing, useBrand } from '@/theme';
import { formatWhen, plural } from '@/utils/format';

function MessageRow({ message, first, last, onPress }: { message: Message; first: boolean; last: boolean; onPress: () => void }) {
  const brand = useBrand();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${message.unread ? 'Unread. ' : ''}${message.subject}, from ${message.sender_name}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        backgroundColor: pressed ? colors.fill : colors.surface,
        borderCurve: 'continuous',
        borderTopLeftRadius: first ? radius.lg : 0,
        borderTopRightRadius: first ? radius.lg : 0,
        borderBottomLeftRadius: last ? radius.lg : 0,
        borderBottomRightRadius: last ? radius.lg : 0,
      })}>
      <View style={{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: message.unread ? brand.accent : 'transparent' }} />
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="body" style={{ fontWeight: message.unread ? '700' : '600' }}>
          {message.subject}
        </ThemedText>
        <ThemedText variant="subhead">{[message.sender_name, formatWhen(message.created_at)].join(' · ')}</ThemedText>
        <ThemedText variant="subhead" numberOfLines={1}>
          {message.body.split('\n')[0]}
        </ThemedText>
        {(message.priority === 'important' || message.acknowledged_at || message.replies.length > 0) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs }}>
            {message.priority === 'important' && <Badge tone="danger" label="Important" />}
            {message.acknowledged_at && <Badge tone="ok" label="Acknowledged" />}
            {message.replies.length > 0 && <Badge tone="neutral" label={plural(message.replies.length, 'reply', 'replies')} />}
          </View>
        )}
      </View>
      <Icon name="chevron" size={13} color={colors.tertiaryLabel} />
    </Pressable>
  );
}

export function InboxScreen() {
  const router = useRouter();
  const messages = useMessages();
  const refresh = () => void messages.refetch();

  if (!messages.data) {
    return <Screen>{messages.error ? <ErrorState message={messages.error.message} onRetry={refresh} /> : <LoadingState />}</Screen>;
  }
  const items = messages.data;
  const unread = items.filter((m) => m.unread).length;

  return (
    // The list is the scroll container, so it is not wrapped in a ScrollView.
    <FlatList
      data={items}
      keyExtractor={(message) => String(message.id)}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: gutter, paddingBottom: spacing.xxxl }}
      refreshControl={<RefreshControl refreshing={messages.isRefetching} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
          <ThemedText variant="subhead">{unread ? plural(unread, 'unread message') : 'You have read everything'}</ThemedText>
          {messages.error && <StaleNotice onRetry={refresh} />}
        </View>
      }
      ItemSeparatorComponent={() => (
        <View style={{ backgroundColor: colors.surface }}>
          <View style={{ height: StyleSheet.hairlineWidth, marginLeft: spacing.lg, backgroundColor: colors.separator }} />
        </View>
      )}
      ListEmptyComponent={<EmptyState icon="inbox" title="No messages yet" text="Instructions from your admin will appear here." />}
      renderItem={({ item, index }) => <MessageRow message={item} first={index === 0} last={index === items.length - 1} onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: String(item.id) } })} />}
    />
  );
}
