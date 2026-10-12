import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useRound } from '@/api/hooks';
import type { Prn, Task } from '@/api/types';
import { Group, Section } from '@/components/group';
import { RoundMeter } from '@/components/round-meter';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState, StaleNotice } from '@/components/state-views';
import { PrnRow, TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { colors, radius, spacing } from '@/theme';
import { formatClock, formatDay } from '@/utils/format';

const CLOSED = ['given', 'refused', 'held'];

export function MedsScreen() {
  const router = useRouter();
  const round = useRound();
  const refresh = () => void round.refetch();

  if (!round.data) {
    return <Screen>{round.error ? <ErrorState message={round.error.message} onRetry={refresh} /> : <LoadingState />}</Screen>;
  }

  const { tasks, counts, today, prn } = round.data;
  const late = tasks.filter((t) => t.status === 'overdue' || t.status === 'missed');
  const due = tasks.filter((t) => t.status === 'due');
  const later = tasks.filter((t) => t.status === 'upcoming');
  const done = tasks.filter((t) => CLOSED.includes(t.status));

  // Each dose opens in a sheet. The sheet finds it again by key, so it always
  // works from the freshest copy of the round.
  const record = (task: Task) => router.push({ pathname: '/record-dose', params: { key: task.key } });
  const givePrn = (item: Prn) => router.push({ pathname: '/prn-dose', params: { id: String(item.medication_id) } });
  const list = (items: Task[]) => (
    <Group>
      {items.map((task) => (
        <TaskRow key={task.key} task={task} today={today} onRecord={record} />
      ))}
    </Group>
  );

  return (
    <Screen refreshing={round.isRefetching} onRefresh={refresh}>
      <ThemedText variant="subhead">{formatDay(new Date())}</ThemedText>
      {round.error && <StaleNotice onRetry={refresh} />}
      <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surface }}>
        <RoundMeter counts={counts} />
      </View>

      {tasks.length === 0 && prn.length === 0 && <EmptyState icon="pill" title="No medication is scheduled today" text="When an admin adds a schedule, the doses appear here." />}
      {late.length > 0 && <Section title="Needs attention">{list(late)}</Section>}
      {due.length > 0 && <Section title="Due now">{list(due)}</Section>}
      {tasks.length > 0 && late.length + due.length === 0 && (
        <EmptyState title="Nothing to give right now" text={later.length ? `The next dose is at ${formatClock(later[0].time)}.` : 'Every dose for today has been recorded.'} />
      )}
      {prn.length > 0 && (
        <Section title="As needed">
          <Group>
            {prn.map((item) => (
              <PrnRow key={item.medication_id} prn={item} onGive={givePrn} />
            ))}
          </Group>
        </Section>
      )}
      {later.length > 0 && <Section title="Later today">{list(later)}</Section>}
      {done.length > 0 && <Section title="Recorded">{list(done)}</Section>}
    </Screen>
  );
}
