import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.mjs';

let ctx;
let admin;
let T;
let S;
let mod;
let batch;
before(async () => {
  ctx = await startTestServer();
  const trainer = await ctx.mkUser('T', 't@x.local', 'trainer');
  const student = await ctx.mkUser('S', 's@x.local', 'student');
  await ctx.mkUser('Admin', 'admin@x.local', 'admin');
  mod = await ctx.models.Module.create({ name: 'M', code: 'NA', order: 1, assignedTrainers: [trainer._id] });
  batch = await ctx.models.Batch.create({ name: 'B', code: 'NAB', startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'), students: [student._id], trainers: [trainer._id], modules: [mod._id] });
  student.batch = batch._id; await student.save();
  trainer.assignedBatches = [batch._id]; trainer.assignedModules = [mod._id]; await trainer.save();
  admin = await ctx.login('admin@x.local');
  T = await ctx.login('t@x.local');
  S = await ctx.login('s@x.local');
});
after(async () => { await ctx.stop(); });

test('announcement to a batch notifies its students', async () => {
  const { req } = ctx;
  assert.equal((await req('GET', '/notifications', S)).data.length, 0);
  const a = await req('POST', '/announcements', T, { title: 'Heads up', body: 'Class moved to 5pm', targets: JSON.stringify([{ batch: batch._id.toString(), modules: [] }]) });
  assert.equal(a.status, 201);
  const notes = (await req('GET', '/notifications', S)).data;
  assert.equal(notes.length, 1);
  assert.match(notes[0].title, /Heads up/);
  assert.equal(notes[0].read, false);
});

test('opening notifications marks them read', async () => {
  const { req } = ctx;
  await req('POST', '/notifications/read', S);
  const notes = (await req('GET', '/notifications', S)).data;
  assert.ok(notes.every((n) => n.read === true));
});

test('assigning a ready-made test writes an audit entry the admin can see', async () => {
  const { req } = ctx;
  // Admin authors a ready-made template; the trainer assigns it to the batch.
  const bank = await req('POST', '/question-bank', admin, { module: mod._id.toString(), type: 'mcq', prompt: 'Q', options: ['A', 'B'], correctOption: 0 });
  const tmpl = await req('POST', '/assessments', admin, { module: mod._id.toString(), title: 'Practice 1', type: 'practice', proctoring: 'none' });
  await req('POST', `/assessments/${tmpl.data.id}/questions/from-bank`, admin, { questionIds: [bank.data.id] });
  const asg = await req('POST', `/assessments/${tmpl.data.id}/assign`, T, { batch: batch._id.toString() });
  assert.equal(asg.status, 201);
  const log = await req('GET', '/audit?action=assessment.assign', admin);
  assert.equal(log.status, 200);
  assert.ok(log.data.length >= 1);
  assert.equal(log.data[0].action, 'assessment.assign');
});

test('audit log is admin-only', async () => {
  assert.equal((await ctx.req('GET', '/audit', T)).status, 403);
  assert.equal((await ctx.req('GET', '/audit', S)).status, 403);
});
