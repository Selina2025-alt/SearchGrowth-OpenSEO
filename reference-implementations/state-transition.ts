export async function compareAndSetStatus(
  db: {
    updateWhere: (
      table: string,
      where: Record<string, unknown>,
      values: Record<string, unknown>,
    ) => Promise<{ affectedRows: number }>;
  },
  table: string,
  id: string,
  expected: string,
  next: string,
): Promise<void> {
  const result = await db.updateWhere(
    table,
    { id, status: expected },
    { status: next, updated_at: new Date().toISOString() },
  );

  if (result.affectedRows !== 1) {
    throw new Error(`STATE_CONFLICT: ${table}/${id} expected=${expected} next=${next}`);
  }
}

// Production state transitions must also:
// - validate allowed transition from schemas/state-machines.json or equivalent constant;
// - write append-only audit event in the same logical transaction;
// - enforce immutable approved hashes;
// - never permit UI/client to write arbitrary status directly.
