import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { ApiError } from '@/api/client';
import { useRecordDose, useRound } from '@/api/hooks';
import type { Outcome } from '@/api/types';
import { Button } from '@/components/button';
import { Callout } from '@/components/callout';
import { Segmented } from '@/components/segmented';
import { EmptyState } from '@/components/state-views';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/hooks/use-session';
import { gutter, spacing } from '@/theme';
import { formatClock, formatMinutes } from '@/utils/format';

const OUTCOMES: Record<Outcome, { label: string; confirm: string; noteLabel: string; placeholder: string }> = {
  given: { label: 'Given', confirm: 'Confirm given', noteLabel: 'Note', placeholder: 'Anything the next shift should know' },
  refused: { label: 'Refused', confirm: 'Record as refused', noteLabel: 'Reason refused', placeholder: 'What the resident said or did' },
  held: { label: 'Held', confirm: 'Record as held', noteLabel: 'Reason held', placeholder: 'For example: low blood pressure, nil by mouth' },
};

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText variant="footnote">{label}</ThemedText>
      <ThemedText variant="body" selectable style={{ fontWeight: '600' }}>
        {value}
      </ThemedText>
    </View>
  );
}

// The sheet for one scheduled dose: given, refused or held.
export function RecordDoseScreen() {
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { user } = useSession();
  const round = useRound();
  const record = useRecordDose();
  const [outcome, setOutcome] = useState<Outcome>('given');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const task = round.data?.tasks.find((t) => t.key === key);
  if (!task || !task.can_record) {
    return (
      <View style={{ padding: gutter }}>
        <EmptyState title="This dose is already recorded" text="Someone may have recorded it while this was open." action={<Button title="Close" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />} />
      </View>
    );
  }

  const minutesLate = (Date.now() - Date.parse(task.scheduled_at)) / 60000;
  const timing = minutesLate > 5 ? `${formatMinutes(minutesLate)} late` : minutesLate < -5 ? `${formatMinutes(minutesLate)} early` : 'on time';
  const choice = OUTCOMES[outcome];
  const veryLate = outcome === 'given' && task.note_required;
  const noteNeeded = outcome !== 'given' || task.note_required;

  async function submit() {
    if (!task || record.isPending) return;
    setError(null);
    if (noteNeeded && !note.trim()) {
      setError(outcome === 'given' ? 'Add a note explaining why this dose is late.' : `Add the reason this dose was ${outcome}.`);
      return;
    }
    try {
      await record.mutateAsync({ task, outcome, note });
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      // Keep the draft on screen so nothing typed is lost, and say what happened.
      if (err instanceof ApiError && err.code === 'already_recorded') router.back();
      else setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={spacing.xl} contentContainerStyle={{ padding: gutter, gap: spacing.lg }}>
      <View style={{ gap: 2 }}>
        <ThemedText variant="title">{`${task.med_name}, ${task.dosage}`}</ThemedText>
        <ThemedText variant="subhead">{`${task.patient_name} · Room ${task.room}`}</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Fact label="Scheduled" value={`${formatClock(task.time)}, ${timing}`} />
        <Fact label="Recorded by" value={user?.name ?? ''} />
      </View>
      {Boolean(task.instructions) && <Callout tone="neutral" title="Instructions" text={task.instructions} />}
      {Boolean(task.patient_notes) && <Callout tone="warn" title="Care notes" text={task.patient_notes} />}

      <View style={{ gap: 6 }}>
        <ThemedText variant="footnote" style={{ fontWeight: '600' }}>
          What happened
        </ThemedText>
        <Segmented options={(Object.keys(OUTCOMES) as Outcome[]).map((value) => ({ value, label: OUTCOMES[value].label }))} value={outcome} onChange={setOutcome} />
      </View>
      <TextField
        label={choice.noteLabel}
        optional={!noteNeeded}
        multiline
        maxLength={500}
        value={note}
        onChangeText={setNote}
        placeholder={veryLate ? 'Why is this dose late?' : choice.placeholder}
        hint={veryLate ? 'Required, because this dose is more than 2 hours late.' : outcome !== 'given' ? 'Required. Your admin sees this in the medication report.' : undefined}
      />
      {error && <Callout tone="danger" title={error} />}
      <View style={{ gap: spacing.sm }}>
        <Button title={choice.confirm} variant="primary" size="lg" icon="check" loading={record.isPending} onPress={() => void submit()} />
        <Button title="Cancel" variant="ghost" disabled={record.isPending} onPress={() => router.back()} />
      </View>
    </KeyboardAwareScrollView>
  );
}
