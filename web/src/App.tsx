import { useState } from 'react'
import FileDropzone from './components/FileDropzone'

function App() {
  const [file, setFile] = useState<File | null>(null)

  return (
    <>
      <h1>Synapse</h1>
      <FileDropzone onFileSelected={setFile} />
      {file && (
        <p>
          Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
        </p>
      )}
    </>
  )
}

export default App
