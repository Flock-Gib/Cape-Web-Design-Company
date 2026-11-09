import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { STATUSES, PACKAGES, METHODS, STARTER, money, cents, httpUrl, nyToday, amounts, dashboard, emailText } from './model.js';

const $ = selector => document.querySelector(selector);
const content = $('#content');
let client;
let session;
let expiryTimer;
let generation = 0;
let busy = false;
let view = 'home';
let selectedId;
let records = { orders: [], payments: [], tasks: [] };
let search = '';
let statusFilter = '';

function el(tag, text, props = {}) {
  const node = document.createElement(tag);
  if (text !== null && text !== undefined) node.textContent = text;
  Object.assign(node, props);
  return node;
}
function notice(text = '', error = false) {
  $('#notice').textContent = text;
  $('#notice').className = error ? 'error' : '';
  $('#notice').setAttribute('role', error ? 'alert' : 'status');
}
function button(text, action, className = '') {
  const node = el('button', text, { type: 'button', className });
  node.addEventListener('click', action);
  return node;
}
function field(form, label, name, value = '', options = {}) {
  const wrapper = el('div', null, { className: 'field' });
  const id = `field-${crypto.randomUUID()}`;
  wrapper.append(el('label', label, { htmlFor: id }));
  let input;
  if (options.choices) {
    input = el('select', null, { name });
    for (const choice of options.choices) input.append(el('option', choice, { value: choice }));
    input.value = value;
  } else {
    const { multiline, ...attributes } = options;
    input = el(multiline ? 'textarea' : 'input', null, { name, value: value ?? '', ...attributes });
  }
  input.id = id;
  wrapper.append(input);
  form.append(wrapper);
  return input;
}
function panel(title) {
  const node = el('section', null, { className: 'panel' });
  node.append(el('h2', title));
  return node;
}
function link(text, url) {
  try {
    return el('a', text, { href: httpUrl(url), target: '_blank', rel: 'noopener noreferrer', className: 'button' });
  } catch {
    return el('p', 'The saved website URL is invalid. Open the project and correct its live URL before following it.', { className: 'warning' });
  }
}
function showDate(value) {
  return value ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not completed';
}
function clearSession(message = '') {
  generation++;
  clearTimeout(expiryTimer);
  session = null;
  records = { orders: [], payments: [], tasks: [] };
  selectedId = undefined;
  search = '';
  statusFilter = '';
  view = 'home';
  busy = false;
  content.replaceChildren();
  $('#workspace').hidden = true;
  $('#sign-out').hidden = true;
  $('#login').hidden = false;
  $('#login-form').reset();
  setBusy(false);
  notice(message);
}
function setBusy(value) {
  busy = value;
  for (const node of document.querySelectorAll('#workspace button, #workspace input, #workspace select, #workspace textarea, #login-form button, #login-form input')) node.disabled = value;
  $('#workspace').setAttribute('aria-busy', String(value));
  $('#login-form').setAttribute('aria-busy', String(value));
}
function checkSession() {
  if (!session || session.expires_at * 1000 <= Date.now()) {
    clearSession('Your session expired. Sign in again to continue.');
    if (client) void client.auth.signOut({ scope: 'local' }).then(({ error }) => {
      if (error) notice(`Session ended. Local sign-out could not finish: ${error.message}`, true);
    });
    return false;
  }
  return true;
}
async function run(action) {
  if (busy || !checkSession()) return;
  const current = generation;
  setBusy(true);
  notice('Saving / loading...');
  try {
    await action(current);
  } catch (error) {
    if (current === generation) {
      if (error.authFailure) {
        clearSession(`Access could not be verified: ${error.message}. Sign in again to continue.`);
        const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
        if (signOutError) notice(`Access denied and records cleared. Local sign-out error: ${signOutError.message}`, true);
      } else if (checkSession()) notice(`${error.message} If a save was interrupted, refresh records to confirm it before retrying.`, true);
    }
  } finally {
    if (current === generation) setBusy(false);
  }
}
function result(response) {
  if (response.error) {
    const error = new Error(response.error.message);
    error.authFailure = [401, 403].includes(response.status || response.error.status) || response.error.code === '42501';
    throw error;
  }
  return response.data;
}
async function allRows(table) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const page = result(await client.from(table).select('*').order('id').range(from, from + 499));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
async function load(current, message = '') {
  const user = result(await client.auth.getUser()).user;
  if (current !== generation || !checkSession()) return;
  const membership = result(await client.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle());
  if (current !== generation || !checkSession()) return;
  if (!membership) {
    clearSession('This account is not an allowed admin. Ask the owner to check the SQL allowlist.');
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) notice(`Access denied. Sign-out error: ${error.message}`, true);
    return;
  }
  try {
    const [orders, payments, tasks] = await Promise.all(['orders', 'order_payments', 'order_tasks'].map(allRows));
    if (current !== generation || !checkSession()) return;
    records = { orders, payments, tasks };
    $('#login').hidden = true;
    $('#workspace').hidden = false;
    $('#sign-out').hidden = false;
    render();
    notice(message);
  } catch (error) {
    if (current === generation) {
      records = { orders: [], payments: [], tasks: [] };
      content.replaceChildren(el('p', 'Records could not be loaded. Use Refresh records to retry.', { className: 'panel' }));
    }
    throw error;
  }
}
function navigate(next, id) {
  if (busy || !checkSession()) return;
  view = next;
  selectedId = id;
  notice();
  render();
  content.querySelector('h1, h2')?.focus({ preventScroll: true });
}
function render() {
  content.replaceChildren();
  for (const tab of document.querySelectorAll('[data-view]')) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (view === 'home') renderHome();
  else if (view === 'new') renderNew();
  else if (view === 'detail') renderDetail();
  else renderOrders();
  for (const heading of content.querySelectorAll('h1, h2')) heading.tabIndex = -1;
}
function openOrder(order) {
  return button(order.business_name, () => navigate('detail', order.id));
}
function renderHome() {
  content.append(el('h1', 'A clear view of your week.'));
  content.append(el('p', `Today: ${nyToday()} / America/New_York. Payment dates are bookkeeping dates, not processing timestamps.`, { className: 'muted' }));
  const summary = dashboard(records.orders, records.payments, records.tasks);
  const stats = el('div', null, { className: 'stats' });
  for (const [label, value] of [
    ['Active orders', summary.active], ['Waiting on client', summary.waiting],
    ['Overdue tasks', summary.overdue.length], ['Tasks due in next 7 days', summary.upcoming.length],
    ['Outstanding on accepted projects', money(summary.outstanding)], ['Payments this month', money(summary.monthly)],
  ]) {
    const item = el('div', label, { className: 'stat' });
    item.append(el('strong', value));
    stats.append(item);
  }
  content.append(stats);
  for (const [title, tasks] of [['Overdue tasks', summary.overdue], ['Today and the next seven days', summary.upcoming]]) {
    const section = panel(title);
    if (!tasks.length) section.append(el('p', 'No tasks here. Enjoy the breathing room.'));
    for (const task of tasks) {
      const order = records.orders.find(item => item.id === task.order_id);
      const row = el('div', null, { className: 'record' });
      row.append(el('p', `${task.title} / Due ${task.due_date}`), openOrder(order));
      section.append(row);
    }
    content.append(section);
  }
}
function renderNew() {
  const section = panel('New Inquiry');
  section.append(el('p', 'Start with two details. Add the scope, links, notes, and payments as the project develops.'));
  const form = el('form');
  field(form, 'Business name', 'business_name', '', { required: true, maxLength: 200 });
  field(form, 'Contact email', 'email', '', { type: 'email', required: true, maxLength: 320 });
  form.append(el('p', 'Starts as New Inquiry with the $500 one-page refresh preset. You can change the package and quote immediately.', { className: 'muted' }));
  form.append(el('button', 'Create inquiry', { type: 'submit', className: 'button' }));
  const id = crypto.randomUUID();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    void run(async current => {
      result(await client.from('orders').insert({ id, business_name: data.get('business_name').trim(), email: data.get('email').trim() }).select('id').single());
      if (current !== generation) return;
      view = 'detail';
      selectedId = id;
      await load(current, 'Inquiry created.');
    });
  });
  section.append(form);
  content.append(section);
}
function renderOrders() {
  const completed = view === 'completed';
  content.append(el('h1', completed ? 'Completed websites.' : 'Orders in motion.'));
  const controls = el('div', null, { className: 'grid' });
  const query = field(controls, 'Search business, contact, or email', 'search', search, { type: 'search' });
  let filter;
  if (!completed) filter = field(controls, 'Status', 'status', statusFilter, { choices: ['', ...STATUSES.filter(status => status !== 'Completed')] });
  if (filter) filter.options[0].textContent = 'All unfinished / cancelled';
  const list = panel(completed ? 'Newest completion first' : 'Project list');
  const update = () => {
    search = query.value;
    statusFilter = filter?.value || '';
    list.replaceChildren();
    const matches = records.orders.filter(order => (completed ? order.status === 'Completed' : order.status !== 'Completed') &&
      (!statusFilter || order.status === statusFilter) &&
      `${order.business_name} ${order.contact_name} ${order.email}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (completed ? b.completed_at.localeCompare(a.completed_at) : b.created_at.localeCompare(a.created_at)));
    if (!matches.length) list.append(el('p', 'No matching orders. Start with New Inquiry.'));
    for (const order of matches) {
      const row = el('article', null, { className: 'record' });
      const totals = amounts(order, records.payments);
      row.append(openOrder(order), el('p', `${order.status} / ${order.contact_name || order.email}`),
        el('p', `${money(order.quoted_total_cents)} quoted / ${money(totals.received)} received / ${money(Math.max(0, totals.balance))} balance`));
      if (completed) row.append(el('p', `Completed ${showDate(order.completed_at)}`), link('Open Live Website', order.live_url));
      list.append(row);
    }
  };
  query.addEventListener('input', update);
  filter?.addEventListener('change', update);
  content.append(controls, list);
  update();
}
function renderDetail() {
  const order = records.orders.find(item => item.id === selectedId);
  if (!order) {
    content.append(el('p', 'This order is not available. Refresh records or choose another order.', { className: 'panel' }));
    return;
  }
  content.append(el('h1', order.business_name));
  content.append(el('p', `Created ${showDate(order.created_at)} / Updated ${showDate(order.updated_at)}${order.completed_at ? ` / Completed ${showDate(order.completed_at)}` : ''}`, { className: 'muted' }));
  const totals = amounts(order, records.payments);
  const summary = panel('Quote & bookkeeping');
  summary.append(el('p', `Quoted ${money(order.quoted_total_cents)} / Expected 50% deposit ${money(totals.deposit)} / Received ${money(totals.received)} / Remaining ${money(Math.max(0, totals.balance))}`));
  if (totals.balance < 0) summary.append(el('p', `${money(-totals.balance)} overpaid. Reconcile this credit separately.`, { className: 'warning' }));
  if (totals.balance > 0) summary.append(el('p', `${money(totals.balance)} remains unpaid. Completing an order does not record a payment.`, { className: 'warning' }));
  if (order.status === 'Completed') {
    summary.append(link('Open Live Website', order.live_url), button('Reopen order', () => void run(async current => {
      result(await client.from('orders').update({ status: 'In Progress' }).eq('id', order.id).select('id').single());
      await load(current, 'Order reopened. Notes, payments, and tasks are preserved.');
    })));
  }
  content.append(summary);
  const section = panel('Project details');
  const form = el('form');
  const grid = el('div', null, { className: 'grid' });
  field(grid, 'Business name', 'business_name', order.business_name, { required: true, maxLength: 200 });
  field(grid, 'Contact name', 'contact_name', order.contact_name, { maxLength: 200 });
  field(grid, 'Email', 'email', order.email, { type: 'email', required: true, maxLength: 320 });
  field(grid, 'Phone (optional)', 'phone', order.phone, { type: 'tel', maxLength: 80 });
  const packageInput = field(grid, 'Package', 'package', order.package, { choices: Object.keys(PACKAGES) });
  const totalInput = field(grid, 'Quoted total ($)', 'quoted_total', (order.quoted_total_cents / 100).toFixed(2), { type: 'number', min: '0', max: '1000000', step: '.01', required: true });
  packageInput.addEventListener('change', () => { totalInput.value = (PACKAGES[packageInput.value] / 100).toFixed(2); });
  field(grid, 'Status', 'status', order.status, { choices: STATUSES });
  field(grid, 'Target launch date', 'target_launch_date', order.target_launch_date, { type: 'date' });
  for (const [name, label] of [['current_url', 'Current website URL'], ['preview_url', 'Preview URL'], ['live_url', 'Live website URL (required to complete)'], ['repo_url', 'GitHub repo URL (optional)']]) {
    field(grid, label, name, order[name], { type: 'url', maxLength: 2048 });
  }
  form.append(grid);
  field(form, 'Private notes', 'notes', order.notes, { multiline: true, maxLength: 20000 });
  form.append(el('button', 'Save project', { type: 'submit', className: 'button' }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    void run(async current => {
      const { quoted_total, ...update } = data;
      update.business_name = update.business_name.trim();
      update.email = update.email.trim();
      update.quoted_total_cents = cents(quoted_total);
      update.target_launch_date ||= null;
      for (const key of ['current_url', 'preview_url', 'live_url', 'repo_url']) update[key] = httpUrl(update[key]);
      if (update.status === 'Completed' && !update.live_url) throw new Error('Save a valid live website URL before completing this order.');
      const balance = update.quoted_total_cents - totals.received;
      if (update.status === 'Completed' && order.status !== 'Completed' && balance > 0 &&
        !confirm(`${money(balance)} remains unpaid. Complete this order anyway? This will not record a payment.`)) {
        notice('Completion cancelled. Your changes have not been saved.');
        return;
      }
      result(await client.from('orders').update(update).eq('id', order.id).select('id').single());
      await load(current, 'Project saved.');
    });
  });
  section.append(form);
  content.append(section);
  renderPayments(order);
  renderTasks(order);
  const emails = panel('Draft messages');
  emails.append(el('p', 'Uses saved project details only. Review and send from your own email account; nothing is sent here.'));
  const actions = el('div', null, { className: 'actions' });
  const preview = el('pre', '', { className: 'copy-preview' });
  for (const [kind, label] of [['quote', 'Copy quote email'], ['deposit', 'Copy deposit reminder'], ['balance', 'Copy balance-due email']]) {
    actions.append(button(label, async () => {
      if (!checkSession()) return;
      const text = emailText(kind, order, records.payments);
      preview.textContent = text;
      const current = generation;
      try {
        await navigator.clipboard.writeText(text);
        if (current === generation) notice('Draft copied. Review it before sending.');
      } catch {
        if (current === generation) notice('Clipboard unavailable. Select and copy the displayed draft manually.', true);
      }
    }));
  }
  emails.append(actions, preview);
  content.append(emails);
}
function renderPayments(order) {
  const section = panel('Received payments');
  section.append(el('p', 'Bookkeeping only: record payments you have already received separately. No payments are requested or processed here.'));
  const history = el('div');
  const form = el('form');
  const heading = el('h3', 'Record a received payment');
  let editId;
  const amount = field(form, 'Amount received ($)', 'amount', '', { type: 'number', min: '.01', max: '1000000', step: '.01', required: true });
  const date = field(form, 'Date received', 'received_date', nyToday(), { type: 'date', required: true, max: nyToday() });
  const method = field(form, 'Method', 'method', 'Cash', { choices: METHODS });
  const note = field(form, 'Note or invoice reference (optional)', 'note', '', { maxLength: 1000 });
  const cancel = button('Cancel correction', () => {
    editId = undefined;
    form.reset();
    heading.textContent = 'Record a received payment';
    cancel.hidden = true;
  });
  cancel.hidden = true;
  const payments = records.payments.filter(item => item.order_id === order.id).sort((a, b) => b.received_date.localeCompare(a.received_date));
  if (!payments.length) history.append(el('p', 'No received payments yet.'));
  for (const payment of payments) {
    const row = el('div', null, { className: 'record' });
    row.append(el('p', `${money(payment.amount_cents)} / ${payment.received_date} / ${payment.method}`), el('p', payment.note));
    row.append(button('Correct entry', () => {
      editId = payment.id;
      amount.value = (payment.amount_cents / 100).toFixed(2);
      date.value = payment.received_date;
      method.value = payment.method;
      note.value = payment.note;
      heading.textContent = 'Correct received payment';
      cancel.hidden = false;
      amount.focus();
    }));
    history.append(row);
  }
  form.append(el('button', 'Save payment', { type: 'submit', className: 'button' }), cancel);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    void run(async current => {
      if (data.get('received_date') > nyToday()) throw new Error('A received payment cannot have a future date.');
      const payment = { order_id: order.id, amount_cents: cents(data.get('amount'), true), received_date: data.get('received_date'), method: data.get('method'), note: data.get('note').trim() };
      const query = editId ? client.from('order_payments').update(payment).eq('id', editId) : client.from('order_payments').insert(payment);
      result(await query.select('id').single());
      await load(current, 'Payment saved. Totals recalculated from received payments.');
    });
  });
  section.append(history, heading, form);
  content.append(section);
}
function renderTasks(order) {
  const section = panel('Project checklist');
  const tasks = records.tasks.filter(item => item.order_id === order.id).sort((a, b) =>
    a.created_at.localeCompare(b.created_at) ||
    STARTER.findIndex(([key]) => key === a.starter_key) - STARTER.findIndex(([key]) => key === b.starter_key));
  section.append(button('Add starter checklist', () => void run(async current => {
    const missing = STARTER.filter(([key, title]) => !tasks.some(task => task.starter_key === key || task.title.toLowerCase() === title.toLowerCase()));
    if (missing.length) {
      result(await client.from('order_tasks').upsert(missing.map(([starter_key, title]) => ({ order_id: order.id, starter_key, title })), { onConflict: 'order_id,starter_key', ignoreDuplicates: true }));
    }
    await load(current, missing.length ? 'Starter checklist added without duplicates.' : 'Starter checklist is already present.');
  })));
  if (!tasks.length) section.append(el('p', 'No tasks yet. Add your own task or use the starter checklist.'));
  const form = el('form');
  let editId;
  const title = field(form, 'Task title', 'title', '', { required: true, maxLength: 300 });
  const due = field(form, 'Due date (optional)', 'due_date', '', { type: 'date' });
  const cancel = button('Cancel task edit', () => { editId = undefined; form.reset(); cancel.hidden = true; });
  cancel.hidden = true;
  for (const task of tasks) {
    const row = el('div', null, { className: 'record' });
    const label = el('label', null, { className: 'check' });
    const checkbox = el('input', null, { type: 'checkbox', checked: task.completed });
    checkbox.addEventListener('change', () => void run(async current => {
      try {
        result(await client.from('order_tasks').update({ completed: checkbox.checked }).eq('id', task.id).select('id').single());
        await load(current, 'Task updated.');
      } catch (error) {
        checkbox.checked = task.completed;
        throw error;
      }
    }));
    label.append(checkbox, el('span', `${task.title}${task.due_date ? ` / Due ${task.due_date}` : ''}`));
    row.append(label, button('Edit task', () => {
      editId = task.id;
      title.value = task.title;
      due.value = task.due_date || '';
      cancel.hidden = false;
      title.focus();
    }));
    section.append(row);
  }
  form.append(el('button', 'Save task', { type: 'submit', className: 'button' }), cancel);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    void run(async current => {
      const task = { order_id: order.id, title: data.get('title').trim(), due_date: data.get('due_date') || null };
      const query = editId ? client.from('order_tasks').update(task).eq('id', editId) : client.from('order_tasks').insert(task);
      result(await query.select('id').single());
      await load(current, 'Task saved.');
    });
  });
  section.append(form);
  content.append(section);
}

for (const tab of document.querySelectorAll('[data-view]')) tab.addEventListener('click', () => navigate(tab.dataset.view));
$('#refresh').addEventListener('click', () => void run(current => load(current, 'Records refreshed.')));
$('#sign-out').addEventListener('click', async () => {
  clearSession('Signed out. Business records have been cleared from this page.');
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) notice(`Records cleared, but sign-out returned an error: ${error.message}`, true);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && session) checkSession(); });
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const data = new FormData(event.currentTarget);
  const current = generation;
  setBusy(true);
  notice('Signing in and verifying admin access...');
  try {
    const response = result(await client.auth.signInWithPassword({ email: data.get('email').trim(), password: data.get('password') }));
    $('#login-form').reset();
    if (current !== generation) return;
    session = response.session;
    expiryTimer = setTimeout(() => checkSession(), Math.max(0, session.expires_at * 1000 - Date.now() + 50));
    await load(current);
  } catch (error) {
    if (current === generation) {
      clearSession(`Sign-in failed: ${error.message}`);
      const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
      if (signOutError) notice(`Sign-in failed: ${error.message}. Local session cleanup failed: ${signOutError.message}`, true);
    }
  } finally {
    if (current === generation) setBusy(false);
  }
});

async function init() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || SUPABASE_URL.includes('YOUR_') || SUPABASE_PUBLISHABLE_KEY.includes('YOUR_')) {
    $('#setup').textContent = 'Setup required: enter your Supabase project URL and publishable key in public/admin/config.js, then follow docs/admin-setup.md to apply the migration and allowlist your Auth UUID. No business records have been loaded.';
    return;
  }
  try {
    const url = new URL(SUPABASE_URL);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Supabase project URL must use HTTPS (HTTP is allowed only for a local test server).');
    }
    if (SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_')) throw new Error('Never use a Supabase secret key in browser configuration.');
    if (SUPABASE_PUBLISHABLE_KEY.startsWith('eyJ')) {
      const payload = JSON.parse(atob(SUPABASE_PUBLISHABLE_KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error('Only a publishable key (or legacy anon key) may be used in the browser.');
    }
    await import('./vendor/supabase-2.49.8/supabase.js');
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && session) clearSession('Your session ended. Sign in again to continue.');
    });
    $('#setup').textContent = 'Use your confirmed, allowlisted Supabase Auth account. Sessions stay in memory and end when the token expires.';
    $('#login-form').hidden = false;
  } catch (error) {
    $('#setup').textContent = `Sign-in setup could not load: ${error.message}. Check config.js, your connection, and the setup guide.`;
  }
}
void init();
