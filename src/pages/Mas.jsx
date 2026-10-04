import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import { msgError } from '../lib/format.jsx'

const TABLAS = {
  clientes: { titulo: 'Clientes', campos: [['nombre', 'Nombre'], ['contacto', 'Contacto'], ['telefono', 'Teléfono']], roles: ['admin', 'bodega', 'vendedor'] },
  proveedores: { titulo: 'Proveedores', campos: [['nombre', 'Nombre'], ['contacto', 'Contacto'], ['telefono', 'Teléfono']], roles: ['admin', 'bodega'] },
  productos: { titulo: 'Productos', campos: [['nombre', 'Nombre'], ['unidad_medida', 'Unidad'], ['stock_minimo', 'Alerta stock mínimo']], roles: ['admin', 'bodega'] },
}

export default function Mas() {
  const { profile, signOut } = useAuth()
  const disponibles = Object.entries(TABLAS).filter(([, t]) => t.roles.includes(profile?.rol))
  const [tabla, setTabla] = useState(disponibles[0]?.[0])

  return (
    <div>
      <h2>Más</h2>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="detail-line"><span>Usuario</span><strong>{profile?.usuario}</strong></div>
        <div className="detail-line"><span>Nombre</span><span>{profile?.nombre}</span></div>
        <div className="detail-line"><span>Rol</span><span>{profile?.rol}{profile?.ubicaciones ? ` · ${profile.ubicaciones.nombre}` : ''}</span></div>
      </div>

      <CambiarPassword />

      <div className="section-title">Catálogos</div>
      <div className="chips" style={{ marginBottom: 10 }}>
        {disponibles.map(([k, t]) => <button key={k} className={`chip ${tabla === k ? 'on' : ''}`} onClick={() => setTabla(k)}>{t.titulo}</button>)}
      </div>
      {tabla && <Catalogo key={tabla} tabla={tabla} def={TABLAS[tabla]} puedeDesactivar={profile?.rol === 'admin'} />}

      <button className="secondary" style={{ width: '100%', marginTop: 24 }} onClick={signOut}>Cerrar sesión</button>
      <p className="muted" style={{ textAlign: 'center', marginTop: 12 }}>T-800 · v2.0</p>
    </div>
  )
}

function CambiarPassword() {
  const [abierto, setAbierto] = useState(false)
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [msg, setMsg] = useState('')

  async function guardar(e) {
    e.preventDefault(); setMsg('')
    if (p1.length < 8) return setMsg('Mínimo 8 caracteres')
    if (p1 !== p2) return setMsg('Las contraseñas no coinciden')
    const { error } = await supabase.auth.updateUser({ password: p1 })
    setMsg(error ? msgError(error) : 'Contraseña actualizada ✓')
    if (!error) { setP1(''); setP2('') }
  }

  if (!abierto) return <button className="secondary" style={{ width: '100%' }} onClick={() => setAbierto(true)}>Cambiar mi contraseña</button>
  return (
    <form className="card" onSubmit={guardar}>
      <div><label>Nueva contraseña</label><input type="password" value={p1} onChange={e => setP1(e.target.value)} /></div>
      <div><label>Repetir</label><input type="password" value={p2} onChange={e => setP2(e.target.value)} /></div>
      {msg && <div className={msg.includes('✓') ? 'ok' : 'error'}>{msg}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => setAbierto(false)}>Cerrar</button>
        <button style={{ flex: 1 }}>Guardar</button>
      </div>
    </form>
  )
}

function Catalogo({ tabla, def, puedeDesactivar }) {
  const [items, setItems] = useState([])
  const [nuevo, setNuevo] = useState({})
  const [editando, setEditando] = useState(null)
  const [error, setError] = useState('')

  async function cargar() {
    const { data } = await supabase.from(tabla).select('*').eq('activo', true).order('nombre')
    setItems(data || [])
  }
  useEffect(() => { cargar() }, [])

  async function guardar(e) {
    e.preventDefault(); setError('')
    const fila = Object.fromEntries(Object.entries(editando || nuevo).filter(([k]) => def.campos.some(([c]) => c === k)))
    const { error } = editando
      ? await supabase.from(tabla).update(fila).eq('id', editando.id)
      : await supabase.from(tabla).insert(fila)
    if (error) return setError(msgError(error))
    setNuevo({}); setEditando(null); cargar()
  }
  async function desactivar(id) {
    if (!confirm('¿Ocultar este registro? El historial se conserva.')) return
    await supabase.from(tabla).update({ activo: false }).eq('id', id); cargar()
  }

  const val = editando || nuevo
  const setVal = (k, v) => editando ? setEditando({ ...editando, [k]: v }) : setNuevo({ ...nuevo, [k]: v })

  return (
    <>
      <form className="card" onSubmit={guardar}>
        <div className="muted">{editando ? `Editando: ${editando.nombre}` : `Agregar a ${def.titulo.toLowerCase()}`}</div>
        {def.campos.map(([c, l]) => (
          <div key={c}><label>{l}</label>
            <input value={val[c] ?? ''} type={c === 'stock_minimo' ? 'number' : 'text'} onChange={e => setVal(c, e.target.value)} required={c === 'nombre'} />
          </div>
        ))}
        {error && <div className="error">{error}</div>}
        <div className="row" style={{ gap: 8 }}>
          {editando && <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => setEditando(null)}>Cancelar</button>}
          <button style={{ flex: 1 }}>{editando ? 'Guardar cambios' : 'Agregar'}</button>
        </div>
      </form>
      <div className="card">
        {items.map(i => (
          <div className="list-item row" key={i.id}>
            <span>{i.nombre}{i.telefono ? <span className="muted"> · {i.telefono}</span> : ''}</span>
            <span className="row" style={{ gap: 4 }}>
              <button className="secondary small" onClick={() => setEditando(i)}>Editar</button>
              {puedeDesactivar && <button className="secondary small" onClick={() => desactivar(i.id)}>Ocultar</button>}
            </span>
          </div>
        ))}
        {items.length === 0 && <p className="muted">Vacío.</p>}
      </div>
    </>
  )
}
