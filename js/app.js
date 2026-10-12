// Boot, sign-in state, the app shell and routing between screens.
import { api, setSignedOutHandler } from './api.js';
import { h } from './dom.js';
import { brandMark, icon } from './icons.js';
import { avatar, button, errorState, field, formError, group, input, openSheet, row, toast, withBusy } from './ui.js';
import * as login from './screens/login.js';
import * as setup from './screens/setup.js';
import * as staffShift from './screens/staff-shift.js';
import * as staffMeds from './screens/staff-meds.js';
import * as staffInbox from './screens/staff-inbox.js';
import * as adminOverview from './screens/admin-overview.js';
import * as adminMeds from './screens/admin-meds.js';
import * as adminPatients from './screens/admin-patients.js';
import * as adminStaff from './screens/admin-staff.js';
import * as adminAttendance from './screens/admin-attendance.js';
import * as adminMessages from './screens/admin-messages.js';
import * as adminSettings from './screens/admin-settings.js';

// The phone tab bar shows the first items; anything marked `more` sits behind a More tab.
const NAV = {
  staff: [
    { path: 'shift', label: 'Shift', icon: 'clock', screen: staffShift },
    { path: 'meds', label: 'Medications', short: 'Meds', icon: 'pill', screen: staffMeds },
    { path: 'inbox', label: 'Inbox', icon: 'inbox', screen: staffInbox, badge: true },
  ],
  admin: [
    { path: 'overview', label: 'Overview', icon: 'grid', screen: adminOverview },
    { path: 'meds', label: 'Medications', short: 'Meds', icon: 'pill', screen: adminMeds },
    { path: 'patients', label: 'Patients', icon: 'bed', screen: adminPatients },
    { path: 'messages', label: 'Messages', icon: 'inbox', screen: adminMessages, badge: true },
    { path: 'staff', label: 'Staff', icon: 'users', screen: adminStaff, more: true },
    { path: 'attendance', label: 'Attendance', icon: 'list', screen: adminAttendance, more: true },
    { path: 'settings', label: 'Settings', icon: 'sliders', screen: adminSettings, more: true },
  ],
};

const UNREAD_POLL_MS = 45000;
const app = document.getElementById('app');
const state = { user: null, facilityName: 'MedicApp', unread: 0, cleanup: null, shell: null, poll: null };

function leaveScreen() {
  state.cleanup?.();
  state.cleanup = null;
}

// ---- sign-in ----------------------------------------------------------------

function showLogin(notice) {
  leaveScreen();
  clearInterval(state.poll);
  state.shell = null;
  document.title = 'Sign in · MedicApp';
  app.replaceChildren(
    login.render({
      facilityName: state.facilityName,
      notice,
      onSignedIn(user) {
        state.user = user;
        showShell();
      },
    }),
  );
  app.querySelector('input')?.focus();
}

// An empty database: the first person in creates the admin account.
function showSetup(setupState) {
  document.title = 'Set up · MedicApp';
  app.replaceChildren(
    setup.render({
      setup: setupState,
      onDone(user, facilityName) {
        state.user = user;
        state.facilityName = facilityName;
        // Straight to Settings: the geofence needs a location before anyone can clock in.
        history.replaceState(null, '', '#/settings');
        showShell();
        toast('Account created. Set your location to finish.');
      },
    }),
  );
  app.querySelector('input')?.focus();
}

async function signOut() {
  await api.post('/api/auth/logout').catch(() => {});
  state.user = null;
  history.replaceState(null, '', location.pathname);
  showLogin();
}

// ---- shell ------------------------------------------------------------------

function navLink(item, kind) {
  return h(
    'a',
    { class: `${kind}-link`, href: `#/${item.path}`, 'data-path': item.path },
    h('span', { class: 'nav-icon' }, icon(item.icon, kind === 'tab' ? 22 : 19), item.badge && h('span', { class: 'nav-badge nums', hidden: true })),
    h('span', { class: 'nav-label' }, kind === 'tab' ? item.short || item.label : item.label),
  );
}

function showShell() {
  const { user } = state;
  const items = NAV[user.role];
  const primary = items.filter((i) => !i.more);
  const more = items.filter((i) => i.more);

  const facilityLabels = [h('span', { class: 'rail-facility' }, state.facilityName), h('span', { class: 'topbar-title' }, state.facilityName)];
  const view = h('main', { class: 'view', id: 'view', tabindex: '-1' });

  const rail = h(
    'aside',
    { class: 'rail' },
    h('a', { class: 'rail-brand', href: `#/${items[0].path}` }, brandMark(32), h('span', { class: 'rail-brand-text' }, h('span', { class: 'rail-app' }, 'MedicApp'), facilityLabels[0])),
    h('nav', { class: 'rail-nav', 'aria-label': 'Main' }, items.map((item) => navLink(item, 'rail'))),
    h(
      'button',
      { class: 'rail-account', type: 'button', onClick: openAccount },
      avatar(user.name, 'sm'),
      h('span', { class: 'rail-account-text' }, h('span', { class: 'rail-account-name' }, user.name), h('span', { class: 'rail-account-role' }, user.job_title || (user.role === 'admin' ? 'Admin' : 'Staff'))),
      icon('more', 18),
    ),
  );

  const topbar = h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'topbar-brand' }, brandMark(28), facilityLabels[1]),
    h('button', { class: 'topbar-account', type: 'button', 'aria-label': 'Your account', onClick: openAccount }, avatar(user.name, 'sm')),
  );

  const moreTab =
    more.length > 0 &&
    h('button', { class: 'tab-link', type: 'button', 'data-more': '', onClick: () => openMore(more) }, h('span', { class: 'nav-icon' }, icon('more', 22)), h('span', { class: 'nav-label' }, 'More'));
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, primary.map((item) => navLink(item, 'tab')), moreTab);

  state.shell = { view, items, more, root: h('div', { class: 'shell' }, rail, h('div', { class: 'main' }, topbar, view), tabbar), facilityLabels };
  app.replaceChildren(state.shell.root);

  // Staff are badged for unread messages, admins for unread replies.
  clearInterval(state.poll);
  refreshUnread();
  state.poll = setInterval(() => !document.hidden && refreshUnread(), UNREAD_POLL_MS);
  route();
}

function openMore(items) {
  let sheet;
  sheet = openSheet({
    title: 'More',
    content: group(items.map((item) => row({ leading: icon(item.icon, 20), title: item.label, chevron: true, href: `#/${item.path}`, onClick: () => sheet.close() }))),
  });
}

async function refreshUnread() {
  try {
    const { count } = await api.get('/api/messages/unread');
    state.unread = count;
    for (const el of document.querySelectorAll('.nav-badge')) {
      el.textContent = count > 9 ? '9+' : String(count);
      el.hidden = count === 0;
    }
  } catch {
    // The badge is a convenience; a failed poll is not worth interrupting anyone.
  }
}

function setFacilityName(name) {
  state.facilityName = name;
  for (const el of state.shell?.facilityLabels ?? []) el.textContent = name;
}

// ---- account ----------------------------------------------------------------

function openAccount() {
  const { user } = state;
  const current = input({ type: 'password', autocomplete: 'current-password' });
  const next = input({ type: 'password', autocomplete: 'new-password', minlength: 8 });
  const error = formError();
  const save = button('Change password', { variant: 'secondary', type: 'submit' });

  async function onSubmit(event) {
    event.preventDefault();
    error.clear();
    if (!current.value || !next.value) return error.show('Enter your current password and a new one.');
    await withBusy(save, async () => {
      try {
        await api.post('/api/auth/password', { current_password: current.value, new_password: next.value });
        sheet.close();
        toast('Password changed');
      } catch (err) {
        error.show(err.message);
      }
    });
  }

  const sheet = openSheet({
    title: 'Your account',
    content: [
      h(
        'div',
        { class: 'identity' },
        avatar(user.name, 'lg'),
        h('div', null, h('p', { class: 'identity-name' }, user.name), h('p', { class: 'identity-meta' }, [user.job_title, `@${user.username}`].filter(Boolean).join(' · '))),
      ),
      h(
        'form',
        { class: 'form', onSubmit, novalidate: true },
        h('h3', { class: 'form-title' }, 'Change password'),
        field('Current password', current),
        field('New password', next, { hint: 'At least 8 characters.' }),
        error.el,
        save,
      ),
    ],
    footer: [button('Sign out', { variant: 'ghost', icon: 'logout', onClick: () => { sheet.close(); signOut(); } })],
  });
}

// ---- routing ----------------------------------------------------------------

function route() {
  if (!state.user || !state.shell) return;
  const { view, items, more } = state.shell;
  const [path, ...args] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const item = items.find((i) => i.path === path);
  if (!item) {
    location.replace(`#/${items[0].path}`);
    return;
  }

  leaveScreen();
  // A sheet belongs to the screen that opened it.
  for (const dialog of document.querySelectorAll('dialog.sheet')) {
    dialog.close();
    dialog.remove();
  }
  for (const link of document.querySelectorAll('[data-path]')) {
    if (link.dataset.path === item.path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const moreTab = document.querySelector('[data-more]');
  if (moreTab) moreTab.toggleAttribute('aria-current', more.includes(item));

  document.title = `${item.label} · MedicApp`;
  view.replaceChildren();
  window.scrollTo(0, 0);
  const ctx = { user: state.user, facilityName: state.facilityName, setFacilityName, refreshUnread };
  try {
    state.cleanup = item.screen.mount(view, ctx, args) || null;
  } catch (err) {
    console.error(err);
    view.replaceChildren(errorState('This screen ran into a problem. Reload the page to try again.'));
  }
}

window.addEventListener('hashchange', route);

async function boot() {
  setSignedOutHandler(() => {
    if (!state.user) return;
    state.user = null;
    showLogin('Your session has ended. Sign in again to continue.');
  });
  try {
    const me = await api.get('/api/auth/me');
    state.facilityName = me.facility_name;
    state.user = me.user;
    if (me.setup.required) return showSetup(me.setup);
  } catch (err) {
    app.replaceChildren(h('div', { class: 'boot-error' }, errorState(err.message, () => location.reload())));
    return;
  }
  if (state.user) showShell();
  else showLogin();
}

boot();
