import { formatFunction, formatHelper } from '../pipeline/describe'
import type { FunctionRef } from '../pipeline/types'
import styles from './MethodPanel.module.scss'

interface MethodPanelProps {
  fn: FunctionRef
  /** One or two lines on how the function works; `backticks` mark inline code. */
  how: string
}

// Odd pieces of a backtick split are the code spans.
function renderInlineCode(text: string) {
  return text
    .split('`')
    .map((part, i) => (i % 2 === 1 ? <code key={i} className={styles.inlineCode}>{part}</code> : part))
}

/** Names the real function behind the stage on screen and how it works. */
function MethodPanel({ fn, how }: MethodPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.group}>
        <span className={styles.label}>Running</span>
        <div className={styles.functions}>
          <div className={styles.function}>
            <code className={styles.snippet} title={formatFunction(fn, { fullPath: true })}>
              {formatFunction(fn)}
            </code>
            {fn.planned && <span className={styles.planned}>Planned</span>}
          </div>
          {fn.helpers?.map((helper) => (
            <code key={helper.name} className={styles.helper}>
              → {formatHelper(helper)}
            </code>
          ))}
        </div>
      </div>
      <div className={styles.group}>
        <span className={styles.label}>How</span>
        <p>{renderInlineCode(how)}</p>
      </div>
    </div>
  )
}

export default MethodPanel
