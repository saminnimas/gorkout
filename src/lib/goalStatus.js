export function getWorkoutFields(goal) {
  if (Array.isArray(goal.workoutFields) && goal.workoutFields.length > 0) {
    return goal.workoutFields
  }
  const t = goal.targetThreshold
  if (t != null && Number(t) > 0) {
    return [
      {
        fieldId: '_legacy',
        name: goal.title || 'Total',
        targetReps: Number(t),
      },
    ]
  }
  return []
}

export function sumRepsBeforeDeadlineForField(
  logs,
  userId,
  fieldId,
  deadlineTs,
) {
  const end = deadlineTs.toMillis()
  return logs
    .filter((l) => {
      const fid = l.fieldId ?? '_legacy'
      return (
        l.userId === userId &&
        fid === fieldId &&
        l.createdAt.toMillis() <= end
      )
    })
    .reduce((s, l) => s + l.reps, 0)
}

/**
 * @returns {'active' | 'achieved' | 'failed_quit' | 'failed_deadline'}
 */
export function participantStatus({
  userId,
  goal,
  deadlineTs,
  logs,
  surrenderedUserIds,
  nowMs = Date.now(),
}) {
  if (surrenderedUserIds.has(userId)) return 'failed_quit'

  const fields = getWorkoutFields(goal)
  if (!fields.length) return 'active'

  let allMet = true
  for (const f of fields) {
    const sum = sumRepsBeforeDeadlineForField(
      logs,
      userId,
      f.fieldId,
      deadlineTs,
    )
    if (sum < f.targetReps) {
      allMet = false
      break
    }
  }
  if (allMet) return 'achieved'

  const end = deadlineTs.toMillis()
  if (nowMs > end) return 'failed_deadline'

  return 'active'
}

/** @returns {Map<string, number>} userId -> total reps (all fields) */
export function leaderboardTotalReps(logs) {
  const m = new Map()
  for (const l of logs) {
    m.set(l.userId, (m.get(l.userId) ?? 0) + l.reps)
  }
  return m
}

/** @returns {Map<string, Map<string, number>>} userId -> fieldId -> reps */
export function leaderboardFieldTotals(logs) {
  const m = new Map()
  for (const l of logs) {
    const uid = l.userId
    const fid = l.fieldId ?? '_legacy'
    if (!m.has(uid)) m.set(uid, new Map())
    const inner = m.get(uid)
    inner.set(fid, (inner.get(fid) ?? 0) + l.reps)
  }
  return m
}
