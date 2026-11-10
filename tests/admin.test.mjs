import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, httpUrl, nyToday, addDays, amounts, dashboard, emailText } from '../public/admin/model.js';

const order = { id: 'fake-order', business_name: 'Example Studio', contact_name: 'Alex', package: 'Redesign', quoted_total_cents: 90000, status: 'Booked' };
const payment = { order_id: order.id, amount_cents: 45000, received_date: '2026-11-09' };

test('money is integer cents, including decimal rounding boundaries', () => {
  assert.equal(cents('900'), 90000);
  assert.equal(cents('450.01'), 45001);
  assert.equal(cents('0.29'), 29);
  assert.equal(cents('1000000'), 100000000);
  for (const invalid of ['-1', 'Infinity', '1e3', '.1', '1.001', '', '1000001']) assert.throws(() => cents(invalid));
  assert.throws(() => cents('0', true));
});
test('deposit and balance derive only from received payments', () => {
  assert.deepEqual(amounts(order, []), { received: 0, deposit: 45000, balance: 90000 });
  assert.deepEqual(amounts(order, [payment]), { received: 45000, deposit: 45000, balance: 45000 });
  assert.equal(amounts(order, [payment, payment]).balance, 0);
  assert.equal(amounts(order, [{ ...payment, amount_cents: 100000 }]).balance, -10000);
});
test('only valid credential-free HTTP(S) links are accepted', () => {
  assert.equal(httpUrl(' https://example.com '), 'https://example.com/');
  assert.equal(httpUrl('http://localhost:8787/demo/'), 'http://localhost:8787/demo/');
  assert.equal(httpUrl(''), '');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//example.com', 'https://', 'https://a b.com', 'https://user:pass@example.com', 'https:example.com', 'https://example.com:999999']) assert.throws(() => httpUrl(value));
});
test('New York date handles UTC midnight, DST and month/year rollover', () => {
  assert.equal(nyToday(new Date('2026-11-01T03:59:00Z')), '2026-10-31');
  assert.equal(nyToday(new Date('2026-11-01T07:01:00Z')), '2026-11-01');
  assert.equal(nyToday(new Date('2027-01-01T02:00:00Z')), '2026-12-31');
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
});
test('home excludes unaccepted/cancelled balances and inactive/completed tasks', () => {
  const orders = [order, ...['New Inquiry', 'Quote Sent', 'Awaiting Deposit', 'Cancelled'].map(status => ({ ...order, id: status, status }))];
  const tasks = [
    { order_id: order.id, title: 'Overdue', due_date: '2026-11-08', completed: false },
    { order_id: order.id, title: 'Today', due_date: '2026-11-09', completed: false },
    { order_id: order.id, title: 'Seventh day', due_date: '2026-11-16', completed: false },
    { order_id: order.id, title: 'Later', due_date: '2026-11-17', completed: false },
    { order_id: 'Cancelled', due_date: '2026-11-08', completed: false },
    { order_id: order.id, due_date: '2026-11-08', completed: true },
  ];
  const summary = dashboard(orders, [payment, { ...payment, received_date: '2026-10-31' }, { ...payment, received_date: '2026-11-10' }], tasks, '2026-11-09');
  assert.equal(summary.active, 4);
  assert.equal(summary.outstanding, 0);
  assert.equal(summary.monthly, 45000);
  assert.equal(summary.overdue.length, 1);
  assert.equal(summary.upcoming.length, 2);
  assert.equal(dashboard([{ ...order, status: 'Completed' }], [], tasks, '2026-11-09').overdue.length, 0);
  assert.equal(dashboard([{ ...order, status: 'Waiting on Client' }], [payment], [], '2026-11-09').waiting, 1);
  assert.equal(dashboard([order], [payment], [], '2026-11-09').outstanding, 45000);
});
test('email drafts include saved names, quote, deposit and balance', () => {
  assert.match(emailText('quote', order, [payment]), /Example Studio.*\$900\.00/);
  assert.match(emailText('quote', order, [payment]), /deposit is \$450\.00/);
  assert.match(emailText('deposit', order, []), /\$450\.00 remains toward the deposit/);
  assert.match(emailText('balance', order, [payment]), /remaining balance is \$450\.00/);
});
