import { View } from 'react-native';

import type { Prn, Task } from '@/api/types';
import { colors, spacing, useBrand } from '@/theme';
import { formatAgo, formatClock, formatMinutes, formatTime } from '@/utils/format';
import { Badge, LATE_GIVEN_MIN, TaskBadge } from './badge';
import { Button } from './button';
import { ThemedText } from './themed-text';

const VERB = { given: 'Given', refused: 'Refused', held: 'Held' } as const;
const isClosed = (task: Task): task is Task & { status: keyof typeof VERB } => task.status in VERB;

function recordLine(task: Task & { status: keyof typeof VERB }) {
  const who = `${task.recorded_by_name} at ${formatTime(task.recorded_at!)}`;
  if (task.status !== 'given') return `${VERB[task.status]}. Recorded by ${who}`;
  return (task.late_min ?? 0) > LATE_GIVEN_MIN ? `Given by ${who}, ${formatMinutes(task.late_min!)} late` : `Given by ${who}`;
}

function Frame({ time, sub, late, children, action }: { time: string; sub?: string; late?: boolean; children: React.ReactNode; action: React.ReactNode }) {
  const brand = useBrand();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg }}>
      <View style={{ width: 70 }}>
        <ThemedText variant="headline" style={{ fontVariant: ['tabular-nums'], color: late ? brand.danger : colors.label }}>
          {time}
        </ThemedText>
        {sub && <ThemedText variant="footnote">{sub}</ThemedText>}
      </View>
      <View style={{ flex: 1, gap: spacing.sm }}>
        <View style={{ gap: 2 }}>{children}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>{action}</View>
      </View>
    </View>
  );
}

// One scheduled dose. Shows a Give button while it can still be recorded.
export function TaskRow({ task, today, onRecord }: { task: Task; today?: string; onRecord?: (task: Task) => void }) {
  const closed = isClosed(task);
  return (
    <Frame
      time={formatClock(task.time)}
      sub={today && task.date !== today ? 'Yesterday' : undefined}
      late={task.status === 'overdue' || task.status === 'missed'}
      action={
        <>
          <TaskBadge task={task} />
          {onRecord && task.can_record && <Button title="Give" variant="primary" size="sm" icon="check" onPress={() => onRecord(task)} />}
        </>
      }>
      <ThemedText variant="headline">{task.patient_name}</ThemedText>
      <ThemedText variant="subhead">{`Room ${task.room} · ${task.med_name}, ${task.dosage}`}</ThemedText>
      {!closed && Boolean(task.instructions) && <ThemedText variant="footnote">{task.instructions}</ThemedText>}
      {closed && <ThemedText variant="footnote">{recordLine(task)}</ThemedText>}
      {closed && Boolean(task.note) && <ThemedText variant="footnote" style={{ fontStyle: 'italic' }}>{`${task.status === 'given' ? 'Note' : 'Reason'}: ${task.note}`}</ThemedText>}
    </Frame>
  );
}

export function prnLimits(prn: Prn) {
  return [prn.min_hours && `at least ${prn.min_hours} h apart`, prn.max_daily && `up to ${prn.max_daily} in 24 h`].filter(Boolean).join(', ');
}

export function prnWarning(prn: Prn) {
  if (prn.daily_limit_reached) return `Already given ${prn.given_last_24h} times in the last 24 hours, which is the limit.`;
  if (prn.too_soon && prn.next_allowed_at) return `Too soon. The next dose is allowed from ${formatTime(prn.next_allowed_at)}.`;
  return null;
}

// One as-needed medication, with where it stands against its own limits.
export function PrnRow({ prn, onGive }: { prn: Prn; onGive: (prn: Prn) => void }) {
  const limits = prnLimits(prn);
  const warning = prnWarning(prn);
  return (
    <Frame
      time="PRN"
      sub="As needed"
      action={
        <>
          {warning ? <Badge tone={prn.daily_limit_reached ? 'danger' : 'warn'} label={prn.daily_limit_reached ? 'Limit reached' : 'Too soon'} /> : <View />}
          <Button title="Give" variant={warning ? 'secondary' : 'primary'} size="sm" icon="check" onPress={() => onGive(prn)} />
        </>
      }>
      <ThemedText variant="headline">{prn.patient_name}</ThemedText>
      <ThemedText variant="subhead">{`Room ${prn.room} · ${prn.med_name}, ${prn.dosage}`}</ThemedText>
      <ThemedText variant="footnote">{[prn.instructions, limits && `${limits[0].toUpperCase()}${limits.slice(1)}.`].filter(Boolean).join(' ')}</ThemedText>
      <ThemedText variant="footnote">{prn.last_given_at ? `Last given ${formatAgo(prn.last_given_at)} by ${prn.last_given_by_name}` : 'Not given in the last 24 hours'}</ThemedText>
    </Frame>
  );
}
