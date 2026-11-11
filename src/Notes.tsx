import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Note } from './lib/supabase'

export default function Notes({ session }: { session: Session }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setNotes(data ?? [])
      })
  }, [])

  async function addNote(e: FormEvent) {
    e.preventDefault()
    const text = content.trim()
    if (!text) return
    const { data, error } = await supabase.from('notes').insert({ content: text }).select().single()
    if (error) return setError(error.message)
    setNotes((prev) => [data, ...prev])
    setContent('')
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) return setError(error.message)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="card wide">
      <header className="row">
        <div>
          <h1>Eslatmalar</h1>
          <p className="muted">{session.user.email}</p>
        </div>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>
          Chiqish
        </button>
      </header>
      <form onSubmit={addNote} className="row">
        <input placeholder="Yangi eslatma…" value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} />
        <button type="submit">Qo‘shish</button>
      </form>
      {error && <p className="message">{error}</p>}
      <ul className="notes">
        {notes.map((n) => (
          <li key={n.id}>
            <span>{n.content}</span>
            <button className="link" onClick={() => deleteNote(n.id)} aria-label="O‘chirish">
              ✕
            </button>
          </li>
        ))}
        {notes.length === 0 && <li className="muted">Hali eslatma yo‘q.</li>}
      </ul>
    </div>
  )
}
