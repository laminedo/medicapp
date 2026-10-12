// Shapes returned by the MedicApp server.

export type Role = 'admin' | 'staff';

export type User = {
  id: number;
  username: string;
  name: string;
  role: Role;
  job_title: string;
};

export type Facility = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

export type ClockEvent = {
  id: number;
  type: 'in' | 'out';
  status: 'ok' | 'blocked';
  at: string;
  distance_m: number | null;
  on_site: number | null;
  forced_by_name: string | null;
  note: string;
  user_name?: string;
};

export type ClockStatus = {
  clocked_in: boolean;
  since: string | null;
  recent: ClockEvent[];
  facility: Facility;
};

export type ClockResult = ClockStatus & { event: ClockEvent };

export type Outcome = 'given' | 'refused' | 'held';
export type TaskStatus = Outcome | 'upcoming' | 'due' | 'overdue' | 'missed';

export type Task = {
  key: string;
  medication_id: number;
  patient_name: string;
  room: string;
  patient_notes: string;
  med_name: string;
  dosage: string;
  instructions: string;
  date: string;
  time: string;
  scheduled_at: string;
  status: TaskStatus;
  can_record: boolean;
  note_required: boolean;
  recorded_at: string | null;
  recorded_by_name: string | null;
  late_min: number | null;
  note: string;
};

export type Prn = {
  medication_id: number;
  patient_name: string;
  room: string;
  patient_notes: string;
  med_name: string;
  dosage: string;
  instructions: string;
  min_hours: number | null;
  max_daily: number | null;
  last_given_at: string | null;
  last_given_by_name: string | null;
  given_last_24h: number;
  next_allowed_at: string | null;
  too_soon: boolean;
  daily_limit_reached: boolean;
};

export type Counts = Record<'total' | TaskStatus, number>;

export type Round = {
  date: string;
  today: string;
  tasks: Task[];
  counts: Counts;
  prn: Prn[];
};

export type Reply = {
  id: number;
  body: string;
  created_at: string;
  author_name: string;
  from_staff: boolean;
};

export type Message = {
  id: number;
  subject: string;
  body: string;
  priority: 'normal' | 'important';
  created_at: string;
  sender_name: string;
  sender_title: string;
  to_all: boolean;
  acknowledged_at: string | null;
  replies: Reply[];
  unread: boolean;
};

export type Dashboard = {
  today: string;
  facility: Facility;
  counts: Counts;
  attention: Task[];
  staff: { id: number; name: string; job_title: string; clocked_in: boolean; since: string | null }[];
  recent_clock: ClockEvent[];
};

export type Position = { latitude: number; longitude: number; accuracy: number | null };
