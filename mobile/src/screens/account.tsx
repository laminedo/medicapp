import Constants from 'expo-constants';
import { useState } from 'react';
import { View } from 'react-native';

import { API_URL } from '@/api/client';
import { Button } from '@/components/button';
import { Group, Row, Section } from '@/components/group';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/hooks/use-session';
import { radius, spacing, type, useBrand } from '@/theme';
import { initials } from '@/utils/format';

const Value = ({ children }: { children: string }) => (
  <ThemedText variant="subhead" selectable numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>
    {children}
  </ThemedText>
);

export function AccountScreen() {
  const brand = useBrand();
  const { user, facilityName, signOut } = useSession();
  const [leaving, setLeaving] = useState(false);
  if (!user) return null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <View style={{ width: 56, height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.accentWash }}>
          <ThemedText style={[type.headline, { color: brand.accent }]}>{initials(user.name)}</ThemedText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText variant="title">{user.name}</ThemedText>
          <ThemedText variant="subhead">{[user.job_title, `@${user.username}`].filter(Boolean).join(' · ')}</ThemedText>
        </View>
      </View>

      <Section title="This device">
        <Group>
          <Row title="Facility" trailing={<Value>{facilityName}</Value>} />
          <Row title="Server" trailing={<Value>{API_URL}</Value>} />
          <Row title="Version" trailing={<Value>{Constants.expoConfig?.version ?? '0.1.0'}</Value>} />
        </Group>
        <ThemedText variant="footnote" style={{ paddingHorizontal: spacing.xs }}>
          To change your password, or for anything an admin manages, use the web app.
        </ThemedText>
      </Section>

      <Button
        title="Sign out"
        icon="signOut"
        loading={leaving}
        onPress={() => {
          setLeaving(true);
          void signOut().finally(() => setLeaving(false));
        }}
      />
    </Screen>
  );
}
