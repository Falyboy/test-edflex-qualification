import type { ReactNode } from 'react'
import { EdflexNav } from '@/components/edflex/edflex-nav'

export default function EdflexLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <EdflexNav />
      {children}
    </div>
  )
}
