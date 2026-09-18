'use client'

import { useMemo, useState } from 'react'
import { useData, api } from '@/lib/client/api'
import { useWorkspace } from '@/lib/client/store'
import { money, fmtDate, type BadgeTone } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { StatCard } from '@/components/app/stat-card'
import { StatusBadge } from '@/components/app/status-badge'
import { UserAvatar } from '@/components/app/user-avatar'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ArrowRight, BookUser, Briefcase, Building2, ExternalLink, FolderOpen, Globe, Handshake,
  Mail, MapPin, MoreHorizontal, Pencil, Plus, Search, Trash2, Users,
} from 'lucide-react'

// ---------- local types ----------

interface ContactItem {
  id: string
  companyId: string | null
  companyName: string | null
  name: string
  position: string | null
  email: string | null
  phone: string | null
  notes: string | null
  createdAt: string
}

interface CompanyItem {
  id: string
  name: string
  industry: string | null
  website: string | null
  address: string | null
  notes: string | null
  createdAt: string
  contactCount: number
  dealCount: number
}

interface ClientItem {
  id: string
  name: string
  status: string
  contactEmail: string | null
  healthNote: string | null
  since: string
  projectCount: number
  revenue: number
}

const CLIENT_STATUS_LABELS: Record<string, string> = {
  PROSPECT: 'Prospect', ACTIVE: 'Active', INACTIVE: 'Inactive', CHURNED: 'Churned',
}
const CLIENT_STATUS_TONE: Record<string, BadgeTone> = {
  PROSPECT: 'outline', ACTIVE: 'info', INACTIVE: 'muted', CHURNED: 'destructive',
}

interface ContactForm {
  name: string; position: string; email: string; phone: string; companyId: string; notes: string
}
const EMPTY_CONTACT: ContactForm = { name: '', position: '', email: '', phone: '', companyId: '', notes: '' }

interface CompanyForm {
  name: string; industry: string; website: string; address: string; notes: string
}
const EMPTY_COMPANY: CompanyForm = { name: '', industry: '', website: '', address: '', notes: '' }

type DeleteTarget = { kind: 'contact' | 'company'; id: string; name: string }

export default function CrmContactsView() {
  const { org, role, navigate } = useWorkspace()
  const cur = org?.currency ?? 'BDT'
  const canManage = role === 'OWNER' || role === 'ADMIN'

  const contactsQ = useData<{ items: ContactItem[] }>('/api/crm/contacts')
  const companiesQ = useData<{ items: CompanyItem[] }>('/api/crm/companies')
  const clientsQ = useData<{ items: ClientItem[] }>('/api/crm/clients')

  const contacts = contactsQ.data?.items ?? []
  const companies = companiesQ.data?.items ?? []
  const clients = clientsQ.data?.items ?? []

  // contacts filters
  const [q, setQ] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')

  const filteredContacts = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return contacts.filter((c) => {
      if (companyFilter !== 'ALL' && (c.companyId ?? '') !== companyFilter) return false
      if (!needle) return true
      return [c.name, c.position, c.email, c.companyName].some((f) => (f ?? '').toLowerCase().includes(needle))
    })
  }, [contacts, q, companyFilter])

  // dialogs
  const [contactFormOpen, setContactFormOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<ContactItem | null>(null)
  const [contactForm, setContactForm] = useState<ContactForm>(EMPTY_CONTACT)
  const [companyFormOpen, setCompanyFormOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyItem | null>(null)
  const [companyForm, setCompanyForm] = useState<CompanyForm>(EMPTY_COMPANY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)

  function openContactForm(contact?: ContactItem) {
    setEditingContact(contact ?? null)
    setContactForm(contact
      ? { name: contact.name, position: contact.position ?? '', email: contact.email ?? '', phone: contact.phone ?? '', companyId: contact.companyId ?? '', notes: contact.notes ?? '' }
      : EMPTY_CONTACT)
    setContactFormOpen(true)
  }

  function openCompanyForm(company?: CompanyItem) {
    setEditingCompany(company ?? null)
    setCompanyForm(company
      ? { name: company.name, industry: company.industry ?? '', website: company.website ?? '', address: company.address ?? '', notes: company.notes ?? '' }
      : EMPTY_COMPANY)
    setCompanyFormOpen(true)
  }

  async function saveContact() {
    if (!contactForm.name.trim()) {
      toast({ title: 'Name is required', description: 'Please give the contact a name.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = {
        name: contactForm.name,
        position: contactForm.position,
        email: contactForm.email,
        phone: contactForm.phone,
        // null keeps POST happy (ignored) and lets PATCH clear the company link
        companyId: contactForm.companyId || null,
        notes: contactForm.notes,
      }
      if (editingContact) {
        await api(`/api/crm/contacts/${editingContact.id}`, { method: 'PATCH', body })
        toast({ title: 'Contact updated', description: `${contactForm.name} was saved.` })
      } else {
        await api('/api/crm/contacts', { method: 'POST', body })
        toast({ title: 'Contact created', description: `${contactForm.name} added.` })
      }
      setContactFormOpen(false)
      contactsQ.refresh()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function saveCompany() {
    if (!companyForm.name.trim()) {
      toast({ title: 'Name is required', description: 'Please give the company a name.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = {
        name: companyForm.name,
        industry: companyForm.industry,
        website: companyForm.website,
        address: companyForm.address,
        notes: companyForm.notes,
      }
      if (editingCompany) {
        await api(`/api/crm/companies/${editingCompany.id}`, { method: 'PATCH', body })
        toast({ title: 'Company updated', description: `${companyForm.name} was saved.` })
      } else {
        await api('/api/crm/companies', { method: 'POST', body })
        toast({ title: 'Company created', description: `${companyForm.name} added.` })
      }
      setCompanyFormOpen(false)
      companiesQ.refresh()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function runDelete() {
    if (!deleting) return
    const target = deleting
    setDeleting(null)
    try {
      await api(`/api/crm/${target.kind === 'contact' ? 'contacts' : 'companies'}/${target.id}`, { method: 'DELETE' })
      toast({ title: `${target.kind === 'contact' ? 'Contact' : 'Company'} deleted`, description: `${target.name} was removed.` })
      if (target.kind === 'contact') contactsQ.refresh()
      else companiesQ.refresh()
    } catch {
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BookUser}
        title="Contacts & Clients"
        description="Everyone in your network — prospects, companies and paying clients."
      />

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>

        {/* ================= CONTACTS ================= */}
        <TabsContent value="contacts" className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total contacts" value={contacts.length} icon={BookUser} loading={contactsQ.loading} />
            <StatCard label="With email" value={contacts.filter((c) => c.email).length} icon={Mail} tone="info" sub="Reachable by email" loading={contactsQ.loading} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts…" className="pl-9" aria-label="Search contacts" />
            </div>
            <div className="flex items-center gap-2">
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-40 sm:w-48" aria-label="Filter by company">
                  <SelectValue placeholder="Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All companies</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canManage && (
                <Button onClick={() => openContactForm()}>
                  <Plus className="size-4" aria-hidden /> New contact
                </Button>
              )}
            </div>
          </div>

          {contactsQ.loading ? (
            <Card className="py-0">
              <CardContent className="flex flex-col gap-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="size-9 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : contactsQ.error ? (
            <EmptyState icon={BookUser} title="Couldn't load contacts" description={contactsQ.error} />
          ) : filteredContacts.length === 0 ? (
            <EmptyState
              icon={BookUser}
              title={contacts.length === 0 ? 'No contacts yet' : 'No contacts match your filters'}
              description={contacts.length === 0 ? 'Add the people you meet across deals and companies.' : 'Try clearing the search or company filter.'}
              action={contacts.length === 0 && canManage ? (
                <Button variant="outline" onClick={() => openContactForm()}>
                  <Plus className="size-4" aria-hidden /> Add your first contact
                </Button>
              ) : undefined}
            />
          ) : (
            <Card className="py-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-44">Contact</TableHead>
                      <TableHead className="min-w-48">Email / Phone</TableHead>
                      <TableHead className="min-w-36">Company</TableHead>
                      <TableHead className="min-w-28">Created</TableHead>
                      {canManage && <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar name={c.name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{c.name}</p>
                              {c.position && <p className="truncate text-xs text-muted-foreground">{c.position}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {c.email ? <p className="truncate">{c.email}</p> : <p className="text-muted-foreground">No email</p>}
                            {c.phone && <p className="truncate text-xs text-muted-foreground">{c.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.companyName
                            ? <Badge variant="outline" className="max-w-36 truncate font-normal">{c.companyName}</Badge>
                            : <span className="text-sm text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(c.createdAt)}</TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => openContactForm(c)} aria-label={`Edit ${c.name}`}>
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleting({ kind: 'contact', id: c.id, name: c.name })}
                                aria-label={`Delete ${c.name}`}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                Showing {filteredContacts.length} of {contacts.length} contacts
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ================= COMPANIES ================= */}
        <TabsContent value="companies" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{companies.length} companies in your network</p>
            {canManage && (
              <Button onClick={() => openCompanyForm()}>
                <Plus className="size-4" aria-hidden /> New company
              </Button>
            )}
          </div>

          {companiesQ.loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="py-0">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-40" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : companiesQ.error ? (
            <EmptyState icon={Building2} title="Couldn't load companies" description={companiesQ.error} />
          ) : companies.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No companies yet"
              description="Track the organizations behind your deals."
              action={canManage ? (
                <Button variant="outline" onClick={() => openCompanyForm()}>
                  <Plus className="size-4" aria-hidden /> Add your first company
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {companies.map((c) => (
                <Card key={c.id} className="py-0 transition-shadow hover:shadow-sm">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                          <Building2 className="size-4" aria-hidden />
                        </span>
                        <span className="truncate">{c.name}</span>
                      </CardTitle>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Actions for ${c.name}`}>
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openCompanyForm(c)}>
                              <Pencil className="size-4" aria-hidden /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleting({ kind: 'company', id: c.id, name: c.name })}>
                              <Trash2 className="size-4" aria-hidden /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {c.industry && <p className="mt-1 text-xs text-muted-foreground">{c.industry}</p>}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 pb-4">
                    <div className="flex flex-col gap-1.5 text-sm">
                      {c.website && (
                        <a
                          href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
                        >
                          <Globe className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{c.website.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="size-3 shrink-0" aria-hidden />
                        </a>
                      )}
                      {c.address && (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{c.address}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <Users className="size-3" aria-hidden /> {c.contactCount} contacts
                      </Badge>
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <Handshake className="size-3" aria-hidden /> {c.dealCount} deals
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('crm-deals')}>
                      View deals <ArrowRight className="size-4" aria-hidden />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ================= CLIENTS ================= */}
        <TabsContent value="clients" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Clients are created automatically when a deal is won — no manual entry needed.
            </p>
          </div>

          {clientsQ.loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="py-0">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-40" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : clientsQ.error ? (
            <EmptyState icon={Briefcase} title="Couldn't load clients" description={clientsQ.error} />
          ) : clients.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No clients yet"
              description="Mark a deal as won and its company becomes a client here."
              action={<Button variant="outline" onClick={() => navigate('crm-deals')}>Go to deals <ArrowRight className="size-4" aria-hidden /></Button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {clients.map((c) => (
                <Card key={c.id} className="py-0 transition-shadow hover:shadow-sm">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-600/10 text-teal-700 dark:text-teal-300">
                          <Briefcase className="size-4" aria-hidden />
                        </span>
                        <span className="truncate">{c.name}</span>
                      </CardTitle>
                      <StatusBadge
                        label={CLIENT_STATUS_LABELS[c.status] ?? c.status}
                        tone={CLIENT_STATUS_TONE[c.status] ?? 'outline'}
                      />
                    </div>
                    {c.contactEmail && (
                      <a href={`mailto:${c.contactEmail}`} className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                        <Mail className="size-3.5 shrink-0" aria-hidden /> {c.contactEmail}
                      </a>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 pb-4">
                    {c.healthNote && (
                      <p className="line-clamp-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                        {c.healthNote}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Revenue</p>
                        <p className="truncate text-sm font-semibold tabular-nums">{money(c.revenue, cur, true)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('projects')}
                        className="cursor-pointer rounded-md border p-2 transition-colors hover:bg-muted/60"
                        aria-label={`View projects for ${c.name}`}
                      >
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Projects</p>
                        <p className="inline-flex items-center gap-1 text-sm font-semibold">
                          <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden /> {c.projectCount}
                        </p>
                      </button>
                      <div className="rounded-md border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Since</p>
                        <p className="text-sm font-semibold">{fmtDate(c.since)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- contact form ---------- */}
      <Dialog open={contactFormOpen} onOpenChange={setContactFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit contact' : 'New contact'}</DialogTitle>
            <DialogDescription>
              {editingContact ? `Update details for ${editingContact.name}.` : 'Add a person to your network.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-name">Name *</Label>
              <Input id="contact-name" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Rumana Ali" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-position">Position</Label>
                <Input id="contact-position" value={contactForm.position} onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))} placeholder="e.g. Brand Manager" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-company">Company</Label>
                <Select
                  value={contactForm.companyId}
                  onValueChange={(v) => setContactForm((f) => ({ ...f, companyId: v === '__none' ? '' : v }))}
                >
                  <SelectTrigger id="contact-company" className="w-full"><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No company</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+880…" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea id="contact-notes" rows={3} value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} placeholder="How you met, interests…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveContact()} disabled={saving}>{saving ? 'Saving…' : editingContact ? 'Save changes' : 'Create contact'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- company form ---------- */}
      <Dialog open={companyFormOpen} onOpenChange={setCompanyFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCompany ? 'Edit company' : 'New company'}</DialogTitle>
            <DialogDescription>
              {editingCompany ? `Update details for ${editingCompany.name}.` : 'Track an organization in your network.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-name">Name *</Label>
              <Input id="company-name" value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. UrbanCart" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-industry">Industry</Label>
                <Input id="company-industry" value={companyForm.industry} onChange={(e) => setCompanyForm((f) => ({ ...f, industry: e.target.value }))} placeholder="e.g. E-commerce" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-website">Website</Label>
                <Input id="company-website" value={companyForm.website} onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))} placeholder="company.com" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-address">Address</Label>
              <Input id="company-address" value={companyForm.address} onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))} placeholder="Street, city" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-notes">Notes</Label>
              <Textarea id="company-notes" rows={3} value={companyForm.notes} onChange={(e) => setCompanyForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Background, relationships…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveCompany()} disabled={saving}>{saving ? 'Saving…' : editingCompany ? 'Save changes' : 'Create company'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- delete confirm ---------- */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleting?.kind === 'company' ? 'company' : 'contact'}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” will be permanently removed. Linked deals keep their data, but the reference is lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runDelete()} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
