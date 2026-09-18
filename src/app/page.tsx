'use client'

import { WorkspaceProvider, useWorkspace } from '@/lib/client/store'
import { AuthScreen } from '@/components/app/auth-screen'
import { OnboardingScreen } from '@/components/app/onboarding'
import { WorkspaceShell } from '@/components/app/workspace-shell'
import { Loader2 } from 'lucide-react'
import { OrgOsLogo } from '@/components/app/logo'

function AppRoot() {
  const { me, loadingMe } = useWorkspace()

  if (loadingMe && !me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <OrgOsLogo className="text-xl" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your workspace…
        </div>
      </div>
    )
  }

  if (!me) return <AuthScreen />
  // SaaS platform administrators get their console even without an organization;
  // everyone else without memberships starts with onboarding.
  if (me.memberships.length === 0 && !me.user.platformAdmin) return <OnboardingScreen />
  return <WorkspaceShell />
}

export default function Page() {
  return (
    <WorkspaceProvider>
      <AppRoot />
    </WorkspaceProvider>
  )
}
