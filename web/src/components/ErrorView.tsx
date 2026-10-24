import { useEffect, useRef, useState } from 'react'
import { Button, Column, Grid } from '@carbon/react'
import { ArrowRight, ChevronDown, WarningFilled } from '@carbon/icons-react'
import { API_BASE_URL } from '../api/client'
import { formatFunction, stageDetail, stageLabel } from '../pipeline/describe'
import type { PipelineFailure } from '../pipeline/failure'
import { PIPELINE_STAGES } from '../pipeline/stages'
import type { StageKey } from '../pipeline/stages'
import { MAX_UPLOAD_BYTES } from '../pipeline/upload'
import StageMark from './StageMark'
import styles from './ErrorView.module.scss'

interface ErrorViewProps {
  failure: PipelineFailure
  onUploadAnother: () => void
}

type TrackState = 'complete' | 'failed' | 'not-run'

const TRACK_TEXT: Record<TrackState, string> = {
  complete: 'Complete',
  failed: 'Failed',
  'not-run': 'Not run',
}

// Stage pictures arrive as base64 data URLs tens of KB long; keep their type
// and size so the JSON stays readable.
const DATA_URL_KEEP = 40
function shortenDataUrls(_key: string, value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith('data:') || value.length <= DATA_URL_KEEP * 2) {
    return value
  }
  return `${value.slice(0, DATA_URL_KEEP)}… (${(value.length / 1024).toFixed(1)} KB)`
}

function headingFor({ stage, origin }: PipelineFailure): string {
  if (stage) {
    const number = PIPELINE_STAGES.findIndex((s) => s.key === stage) + 1
    return `Pipeline stopped at stage ${number} of ${PIPELINE_STAGES.length}: ${stageLabel(stage)}`
  }
  return origin === 'network' ? 'Could not reach the backend' : 'The run could not start'
}

/** Replaces everything below the header, so there is no doubt the run stopped, and where. */
function ErrorView({ failure, onUploadAnother }: ErrorViewProps) {
  const [showJson, setShowJson] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // The control that started the run is gone; land keyboard focus on the news.
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [])

  const finished = new Map(failure.completed.map((s) => [s.key, s]))
  const trackState = (key: StageKey): TrackState =>
    finished.has(key) ? 'complete' : key === failure.stage ? 'failed' : 'not-run'

  return (
    <Grid as="main" className={styles.main}>
      <Column sm={4} md={8} lg={16} className={styles.content}>
        <h2 ref={headingRef} role="alert" tabIndex={-1} className={styles.heading}>
          <WarningFilled size={20} className={styles.warning} aria-hidden="true" />
          {headingFor(failure)}
        </h2>

        <div className={styles.trackScroll}>
          <ol aria-label="Where the run stopped" className={styles.track}>
            {PIPELINE_STAGES.map(({ key, label }) => {
              const state = trackState(key)
              const stage = finished.get(key)
              return (
                <li key={key} className={styles.step} data-state={state}>
                  {state === 'failed' ? (
                    <WarningFilled size={16} className={styles.warning} aria-hidden="true" />
                  ) : (
                    <StageMark status={state === 'complete' ? 'complete' : 'incomplete'} />
                  )}
                  <span className={styles.stepName}>{label}</span>
                  <span className={styles.visuallyHidden}>{TRACK_TEXT[state]}</span>
                  {stage && <span className={styles.stepTime}>{stageDetail(stage)}</span>}
                </li>
              )
            })}
          </ol>
        </div>

        <dl className={styles.facts}>
          {failure.fn && (
            <>
              <dt>Failed in</dt>
              <dd>
                <code className={styles.snippet}>{formatFunction(failure.fn, { fullPath: true })}</code>
              </dd>
            </>
          )}
          {failure.origin === 'browser' && failure.code === 'FILE_TOO_LARGE' && (
            <>
              <dt>Checked in</dt>
              <dd>
                This browser, before uploading. The server applies the same{' '}
                {MAX_UPLOAD_BYTES / (1024 * 1024)} MiB limit in services/validate.py.
              </dd>
            </>
          )}
          {failure.origin === 'network' && (
            <>
              <dt>Request</dt>
              <dd className={styles.mono}>POST {API_BASE_URL}/api/inferences</dd>
            </>
          )}
          <dt>Code</dt>
          <dd className={styles.mono}>
            <span className={styles.code}>{failure.code}</span>
            {failure.httpStatus !== undefined && (
              <span className={styles.status}> (HTTP {failure.httpStatus})</span>
            )}
          </dd>
          <dt>Message</dt>
          <dd>{failure.message}</dd>
          {failure.detail && (
            <>
              <dt>Detail</dt>
              <dd className={styles.mono}>{failure.detail}</dd>
            </>
          )}
        </dl>

        <div className={styles.actions}>
          <Button kind="primary" size="lg" renderIcon={ArrowRight} className={styles.primary} onClick={onUploadAnother}>
            Upload another image
          </Button>
          {failure.response && (
            <Button
              kind="ghost"
              size="lg"
              renderIcon={ChevronDown}
              className={styles.jsonToggle}
              data-open={showJson}
              aria-expanded={showJson}
              aria-controls="error-response-json"
              onClick={() => setShowJson((open) => !open)}
            >
              {showJson ? 'Hide response JSON' : 'Show response JSON'}
            </Button>
          )}
        </div>

        {failure.response && showJson && (
          <div id="error-response-json" className={styles.jsonBlock}>
            <p className={styles.jsonNote}>Image data URLs are shortened here; everything else is as received.</p>
            <pre className={styles.json}>{JSON.stringify(failure.response, shortenDataUrls, 2)}</pre>
          </div>
        )}
      </Column>
    </Grid>
  )
}

export default ErrorView
