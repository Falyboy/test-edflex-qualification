'use client'

import React, { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { User, LogOut, LayoutDashboard, ShieldCheck, Menu, X } from 'lucide-react'
import { useSidebarContext } from '@/contexts/sidebar-context'

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)

export function Nav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const email = session?.user?.email ?? null
  const isAdmin = email ? ADMIN_EMAILS.includes(email) : false
  const isLoggedIn = !!session
  const onPublicPage = !pathname.startsWith('/dashboard') && !pathname.startsWith('/admin')
  if (pathname.startsWith('/edflex')) return null
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { open: sidebarOpen, toggle: toggleSidebar } = useSidebarContext()
  const hasSidebar = pathname.startsWith('/dashboard') || (isAdmin && pathname.startsWith('/admin'))

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <nav className="bg-white border-b border-zinc-200 px-3 md:px-6 py-2 md:py-3">
      <div className="max-w-5xl mx-auto flex items-center w-full gap-1">

        {/* Burger mobile — dashboard et admin uniquement */}
        {hasSidebar && (
          <button
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Fermer menu' : 'Ouvrir menu'}
            className="md:hidden p-1.5 rounded-lg hover:bg-zinc-100 transition-colors shrink-0 mr-1"
          >
            {sidebarOpen
              ? <X className="h-5 w-5 text-zinc-700" />
              : <Menu className="h-5 w-5 text-zinc-700" />
            }
          </button>
        )}

        {/* Liens gauche */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          <Link href="/"
            className={`px-2.5 md:px-4 py-2 text-sm font-medium rounded whitespace-nowrap transition-colors ${
              pathname === '/'
                ? 'font-semibold bg-zinc-900 text-white'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            }`}>
            Générer
          </Link>

          {isLoggedIn && (
            <Link href="/dashboard"
              className={`flex items-center gap-1.5 px-2.5 md:px-4 py-2 text-sm font-medium rounded transition-colors ${
                pathname.startsWith('/dashboard')
                  ? 'font-semibold bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}>
              <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Mon Board</span>
            </Link>
          )}

          {isAdmin && (
            <Link href="/admin"
              className={`flex items-center gap-1.5 px-2.5 md:px-4 py-2 text-sm font-medium rounded transition-colors ${
                pathname.startsWith('/admin')
                  ? 'font-semibold bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}>
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
        </div>

        {/* Droite — non connecté */}
        {!isLoggedIn && onPublicPage && (
          <div className="flex items-center gap-1 shrink-0">
            <Link href="/auth/login"
              className="px-2.5 md:px-4 py-2 text-xs md:text-sm font-medium rounded text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors whitespace-nowrap">
              Connexion
            </Link>
            <Link href="/auth/register"
              className="px-2.5 md:px-4 py-2 text-xs md:text-sm font-semibold rounded bg-zinc-900 text-white hover:bg-zinc-700 transition-colors whitespace-nowrap">
              S&apos;inscrire
            </Link>
          </div>
        )}

        {/* Droite — connecté */}
        {isLoggedIn && email && (
          <div className="relative shrink-0" ref={ref}>
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              aria-label="Menu compte"
            >
              <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {email.charAt(0).toUpperCase()}
              </div>
              {/* Email visible seulement md+ */}
              <span className="hidden md:block text-sm text-zinc-600 max-w-[140px] truncate">{email}</span>
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-50">
                <Link href="/dashboard/compte"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors">
                  <User className="h-4 w-4 text-zinc-400" />
                  Mon compte
                </Link>
                <div className="border-t border-zinc-100 my-1" />
                <button
                  onClick={() => signOut({ callbackUrl: '/auth/login' })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <LogOut className="h-4 w-4" />
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
