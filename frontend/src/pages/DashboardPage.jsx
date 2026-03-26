import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import styles from './Dashboard.module.css'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)
  const [shareModal, setShareModal] = useState(null) // { projectId, token }

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data)).finally(() => setLoading(false))
  }, [])

  const createProject = async e => {
    e.preventDefault(); setCreating(true)
    try {
      const r = await api.post('/api/projects', newForm)
      navigate(`/project/${r.data.id}`)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create project')
    } finally { setCreating(false) }
  }

  const deleteProject = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this project? This cannot be undone.')) return
    await api.delete(`/projects/${id}`)
    setProjects(p => p.filter(x => x.id !== id))
  }

  const generateShareLink = async (projectId, e) => {
    e.stopPropagation()
    try {
      const r = await api.post(`/projects/${projectId}/share-link`)
      setShareModal({ projectId, token: r.data.token })
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate link')
    }
  }

  const shareUrl = shareModal ? `${window.location.origin}/view/${shareModal.token}` : ''

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>⬡ PlotMap</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userName}>{user?.name}</span>
          <span className={`badge ${user?.role === 'admin' ? 'Registered' : 'Available'}`}>{user?.role}</span>
          <button className="btn sm" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.topRow}>
          <div>
            <h1 className={styles.heading}>Projects</h1>
            <p className={styles.sub}>Your land layout projects</p>
          </div>
          {user?.role === 'admin' && (
            <button className="btn primary" onClick={() => setShowNew(true)}>+ New Project</button>
          )}
        </div>

        {showNew && (
          <div className={styles.overlay}>
            <div className={styles.modal}>
              <h2>New project</h2>
              <form onSubmit={createProject} className={styles.modalForm}>
                <div className={styles.field}>
                  <label>Project name</label>
                  <input className="input" required value={newForm.name}
                    onChange={e => setNewForm(f => ({...f, name: e.target.value}))}
                    placeholder="e.g. Green Valley Phase 1" />
                </div>
                <div className={styles.field}>
                  <label>Description (optional)</label>
                  <textarea className="input" rows={3} value={newForm.description}
                    onChange={e => setNewForm(f => ({...f, description: e.target.value}))}
                    placeholder="Location, notes…" style={{resize:'vertical'}} />
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className="btn" onClick={() => setShowNew(false)}>Cancel</button>
                  <button className="btn primary" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Share link modal */}
        {shareModal && (
          <div className={styles.overlay}>
            <div className={styles.modal}>
              <h2>🔗 Public Share Link</h2>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                Anyone with this link can view the project layout — no login required. Perfect for sharing with clients.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input className="input" readOnly value={shareUrl} style={{ flex: 1, fontSize: 12, background: '#f5f5f5' }} onClick={e => e.target.select()} />
                <button className="btn primary sm" onClick={() => { navigator.clipboard.writeText(shareUrl); alert('Link copied!') }}>Copy</button>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn sm danger" onClick={async () => {
                  await api.delete(`/projects/${shareModal.projectId}/share-link`)
                  setShareModal(null)
                  alert('Link revoked. The old link no longer works.')
                }}>Revoke link</button>
                <button className="btn sm" onClick={() => setShareModal(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className={styles.empty}>Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>⬡</div>
            <p>No projects yet.</p>
            {user?.role === 'admin' && <button className="btn primary" onClick={() => setShowNew(true)}>Create your first project</button>}
          </div>
        ) : (
          <div className={styles.grid}>
            {projects.map(p => (
              <div key={p.id} className={styles.card} onClick={() => navigate(`/project/${p.id}`)}>
                <div className={styles.cardTop}>
                  <div className={styles.cardIcon}>⬡</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm" style={{ background: '#E1F5EE', color: '#085041', border: '1px solid #1D9E75' }}
                      onClick={e => generateShareLink(p.id, e)} title="Generate public share link">
                      🔗 Share
                    </button>
                    {user?.role === 'admin' && user?.id === p.owner_id && (
                      <button className="btn sm danger" onClick={e => deleteProject(p.id, e)}>Delete</button>
                    )}
                  </div>
                </div>
                <h3 className={styles.cardName}>{p.name}</h3>
                {p.description && <p className={styles.cardDesc}>{p.description}</p>}
                <div className={styles.cardMeta}>
                  <span>{p.plot_count} plots</span>
                  <span>·</span>
                  <span>{new Date(p.updated_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.cardOwner}>by {p.owner_name}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
