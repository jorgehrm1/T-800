import { useEffect, useMemo, useState } from 'react'
import { supabase, rpc } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import { useCatalogos } from '../lib/useCatalogos'
import { q, hoy, fechaBonita, TagEstado, msgError } from '../lib/format.jsx'
import Lineas, { lineaVacia, lineasValidas, totalLineas } from '../components/Lineas'

export default function Ventas() {
  const { profile } = useAuth()
  const cat = useCatalogos()
  const [ventas, setVentas] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [abierta, setAbierta] = useState(null)

  async function cargar() {
    let qry = supabase.from('v_ventas').select('*').order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(100)
    if (filtro === 'pendientes') qry = qry.eq('anulada', false).gt('saldo', 0)
    const { data } = await qry
    setVentas(data || [])
  }
  useEffect(() => { cargar() }, [filtro])

  return (
    <div>
      <div className="row"><h2>Ventas</h2>
        <button onClick={() => setMostrarForm(v => !v)}>{mostrarForm ? 'Cerrar' : '+ Nueva venta'}</button>
      </div>

      {mostrarForm && <NuevaVenta cat={cat} profile={profile} onListo={() => { setMostrarForm(false); cargar() }} />}

      <div className="chips" style={{ margin: '14px 0 6px' }}>
        <button className={`chip ${filtro === 'todas' ? 'on' : ''}`} onClick={() => setFiltro('todas')}>Recientes</button>
        <button className={`chip ${filtro === 'pendientes' ? 'on' : ''}`} onClick={() => setFiltro('pendientes')}>Por cobrar</button>
      </div>

      {ventas.length === 0 && <p className="muted">Sin ventas.</p>}
      {ventas.map(v => (
        <div className={`card ${v.anulada ? 'anulada-card' : ''}`} key={v.id}>
          <div className="row clickable" onClick={() => setAbierta(abierta === v.id ? null : v.id)}>
            <div>
              <strong>{v.cliente}</strong>
              <div className="muted">{v.ubicacion} · {fechaBonita(v.fecha)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>{q(v.total)}</div>
              <TagEstado estado={v.estado_pago} anulada={v.anulada} />
            </div>
          </div>
          {abierta === v.id && <DetalleVenta venta={v} esAdmin={profile?.rol === 'admin'} onCambio={cargar} />}
        </div>
      ))}
    </div>
  )
}

function NuevaVenta({ cat, profile, onListo }) {
  const fija = profile?.rol === 'vendedor' && profile?.ubicacion_id
  const [ubicacionId, setUbicacionId] = useState(fija ? profile.ubicacion_id : '')
  const [clienteId, setClienteId] = useState('')
  const [nuevoCliente, setNuevoCliente] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [lineas, setLineas] = useState([lineaVacia()])
  const [pago, setPago] = useState('')
  const [stock, setStock] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const total = useMemo(() => totalLineas(lineas), [lineas])

  useEffect(() => {
    if (!ubicacionId) { setStock({}); return }
    supabase.from('inventario_ubicacion').select('producto_id, cantidad').eq('ubicacion_id', ubicacionId)
      .then(({ data }) => setStock(Object.fromEntries((data || []).map(r => [r.producto_id, r.cantidad]))))
  }, [ubicacionId])

  async function guardar(e) {
    e.preventDefault()
    setError('')
    const validas = lineasValidas(lineas)
    if (!ubicacionId) return setError('Selecciona la ubicación')
    if (!clienteId && !nuevoCliente.trim()) return setError('Selecciona o escribe el cliente')
    if (!validas.length) return setError('Agrega al menos un producto con cantidad y precio')
    setGuardando(true)
    try {
      let cliente = clienteId
      if (!cliente) {
        const { data, error } = await supabase.from('clientes').insert({ nombre: nuevoCliente.trim() }).select().single()
        if (error) throw error
        cliente = data.id
      }
      await rpc('registrar_venta', {
        p_ubicacion_id: ubicacionId, p_cliente_id: cliente, p_fecha: fecha,
        p_lineas: validas, p_pago_inicial: Number(pago || 0), p_metodo: 'efectivo',
      })
      onListo()
    } catch (e) { setError(msgError(e)) }
    setGuardando(false)
  }

  return (
    <form className="card" onSubmit={guardar}>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label>Ubicación</label>
          <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)} disabled={!!fija}>
            <option value="">Selecciona…</option>
            {cat.ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>
      <div>
        <label>Cliente</label>
        <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
          <option value="">— Cliente nuevo —</option>
          {cat.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {!clienteId && <input style={{ marginTop: 6 }} placeholder="Nombre del cliente nuevo" value={nuevoCliente} onChange={e => setNuevoCliente(e.target.value)} />}
      </div>

      <div className="section-title">Productos (precio pactado con este cliente)</div>
      <Lineas lineas={lineas} setLineas={setLineas} productos={cat.productos} stock={ubicacionId ? stock : null} etiquetaPrecio="Precio venta" />

      <div>
        <label>¿Cuánto pagó ahora?</label>
        <div className="row" style={{ gap: 6 }}>
          <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00 = al crédito" value={pago} onChange={e => setPago(e.target.value)} />
          <button type="button" className="secondary small" onClick={() => setPago(total.toFixed(2))}>Pagó todo</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      <button disabled={guardando}>{guardando ? 'Guardando…' : `Registrar venta ${q(total)}`}</button>
    </form>
  )
}

function DetalleVenta({ venta, esAdmin, onCambio }) {
  const [detalle, setDetalle] = useState([])
  const [pagos, setPagos] = useState([])
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    supabase.from('venta_detalle').select('*, productos(nombre)').eq('venta_id', venta.id).then(({ data }) => setDetalle(data || []))
    supabase.from('pagos_venta').select('*').eq('venta_id', venta.id).order('fecha').then(({ data }) => setPagos(data || []))
  }, [venta.id, venta.saldo])

  async function cobrar(e) {
    e.preventDefault(); setError(''); setOcupado(true)
    try { await rpc('registrar_cobro_venta', { p_venta_id: venta.id, p_monto: Number(monto), p_fecha: hoy() }); setMonto(''); onCambio() }
    catch (e) { setError(msgError(e)) }
    setOcupado(false)
  }
  async function anular() {
    if (!confirm('¿Anular esta venta? El producto regresa al inventario de la ubicación.')) return
    setOcupado(true)
    try { await rpc('anular_venta', { p_venta_id: venta.id }); onCambio() } catch (e) { setError(msgError(e)) }
    setOcupado(false)
  }

  return (
    <div className="detalle">
      {detalle.map(d => (
        <div className="detail-line" key={d.id}><span>{d.productos?.nombre} × {Number(d.cantidad)} @ {q(d.precio_unitario)}</span><span>{q(d.subtotal)}</span></div>
      ))}
      {pagos.map(p => (
        <div className="detail-line muted" key={p.id}><span>Cobro {fechaBonita(p.fecha)}</span><span>{q(p.monto)}</span></div>
      ))}
      <div className="detail-line"><strong>Saldo pendiente</strong><strong>{q(venta.saldo)}</strong></div>
      {venta.vendedor && <div className="muted">Registró: {venta.vendedor}</div>}
      {!venta.anulada && venta.saldo > 0 && (
        <form onSubmit={cobrar} className="row" style={{ gap: 6, marginTop: 8 }}>
          <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="Monto cobrado" value={monto} onChange={e => setMonto(e.target.value)} required />
          <button type="button" className="secondary small" onClick={() => setMonto(Number(venta.saldo).toFixed(2))}>Todo</button>
          <button disabled={ocupado} className="small">Cobrar</button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
      {esAdmin && !venta.anulada && <button className="link-danger" disabled={ocupado} onClick={anular}>Anular venta</button>}
    </div>
  )
}
