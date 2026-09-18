'use client'

import { useState } from 'react'
import { api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { OrgOsLogo } from './logo'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Briefcase, CheckCircle2, LineChart, Users, KanbanSquare, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const DEMO_ACCOUNTS = [
  { email: 'owner@orgos.dev', label: 'Owner / CEO', hint: 'Full access — Tanvir, Founder of Meridian Labs' },
  { email: 'farhan@orgos.dev', label: 'Manager', hint: 'Tech lead view — Farhan, CTO' },
  { email: 'nusrat@orgos.dev', label: 'HR', hint: 'People ops — Nusrat, HR Manager' },
  { email: 'rafi@orgos.dev', label: 'Employee', hint: 'Team member — Rafi, Developer' },
  { email: 'saas@orgos.dev', label: 'SaaS admin', hint: 'Platform console — Farhan, SaaS Platform Owner' },
]

const FEATURES = [
  { icon: Briefcase, title: 'CRM & Sales', text: 'Leads, pipelines, deals and clients connected to delivery.' },
  { icon: KanbanSquare, title: 'Projects & Tasks', text: 'Kanban, milestones, Gantt and calendars in one place.' },
  { icon: Users, title: 'People & HR', text: 'Recruitment, attendance, leave and org structure.' },
  { icon: LineChart, title: 'Finance & Insights', text: 'Invoices, expenses and dashboards that tie it together.' },
]

export function AuthScreen() {
  const { refreshMe } = useWorkspace()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true)
    try {
      if (mode === 'login') {
        await api('/api/auth/login', { method: 'POST', body: { email, password } })
        toast({ title: 'Welcome back', description: 'Signed in successfully.' })
      } else {
        await api('/api/auth/register', { method: 'POST', body: { name, email, password } })
        toast({ title: 'Account created', description: 'Set up your organization to get started.' })
      }
      await refreshMe()
    } catch {
      // toast handled by api()
    } finally {
      setBusy(false)
    }
  }

  async function quickLogin(demoEmail: string) {
    setMode('login')
    setEmail(demoEmail)
    setPassword('password123')
    setBusy(true)
    try {
      await api('/api/auth/login', { method: 'POST', body: { email: demoEmail, password: 'password123' } })
      toast({ title: 'Signed in', description: `Logged in as ${demoEmail}` })
      await refreshMe()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="grid flex-1 lg:grid-cols-2">
        {/* Brand panel */}
        <div className="relative flex flex-col justify-between overflow-hidden bg-zinc-950 p-8 text-white lg:p-12">
          <div className="app-bg-grid absolute inset-0 opacity-60" aria-hidden />
          <div
            className="absolute -right-24 -top-24 size-96 rounded-full bg-emerald-600/20 blur-3xl"
            aria-hidden
          />
          <div className="relative">
            <OrgOsLogo dark className="text-lg" />
          </div>
          <div className="relative mt-8 max-w-md">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
              Run your organization from one connected workspace.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              OrgOS unifies people, recruitment, projects, tasks, clients, sales, attendance and finance —
              so every part of your business works as one system, from lead to delivery.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur">
                  <f.icon className="size-4.5 text-emerald-400" aria-hidden />
                  <p className="mt-2 text-sm font-medium">{f.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="relative mt-8 text-xs text-zinc-500">
            Multi-tenant SaaS · One workspace for people, projects, sales &amp; operations
          </p>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'login' | 'register')}>
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mode === 'login'
                      ? 'Enter your credentials or use a demo account.'
                      : 'Start with an account — then create your organization.'}
                  </p>
                </div>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Sign in</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={submit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy && <Loader2 className="size-4 animate-spin" />} Sign in
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={submit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="name">Full name</Label>
                      <Input id="name" placeholder="Jane Cooper" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="remail">Email</Label>
                      <Input
                        id="remail"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="rpassword">Password</Label>
                      <Input
                        id="rpassword"
                        type="password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy && <Loader2 className="size-4 animate-spin" />} Create account
                    </Button>
                  </form>
                </TabsContent>
              </div>
            </Tabs>

            <div className="my-6 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or explore with a demo account</span>
              <Separator className="flex-1" />
            </div>

            <Card className="py-0">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" /> One-click demo logins
                </CardTitle>
                <CardDescription className="text-xs">Password for all demo accounts: password123</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 p-4 pt-0 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => quickLogin(d.email)}
                    disabled={busy}
                    className="rounded-lg border p-2.5 text-left transition-colors hover:border-emerald-600/50 hover:bg-emerald-600/5 disabled:opacity-50"
                  >
                    <p className="text-xs font-medium">{d.label}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{d.hint}</p>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <footer className="border-t bg-background px-6 py-4 text-center text-xs text-muted-foreground">
        OrgOS — The Organization Operating System · Enterprise SaaS
      </footer>
    </div>
  )
}
