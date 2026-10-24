import { Button, Column, Grid } from '@carbon/react'
import { PlayFilledAlt } from '@carbon/icons-react'
import AppFooter from './components/AppFooter'
import AppHeader from './components/AppHeader'
import FileDropzone from './components/FileDropzone'
import StageList from './components/StageList'
import type { StageListItem } from './components/StageList'
import UploadStatus from './components/UploadStatus'
import { useBackendHealth } from './hooks/useBackendHealth'
import { useUploadDigit } from './hooks/useUploadDigit'
import { PIPELINE_STAGES } from './pipeline/stages'
import styles from './App.module.scss'

// Nothing has run yet, so every stage is not started and none can be selected.
const NOT_STARTED: readonly StageListItem[] = PIPELINE_STAGES.map((stage) => ({
  ...stage,
  status: 'incomplete',
  selectable: false,
}))

function App() {
  const health = useBackendHealth()
  const { state, submit, submitSample, reject } = useUploadDigit()
  const isUploading = state.status === 'uploading'

  return (
    <div className={styles.page}>
      <AppHeader />
      <Grid as="main" className={styles.main}>
        <Column sm={4} md={3} lg={3} className={styles.stages}>
          <StageList items={NOT_STARTED} />
        </Column>
        <Column as="section" aria-label="Viewer" sm={4} md={5} lg={13} className={styles.viewer}>
          <div className={styles.slot}>
            <FileDropzone onFileSelected={submit} onFileRejected={reject} disabled={isUploading} />
            <Button
              kind="ghost"
              size="lg"
              renderIcon={PlayFilledAlt}
              className={styles.sampleButton}
              disabled={isUploading}
              onClick={() => void submitSample()}
            >
              Try a sample digit
            </Button>
          </div>
          <div className={styles.readout}>
            <UploadStatus state={state} />
          </div>
        </Column>
      </Grid>
      <AppFooter health={health} />
    </div>
  )
}

export default App
