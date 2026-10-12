import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { API_URL } from '@/api/client';
import { Button } from '@/components/button';
import { Callout } from '@/components/callout';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/hooks/use-session';
import { colors, gutter, radius, spacing, useBrand } from '@/theme';

// The brand mark: a geofence ring with someone inside it.
function Mark({ size = 56 }: { size?: number }) {
  const brand = useBrand();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.lg, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: brand.accent }}>
      <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={9.5} fill="none" stroke={brand.onAccent} strokeWidth={2} strokeDasharray="3.4 2.8" strokeLinecap="round" />
        <Circle cx={12} cy={12} r={3.8} fill={brand.onAccent} />
      </Svg>
    </View>
  );
}

export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, facilityName } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordInput = useRef<TextInput>(null);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!username.trim() || !password) return setError('Enter your username and password.');
    setBusy(true);
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      bottomOffset={spacing.xl}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: gutter, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xxl }}>
      <View style={{ gap: spacing.lg }}>
        <Mark />
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="largeTitle">Sign in</ThemedText>
          <ThemedText variant="subhead">{`${facilityName}. Use the username and password from your admin.`}</ThemedText>
        </View>
      </View>

      <View style={{ gap: spacing.lg }}>
        <TextField
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordInput.current?.focus()}
        />
        <TextField
          ref={passwordInput}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        {error && <Callout tone="danger" title={error} />}
        <Button title="Sign in" variant="primary" size="lg" loading={busy} onPress={() => void submit()} />
      </View>

      <ThemedText variant="footnote" selectable style={{ textAlign: 'center' }}>{`Server: ${API_URL}`}</ThemedText>
    </KeyboardAwareScrollView>
  );
}
