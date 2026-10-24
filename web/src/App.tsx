import { useState } from 'react'
import { Button } from '@carbon/react'
import { PlayFilledAlt } from '@carbon/icons-react'
import AppFooter from './components/AppFooter'
import AppHeader from './components/AppHeader'
import ErrorView from './components/ErrorView'
import FileDropzone from './components/FileDropzone'
import PipelinePlayer from './components/PipelinePlayer'
import StageList from './components/StageList'
import type { StageListItem } from './components/StageList'
import UploadStatus from './components/UploadStatus'
import Workspace from './components/Workspace'
import { useBackendHealth } from './hooks/useBackendHealth'
import { usePipelineRun } from './hooks/usePipelineRun'
import { PLAYBACK_FIXTURE } from './pipeline/fixtures/playbackRun'
import { PIPELINE_STAGES } from './pipeline/stages'
import styles from './App.module.scss'

// Nothing has run yet, so every stage is not started and none can be selected.
const NOT_STARTED: readonly StageListItem[] = PIPELINE_STAGES.map((stage) => ({
  ...stage,
  status: 'incomplete',
  selectable: false,
}))

// `?fixture` plays the prototype's run, which includes a Frame stage the
// backend does not produce yet. Development builds only: production never
// shows fixture data.
const fixtureRun =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture')
    ? PLAYBACK_FIXTURE
    : null

function App() {
  const health = useBackendHealth()
  const { state, submit, submitSample, reject, reset } = usePipelineRun()
  const [fixture, setFixture] = useState(fixtureRun)
  const run = state.status === 'playing' ? state.run : fixture
  const isUploading = state.status === 'uploading'

  const startOver = () => {
    setFixture(null)
    reset()
  }

  const body = (() => {
    if (state.status === 'failed') return <ErrorView failure={state.failure} onUploadAnother={startOver} />
    if (run) return <PipelinePlayer key={run.id} run={run} onUploadAnother={startOver} />
    return (
      <Workspace
        stages={<StageList items={NOT_STARTED} />}
        summary={{ label: 'Not started', status: 'incomplete' }}
        slot={
          <>
            <FileDropzone onFileSelected={submit} onFileRejected={reject} disabled={isUploading} />
            <Button
              kind="tertiary"
              size="lg"
              renderIcon={PlayFilledAlt}
              className={styles.sampleButton}
              disabled={isUploading}
              onClick={() => void submitSample()}
            >
              Try a sample digit
            </Button>
          </>
        }
        readout={<UploadStatus uploading={isUploading ? state.file : undefined} />}
      />
    )
  })()

  return (
    <div className={styles.page}>
      <AppHeader />
      {body}
      <AppFooter health={health} />
    </div>
  )
}

export default App
