import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { fmtClock, plural } from '../format.js';
import { button, confirmSheet, dataView, empty, field, formError, group, input, openSheet, pageHead, row, section, segmented, textarea, toast, withBusy } from '../ui.js';

const roomTile = (room) => h('span', { class: 'room-tile nums', 'aria-hidden': 'true' }, room);
const prnLimits = (med) => [med.prn_min_hours && `${med.prn_min_hours} h apart`, med.prn_max_daily && `Up to ${med.prn_max_daily} in 24 h`].filter(Boolean);

// ---- patient form (add and edit) -------------------------------------------

function openPatientForm(patient, onSaved) {
  const name = input({ value: patient?.name ?? '', maxlength: 80, required: true });
  const room = input({ value: patient?.room ?? '', maxlength: 20, required: true, inputmode: 'numeric' });
  const notes = textarea({ value: patient?.notes ?? '', maxlength: 1000, rows: 4 });
  const error = formError();
  const save = button(patient ? 'Save changes' : 'Add patient', { variant: 'primary', type: 'submit' });

  async function onSubmit(event) {
    event.preventDefault();
    error.clear();
    await withBusy(save, async () => {
      try {
        const body = { name: name.value, room: room.value, notes: notes.value };
        const res = patient ? await api.put(`/api/patients/${patient.id}`, body) : await api.post('/api/patients', body);
        sheet.close();
        toast(patient ? 'Patient updated' : `${res.patient.name} added`);
        onSaved(res.patient);
      } catch (err) {
        error.show(err.message);
      }
    });
  }

  const form = h(
    'form',
    { class: 'form', id: 'patient-form', onSubmit, novalidate: true },
    field('Full name', name),
    field('Room', room),
    field('Care notes', notes, { optional: true, hint: 'Allergies, risks and preferences. Staff see these when giving medication.' }),
    error.el,
  );
  save.setAttribute('form', 'patient-form');
  const sheet = openSheet({
    title: patient ? 'Edit patient' : 'Add a patient',
    content: form,
    focus: name,
    footer: [button('Cancel', { onClick: () => sheet.close() }), save],
  });
}

// ---- medication form --------------------------------------------------------

function openMedicationForm(patient, medication, onSaved) {
  const name = input({ value: medication?.name ?? '', maxlength: 80, required: true });
  const dosage = input({ value: medication?.dosage ?? '', maxlength: 60, required: true, placeholder: '500 mg tablet' });
  const instructions = textarea({ value: medication?.instructions ?? '', maxlength: 300, rows: 2 });
  const minHours = input({ type: 'number', value: medication?.prn_min_hours ?? '', min: 0.5, max: 72, step: 0.5, inputmode: 'decimal', class: 'input nums' });
  const maxDaily = input({ type: 'number', value: medication?.prn_max_daily ?? '', min: 1, max: 24, step: 1, inputmode: 'numeric', class: 'input nums' });
  const error = formError();
  const save = button(medication ? 'Save changes' : 'Add medication', { variant: 'primary', type: 'submit' });
  let prn = medication?.prn ?? false;

  const times = h('div', { class: 'time-list' });
  const addTime = (value = '') => {
    const control = input({ type: 'time', value, required: true, 'aria-label': 'Time of day' });
    const line = h('div', { class: 'time-line' }, control, button('Remove time', { icon: 'x', iconOnly: true, variant: 'ghost', onClick: () => { if (times.children.length > 1) line.remove(); } }));
    times.append(line);
    return control;
  };
  (medication?.times?.length ? medication.times : ['08:00']).forEach(addTime);

  // A medication is given on a schedule or as needed, never both.
  const scheduled = h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, 'Times to give, every day'),
    times,
    h('div', null, button('Add a time', { icon: 'plus', size: 'sm', onClick: () => addTime().focus() })),
  );
  const asNeeded = h(
    'div',
    { class: 'form' },
    h('div', { class: 'field-pair' }, field('Hours between doses', minHours, { optional: true }), field('Most doses in 24 hours', maxDaily, { optional: true })),
    h('p', { class: 'field-hint' }, 'Staff are warned before giving a dose outside these limits, and must give a reason for every as-needed dose.'),
  );
  const paint = () => {
    scheduled.hidden = prn;
    asNeeded.hidden = !prn;
  };
  const mode = segmented([{ value: 'scheduled', label: 'On a schedule' }, { value: 'prn', label: 'As needed (PRN)' }], prn ? 'prn' : 'scheduled', (value) => {
    prn = value === 'prn';
    paint();
  });
  mode.classList.add('segmented--fill');
  paint();

  async function onSubmit(event) {
    event.preventDefault();
    error.clear();
    const values = [...times.querySelectorAll('input')].map((el) => el.value).filter(Boolean);
    if (!prn && values.length === 0) return error.show('Add at least one time of day.');
    await withBusy(save, async () => {
      try {
        const body = { name: name.value, dosage: dosage.value, instructions: instructions.value, prn, times: values, prn_min_hours: minHours.value, prn_max_daily: maxDaily.value };
        if (medication) await api.put(`/api/medications/${medication.id}`, body);
        else await api.post(`/api/patients/${patient.id}/medications`, body);
        sheet.close();
        toast(medication ? 'Medication updated' : `${body.name} added`);
        onSaved();
      } catch (err) {
        error.show(err.message);
      }
    });
  }

  const form = h(
    'form',
    { class: 'form', id: 'medication-form', onSubmit, novalidate: true },
    field('Medication', name),
    field('Dosage', dosage),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'When it is given'), mode),
    scheduled,
    asNeeded,
    field('Instructions', instructions, { optional: true, hint: 'Shown to staff on the dose, for example "Give with food" or "For pain or fever".' }),
    error.el,
  );
  save.setAttribute('form', 'medication-form');
  const sheet = openSheet({
    title: medication ? 'Edit medication' : 'Add a medication',
    subtitle: `${patient.name} · Room ${patient.room}`,
    content: form,
    focus: name,
    footer: [button('Cancel', { onClick: () => sheet.close() }), save],
  });
}

// ---- list -------------------------------------------------------------------

function mountList(root) {
  const view = dataView(root, { load: () => api.get('/api/patients'), render: draw });

  function draw({ patients }) {
    const add = button('Add patient', { variant: 'primary', icon: 'plus', onClick: () => openPatientForm(null, (p) => (location.hash = `#/patients/${p.id}`)) });
    return [
      pageHead('Patients', patients.length ? plural(patients.length, 'resident') : 'No residents yet', add),
      patients.length === 0
        ? empty({ icon: 'bed', title: 'Add your first patient', text: 'Each patient has a room, care notes and a medication schedule.' })
        : group(
            patients.map((p) =>
              row({
                leading: roomTile(p.room),
                title: p.name,
                subtitle: p.medications.length ? p.medications.map((m) => (m.prn ? `${m.name} (as needed)` : m.name)).join(', ') : 'No medication scheduled',
                detail: p.notes,
                trailing: h('span', { class: 'row-count nums' }, plural(p.medications.reduce((n, m) => n + m.times.length, 0), 'dose') + ' a day'),
                chevron: true,
                href: `#/patients/${p.id}`,
              }),
            ),
          ),
    ];
  }
  return () => view.stop();
}

// ---- one patient ------------------------------------------------------------

function mountDetail(root, id) {
  const view = dataView(root, { load: () => api.get(`/api/patients/${id}`), render: draw });
  const reload = () => view.refresh({ quiet: true });

  function draw({ patient }) {
    async function archive() {
      const ok = await confirmSheet({
        title: `Archive ${patient.name}?`,
        message: 'Their medication schedule stops and they leave the patient list. Past medication records are kept.',
        confirmLabel: 'Archive patient',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await api.del(`/api/patients/${patient.id}`);
        toast(`${patient.name} archived`);
        location.hash = '#/patients';
      } catch (err) {
        toast(err.message, 'danger');
      }
    }

    async function removeMedication(med) {
      const ok = await confirmSheet({
        title: `Stop ${med.name}?`,
        message: `No more doses will be scheduled for ${patient.name}. Doses already recorded stay in the report.`,
        confirmLabel: 'Stop medication',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await api.del(`/api/medications/${med.id}`);
        toast(`${med.name} stopped`);
        reload();
      } catch (err) {
        toast(err.message, 'danger');
      }
    }

    const medRow = (med) =>
      h(
        'div',
        { class: 'med' },
        h(
          'div',
          { class: 'med-body' },
          h('p', { class: 'med-name' }, med.name, h('span', { class: 'med-dose' }, med.dosage)),
          med.prn
            ? h('ul', { class: 'chips', 'aria-label': 'When it is given' }, h('li', { class: 'chip chip--accent' }, 'As needed'), prnLimits(med).map((limit) => h('li', { class: 'chip nums' }, limit)))
            : h('ul', { class: 'chips', 'aria-label': 'Times' }, med.times.map((t) => h('li', { class: 'chip nums' }, fmtClock(t)))),
          med.instructions && h('p', { class: 'med-note' }, med.instructions),
        ),
        h(
          'div',
          { class: 'med-actions' },
          button(`Edit ${med.name}`, { icon: 'pencil', iconOnly: true, variant: 'ghost', onClick: () => openMedicationForm(patient, med, reload) }),
          button(`Stop ${med.name}`, { icon: 'trash', iconOnly: true, variant: 'ghost', onClick: () => removeMedication(med) }),
        ),
      );

    return [
      h('a', { class: 'back', href: '#/patients' }, icon('chevron-left', 18), 'Patients'),
      pageHead(
        patient.name,
        `Room ${patient.room}`,
        button('Edit', { icon: 'pencil', onClick: () => openPatientForm(patient, reload) }),
        button('Archive', { variant: 'ghost', onClick: archive }),
      ),
      section('Care notes', null, h('div', { class: 'panel' }, h('p', { class: patient.notes ? 'prose' : 'prose prose--muted' }, patient.notes || 'No care notes yet.'))),
      section(
        'Medication schedule',
        button('Add medication', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => openMedicationForm(patient, null, reload) }),
        patient.medications.length
          ? group(patient.medications.map(medRow))
          : empty({ icon: 'pill', title: 'No medication scheduled', text: 'Add a medication with its dosage and times of day.' }),
      ),
    ];
  }
  return () => view.stop();
}

export function mount(root, ctx, args) {
  const id = Number(args[0]);
  return Number.isInteger(id) && id > 0 ? mountDetail(root, id) : mountList(root);
}
