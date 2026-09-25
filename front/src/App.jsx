import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const ACCEPTED = ['.pdf', '.docx', '.pptx', '.xlsx', '.xls']

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function App() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [view, setView] = useState('preview')
  const [copied, setCopied] = useState(false)

  function selectFile(selected) {
    if (!selected) return
    const ext = selected.name.slice(selected.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPTED.includes(ext)) {
      setError(`Formato no soportado. Usa: ${ACCEPTED.join(', ')}`)
      return
    }
    setError('')
    setResult(null)
    setFile(selected)
  }

  async function convert() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/convert', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      setResult(data)
      setView('preview')
    } catch (err) {
      setError(err.message || 'Error al convertir el archivo')
    } finally {
      setLoading(false)
    }
  }

  function download() {
    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copy() {
    await navigator.clipboard.writeText(result.markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <main className="container">
      <header>
        <h1>📝 MarkItDown</h1>
        <p>Convierte PDF, Word, PowerPoint y Excel a Markdown.</p>
      </header>

      <section
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          selectFile(e.dataTransfer.files[0])
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          hidden
          onChange={(e) => selectFile(e.target.files[0])}
        />
        {file ? (
          <p><strong>{file.name}</strong> · {formatSize(file.size)}</p>
        ) : (
          <p>Arrastra tu archivo aquí o <u>haz clic para seleccionarlo</u><br /><small>{ACCEPTED.join('  ')}</small></p>
        )}
      </section>

      <div className="actions">
        <button className="primary" onClick={convert} disabled={!file || loading}>
          {loading ? 'Convirtiendo…' : 'Convertir a Markdown'}
        </button>
        {file && <button onClick={reset} disabled={loading}>Limpiar</button>}
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <section className="result">
          <div className="toolbar">
            <div className="tabs">
              <button className={view === 'preview' ? 'active' : ''} onClick={() => setView('preview')}>Vista previa</button>
              <button className={view === 'raw' ? 'active' : ''} onClick={() => setView('raw')}>Markdown</button>
            </div>
            <div className="tabs">
              <button onClick={copy}>{copied ? '¡Copiado!' : 'Copiar'}</button>
              <button className="primary" onClick={download}>Descargar {result.filename}</button>
            </div>
          </div>
          {result.markdown.trim() === '' ? (
            <p className="empty">El archivo no contiene texto extraíble (¿es un PDF escaneado?).</p>
          ) : view === 'preview' ? (
            <article className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.markdown}</ReactMarkdown>
            </article>
          ) : (
            <pre className="raw">{result.markdown}</pre>
          )}
        </section>
      )}
    </main>
  )
}
