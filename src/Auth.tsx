import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
    setLoading(false)
    if (error) setMessage(error.message)
    else if (mode === 'signup') setMessage('Emailingizni tekshiring — tasdiqlash havolasi yuborildi.')
  }

  return (
    <div className="card">
      <h1>Powerful Pro</h1>
      <p className="muted">{mode === 'signin' ? 'Hisobingizga kiring' : 'Yangi hisob yarating'}</p>
      <form onSubmit={handleSubmit} className="stack">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Parol (kamida 6 belgi)"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Kuting…' : mode === 'signin' ? 'Kirish' : 'Ro‘yxatdan o‘tish'}
        </button>
      </form>
      {message && <p className="message">{message}</p>}
      <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'Hisobingiz yo‘qmi? Ro‘yxatdan o‘ting' : 'Hisobingiz bormi? Kiring'}
      </button>
    </div>
  )
}
