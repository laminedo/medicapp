import { View } from 'react-native';

import type { Task } from '@/api/types';
import { colors, radius, spacing, type, useBrand, type Brand } from '@/theme';
import { ThemedText } from './themed-text';

export type Tone = 'ok' | 'warn' | 'danger' | 'alert' | 'neutral';

function paint(tone: Tone, brand: Brand) {
  if (tone === 'ok') return { background: brand.accentWash, foreground: brand.accent };
  if (tone === 'warn') return { background: brand.warnWash, foreground: brand.warn };
  if (tone === 'danger') return { background: brand.dangerWash, foreground: brand.danger };
  if (tone === 'alert') return { background: brand.dangerSolid, foreground: brand.onDanger };
  return { background: colors.fill, foreground: colors.secondaryLabel };
}

// A status label: always words, with a dot. Never colour alone.
export function Badge({ tone, label }: { tone: Tone; label: string }) {
  const { background, foreground } = paint(tone, useBrand());
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        height: 24,
        paddingHorizontal: spacing.sm,
        borderRadius: 6,
        backgroundColor: background,
      }}>
      <View style={{ width: 6, height: 6, borderRadius: radius.full, backgroundColor: foreground }} />
      <ThemedText style={[type.caption, { color: foreground }]}>{label}</ThemedText>
    </View>
  );
}

const TASK_BADGE: Record<Task['status'], [Tone, string]> = {
  given: ['ok', 'Given'],
  refused: ['warn', 'Refused'],
  held: ['neutral', 'Held'],
  due: ['warn', 'Due now'],
  overdue: ['danger', 'Overdue'],
  missed: ['alert', 'Missed'],
  upcoming: ['neutral', 'Later'],
};

export const LATE_GIVEN_MIN = 30;

export function TaskBadge({ task }: { task: Pick<Task, 'status' | 'late_min'> }) {
  if (task.status === 'given' && (task.late_min ?? 0) > LATE_GIVEN_MIN) return <Badge tone="warn" label="Given late" />;
  const [tone, label] = TASK_BADGE[task.status];
  return <Badge tone={tone} label={label} />;
}
