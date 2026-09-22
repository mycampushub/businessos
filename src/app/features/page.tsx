import type { Metadata } from 'next'
import { MarketingShell } from '@/components/marketing/shell'
import { FeaturesHero } from '@/components/marketing/features-hero'
import { FeaturesModules } from '@/components/marketing/features-modules'
import { FeaturesSecurity } from '@/components/marketing/features-security'
import { FeaturesExtras } from '@/components/marketing/features-extras'
import { CtaBanner } from '@/components/marketing/cta'

export const metadata: Metadata = {
  title: 'Product',
  description:
    'Explore all nine OrgOS modules — projects, CRM, HR & attendance, recruitment, payroll, finance, documents, reports — in one enterprise SaaS workspace. BDT pricing.',
  alternates: { canonical: '/features' },
  keywords: [
    'OrgOS features',
    'project management modules',
    'CRM pipeline software',
    'HRMS attendance',
    'recruitment ATS',
    'payroll software Bangladesh',
    'enterprise SaaS modules',
  ],
}

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <FeaturesHero />
      <FeaturesModules />
      <FeaturesSecurity />
      <FeaturesExtras />
      <CtaBanner
        title="See it with your own data"
        description="Spin up a workspace and try every module free for 14 days — projects, people, payroll and all."
        primaryLabel="Start your free trial"
        secondaryLabel="See pricing"
        secondaryHref="/pricing"
      />
    </MarketingShell>
  )
}
