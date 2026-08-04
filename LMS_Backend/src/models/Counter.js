import mongoose, { Schema } from 'mongoose';

/**
 * A named monotonic counter. Used for gap-free-ish, race-safe sequence numbers
 * (e.g. per-(batch, module) certificate serials). `findOneAndUpdate` with `$inc`
 * + `upsert` hands each caller a distinct value even under concurrency.
 */
const counterSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/** Atomically increment `key` and return the next value (starts at 1). */
export async function nextSequence(key) {
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
}

export { Counter };
