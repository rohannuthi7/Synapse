import styles from './ValuesToggle.module.scss'

interface ValuesToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /**
   * Reserves its row but hides it, so the toggle appearing on the grid
   * stages never pushes what is below the viewer down.
   */
  hidden?: boolean
}

/** Square checkbox that prints each cell's 0-255 value. */
function ValuesToggle({ checked, onChange, hidden = false }: ValuesToggleProps) {
  return (
    <label className={styles.toggle} data-hidden={hidden} inert={hidden}>
      <input
        type="checkbox"
        className={styles.box}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>Show values (0–255)</span>
    </label>
  )
}

export default ValuesToggle
