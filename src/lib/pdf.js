import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { q, fechaBonita } from './format.jsx'

const ORO = [176, 138, 52]
const OSCURO = [16, 27, 29]
const VERDE = [46, 125, 80]
const ROJO = [178, 64, 50]

let logoCache = null
async function logo() {
  if (logoCache) return logoCache
  try {
    const blob = await (await fetch('/logo.png')).blob()
    logoCache = await new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.readAsDataURL(blob)
    })
  } catch { logoCache = null }
  return logoCache
}

async function nuevoDoc(titulo, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const img = await logo()
  if (img) doc.addImage(img, 'PNG', 14, 10, 18, 18)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...OSCURO)
  doc.text('T-800', 36, 17)
  doc.setFontSize(12); doc.setTextColor(...ORO)
  doc.text(titulo, 36, 24)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  const periodo = desde === hasta ? `Fecha: ${fechaBonita(desde)}` : `Periodo: ${fechaBonita(desde)} al ${fechaBonita(hasta)}`
  doc.text(periodo, 202, 15, { align: 'right' })
  doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 202, 20, { align: 'right' })
  doc.setDrawColor(...ORO); doc.setLineWidth(0.6); doc.line(14, 31, 202, 31)
  return doc
}

function pie(doc) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(140)
    doc.text(`T-800 · Página ${i} de ${n}`, 108, 272, { align: 'center' })
  }
}

const tablaBase = {
  theme: 'grid',
  styles: { fontSize: 9, cellPadding: 2 },
  headStyles: { fillColor: OSCURO, textColor: 255, fontStyle: 'bold' },
  footStyles: { fillColor: [235, 230, 215], textColor: 20, fontStyle: 'bold' },
  margin: { left: 14, right: 14 },
  // montos alineados a la derecha también en encabezados y totales
  didParseCell: (d) => {
    if (d.section === 'foot' && /^-?Q[\d,]/.test(String(d.cell.raw))) d.cell.styles.halign = 'right'
    if (d.section === 'head' && d.table.columns[d.column.index]?.index !== 0 && /Monto|Total|Pagado|Saldo|Cobrado|Ventas|Costo|Ganancia|Cantidad/.test(String(d.cell.raw))) d.cell.styles.halign = 'right'
  },
}

function subtitulo(doc, texto, y) {
  if (y > 235) { doc.addPage(); y = 20 } // evita títulos sueltos al pie de página
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...OSCURO)
  doc.text(texto, 14, y)
  return y + 3
}
const sigY = (doc, extra = 8) => doc.lastAutoTable.finalY + extra

export async function guardarPDF(doc, nombreArchivo) {
  pie(doc)
  if (Capacitor.isNativePlatform()) {
    const data = doc.output('datauristring').split(',')[1]
    const { uri } = await Filesystem.writeFile({ path: nombreArchivo, data, directory: Directory.Cache })
    await Share.share({ title: nombreArchivo, files: [uri], dialogTitle: 'Guardar o enviar PDF' })
  } else {
    doc.save(nombreArchivo)
  }
}

const nombre = (base, desde, hasta) => `T800_${base}_${desde}${desde === hasta ? '' : '_a_' + hasta}.pdf`

// ---------------------------------------------------------------------
// ESTADO DE RESULTADOS (ganancia o pérdida del periodo)
// ---------------------------------------------------------------------
export async function pdfEstadoResultados(rep) {
  const { desde, hasta } = rep
  const doc = await nuevoDoc('Estado de resultados', desde, hasta)
  const neta = Number(rep.utilidad_neta)
  const esGanancia = neta >= 0

  let y = subtitulo(doc, 'Resultado del periodo', 40)
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Concepto', 'Monto']],
    body: [
      ['Ventas', q(rep.ventas)],
      ['(-) Costo de lo vendido', q(rep.costo_ventas)],
      [{ content: '= Utilidad bruta', styles: { fontStyle: 'bold' } }, { content: q(rep.utilidad_bruta), styles: { fontStyle: 'bold' } }],
      ['(-) Gastos operativos', q(rep.gastos)],
    ],
    foot: [[esGanancia ? 'GANANCIA NETA' : 'PÉRDIDA NETA', q(neta)]],
    footStyles: { ...tablaBase.footStyles, fillColor: esGanancia ? VERDE : ROJO, textColor: 255 },
    columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
  })

  y = subtitulo(doc, 'Movimiento de dinero (efectivo real)', sigY(doc))
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Concepto', 'Monto']],
    body: [
      ['Cobrado a clientes', q(rep.cobros_clientes)],
      ['(-) Pagado a proveedores', q(rep.pagos_proveedores)],
      ['(-) Gastos pagados', q(rep.gastos)],
    ],
    foot: [['Flujo neto de caja', q(rep.flujo_caja)]],
    columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
  })

  y = subtitulo(doc, 'Compras y saldos', sigY(doc))
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Concepto', 'Monto']],
    body: [
      ['Compras de mercadería en el periodo', q(rep.compras)],
      ['Le deben (cuentas por cobrar, a hoy)', q(rep.por_cobrar)],
      ['Debe a proveedores (cuentas por pagar, a hoy)', q(rep.por_pagar)],
    ],
    columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
  })

  if (rep.por_producto?.length) {
    y = subtitulo(doc, 'Ventas y ganancia por producto', sigY(doc))
    autoTable(doc, {
      ...tablaBase, startY: y,
      head: [['Producto', 'Cantidad', 'Ventas', 'Costo', 'Ganancia']],
      body: rep.por_producto.map(p => [p.producto, Number(p.cantidad).toLocaleString('es-GT'), q(p.ventas), q(p.costo), q(p.utilidad)]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
  }

  y = subtitulo(doc, 'Por ubicación', sigY(doc))
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Ubicación', 'Ventas', 'Ganancia bruta']],
    body: (rep.por_ubicacion || []).map(u => [u.ubicacion, q(u.ventas), q(u.utilidad)]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })

  if (rep.gastos_por_categoria?.length) {
    y = subtitulo(doc, 'Gastos por categoría', sigY(doc))
    autoTable(doc, {
      ...tablaBase, startY: y,
      head: [['Categoría', 'Monto']],
      body: rep.gastos_por_categoria.map(g => [g.categoria, q(g.monto)]),
      columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
    })
  }

  await guardarPDF(doc, nombre('EstadoResultados', desde, hasta))
}

// ---------------------------------------------------------------------
// LISTADOS
// ---------------------------------------------------------------------
async function pdfListado({ titulo, base, desde, hasta, head, body, foot, derecha = [] }) {
  const doc = await nuevoDoc(titulo, desde, hasta)
  const columnStyles = Object.fromEntries(derecha.map(i => [i, { halign: 'right' }]))
  autoTable(doc, {
    ...tablaBase, startY: 38, head: [head],
    body: body.length ? body : [[{ content: 'Sin registros en este periodo', colSpan: head.length, styles: { halign: 'center', textColor: 120 } }]],
    foot: foot ? [foot] : undefined, columnStyles,
  })
  await guardarPDF(doc, nombre(base, desde, hasta))
}

const suma = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0)

export function pdfCompras(compras, desde, hasta) {
  const lista = compras.filter(c => !c.anulada)
  return pdfListado({
    titulo: 'Reporte de compras', base: 'Compras', desde, hasta,
    head: ['Fecha', 'Proveedor', 'Factura', 'Total', 'Pagado', 'Saldo', 'Estado'],
    body: lista.map(c => [fechaBonita(c.fecha), c.proveedor, c.num_factura || '', q(c.total), q(c.pagado), q(c.saldo), c.estado_pago]),
    foot: ['', 'TOTAL', '', q(suma(lista, 'total')), q(suma(lista, 'pagado')), q(suma(lista, 'saldo')), ''],
    derecha: [3, 4, 5],
  })
}

export function pdfVentas(ventas, desde, hasta) {
  const lista = ventas.filter(v => !v.anulada)
  return pdfListado({
    titulo: 'Reporte de ventas', base: 'Ventas', desde, hasta,
    head: ['Fecha', 'Cliente', 'Ubicación', 'Total', 'Cobrado', 'Saldo', 'Estado'],
    body: lista.map(v => [fechaBonita(v.fecha), v.cliente, v.ubicacion, q(v.total), q(v.cobrado), q(v.saldo), v.estado_pago]),
    foot: ['', 'TOTAL', '', q(suma(lista, 'total')), q(suma(lista, 'cobrado')), q(suma(lista, 'saldo')), ''],
    derecha: [3, 4, 5],
  })
}

export function pdfGastos(gastos, desde, hasta) {
  const lista = gastos.filter(g => !g.anulado)
  return pdfListado({
    titulo: 'Reporte de gastos', base: 'Gastos', desde, hasta,
    head: ['Fecha', 'Categoría', 'Descripción', 'Ubicación', 'Monto'],
    body: lista.map(g => [fechaBonita(g.fecha), g.categoria, g.descripcion || '', g.ubicaciones?.nombre || 'General', q(g.monto)]),
    foot: ['', 'TOTAL', '', '', q(suma(lista, 'monto'))],
    derecha: [4],
  })
}

export async function pdfCuentas(porCobrar, porPagar, fecha) {
  const doc = await nuevoDoc('Cuentas por cobrar y por pagar', fecha, fecha)
  let y = subtitulo(doc, 'Le deben (cuentas por cobrar)', 40)
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Fecha', 'Cliente', 'Ubicación', 'Total', 'Saldo']],
    body: porCobrar.map(v => [fechaBonita(v.fecha), v.cliente, v.ubicacion, q(v.total), q(v.saldo)]),
    foot: [['', 'TOTAL', '', '', q(suma(porCobrar, 'saldo'))]],
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  })
  y = subtitulo(doc, 'Debe (cuentas por pagar a proveedores)', sigY(doc, 10))
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Fecha', 'Proveedor', 'Factura', 'Total', 'Saldo']],
    body: porPagar.map(c => [fechaBonita(c.fecha), c.proveedor, c.num_factura || '', q(c.total), q(c.saldo)]),
    foot: [['', 'TOTAL', '', '', q(suma(porPagar, 'saldo'))]],
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  })
  await guardarPDF(doc, `T800_Cuentas_${fecha}.pdf`)
}
