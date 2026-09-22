import type { Metadata } from 'next'
import { WorkspaceApp } from '@/components/app/app-root'

export const metadata: Metadata = {
  title: 'Workspace',
  description: 'Your OrgOS workspace.',
  robots: { index: false, follow: false },
}

export default function AppPage() {
  return <WorkspaceApp />
}
