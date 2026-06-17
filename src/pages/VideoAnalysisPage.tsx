import { useState, useRef } from 'react'
import { Sparkles, RefreshCw, Upload, Film } from 'lucide-react'
import { extractFrames } from '../utils/extractFrames'
import { useVideoCoach } from '../hooks/useVideoCoach'

export function VideoAnalysisPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [frames, setFrames] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [grade, setGrade] = useState('')
  const [board, setBoard] = useState('')
  const [notes, setNotes] = useState('')

  const { text, loading, error, trigger } = useVideoCoach()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFrames([])
    setExtractError(null)
    setExtracting(true)
    try {
      const extracted = await extractFrames(file, { count: 5, maxWidth: 720, quality: 0.7 })
      setFrames(extracted)
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : 'Could not read that video')
    } finally {
      setExtracting(false)
    }
  }

  const handleAnalyze = () => {
    if (frames.length === 0) return
    trigger(frames, {
      grade: grade.trim() || null,
      board: board.trim() || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <div className="p-4 space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Film size={20} strokeWidth={1.75} /> Video Analysis
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a short attempt clip. We sample 5 frames and an AI coach reviews your technique.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={extracting}
          className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-6 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-sage-400 hover:text-sage-700 transition-colors disabled:opacity-60"
        >
          <Upload size={22} strokeWidth={1.75} />
          <span className="text-sm font-medium">{fileName ?? 'Choose a video'}</span>
        </button>

        {extracting && (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <RefreshCw size={14} className="animate-spin" /> Extracting frames…
          </p>
        )}
        {extractError && <p className="text-sm text-red-500">{extractError}</p>}

        {frames.length > 0 && (
          <>
            <div className="grid grid-cols-5 gap-1.5">
              {frames.map((src, i) => (
                <img key={i} src={src} alt={`frame ${i + 1}`} className="rounded-lg w-full aspect-square object-cover bg-gray-100" />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={grade}
                onChange={e => setGrade(e.target.value)}
                placeholder="Grade (e.g. 7A)"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
              <input
                value={board}
                onChange={e => setBoard(e.target.value)}
                placeholder="Wall / board"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What are you struggling with? (optional)"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
            />

            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full bg-sage-700 text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
            >
              {loading ? (
                <><RefreshCw size={16} strokeWidth={1.75} className="animate-spin" /> Analyzing…</>
              ) : (
                <><Sparkles size={16} strokeWidth={1.75} /> Analyze Technique</>
              )}
            </button>
          </>
        )}

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        {text && (
          <div className="mt-1 bg-sage-50 border border-sage-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-sage-600 uppercase tracking-wide">Coach Analysis</p>
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
                title="Regenerate"
              >
                <RefreshCw size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {text}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Frames are sampled in your browser — the video itself is never uploaded.
      </p>
    </div>
  )
}
