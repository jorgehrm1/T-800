import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { msgError } from '../lib/format.jsx'

// Botones para generar PDF que se comparten con el cliente o proveedor.
// tipo: 'venta' | 'compra'; op: fila de v_ventas / v_compras
export default function BotonesCuenta({ tipo, op, detalle, pagos }) {
  const [generando, setGenerando] = useState('')
  const [error, setError] = useState('')
  const esVenta = tipo === 'venta'
  const nombre = esVenta ? op.cliente : op.proveedor

  async function comprobante() {
    setGenerando('uno'); setError('')
    try {
      const { pdfComprobante } = await import('../lib/pdf')
      await pdfComprobante(tipo, op, detalle, pagos)
    } catch (e) { setError(msgError(e)) }
    setGenerando('')
  }

  async function estadoCuenta() {
    setGenerando('todo'); setError('')
    try {
      const { pdfEstadoCuenta } = await import('../lib/pdf')
      const vista = esVenta ? 'v_ventas' : 'v_compras'
      const campo = esVenta ? 'cliente_id' : 'proveedor_id'
      const { data: ops, error } = await supabase.from(vista).select('*')
        .eq(campo, op[campo]).eq('anulada', false).gt('saldo', 0).order('fecha')
      if (error) throw error
      let pagos = []
      if (ops.length) {
        const tabla = esVenta ? 'pagos_venta' : 'pagos_compra'
        const fk = esVenta ? 'venta_id' : 'compra_id'
        const r = await supabase.from(tabla).select('*').in(fk, ops.map(o => o.id)).order('fecha')
        if (r.error) throw r.error
        pagos = r.data
      }
      await pdfEstadoCuenta(tipo, nombre, ops, pagos)
    } catch (e) { setError(msgError(e)) }
    setGenerando('')
  }

  if (op.anulada) return null
  return (
    <div className="compartir">
      <div className="muted" style={{ marginBottom: 6 }}>Compartir con {esVenta ? 'el cliente' : 'el proveedor'}</div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="secondary small" style={{ flex: 1 }} disabled={!!generando} onClick={comprobante}>
          {generando === 'uno' ? 'Generando…' : `PDF de esta ${tipo}`}
        </button>
        <button type="button" className="secondary small" style={{ flex: 1 }} disabled={!!generando} onClick={estadoCuenta}>
          {generando === 'todo' ? 'Generando…' : 'Estado de cuenta'}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Estado de cuenta: todo lo que {esVenta ? `${nombre} tiene pendiente de pagar` : `se le debe a ${nombre}`}, con sus abonos.
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  )
}
