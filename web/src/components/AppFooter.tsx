import { Column, Grid } from '@carbon/react'
import type { BackendHealth } from '../hooks/useBackendHealth'
import styles from './AppFooter.module.scss'

interface AppFooterProps {
  health: BackendHealth
}

/** Git's default short-hash length, so the footer matches `git log --oneline`. */
const SHORT_COMMIT_LENGTH = 7

function describeHealth(health: BackendHealth): string {
  switch (health.status) {
    case 'checking':
      return 'Checking backend'
    case 'offline':
      return 'Backend offline'
    case 'online':
      return `API v${health.version} · commit ${health.commit.slice(0, SHORT_COMMIT_LENGTH)} · Backend online`
    default: {
      const _exhaustive: never = health
      return _exhaustive
    }
  }
}

function AppFooter({ health }: AppFooterProps) {
  return (
    <footer className={styles.footer}>
      <Grid>
        <Column sm={4} md={8} lg={16}>
          <p className={styles.health}>{describeHealth(health)}</p>
        </Column>
      </Grid>
    </footer>
  )
}

export default AppFooter
