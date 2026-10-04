import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

// Los usuarios entran con un nombre corto ("camion"); internamente es un correo.
export const DOMINIO_USUARIOS = 't800.local'
export const correoDeUsuario = (u) => {
  const v = u.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${DOMINIO_USUARIOS}`
}

// Llama una función RPC y lanza el mensaje de error de la base de datos
export async function rpc(nombre, params) {
  const { data, error } = await supabase.rpc(nombre, params)
  if (error) throw new Error(error.message)
  return data
}
