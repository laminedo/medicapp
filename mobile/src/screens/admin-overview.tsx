import { View } from 'react-native';

import { useDashboard } from '@/api/hooks';
import { Badge } from '@/components/badge';
import { Group, Row, Section } from '@/components/group';
import { RoundMeter } from '@/components/round-meter';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState, StaleNotice } from '@/components/state-views';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { colors, radius, spacing } from '@/theme';
import { formatDay, formatDistance, formatTime, formatWhen } from '@/utils/format';

// A read-only view of the day for admins on the move. Managing patients,
// staff, messages and settings stays in the web app.
export function AdminOverviewScreen() {
  const dashboard = useDashboard();
  const refresh = () => void dashboard.refetch();

  if (!dashboard.data) {
    return <Screen>{dashboard.error ? <ErrorState message={dashboard.error.message} onRetry={refresh} /> : <LoadingState />}</Screen>;
  }
  const { facility, counts, attention, staff, recent_clock: recent, today } = dashboard.data;
  const onShift = staff.filter((s) => s.clocked_in).length;

  return (
    <Screen refreshing={dashboard.isRefetching} onRefresh={refresh}>
      <ThemedText variant="subhead">{`${facility.name} · ${formatDay(new Date())}`}</ThemedText>
      {dashboard.error && <StaleNotice onRetry={refresh} />}

      <Section title="Medication round today">
        <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surface }}>
          <RoundMeter counts={counts} />
        </View>
      </Section>

      <Section title="Needs attention" trailing={attention.length > 0 ? <Badge tone="danger" label={`${attention.length} late`} /> : undefined}>
        {attention.length === 0 ? (
          <EmptyState title="Nothing is late" text="Every dose that has come due so far has been recorded." />
        ) : (
          <Group>
            {attention.map((task) => (
              <TaskRow key={task.key} task={task} today={today} />
            ))}
          </Group>
        )}
      </Section>

      <Section title="Staff" trailing={<ThemedText variant="footnote">{`${onShift} of ${staff.length} on shift`}</ThemedText>}>
        <Group>
          {staff.map((person) => (
            <Row
              key={person.id}
              title={person.name}
              subtitle={person.job_title}
              trailing={person.clocked_in && person.since ? <Badge tone="ok" label={`In since ${formatTime(person.since)}`} /> : <Badge tone="neutral" label="Off shift" />}
            />
          ))}
        </Group>
      </Section>

      <Section title="Recent clock activity">
        <Group>
          {recent.map((event) => (
            <Row
              key={event.id}
              title={`${event.user_name} ${event.status === 'blocked' ? 'was blocked' : event.forced_by_name ? `was clocked out by ${event.forced_by_name}` : event.type === 'in' ? 'clocked in' : 'clocked out'}`}
              subtitle={`${formatWhen(event.at)} · ${event.forced_by_name ? 'Entered by an admin' : `${formatDistance(event.distance_m)} from site`}`}
            />
          ))}
        </Group>
      </Section>

      <ThemedText variant="footnote" style={{ textAlign: 'center' }}>
        To manage patients, staff, messages and settings, use the web app.
      </ThemedText>
    </Screen>
  );
}
