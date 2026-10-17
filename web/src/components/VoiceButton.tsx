import { useEffect, useRef, useState } from 'react'

/** Nhận giọng nói của trình duyệt (Chrome, Edge, Safari): webkitSpeechRecognition / SpeechRecognition */
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition

/** Nút "🎤 Nói": nói tiếng Việt, chữ nhận được gửi qua onText. Trình duyệt không hỗ trợ thì không hiện. */
export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)

  useEffect(() => () => recognition.current?.stop(), [])

  if (!Speech) return null

  const toggle = () => {
    if (listening) {
      recognition.current?.stop()
      return
    }
    const r = new Speech()
    r.lang = 'vi-VN'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (text) onText(text)
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Hãy cho phép trình duyệt dùng micro.' : 'Không nghe rõ, nói lại nhé.')
    r.onend = () => setListening(false)
    recognition.current = r
    setError(null)
    setListening(true)
    r.start()
  }

  return (
    <>
      <button type="button" className={`voice ${listening ? 'active-toggle' : ''}`} onClick={toggle} aria-pressed={listening}>
        {listening ? '⏹ Đang nghe… bấm để dừng' : '🎤 Nói'}
      </button>
      {error && <span className="field-error">{error}</span>}
    </>
  )
}
