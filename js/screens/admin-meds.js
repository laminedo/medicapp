import { api } from '../api.js';
import { h } from '../dom.js';
import { dateFromLocal, fmtDay, fmtTime, localDate, shiftDate } from '../format.js';
import { badge, button, dataView, empty, field, formError, group, input, openSheet, pageHead, roundMeter, section, segmented, textarea, toast, withBusy } from '../ui.js';
import { taskRow } from './staff-meds.js';

const REFRESH_MS = 60000;

const FILTERS = {
  all: () => true,
  late: (t) => t.status === 'overdue' || t.status === 'missed',
  due: (t) => t.status === 'due',
  given: (t) => t.status === 'given',
  skipped: (t) => t.status === 'refused' || t.status === 'held',
  upcoming: (t) => t.status === 'upcoming',
};

// An as-needed dose in the report. Voided ones stay listed, struck through.
function prnRecordRow(record, onVoid) {
  const voided = Boolean(record.voided_at);
  return h(
    'div',
    { class: `task task--given${voided ? ' task--voided' : ''}` },
    h('div', { class: 'task-time' }, h('time', null, fmtTime(record.recorded_at))),
    h(
      'div',
      { class: 'task-body' },
      h('p', { class: 'task-patient' }, record.patient_name, h('span', { class: 'task-room' }, `Room ${record.room}`)),
      h('p', { class: 'task-med' }, record.med_name, h('span', { class: 'task-dose' }, record.dosage)),
      h('p', { class: 'task-note' }, `Given by ${record.recorded_by_name}`),
      record.note && h('p', { class: 'task-note task-note--quote' }, `Reason: ${record.note}`),
      voided && h('p', { class: 'task-note task-note--void' }, `Voided by ${record.voided_by_name}: ${record.void_reason}`),
    ),
    h(
      'div',
      { class: 'task-action' },
      voided ? badge('neutral', 'Voided') : badge('ok', 'Given'),
      !voided && button('Void', { variant: 'ghost', size: 'sm', onClick: () => onVoid(record.id, `${record.med_name} for ${record.patient_name}`) }),
    ),
  );
}

export function mount(root) {
  const state = { date: localDate(), filter: 'all' };
  const view = dataView(root, { load: () => api.get(`/api/tasks?date=${state.date}`), render: draw });
  const reload = () => view.refresh({ quiet: true });
  const timer = setInterval(() => {
    if (!document.hidden && !document.querySelector('dialog[open]') && state.date === localDate()) reload();
  }, REFRESH_MS);

  function go(date) {
    if (!date) return;
    state.date = date;
    state.filter = 'all';
    reload();
  }

  // Voiding keeps the record and its reason; a scheduled dose opens up again.
  function openVoid(administrationId, what) {
    const reason = textarea({ maxlength: 300, rows: 3, placeholder: 'For example: recorded against the wrong resident' });
    const error = formError();
    const confirm = button('Void record', { variant: 'danger', onClick: submit });
    const sheet = openSheet({
      title: 'Void this record?',
      subtitle: what,
      focus: reason,
      content: [
        h('p', { class: 'sheet-message' }, 'The record is not deleted. It stays in the report marked as voided, with your name and reason. A scheduled dose becomes open again so it can be recorded correctly.'),
        field('Reason', reason),
        error.el,
      ],
      footer: [button('Cancel', { onClick: () => sheet.close() }), confirm],
    });

    async function submit() {
      error.clear();
      if (!reason.value.trim()) {
        error.show('Add the reason. It is kept with the record.');
        reason.focus();
        return;
      }
      await withBusy(confirm, async () => {
        try {
          await api.post(`/api/administrations/${administrationId}/void`, { reason: reason.value });
          sheet.close();
          toast('Record voided');
          reload();
        } catch (err) {
          error.show(err.message);
        }
      });
    }
  }

  function draw({ tasks, counts, today, date, prn_records: prnRecords }) {
    const picker = input({ type: 'date', value: date, max: shiftDate(today, 30), 'aria-label': 'Report date', onChange: (e) => go(e.target.value) });
    picker.classList.add('input--date');
    const toolbar = h(
      'div',
      { class: 'toolbar' },
      button('Previous day', { icon: 'chevron-left', iconOnly: true, onClick: () => go(shiftDate(date, -1)) }),
      picker,
      button('Next day', { icon: 'chevron-right', iconOnly: true, onClick: () => go(shiftDate(date, 1)) }),
      date !== today && button('Today', { variant: 'ghost', onClick: () => go(today) }),
    );

    const list = h('div');
    const paint = () => {
      const shown = tasks.filter(FILTERS[state.filter]);
      list.replaceChildren(
        shown.length
          ? group(shown.map((task) => taskRow(task, { onVoid: openVoid, audit: true })))
          : empty({ icon: 'pill', title: tasks.length ? 'No doses match this filter' : 'No medication was scheduled this day', text: tasks.length ? 'Choose another filter to see the rest of the round.' : 'Schedules are set on each patient.' }),
      );
    };
    const filter = segmented(
      [
        { value: 'all', label: 'All', count: counts.total },
        { value: 'late', label: 'Late', count: counts.overdue + counts.missed },
        { value: 'due', label: 'Due', count: counts.due },
        { value: 'given', label: 'Given', count: counts.given },
        { value: 'skipped', label: 'Refused or held', count: counts.refused + counts.held },
        { value: 'upcoming', label: 'Later', count: counts.upcoming },
      ],
      state.filter,
      (value) => {
        state.filter = value;
        paint();
      },
    );
    paint();

    return [
      pageHead('Medications', 'What was given, by whom, and what is late.', toolbar),
      section(date === today ? 'Today' : fmtDay(dateFromLocal(date)), null, h('div', { class: 'panel' }, roundMeter(counts))),
      section('Scheduled doses', null, filter, list),
      section(
        'As-needed doses',
        null,
        prnRecords.length
          ? group(prnRecords.map((record) => prnRecordRow(record, openVoid)))
          : empty({ icon: 'pill', title: 'No as-needed doses were given', text: 'Doses of as-needed medication appear here with the reason they were given.' }),
      ),
    ];
  }

  return () => {
    clearInterval(timer);
    view.stop();
  };
}
