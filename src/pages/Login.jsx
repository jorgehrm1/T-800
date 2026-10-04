import { useState } from 'react'
import { supabase, correoDeUsuario } from '../supabaseClient'

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: correoDeUsuario(usuario), password })
    if (error) setError(error.message.includes('fetch') ? 'Sin conexión a internet' : 'Usuario o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div className="login">
      <img src="/logo.png" alt="T-800" width="96" height="96" className="login-logo" />
      <h1 className="display" style={{ fontSize: 30 }}>T-800</h1>
      <p className="muted" style={{ marginBottom: 22 }}>Control de compras, inventario y ventas</p>
      <form onSubmit={onSubmit}>
        <div>
          <label>Usuario</label>
          <input autoCapitalize="none" autoCorrect="off" autoComplete="username" value={usuario}
                 onChange={e => setUsuario(e.target.value)} placeholder="ej. camion" required />
        </div>
        <div>
          <label>Contraseña</label>
          <input type="password" autoComplete="current-password" value={password}
                 onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <div className="error">{error}</div>}
        <button disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  )
}
