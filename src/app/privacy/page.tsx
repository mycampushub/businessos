import type { Metadata } from 'next'
import { MarketingShell } from '@/components/marketing/shell'
import { LegalLayout, LegalSection, LegalList, LegalLi, LegalP, T } from '@/components/marketing/legal-layout'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How OrgOS Technologies Ltd. collects, uses, protects and retains your data — tenant-isolated workspaces, essential-only cookies, and no data ever sold.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
}

const UPDATED = 'September 18, 2026'

const TOC = [
  { id: 'overview', label: 'Overview & scope' },
  { id: 'collection', label: 'Information we collect' },
  { id: 'use', label: 'How we use information' },
  { id: 'legal-bases', label: 'Legal bases' },
  { id: 'cookies', label: 'Cookies & session auth' },
  { id: 'sharing', label: 'Data sharing' },
  { id: 'retention', label: 'Data retention' },
  { id: 'security', label: 'Security measures' },
  { id: 'rights', label: 'Your rights' },
  { id: 'transfers', label: 'International transfers' },
  { id: 'children', label: 'Children' },
  { id: 'changes', label: 'Changes & contact' },
]

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <LegalLayout
        title="Privacy Policy"
        updated={UPDATED}
        intro={
          <>
            This policy explains what information <T>OrgOS Technologies Ltd.</T> (&ldquo;
            <T>OrgOS</T>&rdquo;, &ldquo;<T>we</T>&rdquo;) collects when you use our website and
            the OrgOS workspace, how we use it, and the choices you have. It is written to be
            read, not just linked at the bottom of forms.
          </>
        }
        toc={TOC}
      >
        <LegalSection id="overview" number={1} title="Overview & scope">
          <LegalP>
            OrgOS Technologies Ltd. is a company registered in Dhaka, Bangladesh, with offices at{' '}
            <T>{SITE.address}</T>. We build and operate <T>OrgOS</T>, an organization operating
            system delivered as a web application at <T>orgos.dev</T>.
          </LegalP>
          <LegalP>This policy covers two things, and it helps to keep them apart:</LegalP>
          <LegalList>
            <LegalLi>
              <T>The marketing site</T> — the public pages you are reading right now. Here we
              collect very little: what you submit through the contact form and the newsletter
              form, and the minimal technical data needed to serve pages securely.
            </LegalLi>
            <LegalLi>
              <T>The OrgOS workspace</T> — the product where your organization runs projects,
              people, clients, recruitment and finance. Inside the workspace we act as a{' '}
              <T>processor</T> for your organization&apos;s data: your organization decides what
              is stored, and we host and process it on its behalf, under its instructions.
            </LegalLi>
          </LegalList>
          <LegalP>
            If you are a workspace member but not the person who created the workspace, the
            workspace owner or an administrator of your organization manages most of that data on
            your behalf. Section 9 explains how you can still exercise your rights directly with
            us.
          </LegalP>
        </LegalSection>

        <LegalSection id="collection" number={2} title="Information we collect">
          <LegalP>We collect five categories of information. Only the first is ever optional.</LegalP>
          <LegalList>
            <LegalLi>
              <T>Account information.</T> When you sign up we store your name, email address, a
              hashed password (never the password itself), your role, and the details of the
              workspace you create or join — its name, subscription plan and organization
              timezone. If you enable two-factor authentication, we store a TOTP secret
              associated with your account.
            </LegalLi>
            <LegalLi>
              <T>Organization content.</T> Everything your team creates or uploads in the
              workspace: projects, tasks and comments; CRM companies, contacts and deals; employee
              records; attendance and leave; job postings and applications; payroll runs and
              payslips; invoices and expenses; announcements; and the files and documents you
              upload, up to your plan&apos;s storage quota. This data belongs to your
              organization, and we process it only to provide the service.
            </LegalLi>
            <LegalLi>
              <T>Usage and audit information.</T> Records of sign-ins (time, IP address, user
              agent), actions taken in the workspace (who changed what, when), and aggregate,
              non-personal telemetry such as error rates and feature usage counts that we use to
              keep the service reliable.
            </LegalLi>
            <LegalLi>
              <T>Contact and newsletter submissions.</T> The name, email, company, topic and
              message you send through our contact form, and the email address you give our
              newsletter form. Each contact submission receives a reference code so nothing gets
              lost between us and you.
            </LegalLi>
            <LegalLi>
              <T>Cookies for session authentication.</T> Strictly essential cookies that keep you
              signed in and remember which of your workspaces is active. Nothing else — see
              Section 5.
            </LegalLi>
          </LegalList>
          <LegalP>
            We do not ask for, and do not want, your national ID, credit card numbers or any
            special-category personal data beyond what payroll law requires your own organization
            to keep about its employees. Payroll data exists in the workspace only because your
            organization — the data controller — puts it there.
          </LegalP>
        </LegalSection>

        <LegalSection id="use" number={3} title="How we use information">
          <LegalP>We use the information above only to:</LegalP>
          <LegalList>
            <LegalLi>
              <T>Provide the service</T> — authenticate you, route you to your workspace, enforce
              your plan&apos;s member, project and storage limits, and deliver the modules you use.
            </LegalLi>
            <LegalLi>
              <T>Bill you correctly</T> — match your bKash, Nagad or bank transfer to your
              workspace using the payment reference code, activate your plan once payment is
              confirmed, and keep renewal records.
            </LegalLi>
            <LegalLi>
              <T>Keep the service secure and available</T> — detect abuse and intrusion attempts,
              enforce rate limits, debug failures, and maintain the 99.98%-class uptime our
              customers rely on.
            </LegalLi>
            <LegalLi>
              <T>Support you</T> — answer your contact-form messages, investigate support tickets,
              and (for workspace administrators) send service notifications such as planned
              maintenance and payroll reminders.
            </LegalLi>
            <LegalLi>
              <T>Improve the product</T> — in aggregate only: which modules are used, where errors
              occur, how quickly pages load. We do not analyze the business content of your
              workspace to profile you or sell anything.
            </LegalLi>
            <LegalLi>
              <T>Meet legal obligations</T> — respond to lawful requests, keep records we are
              required to keep, and enforce these terms.
            </LegalLi>
          </LegalList>
          <LegalP>
            We do not use your organization&apos;s business content to train machine-learning
            models, and we do not show advertisements — on the marketing site or inside the
            workspace.
          </LegalP>
        </LegalSection>

        <LegalSection id="legal-bases" number={4} title="Legal bases">
          <LegalP>
            Where data protection law requires a legal basis, ours are these, in plain language:
          </LegalP>
          <LegalList>
            <LegalLi>
              <T>Performance of a contract</T> — your account, workspace and subscription. We
              cannot run the service for you without knowing who you are and what is in your
              workspace.
            </LegalLi>
            <LegalLi>
              <T>Legitimate interests</T> — security, fraud and abuse prevention, audit logging,
              aggregate product analytics, and keeping records of our own business operations.
            </LegalLi>
            <LegalLi>
              <T>Consent</T> — newsletter emails (unsubscribe anytime with one click) and
              non-essential communications. Marketing site cookies are essential-only, so no
              consent banner is needed — there is nothing to consent to.
            </LegalLi>
            <LegalLi>
              <T>Legal obligation</T> — tax and accounting records for payments we receive, and
              disclosures required by law.
            </LegalLi>
          </LegalList>
          <LegalP>
            When we process your organization&apos;s content inside the workspace, we do so as a
            processor acting on the instructions of whoever controls that data — normally your
            organization&apos;s owner or administrators.
          </LegalP>
        </LegalSection>

        <LegalSection id="cookies" number={5} title="Cookies & session auth">
          <LegalP>
            We set exactly two cookies, and both exist only to keep you signed in:
          </LegalP>
          <LegalList>
            <LegalLi>
              <T>orgos_session</T> — your session token, which keeps you authenticated. It is
              marked <T>HttpOnly</T> and <T>Secure</T>, so JavaScript on a page cannot read it and
              it is only ever sent over an encrypted connection.
            </LegalLi>
            <LegalLi>
              <T>orgos_org</T> — remembers which of your workspaces is currently active, so you
              land where you left off.
            </LegalLi>
          </LegalList>
          <LegalP>
            That is the entire list. We do not use advertising cookies, cross-site trackers,
            fingerprinting or third-party analytics on this site or in the product. If you clear
            your cookies you are simply signed out; nothing else changes.
          </LegalP>
        </LegalSection>

        <LegalSection id="sharing" number={6} title="Data sharing">
          <LegalP>
            <T>We do not sell your personal information. Not to anyone, not for any price.</T> We
            share it only in these limited situations:
          </LegalP>
          <LegalList>
            <LegalLi>
              <T>Payment confirmation.</T> Payments in Bangladesh run through bKash, Nagad and
              direct bank transfer. We share only the amount, your workspace reference code and
              the payment reference needed to match the transfer to your account. We never
              receive or store full card numbers.
            </LegalLi>
            <LegalLi>
              <T>Infrastructure providers.</T> The servers, database and file storage that run
              OrgOS are operated under contract by infrastructure providers who may process or
              store data on our behalf. They are bound to use it only to provide us the service.
            </LegalLi>
            <LegalLi>
              <T>Legal requirements.</T> If we receive a valid legal order or are otherwise
              legally compelled, we may need to disclose information. We notify affected customers
              where the law allows.
            </LegalLi>
            <LegalLi>
              <T>Business changes.</T> If OrgOS Technologies is reorganized, merged or acquired,
              customer data may transfer as part of that transaction — with the same protections
              it has today.
            </LegalLi>
          </LegalList>
          <LegalP>
            Every provider that can touch customer data operates under a written processing
            agreement with us, and our support staff can access workspace data only when
            troubleshooting an issue you have reported, using individually attributable accounts.
          </LegalP>
        </LegalSection>

        <LegalSection id="retention" number={7} title="Data retention">
          <LegalP>How long we keep things — and why:</LegalP>
          <LegalList>
            <LegalLi>
              <T>Workspace content</T> is kept for as long as your organization exists on OrgOS.
              When an administrator deletes an item, it is removed from the application. When a
              workspace is terminated, content is kept for a <T>30-day export window</T> and then
              deleted.
            </LegalLi>
            <LegalLi>
              <T>Backups</T> roll on a cycle of <T>30 days or less</T>, so deleted content fully
              disappears from every system within that window.
            </LegalLi>
            <LegalLi>
              <T>Audit logs</T> (records of who did what in the workspace) are kept for{' '}
              <T>12 months</T>, because investigating an incident six months later is a real
              thing organizations need to do.
            </LegalLi>
            <LegalLi>
              <T>Contact-form messages</T> are kept for up to 24 months so we can maintain
              continuity when you come back with a follow-up question.
            </LegalLi>
            <LegalLi>
              <T>Newsletter subscriptions</T> are kept until you unsubscribe — then removed from
              active lists immediately.
            </LegalLi>
            <LegalLi>
              <T>Billing records</T> (amounts, dates, references) are kept for the period required
              by Bangladeshi tax and accounting law.
            </LegalLi>
          </LegalList>
        </LegalSection>

        <LegalSection id="security" number={8} title="Security measures">
          <LegalP>
            No system is perfectly secure, and anyone who tells you otherwise is selling
            something. Here is concretely what we do:
          </LegalP>
          <LegalList>
            <LegalLi>
              <T>Tenant isolation.</T> Every query in the product is scoped to your workspace. One
              organization cannot read another&apos;s data — not by accident, not by guessing IDs.
            </LegalLi>
            <LegalLi>
              <T>Role-based access control.</T> Inside a workspace, who sees what is governed by
              roles and per-module permissions set by your own administrators.
            </LegalLi>
            <LegalLi>
              <T>TOTP two-factor authentication</T> available on every account, using standard
              authenticator apps — no SMS middleman.
            </LegalLi>
            <LegalLi>
              <T>Passwords are hashed with scrypt</T> and a per-user salt. We can never see or
              recover your password.
            </LegalLi>
            <LegalLi>
              <T>Encryption in transit</T> (TLS) for every request, and session cookies that are
              HttpOnly, Secure and inaccessible to page JavaScript.
            </LegalLi>
            <LegalLi>
              <T>Rate limiting and audit logging</T> on authentication and public forms, to blunt
              credential-stuffing and spam before they matter.
            </LegalLi>
            <LegalLi>
              <T>Least-privilege operations.</T> Production access is individually attributable,
              logged, and granted only to engineers who need it for a specific task.
            </LegalLi>
          </LegalList>
          <LegalP>
            If a security incident ever affects your data, we will tell affected customers what
            happened and what we are doing about it — promptly and in plain language.
          </LegalP>
        </LegalSection>

        <LegalSection id="rights" number={9} title="Your rights">
          <LegalP>
            Whatever law calls them, you effectively have these rights over your personal
            information:
          </LegalP>
          <LegalList>
            <LegalLi>
              <T>Access</T> — ask what we hold about you.
            </LegalLi>
            <LegalLi>
              <T>Export</T> — get your data in a usable format. Much of this is self-service:
              workspace administrators can export projects, people, CRM and finance data to
              CSV/JSON from inside the product, anytime.
            </LegalLi>
            <LegalLi>
              <T>Correction</T> — fix what is wrong. Most profile fields you can edit yourself.
            </LegalLi>
            <LegalLi>
              <T>Deletion</T> — remove your account and personal data, subject to the retention
              duties above (for example, billing records).
            </LegalLi>
            <LegalLi>
              <T>Objection and withdrawal</T> — object to processing based on legitimate
              interests, or withdraw consent (for example, newsletter) at any time.
            </LegalLi>
          </LegalList>
          <LegalP>
            To exercise any of these, email <T>privacy@orgos.dev</T> from the address on your
            account, or ask your workspace administrator for organization-wide requests. We
            respond within <T>30 days</T>, usually much faster. We will never require you to buy
            something, call a premium number or mail a form to exercise a right.
          </LegalP>
        </LegalSection>

        <LegalSection id="transfers" number={10} title="International transfers">
          <LegalP>
            OrgOS Technologies Ltd. is incorporated in Bangladesh and our team works from Dhaka,
            but the infrastructure that runs OrgOS — servers, databases, file storage — may be
            operated by providers that process or store data in data centers outside Bangladesh.
          </LegalP>
          <LegalP>
            By using OrgOS you consent to this. We limit the exposure: transfers occur only to
            providers bound by contractual data-protection commitments, data is encrypted in
            transit, and we keep the list of providers and locations as short as the service
            allows.
          </LegalP>
        </LegalSection>

        <LegalSection id="children" number={11} title="Children">
          <LegalP>
            OrgOS is a business tool and is not directed at children. You must be at least{' '}
            <T>16 years old</T> to create an account or use the service, and we do not knowingly
            collect personal information from anyone under 16. If we learn that we have, we delete
            it. If you believe a child has given us personal information, tell us at{' '}
            <T>privacy@orgos.dev</T>.
          </LegalP>
        </LegalSection>

        <LegalSection id="changes" number={12} title="Changes & contact">
          <LegalP>
            We may update this policy as the product or the law changes. The &ldquo;last
            updated&rdquo; date at the top always reflects the current version, and material
            changes will be announced to affected customers — by email or in-app notice — at
            least 14 days before they take effect. Old versions are available on request.
          </LegalP>
          <LegalP>Questions, requests or complaints about privacy:</LegalP>
          <LegalList>
            <LegalLi>
              Email <T>privacy@orgos.dev</T> — for privacy requests, this address is best.
            </LegalLi>
            <LegalLi>
              Post: <T>OrgOS Technologies Ltd., {SITE.address}</T>.
            </LegalLi>
            <LegalLi>
              General contact: <T>{SITE.contactEmail}</T> · {SITE.phone}.
            </LegalLi>
          </LegalList>
        </LegalSection>
      </LegalLayout>
    </MarketingShell>
  )
}
