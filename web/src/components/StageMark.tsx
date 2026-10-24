export type StageStatus = 'complete' | 'current' | 'incomplete'

interface StageMarkProps {
  status: StageStatus
}

/**
 * Carbon progress-indicator marks: ring (incomplete), half-filled ring
 * (current), ring with a check (complete). Drawn in currentColor so the
 * parent sets the color from a theme token. Decorative: the state is also
 * written out in text next to the stage name.
 */
function StageMark({ status }: StageMarkProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" data-status={status}>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1" />
      {status === 'current' && <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />}
      {status === 'complete' && (
        <path d="M5 8.3l2 2 4-4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      )}
    </svg>
  )
}

export default StageMark
