import type { Metadata } from 'next'
import { MarketingShell } from '@/components/marketing/shell'
import { Hero } from '@/components/marketing/hero'
import { LogoCloud } from '@/components/marketing/logo-cloud'
import { StatsBand } from '@/components/marketing/stats-band'
import { ModuleBento } from '@/components/marketing/module-bento'
import { FeatureRows } from '@/components/marketing/feature-rows'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { Testimonials } from '@/components/marketing/testimonials'
import { PricingTeaser } from '@/components/marketing/pricing-teaser'
import { Faq } from '@/components/marketing/faq'
import { CtaBanner } from '@/components/marketing/cta'
import { Section, SectionContainer, SectionHeading } from '@/components/marketing/sections'
import { Reveal } from '@/components/marketing/reveal'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description:
    'Run your entire organization — people, projects, clients, recruitment and finance — from one connected enterprise SaaS workspace. Free 14-day trial, pricing in BDT.',
  alternates: { canonical: '/' },
}

const LANDING_FAQ = [
  {
    question: 'What exactly is OrgOS?',
    answer:
      'OrgOS is an organization operating system: one SaaS workspace where projects & tasks, CRM, HR & attendance, recruitment, payroll, documents, meetings and finance share the same people, permissions and data. Instead of gluing together five tools, you run everything in one place.',
  },
  {
    question: 'How does the 14-day free trial work?',
    answer:
      'Create a workspace and every paid plan feature is unlocked for 14 days — no credit card required. When the trial ends you can move to the free plan or pick a paid plan. Your data stays exactly where it is.',
  },
  {
    question: 'Is there a free plan?',
    answer:
      'Yes — the Free plan is free forever with up to 5 members, 3 projects, the task board and 1 GB of document storage. It is a real plan, not a demo that expires.',
  },
  {
    question: 'How do payments work in Bangladesh?',
    answer:
      'All pricing is in Taka (BDT). You can pay monthly or yearly via bKash, Nagad or bank transfer. Yearly billing saves you 15%. Request an upgrade from your workspace and our team activates it the same working day.',
  },
  {
    question: 'Can I bring my existing data?',
    answer:
      'Yes. Import clients, employees and tasks from CSV or copy-paste directly into the workspace. Your onboarding checklist walks you through it step by step.',
  },
  {
    question: 'Is my organization’s data secure?',
    answer:
      'Every workspace is tenant-isolated with role-based access control, encrypted transport, audit logging and optional two-factor authentication for every user. You control who sees what, module by module.',
  },
]

const JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.legalName,
    alternateName: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/logo.svg`,
    foundingDate: String(SITE.founded),
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Dhaka',
      addressCountry: 'BD',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: SITE.contactEmail,
      contactType: 'customer support',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: SITE.description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'BDT',
      description: 'Free plan with up to 5 members; paid plans from ৳1,500/month.',
    },
    featureList: 'Projects, CRM, HR & attendance, recruitment, payroll, finance, documents, reports',
  },
]

export default function LandingPage() {
  return (
    <MarketingShell>
      {/* Structured data for rich search results */}
      {JSON_LD.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}

      <Hero />
      <LogoCloud />
      <StatsBand />
      <ModuleBento />
      <FeatureRows />
      <HowItWorks />
      <Testimonials />
      <PricingTeaser />

      <Section className="pb-0 sm:pb-0 lg:pb-0">
        <SectionContainer className="max-w-4xl">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions, answered"
            description="Everything teams usually ask before they start. Anything else — we are one message away."
          />
          <Reveal className="mt-10">
            <Faq items={LANDING_FAQ} />
          </Reveal>
        </SectionContainer>
      </Section>

      <CtaBanner />
    </MarketingShell>
  )
}
