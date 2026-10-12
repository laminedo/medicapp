// Queries and mutations. Screens use these and never call the client directly.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import type { ClockResult, ClockStatus, Dashboard, Message, Outcome, Position, Prn, Reply, Round, Task } from './types';

const MINUTE = 60 * 1000;

export const keys = {
  clock: ['clock'] as const,
  round: ['round'] as const,
  messages: ['messages'] as const,
  unread: ['unread'] as const,
  dashboard: ['dashboard'] as const,
};

export const useClockStatus = () => useQuery({ queryKey: keys.clock, queryFn: () => api.get<ClockStatus>('/api/clock/status') });

// Dose statuses move with the clock, so the round refetches itself every minute.
export const useRound = () => useQuery({ queryKey: keys.round, queryFn: () => api.get<Round>('/api/tasks?carry=1'), refetchInterval: MINUTE });

export const useMessages = () =>
  useQuery({ queryKey: keys.messages, queryFn: async () => (await api.get<{ messages: Message[] }>('/api/messages')).messages, refetchInterval: MINUTE });

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<Dashboard>('/api/dashboard'), refetchInterval: MINUTE });

export function useClock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ type, position }: { type: 'in' | 'out'; position: Position }) => api.post<ClockResult>(`/api/clock/${type}`, position),
    // A blocked attempt is logged too, so the history is refreshed either way.
    onSettled: () => client.invalidateQueries({ queryKey: keys.clock }),
  });
}

export function useRecordDose() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ task, outcome, note }: { task: Task; outcome: Outcome; note: string }) =>
      api.post<{ task: Task }>('/api/tasks/record', { medication_id: task.medication_id, date: task.date, time: task.time, outcome, note }),
    onSettled: () => client.invalidateQueries({ queryKey: keys.round }),
  });
}

export function useGivePrn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ prn, note, confirmLimit }: { prn: Prn; note: string; confirmLimit: boolean }) =>
      api.post<{ prn: Prn }>('/api/tasks/prn', { medication_id: prn.medication_id, note, confirm_limit: confirmLimit }),
    onSettled: () => client.invalidateQueries({ queryKey: keys.round }),
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/api/messages/${id}/read`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.messages }),
  });
}

export function useAcknowledge() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/api/messages/${id}/acknowledge`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.messages }),
  });
}

export function useReply() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => api.post<{ replies: Reply[] }>(`/api/messages/${id}/replies`, { body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.messages }),
  });
}
