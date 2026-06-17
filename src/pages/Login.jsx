import { useState } from 'react'
import { AlertCircle, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { session, loading: sessionLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!sessionLoading && session) return <Navigate to="/" replace />

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (loginError) {
      console.error('Login gagal:', loginError)
      setError(loginError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    navigate(location.state?.from || '/', { replace: true })
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-mark">CM</div>
          <div><strong>Cerutumurah</strong><span>Stock Admin</span></div>
        </div>
        <div className="login-heading">
          <span className="eyebrow">Admin Access</span>
          <h1>Masuk ke ruang kerja.</h1>
          <p>Gunakan akun admin Supabase untuk melanjutkan.</p>
        </div>
        {error && <div className="notice error"><AlertCircle size={18} /><span>{error}</span></div>}
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <div><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div>
          </label>
          <label>
            <span>Password</span>
            <div><LockKeyhole size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div>
          </label>
          <button className="button primary" disabled={loading || sessionLoading}>
            {(loading || sessionLoading) && <LoaderCircle className="spin" size={17} />}
            {loading ? 'Memproses...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  )
}
