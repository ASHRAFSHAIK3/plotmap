import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const API = (import.meta.env.VITE_API_URL || '/api')

const SC = {
  Available:  { f: '#E1F5EE', s: '#1D9E75', t: '#085041' },
  Allotted:   { f: '#FAEEDA', s: '#BA7517', t: '#412402' },
  Registered: { f: '#E6F1FB', s: '#185FA5', t: '#042C53' },
  Mortgage:   { f: '#FCEBEB', s: '#A32D2D', t: '#501313' },
}

function tc(p, z, wx, wy) { return { x: wx * z + p.x, y: wy * z + p.y } }
function polyArea(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y)
  return Math.abs(a / 2)
}
function pointInPoly(x, y, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > y) !== (pts[j].y > y) && x < (pts[j].x - pts[i].x) * (y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x)
      inside = !inside
  }
  return inside
}

const STATUS_ORDER = ['Available', 'Allotted', 'Registered', 'Mortgage']

export default function PublicViewPage() {
  const { token } = useParams()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPlot, setSelectedPlot] = useState(null)
  const [filter, setFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('map')
  const [stats, setStats] = useState({})
  const cvRef = useRef(null)
  const wrapRef = useRef(null)
  const stateRef = useRef({ pan: { x: 60, y: 60 }, zoom: 1, plots: [], roads: [], boundary: null })
  const rafRef = useRef(null)
  const filterRef = useRef('all')

  useEffect(() => {
    axios.get(`${API}/public/${token}`)
      .then(r => {
        const data = r.data
        data.plots = (data.plots || []).map(p => ({
          ...p, num: p.plot_number,
          pts: typeof p.pts === 'string' ? JSON.parse(p.pts) : p.pts,
          customer: p.customer_name
        }))
        data.roads = (data.roads || []).map(r => ({
          ...r, pts: typeof r.pts === 'string' ? JSON.parse(r.pts) : r.pts
        }))
        data.boundary = typeof data.boundary === 'string' ? JSON.parse(data.boundary) : data.boundary
        setProject(data)
        const s = stateRef.current
        s.plots = data.plots
        s.roads = data.roads
        s.boundary = data.boundary
        updateStats(data.plots)
      })
      .catch(() => setError('This link is invalid or has been revoked.'))
      .finally(() => setLoading(false))
  }, [token])

  const updateStats = (plots) => {
    const s = {}
    STATUS_ORDER.forEach(k => s[k] = 0)
    ;(plots || []).forEach(p => { if (s[p.status] !== undefined) s[p.status]++ })
    setStats(s)
  }

  const requestDraw = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(drawScene)
  }, [])

  const drawScene = useCallback(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const { pan, zoom, boundary, roads, plots } = stateRef.current
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0ede8'
    ctx.fillRect(0, 0, W, H)
    // Grid
    ctx.save()
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 0.5
    const gs = 20 * zoom, ox = pan.x % gs, oy = pan.y % gs
    for (let x = ox; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = oy; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
    ctx.restore()
    // Boundary
    if (boundary && boundary.length > 2) {
      ctx.save()
      ctx.beginPath()
      boundary.forEach((p, i) => { const c = tc(pan, zoom, p.x, p.y); i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y) })
      ctx.closePath()
      ctx.fillStyle = 'rgba(200,230,200,0.3)'
      ctx.fill()
      ctx.strokeStyle = '#5a8a5a'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }
    // Roads
    roads.forEach(r => {
      if (!r.pts || r.pts.length < 2) return
      ctx.save()
      ctx.beginPath()
      r.pts.forEach((p, i) => { const c = tc(pan, zoom, p.x, p.y); i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y) })
      ctx.strokeStyle = '#b0a090'
      ctx.lineWidth = (r.width || 8) * zoom
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.restore()
    })
    // Plots
    const cf = filterRef.current
    plots.forEach(p => {
      if (!p.pts || p.pts.length < 3) return
      const dimmed = cf !== 'all' && p.status !== cf
      const col = SC[p.status] || SC.Available
      ctx.save()
      ctx.beginPath()
      p.pts.forEach((pt, i) => { const c = tc(pan, zoom, pt.x, pt.y); i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y) })
      ctx.closePath()
      ctx.globalAlpha = dimmed ? 0.25 : 1
      ctx.fillStyle = col.f
      ctx.fill()
      ctx.strokeStyle = col.s
      ctx.lineWidth = selectedPlot?.id === p.id ? 2.5 : 1.5
      ctx.stroke()
      // Label
      const cx = p.pts.reduce((a, b) => a + b.x, 0) / p.pts.length
      const cy = p.pts.reduce((a, b) => a + b.y, 0) / p.pts.length
      const c = tc(pan, zoom, cx, cy)
      ctx.globalAlpha = dimmed ? 0.3 : 1
      ctx.fillStyle = col.t
      ctx.font = `bold ${Math.max(8, 11 * zoom)}px Inter,sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.num, c.x, c.y - 6 * zoom)
      ctx.font = `${Math.max(6, 9 * zoom)}px Inter,sans-serif`
      ctx.fillStyle = col.s
      if (p.area) ctx.fillText(`${Number(p.area).toFixed(0)} sq.yd`, c.x, c.y + 6 * zoom)
      ctx.restore()
    })
  }, [selectedPlot])

  useEffect(() => {
    if (!project) return
    const cv = cvRef.current
    const wrap = wrapRef.current
    if (!cv || !wrap) return
    const ro = new ResizeObserver(() => {
      cv.width = wrap.clientWidth
      cv.height = wrap.clientHeight
      requestDraw()
    })
    ro.observe(wrap)
    cv.width = wrap.clientWidth
    cv.height = wrap.clientHeight
    requestDraw()

    // Pan + zoom
    let isPanning = false, panStart = {}, panOrig = {}
    const onDown = e => {
      isPanning = true
      panStart = { x: e.clientX, y: e.clientY }
      panOrig = { ...stateRef.current.pan }
      cv.style.cursor = 'grabbing'
    }
    const onMove = e => {
      if (!isPanning) return
      stateRef.current.pan = { x: panOrig.x + e.clientX - panStart.x, y: panOrig.y + e.clientY - panStart.y }
      requestDraw()
    }
    const onUp = () => { isPanning = false; cv.style.cursor = 'default' }
    const onWheel = e => {
      e.preventDefault()
      const rect = cv.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const oldZ = stateRef.current.zoom
      const newZ = Math.max(0.2, Math.min(5, oldZ * (e.deltaY < 0 ? 1.1 : 0.9)))
      stateRef.current.pan.x = mx - (mx - stateRef.current.pan.x) * (newZ / oldZ)
      stateRef.current.pan.y = my - (my - stateRef.current.pan.y) * (newZ / oldZ)
      stateRef.current.zoom = newZ
      requestDraw()
    }
    const onClick = e => {
      const rect = cv.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const { pan, zoom, plots } = stateRef.current
      const wx = (mx - pan.x) / zoom, wy = (my - pan.y) / zoom
      const hit = plots.find(p => p.pts && pointInPoly(wx, wy, p.pts))
      setSelectedPlot(hit || null)
    }
    cv.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    cv.addEventListener('wheel', onWheel, { passive: false })
    cv.addEventListener('click', onClick)
    return () => {
      ro.disconnect()
      cv.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cv.removeEventListener('wheel', onWheel)
      cv.removeEventListener('click', onClick)
    }
  }, [project, requestDraw])

  useEffect(() => { requestDraw() }, [selectedPlot, requestDraw])

  const setFilter2 = (f) => {
    setFilter(f)
    filterRef.current = f
    requestDraw()
  }

  const fmtPrice = (p) => p ? `₹${Number(p).toLocaleString('en-IN')}` : '—'
  const companyName = import.meta.env.VITE_COMPANY_NAME || 'PlotMap Realty'
  const companyTagline = import.meta.env.VITE_COMPANY_TAGLINE || 'Premium Land Layouts'

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8f6f2', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 32 }}>⬡</div>
      <div style={{ color: '#666', fontSize: 14 }}>Loading project…</div>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8f6f2', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🔗</div>
      <div style={{ color: '#333', fontWeight: 600, fontSize: 18 }}>Link not found</div>
      <div style={{ color: '#888', fontSize: 14 }}>{error}</div>
    </div>
  )

  const totalPlots = project.plots.length
  const availCount = stats['Available'] || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f6f2', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e8e4de', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22, color: '#1D9E75' }}>⬡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a', lineHeight: 1 }}>{companyName}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{companyTagline}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>{project.name}</div>
            {project.description && <div style={{ fontSize: 12, color: '#888' }}>{project.description}</div>}
          </div>
          <div style={{ background: '#E1F5EE', color: '#085041', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
            {availCount} Available
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8e4de', padding: '10px 24px', display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter2('all')} style={{ padding: '5px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: filter === 'all' ? '#1a1a1a' : '#f5f5f5', color: filter === 'all' ? '#fff' : '#444', borderColor: filter === 'all' ? '#1a1a1a' : '#ddd', transition: 'all .15s' }}>
          All ({totalPlots})
        </button>
        {STATUS_ORDER.map(s => (
          <button key={s} onClick={() => setFilter2(s)} style={{ padding: '5px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: filter === s ? SC[s].s : SC[s].f, color: filter === s ? '#fff' : SC[s].t, borderColor: SC[s].s, transition: 'all .15s' }}>
            {s} ({stats[s] || 0})
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={() => setActiveTab('map')} style={{ padding: '5px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: activeTab === 'map' ? '#1D9E75' : '#f5f5f5', color: activeTab === 'map' ? '#fff' : '#444', borderColor: activeTab === 'map' ? '#1D9E75' : '#ddd' }}>🗺 Map</button>
          <button onClick={() => setActiveTab('list')} style={{ padding: '5px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: activeTab === 'list' ? '#1D9E75' : '#f5f5f5', color: activeTab === 'list' ? '#fff' : '#444', borderColor: activeTab === 'list' ? '#1D9E75' : '#ddd' }}>📋 List</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Map */}
        {activeTab === 'map' && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} ref={wrapRef}>
            <canvas ref={cvRef} style={{ position: 'absolute', inset: 0, cursor: 'default' }} />
            {/* Selected plot card */}
            {selectedPlot && (
              <div style={{ position: 'absolute', top: 16, right: 16, background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.13)', padding: 18, minWidth: 220, maxWidth: 280, borderTop: `4px solid ${SC[selectedPlot.status]?.s || '#888'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 17 }}>Plot {selectedPlot.num}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, background: SC[selectedPlot.status]?.f, color: SC[selectedPlot.status]?.t, borderRadius: 10, padding: '2px 8px', display: 'inline-block', marginTop: 4 }}>{selectedPlot.status}</span>
                  </div>
                  <button onClick={() => setSelectedPlot(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
                  {selectedPlot.area && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Area</span><span style={{ fontWeight: 600 }}>{Number(selectedPlot.area).toFixed(1)} sq.yd</span></div>}
                  {selectedPlot.facing && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Facing</span><span style={{ fontWeight: 600 }}>{selectedPlot.facing}</span></div>}
                  {selectedPlot.price && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Price</span><span style={{ fontWeight: 700, color: '#1D9E75', fontSize: 14 }}>{fmtPrice(selectedPlot.price)}</span></div>}
                  {selectedPlot.status === 'Available' && selectedPlot.price && (
                    <div style={{ marginTop: 8, background: '#E1F5EE', borderRadius: 8, padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#085041', fontWeight: 600 }}>
                      📞 Contact us for booking
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Zoom hint */}
            <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 8, padding: '5px 10px', fontSize: 11 }}>
              Scroll to zoom · Drag to pan · Click plot for details
            </div>
          </div>
        )}

        {/* List view */}
        {activeTab === 'list' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
              <thead>
                <tr style={{ background: '#f8f6f2', borderBottom: '2px solid #e8e4de' }}>
                  {['Plot No.', 'Area (sq.yd)', 'Facing', 'Status', 'Price'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {project.plots
                  .filter(p => filter === 'all' || p.status === filter)
                  .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }))
                  .map((p, i) => (
                    <tr key={p.id} onClick={() => { setSelectedPlot(p); setActiveTab('map') }}
                      style={{ borderBottom: '1px solid #f0ede8', cursor: 'pointer', background: i % 2 === 0 ? '#fff' : '#fafaf8', transition: 'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f9f5'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafaf8'}>
                      <td style={{ padding: '11px 16px', fontWeight: 700, fontSize: 14 }}>{p.num}</td>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: '#444' }}>{p.area ? Number(p.area).toFixed(1) : '—'}</td>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: '#444' }}>{p.facing || '—'}</td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, background: SC[p.status]?.f, color: SC[p.status]?.t, borderRadius: 10, padding: '3px 10px', border: `1px solid ${SC[p.status]?.s}` }}>{p.status}</span>
                      </td>
                      <td style={{ padding: '11px 16px', fontWeight: 700, color: p.price ? '#1D9E75' : '#bbb', fontSize: 14 }}>{fmtPrice(p.price)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {project.plots.filter(p => filter === 'all' || p.status === filter).length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>No plots match this filter</div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ background: '#fff', borderTop: '1px solid #e8e4de', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#aaa' }}>Powered by PlotMap · Read-only public view</div>
        <div style={{ fontSize: 12, color: '#888' }}>
          {totalPlots} total plots · <span style={{ color: '#1D9E75', fontWeight: 600 }}>{availCount} available</span>
        </div>
      </footer>
    </div>
  )
}
