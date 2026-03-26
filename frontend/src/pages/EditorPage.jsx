import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import CanvasEditor from '../components/CanvasEditor'
import styles from './Editor.module.css'

export default function EditorPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveMsg, setSaveMsg] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [shareRole, setShareRole] = useState('viewer')
  const [sharing, setSharing] = useState(false)
  const [showPublicShare, setShowPublicShare] = useState(false)
  const [shareToken, setShareToken] = useState(null)
  const [generatingLink, setGeneratingLink] = useState(false)

  useEffect(() => {
    api.get(`/projects/${id}`)
      .then(r => setProject(r.data))
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async (data) => {
    await api.post(`/projects/${id}/save-layout`, data)
    setSaveMsg('Saved ✓')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  const addMember = async e => {
    e.preventDefault(); setSharing(true)
    try {
      await api.post(`/projects/${id}/members`, { email: shareEmail, role: shareRole })
      setShareEmail(''); setShowShare(false)
      alert('Member added successfully')
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add member')
    } finally { setSharing(false) }
  }

  const generatePublicLink = async () => {
    setGeneratingLink(true)
    try {
      const r = await api.post(`/projects/${id}/share-link`)
      setShareToken(r.data.token)
      setShowPublicShare(true)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate link')
    } finally { setGeneratingLink(false) }
  }

  const revokePublicLink = async () => {
    await api.delete(`/projects/${id}/share-link`)
    setShareToken(null)
    setShowPublicShare(false)
    alert('Public link revoked.')
  }

  const shareUrl = shareToken ? `${window.location.origin}/view/${shareToken}` : ''

  const isOwner = project?.owner_id === user?.id
  const isAdmin = user?.role === 'admin'
  const canEdit = isOwner || isAdmin

  if (loading) return <div className={styles.loading}>Loading project…</div>

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.back}>← Projects</Link>
          <div className={styles.sep} />
          <span className={styles.projName}>{project?.name}</span>
          {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
        </div>
        <div className={styles.headerRight}>
          {/* Public share link button */}
          <button className="btn sm" style={{ background: '#E1F5EE', color: '#085041', border: '1px solid #1D9E75' }}
            onClick={generatePublicLink} disabled={generatingLink}>
            {generatingLink ? '…' : '🔗 Client View'}
          </button>
          {canEdit && (
            <button className="btn sm" onClick={() => setShowShare(true)}>+ Share</button>
          )}
          {project?.members?.length > 0 && (
            <div className={styles.members}>
              {project.members.slice(0, 3).map(m => (
                <div key={m.id} className={styles.avatar} title={`${m.name} (${m.role})`}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {project.members.length > 3 && <div className={styles.avatar}>+{project.members.length - 3}</div>}
            </div>
          )}
          <span className={styles.userName}>{user?.name}</span>
        </div>
      </header>

      {/* Team share modal */}
      {showShare && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>Share project</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Invite team members to collaborate</p>
            <form onSubmit={addMember} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={styles.field}>
                <label>Email address</label>
                <input className="input" type="email" required value={shareEmail}
                  onChange={e => setShareEmail(e.target.value)} placeholder="teammate@company.com" />
              </div>
              <div className={styles.field}>
                <label>Role</label>
                <select className="input" value={shareRole} onChange={e => setShareRole(e.target.value)}>
                  <option value="viewer">Viewer — can view only</option>
                  <option value="admin">Admin — can edit</option>
                </select>
              </div>
              {project?.members?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Current members</div>
                  {project.members.map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span>{m.name} <span style={{ color: 'var(--text3)' }}>{m.email}</span></span>
                      <span className={`badge ${m.role === 'admin' ? 'Registered' : 'Available'}`}>{m.role}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn" onClick={() => setShowShare(false)}>Close</button>
                <button className="btn primary" disabled={sharing}>{sharing ? 'Adding…' : 'Add member'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Public link modal */}
      {showPublicShare && shareToken && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>🔗 Client View Link</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              Share this link with clients. They can view the layout, filter plots, and see prices — no login needed.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="input" readOnly value={shareUrl} style={{ flex: 1, fontSize: 12, background: '#f5f5f5' }} onClick={e => e.target.select()} />
              <button className="btn primary sm" onClick={() => { navigator.clipboard.writeText(shareUrl); alert('Copied!') }}>Copy</button>
            </div>
            <div style={{ background: '#f0f9f5', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#085041', marginBottom: 16 }}>
              ✓ Interactive plot map &nbsp;·&nbsp; ✓ Plot list & prices &nbsp;·&nbsp; ✓ Status filters &nbsp;·&nbsp; ✓ No login required
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn sm danger" onClick={revokePublicLink}>Revoke link</button>
              <button className="btn sm" onClick={() => setShowPublicShare(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.editorWrap}>
        <CanvasEditor project={project} onSave={handleSave} readOnly={!canEdit} />
      </div>
    </div>
  )
}
