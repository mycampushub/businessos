import {
  BarChart3,
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  FlaskConical,
  GraduationCap,
  Landmark,
  Leaf,
  Palette,
  ShoppingCart,
  Truck,
} from 'lucide-react'

/** Single source of truth for marketing site content shared across pages. */

export const SITE = {
  name: 'OrgOS',
  legalName: 'OrgOS Technologies Ltd.',
  domain: 'orgos.dev',
  url: 'https://orgos.dev',
  tagline: 'The Organization Operating System',
  description:
    'Run your entire organization — people, projects, clients, recruitment and finance — from one connected workspace.',
  contactEmail: 'hello@orgos.dev',
  supportEmail: 'support@orgos.dev',
  salesEmail: 'sales@orgos.dev',
  phone: '+880 1700 000000',
  address: 'Level 8, Gulshan Avenue, Dhaka 1212, Bangladesh',
  founded: 2023,
  currency: 'BDT',
} as const

export const NAV_LINKS = {
  product: [
    { href: '/features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/features#modules', label: 'All modules' },
    { href: '/features#security', label: 'Security' },
  ],
  company: [
    { href: '/about', label: 'About us' },
    { href: '/contact', label: 'Contact' },
    { href: '/about#team', label: 'Team' },
    { href: '/about#story', label: 'Our story' },
  ],
  legal: [
    { href: '/privacy', label: 'Privacy policy' },
    { href: '/terms', label: 'Terms of service' },
    { href: '/pricing#refund', label: 'Refund policy' },
    { href: '/pricing#faq', label: 'Pricing FAQ' },
  ],
} as const

export const TRUSTED_BY = [
  { name: 'GreenGrocer', icon: Leaf },
  { name: 'EduPath Learning', icon: GraduationCap },
  { name: 'UrbanCart', icon: ShoppingCart },
  { name: 'Northwind Logistics', icon: Truck },
  { name: 'Meridian Labs', icon: FlaskConical },
  { name: 'DhakaFin', icon: Landmark },
  { name: 'Skyline Properties', icon: Building2 },
  { name: 'BengalCraft', icon: Palette },
] as const

export interface MarketingPlan {
  code: string
  name: string
  description: string
  priceMonthly: number
  priceYearly: number
  seatLimit: string
  projectLimit: string
  storageGb: string
  features: string[]
  highlight?: boolean
  cta: string
}

/** Mirrors the live plan catalog seeded in the platform (prisma/seed.ts). */
export const PLANS: MarketingPlan[] = [
  {
    code: 'FREE',
    name: 'Free',
    description: 'For small teams getting started',
    priceMonthly: 0,
    priceYearly: 0,
    seatLimit: '5 members',
    projectLimit: '3 projects',
    storageGb: '1 GB',
    features: ['Up to 5 members', '3 projects', 'Tasks & Kanban board', '1 GB document storage'],
    cta: 'Start for free',
  },
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'For growing teams that need structure',
    priceMonthly: 1500,
    priceYearly: 15300,
    seatLimit: '15 members',
    projectLimit: '10 projects',
    storageGb: '10 GB',
    features: [
      'Up to 15 members',
      '10 projects',
      'CRM pipeline',
      'HR & attendance',
      '10 GB document storage',
    ],
    cta: 'Start 14-day trial',
  },
  {
    code: 'GROWTH',
    name: 'Growth',
    description: 'The complete operating system for scaling orgs',
    priceMonthly: 4500,
    priceYearly: 45900,
    seatLimit: '50 members',
    projectLimit: '50 projects',
    storageGb: '50 GB',
    features: [
      'Up to 50 members',
      '50 projects',
      'Recruitment & applicant tracking',
      'Payroll & leave automation',
      'Advanced reports',
      '50 GB document storage',
    ],
    highlight: true,
    cta: 'Start 14-day trial',
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    description: 'For orgs that need governance and scale',
    priceMonthly: 9500,
    priceYearly: 96900,
    seatLimit: '200 members',
    projectLimit: '200 projects',
    storageGb: '200 GB',
    features: [
      'Up to 200 members',
      '200 projects',
      'Audit log & access governance',
      'Custom roles & module access',
      'Priority support',
      '200 GB document storage',
    ],
    cta: 'Talk to sales',
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Dedicated infrastructure and white-glove onboarding',
    priceMonthly: 25000,
    priceYearly: 255000,
    seatLimit: 'Unlimited',
    projectLimit: 'Unlimited',
    storageGb: '1 TB',
    features: [
      'Unlimited members & projects',
      'SSO & SCIM ready',
      'Dedicated success manager',
      'Custom SLA & uptime',
      '1 TB document storage',
    ],
    cta: 'Contact sales',
  },
]

/** Modules of the product, used by landing/features pages. */
export const MODULES = [
  {
    id: 'projects',
    name: 'Projects & Tasks',
    icon: 'KanbanSquare',
    blurb: 'Kanban boards, Gantt timelines, milestones and typed dependencies that actually gate execution.',
  },
  {
    id: 'crm',
    name: 'CRM & Sales',
    icon: 'Target',
    blurb: 'Companies, contacts, leads and a visual deal pipeline from first touch to won.',
  },
  {
    id: 'hr',
    name: 'HR & Attendance',
    icon: 'Users',
    blurb: 'Employee records, leave workflows, holidays and check-in tracking with org-timezone accuracy.',
  },
  {
    id: 'recruitment',
    name: 'Recruitment',
    icon: 'UserPlus',
    blurb: 'Job postings, applicant tracking and a public careers page — hiring in one flow.',
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: 'Receipt',
    blurb: 'Invoices, expenses and multi-currency books with approval trails on every transaction.',
  },
  {
    id: 'payroll',
    name: 'Payroll',
    icon: 'Banknote',
    blurb: 'One-click payroll runs with attendance, leave and adjustment-aware payslips.',
  },
  {
    id: 'documents',
    name: 'Documents',
    icon: 'FolderOpen',
    blurb: 'Real file uploads with versioning, quotas and per-project organization.',
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    icon: 'BarChart3',
    blurb: 'Cross-module dashboards, revenue analytics and exportable operational reports.',
  },
  {
    id: 'meetings',
    name: 'Meetings & Announcements',
    icon: 'CalendarClock',
    blurb: 'Shared calendars, meeting agendas and broadcast announcements that reach everyone.',
  },
] as const

export const FORMAT_ICONS = { BarChart3, CalendarClock }
