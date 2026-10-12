import { Host, Switch } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { ApiError } from '@/api/client';
import { useGivePrn, useRound } from '@/api/hooks';
import { Button } from '@/components/button';
import { Callout } from '@/components/callout';
import { EmptyState } from '@/components/state-views';
import { prnLimits, prnWarning } from '@/components/task-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { colors, gutter, radius, spacing, useBrand } from '@/theme';
import { formatAgo, formatWhen } from '@/utils/format';
import { Fact } from './record-dose';

// The sheet for one as-needed dose. A reason is always required, and a dose
// outside the medication's own limits has to be confirmed first.
export function PrnDoseScreen() {
  const router = useRouter();
  const brand = useBrand();
  const { id } = useLocalSearchParams<{ id: string }>();
  const round = useRound();
  const give = useGivePrn();
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prn = round.data?.prn.find((p) => String(p.medication_id) === id);
  if (!prn) {
    return (
      <View style={{ padding: gutter }}>
        <EmptyState icon="pill" title="This medication is no longer prescribed" action={<Button title="Close" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />} />
      </View>
    );
  }

  const limits = prnLimits(prn);
  const warning = prnWarning(prn);

  async function submit() {
    if (!prn || give.isPending) return;
    setError(null);
    if (warning && !override) return setError('This dose is outside its limits. Turn on "Give this dose anyway" only if that has been confirmed.');
    if (!reason.trim()) return setError('Add the reason this dose is being given.');
    try {
      await give.mutateAsync({ prn, note: reason, confirmLimit: override });
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      // The limits changed while this was open: the refreshed sheet now shows why.
      if (err instanceof ApiError && err.code === 'prn_limit') setError(`${err.message} Review the warning above before giving it.`);
      else setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={spacing.xl} contentContainerStyle={{ padding: gutter, gap: spacing.lg }}>
      <View style={{ gap: 2 }}>
        <ThemedText variant="title">{`${prn.med_name}, ${prn.dosage}`}</ThemedText>
        <ThemedText variant="subhead">{`${prn.patient_name} · Room ${prn.room} · As needed`}</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Fact label="Last given" value={prn.last_given_at ? formatWhen(prn.last_given_at) : 'Not in 24 hours'} />
        <Fact label="In the last 24 hours" value={prn.max_daily ? `${prn.given_last_24h} of ${prn.max_daily} doses` : `${prn.given_last_24h} doses`} />
      </View>
      {(Boolean(prn.instructions) || Boolean(limits)) && (
        <Callout tone="neutral" title="Instructions" text={[prn.instructions, limits && `${limits[0].toUpperCase()}${limits.slice(1)}.`].filter(Boolean).join(' ')} />
      )}
      {Boolean(prn.patient_notes) && <Callout tone="warn" title="Care notes" text={prn.patient_notes} />}

      {warning && (
        <>
          <Callout tone="danger" title={warning} text={prn.last_given_at ? `Last given ${formatAgo(prn.last_given_at)} by ${prn.last_given_by_name}.` : undefined} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.fill }}>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText variant="subhead" style={{ fontWeight: '600', color: colors.label }}>
                Give this dose anyway
              </ThemedText>
              <ThemedText variant="footnote">Only if a nurse or prescriber has confirmed it.</ThemedText>
            </View>
            {/* A native toggle: SwiftUI on iOS, Compose on Android. */}
            <Host matchContents seedColor={brand.accent} accessibilityLabel="Give this dose anyway">
              <Switch value={override} onValueChange={setOverride} />
            </Host>
          </View>
        </>
      )}

      <TextField label="Reason for giving" multiline maxLength={500} value={reason} onChangeText={setReason} placeholder="For example: knee pain, 6 out of 10" hint="Required for every as-needed dose." />
      {error && <Callout tone="danger" title={error} />}
      <View style={{ gap: spacing.sm }}>
        <Button title="Record dose" variant="primary" size="lg" icon="check" loading={give.isPending} onPress={() => void submit()} />
        <Button title="Cancel" variant="ghost" disabled={give.isPending} onPress={() => router.back()} />
      </View>
    </KeyboardAwareScrollView>
  );
}
