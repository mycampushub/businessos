'use client'

import { useState } from 'react'
import { api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { OrgOsLogo } from './logo'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { Loader2, Rocket, Building2 } from 'lucide-react'

export interface OrgTemplate {
  id: string
  name: string
  description: string
  departments: string[]
}

export const ORG_TEMPLATES: OrgTemplate[] = [
  {
    id: 'digital-agency',
    name: 'Digital Agency',
    description: 'Client services, design, development and marketing pods.',
    departments: ['Management', 'Design', 'Technology', 'Marketing', 'Sales', 'Finance'],
  },
  {
    id: 'software',
    name: 'Software Company',
    description: 'Product engineering teams with QA and support.',
    departments: ['Management', 'Engineering', 'QA', 'Product', 'Marketing', 'Finance'],
  },
  {
    id: 'marketing',
    name: 'Marketing Agency',
    description: 'Creative, content and performance teams.',
    departments: ['Management', 'Creative', 'Content', 'Performance Marketing', 'Client Services'],
  },
  {
    id: 'consulting',
    name: 'Consulting Firm',
    description: 'Engagement-based delivery structure.',
    departments: ['Management', 'Consulting', 'Research', 'Operations'],
  },
  {
    id: 'general',
    name: 'General Organization',
    description: 'Start simple — customize everything later.',
    departments: ['Management', 'Operations', 'Finance', 'HR'],
  },
]

export interface OrgFormPayload {
  name: string
  industry: string
  orgType: string
  country: string
  currency: string
  template: string
  description?: string
}

export function OrgCreateForm({
  onCreated,
  compact,
}: {
  onCreated: () => void
  compact?: boolean
}) {
  const { refreshMe } = useWorkspace()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [orgType, setOrgType] = useState('Company')
  const [country, setCountry] = useState('Bangladesh')
  const [currency, setCurrency] = useState('BDT')
  const [template, setTemplate] = useState('general')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!name.trim()) {
      toast({ title: 'Organization name is required', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const payload: OrgFormPayload = { name, industry, orgType, country, currency, template, description }
      await api('/api/orgs', { method: 'POST', body: payload })
      await refreshMe()
      toast({ title: 'Organization created', description: 'Workspace initialized with structure from the template.' })
      onCreated()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="orgname">Organization name</Label>
        <Input id="orgname" placeholder="e.g. Meridian Labs" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Industry</Label>
          <Select value={industry || 'Software & IT'} onValueChange={setIndustry}>
            <SelectTrigger><SelectValue placeholder="Industry" /></SelectTrigger>
            <SelectContent>
              {['Software & IT', 'Digital Marketing', 'Design & Creative', 'Consulting', 'E-commerce', 'Education', 'Healthcare', 'Finance', 'Manufacturing', 'Other'].map((x) => (
                <SelectItem key={x} value={x}>{x}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Organization type</Label>
          <Select value={orgType} onValueChange={setOrgType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Company', 'Startup', 'Agency', 'Team', 'Consultancy', 'Nonprofit', 'Community'].map((x) => (
                <SelectItem key={x} value={x}>{x}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Country</Label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Bangladesh" />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD'].map((x) => (
                <SelectItem key={x} value={x}>{x}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {!compact && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="orgdesc">Description (optional)</Label>
          <Textarea id="orgdesc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your organization do?" />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label>Start from a template</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {ORG_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                template === t.id ? 'border-emerald-600 bg-emerald-600/5' : 'hover:bg-muted/60'
              )}
              aria-pressed={template === t.id}
            >
              <p className="text-sm font-medium">{t.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
      <Button type="submit" disabled={busy} className="sm:self-start">
        {busy && <Loader2 className="size-4 animate-spin" />}
        <Rocket className="size-4" /> Create workspace
      </Button>
    </form>
  )
}

/** Full-screen onboarding for freshly registered users without an organization. */
export function OnboardingScreen() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex-1 app-bg-grid">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12 lg:py-16">
          <div>
            <OrgOsLogo className="text-lg" />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
              Set up your organization
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You are one step away from your unified workspace. Pick a template — we will create the
              departments, default sales pipeline and leave policies for you.
            </p>
          </div>
          <Card className="py-0">
            <CardContent className="p-6">
              <OrgCreateForm onCreated={() => {}} />
            </CardContent>
          </Card>
        </div>
      </div>
      <footer className="border-t bg-background px-6 py-4 text-center text-xs text-muted-foreground">
        OrgOS — The Organization Operating System
      </footer>
    </div>
  )
}

/** Dialog to create an additional organization (org switcher). */
export function CreateOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-emerald-600" /> Create a new organization
          </DialogTitle>
          <DialogDescription>
            You will become the owner of this workspace. Switch between your organizations anytime.
          </DialogDescription>
        </DialogHeader>
        <OrgCreateForm compact onCreated={() => onOpenChange(false)} />
        <DialogFooter className="sr-only">
          <Button type="button">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
