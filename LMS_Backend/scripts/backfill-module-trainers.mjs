/**
 * One-off backfill: mirror every batch's per-module trainer mapping
 * (batch.moduleTrainers) onto the module's `assignedTrainers`. That list drives
 * a trainer's "My modules", module access, and assessment management — so any
 * trainer who delivers a module in a batch must be assigned to the module.
 * Older mappings (made before this was synced automatically) are fixed here.
 * Additive only: never removes an existing assignment. Idempotent + safe to re-run.
 *
 *   node scripts/backfill-module-trainers.mjs            (dry run — reports only)
 *   node scripts/backfill-module-trainers.mjs --apply    (writes the changes)
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Batch, Module } from '../src/models/index.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.mongoUri);

  // module id → set of trainer ids that deliver it in any batch.
  const wanted = new Map();
  for (const b of await Batch.find({}).select('moduleTrainers').lean()) {
    for (const mt of b.moduleTrainers ?? []) {
      if (!mt.module) continue;
      const key = String(mt.module);
      const set = wanted.get(key) ?? new Set();
      for (const t of mt.trainers ?? []) set.add(String(t));
      wanted.set(key, set);
    }
  }

  let modulesFixed = 0;
  let assignmentsAdded = 0;
  for (const [moduleId, trainerSet] of wanted) {
    const module = await Module.findById(moduleId).select('assignedTrainers code name');
    if (!module) continue;
    const have = new Set(module.assignedTrainers.map((t) => String(t)));
    const missing = [...trainerSet].filter((t) => !have.has(t));
    if (missing.length === 0) continue;
    modulesFixed += 1;
    assignmentsAdded += missing.length;
    console.log(`[backfill] module ${module.code || moduleId}: +${missing.length} trainer(s) → assignedTrainers`);
    if (APPLY) {
      await Module.updateOne({ _id: moduleId }, { $addToSet: { assignedTrainers: { $each: missing } } });
    }
  }

  console.log(`\n[backfill] ${APPLY ? 'APPLIED' : 'DRY RUN'} — ${modulesFixed} module(s), ${assignmentsAdded} assignment(s) ${APPLY ? 'added' : 'would be added'}.`);
  if (!APPLY) console.log('[backfill] re-run with --apply to write the changes.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
