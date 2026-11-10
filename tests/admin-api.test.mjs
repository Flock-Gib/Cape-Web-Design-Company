import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Use a disposable Supabase project and fake confirmed users only.
const env = process.env;
const configured = ['ADMIN_TEST_URL', 'ADMIN_TEST_KEY', 'ADMIN_TEST_EMAIL', 'ADMIN_TEST_PASSWORD', 'ADMIN_TEST_OUTSIDER_EMAIL', 'ADMIN_TEST_OUTSIDER_PASSWORD'].every(key => env[key]);

test('real Auth/REST: project lifecycle, persistence and RLS denials', { skip: !configured }, async () => {
  const base = env.ADMIN_TEST_URL.replace(/\/$/, '');
  async function request(path, { token, method = 'GET', body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { apikey: env.ADMIN_TEST_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  }
  async function login(email, password) {
    const response = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return response.data;
  }
  const admin = await login(env.ADMIN_TEST_EMAIL, env.ADMIN_TEST_PASSWORD);
  const outsider = await login(env.ADMIN_TEST_OUTSIDER_EMAIL, env.ADMIN_TEST_OUTSIDER_PASSWORD);
  const token = admin.access_token;
  const id = randomUUID();
  const paymentId = randomUUID();
  const taskId = randomUUID();
  const orderPath = `/rest/v1/orders?id=eq.${id}`;
  assert.equal((await request('/rest/v1/orders', { token, method: 'POST', body: { id, business_name: 'FAKE API TEST Studio', email: 'fake-client@example.test', package: 'Redesign', quoted_total_cents: 90000, notes: '<script>not executable</script>' } })).status, 201);
  for (const status of ['Quote Sent', 'Awaiting Deposit', 'Booked', 'In Progress', 'Waiting on Client', 'Ready to Launch']) {
    const response = await request(orderPath, { token, method: 'PATCH', body: { status } });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data[0].status, status);
  }
  assert.equal((await request('/rest/v1/order_payments', { token, method: 'POST', body: { id: paymentId, order_id: id, amount_cents: 45000, received_date: '2026-11-09', method: 'Cash' } })).status, 201);
  let payments = await request(`/rest/v1/order_payments?order_id=eq.${id}`, { token });
  assert.equal(90000 - payments.data.reduce((sum, item) => sum + item.amount_cents, 0), 45000);
  assert.equal((await request(`/rest/v1/order_payments?id=eq.${paymentId}`, { token, method: 'PATCH', body: { method: 'Check', note: 'Fake corrected reference' } })).status, 200);
  assert.equal((await request('/rest/v1/order_tasks', { token, method: 'POST', body: { id: taskId, order_id: id, title: 'Fake task', starter_key: 'content' } })).status, 201);
  assert.equal((await request('/rest/v1/order_tasks', { token, method: 'POST', body: { order_id: id, title: 'Duplicate starter', starter_key: 'content' } })).status, 409);
  assert.equal((await request(`/rest/v1/order_tasks?id=eq.${taskId}`, { token, method: 'PATCH', body: { completed: true } })).status, 200);
  assert.ok((await request(orderPath, { token, method: 'PATCH', body: { status: 'Completed' } })).status >= 400, 'completion requires live URL');
  assert.ok((await request(orderPath, { token, method: 'PATCH', body: { live_url: 'javascript:alert(1)' } })).status >= 400);
  assert.ok((await request('/rest/v1/order_payments', { token, method: 'POST', body: { order_id: id, amount_cents: 0, received_date: '2026-11-09', method: 'Cash' } })).status >= 400);
  assert.equal((await request('/rest/v1/order_payments', { token, method: 'POST', body: { order_id: id, amount_cents: 45000, received_date: '2026-11-09', method: 'Venmo Business' } })).status, 201);
  const completed = await request(orderPath, { token, method: 'PATCH', body: { live_url: 'https://example.com/', status: 'Completed' } });
  assert.equal(completed.status, 200);
  assert.ok(completed.data[0].completed_at);
  assert.equal((await request(`/rest/v1/orders?status=eq.Completed&id=eq.${id}`, { token })).data.length, 1);
  assert.equal((await request('/auth/v1/logout?scope=local', { token, method: 'POST' })).status, 204);
  const signedBackIn = await login(env.ADMIN_TEST_EMAIL, env.ADMIN_TEST_PASSWORD);
  const persisted = await request(orderPath, { token: signedBackIn.access_token });
  assert.equal(persisted.data[0].status, 'Completed');
  assert.equal((await request(`/rest/v1/order_payments?order_id=eq.${id}`, { token: signedBackIn.access_token })).data.reduce((sum, item) => sum + item.amount_cents, 0), 90000);

  const tables = [
    ['orders', id, { business_name: 'Intrusion', email: 'intrusion@example.test' }, { business_name: 'Intrusion' }],
    ['order_payments', paymentId, { order_id: id, amount_cents: 1, method: 'Cash', received_date: '2026-11-09' }, { amount_cents: 1 }],
    ['order_tasks', taskId, { order_id: id, title: 'Intrusion' }, { title: 'Intrusion' }],
  ];
  for (const candidate of [undefined, outsider.access_token]) {
    for (const [table, rowId, insert, update] of tables) {
      const read = await request(`/rest/v1/${table}`, { token: candidate });
      if (candidate) assert.deepEqual(read.data, [], `${table} hidden from non-admin`);
      else assert.ok(read.status >= 400, `${table} denied to signed-out visitor`);
      assert.ok((await request(`/rest/v1/${table}`, { token: candidate, method: 'POST', body: insert })).status >= 400, `${table} insert denied`);
      const write = await request(`/rest/v1/${table}?id=eq.${rowId}`, { token: candidate, method: 'PATCH', body: update });
      assert.ok(write.status >= 400 || JSON.stringify(write.data) === '[]', `${table} update affects no rows`);
      assert.ok((await request(`/rest/v1/${table}?id=eq.${rowId}`, { token: candidate, method: 'DELETE' })).status >= 400);
    }
    const readAllowlist = await request('/rest/v1/admin_users', { token: candidate });
    if (candidate) assert.deepEqual(readAllowlist.data, []);
    else assert.ok(readAllowlist.status >= 400);
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      assert.ok((await request(`/rest/v1/admin_users${method === 'POST' ? '' : `?user_id=eq.${outsider.user.id}`}`, { token: candidate, method, body: method === 'DELETE' ? undefined : { user_id: outsider.user.id } })).status >= 400, `${method} self-allowlist denied`);
    }
  }
  const verifiedToken = signedBackIn.access_token;
  assert.deepEqual((await request('/rest/v1/admin_users', { token: verifiedToken })).data, [{ user_id: admin.user.id }]);
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.ok((await request(`/rest/v1/admin_users${method === 'POST' ? '' : `?user_id=eq.${admin.user.id}`}`, { token: verifiedToken, method, body: method === 'DELETE' ? undefined : { user_id: outsider.user.id } })).status >= 400, 'admin cannot alter membership through browser API');
  }
  const reopened = await request(orderPath, { token: verifiedToken, method: 'PATCH', body: { status: 'In Progress' } });
  assert.equal(reopened.data[0].completed_at, null);
  assert.equal(reopened.data[0].notes, '<script>not executable</script>');
  assert.equal((await request(`/rest/v1/order_tasks?id=eq.${taskId}`, { token: verifiedToken })).data[0].completed, true);
  payments = await request(`/rest/v1/order_payments?order_id=eq.${id}`, { token: verifiedToken });
  assert.equal(payments.data.reduce((sum, item) => sum + item.amount_cents, 0), 90000);
  assert.equal(reopened.data[0].business_name, 'FAKE API TEST Studio');
  console.log(`Fake API test order retained for inspection: ${id}`);
});
