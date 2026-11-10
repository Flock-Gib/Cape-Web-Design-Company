export const STATUSES = [
  'New Inquiry', 'Quote Sent', 'Awaiting Deposit', 'Booked', 'In Progress',
  'Waiting on Client', 'Ready to Launch', 'Completed', 'Cancelled',
];
export const PACKAGES = { 'One-page refresh': 50000, Redesign: 90000 };
export const METHODS = ['Cash', 'Check', 'Venmo Business'];
export const STARTER = [
  ['content', 'Collect content and images'],
  ['preview', 'Share the preview'],
  ['approval', 'Get client approval'],
  ['testing', 'Test the live site and contact form'],
  ['handoff', 'Hand off the site'],
];
const ACCEPTED = new Set(['Booked', 'In Progress', 'Waiting on Client', 'Ready to Launch', 'Completed']);
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function cents(value, positive = false) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(String(value))) throw new Error('Enter a dollar amount with at most two decimal places.');
  const [whole, fraction = ''] = String(value).split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (result > 100000000 || result < (positive ? 1 : 0)) throw new Error('Amount must be ' + (positive ? 'greater than zero' : 'zero or greater') + ' and no more than $1,000,000.');
  return result;
}
export function httpUrl(value) {
  const text = value.trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error('Website links must be full HTTP or HTTPS URLs.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !/^https?:\/\//i.test(text) || url.username || url.password || /\s/.test(text)) {
    throw new Error('Use an HTTP or HTTPS URL without embedded credentials or spaces.');
  }
  return url.href;
}
export function nyToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function amounts(order, payments) {
  const received = payments.filter(payment => payment.order_id === order.id).reduce((sum, payment) => sum + payment.amount_cents, 0);
  return { received, deposit: Math.round(order.quoted_total_cents / 2), balance: order.quoted_total_cents - received };
}
export function dashboard(orders, payments, tasks, today = nyToday()) {
  const active = orders.filter(order => !['Completed', 'Cancelled'].includes(order.status));
  const activeIds = new Set(active.map(order => order.id));
  const openTasks = tasks.filter(task => !task.completed && activeIds.has(task.order_id) && task.due_date);
  return {
    active: active.length,
    waiting: active.filter(order => order.status === 'Waiting on Client').length,
    overdue: openTasks.filter(task => task.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    upcoming: openTasks.filter(task => task.due_date >= today && task.due_date <= addDays(today, 7)).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    outstanding: orders.filter(order => ACCEPTED.has(order.status)).reduce((sum, order) => sum + Math.max(0, amounts(order, payments).balance), 0),
    monthly: payments.filter(payment => payment.received_date.slice(0, 7) === today.slice(0, 7) && payment.received_date <= today).reduce((sum, payment) => sum + payment.amount_cents, 0),
  };
}
export function emailText(kind, order, payments) {
  const totals = amounts(order, payments);
  const name = order.contact_name || order.business_name;
  const intro = `Hi ${name},\n\n`;
  if (kind === 'quote') return `${intro}The quote for ${order.business_name}'s ${order.package.toLowerCase()} is ${money(order.quoted_total_cents)}. The expected 50% deposit is ${money(totals.deposit)}; the remainder is due at launch.\n\nPlease reply to confirm the scope and timing before we begin.\n\nThank you!`;
  if (kind === 'deposit') return `${intro}A quick reminder about the ${money(totals.deposit)} expected deposit for ${order.business_name}. Payments recorded so far total ${money(totals.received)}; ${money(Math.max(0, totals.deposit - totals.received))} remains toward the deposit.\n\nPlease refer to your invoice for payment instructions.\n\nThank you!`;
  return `${intro}For ${order.business_name}, the quoted total is ${money(order.quoted_total_cents)} and payments recorded total ${money(totals.received)}. The remaining balance is ${money(Math.max(0, totals.balance))}.${totals.balance < 0 ? ` There is a ${money(-totals.balance)} credit to reconcile.` : ''}\n\nPlease refer to your invoice for payment instructions.\n\nThank you!`;
}
