import type { Metadata } from 'next'
import { MarketingShell } from '@/components/marketing/shell'
import { LegalLayout, LegalSection, LegalList, LegalLi, LegalP, T } from '@/components/marketing/legal-layout'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The agreement between you and OrgOS Technologies Ltd. — accounts, trials, BDT billing via bKash/Nagad/bank transfer, refunds, data ownership, liability and Bangladeshi governing law.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
}

const UPDATED = 'September 18, 2026'

const TOC = [
  { id: 'acceptance', label: 'Agreement & acceptance' },
  { id: 'definitions', label: 'Definitions' },
  { id: 'accounts', label: 'Accounts & workspaces' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'subscriptions', label: 'Subscriptions & trials' },
  { id: 'billing', label: 'Billing & payment' },
  { id: 'refunds', label: 'Refunds & downgrades' },
  { id: 'availability', label: 'Service availability' },
  { id: 'customer-data', label: 'Customer data & IP' },
  { id: 'our-ip', label: 'Our intellectual property' },
  { id: 'confidentiality', label: 'Confidentiality' },
  { id: 'warranties', label: 'Warranties disclaimer' },
  { id: 'liability', label: 'Liability limits' },
  { id: 'termination', label: 'Termination' },
  { id: 'governing-law', label: 'Governing law' },
  { id: 'changes', label: 'Changes to these terms' },
  { id: 'contact', label: 'Contact' },
]

export default function TermsPage() {
  return (
    <MarketingShell>
      <LegalLayout
        title="Terms of Service"
        updated={UPDATED}
        intro={
          <>
            These terms are the agreement between you and <T>OrgOS Technologies Ltd.</T> for using
            the OrgOS service. They favor clarity over legalese — everything here is enforceable,
            but you should be able to read it in one sitting.
          </>
        }
        toc={TOC}
      >
        <LegalSection id="acceptance" number={1} title="Agreement & acceptance">
          <LegalP>
            This agreement is between <T>OrgOS Technologies Ltd.</T>, a company registered in
            Dhaka, Bangladesh (&ldquo;<T>OrgOS</T>&rdquo;, &ldquo;<T>we</T>&rdquo;,
            &ldquo;<T>us</T>&rdquo;), and the customer who creates or administers an OrgOS
            workspace (&ldquo;<T>you</T>&rdquo;). By creating a workspace, subscribing to a plan,
            or otherwise using the service at <T>orgos.dev</T>, you accept these terms on behalf
            of yourself and the organization you represent.
          </LegalP>
          <LegalP>
            If you accept on behalf of an organization, you confirm you have the authority to bind
            it. If you use OrgOS as an invited member of someone else&apos;s workspace, these
            terms still apply to your use, and the workspace owner&apos;s instructions govern the
            workspace&apos;s data.
          </LegalP>
        </LegalSection>

        <LegalSection id="definitions" number={2} title="Definitions">
          <LegalList>
            <LegalLi>
              <T>Service</T> — the OrgOS web application, API and related services we operate at
              orgos.dev.
            </LegalLi>
            <LegalLi>
              <T>Workspace</T> — a tenant-isolated organization environment inside the Service,
              with its own members, data and subscription.
            </LegalLi>
            <LegalLi>
              <T>Customer Data</T> — all data your organization stores in or sends to the Service:
              projects, tasks, CRM records, employee and payroll records, files, and everything
              else you create or upload.
            </LegalLi>
            <LegalLi>
              <T>Owner</T> — the user who created the workspace (or a successor they appointed).
            </LegalLi>
            <LegalLi>
              <T>Plan</T> — a subscription tier (Free, Starter, Growth, Business or Enterprise)
              with defined limits on members, projects and storage.
            </LegalLi>
            <LegalLi>
              <T>Billing Reference Code</T> — the unique code we issue for each invoice so your
              bKash, Nagad or bank transfer can be matched to your workspace automatically.
            </LegalLi>
          </LegalList>
        </LegalSection>

        <LegalSection id="accounts" number={3} title="Accounts & workspaces">
          <LegalP>
            You must provide accurate and complete information when creating an account — a real
            name and a working email you check. You are responsible for keeping your credentials
            secure; we strongly recommend enabling <T>TOTP two-factor authentication</T>, which is
            available on every account at no cost.
          </LegalP>
          <LegalP>
            The <T>Owner</T> is responsible for their workspace: for who is invited as a member,
            for the roles and module permissions granted, and for how members use the Service. If
            an employee, contractor or agent misuses the workspace under your invite, that is your
            organization&apos;s misuse in these terms.
          </LegalP>
          <LegalP>
            You must tell us promptly at <T>{SITE.supportEmail}</T> if you suspect unauthorized
            access to your account. We may suspend an account that is compromised while we work
            with you to restore it.
          </LegalP>
        </LegalSection>

        <LegalSection id="acceptable-use" number={4} title="Acceptable use">
          <LegalP>You may use OrgOS only for lawful business purposes. Specifically, you must not:</LegalP>
          <LegalList>
            <LegalLi>
              store, share or process unlawful content, or content that infringes another
              person&apos;s rights — including pirated material or personal data you have no
              lawful basis to hold;
            </LegalLi>
            <LegalLi>
              scrape, crawl or harvest the Service or other customers&apos; data, or attempt to
              access any workspace other than your own (including by guessing or enumerating IDs —
              our tenant isolation will stop you, and we will too);
            </LegalLi>
            <LegalLi>
              reverse engineer, decompile or attempt to extract the source code of the Service,
              except where such restriction is prohibited by applicable law;
            </LegalLi>
            <LegalLi>
              resell, sublicense or provide the Service to third parties as if it were your own
              product, or run a service bureau on top of a plan without our written agreement;
            </LegalLi>
            <LegalLi>
              interfere with the Service&apos;s operation — probing, load-testing or attacking
              infrastructure, or circumventing rate limits and plan caps;
            </LegalLi>
            <LegalLi>
              upload malware, or use the file storage to distribute malicious code.
            </LegalLi>
          </LegalList>
          <LegalP>
            We may investigate suspected violations and suspend a workspace where there is a
            credible risk to other customers, the Service or the law. Where feasible, we notify the
            Owner first and work to resolve it without disruption.
          </LegalP>
        </LegalSection>

        <LegalSection id="subscriptions" number={5} title="Subscriptions & trials">
          <LegalP>
            Paid plans start with a <T>14-day free trial</T>: every feature of the plan you chose,
            unlocked, with no credit card required. One trial per organization. When the trial
            ends, your workspace does not lock — it moves to the <T>Free plan (free forever, up to
            5 members)</T> unless you choose a paid plan, and your data stays exactly where it is.
          </LegalP>
          <LegalP>
            Plan limits — members, projects and document storage — are enforced automatically and
            transparently by the system, not negotiated by email. Adding members or projects
            beyond your plan&apos;s limits requires an upgrade; existing data is never deleted
            when you hit a cap, you simply cannot add more.
          </LegalP>
          <LegalP>
            Plan features and limits are published on our pricing page and may change as the
            product evolves. Changes never reduce limits you have already paid for within a
            running subscription period.
          </LegalP>
        </LegalSection>

        <LegalSection id="billing" number={6} title="Billing & payment">
          <LegalP>
            All prices are in <T>BDT (Taka)</T> and are exclusive of any applicable VAT or
            withholding, which you are responsible for where the law says so. Plans bill monthly
            or yearly; <T>yearly billing saves 15%</T> compared with twelve monthly payments.
          </LegalP>
          <LegalP>
            Because Bangladeshi card rails remain unreliable for subscriptions, payments are
            collected manually: when you request an upgrade, we issue an invoice with a{' '}
            <T>Billing Reference Code</T>, and you pay by <T>bKash, Nagad or bank transfer</T>{' '}
            quoting that code. Your plan activates as soon as payment is confirmed — normally the{' '}
            <T>same working day</T>, and we will tell you if it will take longer.
          </LegalP>
          <LegalP>
            Monthly plans renew at the end of each billing period; yearly plans renew annually.
            We will issue the renewal invoice before the renewal date. If payment is not received
            within 7 days of the renewal date, paid features pause (your data is untouched) until
            payment lands.
          </LegalP>
          <LegalP>
            You are responsible for payment accuracy: use the reference code, keep transfer
            receipts, and tell us about misapplied payments at <T>{SITE.supportEmail}</T>.
          </LegalP>
        </LegalSection>

        <LegalSection id="refunds" number={7} title="Refunds & downgrades">
          <LegalP>
            If a paid plan is not right for you, tell us within <T>7 days</T> of a monthly payment
            and we will refund it in full, provided the plan has not been substantially used in
            that period. For <T>yearly plans</T>, refunds are <T>pro-rated</T>: we refund the
            remaining full months of the subscription.
          </LegalP>
          <LegalP>
            Downgrading to a smaller plan (or to Free) takes effect at the end of the current
            billing period — you keep what you paid for until then. Refunds are returned through
            the original payment channel (bKash, Nagad or bank account) and may take a few working
            days to appear.
          </LegalP>
          <LegalP>
            We would rather lose a subscription than keep money from an unhappy customer. Email{' '}
            <T>{SITE.supportEmail}</T> and we will sort it out.
          </LegalP>
        </LegalSection>

        <LegalSection id="availability" number={8} title="Service availability">
          <LegalP>
            We target <T>99.9% monthly uptime</T>, measured excluding scheduled maintenance — and
            we have been running above that for the past twelve months. Status incidents are
            communicated to workspace owners by email and in-app notice.
          </LegalP>
          <LegalP>
            We perform <T>scheduled maintenance</T>, usually outside Bangladesh business hours,
            and announce it at least <T>48 hours in advance</T> inside the product. Emergency
            maintenance to fix a security or availability issue may happen immediately; we do it
            when the risk of waiting exceeds the disruption.
          </LegalP>
          <LegalP>
            Enterprise customers may have a custom SLA with separate uptime commitments and
            remedies; where signed, that SLA prevails over this section.
          </LegalP>
        </LegalSection>

        <LegalSection id="customer-data" number={9} title="Customer data & IP">
          <LegalP>
            <T>Your data is yours.</T> As between you and us, you own all Customer Data and retain
            every right in it. We claim no ownership of, and acquire no license beyond this
            section to, your projects, employee records, client lists, files or anything else you
            put in the Service.
          </LegalP>
          <LegalP>
            To operate the Service, you grant us a <T>limited, non-exclusive license</T> to host,
            copy, process, transmit and display Customer Data — solely as needed to provide the
            Service, keep it secure and support you. That license ends when your data is deleted
            from the Service and its backups.
          </LegalP>
          <LegalP>
            You can <T>export</T> your data — projects, tasks, people, CRM and finance records as
            CSV/JSON — at any time while your account is active, without a fee and without our
            involvement. We do not mine Customer Data for advertising, and we do not use it to
            train machine-learning models.
          </LegalP>
        </LegalSection>

        <LegalSection id="our-ip" number={10} title="Our intellectual property">
          <LegalP>
            The Service itself — the OrgOS software, code, databases, interface design, logo and
            brand names — is owned by OrgOS Technologies Ltd. and protected by intellectual
            property law. These terms give you a <T>right to use</T> the Service, not a license to
            its parts.
          </LegalP>
          <LegalP>
            You may not remove or obscure our branding in the interface, or use the OrgOS name or
            marks to imply partnership or endorsement without written permission. Feedback you
            send us may be used to improve the Service without restriction or attribution.
          </LegalP>
        </LegalSection>

        <LegalSection id="confidentiality" number={11} title="Confidentiality">
          <LegalP>
            Each party will protect the other&apos;s <T>Confidential Information</T> — information
            disclosed under these terms that is marked confidential or would reasonably be
            understood as confidential — with at least the care it uses for its own, and use it
            only for purposes of this agreement.
          </LegalP>
          <LegalP>
            Your Customer Data is our Confidential Information. Ours includes source code,
            infrastructure details and unreleased product plans. The usual exceptions apply:
            information already public, independently developed, or required to be disclosed by
            law or court order (with prompt notice where lawful).
          </LegalP>
        </LegalSection>

        <LegalSection id="warranties" number={12} title="Warranties disclaimer">
          <LegalP>
            The Service is provided <T>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</T>. To
            the fullest extent permitted by Bangladeshi law, we disclaim warranties of
            merchantability, fitness for a particular purpose and non-infringement, and any
            warranty that the Service will be uninterrupted or error-free.
          </LegalP>
          <LegalP>
            We work hard on uptime and correctness — Section 8 says what we commit to — but no
            software is perfect, and you are responsible for maintaining your own copies of
            business-critical records (which the export tools make easy). Payroll, tax and legal
            calculations inside the Service are aids, not professional advice; verify figures that
            matter before you file them.
          </LegalP>
        </LegalSection>

        <LegalSection id="liability" number={13} title="Liability limits">
          <LegalP>
            Neither party is liable to the other for indirect, incidental, special or
            consequential damages, or for lost profits, revenue or data, even if advised of the
            possibility.
          </LegalP>
          <LegalP>
            Our total aggregate liability under these terms is limited to{' '}
            <T>the fees you paid us in the 12 months before the event</T> giving rise to the
            claim. This cap does not limit liability for death or personal injury caused by
            negligence, fraud, or anything else that cannot be limited under applicable law —
            including, on your side, your obligation to pay for the Service.
          </LegalP>
        </LegalSection>

        <LegalSection id="termination" number={14} title="Termination">
          <LegalP>
            You may <T>cancel</T> your subscription or delete your workspace at any time, from the
            workspace settings, without notice periods or early-termination fees. Cancellation
            stops future billing; the current period runs its course.
          </LegalP>
          <LegalP>
            We may suspend or terminate a workspace for material breach of these terms —
            including non-payment beyond the 7-day grace period or violations of Section 4 —
            giving notice where feasible, and a reasonable window to fix what is fixable.
          </LegalP>
          <LegalP>
            After termination you have a <T>30-day export window</T>: your data stays readable and
            exportable while your account can sign in. After that window, workspace content is
            deleted from production, with residual copies purged from backups within 30 days.
            Billing and audit records are retained per Sections 6 and 7 of our Privacy Policy.
          </LegalP>
        </LegalSection>

        <LegalSection id="governing-law" number={15} title="Governing law">
          <LegalP>
            These terms are governed by the laws of the <T>People&apos;s Republic of
            Bangladesh</T>, without regard to conflict-of-law rules. Any dispute arising out of or
            relating to these terms or the Service falls under the exclusive jurisdiction of the
            courts of <T>Dhaka, Bangladesh</T>.
          </LegalP>
          <LegalP>
            Before filing anything, we ask one thing: email <T>legal@orgos.dev</T> and give us 30
            days to work it out with you directly. Almost everything is fixable by conversation.
          </LegalP>
        </LegalSection>

        <LegalSection id="changes" number={16} title="Changes to these terms">
          <LegalP>
            We may update these terms as the Service and the law evolve. The &ldquo;last
            updated&rdquo; date above always reflects the current version. Material changes will
            be announced to workspace owners — by email or in-app notice — at least{' '}
            <T>14 days before they take effect</T>.
          </LegalP>
          <LegalP>
            Continuing to use the Service after a change takes effect means you accept the updated
            terms. If a change is unacceptable to you, you may cancel at any time — and, if the
            change arrives mid-subscription, Sections 7 and 14 apply.
          </LegalP>
        </LegalSection>

        <LegalSection id="contact" number={17} title="Contact">
          <LegalP>Legal notices and questions about these terms:</LegalP>
          <LegalList>
            <LegalLi>
              Email <T>legal@orgos.dev</T>.
            </LegalLi>
            <LegalLi>
              Post: <T>OrgOS Technologies Ltd., {SITE.address}</T>.
            </LegalLi>
            <LegalLi>
              General inquiries: <T>{SITE.contactEmail}</T> · {SITE.phone}.
            </LegalLi>
          </LegalList>
          <LegalP>
            Our <T>Privacy Policy</T>, which explains how we handle data under these terms, is at{' '}
            <T>orgos.dev/privacy</T>.
          </LegalP>
        </LegalSection>
      </LegalLayout>
    </MarketingShell>
  )
}
