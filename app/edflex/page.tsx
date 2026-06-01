import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserProjects } from '@/lib/edflex/store'
import { ensureDemoProject } from '@/lib/edflex/seed'
import { EdflexWorkspace } from '@/components/edflex/workspace'

export default async function EdflexPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/auth/login?callbackUrl=/edflex')

  const projects = await getUserProjects(session.user.email)

  // Si projets → aller directement au premier
  if (projects.length > 0) redirect(`/edflex/${projects[0].id}`)

  // 0 projet → on charge automatiquement le projet démo "Leadership"
  // (contexte + sources pré-qualifiées) pour que l'évaluateur voie le
  // pipeline immédiatement et n'ait qu'à lancer la génération.
  const demo = await ensureDemoProject(session.user.email)
  if (demo) redirect(`/edflex/${demo.id}`)

  // Fallback — workspace vide avec tabs (modal s'ouvre auto)
  return (
    <EdflexWorkspace
      allProjects={[]}
      project={null}
      initialSources={[]}
      initialLivrables={[]}
      locked={false}
    />
  )
}
