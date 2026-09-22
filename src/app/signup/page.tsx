import type { Metadata } from 'next'
import { SignUpForm } from '@/components/auth/signup-form'

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a free OrgOS account and set up your organization workspace in minutes.',
  robots: { index: false, follow: false },
}

export default function SignUpPage() {
  return <SignUpForm />
}
