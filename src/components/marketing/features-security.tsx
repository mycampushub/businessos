import { DatabaseBackup, FileSearch, KeyRound, Lock, ScanEye, ShieldCheck } from 'lucide-react'
import { RevealGroup, RevealItem } from './reveal'
import { Section, SectionContainer, SectionHeading } from './sections'

const CARDS = [
  {
    icon: ShieldCheck,
    title: 'Tenant isolation',
    body: 'Every workspace is a hard-isolated tenant. Your data is scoped by organization at the query level — never shared, never co-mingled, even on shared infrastructure.',
  },
  {
    icon: KeyRound,
    title: 'Role-based access',
    body: 'Six roles — OWNER, ADMIN, MANAGER, HR, FINANCE and MEMBER — with module-level permissions. People see exactly what their job requires and nothing more.',
  },
  {
    icon: ScanEye,
    title: 'TOTP two-factor auth',
    body: 'Time-based one-time passwords for every user, verified by the same authenticator apps you already use. Your keys never leave your phone.',
  },
  {
    icon: FileSearch,
    title: 'Audit logs',
    body: 'Every create, update and delete is recorded with who, what and when. Administrators can reconstruct any change without asking anyone.',
  },
  {
    icon: Lock,
    title: 'Encrypted transport',
    body: 'TLS on every request and secure, HttpOnly session cookies. Passwords are scrypt-hashed — no plaintext credentials exist anywhere.',
  },
  {
    icon: DatabaseBackup,
    title: 'Data ownership & export',
    body: 'Your data is yours. Export employees, clients, projects and files at any time — leaving is one click, not a support ticket.',
  },
] as const

/** Security & trust grid — linked from the site footer (#security). */
export function FeaturesSecurity() {
  return (
    <Section id="security" className="scroll-mt-20 bg-muted/40">
      <SectionContainer>
        <SectionHeading
          eyebrow="Security & trust"
          title="Enterprise-grade by default"
          description="The guardrails your organization expects — built into every plan, not reserved for the top tier."
        />
        <RevealGroup
          className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          stagger={0.07}
        >
          {CARDS.map((card) => (
            <RevealItem key={card.title} className="h-full">
              <div className="flex h-full flex-col rounded-xl border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5">
                <span
                  className="flex size-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10"
                  aria-hidden
                >
                  <card.icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {card.title}
                </h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {card.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionContainer>
    </Section>
  )
}
