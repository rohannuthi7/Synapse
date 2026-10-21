import FileDropzone from './components/FileDropzone'
import { useUploadDigit } from './hooks/useUploadDigit'

function App() {
  const { state, submit } = useUploadDigit()

  const renderStatus = () => {
    switch (state.status) {
      case 'idle':
        return null
      case 'uploading':
        return <p>Uploading {state.file.name}…</p>
      case 'done':
        return (
          <p>
            Validated: {state.result.upload.detected_mime},{' '}
            {state.result.upload.bytes} bytes
          </p>
        )
      case 'error':
        return <p role="alert">{state.error.message}</p>
      default: {
        const _exhaustive: never = state
        return _exhaustive
      }
    }
  }

  return (
    <>
      <h1>Synapse</h1>
      <FileDropzone
        onFileSelected={submit}
        disabled={state.status === 'uploading'}
      />
      {renderStatus()}
    </>
  )
}

export default App
