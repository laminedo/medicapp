import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useMessages } from '@/api/hooks';
import { useBrand } from '@/theme';

// The platform's own tab bar, so placement, materials and behaviour are native.
export default function StaffTabs() {
  const brand = useBrand();
  const messages = useMessages();
  const unread = messages.data?.filter((m) => m.unread).length ?? 0;

  return (
    <NativeTabs tintColor={brand.accent}>
      <NativeTabs.Trigger name="(shift)">
        <NativeTabs.Trigger.Icon sf={{ default: 'clock', selected: 'clock.fill' }} md="schedule" />
        <NativeTabs.Trigger.Label>Shift</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="meds">
        <NativeTabs.Trigger.Icon sf={{ default: 'pills', selected: 'pills.fill' }} md="medication" />
        <NativeTabs.Trigger.Label>Meds</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon sf={{ default: 'envelope', selected: 'envelope.fill' }} md="mail" />
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        {unread > 0 && <NativeTabs.Trigger.Badge>{unread > 9 ? '9+' : String(unread)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="person" />
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
