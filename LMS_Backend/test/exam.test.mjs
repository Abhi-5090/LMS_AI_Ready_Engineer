import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, iso } from './helpers.mjs';

let ctx;
let ADMIN;
let T;
let S;
let mod;
let batchId;
let bankMcq;
before(async () => {
  ctx = await startTestServer();
  await ctx.mkUser('Admin', 'admin@x.local', 'admin');
  const trainer = await ctx.mkUser('T', 't@x.local', 'trainer');
  const student = await ctx.mkUser('S', 's@x.local', 'student');
  mod = await ctx.models.Module.create({ name: 'M', code: 'EXAM', order: 1, assignedTrainers: [trainer._id], topics: [{ title: 'a', order: 0 }] });
  const batch = await ctx.models.Batch.create({ name: 'B', code: 'EXAMB', startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'), students: [student._id], trainers: [trainer._id], modules: [mod._id] });
  batchId = batch._id.toString();
  student.batch = batch._id; await student.save();
  ADMIN = await ctx.login('admin@x.local');
  T = await ctx.login('t@x.local');
  S = await ctx.login('s@x.local');
  const b = await ctx.req('POST', '/question-bank', ADMIN, { module: mod._id.toString(), type: 'mcq', prompt: 'Q', options: ['A', 'B'], correctOption: 0 });
  bankMcq = b.data.id;
});
after(async () => { await ctx.stop(); });

/** Admin authors a ready-made template. */
async function makeTemplate({ type = 'final', proctoring = 'app', module = mod._id.toString(), questionIds = [bankMcq], durationMinutes = 60 } = {}) {
  const t = await ctx.req('POST', '/assessments', ADMIN, { module, title: `${type} template`, type, proctoring, durationMinutes });
  assert.equal(t.status, 201, 'admin can author a template');
  assert.equal(t.data.isTemplate, true);
  if (questionIds.length) await ctx.req('POST', `/assessments/${t.data.id}/questions/from-bank`, ADMIN, { questionIds });
  return t.data.id;
}
/** Trainer assigns a template to the batch. */
async function assign(templateId, extra = {}) {
  return ctx.req('POST', `/assessments/${templateId}/assign`, T, { batch: batchId, availableFrom: iso(-5), deadline: iso(240), ...extra });
}

test('trainers cannot create ready-made tests (admin only)', async () => {
  const r = await ctx.req('POST', '/assessments', T, { module: mod._id.toString(), title: 'X', type: 'practice', proctoring: 'none' });
  assert.equal(r.status, 403);
});

test('a template is invisible to students; assigning it creates a live test they can take', async () => {
  const tmpl = await makeTemplate({ type: 'final', proctoring: 'app' });
  // The template itself never appears to a student.
  const pre = await ctx.req('GET', '/assessments', S);
  assert.ok(!pre.data.some((x) => x.id === tmpl), 'template must not be listed to students');

  const asg = await assign(tmpl);
  assert.equal(asg.status, 201);
  assert.equal(asg.data.isTemplate, false);
  assert.equal(asg.data.sourceTemplate, tmpl);
  const instId = asg.data.id;

  const list = await ctx.req('GET', '/assessments', S);
  assert.ok(list.data.some((x) => x.id === instId), 'assigned test is visible to the batch student');

  // Proctored reveal: hidden until start, then shown WITHOUT the answer key.
  const detail = await ctx.req('GET', `/assessments/${instId}`, S);
  assert.equal(detail.data.mustStart, true);
  assert.equal(detail.data.questions.length, 0);
  const started = await ctx.req('POST', `/assessments/${instId}/start`, S);
  assert.equal(started.status, 201);
  assert.equal(started.data.questions.length, 1);
  assert.equal(started.data.questions[0].correctOption, undefined);
});

test('a scenario question never leaks its correctOption or referenceAnswer', async () => {
  const bank = await ctx.req('POST', '/question-bank', ADMIN, {
    module: mod._id.toString(), type: 'scenario',
    prompt: 'A user reports hallucinations. How do you respond?',
    referenceAnswer: 'SECRET RUBRIC: grounding, retrieval, evaluation.',
  });
  const tmpl = await makeTemplate({ type: 'final', proctoring: 'app', questionIds: [bank.data.id] });
  const asg = await assign(tmpl);
  const started = await ctx.req('POST', `/assessments/${asg.data.id}/start`, S);
  const q = started.data.questions[0];
  assert.equal(q.type, 'scenario');
  assert.equal(q.correctOption, undefined);
  assert.equal(q.referenceAnswer, undefined, 'private rubric must never reach the student');
});

test('assign with a student allow-list scopes visibility; clearing it opens the whole batch', async () => {
  const { req, models } = ctx;
  const trainerId = mod.assignedTrainers[0];
  const a1 = await ctx.mkUser('A1', 'a1@x.local', 'student');
  const b1 = await ctx.mkUser('B1', 'b1@x.local', 'student');
  const m2 = await models.Module.create({ name: 'M2', code: 'EXAM2', order: 2, assignedTrainers: [trainerId], topics: [{ title: 'a', order: 0 }] });
  const batch2 = await models.Batch.create({ name: 'B2', code: 'EXB2', startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'), students: [a1._id, b1._id], trainers: [trainerId], modules: [m2._id] });
  a1.batch = batch2._id; await a1.save();
  b1.batch = batch2._id; await b1.save();
  const A1 = await ctx.login('a1@x.local');
  const B1 = await ctx.login('b1@x.local');

  const bank = await req('POST', '/question-bank', ADMIN, { module: m2._id.toString(), type: 'mcq', prompt: 'Q', options: ['A', 'B'], correctOption: 0 });
  const tmpl = await makeTemplate({ type: 'practice', proctoring: 'none', module: m2._id.toString(), questionIds: [bank.data.id] });
  const asg = await req('POST', `/assessments/${tmpl}/assign`, T, { batch: batch2._id.toString(), studentIds: [a1._id.toString()] });
  assert.equal(asg.status, 201);
  const instId = asg.data.id;

  assert.ok((await req('GET', '/assessments', A1)).data.some((x) => x.id === instId), 'A1 (allowed) sees it');
  assert.ok(!(await req('GET', '/assessments', B1)).data.some((x) => x.id === instId), 'B1 (not allowed) does not');
  assert.equal((await req('GET', `/assessments/${instId}`, B1)).status, 403);

  await req('PATCH', `/assessments/${instId}/allowed-students`, T, { studentIds: [] });
  assert.ok((await req('GET', '/assessments', B1)).data.some((x) => x.id === instId), 'cleared list = whole batch sees it');
});

test('a practice template can hold more than 10 questions (no cap)', async () => {
  const { req } = ctx;
  const ids = [];
  for (let i = 0; i < 11; i += 1) {
    const b = await req('POST', '/question-bank', ADMIN, { module: mod._id.toString(), type: 'mcq', prompt: `P${i}`, options: ['A', 'B'], correctOption: 0 });
    ids.push(b.data.id);
  }
  const t = await req('POST', '/assessments', ADMIN, { module: mod._id.toString(), title: 'Practice', type: 'practice', proctoring: 'none' });
  const ten = await req('POST', `/assessments/${t.data.id}/questions/from-bank`, ADMIN, { questionIds: ids.slice(0, 10) });
  assert.equal(ten.status, 201);
  assert.equal(ten.data.questions.length, 10);
  // The 11th is added too — practice tests are no longer capped.
  const eleventh = await req('POST', `/assessments/${t.data.id}/questions/from-bank`, ADMIN, { questionIds: [ids[10]] });
  assert.equal(eleventh.data.questions.length, 11, 'accepts the 11th question');
  assert.equal(eleventh.data.added, 1);
  assert.equal(eleventh.data.capped, false);
});

test('a template carries its description onto the assigned test', async () => {
  const t = await ctx.req('POST', '/assessments', ADMIN, {
    module: mod._id.toString(), title: 'Described', type: 'final', proctoring: 'none',
    description: 'Covers topics A, B and C.',
  });
  assert.equal(t.data.description, 'Covers topics A, B and C.');
  await ctx.req('POST', `/assessments/${t.data.id}/questions/from-bank`, ADMIN, { questionIds: [bankMcq] });
  const asg = await assign(t.data.id);
  assert.equal(asg.data.description, 'Covers topics A, B and C.', 'assigned test copies the description');
});

test('trainers cannot edit a template’s questions', async () => {
  const tmpl = await makeTemplate({ type: 'final', proctoring: 'none' });
  const r = await ctx.req('POST', `/assessments/${tmpl}/questions/from-bank`, T, { questionIds: [bankMcq] });
  assert.equal(r.status, 403);
});
