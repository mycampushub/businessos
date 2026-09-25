import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Choose a new password for your OrgOS account.',
  robots: { index: false, follow: false },
}

interface SearchParams {
  token?: string
}

/** /reset-password?token=<uuid> — reads the one-shot reset token from the URL
 *  and passes it to the client form. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token.trim() : ''
  return <ResetPasswordForm token={token} />
}
