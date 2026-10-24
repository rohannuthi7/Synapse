import { Column, Grid } from '@carbon/react'
import { LogoGithub } from '@carbon/icons-react'
import styles from './AppHeader.module.scss'

const REPO_URL = 'https://github.com/rohannuthi7/Synapse'

function AppHeader() {
  return (
    <header className={styles.header}>
      <Grid>
        <Column sm={4} md={8} lg={16} className={styles.row}>
          <div>
            <h1 className={styles.title}>Synapse</h1>
            <p className={styles.description}>
              Handwritten digit to 8×8 input for a neuromorphic chip.
            </p>
          </div>
          <a
            className={styles.repoLink}
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Synapse on GitHub (opens in a new tab)"
            title="GitHub"
          >
            <LogoGithub size={20} aria-hidden="true" />
          </a>
        </Column>
      </Grid>
    </header>
  )
}

export default AppHeader
