/** Atomic sequence generator used for human-readable document numbers. */
import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Returns the next value for a named sequence, formatted as PREFIX-00001.
 * findOneAndUpdate with $inc is atomic, so concurrent requests never collide.
 */
export async function nextSequence(name, prefix, pad = 5) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `${prefix}${String(doc.seq).padStart(pad, '0')}`;
}

export default Counter;
