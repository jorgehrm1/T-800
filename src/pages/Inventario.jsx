import { useEffect, useState } from 'react'
import { supabase, rpc } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import { useCatalogos } from '../lib/useCatalogos'
import { fechaBonita, msgError } from '../lib/format.jsx'

const n = (x) => Number(x || 0).toLocaleString('es-GT')

export default function Inventario() {
  const { profile } = useAuth()
  const puedeMover = ['admin', 'bodega'].includes(profile?.rol)
  const cat = useCatalogos()
  const [bodega, setBodega] = useState({})
  const [ubic, setUbic] = useState({})
  const [movs, setMovs] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)

  async function cargar() {
    const [b, u, m] = await Promise.all([
      supabase.from('inventario_bodega').select('producto_id, cantidad'),
      supabase.from('inventario_ubicacion').select('ubicacion_id, producto_id, cantidad'),
      supabase.from('cargas_ubicacion').select('*, productos(nombre), origen:ubicaciones!cargas_ubicacion_ubicacion_id_fkey(nombre), destino:ubicaciones!cargas_ubicacion_ubicacion_destino_id_fkey(nombre)')
        .order('creado_en', { ascending: false }).limit(15),
    ])
    setBodega(Object.fromEntries((b.data || []).map(r => [r.producto_id, r.cantidad])))
    setUbic(Object.fromEntries((u.data || []).map(r => [`${r.ubicacion_id}|${r.producto_id}`, r.cantidad])))
    setMovs(m.data || [])
  }
  useEffect(() => { cargar() }, [])

  // un vendedor solo ve su ubicación (la base de datos tampoco le entrega las demás)
  const veTodo = puedeMover
  const columnas = veTodo ? cat.ubicaciones : cat.ubicaciones.filter(u => u.id === profile?.ubicacion_id)
  const total = (pid) => Number(bodega[pid] || 0) + cat.ubicaciones.reduce((a, u) => a + Number(ubic[`${u.id}|${pid}`] || 0), 0)

  return (
    <div>
      <div className="row"><h2>Inventario</h2>
        {puedeMover && <button onClick={() => setMostrarForm(v => !v)}>{mostrarForm ? 'Cerrar' : '+ Mover'}</button>}
      </div>

      {mostrarForm && <Mover cat={cat} onListo={() => { setMostrarForm(false); cargar() }} />}

      <div className="card tabla-scroll" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr><th>Producto</th>{veTodo && <th className="r">Bodega</th>}{columnas.map(u => <th key={u.id} className="r">{u.nombre}</th>)}{veTodo && <th className="r">Total</th>}</tr>
          </thead>
          <tbody>
            {cat.productos.map(p => (
              <tr key={p.id}>
                <td><strong>{p.nombre}</strong></td>
                {veTodo && <td className="r" style={{ color: p.stock_minimo > 0 && bodega[p.id] <= p.stock_minimo ? 'var(--red)' : undefined }}>{n(bodega[p.id])}</td>}
                {columnas.map(u => <td key={u.id} className="r">{n(ubic[`${u.id}|${p.id}`])}</td>)}
                {veTodo && <td className="r"><strong>{n(total(p.id))}</strong></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">{veTodo ? 'Últimos movimientos' : 'Lo que me han cargado o devuelto'}</div>
      <div className="card">
        {movs.length === 0 && <p className="muted">Sin movimientos.</p>}
        {movs.map(m => (
          <div className="detail-line" key={m.id}>
            <span>
              {m.tipo === 'carga' && `Bodega → ${m.origen?.nombre}`}
              {m.tipo === 'devolucion' && `${m.origen?.nombre} → Bodega`}
              {m.tipo === 'traspaso' && `${m.origen?.nombre} → ${m.destino?.nombre}`}
              <span className="muted"> · {m.productos?.nombre} · {fechaBonita(m.fecha)}</span>
            </span>
            <strong>{n(m.cantidad)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function Mover({ cat, onListo }) {
  const [tipo, setTipo] = useState('carga')
  const [ubicacionId, setUbicacionId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(e) {
    e.preventDefault(); setError(''); setGuardando(true)
    try {
      await rpc('mover_inventario', {
        p_tipo: tipo, p_ubicacion_id: ubicacionId, p_producto_id: productoId,
        p_cantidad: Number(cantidad), p_ubicacion_destino_id: tipo === 'traspaso' ? destinoId : null,
      })
      onListo()
    } catch (e) { setError(msgError(e)) }
    setGuardando(false)
  }

  return (
    <form className="card" onSubmit={guardar} style={{ marginTop: 12 }}>
      <div>
        <label>Movimiento</label>
        <select value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="carga">Cargar: Bodega → ubicación</option>
          <option value="devolucion">Devolver: ubicación → Bodega</option>
          <option value="traspaso">Traspasar: ubicación → ubicación</option>
        </select>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label>{tipo === 'carga' ? 'Ubicación destino' : 'Ubicación origen'}</label>
          <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {cat.ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        {tipo === 'traspaso' && (
          <div style={{ flex: 1 }}>
            <label>Ubicación destino</label>
            <select value={destinoId} onChange={e => setDestinoId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {cat.ubicaciones.filter(u => u.id !== ubicacionId).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 2 }}>
          <label>Producto</label>
          <select value={productoId} onChange={e => setProductoId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {cat.productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>Cantidad</label>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={cantidad} onChange={e => setCantidad(e.target.value)} required />
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <button disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar movimiento'}</button>
    </form>
  )
}
