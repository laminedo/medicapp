// The shared component kit. Screens compose these; they do not restyle them.
import { h, uid } from './dom.js';
import { icon } from './icons.js';
import { initials } from './format.js';

// ---- buttons ----------------------------------------------------------------
// variant: primary | secondary | ghost | danger     size: sm | md | lg

export function button(label, opts = {}) {
  const { variant = 'secondary', size = 'md', icon: iconName, onClick, type = 'button', block, disabled, iconOnly } = opts;
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', iconOnly && 'btn--icon'];
  return h(
    'button',
    { type, class: classes.filter(Boolean).join(' '), disabled, 'aria-label': iconOnly ? label : null, title: iconOnly ? label : null, onClick },
    iconName && icon(iconName, size === 'sm' ? 16 : 18),
    !iconOnly && h('span', { class: 'btn-label' }, label),
  );
}

export function setBusy(btn, busy) {
  if (busy) {
    btn.dataset.wasDisabled = btn.disabled ? '1' : '';
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  } else {
    btn.removeAttribute('aria-busy');
    btn.disabled = btn.dataset.wasDisabled === '1';
  }
}

export async function withBusy(btn, fn) {
  setBusy(btn, true);
  try {
    return await fn();
  } finally {
    setBusy(btn, false);
  }
}

// ---- small pieces -----------------------------------------------------------

// tone: ok | warn | danger | alert | neutral
export const badge = (tone, label) => h('span', { class: `badge badge--${tone}` }, label);

const TASK_BADGE = {
  given: ['ok', 'Given'],
  refused: ['warn', 'Refused'],
  held: ['neutral', 'Held'],
  due: ['warn', 'Due now'],
  overdue: ['danger', 'Overdue'],
  missed: ['alert', 'Missed'],
  upcoming: ['neutral', 'Later'],
};
export const LATE_GIVEN_MIN = 30;

export function taskBadge(task) {
  if (task.status === 'given' && task.late_min > LATE_GIVEN_MIN) return badge('warn', 'Given late');
  const [tone, label] = TASK_BADGE[task.status];
  return badge(tone, label);
}

export const avatar = (name, size = 'md') => h('span', { class: `avatar avatar--${size}`, 'aria-hidden': 'true' }, initials(name));

export function callout(tone, title, text, iconName = tone === 'ok' ? 'check' : tone === 'neutral' ? 'info' : 'alert') {
  return h(
    'div',
    { class: `callout callout--${tone}` },
    icon(iconName, 18),
    h('div', null, title && h('p', { class: 'callout-title' }, title), text && h('p', { class: 'callout-text' }, text)),
  );
}

// ---- page structure ---------------------------------------------------------

export function pageHead(title, subtitle, ...actions) {
  return h(
    'header',
    { class: 'page-head' },
    h('div', { class: 'page-head-text' }, h('h1', null, title), subtitle && h('p', null, subtitle)),
    actions.length > 0 && h('div', { class: 'page-actions' }, actions),
  );
}

export function section(title, trailing, ...children) {
  return h(
    'section',
    { class: 'section' },
    (title || trailing) && h('div', { class: 'section-head' }, title && h('h2', null, title), trailing),
    children,
  );
}

// A grouped list: one surface, rows divided by hairlines. Used instead of a card per item.
export const group = (...rows) => h('div', { class: 'group' }, rows);

export function row({ leading, title, subtitle, detail, foot, trailing, onClick, href, chevron, unread } = {}) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  const interactive = Boolean(href || onClick);
  return h(
    tag,
    { class: `row${interactive ? ' row--action' : ''}${unread ? ' row--unread' : ''}`, href, onClick, type: tag === 'button' ? 'button' : null },
    leading && h('div', { class: 'row-leading' }, leading),
    h(
      'div',
      { class: 'row-body' },
      h('div', { class: 'row-title' }, title),
      subtitle && h('div', { class: 'row-sub' }, subtitle),
      detail && h('div', { class: 'row-detail' }, detail),
      foot && h('div', { class: 'row-foot' }, foot),
    ),
    (trailing || chevron) && h('div', { class: 'row-trailing' }, trailing, chevron && icon('chevron-right', 18)),
  );
}

export function empty({ icon: iconName = 'check', title, text, action } = {}) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(iconName, 22)),
    h('p', { class: 'empty-title' }, title),
    text && h('p', { class: 'empty-text' }, text),
    action,
  );
}

export function skeleton(rows = 4) {
  return h(
    'div',
    { class: 'group skeleton', 'aria-busy': 'true' },
    Array.from({ length: rows }, (_, i) =>
      h('div', { class: 'row' }, h('div', { class: 'row-body' }, h('div', { class: 'bone', style: { width: `${38 + ((i * 17) % 30)}%` } }), h('div', { class: 'bone bone--thin', style: { width: `${55 + ((i * 11) % 25)}%` } }))),
    ),
    h('span', { class: 'visually-hidden' }, 'Loading'),
  );
}

export function errorState(message, retry) {
  return empty({
    icon: 'alert',
    title: 'This did not load',
    text: message,
    action: retry && button('Try again', { variant: 'secondary', onClick: retry }),
  });
}

// Every data screen has four states: loading, error, empty and content.
// A quiet refresh keeps what is on screen while the new data arrives.
export function dataView(root, { load, render, loading }) {
  let alive = true;
  let hasContent = false;

  async function refresh({ quiet = false } = {}) {
    if (!quiet || !hasContent) root.replaceChildren(loading ? loading() : skeleton());
    try {
      const data = await load();
      if (!alive) return;
      root.replaceChildren(...[render(data, refresh)].flat().filter(Boolean));
      hasContent = true;
    } catch (err) {
      if (!alive) return;
      if (quiet && hasContent) toast(err.message, 'danger');
      else root.replaceChildren(errorState(err.message, () => refresh()));
    }
  }

  refresh();
  return { refresh, stop: () => (alive = false) };
}

// ---- forms ------------------------------------------------------------------

export function field(label, control, { hint, optional } = {}) {
  if (!control.id) control.id = uid('field');
  if (hint) control.setAttribute('aria-describedby', `${control.id}-hint`);
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field-label', for: control.id }, label, optional && h('span', { class: 'field-optional' }, 'Optional')),
    control,
    hint && h('p', { class: 'field-hint', id: `${control.id}-hint` }, hint),
  );
}

export const input = (props = {}) => h('input', { class: 'input', type: 'text', ...props });
export const textarea = (props = {}) => h('textarea', { class: 'input textarea', rows: 3, ...props });

export function select(props, options, value) {
  return h(
    'select',
    { class: 'input select', ...props },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? '') }, o.label)),
  );
}

export function formError() {
  const el = h('p', { class: 'form-error', role: 'alert', hidden: true });
  return {
    el,
    show(message) {
      el.textContent = message;
      el.hidden = false;
    },
    clear() {
      el.hidden = true;
    },
  };
}

export function segmented(options, value, onChange) {
  const el = h('div', { class: 'segmented', role: 'group' });
  const draw = (current) => {
    el.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          { type: 'button', class: 'segment', 'aria-pressed': String(o.value === current), onClick: () => { draw(o.value); onChange(o.value); } },
          o.label,
          o.count != null && h('span', { class: 'segment-count nums' }, o.count),
        ),
      ),
    );
  };
  draw(value);
  return el;
}

// ---- medication round meter -------------------------------------------------
// One bar instead of four stat tiles: the proportions are the information.

export function roundMeter(counts) {
  const late = counts.overdue + counts.missed;
  const skipped = counts.refused + counts.held;
  const parts = [
    ['given', counts.given, 'Given'],
    ['skipped', skipped, 'Refused or held'],
    ['due', counts.due, 'Due now'],
    ['late', late, 'Late'],
    ['upcoming', counts.upcoming, 'Later today'],
  ].filter(([key, n]) => key !== 'skipped' || n > 0); // only shown on a day it happened
  const summary = parts.map(([, n, label]) => `${n} ${label.toLowerCase()}`).join(', ');
  return h(
    'div',
    { class: 'meter-block' },
    h(
      'div',
      { class: 'meter', role: 'img', 'aria-label': `Of ${counts.total} doses: ${summary}.` },
      counts.total === 0
        ? h('span', { class: 'meter-part meter-part--upcoming', style: { 'flex-grow': '1' } })
        : parts.filter(([, n]) => n > 0).map(([key, n]) => h('span', { class: `meter-part meter-part--${key}`, style: { 'flex-grow': String(n) } })),
    ),
    h(
      'dl',
      { class: 'meter-legend' },
      parts.map(([key, n, label]) => h('div', { class: `meter-key meter-key--${key}` }, h('dt', null, label), h('dd', { class: 'nums' }, n))),
    ),
  );
}

// ---- sheets -----------------------------------------------------------------
// A real <dialog>: focus is trapped, Escape closes it, and on a phone it rises
// from the bottom edge and can be dragged down to dismiss.

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function openSheet({ title, subtitle, content, footer, onClose, focus } = {}) {
  const titleId = uid('sheet');
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId });
  const grabber = h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' });
  const closeBtn = button('Close', { variant: 'ghost', size: 'sm', icon: 'x', iconOnly: true, onClick: () => close() });
  const head = h(
    'header',
    { class: 'sheet-head' },
    h('div', null, h('h2', { id: titleId }, title), subtitle && h('p', null, subtitle)),
    closeBtn,
  );
  const body = h('div', { class: 'sheet-body' }, content);
  dialog.append(grabber, head, body);
  if (footer) dialog.append(h('footer', { class: 'sheet-foot' }, footer));

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    dialog.classList.remove('is-open');
    const finish = () => {
      dialog.close();
      dialog.remove();
      onClose?.(result);
    };
    if (reducedMotion()) finish();
    else setTimeout(finish, 230);
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  // A press that both starts and ends on the backdrop closes the sheet.
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => (pressedBackdrop = event.target === dialog));
  dialog.addEventListener('click', (event) => {
    if (pressedBackdrop && event.target === dialog) close();
  });

  // Drag down to dismiss (touch only; the grabber is hidden on desktop).
  let startY = null;
  const dragZone = [grabber, head];
  for (const zone of dragZone) {
    zone.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || event.target.closest('button')) return;
      startY = event.clientY;
      zone.setPointerCapture(event.pointerId);
      dialog.classList.add('is-dragging');
    });
    zone.addEventListener('pointermove', (event) => {
      if (startY == null) return;
      dialog.style.setProperty('--drag', `${Math.max(0, event.clientY - startY)}px`);
    });
    const end = (event) => {
      if (startY == null) return;
      const moved = event.clientY - startY;
      startY = null;
      dialog.classList.remove('is-dragging');
      dialog.style.removeProperty('--drag');
      if (moved > 110) close();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  document.body.append(dialog);
  dialog.showModal();
  // A form sheet starts in its first field rather than on the close button.
  focus?.focus({ preventScroll: true });
  requestAnimationFrame(() => dialog.classList.add('is-open'));
  return { close, el: dialog, body };
}

export function confirmSheet({ title, message, confirmLabel = 'Confirm', tone = 'primary' }) {
  return new Promise((resolve) => {
    let sheet;
    const cancel = button('Cancel', { variant: 'secondary', onClick: () => sheet.close(false) });
    const confirm = button(confirmLabel, { variant: tone, onClick: () => sheet.close(true) });
    sheet = openSheet({
      title,
      content: h('p', { class: 'sheet-message' }, message),
      footer: [cancel, confirm],
      onClose: (result) => resolve(result === true),
    });
  });
}

// ---- toasts -----------------------------------------------------------------

let toastHost = null;

export function toast(message, tone = 'ok') {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h('div', { class: `toast toast--${tone}` }, icon(tone === 'danger' ? 'alert' : 'check', 18), h('span', null, message));
  toastHost.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 260);
  }, tone === 'danger' ? 5200 : 3200);
}
