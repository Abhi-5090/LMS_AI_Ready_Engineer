import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.mjs';

let ctx, A;
before(async () => {
  ctx = await startTestServer();
  await ctx.mkUser('Admin', 'admin@x.local', 'admin');
  A = await ctx.login('admin@x.local');
});
after(async () => { await ctx.stop(); });

// ── Assessment: proctoring violation limit ─────────────────────────────────────
test('final-test violation limit is stored, editable, and cleared when unproctored', async () => {
  const { req, models } = ctx;
  const mod = await models.Module.create({ name: 'M', code: 'MV', order: 1, level: 'beginner' });

  const created = await req('POST', '/assessments', A, {
    title: 'Final Exam', module: mod._id.toString(), type: 'final', proctoring: 'app', durationMinutes: 30, violationLimit: 3,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.violationLimit, 3);

  // Edit the limit.
  const upd = await req('PATCH', `/assessments/${created.data.id}`, A, { violationLimit: 5 });
  assert.equal(upd.data.violationLimit, 5);

  // Turning proctoring off clears the limit (nothing to auto-submit).
  const off = await req('PATCH', `/assessments/${created.data.id}`, A, { proctoring: 'none' });
  assert.equal(off.data.violationLimit, 0);
});

// ── External certificates: students can delete pending/rejected, not approved ───
test('a student can delete a pending external certificate but not an approved one', async () => {
  const { req } = ctx;
  await ctx.mkUser('CertStud', 'cs@x.local', 'student');
  const S = await ctx.login('cs@x.local');

  const a = await req('POST', '/external-certificates', S, { title: 'Cert A', url: 'https://issuer.example/a' });
  const b = await req('POST', '/external-certificates', S, { title: 'Cert B', url: 'https://issuer.example/b' });
  assert.equal(a.status, 201); assert.equal(b.status, 201);

  // Admin approves A.
  const rev = await req('PATCH', `/external-certificates/${a.data.id}/review`, A, { decision: 'approve' });
  assert.equal(rev.status, 200);

  // Pending B can be removed; approved A cannot.
  assert.equal((await req('DELETE', `/external-certificates/${b.data.id}`, S)).status, 200);
  assert.equal((await req('DELETE', `/external-certificates/${a.data.id}`, S)).status, 403);
});

// ── Doubts: auto-close, rate-anytime, average excludes unrated ──────────────────
test('doubts: rate-anytime after an unrated resolve, and auto-close after 24h', async () => {
  const { req, models } = ctx;
  const m1 = await models.Module.create({ name: 'D1', code: 'DB1', order: 1, level: 'beginner' });
  const m2 = await models.Module.create({ name: 'D2', code: 'DB2', order: 2, level: 'beginner' });
  const trainer = await ctx.mkUser('Trainer', 'tr@x.local', 'trainer');
  const student = await ctx.mkUser('Stud', 'stud@x.local', 'student');
  // New rule: a trainer only handles doubts for a module they deliver IN THE
  // student's batch. Put the student in a batch that maps this trainer to m1 & m2.
  const batch = await models.Batch.create({
    name: 'Batch 1', code: 'BATCH1', startDate: new Date(), endDate: new Date(Date.now() + 30 * 864e5),
    students: [student._id], trainers: [trainer._id], modules: [m1._id, m2._id],
    moduleTrainers: [
      { module: m1._id, trainers: [trainer._id] },
      { module: m2._id, trainers: [trainer._id] },
    ],
    organization: ctx.defaultOrg._id,
  });
  await models.User.updateOne({ _id: student._id }, { $set: { batch: batch._id } });
  const T = await ctx.login('tr@x.local');
  const S = await ctx.login('stud@x.local');

  // Doubt 1: answered → resolve WITHOUT rating → rate later.
  const d1 = (await req('POST', '/doubts', S, { title: 'Q1 about topic', body: 'help', module: m1._id.toString() })).data;
  await req('POST', `/doubts/${d1.id}/replies`, T, { body: 'here is the answer' }); // trainer answers
  const closed = await req('POST', `/doubts/${d1.id}/close`, S, {}); // resolve, no rating
  assert.equal(closed.data.status, 'closed');
  assert.equal(closed.data.rating, null, 'closed unrated');
  const rated = await req('POST', `/doubts/${d1.id}/rate`, S, { rating: 4 }); // rate later
  assert.equal(rated.data.rating, 4);
  // Can't rate twice.
  assert.equal((await req('POST', `/doubts/${d1.id}/rate`, S, { rating: 2 })).status, 400);

  // Doubt 2: answered, then left untouched for >24h → auto-closes unrated on next list.
  const d2 = (await req('POST', '/doubts', S, { title: 'Q2 about other', body: 'help2', module: m2._id.toString() })).data;
  await req('POST', `/doubts/${d2.id}/replies`, T, { body: 'answer 2' });
  await models.Doubt.updateOne({ _id: d2.id }, { $set: { answeredAt: new Date(Date.now() - 25 * 3600 * 1000) } });
  const list = await req('GET', '/doubts', S);
  const d2After = list.data.find((d) => d.id === d2.id);
  assert.equal(d2After.status, 'closed', 'auto-closed after 24h');
  assert.equal(d2After.rating, null, 'auto-closed without a rating');

  // Trainer average counts only the rated doubt (4), never the unrated auto-closed one.
  const stats = await req('GET', '/doubts/my-stats', T);
  assert.equal(stats.data.answered, 2);
  assert.equal(stats.data.ratingCount, 1);
  assert.equal(stats.data.averageRating, 4);
});
