import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useClock, useClockStatus, useRound } from '@/api/hooks';
import type { ClockEvent, ClockStatus, Position, Round } from '@/api/types';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Callout } from '@/components/callout';
import { GeofenceRing, positionCaption } from '@/components/geofence-ring';
import { Group, Row, Section } from '@/components/group';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState, StaleNotice } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { useNow } from '@/hooks/use-now';
import { useSession } from '@/hooks/use-session';
import { colors, radius, spacing, type, useBrand } from '@/theme';
import { durationParts, formatClock, formatDay, formatDistance, formatTime, formatWhen, greeting, plural, timeParts } from '@/utils/format';
import { LocationError, getPosition } from '@/utils/geo';

type Notice = { tone: 'ok' | 'warn' | 'danger'; title: string; text?: string; openSettings?: boolean };

const haptic = (kind: Haptics.NotificationFeedbackType) => {
  if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(kind);
};

export function ShiftScreen() {
  const { user } = useSession();
  const status = useClockStatus();
  const round = useRound();
  const refresh = () => {
    void status.refetch();
    void round.refetch();
  };

  if (!status.data) {
    return <Screen>{status.error ? <ErrorState message={status.error.message} onRetry={refresh} /> : <LoadingState />}</Screen>;
  }
  return (
    <Screen refreshing={status.isRefetching} onRefresh={refresh}>
      <ThemedText variant="subhead">{`${greeting()}, ${user?.name.split(' ')[0]} · ${formatDay(new Date())}`}</ThemedText>
      {status.error && <StaleNotice onRetry={refresh} />}
      <ClockCard status={status.data} />
      {round.data && <RoundSummary round={round.data} />}
      <ClockHistory events={status.data.recent} />
    </Screen>
  );
}

function ClockCard({ status }: { status: ClockStatus }) {
  const brand = useBrand();
  const clock = useClock();
  const now = useNow();
  // What this device last reported. Kept on screen so the ring can show it.
  const [position, setPosition] = useState<Position | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<'clock' | 'check' | null>(null);
  const { facility, clocked_in: onShift } = status;

  async function locate() {
    try {
      const reading = await getPosition();
      setPosition(reading);
      return reading;
    } catch (err) {
      const problem = err instanceof LocationError ? err : new LocationError('Your location could not be found', 'Try again in a moment.');
      setNotice({ tone: 'danger', title: problem.title, text: problem.message, openSettings: problem.canOpenSettings });
      return null;
    }
  }

  async function act(type: 'in' | 'out') {
    setNotice(null);
    setBusy('clock');
    try {
      const reading = await locate();
      if (!reading) return;
      const { event } = await clock.mutateAsync({ type, position: reading });
      haptic(Haptics.NotificationFeedbackType.Success);
      if (type === 'in') {
        setNotice({ tone: 'ok', title: 'You are clocked in.', text: `Recorded at ${formatTime(event.at)}, ${formatDistance(event.distance_m)} from the centre of the site.` });
      } else if (event.on_site) {
        setNotice({ tone: 'ok', title: 'You are clocked out.', text: `Recorded at ${formatTime(event.at)}. Thank you for today.` });
      } else {
        setNotice({ tone: 'warn', title: 'You are clocked out, off-site.', text: `Recorded at ${formatTime(event.at)}, ${formatDistance(event.distance_m)} from the site. Your admin can see this.` });
      }
    } catch (err) {
      haptic(Haptics.NotificationFeedbackType.Error);
      if (err instanceof ApiError && err.code === 'outside_geofence') {
        const { distance_m: distance, radius_m: zone, accuracy_m: accuracy } = err.data as { distance_m: number; radius_m: number; accuracy_m: number | null };
        let text = `Your device puts you ${formatDistance(distance)} from ${facility.name}. Clock-in opens within ${formatDistance(zone)}.`;
        if (accuracy && accuracy > zone) text += ` Your location is only accurate to about ${formatDistance(accuracy)}, so try again near a window or with Wi-Fi turned on.`;
        setNotice({ tone: 'danger', title: 'You must be on-site to clock in.', text });
      } else {
        setNotice({ tone: 'danger', title: err instanceof Error ? err.message : 'Something went wrong. Try again.' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setNotice(null);
    setBusy('check');
    await locate();
    setBusy(null);
  }

  const figure = onShift && status.since ? durationParts(now.getTime() - Date.parse(status.since)) : timeParts(now);

  return (
    <View style={{ gap: spacing.lg, padding: spacing.xl, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surface }}>
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: onShift ? brand.accent : brand.hairline }} />
          <ThemedText variant="subhead" style={{ fontWeight: '600', color: onShift ? brand.accent : colors.secondaryLabel }}>
            {onShift ? 'On shift' : 'Off shift'}
          </ThemedText>
        </View>
        <View accessible accessibilityLabel={figure.map(([value, unit]) => `${value} ${unit}`).join(' ')} style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          {figure.map(([value, unit]) => (
            <ThemedText key={unit + value} variant="display">
              {value}
              {/* Units are set smaller than the digits. */}
              <ThemedText style={[type.title, { color: colors.secondaryLabel }]}>{unit ? ` ${unit}` : ''}</ThemedText>
            </ThemedText>
          ))}
        </View>
        <ThemedText variant="subhead">{onShift && status.since ? `Clocked in at ${formatTime(status.since)}` : facility.name}</ThemedText>
      </View>

      <View style={{ alignItems: 'center' }}>
        <GeofenceRing facility={facility} position={position} />
      </View>
      <ThemedText variant="subhead">{positionCaption(position, facility)}</ThemedText>

      {notice && (
        <View style={{ gap: spacing.sm }}>
          <Callout tone={notice.tone} title={notice.title} text={notice.text} />
          {notice.openSettings && <Button title="Open Settings" size="sm" onPress={() => void Linking.openSettings()} />}
        </View>
      )}

      <View style={{ gap: spacing.sm }}>
        <Button
          title={onShift ? 'Clock out' : 'Clock in'}
          variant={onShift ? 'secondary' : 'primary'}
          size="lg"
          icon="pin"
          loading={busy === 'clock'}
          disabled={busy === 'check'}
          onPress={() => void act(onShift ? 'out' : 'in')}
        />
        <Button title="Check my location" variant="ghost" icon="locate" loading={busy === 'check'} disabled={busy === 'clock'} onPress={() => void check()} />
      </View>
    </View>
  );
}

function RoundSummary({ round }: { round: Round }) {
  const router = useRouter();
  const open = () => router.navigate('/meds');
  const late = round.tasks.filter((t) => t.status === 'overdue' || t.status === 'missed');
  const due = round.tasks.filter((t) => t.status === 'due');
  const next = round.tasks.find((t) => t.status === 'upcoming');
  const names = (tasks: typeof late) => [...new Set(tasks.map((t) => t.patient_name))].join(', ');

  return (
    <Section title="Medication round">
      <Group>
        {late.length > 0 && <Row title={plural(late.length, 'late dose')} subtitle={names(late)} trailing={<Badge tone="danger" label="Late" />} onPress={open} />}
        {due.length > 0 && <Row title={`${plural(due.length, 'dose')} due now`} subtitle={names(due)} trailing={<Badge tone="warn" label="Due" />} onPress={open} />}
        {next && <Row title={`Next at ${formatClock(next.time)}`} subtitle={`${next.med_name} for ${next.patient_name}`} onPress={open} />}
        {late.length + due.length === 0 && !next && <Row title="All doses for today are recorded" subtitle="Nothing is waiting on this round." onPress={open} />}
      </Group>
    </Section>
  );
}

function eventTitle(event: ClockEvent) {
  if (event.status === 'blocked') return 'Clock-in blocked';
  if (event.forced_by_name) return `Clocked out by ${event.forced_by_name}`;
  return event.type === 'in' ? 'Clocked in' : 'Clocked out';
}

function ClockHistory({ events }: { events: ClockEvent[] }) {
  return (
    <Section title="Your clock history">
      {events.length === 0 ? (
        <EmptyState icon="clock" title="No clock events yet" text="Your clock-ins and clock-outs will be listed here." />
      ) : (
        <Group>
          {events.slice(0, 6).map((event) => (
            <Row
              key={event.id}
              title={eventTitle(event)}
              subtitle={`${formatWhen(event.at)} · ${event.forced_by_name ? 'Entered by an admin' : `${formatDistance(event.distance_m)} from site`}`}
              trailing={
                event.status === 'blocked' ? (
                  <Badge tone="danger" label="Blocked" />
                ) : event.forced_by_name ? (
                  <Badge tone="neutral" label="By admin" />
                ) : event.on_site ? (
                  <Badge tone="ok" label="On-site" />
                ) : (
                  <Badge tone="warn" label="Off-site" />
                )
              }
            />
          ))}
        </Group>
      )}
    </Section>
  );
}
