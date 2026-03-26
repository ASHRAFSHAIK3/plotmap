import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Auth.module.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async e => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <div className={styles.box}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⬡</span>
          <span className={styles.logoText}>PlotMap</span>
        </div>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.sub}>Sign in to your workspace</p>
        {error && <div className={styles.error}>{error}</div>}
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label>Email</label>
            <input className="input" type="email" required value={form.email}
              onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="you@company.com" />
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input className="input" type="password" required value={form.password}
              onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="••••••••" />
          </div>
          <button className="btn primary" style={{width:'100%', justifyContent:'center', marginTop:4}} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className={styles.link}>No account? <Link to="/register">Create one</Link></p>
      </div>
    </div>
  )
}
