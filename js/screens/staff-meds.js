import { api } from '../api.js';
import { h } from '../dom.js';
import { fmtAgo, fmtClock, fmtDay, fmtMinutes, fmtTime, fmtWhen } from '../format.js';
import { LATE_GIVEN_MIN, badge, button, callout, dataView, empty, field, formError, group, openSheet, pageHead, roundMeter, section, segmented, taskBadge, textarea, toast, withBusy } from '../ui.js';

const REFRESH_MS = 60000;
const CLOSED = ['given', 'refused', 'held'];

const OUTCOMES = {
  given: { label: 'Given', verb: 'Given', confirm: 'Confirm given', noteLabel: 'Note', placeholder: 'Anything the next shift should know' },
  refused: { label: 'Refused', verb: 'Refused', confirm: 'Record as refused', noteLabel: 'Reason refused', placeholder: 'What the resident said or did' },
  held: { label: 'Held', verb: 'Held', confirm: 'Record as held', noteLabel: 'Reason held', placeholder: 'For example: low blood pressure, nil by mouth' },
};

// What was recorded against a dose, in one line.
function recordLine(task) {
  const who = `${task.recorded_by_name} at ${fmtTime(task.recorded_at)}`;
  if (task.status !== 'given') return `${OUTCOMES[task.status].verb}. Recorded by ${who}`;
  return task.late_min > LATE_GIVEN_MIN ? `Given by ${who}, ${fmtMinutes(task.late_min)} late` : `Given by ${who}`;
}

const voidedLine = (v) =>
  `Voided entry: ${OUTCOMES[v.outcome].verb.toLowerCase()} by ${v.recorded_by_name} at ${fmtTime(v.recorded_at)}. Voided by ${v.voided_by_name}: ${v.void_reason}`;

// One dose on a round. Staff get onRecord; the admin report gets onVoid and the audit trail.
export function taskRow(task, { onRecord, onVoid, today, audit } = {}) {
  const carried = today && task.date !== today;
  const closed = CLOSED.includes(task.status);
  return h(
    'div',
    { class: `task task--${task.status}` },
    h('div', { class: 'task-time' }, h('time', null, fmtClock(task.time)), carried && h('span', { class: 'task-day' }, 'Yesterday')),
    h(
      'div',
      { class: 'task-body' },
      h('p', { class: 'task-patient' }, task.patient_name, h('span', { class: 'task-room' }, `Room ${task.room}`)),
      h('p', { class: 'task-med' }, task.med_name, h('span', { class: 'task-dose' }, task.dosage)),
      !closed && task.instructions && h('p', { class: 'task-note' }, task.instructions),
      closed && h('p', { class: 'task-note' }, recordLine(task)),
      closed && task.note && h('p', { class: 'task-note task-note--quote' }, `${task.status === 'given' ? 'Note' : 'Reason'}: ${task.note}`),
      audit && task.voided.map((v) => h('p', { class: 'task-note task-note--void' }, voidedLine(v))),
    ),
    h(
      'div',
      { class: 'task-action' },
      taskBadge(task),
      onRecord && task.can_record && button('Give', { variant: 'primary', size: 'sm', icon: 'check', onClick: () => onRecord(task) }),
      onVoid && closed && button('Void', { variant: 'ghost', size: 'sm', onClick: () => onVoid(task.administration_id, `${task.med_name} for ${task.patient_name}`) }),
    ),
  );
}

function prnStanding(p) {
  const limits = [p.min_hours && `at least ${p.min_hours} h apart`, p.max_daily && `up to ${p.max_daily} in 24 h`].filter(Boolean).join(', ');
  const last = p.last_given_at ? `Last given ${fmtAgo(p.last_given_at)} by ${p.last_given_by_name}` : 'Not given in the last 24 hours';
  return { limits: limits && limits[0].toUpperCase() + limits.slice(1), last };
}

function prnWarning(p) {
  if (p.daily_limit_reached) return `Already given ${p.given_last_24h} times in the last 24 hours, which is the limit.`;
  if (p.too_soon) return `Too soon. The next dose is allowed from ${fmtTime(p.next_allowed_at)}.`;
  return null;
}

function prnRow(p, onGive) {
  const { limits, last } = prnStanding(p);
  const warning = prnWarning(p);
  return h(
    'div',
    { class: 'task task--prn' },
    h('div', { class: 'task-time' }, h('span', { class: 'task-prn' }, 'As needed')),
    h(
      'div',
      { class: 'task-body' },
      h('p', { class: 'task-patient' }, p.patient_name, h('span', { class: 'task-room' }, `Room ${p.room}`)),
      h('p', { class: 'task-med' }, p.med_name, h('span', { class: 'task-dose' }, p.dosage)),
      h('p', { class: 'task-note' }, [p.instructions, limits].filter(Boolean).join(' ')),
      h('p', { class: 'task-note' }, last),
    ),
    h(
      'div',
      { class: 'task-action' },
      warning && badge(p.daily_limit_reached ? 'danger' : 'warn', p.daily_limit_reached ? 'Limit reached' : 'Too soon'),
      button('Give', { variant: warning ? 'secondary' : 'primary', size: 'sm', icon: 'check', onClick: () => onGive(p) }),
    ),
  );
}

export function mount(root, ctx) {
  const view = dataView(root, { load: () => api.get('/api/tasks?carry=1'), render: draw });
  // Statuses move with the clock, so the list refreshes itself while it is open.
  const timer = setInterval(() => {
    if (!document.hidden && !document.querySelector('dialog[open]')) view.refresh({ quiet: true });
  }, REFRESH_MS);
  const reload = () => view.refresh({ quiet: true });

  function draw({ tasks, counts, today, prn }) {
    const late = tasks.filter((t) => t.status === 'overdue' || t.status === 'missed');
    const due = tasks.filter((t) => t.status === 'due');
    const later = tasks.filter((t) => t.status === 'upcoming');
    const done = tasks.filter((t) => CLOSED.includes(t.status));
    const list = (items) => group(items.map((t) => taskRow(t, { onRecord: openRecord, today })));

    const out = [pageHead('Medications', fmtDay(new Date())), h('div', { class: 'panel' }, roundMeter(counts))];
    if (tasks.length === 0 && prn.length === 0) {
      out.push(empty({ icon: 'pill', title: 'No medication is scheduled today', text: 'When an admin adds a schedule, the doses appear here.' }));
      return out;
    }
    if (late.length) out.push(section('Needs attention', null, list(late)));
    if (due.length) out.push(section('Due now', null, list(due)));
    if (tasks.length && !late.length && !due.length) {
      out.push(
        empty({
          title: 'Nothing to give right now',
          text: later.length ? `The next dose is at ${fmtClock(later[0].time)}.` : 'Every dose for today has been recorded.',
        }),
      );
    }
    if (prn.length) out.push(section('As needed', null, group(prn.map((p) => prnRow(p, openPrn)))));
    if (later.length) out.push(section('Later today', null, list(later)));
    if (done.length) out.push(section('Recorded', null, list(done)));
    return out;
  }

  // ---- a scheduled dose: given, refused or held ---------------------------

  function openRecord(task) {
    const minutesLate = (Date.now() - Date.parse(task.scheduled_at)) / 60000;
    const timing = minutesLate > 5 ? `${fmtMinutes(minutesLate)} late` : minutesLate < -5 ? `${fmtMinutes(minutesLate)} early` : 'on time';
    let outcome = 'given';

    const note = textarea({ maxlength: 500 });
    const noteField = field('Note', note, { optional: true, hint: ' ' });
    const [label, hint] = [noteField.querySelector('.field-label'), noteField.querySelector('.field-hint')];
    const error = formError();
    const confirm = button(OUTCOMES.given.confirm, { variant: 'primary', icon: 'check', onClick: submit });
    const noteNeeded = () => outcome !== 'given' || task.note_required;

    // The note's label, hint and whether it is required all follow the outcome.
    function paint() {
      const o = OUTCOMES[outcome];
      label.replaceChildren(...[o.noteLabel, !noteNeeded() && h('span', { class: 'field-optional' }, 'Optional')].filter(Boolean));
      note.placeholder = outcome === 'given' && task.note_required ? 'Why is this dose late?' : o.placeholder;
      hint.textContent = outcome === 'given' && task.note_required ? 'Required, because this dose is more than 2 hours late.' : outcome === 'given' ? '' : 'Required. Your admin sees this in the medication report.';
      hint.hidden = !hint.textContent;
      confirm.querySelector('.btn-label').textContent = o.confirm;
      error.clear();
    }

    const choice = segmented(
      Object.entries(OUTCOMES).map(([value, o]) => ({ value, label: o.label })),
      outcome,
      (value) => {
        outcome = value;
        paint();
        if (noteNeeded()) note.focus();
      },
    );
    choice.classList.add('segmented--fill');
    paint();

    const sheet = openSheet({
      title: `${task.med_name}, ${task.dosage}`,
      subtitle: `${task.patient_name} · Room ${task.room}`,
      content: [
        h(
          'dl',
          { class: 'facts' },
          h('div', null, h('dt', null, 'Scheduled'), h('dd', null, `${fmtClock(task.time)}, ${timing}`)),
          h('div', null, h('dt', null, 'Recorded by'), h('dd', null, ctx.user.name)),
        ),
        task.instructions && callout('neutral', 'Instructions', task.instructions),
        task.patient_notes && callout('warn', 'Care notes', task.patient_notes),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'What happened'), choice),
        noteField,
        error.el,
      ],
      footer: [button('Cancel', { onClick: () => sheet.close() }), confirm],
    });

    async function submit() {
      error.clear();
      if (noteNeeded() && !note.value.trim()) {
        error.show(outcome === 'given' ? 'Add a note explaining why this dose is late.' : `Add the reason this dose was ${outcome}.`);
        note.focus();
        return;
      }
      await withBusy(confirm, async () => {
        try {
          await api.post('/api/tasks/record', { medication_id: task.medication_id, date: task.date, time: task.time, outcome, note: note.value });
          sheet.close();
          toast(`${OUTCOMES[outcome].verb}: ${task.med_name} for ${task.patient_name}`);
          reload();
        } catch (err) {
          if (err.data?.code === 'already_recorded') {
            sheet.close();
            toast(err.message, 'danger');
            reload();
          } else {
            error.show(err.message);
          }
        }
      });
    }
  }

  // ---- an as-needed dose ---------------------------------------------------

  function openPrn(p) {
    const { limits, last } = prnStanding(p);
    const warning = prnWarning(p);
    const reason = textarea({ maxlength: 500, placeholder: 'For example: knee pain, 6 out of 10' });
    const override = h('input', { type: 'checkbox', id: 'prn-override' });
    const error = formError();
    const confirm = button('Record dose', { variant: 'primary', icon: 'check', onClick: submit });

    const sheet = openSheet({
      title: `${p.med_name}, ${p.dosage}`,
      subtitle: `${p.patient_name} · Room ${p.room} · As needed`,
      focus: warning ? null : reason,
      content: [
        h(
          'dl',
          { class: 'facts' },
          h('div', null, h('dt', null, 'Last given'), h('dd', null, p.last_given_at ? fmtWhen(p.last_given_at) : 'Not in the last 24 hours')),
          h('div', null, h('dt', null, 'In the last 24 hours'), h('dd', null, p.max_daily ? `${p.given_last_24h} of ${p.max_daily} doses` : `${p.given_last_24h} doses`)),
        ),
        (p.instructions || limits) && callout('neutral', 'Instructions', [p.instructions, limits && `${limits}.`].filter(Boolean).join(' ')),
        p.patient_notes && callout('warn', 'Care notes', p.patient_notes),
        warning && callout('danger', warning, last + '.'),
        warning &&
          h('label', { class: 'check', for: 'prn-override' }, override, h('span', null, h('span', { class: 'check-title' }, 'Give this dose anyway'), h('span', { class: 'check-hint' }, 'Only if a nurse or prescriber has confirmed it. Your reason below is kept with the record.'))),
        field('Reason for giving', reason, { hint: 'Required for every as-needed dose.' }),
        error.el,
      ],
      footer: [button('Cancel', { onClick: () => sheet.close() }), confirm],
    });

    async function submit() {
      error.clear();
      if (warning && !override.checked) return error.show('This dose is outside its limits. Tick "Give this dose anyway" only if that has been confirmed.');
      if (!reason.value.trim()) {
        error.show('Add the reason this dose is being given.');
        reason.focus();
        return;
      }
      await withBusy(confirm, async () => {
        try {
          await api.post('/api/tasks/prn', { medication_id: p.medication_id, note: reason.value, confirm_limit: override.checked });
          sheet.close();
          toast(`Given: ${p.med_name} for ${p.patient_name}`);
          reload();
        } catch (err) {
          // The limits changed while the sheet was open (someone else gave a dose).
          if (err.data?.code === 'prn_limit') {
            sheet.close();
            toast(err.message, 'danger');
            reload();
          } else {
            error.show(err.message);
          }
        }
      });
    }
  }

  return () => {
    clearInterval(timer);
    view.stop();
  };
}
