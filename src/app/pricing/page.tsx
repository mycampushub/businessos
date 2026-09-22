import type { Metadata } from 'next'
import { MarketingShell } from '@/components/marketing/shell'
import { PricingHero } from '@/components/marketing/pricing-hero'
import { PricingPlans } from '@/components/marketing/pricing-plans'
import { PaymentMethodsBand, RefundPolicy } from '@/components/marketing/pricing-extras'
import { PricingComparisonTable } from '@/components/marketing/pricing-table'
import { Faq } from '@/components/marketing/faq'
import { CtaBanner } from '@/components/marketing/cta'
import { Section, SectionContainer, SectionHeading } from '@/components/marketing/sections'
import { Reveal } from '@/components/marketing/reveal'
import { PLANS, SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'OrgOS pricing in BDT — plans from ৳0. Start free forever, upgrade from ৳1,500/month, save 15% yearly. Pay via bKash, Nagad or bank transfer, cancel anytime.',
  alternates: { canonical: '/pricing' },
  keywords: [
    'OrgOS pricing',
    'SaaS pricing Bangladesh',
    'enterprise software price',
    'bKash payment',
    'Nagad payment',
    'BDT pricing',
  ],
}

const PRICING_FAQ = [
  {
    question: 'What happens when my 14-day trial ends?',
    answer:
      'Nothing disappears. Your workspace automatically moves to the Free plan — same data, same people — and you can pick a paid plan whenever you are ready. No card was ever charged, so there is nothing to cancel.',
  },
  {
    question: 'Can I change plans later?',
    answer:
      'Yes, any time. Request an upgrade or downgrade from Billing & Plan inside your workspace. Upgrades activate the same working day once payment is confirmed; downgrades apply at the end of your current period.',
  },
  {
    question: 'How do yearly discounts work?',
    answer:
      'Pay for twelve months up front and save 15%. Starter, for example, works out to ৳1,275 a month instead of ৳1,500 — ৳15,300 billed once via bKash, Nagad or bank transfer.',
  },
  {
    question: 'How do I pay via bKash or Nagad?',
    answer:
      'Request the upgrade from Billing & Plan in your workspace and you will receive a payment reference (REQ-xxxx). Send the amount via bKash or Nagad to 01700-000000 with that reference, and our team activates your plan the same working day.',
  },
  {
    question: 'Is there really a free plan?',
    answer:
      'Yes — Free is free forever, not a trial in disguise. Up to 5 members, 3 projects, the full Kanban board and 1 GB of document storage. No credit card is required at any point.',
  },
  {
    question: 'What counts as a member?',
    answer:
      'A member is anyone with an active membership in your workspace. When someone leaves, deactivate their membership — deactivated members do not count against your seat limit.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Monthly plans simply stop renewing at the end of the paid month. Yearly plans are pro-rated — if you downgrade mid-term, the unused months are credited toward your final invoice.',
  },
  {
    question: 'Do you offer discounts for nonprofits or education?',
    answer:
      'We do. Registered nonprofits and educational institutions get a meaningful discount on Growth and Business plans — write to sales@orgos.dev from your official address and we will sort it out quickly.',
  },
]

const JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: SITE.description,
    featureList:
      'Projects & tasks, CRM pipeline, HR & attendance, recruitment ATS, payroll, invoices & expenses, documents, reports, meetings & announcements',
    offers: {
      '@type': 'AggregateOffer',
      name: `${SITE.name} plans`,
      priceCurrency: 'BDT',
      lowPrice: 0,
      highPrice: 25000,
      offerCount: PLANS.length,
      offers: PLANS.map((p) => ({
        '@type': 'Offer',
        name: `${SITE.name} ${p.name} plan`,
        price: String(p.priceMonthly),
        priceCurrency: 'BDT',
        description: `${p.description} — ৳${p.priceMonthly.toLocaleString('en-US')}/month, or ৳${p.priceYearly.toLocaleString('en-US')}/year.`,
      })),
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: PRICING_FAQ.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  },
]

export default function PricingPage() {
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

      <PricingHero />
      <PricingPlans />
      <PaymentMethodsBand />
      <PricingComparisonTable />
      <RefundPolicy />

      <Section id="faq" className="scroll-mt-20 pt-0 sm:pt-0 lg:pt-0">
        <SectionContainer className="max-w-4xl">
          <SectionHeading
            eyebrow="FAQ"
            title="Pricing questions, answered"
            description="The things teams ask before they commit. Anything else — sales@orgos.dev is one message away."
          />
          <Reveal className="mt-10">
            <Faq items={PRICING_FAQ} />
          </Reveal>
        </SectionContainer>
      </Section>

      <CtaBanner
        title="Start free. Upgrade when it clicks."
        description="Create a workspace in minutes — every paid feature is free for 14 days, and the Free plan is forever."
        primaryLabel="Start your free trial"
        primaryHref="/signup"
        secondaryLabel="Talk to sales"
        secondaryHref="/contact"
      />
    </MarketingShell>
  )
}
