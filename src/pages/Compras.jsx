import { useEffect, useMemo, useState } from 'react'
import { supabase, rpc } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import { useCatalogos } from '../lib/useCatalogos'
import { q, hoy, fechaBonita, TagEstado, msgError } from '../lib/format.jsx'
import Lineas, { lineaVacia, lineasValidas, totalLineas } from '../components/Lineas'

export default function Compras() {
  const { profile } = useAuth()
  const cat = useCatalogos()
  const [compras, setCompras] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [abierta, setAbierta] = useState(null)

  async function cargar() {
    let qry = supabase.from('v_compras').select('*').order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(100)
    if (filtro === 'pendientes') qry = qry.eq('anulada', false).gt('saldo', 0)
    const { data } = await qry
    setCompras(data || [])
  }
  useEffect(() => { cargar() }, [filtro])

  return (
    <div>
      <div className="row"><h2>Compras</h2>
        <button onClick={() => setMostrarForm(v => !v)}>{mostrarForm ? 'Cerrar' : '+ Nueva compra'}</button>
      </div>

      {mostrarForm && <NuevaCompra cat={cat} onListo={() => { setMostrarForm(false); cargar() }} />}

      <div className="chips" style={{ margin: '14px 0 6px' }}>
        <button className={`chip ${filtro === 'todas' ? 'on' : ''}`} onClick={() => setFiltro('todas')}>Recientes</button>
        <button className={`chip ${filtro === 'pendientes' ? 'on' : ''}`} onClick={() => setFiltro('pendientes')}>Por pagar</button>
      </div>

      {compras.length === 0 && <p className="muted">Sin compras.</p>}
      {compras.map(c => (
        <div className={`card ${c.anulada ? 'anulada-card' : ''}`} key={c.id}>
          <div className="row clickable" onClick={() => setAbierta(abierta === c.id ? null : c.id)}>
            <div>
              <strong>{c.proveedor}</strong>
              <div className="muted">{fechaBonita(c.fecha)}{c.num_factura ? ` · Fact. ${c.num_factura}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>{q(c.total)}</div>
              <TagEstado estado={c.estado_pago} anulada={c.anulada} />
            </div>
          </div>
          {abierta === c.id && <DetalleCompra compra={c} esAdmin={profile?.rol === 'admin'} onCambio={cargar} />}
        </div>
      ))}
    </div>
  )
}

function NuevaCompra({ cat, onListo }) {
  const [proveedorId, setProveedorId] = useState('')
  const [nuevoProv, setNuevoProv] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [factura, setFactura] = useState('')
  const [lineas, setLineas] = useState([lineaVacia()])
  const [pago, setPago] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const total = useMemo(() => totalLineas(lineas), [lineas])

  async function guardar(e) {
    e.preventDefault()
    setError('')
    const validas = lineasValidas(lineas)
    if (!proveedorId && !nuevoProv.trim()) return setError('Selecciona o escribe el proveedor')
    if (!validas.length) return setError('Agrega al menos un producto con cantidad y precio')
    setGuardando(true)
    try {
      let prov = proveedorId
      if (!prov) {
        const { data, error } = await supabase.from('proveedores').insert({ nombre: nuevoProv.trim() }).select().single()
        if (error) throw error
        prov = data.id
      }
      await rpc('registrar_compra', {
        p_proveedor_id: prov, p_fecha: fecha, p_lineas: validas, p_num_factura: factura,
        p_pago_inicial: Number(pago || 0), p_metodo: 'efectivo',
      })
      onListo()
    } catch (e) { setError(msgError(e)) }
    setGuardando(false)
  }

  return (
    <form className="card" onSubmit={guardar}>
      <div>
        <label>Proveedor</label>
        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
          <option value="">— Proveedor nuevo —</option>
          {cat.proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {!proveedorId && <input style={{ marginTop: 6 }} placeholder="Nombre del proveedor nuevo" value={nuevoProv} onChange={e => setNuevoProv(e.target.value)} />}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}><label>Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>No. factura (opcional)</label><input value={factura} onChange={e => setFactura(e.target.value)} /></div>
      </div>

      <div className="section-title">Productos que ingresan a bodega</div>
      <Lineas lineas={lineas} setLineas={setLineas} productos={cat.productos} etiquetaPrecio="Costo" />

      <div>
        <label>¿Cuánto se pagó ahora?</label>
        <div className="row" style={{ gap: 6 }}>
          <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00 = al crédito" value={pago} onChange={e => setPago(e.target.value)} />
          <button type="button" className="secondary small" onClick={() => setPago(total.toFixed(2))}>Pagado todo</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      <button disabled={guardando}>{guardando ? 'Guardando…' : `Registrar compra ${q(total)}`}</button>
    </form>
  )
}

function DetalleCompra({ compra, esAdmin, onCambio }) {
  const [detalle, setDetalle] = useState([])
  const [pagos, setPagos] = useState([])
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    supabase.from('compra_detalle').select('*, productos(nombre)').eq('compra_id', compra.id).then(({ data }) => setDetalle(data || []))
    supabase.from('pagos_compra').select('*').eq('compra_id', compra.id).order('fecha').then(({ data }) => setPagos(data || []))
  }, [compra.id, compra.saldo])

  async function pagar(e) {
    e.preventDefault(); setError(''); setOcupado(true)
    try { await rpc('registrar_pago_compra', { p_compra_id: compra.id, p_monto: Number(monto), p_fecha: hoy() }); setMonto(''); onCambio() }
    catch (e) { setError(msgError(e)) }
    setOcupado(false)
  }
  async function anular() {
    if (!confirm('¿Anular esta compra? Se descuenta de la bodega lo que había ingresado.')) return
    setOcupado(true)
    try { await rpc('anular_compra', { p_compra_id: compra.id }); onCambio() } catch (e) { setError(msgError(e)) }
    setOcupado(false)
  }

  return (
    <div className="detalle">
      {detalle.map(d => (
        <div className="detail-line" key={d.id}><span>{d.productos?.nombre} × {Number(d.cantidad)} @ {q(d.precio_unitario)}</span><span>{q(d.subtotal)}</span></div>
      ))}
      {pagos.map(p => (
        <div className="detail-line muted" key={p.id}><span>Abono {fechaBonita(p.fecha)}</span><span>{q(p.monto)}</span></div>
      ))}
      <div className="detail-line"><strong>Saldo pendiente</strong><strong>{q(compra.saldo)}</strong></div>
      {!compra.anulada && compra.saldo > 0 && (
        <form onSubmit={pagar} className="row" style={{ gap: 6, marginTop: 8 }}>
          <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="Monto a abonar" value={monto} onChange={e => setMonto(e.target.value)} required />
          <button type="button" className="secondary small" onClick={() => setMonto(Number(compra.saldo).toFixed(2))}>Todo</button>
          <button disabled={ocupado} className="small">Abonar</button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
      {esAdmin && !compra.anulada && <button className="link-danger" disabled={ocupado} onClick={anular}>Anular compra</button>}
    </div>
  )
}
