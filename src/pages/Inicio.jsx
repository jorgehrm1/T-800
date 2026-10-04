import { useEffect, useState } from 'react'
import { supabase, rpc } from '../supabaseClient'
import { q, hoy, msgError } from '../lib/format.jsx'
import Periodo, { periodoInicial } from '../components/Periodo'

export default function Inicio() {
  const [per, setPer] = useState(periodoInicial('dia'))
  const [rep, setRep] = useState(null)
  const [error, setError] = useState('')
  const [generando, setGenerando] = useState('')
  const [bajos, setBajos] = useState([])

  useEffect(() => {
    if (!per.desde || !per.hasta || per.desde > per.hasta) return
    setError('')
    rpc('reporte_periodo', { p_desde: per.desde, p_hasta: per.hasta })
      .then(setRep).catch(e => setError(msgError(e)))
  }, [per.desde, per.hasta])

  useEffect(() => {
    supabase.from('inventario_bodega').select('cantidad, productos(nombre, stock_minimo)').then(({ data }) =>
      setBajos((data || []).filter(b => b.productos.stock_minimo > 0 && b.cantidad <= b.productos.stock_minimo)))
  }, [])

  async function generar(tipo) {
    setGenerando(tipo); setError('')
    try {
      // se carga solo al generar un PDF (aligera el arranque)
      const { pdfEstadoResultados, pdfCompras, pdfVentas, pdfGastos, pdfCuentas } = await import('../lib/pdf')
      const { desde, hasta } = per
      if (tipo === 'resultados') await pdfEstadoResultados(rep)
      if (tipo === 'compras') {
        const { data, error } = await supabase.from('v_compras').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha')
        if (error) throw error
        await pdfCompras(data, desde, hasta)
      }
      if (tipo === 'ventas') {
        const { data, error } = await supabase.from('v_ventas').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha')
        if (error) throw error
        await pdfVentas(data, desde, hasta)
      }
      if (tipo === 'gastos') {
        const { data, error } = await supabase.from('gastos').select('*, ubicaciones(nombre)').gte('fecha', desde).lte('fecha', hasta).order('fecha')
        if (error) throw error
        await pdfGastos(data, desde, hasta)
      }
      if (tipo === 'cuentas') {
        const [c, p] = await Promise.all([
          supabase.from('v_ventas').select('*').eq('anulada', false).gt('saldo', 0).order('fecha'),
          supabase.from('v_compras').select('*').eq('anulada', false).gt('saldo', 0).order('fecha'),
        ])
        if (c.error || p.error) throw (c.error || p.error)
        await pdfCuentas(c.data, p.data, hoy())
      }
    } catch (e) { setError(msgError(e)) }
    setGenerando('')
  }

  const neta = Number(rep?.utilidad_neta || 0)

  return (
    <div>
      <h2 style={{ marginBottom: 10 }}>Resumen</h2>
      <Periodo value={per} onChange={setPer} />
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {!rep ? <p className="muted">Cargando…</p> : (
        <>
          <div className={`resultado ${neta >= 0 ? 'gana' : 'pierde'}`}>
            <div className="label">{neta >= 0 ? 'Ganancia neta' : 'Pérdida neta'}</div>
            <div className="num display">{q(neta)}</div>
            <div className="muted">Ventas − costo de lo vendido − gastos</div>
          </div>

          <div className="grid2">
            <Stat label="Vendido" v={rep.ventas} />
            <Stat label="Costo de lo vendido" v={rep.costo_ventas} />
            <Stat label="Gastos" v={rep.gastos} />
            <Stat label="Compras" v={rep.compras} />
            <Stat label="Cobrado a clientes" v={rep.cobros_clientes} />
            <Stat label="Pagado a proveedores" v={rep.pagos_proveedores} />
          </div>

          <div className="card">
            <div className="detail-line"><span>Le deben (por cobrar)</span><strong style={{ color: 'var(--amber)' }}>{q(rep.por_cobrar)}</strong></div>
            <div className="detail-line"><span>Debe a proveedores (por pagar)</span><strong style={{ color: 'var(--red)' }}>{q(rep.por_pagar)}</strong></div>
            <div className="detail-line"><span>Flujo de caja del periodo</span><strong>{q(rep.flujo_caja)}</strong></div>
          </div>

          {rep.por_ubicacion?.length > 0 && (
            <>
              <div className="section-title">Por ubicación</div>
              <div className="card">
                {rep.por_ubicacion.map(u => (
                  <div className="detail-line" key={u.ubicacion}><span>{u.ubicacion}</span><span>{q(u.ventas)} <span className="muted">· gan. {q(u.utilidad)}</span></span></div>
                ))}
              </div>
            </>
          )}

          <div className="section-title">Descargar PDF del periodo</div>
          <div className="pdf-grid">
            {[['resultados', 'Estado de resultados', 'Ganancia o pérdida'],
              ['compras', 'Compras', 'Detalle y saldos'],
              ['ventas', 'Ventas', 'Detalle y cobros'],
              ['gastos', 'Gastos', 'Por categoría'],
              ['cuentas', 'Cuentas', 'Por cobrar y por pagar']].map(([t, titulo, sub]) => (
              <button key={t} className="pdf-btn" disabled={!!generando} onClick={() => generar(t)}>
                <span className="pdf-ico">PDF</span>
                <span><strong>{generando === t ? 'Generando…' : titulo}</strong><small>{sub}</small></span>
              </button>
            ))}
          </div>
        </>
      )}

      {bajos.length > 0 && (
        <>
          <div className="section-title">Stock bajo en bodega</div>
          <div className="card">
            {bajos.map((b, i) => <div className="detail-line" key={i}><span>{b.productos.nombre}</span><strong style={{ color: 'var(--red)' }}>{Number(b.cantidad)}</strong></div>)}
          </div>
        </>
      )}
    </div>
  )
}

const Stat = ({ label, v }) => (
  <div className="stat"><div className="num">{q(v)}</div><div className="label">{label}</div></div>
)
