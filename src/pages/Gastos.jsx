import { useEffect, useState } from 'react'
import { supabase, rpc } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import { useCatalogos } from '../lib/useCatalogos'
import { q, hoy, fechaBonita, msgError } from '../lib/format.jsx'
import Periodo, { periodoInicial } from '../components/Periodo'

const CATEGORIAS = ['Combustible', 'Transporte / fletes', 'Alquiler', 'Sueldos', 'Comida', 'Mantenimiento', 'Servicios (luz, agua, teléfono)', 'Impuestos', 'Otros']

export default function Gastos() {
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'
  const cat = useCatalogos()
  const [per, setPer] = useState(periodoInicial('mes'))
  const [gastos, setGastos] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    const { data } = await supabase.from('gastos').select('*, ubicaciones(nombre)')
      .gte('fecha', per.desde).lte('fecha', per.hasta).order('fecha', { ascending: false }).order('creado_en', { ascending: false })
    setGastos(data || [])
  }
  useEffect(() => { if (per.desde <= per.hasta) cargar() }, [per.desde, per.hasta])

  async function anular(id) {
    if (!confirm('¿Anular este gasto?')) return
    try { await rpc('anular_gasto', { p_gasto_id: id }); cargar() } catch (e) { setError(msgError(e)) }
  }

  const total = gastos.filter(g => !g.anulado).reduce((a, g) => a + Number(g.monto), 0)

  return (
    <div>
      <div className="row"><h2>Gastos</h2>
        <button onClick={() => setMostrarForm(v => !v)}>{mostrarForm ? 'Cerrar' : '+ Nuevo gasto'}</button>
      </div>
      {mostrarForm && <NuevoGasto cat={cat} profile={profile} onListo={() => { setMostrarForm(false); cargar() }} />}

      <div style={{ margin: '14px 0' }}><Periodo value={per} onChange={setPer} /></div>
      <div className="card"><div className="detail-line"><strong>Total del periodo</strong><strong>{q(total)}</strong></div></div>
      {error && <div className="error">{error}</div>}

      {gastos.map(g => (
        <div className={`card ${g.anulado ? 'anulada-card' : ''}`} key={g.id}>
          <div className="row">
            <div>
              <strong>{g.categoria}</strong>{g.anulado && <span className="tag anulada" style={{ marginLeft: 6 }}>anulado</span>}
              <div className="muted">{fechaBonita(g.fecha)} · {g.ubicaciones?.nombre || 'General'}{g.descripcion ? ` · ${g.descripcion}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>{q(g.monto)}</div>
              {esAdmin && !g.anulado && <button className="link-danger" onClick={() => anular(g.id)}>Anular</button>}
            </div>
          </div>
        </div>
      ))}
      {gastos.length === 0 && <p className="muted">Sin gastos en este periodo.</p>}
    </div>
  )
}

function NuevoGasto({ cat, profile, onListo }) {
  const fija = profile?.rol === 'vendedor' && profile?.ubicacion_id
  const [fecha, setFecha] = useState(hoy())
  const [categoria, setCategoria] = useState('')
  const [otra, setOtra] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [ubicacionId, setUbicacionId] = useState(fija ? profile.ubicacion_id : '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(e) {
    e.preventDefault(); setError(''); setGuardando(true)
    try {
      await rpc('registrar_gasto', {
        p_fecha: fecha, p_categoria: categoria === 'Otros' && otra.trim() ? otra.trim() : categoria,
        p_monto: Number(monto), p_descripcion: descripcion, p_ubicacion_id: ubicacionId || null,
      })
      onListo()
    } catch (e) { setError(msgError(e)) }
    setGuardando(false)
  }

  return (
    <form className="card" onSubmit={guardar}>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}><label>Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>Monto (Q)</label><input type="number" inputMode="decimal" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} required /></div>
      </div>
      <div>
        <label>Categoría</label>
        <select value={categoria} onChange={e => setCategoria(e.target.value)} required>
          <option value="">Selecciona…</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
        {categoria === 'Otros' && <input style={{ marginTop: 6 }} placeholder="¿Qué tipo de gasto?" value={otra} onChange={e => setOtra(e.target.value)} />}
      </div>
      <div><label>Descripción (opcional)</label><input value={descripcion} onChange={e => setDescripcion(e.target.value)} /></div>
      <div>
        <label>Ubicación</label>
        <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)} disabled={!!fija}>
          <option value="">General (todo el negocio)</option>
          {cat.ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      <button disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar gasto'}</button>
    </form>
  )
}
