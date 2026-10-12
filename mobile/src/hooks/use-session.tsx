// Who is signed in. The token lives in the device keychain (expo-secure-store),
// so it survives restarts without ever being stored in plain text.
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { ApiError, api, setSessionEndedHandler, setToken } from '@/api/client';
import type { User } from '@/api/types';

const TOKEN_KEY = 'medicapp.session';

type Session = {
  // 'loading' until the stored token has been checked: nothing routes before then.
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
  facilityName: string;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Session['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [facilityName, setFacilityName] = useState('MedicApp');

  async function end() {
    setToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    queryClient.clear();
    setUser(null);
    setStatus('signedOut');
  }

  // On launch: restore the saved token and confirm the server still accepts it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      setToken(saved);
      try {
        const me = await api.get<{ user: User | null; facility_name: string }>('/api/auth/me');
        if (cancelled) return;
        setFacilityName(me.facility_name);
        if (me.user) {
          setUser(me.user);
          setStatus('signedIn');
        } else {
          await end();
        }
      } catch {
        // Offline at launch: fall back to the sign-in screen rather than hang.
        if (!cancelled) setStatus('signedOut');
      }
    })();
    setSessionEndedHandler(() => void end());
    return () => {
      cancelled = true;
      setSessionEndedHandler(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(username: string, password: string) {
    const result = await api.post<{ user: User; token: string }>('/api/auth/login', { username, password, client: 'native' });
    setToken(result.token);
    await SecureStore.setItemAsync(TOKEN_KEY, result.token);
    setUser(result.user);
    setStatus('signedIn');
  }

  async function signOut() {
    await api.post('/api/auth/logout').catch((err) => {
      if (!(err instanceof ApiError)) throw err;
    });
    await end();
  }

  return <SessionContext value={{ status, user, facilityName, signIn, signOut }}>{children}</SessionContext>;
}

export function useSession() {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
