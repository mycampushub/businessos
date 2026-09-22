import type { Metadata } from 'next'
import { SignInForm } from '@/components/auth/signin-form'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your OrgOS workspace.',
  robots: { index: false, follow: false },
}

export default function SignInPage() {
  return <SignInForm />
}
