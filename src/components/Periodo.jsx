import { PERIODOS, rangoPeriodo } from '../lib/format.jsx'

// Selector de periodo. value = { periodo, desde, hasta }
export default function Periodo({ value, onChange }) {
  const elegir = (periodo) => {
    if (periodo === 'custom') return onChange({ ...value, periodo })
    const [desde, hasta] = rangoPeriodo(periodo)
    onChange({ periodo, desde, hasta })
  }
  return (
    <div className="periodo">
      <div className="chips">
        {PERIODOS.map(([v, l]) => (
          <button key={v} type="button" className={`chip ${value.periodo === v ? 'on' : ''}`} onClick={() => elegir(v)}>{l}</button>
        ))}
      </div>
      {value.periodo === 'custom' && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}><label>Desde</label><input type="date" value={value.desde} onChange={e => onChange({ ...value, desde: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label>Hasta</label><input type="date" value={value.hasta} onChange={e => onChange({ ...value, hasta: e.target.value })} /></div>
        </div>
      )}
    </div>
  )
}

export const periodoInicial = (p = 'mes') => {
  const [desde, hasta] = rangoPeriodo(p)
  return { periodo: p, desde, hasta }
}
