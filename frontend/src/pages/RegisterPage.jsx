import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Auth.module.css'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async e => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await register(form.name, form.email, form.password, form.role)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <div className={styles.box}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⬡</span>
          <span className={styles.logoText}>PlotMap</span>
        </div>
        <h1 className={styles.title}>Create account</h1>
        <p className={styles.sub}>Set up your team workspace</p>
        {error && <div className={styles.error}>{error}</div>}
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label>Full name</label>
            <input className="input" required value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Your name" />
          </div>
          <div className={styles.field}>
            <label>Email</label>
            <input className="input" type="email" required value={form.email}
              onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="you@company.com" />
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input className="input" type="password" required minLength={6} value={form.password}
              onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Min 6 characters" />
          </div>
          <div className={styles.field}>
            <label>Account type</label>
            <div className={styles.roleRow}>
              {[
                { value: 'admin', label: 'Admin', desc: 'Create & manage projects' },
                { value: 'viewer', label: 'Viewer', desc: 'View assigned projects' }
              ].map(r => (
                <div key={r.value}
                  className={`${styles.roleCard} ${form.role === r.value ? styles.selected : ''}`}
                  onClick={() => setForm(f => ({...f, role: r.value}))}>
                  <strong>{r.label}</strong>
                  <span>{r.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <button className="btn primary" style={{width:'100%', justifyContent:'center', marginTop:4}} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className={styles.link}>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  )
}
