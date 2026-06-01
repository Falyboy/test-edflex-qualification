import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getProject, getProjectSources, getLivrables, getUserProjects } from '@/lib/edflex/store'
import { isProjectLocked } from '@/lib/edflex/limits'
import { EdflexWorkspace } from '@/components/edflex/workspace'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user?.email) redirect('/auth/login?callbackUrl=/edflex')

  const { projectId } = await params
  const [project, sources, livrables, locked, allProjects] = await Promise.all([
    getProject(projectId),
    getProjectSources(projectId),
    getLivrables(projectId),
    isProjectLocked(projectId),
    getUserProjects(session.user.email),
  ])

  if (!project || project.email !== session.user.email) notFound()

  return (
    <EdflexWorkspace
      allProjects={allProjects}
      project={project}
      initialSources={sources}
      initialLivrables={livrables}
      locked={locked}
    />
  )
}
