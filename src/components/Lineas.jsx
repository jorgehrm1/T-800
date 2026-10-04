import { q } from '../lib/format.jsx'

export const lineaVacia = () => ({ producto_id: '', cantidad: '', precio_unitario: '' })

export const lineasValidas = (lineas) =>
  lineas.filter(l => l.producto_id && Number(l.cantidad) > 0 && l.precio_unitario !== '' && Number(l.precio_unitario) >= 0)
        .map(l => ({ producto_id: l.producto_id, cantidad: Number(l.cantidad), precio_unitario: Number(l.precio_unitario) }))

export const totalLineas = (lineas) =>
  lineasValidas(lineas).reduce((a, l) => a + l.cantidad * l.precio_unitario, 0)

// Editor de líneas producto / cantidad / precio. `stock` opcional: {producto_id: cantidad}
export default function Lineas({ lineas, setLineas, productos, stock, etiquetaPrecio = 'Precio' }) {
  const set = (i, campo, val) => setLineas(ls => ls.map((l, idx) => idx === i ? { ...l, [campo]: val } : l))
  const quitar = (i) => setLineas(ls => ls.length === 1 ? [lineaVacia()] : ls.filter((_, idx) => idx !== i))

  return (
    <div className="lineas">
      {lineas.map((l, i) => (
        <div key={i} className="linea">
          <div className="linea-prod">
            <label>Producto</label>
            <select value={l.producto_id} onChange={e => set(i, 'producto_id', e.target.value)}>
              <option value="">—</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre}{stock ? ` (hay ${Number(stock[p.id] || 0)})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Cant.</label>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={l.cantidad} onChange={e => set(i, 'cantidad', e.target.value)} />
          </div>
          <div>
            <label>{etiquetaPrecio}</label>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={l.precio_unitario} onChange={e => set(i, 'precio_unitario', e.target.value)} />
          </div>
          <button type="button" className="icon-btn" aria-label="Quitar línea" onClick={() => quitar(i)}>×</button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="secondary small" onClick={() => setLineas(ls => [...ls, lineaVacia()])}>+ Producto</button>
        <strong>Total {q(totalLineas(lineas))}</strong>
      </div>
    </div>
  )
}
