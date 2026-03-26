import { useRef, useEffect, useState, useCallback } from 'react'

const SC = {
  Available:  { f: '#E1F5EE', s: '#1D9E75', t: '#085041' },
  Allotted:   { f: '#FAEEDA', s: '#BA7517', t: '#412402' },
  Registered: { f: '#E6F1FB', s: '#185FA5', t: '#042C53' },
  Mortgage:   { f: '#FCEBEB', s: '#A32D2D', t: '#501313' },
}

function tw(p, z, cx, cy) { return { x: (cx - p.x) / z, y: (cy - p.y) / z } }
function tc(p, z, wx, wy) { return { x: wx * z + p.x, y: wy * z + p.y } }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }
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

export default function CanvasEditor({ project, onSave, readOnly }) {
  const cvRef = useRef(null)
  const wrapRef = useRef(null)
  const stateRef = useRef({
    pan: { x: 60, y: 60 }, zoom: 1,
    boundary: null, roads: [], plots: [],
    selected: null, mode: 'select',
    drawing: false, drawPts: [],
    dragHandle: null, isPanning: false,
    panStart: { x: 0, y: 0 }, panOrig: { x: 0, y: 0 },
    mouse: { x: 0, y: 0 }, plotCounter: 0,
  })
  const [mode, setModeState] = useState('select')
  const [hint, setHint] = useState('')
  const [selectedPlot, setSelectedPlot] = useState(null)
  const [stats, setStats] = useState({ total: 0, available: 0, allotted: 0, registered: 0, mortgage: 0 })
  const [filter, setFilter] = useState('all')
  const filterRef = useRef('all')
  const [saving, setSaving] = useState(false)
  const [autoW, setAutoW] = useState(55)
  const [autoH, setAutoH] = useState(42)
  const rafRef = useRef(null)

  // Load project data
  useEffect(() => {
    if (!project) return
    const s = stateRef.current
    s.boundary = project.boundary || null
    s.roads = (project.roads || []).map(r => ({ ...r, pts: typeof r.pts === 'string' ? JSON.parse(r.pts) : r.pts }))
    s.plots = (project.plots || []).map(p => ({
      ...p, num: p.plot_number,
      pts: typeof p.pts === 'string' ? JSON.parse(p.pts) : p.pts,
      customer: p.customer_name
    }))
    s.plotCounter = s.plots.length
    updateStats()
    requestDraw()
  }, [project])

  const requestDraw = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(drawScene)
  }, [])

  const drawScene = useCallback(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const { pan, zoom, boundary, roads, plots, selected, mode, drawing, drawPts, mouse } = stateRef.current
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)

    // Background
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
      ctx.strokeStyle = '#3a8a3a'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
      if (mode === 'edit-boundary') {
        boundary.forEach((p, i) => {
          const c = tc(pan, zoom, p.x, p.y)
          const { dragHandle } = stateRef.current
          ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2)
          ctx.fillStyle = dragHandle?.type === 'boundary' && dragHandle.idx === i ? '#185FA5' : '#3a8a3a'
          ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
        })
      }
      ctx.restore()
    }

    // Roads
    roads.forEach(r => {
      ctx.save()
      ctx.beginPath()
      r.pts.forEach((p, i) => { const c = tc(pan, zoom, p.x, p.y); i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y) })
      const isSel = selected?.obj === r
      ctx.strokeStyle = isSel ? '#E24B4A' : '#1a1a1a'
      ctx.lineWidth = 8 * zoom
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([])
      if (isSel) {
        r.pts.forEach((p, i) => {
          const { dragHandle } = stateRef.current
          const c = tc(pan, zoom, p.x, p.y)
          ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2)
          ctx.fillStyle = dragHandle?.type === 'road' && dragHandle.idx === i ? '#E24B4A' : '#666'
          ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
        })
      }
      ctx.restore()
    })

    // Plots
    const fil = filterRef.current
    plots.forEach(p => {
      const vis = fil === 'all' || p.status === fil
      if (!vis) ctx.globalAlpha = 0.2
      const col = SC[p.status] || SC.Available
      const isSel = selected?.obj === p
      ctx.save()
      ctx.beginPath()
      p.pts.forEach((pt, i) => { const c = tc(pan, zoom, pt.x, pt.y); i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y) })
      ctx.closePath()
      ctx.fillStyle = col.f; ctx.fill()
      ctx.strokeStyle = isSel ? '#E24B4A' : col.s
      ctx.lineWidth = isSel ? 2 : 1; ctx.stroke()
      const cx = p.pts.reduce((s, pt) => s + pt.x, 0) / p.pts.length
      const cy = p.pts.reduce((s, pt) => s + pt.y, 0) / p.pts.length
      const cc = tc(pan, zoom, cx, cy)
      if (zoom > 0.45) {
        ctx.fillStyle = col.t
        ctx.font = `500 ${Math.max(8, 10 * zoom)}px DM Sans, sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(p.num, cc.x, cc.y - (zoom > 0.75 ? 6 : 0))
        if (zoom > 0.75) {
          ctx.font = `${Math.max(7, 8 * zoom)}px DM Sans, sans-serif`
          ctx.fillText(p.area + ' sqy', cc.x, cc.y + 6 * zoom)
        }
      }
      if (isSel) {
        const { dragHandle } = stateRef.current
        p.pts.forEach((pt, i) => {
          const c = tc(pan, zoom, pt.x, pt.y)
          ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2)
          ctx.fillStyle = dragHandle?.type === 'plot' && dragHandle.idx === i ? '#E24B4A' : '#185FA5'
          ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
        })
      }
      ctx.restore()
      ctx.globalAlpha = 1
    })

    // Drawing previews
    const { drawPts: dpts } = stateRef.current
    if (drawing && dpts.length > 0) {
      ctx.save()
      ctx.strokeStyle = '#185FA5'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      ctx.beginPath()
      dpts.forEach((p, i) => { const c = tc(pan, zoom, p.x, p.y); i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y) })
      const mc = mouse
      ctx.lineTo(mc.x, mc.y)
      if (mode === 'plot' || mode === 'boundary-free') ctx.closePath()
      ctx.stroke(); ctx.setLineDash([])
      dpts.forEach(p => {
        const c = tc(pan, zoom, p.x, p.y)
        ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#185FA5'; ctx.fill()
      })
      ctx.restore()
    }
  }, [])

  const updateStats = useCallback(() => {
    const plots = stateRef.current.plots
    setStats({
      total: plots.length,
      available: plots.filter(p => p.status === 'Available').length,
      allotted: plots.filter(p => p.status === 'Allotted').length,
      registered: plots.filter(p => p.status === 'Registered').length,
      mortgage: plots.filter(p => p.status === 'Mortgage').length,
    })
  }, [])

  const setMode = useCallback((m) => {
    const s = stateRef.current
    s.mode = m; s.drawing = false; s.drawPts = []
    setModeState(m)
    const hints = {
      road: 'Click to add road points · Double-click to finish',
      plot: 'Click corners to draw plot · Double-click to close',
      'boundary-rect': 'Click & drag to draw boundary rectangle',
      'boundary-free': 'Click to add boundary points · Double-click to close',
      'edit-boundary': 'Drag handles to reshape · Click empty area to add point',
      select: readOnly ? 'Click a plot to view details' : 'Click to select · Drag handles to reshape',
    }
    setHint(hints[m] || '')
    cvRef.current.style.cursor = m === 'select' || m === 'edit-boundary' ? 'default' : 'crosshair'
    requestDraw()
  }, [readOnly, requestDraw])

  const hitPlot = (wx, wy) => {
    const plots = stateRef.current.plots
    for (let i = plots.length - 1; i >= 0; i--)
      if (pointInPoly(wx, wy, plots[i].pts)) return plots[i]
    return null
  }
  const hitRoad = (wx, wy) => {
    const z = stateRef.current.zoom
    for (const r of stateRef.current.roads)
      for (let i = 0; i < r.pts.length - 1; i++) {
        const dx = r.pts[i+1].x - r.pts[i].x, dy = r.pts[i+1].y - r.pts[i].y
        const t = Math.max(0, Math.min(1, ((wx - r.pts[i].x) * dx + (wy - r.pts[i].y) * dy) / (dx*dx + dy*dy)))
        if (dist({ x: wx, y: wy }, { x: r.pts[i].x + t * dx, y: r.pts[i].y + t * dy }) < 10 / z) return r
      }
    return null
  }
  const hitHandle = (wx, wy, pts, threshold = 8) => {
    const z = stateRef.current.zoom
    for (let i = 0; i < pts.length; i++)
      if (dist({ x: wx, y: wy }, pts[i]) < threshold / z) return i
    return -1
  }

  useEffect(() => {
    const cv = cvRef.current
    const wrap = wrapRef.current
    if (!cv || !wrap) return

    const resize = () => {
      cv.width = wrap.clientWidth
      cv.height = wrap.clientHeight
      requestDraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const onMouseMove = e => {
      const r = cv.getBoundingClientRect()
      const cx = e.clientX - r.left, cy = e.clientY - r.top
      const s = stateRef.current
      s.mouse = { x: cx, y: cy }
      const w = tw(s.pan, s.zoom, cx, cy)

      if (s.isPanning) {
        s.pan = { x: s.panOrig.x + (e.clientX - s.panStart.x), y: s.panOrig.y + (e.clientY - s.panStart.y) }
        requestDraw(); return
      }
      if (s.dragHandle) {
        const dh = s.dragHandle
        if (dh.type === 'boundary') s.boundary[dh.idx] = { x: w.x, y: w.y }
        else if (dh.type === 'plot') {
          const p = s.selected.obj
          const dx = w.x - dh.ox, dy = w.y - dh.oy
          p.pts[dh.idx] = { x: p.pts[dh.idx].x + dx, y: p.pts[dh.idx].y + dy }
          p.area = Math.round(polyArea(p.pts) * 0.11)
          dh.ox = w.x; dh.oy = w.y
          setSelectedPlot({ ...p })
        } else if (dh.type === 'road') {
          s.selected.obj.pts[dh.idx] = { x: w.x, y: w.y }
        } else if (dh.type === 'move') {
          const p = s.selected.obj
          const dx = w.x - dh.ox, dy = w.y - dh.oy
          p.pts = p.pts.map(pt => ({ x: pt.x + dx, y: pt.y + dy }))
          dh.ox = w.x; dh.oy = w.y
        }
        requestDraw(); return
      }
      requestDraw()
    }

    const onMouseDown = e => {
      const r = cv.getBoundingClientRect()
      const cx = e.clientX - r.left, cy = e.clientY - r.top
      const s = stateRef.current
      const w = tw(s.pan, s.zoom, cx, cy)

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        s.isPanning = true; s.panStart = { x: e.clientX, y: e.clientY }; s.panOrig = { ...s.pan }
        cv.style.cursor = 'grabbing'; return
      }

      if (s.mode === 'edit-boundary') {
        const hi = s.boundary ? hitHandle(w.x, w.y, s.boundary) : -1
        if (hi >= 0) { s.dragHandle = { type: 'boundary', idx: hi }; return }
        if (s.boundary) { s.boundary.push({ x: w.x, y: w.y }); requestDraw() }
        return
      }

      if (s.mode === 'select') {
        if (!readOnly && s.selected) {
          if (s.selected.type === 'plot') {
            const hi = hitHandle(w.x, w.y, s.selected.obj.pts)
            if (hi >= 0) { s.dragHandle = { type: 'plot', idx: hi, ox: w.x, oy: w.y }; return }
            if (pointInPoly(w.x, w.y, s.selected.obj.pts)) { s.dragHandle = { type: 'move', ox: w.x, oy: w.y }; return }
          }
          if (s.selected.type === 'road') {
            const hi = hitHandle(w.x, w.y, s.selected.obj.pts)
            if (hi >= 0) { s.dragHandle = { type: 'road', idx: hi }; return }
          }
        }
        const p = hitPlot(w.x, w.y)
        if (p) { s.selected = { type: 'plot', obj: p }; setSelectedPlot({ ...p }); requestDraw(); return }
        const rd = hitRoad(w.x, w.y)
        if (rd) { s.selected = { type: 'road', obj: rd }; setSelectedPlot(null); requestDraw(); return }
        s.selected = null; setSelectedPlot(null); requestDraw(); return
      }

      if (s.mode === 'boundary-rect') {
        if (!s.drawing) { s.drawing = true; s.drawPts = [{ x: w.x, y: w.y }] }
        requestDraw(); return
      }

      if (!s.drawing) { s.drawing = true; s.drawPts = [{ x: w.x, y: w.y }] }
      else s.drawPts.push({ x: w.x, y: w.y })
      requestDraw()
    }

    const onMouseUp = e => {
      const s = stateRef.current
      if (s.isPanning) { s.isPanning = false; cv.style.cursor = 'default'; return }
      if (s.dragHandle) { s.dragHandle = null; updateStats(); requestDraw(); return }
      const r = cv.getBoundingClientRect()
      const w = tw(s.pan, s.zoom, e.clientX - r.left, e.clientY - r.top)
      if (s.mode === 'boundary-rect' && s.drawing && s.drawPts.length) {
        const x1 = Math.min(s.drawPts[0].x, w.x), y1 = Math.min(s.drawPts[0].y, w.y)
        const x2 = Math.max(s.drawPts[0].x, w.x), y2 = Math.max(s.drawPts[0].y, w.y)
        if (x2 - x1 > 20 && y2 - y1 > 20)
          s.boundary = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
        s.drawing = false; s.drawPts = []
        setMode('select'); requestDraw()
      }
    }

    const onDblClick = e => {
      const s = stateRef.current
      const r = cv.getBoundingClientRect()
      const w = tw(s.pan, s.zoom, e.clientX - r.left, e.clientY - r.top)
      if (s.mode === 'road' && s.drawing && s.drawPts.length >= 2) {
        s.roads.push({ id: Date.now(), pts: [...s.drawPts] })
        s.drawing = false; s.drawPts = []
        setMode('select'); requestDraw()
      }
      if (s.mode === 'plot' && s.drawing && s.drawPts.length >= 3) {
        addPlot([...s.drawPts])
        s.drawing = false; s.drawPts = []
        setMode('select'); requestDraw()
      }
      if (s.mode === 'boundary-free' && s.drawing && s.drawPts.length >= 3) {
        s.boundary = [...s.drawPts]
        s.drawing = false; s.drawPts = []
        setMode('select'); requestDraw()
      }
    }

    const onWheel = e => {
      e.preventDefault()
      const r = cv.getBoundingClientRect()
      const cx = e.clientX - r.left, cy = e.clientY - r.top
      const s = stateRef.current
      const delta = e.deltaY > 0 ? 0.85 : 1.18
      const nz = Math.max(0.2, Math.min(5, s.zoom * delta))
      s.pan = { x: cx - (cx - s.pan.x) * (nz / s.zoom), y: cy - (cy - s.pan.y) * (nz / s.zoom) }
      s.zoom = nz; requestDraw()
    }

    cv.addEventListener('mousemove', onMouseMove)
    cv.addEventListener('mousedown', onMouseDown)
    cv.addEventListener('mouseup', onMouseUp)
    cv.addEventListener('dblclick', onDblClick)
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      cv.removeEventListener('mousemove', onMouseMove)
      cv.removeEventListener('mousedown', onMouseDown)
      cv.removeEventListener('mouseup', onMouseUp)
      cv.removeEventListener('dblclick', onDblClick)
      cv.removeEventListener('wheel', onWheel)
    }
  }, [readOnly, requestDraw, setMode, updateStats])

  const addPlot = (pts) => {
    const s = stateRef.current
    s.plotCounter++
    const area = Math.round(polyArea(pts) * 0.11) || 150
    const facings = ['East', 'West', 'North', 'South']
    const p = {
      id: Date.now() + Math.random(),
      pts, num: String(s.plotCounter),
      area, facing: facings[Math.floor(Math.random() * 4)],
      customer: '', status: 'Available'
    }
    s.plots.push(p); updateStats()
    return p
  }

  const autoFill = () => {
    const s = stateRef.current
    if (!s.boundary || s.boundary.length < 3) { setHint('Draw a boundary first!'); return }
    const pw = autoW, ph = autoH, gap = 8
    const xs = s.boundary.map(p => p.x), ys = s.boundary.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    let added = 0
    for (let y = minY + gap; y + ph < maxY - gap; y += ph + gap)
      for (let x = minX + gap; x + pw < maxX - gap; x += pw + gap)
        if (pointInPoly(x + pw / 2, y + ph / 2, s.boundary)) {
          addPlot([{ x, y }, { x: x + pw, y }, { x: x + pw, y: y + ph }, { x, y: y + ph }])
          added++
        }
    setHint(added > 0 ? `Added ${added} plots` : 'No space — try smaller size')
    setTimeout(() => setHint(''), 2500)
    updateStats(); requestDraw()
  }

  const deleteSelected = () => {
    const s = stateRef.current
    if (!s.selected) return
    if (s.selected.type === 'plot') s.plots = s.plots.filter(p => p !== s.selected.obj)
    else if (s.selected.type === 'road') s.roads = s.roads.filter(r => r !== s.selected.obj)
    s.selected = null; setSelectedPlot(null)
    updateStats(); requestDraw()
  }

  const updatePlotDetail = (field, value) => {
    const s = stateRef.current
    if (!s.selected || s.selected.type !== 'plot') return
    s.selected.obj[field] = value
    setSelectedPlot(prev => ({ ...prev, [field]: value }))
    updateStats(); requestDraw()
  }

  const handleSave = async () => {
    const s = stateRef.current
    setSaving(true)
    try {
      await onSave({
        boundary: s.boundary,
        plots: s.plots.map(p => ({ ...p, plot_number: p.num, customer_name: p.customer })),
        roads: s.roads
      })
    } finally { setSaving(false) }
  }

  const exportImage = () => {
    const cv = cvRef.current
    const url = cv.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url; a.download = `${project?.name || 'layout'}.png`; a.click()
  }

  const changeFilter = (f) => {
    filterRef.current = f; setFilter(f); requestDraw()
  }

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {/* Toolbar */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg3)' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginRight: 2 }}>BOUNDARY</span>
          <button className={`btn sm ${mode === 'boundary-rect' ? 'accent' : ''}`} onClick={() => setMode('boundary-rect')}>Rectangle</button>
          <button className={`btn sm ${mode === 'boundary-free' ? 'accent' : ''}`} onClick={() => setMode('boundary-free')}>Freehand</button>
          <button className={`btn sm ${mode === 'edit-boundary' ? 'accent' : ''}`} onClick={() => setMode(mode === 'edit-boundary' ? 'select' : 'edit-boundary')}>Edit Shape</button>
          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginRight: 2 }}>DRAW</span>
          <button className={`btn sm ${mode === 'road' ? 'accent' : ''}`} onClick={() => setMode('road')}>Road</button>
          <button className={`btn sm ${mode === 'plot' ? 'accent' : ''}`} onClick={() => setMode('plot')}>Plot</button>
          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginRight: 2 }}>AUTO-FILL</span>
          <input type="number" value={autoW} onChange={e => setAutoW(+e.target.value)} style={{ width: 48, padding: '3px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }} />
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>×</span>
          <input type="number" value={autoH} onChange={e => setAutoH(+e.target.value)} style={{ width: 48, padding: '3px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }} />
          <button className="btn sm" onClick={autoFill}>Fill</button>
          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
          <button className={`btn sm ${mode === 'select' ? 'accent' : ''}`} onClick={() => setMode('select')}>Select</button>
          <button className="btn sm danger" onClick={deleteSelected}>Delete</button>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={exportImage}>Export PNG</button>
          <button className="btn sm primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas */}
        <div ref={wrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <canvas ref={cvRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          {hint && (
            <div style={{ position: 'absolute', bottom: selectedPlot ? 100 : 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, padding: '5px 14px', borderRadius: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {hint}
            </div>
          )}
          {/* Detail panel */}
          {selectedPlot && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--bg3)', borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr) auto', gap: 8, alignItems: 'end' }}>
                {[
                  { label: 'Plot No', key: 'num', type: 'text' },
                  { label: 'Area (sq yd)', key: 'area', type: 'number' },
                  { label: 'Facing', key: 'facing', type: 'select', opts: ['East', 'West', 'North', 'South'] },
                  { label: 'Customer', key: 'customer', type: 'text' },
                  { label: 'Status', key: 'status', type: 'select', opts: ['Available', 'Allotted', 'Registered', 'Mortgage'] },
                ].map(f => (
                  <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{f.label}</label>
                    {f.type === 'select' ? (
                      <select className="input" style={{ padding: '4px 7px', fontSize: 12 }} value={selectedPlot[f.key] || ''} disabled={readOnly} onChange={e => updatePlotDetail(f.key, e.target.value)}>
                        {f.opts.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="input" style={{ padding: '4px 7px', fontSize: 12 }} type={f.type} value={selectedPlot[f.key] || ''} disabled={readOnly} onChange={e => updatePlotDetail(f.key, e.target.value)} />
                    )}
                  </div>
                ))}
                <button className="btn sm" onClick={() => { stateRef.current.selected = null; setSelectedPlot(null) }}>×</button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 190, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg3)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {[
                { label: 'Total', val: stats.total, color: 'var(--text)' },
                { label: 'Available', val: stats.available, color: 'var(--green)' },
                { label: 'Allotted', val: stats.allotted, color: 'var(--orange)' },
                { label: 'Registered', val: stats.registered, color: 'var(--accent)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 6, padding: '5px 8px' }}>
                  <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: s.color }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Filter</div>
            {[
              { val: 'all', label: 'All', color: '#888' },
              { val: 'Available', label: 'Available', color: '#1D9E75' },
              { val: 'Allotted', label: 'Allotted', color: '#BA7517' },
              { val: 'Registered', label: 'Registered', color: '#185FA5' },
              { val: 'Mortgage', label: 'Mortgage', color: '#A32D2D' },
            ].map(f => (
              <div key={f.val} onClick={() => changeFilter(f.val)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 6px', borderRadius: 6, cursor: 'pointer', background: filter === f.val ? 'var(--bg2)' : 'transparent', marginBottom: 1 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: f.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text)' }}>{f.label}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {stateRef.current.plots.filter(p => filter === 'all' || p.status === filter).map(p => (
              <div key={p.id}
                onClick={() => { stateRef.current.selected = { type: 'plot', obj: p }; setSelectedPlot({ ...p }); requestDraw() }}
                style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedPlot?.id === p.id ? 'var(--bg2)' : 'transparent' }}>
                <div style={{ fontSize: 11, fontWeight: 500 }}>Plot {p.num}{p.customer ? ' · ' + p.customer : ''}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{p.area} sqy · {p.facing}</span>
                  <span className={`badge ${p.status}`} style={{ fontSize: 9, padding: '1px 6px' }}>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
