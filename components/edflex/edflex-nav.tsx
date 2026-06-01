'use client'
import { signOut } from 'next-auth/react'

export function EdflexNav() {
  return (
    <nav className="bg-white border-b border-zinc-200 px-3 md:px-6 py-2 md:py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between w-full">
        <span className="px-2.5 md:px-4 py-2 text-sm font-semibold rounded bg-zinc-900 text-white">
          EDFLEX
        </span>
        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          className="px-2.5 md:px-4 py-2 text-xs md:text-sm font-medium rounded text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors whitespace-nowrap">
          Se déconnecter
        </button>
      </div>
    </nav>
  )
}
