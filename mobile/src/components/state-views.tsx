// The states every data screen has besides its content: loading, error, empty.
import { ActivityIndicator, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export function LoadingState() {
  return (
    <View accessibilityLabel="Loading" style={{ paddingVertical: spacing.xxxl, alignItems: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}

export function EmptyState({ icon = 'check', title, text, action }: { icon?: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl }}>
      <View style={{ width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
        <Icon name={icon} size={20} color={colors.secondaryLabel} />
      </View>
      <ThemedText variant="headline" style={{ textAlign: 'center' }}>
        {title}
      </ThemedText>
      {text && (
        <ThemedText variant="subhead" style={{ textAlign: 'center' }}>
          {text}
        </ThemedText>
      )}
      {action}
    </View>
  );
}

// Nothing could be loaded at all.
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <EmptyState icon="alert" title="This did not load" text={message} action={<Button title="Try again" onPress={onRetry} style={{ marginTop: spacing.sm }} />} />;
}

// A refresh failed but there is still earlier content on screen to show.
export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.fill }}>
      <ThemedText variant="subhead" style={{ flex: 1, color: colors.label }}>
        Could not refresh. Showing what was loaded last.
      </ThemedText>
      <Button title="Retry" size="sm" variant="ghost" onPress={onRetry} />
    </View>
  );
}
