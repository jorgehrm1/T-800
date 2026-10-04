import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*, ubicaciones(nombre)').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data || null))
  }, [session])

  const signOut = () => supabase.auth.signOut()
  const loading = session === undefined || (session && profile === undefined)

  return (
    <AuthContext.Provider value={{ session, profile, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
