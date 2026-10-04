// Formato de moneda en quetzales
export const q = (n) => {
  const v = Number(n ?? 0)
  const txt = Math.abs(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '-' : ''}Q${txt}`
}

// Fecha local YYYY-MM-DD (no UTC: en Guatemala después de las 6 pm
// toISOString() ya devuelve el día siguiente)
export function fechaLocal(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const hoy = () => fechaLocal()

export const fechaBonita = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Rango [desde, hasta] para un periodo
export function rangoPeriodo(periodo) {
  const d = new Date()
  const hasta = fechaLocal(d)
  if (periodo === 'dia') return [hasta, hasta]
  if (periodo === 'semana') {
    const dow = d.getDay() || 7 // lunes = 1
    const ini = new Date(d)
    ini.setDate(d.getDate() - dow + 1)
    return [fechaLocal(ini), hasta]
  }
  if (periodo === 'mes') return [fechaLocal(new Date(d.getFullYear(), d.getMonth(), 1)), hasta]
  if (periodo === 'mes_anterior') {
    return [
      fechaLocal(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
      fechaLocal(new Date(d.getFullYear(), d.getMonth(), 0)),
    ]
  }
  if (periodo === 'anio') return [fechaLocal(new Date(d.getFullYear(), 0, 1)), hasta]
  return [hasta, hasta]
}

export const PERIODOS = [
  ['dia', 'Hoy'],
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['mes_anterior', 'Mes ant.'],
  ['anio', 'Año'],
  ['custom', 'Fechas'],
]

export const TagEstado = ({ estado, anulada }) =>
  anulada ? <span className="tag anulada">anulada</span> : <span className={`tag ${estado}`}>{estado}</span>

// Mensaje de error legible (Postgres devuelve el texto de RAISE EXCEPTION)
export const msgError = (e) => e?.message || String(e)
