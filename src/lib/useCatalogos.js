import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// Carga los catálogos que usan los formularios
export function useCatalogos() {
  const [cat, setCat] = useState({ productos: [], clientes: [], proveedores: [], ubicaciones: [] })
  const recargar = useCallback(async () => {
    const [p, c, pr, u] = await Promise.all([
      supabase.from('productos').select('*').eq('activo', true).order('nombre'),
      supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
      supabase.from('proveedores').select('*').eq('activo', true).order('nombre'),
      supabase.from('ubicaciones').select('*').order('nombre'),
    ])
    setCat({ productos: p.data || [], clientes: c.data || [], proveedores: pr.data || [], ubicaciones: u.data || [] })
  }, [])
  useEffect(() => { recargar() }, [recargar])
  return { ...cat, recargar }
}
