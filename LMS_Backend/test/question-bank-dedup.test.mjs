import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.mjs';

let ctx, A, mod, T0;
before(async () => {
  ctx = await startTestServer();
  await ctx.mkUser('Admin', 'admin@x.local', 'admin');
  A = await ctx.login('admin@x.local');
  mod = await ctx.models.Module.create({ name: 'Bank', code: 'BANK', order: 1, topics: [{ title: 'Topic A', order: 0 }] });
  T0 = String(mod.topics[0]._id);
});
after(async () => { await ctx.stop(); });

const mkOne = (over = {}) => ({ module: String(mod._id), topic: T0, type: 'mcq', prompt: 'What is RAG?', options: ['Retrieval Augmented Generation', 'Random Access Grid'], correctOption: 0, ...over });

test('a single duplicate (same wording + options) is refused with 409', async () => {
  const first = await ctx.req('POST', '/question-bank', A, mkOne());
  assert.equal(first.status, 201);
  const dup = await ctx.req('POST', '/question-bank', A, mkOne());
  assert.equal(dup.status, 409, 'exact duplicate rejected');
  // Same wording but DIFFERENT options is NOT a duplicate.
  const diff = await ctx.req('POST', '/question-bank', A, mkOne({ options: ['RAG', 'Something else'] }));
  assert.equal(diff.status, 201, 'same prompt + different options is allowed');
});

test('bulk upload skips duplicates already in the bank and repeats within the file', async () => {
  const items = [
    { type: 'mcq', prompt: 'Q1 unique', options: ['a', 'b'], correctOption: 0 },
    { type: 'mcq', prompt: 'Q1 unique', options: ['b', 'a'], correctOption: 1 }, // same set, different order → dup within file
    { type: 'mcq', prompt: 'Q2 unique', options: ['x', 'y'], correctOption: 0 },
  ];
  const first = await ctx.req('POST', '/question-bank/bulk', A, { module: String(mod._id), topic: T0, source: 'sheet1.xlsx', items });
  assert.equal(first.status, 201);
  assert.equal(first.data.added, 2, 'only the 2 distinct questions added');
  assert.equal(first.data.duplicateCount, 1, 'the in-file repeat was skipped');

  // Re-uploading the SAME sheet adds nothing.
  const again = await ctx.req('POST', '/question-bank/bulk', A, { module: String(mod._id), topic: T0, source: 'sheet1.xlsx', items });
  assert.equal(again.data.added, 0, 're-upload adds nothing');
  assert.equal(again.data.duplicateCount, 3, 'all 3 rows flagged as existing');
});

test('an upload batch can be listed and deleted as a unit', async () => {
  const items = Array.from({ length: 4 }, (_, i) => ({ type: 'mcq', prompt: `Batch Q${i}`, options: ['a', 'b'], correctOption: 0 }));
  const up = await ctx.req('POST', '/question-bank/bulk', A, { module: String(mod._id), topic: T0, source: 'batch.xlsx', items });
  assert.equal(up.data.added, 4);
  const batchId = up.data.uploadBatch;
  assert.ok(batchId);

  const uploads = await ctx.req('GET', `/question-bank/uploads?module=${mod._id}`, A);
  assert.equal(uploads.status, 200);
  const card = uploads.data.find((u) => u.uploadBatch === batchId);
  assert.ok(card, 'the upload appears as a card');
  assert.equal(card.count, 4);
  assert.equal(card.source, 'batch.xlsx');

  // The card's questions are listable.
  const inBatch = await ctx.req('GET', `/question-bank?module=${mod._id}&uploadBatch=${batchId}`, A);
  assert.equal(inBatch.data.length, 4);

  // Delete the whole batch.
  const del = await ctx.req('DELETE', `/question-bank/uploads/${batchId}`, A);
  assert.equal(del.status, 200);
  assert.equal(del.data.deleted, 4);
  assert.equal((await ctx.req('GET', `/question-bank?module=${mod._id}&uploadBatch=${batchId}`, A)).data.length, 0);
});

test('the duplicates report groups identical questions already in the DB', async () => {
  // Insert real duplicates directly (bypassing the API's dedup) to simulate legacy data.
  const base = { module: mod._id, topic: mod.topics[0]._id, topicTitle: 'Topic A', type: 'mcq', prompt: 'Legacy dup?', options: ['one', 'two'], correctOption: 0 };
  await ctx.models.QuestionBankItem.create(base);
  await ctx.models.QuestionBankItem.create(base);
  await ctx.models.QuestionBankItem.create({ ...base, options: ['two', 'one'] }); // same set, different order → same group

  const rep = await ctx.req('GET', `/question-bank/duplicates?module=${mod._id}`, A);
  assert.equal(rep.status, 200);
  const group = rep.data.groups.find((g) => g.prompt === 'Legacy dup?');
  assert.ok(group, 'the duplicate group is reported');
  assert.equal(group.count, 3);
  assert.ok(rep.data.removableCount >= 2, 'reports how many extras could be removed');
});

test('trainers not assigned to the module cannot manage its bank', async () => {
  await ctx.mkUser('Tr', 'tr@x.local', 'trainer');
  const T = await ctx.login('tr@x.local');
  assert.equal((await ctx.req('GET', `/question-bank/uploads?module=${mod._id}`, T)).status, 403);
  assert.equal((await ctx.req('GET', `/question-bank/duplicates?module=${mod._id}`, T)).status, 403);
});
