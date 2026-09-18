/* OrgOS seed — rich demo data. Run: bun prisma/seed.ts */
import { PrismaClient } from '@prisma/client'
import { randomUUID, scryptSync } from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomUUID().replace(/-/g, '')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

const day = 86400000
const daysAgo = (n: number, h = 10, m = 0) => new Date(Date.now() - n * day + (h - 10) * 3600000 + m * 60000)
const daysAhead = (n: number, h = 17, m = 0) => new Date(Date.now() + n * day + (h - 17) * 3600000 + m * 60000)
const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const PASSWORD = hashPassword('password123')

async function wipe() {
  // children first
  await db.sessionTaskEntry.deleteMany()
  await db.attendanceSession.deleteMany()
  await db.payslip.deleteMany()
  await db.payrollRun.deleteMany()
  await db.salaryComponent.deleteMany()
  await db.boardColumn.deleteMany()
  await db.orgPolicy.deleteMany()
  await db.holiday.deleteMany()
  await db.moduleAccess.deleteMany()
  await db.taskDependency.deleteMany()
  await db.timeEntry.deleteMany()
  await db.comment.deleteMany()
  await db.crmActivity.deleteMany()
  await db.application.deleteMany()
  await db.invoice.deleteMany()
  await db.expense.deleteMany()
  await db.leaveRequest.deleteMany()
  await db.attendance.deleteMany()
  await db.document.deleteMany()
  await db.announcement.deleteMany()
  await db.notification.deleteMany()
  await db.activityLog.deleteMany()
  await db.auditLog.deleteMany()
  await db.meeting.deleteMany()
  await db.deal.deleteMany()
  await db.lead.deleteMany()
  await db.pipelineStage.deleteMany()
  await db.client.deleteMany()
  await db.contact.deleteMany()
  await db.company.deleteMany()
  await db.leaveType.deleteMany()
  await db.job.deleteMany()
  await db.task.deleteMany()
  await db.milestone.deleteMany()
  await db.projectMember.deleteMany()
  await db.project.deleteMany()
  await db.teamMember.deleteMany()
  await db.team.deleteMany()
  await db.membership.deleteMany()
  await db.department.deleteMany()
  await db.organization.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()
}

async function main() {
  console.log('Wiping existing data…')
  await wipe()

  // ============== USERS ==============
  const users: Record<string, { id: string }> = {}
  const userDefs = [
    ['owner@orgos.dev', 'Tanvir Rahman', 'Founder & CEO', 'Building connected software for growing teams.'],
    ['maria@orgos.dev', 'Maria Chowdhury', 'Chief Operating Officer', null],
    ['farhan@orgos.dev', 'Farhan Karim', 'Chief Technology Officer', 'Full-stack architect. Coffee first.'],
    ['nusrat@orgos.dev', 'Nusrat Jahan', 'Human Resources Manager', 'People ops & culture.'],
    ['arif@orgos.dev', 'Arif Hossain', 'Head of Sales', 'Closing deals since 2016.'],
    ['salma@orgos.dev', 'Salma Akter', 'Finance Manager', null],
    ['rafi@orgos.dev', 'Rafi Islam', 'Senior Frontend Developer', 'React, TypeScript, design systems.'],
    ['meher@orgos.dev', 'Meherun Nesa', 'Backend Developer', 'Node.js & databases.'],
    ['imran@orgos.dev', 'Imran Shah', 'QA Engineer', null],
    ['tania@orgos.dev', 'Tania Sarkar', 'Product Designer', 'Designing for clarity.'],
    ['zahin@orgos.dev', 'Zahin Hasan', 'Marketing Executive', null],
    ['lubna@orgos.dev', 'Lubna Khan', 'Content Writer', 'Words that convert.'],
    ['candidate@orgos.dev', 'Sadia Noor', 'Backend Engineer (Candidate)', 'Aspiring backend engineer.'],
  ] as const
  for (const [email, name, headline, bio] of userDefs) {
    const u = await db.user.create({
      data: { email, name, headline, bio, passwordHash: PASSWORD, location: 'Dhaka, Bangladesh', skills: 'Communication, Teamwork, Problem Solving' },
    })
    users[email] = u
  }

  // T4: platform-level accounts (org-less) — SaaS console owner + moderation demo
  const saas = await db.user.create({
    data: {
      email: 'saas@orgos.dev', name: 'Farhan Chowdhury', headline: 'SaaS Platform Owner',
      bio: 'Runs the OrgOS platform — organizations, moderation and billing.',
      passwordHash: PASSWORD, location: 'Dhaka, Bangladesh', platformAdmin: true,
    },
  })
  await db.user.create({
    data: {
      email: 'suspended@orgos.dev', name: 'Sabbir Ahmed', headline: 'Spam account (suspended)',
      bio: 'Suspended by platform moderation for abusive job posts.',
      passwordHash: PASSWORD, location: 'Dhaka, Bangladesh', status: 'SUSPENDED',
    },
  })
  console.log(`Seeded ${Object.keys(users).length + 2} users (incl. platform admin ${saas.email})`)

  // ============== ORG 1: Meridian Labs ==============
  const meridian = await db.organization.create({
    data: {
      name: 'Meridian Labs',
      slug: 'meridian-labs',
      description: 'A digital product agency in Dhaka crafting web platforms, mobile apps and brand experiences for ambitious companies.',
      industry: 'Software & IT',
      orgType: 'Agency',
      website: 'https://meridianlabs.example',
      country: 'Bangladesh',
      currency: 'BDT',
      plan: 'Growth',
      foundedYear: 2019,
      ownerId: users['owner@orgos.dev'].id,
    },
  })

  // departments
  const deptDefs = [
    ['Management', '#10b981'], ['Technology', '#14b8a6'], ['Design', '#f59e0b'],
    ['Marketing', '#f43f5e'], ['Sales', '#8b5cf6'], ['Finance', '#84cc16'], ['Human Resources', '#ec4899'],
  ] as const
  const depts: Record<string, string> = {}
  for (const [name, color] of deptDefs) {
    const d = await db.department.create({ data: { orgId: meridian.id, name, color } })
    depts[name] = d.id
  }

  // teams
  const teamDefs = [
    ['Frontend Team', 'Technology'], ['Backend Team', 'Technology'], ['QA Team', 'Technology'],
    ['Brand Design', 'Design'], ['Growth Pod', 'Marketing'],
  ] as const
  const teamIds: Record<string, string> = {}
  for (const [name, dept] of teamDefs) {
    const t = await db.team.create({ data: { orgId: meridian.id, name, departmentId: depts[dept], description: `${name} inside ${dept}` } })
    teamIds[name] = t.id
  }

  // memberships (Meridian)
  const member: Record<string, string> = {} // email -> membershipId
  const memberDefs = [
    ['owner@orgos.dev', 'OWNER', 'Founder & CEO', 'Management', null, 'FULL_TIME', 'MER-001', -1620],
    ['maria@orgos.dev', 'ADMIN', 'Chief Operating Officer', 'Management', 'owner@orgos.dev', 'FULL_TIME', 'MER-002', -1400],
    ['farhan@orgos.dev', 'MANAGER', 'Chief Technology Officer', 'Technology', 'owner@orgos.dev', 'FULL_TIME', 'MER-003', -1290],
    ['nusrat@orgos.dev', 'HR', 'Human Resources Manager', 'Human Resources', 'owner@orgos.dev', 'FULL_TIME', 'MER-004', -760],
    ['arif@orgos.dev', 'MANAGER', 'Head of Sales', 'Sales', 'owner@orgos.dev', 'FULL_TIME', 'MER-005', -640],
    ['salma@orgos.dev', 'FINANCE', 'Finance Manager', 'Finance', 'maria@orgos.dev', 'FULL_TIME', 'MER-006', -520],
    ['rafi@orgos.dev', 'EMPLOYEE', 'Senior Frontend Developer', 'Technology', 'farhan@orgos.dev', 'FULL_TIME', 'MER-007', -430],
    ['meher@orgos.dev', 'EMPLOYEE', 'Backend Developer', 'Technology', 'farhan@orgos.dev', 'FULL_TIME', 'MER-008', -300],
    ['imran@orgos.dev', 'EMPLOYEE', 'QA Engineer', 'Technology', 'farhan@orgos.dev', 'FULL_TIME', 'MER-009', -210],
    ['tania@orgos.dev', 'EMPLOYEE', 'Product Designer', 'Design', 'maria@orgos.dev', 'FULL_TIME', 'MER-010', -180],
    ['zahin@orgos.dev', 'EMPLOYEE', 'Marketing Executive', 'Marketing', 'arif@orgos.dev', 'FULL_TIME', 'MER-011', -120],
    ['lubna@orgos.dev', 'CONTRACTOR', 'Content Writer', 'Marketing', 'arif@orgos.dev', 'FREELANCE', 'MER-012', -90],
  ] as const
  // create without manager first, then link
  for (const [email, role, title, dept, , emp, code, joinedDays] of memberDefs) {
    const m = await db.membership.create({
      data: {
        userId: users[email].id,
        orgId: meridian.id,
        role,
        title,
        departmentId: depts[dept],
        employmentType: emp,
        employeeCode: code,
        joinedAt: new Date(Date.now() + joinedDays * day),
        status: 'ACTIVE',
      },
    })
    member[email] = m.id
  }
  for (const [email, , , , mgr] of memberDefs) {
    if (mgr) {
      await db.membership.update({ where: { id: member[email] }, data: { managerId: member[mgr] } })
    }
  }
  // team members
  const tm: Array<[string, string, string?]> = [
    ['Frontend Team', 'rafi@orgos.dev', 'Lead'], ['Frontend Team', 'tania@orgos.dev'],
    ['Backend Team', 'meher@orgos.dev', 'Lead'], ['QA Team', 'imran@orgos.dev', 'Lead'],
    ['Brand Design', 'tania@orgos.dev', 'Lead'], ['Growth Pod', 'zahin@orgos.dev'], ['Growth Pod', 'lubna@orgos.dev'],
  ]
  for (const [team, email, role] of tm) {
    await db.teamMember.create({ data: { teamId: teamIds[team], membershipId: member[email], role } })
  }

  // pipeline stages
  const stageIds: Record<string, string> = {}
  const stageDefs = [['New', 0], ['Qualified', 1], ['Meeting', 2], ['Proposal', 3], ['Negotiation', 4]] as const
  for (const [name, order] of stageDefs) {
    const s = await db.pipelineStage.create({ data: { orgId: meridian.id, name, order } })
    stageIds[name] = s.id
  }

  // leave types
  const ltIds: Record<string, string> = {}
  for (const [name, days, color] of [['Casual Leave', 10, '#10b981'], ['Sick Leave', 14, '#f43f5e'], ['Annual Leave', 20, '#14b8a6']] as const) {
    const lt = await db.leaveType.create({ data: { orgId: meridian.id, name, daysPerYear: days, color } })
    ltIds[name] = lt.id
  }

  // ============== ORG 2: Northwind Collective (switch demo) ==============
  const northwind = await db.organization.create({
    data: {
      name: 'Northwind Collective',
      slug: 'northwind-collective',
      description: 'A small creative studio for brand identity and content.',
      industry: 'Design & Creative',
      orgType: 'Studio',
      country: 'Bangladesh',
      currency: 'BDT',
      plan: 'Starter',
      foundedYear: 2024,
      ownerId: users['owner@orgos.dev'].id,
    },
  })
  const nwDept = await db.department.create({ data: { orgId: northwind.id, name: 'Creative', color: '#f59e0b' } })
  const nwMember = await db.membership.create({
    data: { userId: users['owner@orgos.dev'].id, orgId: northwind.id, role: 'OWNER', title: 'Creative Director', departmentId: nwDept.id, joinedAt: daysAgo(120) },
  })
  const nwMember2 = await db.membership.create({
    data: { userId: users['zahin@orgos.dev'].id, orgId: northwind.id, role: 'EMPLOYEE', title: 'Designer', departmentId: nwDept.id, joinedAt: daysAgo(90) },
  })
  const nwStage = await db.pipelineStage.create({ data: { orgId: northwind.id, name: 'New', order: 0 } })
  const nwProject = await db.project.create({
    data: { orgId: northwind.id, name: 'Aurora Coffee Rebrand', code: 'NW-001', description: 'Full brand identity refresh for a specialty coffee chain.', managerMembershipId: nwMember.id, status: 'ACTIVE', priority: 'HIGH', budget: 300000, startDate: daysAgo(30), endDate: daysAhead(40), progress: 40, color: '#f59e0b' },
  })
  const nwTasks: Array<[string, string, number, number]> = [
    ['Discovery workshop', 'DONE', -28, -25],
    ['Moodboards & direction', 'DONE', -24, -18],
    ['Logo system', 'IN_PROGRESS', -17, 5],
    ['Packaging concepts', 'TODO', 2, 18],
    ['Brand guidelines book', 'TODO', 12, 35],
    ['Client presentation', 'TODO', 30, 38],
  ]
  for (const [title, status, s, e] of nwTasks) {
    await db.task.create({
      data: {
        orgId: northwind.id, projectId: nwProject.id, title, status,
        assigneeMembershipId: status === 'DONE' || status === 'IN_PROGRESS' ? nwMember2.id : nwMember.id,
        creatorMembershipId: nwMember.id, priority: 'MEDIUM', startDate: daysAgo(-s), dueDate: daysAgo(-e),
      },
    })
  }
  await db.leaveType.create({ data: { orgId: northwind.id, name: 'Casual Leave', daysPerYear: 10, color: '#10b981' } })
  await db.activityLog.create({ data: { orgId: northwind.id, actorMembershipId: nwMember.id, action: 'project.created', entityType: 'PROJECT', entityId: nwProject.id, message: 'Project "Aurora Coffee Rebrand" created', createdAt: daysAgo(30) } })

  // ============== CRM: companies / contacts / clients ==============
  const companyIds: Record<string, string> = {}
  const companyDefs = [
    ['GreenGrocer', 'Retail & Grocery', 'https://greengrocer.example', 'Gulshan Ave, Dhaka'],
    ['EduPath', 'Education Technology', 'https://edupath.example', 'Banani, Dhaka'],
    ['HealthBridge', 'Healthcare', 'https://healthbridge.example', 'Dhanmondi, Dhaka'],
    ['UrbanCart', 'E-commerce', 'https://urbancart.example', 'Chattogram'],
    ['Skyline Properties', 'Real Estate', 'https://skyline.example', 'Uttara, Dhaka'],
    ['FinPro Analytics', 'Financial Technology', 'https://finpro.example', 'Motijheel, Dhaka'],
  ] as const
  for (const [name, industry, website, address] of companyDefs) {
    const c = await db.company.create({ data: { orgId: meridian.id, name, industry, website, address } })
    companyIds[name] = c.id
  }
  const contactIds: Record<string, string> = {}
  const contactDefs = [
    ['Rezaul Karim', 'Head of Digital', 'rezaul@greengrocer.example', '+8801711000001', 'GreenGrocer'],
    ['Nadia Chowdhury', 'COO', 'nadia@edupath.example', '+8801711000002', 'EduPath'],
    ['Dr. Farhana Yasmin', 'Director', 'farhana@healthbridge.example', '+8801711000003', 'HealthBridge'],
    ['Shahriar Alam', 'Founder', 'shahriar@urbancart.example', '+8801711000004', 'UrbanCart'],
    ['Mahmud Hasan', 'Marketing Head', 'mahmud@skyline.example', '+8801711000005', 'Skyline Properties'],
    ['Priya Das', 'Product Lead', 'priya@finpro.example', '+8801711000006', 'FinPro Analytics'],
    ['Ahsan Habib', 'Procurement', 'ahsan@metrofoods.example', '+8801711000007', 'GreenGrocer'],
    ['Rumana Ali', 'Brand Manager', 'rumana@bengallogistics.example', '+8801711000008', 'Skyline Properties'],
  ] as const
  for (const [name, position, email, phone, company] of contactDefs) {
    const c = await db.contact.create({ data: { orgId: meridian.id, name, position, email, phone, companyId: companyIds[company] } })
    contactIds[name] = c.id
  }
  const clientIds: Record<string, string> = {}
  const clientDefs = [
    ['GreenGrocer', 'GreenGrocer', 'ACTIVE', 'rezaul@greengrocer.example', 'Very responsive, fast approvals.', -180],
    ['EduPath', 'EduPath', 'ACTIVE', 'nadia@edupath.example', 'Long-term retainer discussions ongoing.', -150],
    ['HealthBridge', 'HealthBridge', 'ACTIVE', 'farhana@healthbridge.example', null, -140],
    ['UrbanCart', 'UrbanCart', 'PROSPECT', 'shahriar@urbancart.example', 'Project in planning phase.', -10],
    ['Skyline', 'Skyline Properties', 'ACTIVE', 'mahmud@skyline.example', 'On hold pending their reorg.', -75],
  ] as const
  for (const [key, name, status, email, note, sinceDays] of clientDefs) {
    const cl = await db.client.create({
      data: { orgId: meridian.id, name, status, contactEmail: email, healthNote: note, companyId: companyIds[key === 'Skyline' ? 'Skyline Properties' : key], since: daysAgo(-sinceDays) },
    })
    clientIds[key] = cl.id
  }

  // ============== LEADS ==============
  type LeadRow = [string, string, string, string, string, string, number, string, string]
  const leadDefs: LeadRow[] = [
    ['Rehana Parvez', 'Metro Foods', 'rehana@metrofoods.example', '+8801811000001', 'WEBSITE', 'NEW', 250000, 'MANUAL', 'Wants an ordering app'],
    ['Kamrul Hasan', 'Rivendell Interiors', 'kamrul@rivendell.example', '+8801811000002', 'REFERRAL', 'NEW', 180000, 'MANUAL', 'Referred by GreenGrocer'],
    ['Sonia Rahman', 'Bengal Logistics', 'sonia@bengallogistics.example', '+8801811000003', 'EVENT', 'CONTACTED', 280000, 'MANUAL', 'Met at Tech Expo'],
    ['Imtiaz Ahmed', 'TechNova Solutions', 'imtiaz@technova.example', '+8801811000004', 'OUTREACH', 'CONTACTED', 400000, 'MANUAL', 'Needs staff augmentation'],
    ['Rumana Ali', 'Bengal Logistics', 'rumana@bengallogistics.example', '+8801811000005', 'OUTREACH', 'UNQUALIFIED', 0, 'MANUAL', 'Budget too low for scope'],
    ['Adnan Chowdhury', 'Lumen Education', 'adnan@lumen.example', '+8801811000006', 'SOCIAL', 'QUALIFIED', 350000, 'MANUAL', 'LinkedIn inbound, strong fit'],
    ['Farzana Haque', 'Cottage Crafts BD', 'farzana@cottagecrafts.example', '+8801811000007', 'WEBSITE', 'QUALIFIED', 120000, 'MANUAL', 'Shopify migration'],
    ['Nabila Sharif', 'Prime Insurance', 'nabila@primeins.example', '+8801811000008', 'REFERRAL', 'QUALIFIED', 500000, 'MANUAL', 'Portal + CRM integration'],
    ['Tanvir Ahamed', 'Skyline Properties', 'mahmud@skyline.example', '+8801811000009', 'AD', 'CONTACTED', 350000, 'MANUAL', 'Follow up next week'],
    ['Jahidul Islam', 'Dhaka Eats', 'jahid@dhaakaeats.example', '+8801811000010', 'SOCIAL', 'NEW', 90000, 'MANUAL', 'Instagram campaign lead'],
    ['Shirin Sultana', 'Apex Healthcare', 'shirin@apexhealth.example', '+8801811000011', 'WEBSITE', 'CONTACTED', 600000, 'MANUAL', 'Hospital website + booking'],
    ['Rakib Mahmud', 'EduPath', 'nadia@edupath.example', '+8801811000012', 'REFERRAL', 'CONVERTED', 1200000, 'MANUAL', 'Became client — LMS platform'],
    ['Nusrat Abedin', 'GreenGrocer', 'rezaul@greengrocer.example', '+8801811000013', 'WEBSITE', 'CONVERTED', 850000, 'MANUAL', 'Became client — e-commerce'],
    ['Zaman Khan', 'UrbanCart', 'shahriar@urbancart.example', '+8801811000014', 'EVENT', 'CONVERTED', 600000, 'MANUAL', 'Became client — mobile app'],
  ]
  const leadOwners = [member['arif@orgos.dev'], member['zahin@orgos.dev'], member['owner@orgos.dev']]
  const leads: Array<{ id: string; name: string }> = []
  leadDefs.forEach((l, i) => {
    const [name, company, email, phone, source, status, value, _s, notes] = l
    leads.push({ id: '', name })
  })
  for (let i = 0; i < leadDefs.length; i++) {
    const [name, company, email, phone, source, status, value, , notes] = leadDefs[i]
    const lead = await db.lead.create({
      data: {
        orgId: meridian.id, name, company, email, phone, source, status, value: value || null,
        notes, industry: null, ownerMembershipId: leadOwners[i % leadOwners.length], createdAt: daysAgo(20 - i),
      },
    })
    leads[i] = { id: lead.id, name }
  }

  // ============== DEALS ==============
  type DealRow = [string, string, string, number, number, string, string, string, number, number]
  // name, company, contact, value, probability, stage, status, ownerEmail, createdDaysAgo, closeDays
  const dealDefs: DealRow[] = [
    ['GreenGrocer E-commerce Platform', 'GreenGrocer', 'Rezaul Karim', 850000, 100, 'Negotiation', 'WON', 'arif@orgos.dev', -65, -60],
    ['EduPath Learning Platform', 'EduPath', 'Nadia Chowdhury', 1200000, 100, 'Negotiation', 'WON', 'owner@orgos.dev', -95, -90],
    ['HealthBridge Brand & Website', 'HealthBridge', 'Dr. Farhana Yasmin', 450000, 100, 'Proposal', 'WON', 'arif@orgos.dev', -155, -150],
    ['UrbanCart Mobile App', 'UrbanCart', 'Shahriar Alam', 600000, 55, 'Proposal', 'OPEN', 'arif@orgos.dev', -12, 14],
    ['FinPro Analytics Dashboard', 'FinPro Analytics', 'Priya Das', 900000, 35, 'Qualified', 'OPEN', 'owner@orgos.dev', -8, 40],
    ['Skyline Corporate Website', 'Skyline Properties', 'Mahmud Hasan', 350000, 25, 'Meeting', 'OPEN', 'arif@orgos.dev', -6, 30],
    ['Rivendell CRM Implementation', 'GreenGrocer', 'Ahsan Habib', 400000, 15, 'New', 'OPEN', 'zahin@orgos.dev', -4, 60],
    ['Metro Foods Ordering App', 'GreenGrocer', null, 550000, 60, 'Negotiation', 'OPEN', 'arif@orgos.dev', -10, 7],
    ['TechNova Staff Augmentation', 'UrbanCart', null, 300000, 30, 'Proposal', 'OPEN', 'zahin@orgos.dev', -3, 21],
    ['Lumen School Portal', 'GreenGrocer', null, 350000, 20, 'Qualified', 'OPEN', 'zahin@orgos.dev', -2, 45],
    ['Apex Healthcare Booking Platform', 'GreenGrocer', null, 600000, 10, 'New', 'OPEN', 'arif@orgos.dev', -1, 50],
    ['Bengal Logistics Fleet Portal', 'GreenGrocer', null, 280000, 0, 'Qualified', 'LOST', 'arif@orgos.dev', -40, -22],
  ]
  const dealRecords: Array<{ id: string; name: string; status: string; stageId: string }> = []
  for (const [name, company, contact, value, probability, stage, status, owner, createdAgo, closeIn] of dealDefs) {
    const d = await db.deal.create({
      data: {
        orgId: meridian.id, name, value, companyId: companyIds[company],
        contactId: contact ? contactIds[contact] : null,
        stageId: stageIds[stage], probability, status,
        ownerMembershipId: member[owner],
        expectedCloseDate: status === 'WON' ? daysAgo(-closeIn) : daysAhead(closeIn),
        wonAt: status === 'WON' ? daysAgo(-closeIn) : null,
        clientId: status === 'WON' ? (clientIds['GreenGrocer'] === null ? null : null) : null,
        notes: status === 'LOST' ? 'Chose a cheaper local vendor.' : null,
        createdAt: daysAgo(-createdAgo),
      },
    })
    dealRecords.push({ id: d.id, name, status, stageId: stageIds[stage] })
  }

  // ============== PROJECTS ==============
  const projectIds: Record<string, string> = {}
  const projectDefs = [
    ['GreenGrocer E-commerce Platform', 'MER-001', 'ACTIVE', 'HIGH', 850000, -60, 45, 45, 'GreenGrocer', 'farhan@orgos.dev', 'Modern headless commerce platform with POS integration for 14 physical stores.'],
    ['EduPath Learning Platform', 'MER-002', 'ACTIVE', 'URGENT', 1200000, -90, 20, 72, 'EduPath', 'maria@orgos.dev', 'LMS with live classes, assessments and parent portal for K-12 students.'],
    ['HealthBridge Brand & Website', 'MER-003', 'COMPLETED', 'MEDIUM', 450000, -150, -30, 100, 'HealthBridge', 'maria@orgos.dev', 'Complete rebrand plus corporate website and appointment booking.'],
    ['UrbanCart Mobile App', 'MER-004', 'PLANNING', 'HIGH', 600000, 7, 120, 5, 'UrbanCart', 'farhan@orgos.dev', 'React Native shopping app with loyalty wallet and push campaigns.'],
    ['Meridian Marketing Site Revamp', 'MER-005', 'PLANNING', 'LOW', 150000, 14, 60, 0, null, 'zahin@orgos.dev', 'Internal project — new agency website with case study engine.'],
  ] as const
  for (const [name, code, status, priority, budget, startAgo, endIn, progress, client, manager, description] of projectDefs) {
    const p = await db.project.create({
      data: {
        orgId: meridian.id, name, code, status, priority, budget,
        startDate: daysAgo(-startAgo), endDate: endIn < 0 ? daysAgo(-endIn) : daysAhead(endIn),
        progress, description, managerMembershipId: member[manager],
        clientId: client ? clientIds[client] : null, color: '#10b981',
      },
    })
    projectIds[name] = p.id
  }
  // project members
  const pmDefs: Array<[string, string[]]> = [
    ['GreenGrocer E-commerce Platform', ['farhan@orgos.dev', 'rafi@orgos.dev', 'meher@orgos.dev', 'imran@orgos.dev', 'tania@orgos.dev', 'maria@orgos.dev']],
    ['EduPath Learning Platform', ['maria@orgos.dev', 'rafi@orgos.dev', 'meher@orgos.dev', 'imran@orgos.dev', 'tania@orgos.dev', 'lubna@orgos.dev']],
    ['HealthBridge Brand & Website', ['maria@orgos.dev', 'tania@orgos.dev', 'rafi@orgos.dev', 'lubna@orgos.dev']],
    ['UrbanCart Mobile App', ['farhan@orgos.dev', 'rafi@orgos.dev', 'tania@orgos.dev']],
    ['Meridian Marketing Site Revamp', ['zahin@orgos.dev', 'tania@orgos.dev', 'lubna@orgos.dev']],
  ]
  for (const [proj, members] of pmDefs) {
    for (const email of members) {
      await db.projectMember.create({
        data: {
          projectId: projectIds[proj], membershipId: member[email],
          role: email === 'farhan@orgos.dev' || email === 'maria@orgos.dev' ? 'Project Manager' : undefined,
        },
      })
    }
  }

  // ============== MILESTONES ==============
  const msIds: Record<string, string> = {}
  const msDefs: Array<[string, string, string, number | null, string, string?]> = [
    ['GreenGrocer E-commerce Platform', 'Discovery & Requirements', 'Stakeholder interviews, POS audit and technical scoping.', -55, 'COMPLETED', -50],
    ['GreenGrocer E-commerce Platform', 'UI/UX Design System', 'Figma library, responsive patterns and brand application.', -48, 'COMPLETED', -35],
    ['GreenGrocer E-commerce Platform', 'Core Commerce Development', 'Catalog, cart, checkout, payments (bKash/SSLCommerz), POS sync.', -30, 'IN_PROGRESS'],
    ['GreenGrocer E-commerce Platform', 'Integrations & Data Migration', 'ERP sync, loyalty points, 12k SKU migration.', 10, 'PENDING'],
    ['GreenGrocer E-commerce Platform', 'QA, Launch & Hypercare', 'Load testing, staff training, go-live support.', 35, 'PENDING'],
    ['EduPath Learning Platform', 'Discovery', 'User research with 3 schools and curriculum mapping.', -85, 'COMPLETED', -80],
    ['EduPath Learning Platform', 'MVP Build', 'Courses, live classes, quizzes, student portal.', -70, 'COMPLETED', -30],
    ['EduPath Learning Platform', 'Content Tools', 'Lesson builder, bulk upload, rich media.', -20, 'IN_PROGRESS'],
    ['EduPath Learning Platform', 'Pilot Testing & Handover', '2 pilot schools, teacher training, SLA.', 12, 'PENDING'],
    ['HealthBridge Brand & Website', 'Brand Identity', 'Logo, palette, typography, guidelines.', -130, 'COMPLETED', -110],
    ['HealthBridge Brand & Website', 'Website & Booking', 'Corporate site, doctor profiles, appointments.', -100, 'COMPLETED', -35],
    ['UrbanCart Mobile App', 'Discovery & Clickable Prototype', 'Feature scope, user flows, prototype for investor deck.', 20, 'PENDING'],
    ['Meridian Marketing Site Revamp', 'Concept & Content Architecture', 'Sitemap, messaging, case study framework.', 30, 'PENDING'],
  ]
  for (const [proj, title, description, dueAgoOrIn, status, doneAgo] of msDefs) {
    const due = dueAgoOrIn! < 0 ? daysAgo(-dueAgoOrIn!) : daysAhead(dueAgoOrIn!)
    const m = await db.milestone.create({
      data: {
        projectId: projectIds[proj], title, description, dueDate: due, status,
        completedAt: doneAgo ? daysAgo(-doneAgo) : null,
      },
    })
    msIds[title] = m.id
  }

  // ============== TASKS ==============
  type TaskRow = [string, string, string, string, string, string, number, number, number, string, string]
  // title, project, assignee, status, priority, milestone, startAgo, dueIn, estHours, tags, desc
  const taskDefs: TaskRow[] = [
    // GreenGrocer (active, 45%)
    ['Design checkout flow components', 'GreenGrocer E-commerce Platform', 'tania@orgos.dev', 'DONE', 'HIGH', 'UI/UX Design System', -45, -30, 16, 'design,figma', 'Checkout, cart drawer, payment selection states.'],
    ['Build design tokens package', 'GreenGrocer E-commerce Platform', 'rafi@orgos.dev', 'DONE', 'MEDIUM', 'UI/UX Design System', -38, -28, 12, 'frontend,design-system', 'Shared token JSON mapped to Tailwind config.'],
    ['Implement catalog & search API', 'GreenGrocer E-commerce Platform', 'meher@orgos.dev', 'DONE', 'HIGH', 'Core Commerce Development', -30, -12, 40, 'backend,search', 'Product listing with faceted filters and typo tolerance.'],
    ['Develop cart & checkout frontend', 'GreenGrocer E-commerce Platform', 'rafi@orgos.dev', 'IN_PROGRESS', 'URGENT', 'Core Commerce Development', -10, 3, 32, 'frontend', 'Optimistic cart, guest checkout, coupons.'],
    ['Integrate bKash payment gateway', 'GreenGrocer E-commerce Platform', 'meher@orgos.dev', 'IN_PROGRESS', 'URGENT', 'Core Commerce Development', -7, 5, 24, 'backend,payments', 'Tokenized checkout + webhook reconciliation.'],
    ['POS inventory sync service', 'GreenGrocer E-commerce Platform', 'meher@orgos.dev', 'TODO', 'HIGH', 'Integrations & Data Migration', 6, 18, 30, 'backend,integration', 'Event-driven sync with in-store POS.'],
    ['Migrate 12k SKUs from legacy ERP', 'GreenGrocer E-commerce Platform', 'imran@orgos.dev', 'TODO', 'MEDIUM', 'Integrations & Data Migration', 10, 22, 20, 'data,migration', 'CSV transforms, image mapping, dry-run validation.'],
    ['Loyalty points engine', 'GreenGrocer E-commerce Platform', 'rafi@orgos.dev', 'BACKLOG', 'MEDIUM', 'Integrations & Data Migration', 12, 30, 26, 'frontend,backend', 'Tier rules, expiry, redemption at checkout.'],
    ['Checkout E2E test suite', 'GreenGrocer E-commerce Platform', 'imran@orgos.dev', 'REVIEW', 'HIGH', 'QA, Launch & Hypercare', -4, 1, 14, 'qa,testing', 'Playwright suite for cart→payment→confirmation.'],
    ['Staff training videos', 'GreenGrocer E-commerce Platform', 'lubna@orgos.dev', 'BACKLOG', 'LOW', 'QA, Launch & Hypercare', 20, 40, 10, 'content,training', '5 short walkthrough videos for store staff.'],
    ['Go-live runbook', 'GreenGrocer E-commerce Platform', 'farhan@orgos.dev', 'TODO', 'HIGH', 'QA, Launch & Hypercare', 25, 33, 8, 'ops,launch', 'Rollback plan, monitoring checklist, hypercare rota.'],

    // EduPath (active, 72%)
    ['Lesson builder rich text editor', 'EduPath Learning Platform', 'rafi@orgos.dev', 'DONE', 'HIGH', 'Content Tools', -40, -25, 24, 'frontend', 'Notion-style editor with media embeds.'],
    ['Bulk content upload (CSV/XLSX)', 'EduPath Learning Platform', 'meher@orgos.dev', 'DONE', 'MEDIUM', 'Content Tools', -30, -14, 18, 'backend', 'Row-level validation and progress reporting.'],
    ['Parent portal dashboard', 'EduPath Learning Platform', 'rafi@orgos.dev', 'IN_PROGRESS', 'HIGH', 'Content Tools', -8, 6, 20, 'frontend', 'Attendance, grades, fee status cards.'],
    ['Live class WebRTC tuning', 'EduPath Learning Platform', 'meher@orgos.dev', 'IN_PROGRESS', 'URGENT', 'Content Tools', -5, 2, 22, 'backend,webrtc', 'Adaptive bitrate for weak networks.'],
    ['Pilot school onboarding plan', 'EduPath Learning Platform', 'maria@orgos.dev', 'TODO', 'HIGH', 'Pilot Testing & Handover', 4, 10, 10, 'pm,planning', 'Two schools, schedules, teacher training sessions.'],
    ['Accessibility audit (WCAG AA)', 'EduPath Learning Platform', 'tania@orgos.dev', 'REVIEW', 'MEDIUM', 'Pilot Testing & Handover', -3, 0, 12, 'design,a11y', 'Contrast, focus states, screen reader labels.'],
    ['Teacher training deck', 'EduPath Learning Platform', 'lubna@orgos.dev', 'TODO', 'MEDIUM', 'Pilot Testing & Handover', 6, 11, 8, 'content', '40-slide training material with exercises.'],
    ['SLO monitoring dashboard', 'EduPath Learning Platform', 'imran@orgos.dev', 'DONE', 'MEDIUM', 'MVP Build', -60, -35, 16, 'qa,ops', 'Uptime + error-rate alerts wired to Slack.'],
    ['Fix certificate PDF rendering', 'EduPath Learning Platform', 'rafi@orgos.dev', 'DONE', 'LOW', 'MVP Build', -25, -20, 4, 'frontend,bug', 'Bangla text was clipping in generated PDFs.'],

    // HealthBridge (completed)
    ['Brand guidelines v2', 'HealthBridge Brand & Website', 'tania@orgos.dev', 'DONE', 'HIGH', 'Brand Identity', -125, -112, 30, 'design', 'Full identity book, 46 pages.'],
    ['Doctor profile pages', 'HealthBridge Brand & Website', 'rafi@orgos.dev', 'DONE', 'MEDIUM', 'Website & Booking', -95, -60, 18, 'frontend', 'Structured profiles with availability.'],
    ['Appointment booking engine', 'HealthBridge Brand & Website', 'meher@orgos.dev', 'DONE', 'HIGH', 'Website & Booking', -90, -45, 26, 'backend', 'Slot rules, SMS reminders, no-show tracking.'],
    ['Post-launch SEO checklist', 'HealthBridge Brand & Website', 'zahin@orgos.dev', 'DONE', 'LOW', 'Website & Booking', -50, -32, 6, 'marketing,seo', 'Sitemaps, meta, schema markup.'],

    // UrbanCart (planning)
    ['Clickable app prototype', 'UrbanCart Mobile App', 'tania@orgos.dev', 'TODO', 'HIGH', 'Discovery & Clickable Prototype', 3, 16, 30, 'design,prototype', 'Figma prototype for investor demo.'],
    ['Technical architecture proposal', 'UrbanCart Mobile App', 'farhan@orgos.dev', 'TODO', 'HIGH', 'Discovery & Clickable Prototype', 5, 15, 14, 'architecture', 'React Native vs Flutter trade-offs.'],
    ['Loyalty wallet concept', 'UrbanCart Mobile App', 'rafi@orgos.dev', 'BACKLOG', 'MEDIUM', 'Discovery & Clickable Prototype', 10, 25, 12, 'mobile,concept', 'Points, streaks and referral hooks.'],

    // Marketing site (planning)
    ['Case study engine wireframes', 'Meridian Marketing Site Revamp', 'tania@orgos.dev', 'TODO', 'MEDIUM', 'Concept & Content Architecture', 10, 24, 12, 'design', 'Reusable case-study blocks.'],
    ['Agency positioning copy', 'Meridian Marketing Site Revamp', 'lubna@orgos.dev', 'TODO', 'MEDIUM', 'Concept & Content Architecture', 8, 20, 10, 'content', 'Homepage + services narrative.'],

    // Internal / org-level
    ['Renew SSL certificates (all services)', '', 'imran@orgos.dev', 'TODO', 'HIGH', '', -2, 2, 2, 'ops', 'Expiring in 30 days.'],
    ['Quarterly OKR planning doc', '', 'maria@orgos.dev', 'IN_PROGRESS', 'MEDIUM', '', -3, 4, 6, 'pm,planning', 'Q4 objectives across all teams.'],
    ['Update employee handbook (2025)', '', 'nusrat@orgos.dev', 'TODO', 'MEDIUM', '', -10, 12, 8, 'hr,policy', 'Hybrid policy + new leave rules.'],
    ['Prepare Eid campaign brief for clients', '', 'zahin@orgos.dev', 'TODO', 'LOW', '', 2, 9, 5, 'marketing', 'Seasonal campaign one-pager.'],
    ['Fix time-tracking rounding bug', '', 'meher@orgos.dev', 'BACKLOG', 'LOW', '', -15, 20, 3, 'bug', 'Rounds up to 15m always.'],
  ]

  const taskIds: Record<string, string> = {}
  for (const [title, proj, assignee, status, priority, milestone, startAgo, dueIn, est, tags, desc] of taskDefs) {
    const due = dueIn < 0 ? daysAgo(-dueIn) : daysAhead(dueIn)
    const start = startAgo < 0 ? daysAgo(-startAgo) : daysAhead(startAgo)
    const t = await db.task.create({
      data: {
        orgId: meridian.id,
        projectId: proj ? projectIds[proj] : null,
        milestoneId: milestone ? msIds[milestone] : null,
        title, description: desc,
        assigneeMembershipId: member[assignee],
        creatorMembershipId: proj ? member['farhan@orgos.dev'] : member['maria@orgos.dev'],
        status, priority, startDate: start, dueDate: due,
        estimatedHours: est, tags, order: 0,
        completedAt: status === 'DONE' ? daysAgo(Math.max(0, -dueIn - 1) || 1) : null,
      },
    })
    taskIds[title] = t.id
  }

  // subtasks
  const subtaskDefs: Array<[string, string, string, string]> = [
    ['Optimistic cart state', 'Develop cart & checkout frontend', 'rafi@orgos.dev', 'DONE'],
    ['Guest checkout form', 'Develop cart & checkout frontend', 'rafi@orgos.dev', 'IN_PROGRESS'],
    ['Coupon validation endpoint', 'Develop cart & checkout frontend', 'meher@orgos.dev', 'IN_PROGRESS'],
    ['bKash sandbox credentials', 'Integrate bKash payment gateway', 'meher@orgos.dev', 'DONE'],
    ['Payment webhook handler', 'Integrate bKash payment gateway', 'meher@orgos.dev', 'TODO'],
    ['Reconciliation cron job', 'Integrate bKash payment gateway', 'meher@orgos.dev', 'TODO'],
  ]
  for (const [title, parent, assignee, status] of subtaskDefs) {
    await db.task.create({
      data: {
        orgId: meridian.id, projectId: projectIds['GreenGrocer E-commerce Platform'],
        parentTaskId: taskIds[parent], title, status,
        assigneeMembershipId: member[assignee], creatorMembershipId: member['farhan@orgos.dev'],
        priority: 'MEDIUM', dueDate: daysAhead(4),
      },
    })
  }
  // dependencies (FS chain: design → frontend → QA → launch)
  const depDefs: Array<[string, string]> = [
    ['Develop cart & checkout frontend', 'Design checkout flow components'],
    ['Checkout E2E test suite', 'Develop cart & checkout frontend'],
    ['Go-live runbook', 'Checkout E2E test suite'],
    ['POS inventory sync service', 'Migrate 12k SKUs from legacy ERP'],
  ]
  for (const [task, dep] of depDefs) {
    await db.taskDependency.create({ data: { taskId: taskIds[task], dependsOnTaskId: taskIds[dep], type: 'FS' } })
  }

  // task comments
  const commentDefs: Array<[string, string, string, number]> = [
    ['Develop cart & checkout frontend', 'farhan@orgos.dev', 'bKash asked for sandbox IP whitelisting — sent them our egress range.', -2],
    ['Develop cart & checkout frontend', 'tania@orgos.dev', 'Updated the error-state specs in Figma, page 12.', -1],
    ['Live class WebRTC tuning', 'farhan@orgos.dev', 'Try simulcast with 3 layers; lowest at 120p for 2G fallback.', -1],
    ['Migrate 12k SKUs from legacy ERP', 'imran@orgos.dev', 'Dry run finished: 48 rows failed image mapping, fixing mapping table.', -3],
  ]
  for (const [task, email, body, ago] of commentDefs) {
    await db.comment.create({
      data: { orgId: meridian.id, entityType: 'TASK', entityId: taskIds[task], authorMembershipId: member[email], body, createdAt: daysAgo(-ago) },
    })
  }

  // ============== JOBS & APPLICATIONS ==============
  const jobIds: Record<string, string> = {}
  const jobDefs = [
    ['Senior Backend Engineer', 'Technology', 'OPEN', 'PUBLIC', 'REMOTE', 'SENIOR', 120000, 180000, 2, 'farhan@orgos.dev', 30,
      'Own critical backend services for client platforms — payments, integrations and data pipelines.',
      'Design and evolve service architecture. Mentor mid-level engineers. Own uptime of delivered systems.',
      'Node.js/TypeScript, PostgreSQL, Redis, message queues, CI/CD, 5+ years.'],
    ['Product Designer', 'Design', 'OPEN', 'PLATFORM', 'HYBRID', 'MID', 80000, 120000, 1, 'tania@orgos.dev', 20,
      'Craft end-to-end product experiences across web and mobile for client projects.',
      'Run discovery, wireframe, prototype, hand-off. Contribute to the shared design system.',
      'Figma, design systems, portfolio of shipped web products, 3+ years.'],
    ['Marketing Intern', 'Marketing', 'OPEN', 'PUBLIC', 'ONSITE', 'ENTRY', 15000, 20000, 2, 'zahin@orgos.dev', 12,
      'Support campaign execution, content calendars and analytics reporting.',
      'Draft social copy, assemble reports, coordinate with designers.',
      'Final-year student or fresh graduate, strong writing, curiosity for analytics.'],
    ['QA Engineer (Contract)', 'Technology', 'PAUSED', 'PRIVATE', 'ONSITE', 'MID', 60000, 80000, 1, 'farhan@orgos.dev', 0,
      'Manual + automated QA across active client projects.',
      'Write and run test plans, automate regression, report defects.',
      'Playwright, API testing, 3+ years agency experience.'],
  ] as const
  for (const [title, dept, status, visibility, workMode, level, smin, smax, openings, mgr, deadlineIn, desc, resp, req] of jobDefs) {
    const j = await db.job.create({
      data: {
        orgId: meridian.id, title, departmentId: depts[dept], status, visibility, workMode,
        experienceLevel: level, salaryMin: smin, salaryMax: smax, openings,
        hiringManagerMembershipId: member[mgr as string] ?? null,
        deadline: daysAhead(deadlineIn), description: desc, responsibilities: resp, requirements: req,
        skills: 'Communication, Ownership, Craft', location: 'Dhaka, Bangladesh', employmentType: title.includes('Intern') ? 'INTERN' : 'FULL_TIME',
      },
    })
    jobIds[title] = j.id
  }

  const appDefs: Array<[string, string, string, string, number | null, string, number, string]> = [
    ['Sadia Noor', 'candidate@orgos.dev', 'sadia.noor@example.com', '+8801911000001', 3.5, 'INTERVIEW', 6, 'Strong Node.js portfolio; previously at Pathao for 2 years.'],
    ['Hasib Rahman', null, 'hasib.rahman@example.com', '+8801911000002', 4, 'SCREENING', 5, 'Solid systems background, good culture signals.'],
    ['Maliha Zaman', null, 'maliha.z@example.com', '+8801911000003', 3, 'APPLIED', 4, 'Referred by Nusrat.'],
    ['Tahmid Hasan', null, 'tahmid.h@example.com', '+8801911000004', null, 'APPLIED', 3, 'Applying from portfolio site.'],
    ['Anika Bushra', null, 'anika.b@example.com', '+8801911000005', 4.5, 'SHORTLISTED', 9, 'Excellent Figma case studies.'],
    ['Fahim Reza', null, 'fahim.reza@example.com', '+8801911000006', 4, 'SHORTLISTED', 8, 'Previously designed for bKash campaigns.'],
    ['Raisa Mehjabin', null, 'raisa.m@example.com', '+8801911000007', 3.5, 'ASSESSMENT', 7, 'Take-home: checkout UX audit.'],
    ['Sabbir Ahmed', null, 'sabbir.a@example.com', '+8801911000008', 4, 'OFFER', 12, 'Offer letter sent — negotiating start date.'],
    ['Nafis Iqbal', null, 'nafis.i@example.com', '+8801911000009', 4, 'HIRED', 30, 'Joined the platform team — great hire.'],
    ['Rashed Karim', null, 'rashed.k@example.com', '+8801911000010', 2, 'REJECTED', 15, 'Needs more depth in async patterns.'],
    ['Sumaiya Siddiqua', null, 'sumaiya.s@example.com', '+8801911000011', null, 'APPLIED', 1, 'Fresh graduate, intern pool.'],
  ]
  const seniorJob = 'Senior Backend Engineer'
  const designJob = 'Product Designer'
  const internJob = 'Marketing Intern'
  for (let i = 0; i < appDefs.length; i++) {
    const [name, userId, email, phone, rating, stage, ago, notes] = appDefs[i]
    const jobTitle = i % 3 === 0 ? seniorJob : i % 3 === 1 ? designJob : internJob
    await db.application.create({
      data: {
        jobId: jobIds[jobTitle], userId: userId ? users[userId].id : null,
        candidateName: name, email, phone, stage, rating: rating ?? null, notes,
        experienceYears: 2 + (i % 5), skills: 'Node.js, React, SQL, Figma',
        coverLetter: 'I admire Meridian’s work on EduPath and would love to contribute.',
        source: userId ? 'PLATFORM' : 'WEBSITE',
        createdAt: daysAgo(ago),
        decidedAt: stage === 'HIRED' || stage === 'REJECTED' ? daysAgo(ago - 3) : null,
        processedByMembershipId: stage === 'HIRED' ? member['nusrat@orgos.dev'] : null,
      },
    })
  }

  // ============== ATTENDANCE (last 14 days, weekdays) ==============
  const employeeEmails = memberDefs.map((m) => m[0] as string)
  const today = new Date()
  for (let d = 13; d >= 0; d--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue
    for (let i = 0; i < employeeEmails.length; i++) {
      const email = employeeEmails[i]
      // today: only some have records (owner + rafi + imran + tania + lubna absent yet)
      if (d === 0 && ['owner@orgos.dev', 'rafi@orgos.dev', 'imran@orgos.dev', 'tania@orgos.dev', 'lubna@orgos.dev', 'maria@orgos.dev'].includes(email)) continue
      const roll = (i * 7 + d * 3) % 10
      let status = 'PRESENT'
      let checkIn: Date | null = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, (i * 17 + d * 7) % 40)
      let checkOut: Date | null = null
      if (roll === 3) { status = 'LATE'; checkIn = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 35 + (i % 20)) }
      if (roll === 7) { status = 'LEAVE'; checkIn = null }
      if (roll === 9 && d !== 0) { status = 'ABSENT'; checkIn = null }
      if (d > 0 && checkIn && status !== 'LEAVE' && status !== 'ABSENT') {
        checkOut = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 20 + (i * 13) % 35)
      }
      const workedMinutes = checkIn && checkOut ? Math.round((checkOut.getTime() - checkIn.getTime()) / 60000) : null
      await db.attendance.create({
        data: {
          orgId: meridian.id, membershipId: member[email], date: dstr(date),
          checkIn, checkOut, status,
          workedMinutes: workedMinutes && workedMinutes > 300 ? workedMinutes : (status === 'PRESENT' && checkIn && !checkOut ? null : workedMinutes),
          note: status === 'LATE' ? 'Traffic on Bijoy Sarani' : null,
        },
      }).catch(() => {}) // unique constraint guard
    }
  }

  // ============== LEAVE REQUESTS ==============
  const leaveDefs: Array<[string, string, string, number, number, number, string, string]> = [
    ['rafi@orgos.dev', 'Casual Leave', 'PENDING', 3, 4, 2, 'Family function in Chattogram.', ''],
    ['meher@orgos.dev', 'Sick Leave', 'PENDING', 1, 1, 1, 'Fever — will rest one day.', ''],
    ['tania@orgos.dev', 'Annual Leave', 'PENDING', 10, 14, 5, 'Short trip to Sylhet.', ''],
    ['lubna@orgos.dev', 'Casual Leave', 'PENDING', 6, 6, 1, 'Personal errand.', ''],
    ['zahin@orgos.dev', 'Casual Leave', 'APPROVED', -6, -5, 2, 'Wedding invitation.', 'farhan@orgos.dev'],
    ['imran@orgos.dev', 'Sick Leave', 'APPROVED', -12, -12, 1, 'Dentist appointment.', 'farhan@orgos.dev'],
    ['rafi@orgos.dev', 'Annual Leave', 'APPROVED', -20, -18, 3, 'Eid travel.', 'farhan@orgos.dev'],
    ['imran@orgos.dev', 'Casual Leave', 'REJECTED', -8, -8, 1, 'Release crunch that week.', 'farhan@orgos.dev'],
    ['nusrat@orgos.dev', 'Casual Leave', 'CANCELLED', 2, 2, 1, 'Changed plans.', ''],
  ]
  for (const [email, type, status, startIn, endIn, daysN, reason, approver] of leaveDefs) {
    await db.leaveRequest.create({
      data: {
        orgId: meridian.id, membershipId: member[email], leaveTypeId: ltIds[type],
        startDate: startIn < 0 ? daysAgo(-startIn) : daysAhead(startIn, 9),
        endDate: endIn < 0 ? daysAgo(-endIn) : daysAhead(endIn, 18),
        days: daysN, reason, status,
        approverMembershipId: approver ? member[approver] : null,
        decidedAt: status === 'PENDING' || status === 'CANCELLED' ? null : daysAgo(2),
        createdAt: daysAgo(5),
      },
    })
  }

  // ============== INVOICES ==============
  const invoiceItems = (rows: Array<[string, number, number]>) => JSON.stringify(rows.map(([description, qty, rate]) => ({ description, qty, rate })))
  const invDefs: Array<[string, string, string, number, number, string, string]> = [
    // number, client, status, subtotal, dueIn, itemsKey, paidAgo
    ['MER-INV-2025-001', 'GreenGrocer', 'PAID', 425000, -40, 'gg1', -45],
    ['MER-INV-2025-002', 'GreenGrocer', 'PAID', 425000, -12, 'gg2', -16],
    ['MER-INV-2025-003', 'EduPath', 'PAID', 480000, -60, 'ep1', -64],
    ['MER-INV-2025-004', 'EduPath', 'OVERDUE', 480000, -8, 'ep2', ''],
    ['MER-INV-2025-005', 'HealthBridge', 'OVERDUE', 150000, -3, 'hb1', ''],
    ['MER-INV-2025-006', 'EduPath', 'SENT', 240000, 10, 'ep3', ''],
    ['MER-INV-2025-007', 'GreenGrocer', 'SENT', 120000, 14, 'gg3', ''],
    ['MER-INV-2025-008', 'HealthBridge', 'SENT', 75000, 18, 'hb2', ''],
    ['MER-INV-2025-009', 'Skyline', 'SENT', 87500, 6, 'sk1', ''],
    ['MER-INV-2025-010', 'GreenGrocer', 'PARTIALLY_PAID', 300000, 12, 'gg4', ''],
    ['MER-INV-2025-011', 'UrbanCart', 'DRAFT', 200000, 25, 'uc1', ''],
  ]
  const itemSets: Record<string, Array<[string, number, number]>> = {
    gg1: [['Discovery & UX sprint', 1, 425000]],
    gg2: [['Commerce development — milestone 1', 1, 425000]],
    gg3: [['Change request: loyalty rules engine', 1, 120000]],
    gg4: [['Commerce development — milestone 2', 1, 300000]],
    ep1: [['LMS platform — phase 1 (50% advance)', 1, 480000]],
    ep2: [['LMS platform — phase 2 delivery', 1, 480000]],
    ep3: [['Content tools module', 1, 240000]],
    hb1: [['Brand identity package', 1, 150000]],
    hb2: [['Website maintenance retainer (Q4)', 3, 25000]],
    sk1: [['Website hosting & care plan', 1, 87500]],
    uc1: [['App discovery & prototype', 1, 200000]],
  }
  for (const [number, client, status, subtotal, dueIn, itemsKey, paidAgo] of invDefs) {
    const taxRate = 5
    const taxAmount = Math.round(subtotal * taxRate) / 100
    await db.invoice.create({
      data: {
        orgId: meridian.id, clientId: clientIds[client], number, status,
        items: invoiceItems(itemSets[itemsKey]), subtotal, taxRate, taxAmount, discount: 0,
        total: subtotal + taxAmount,
        issueDate: dueIn < -5 ? daysAgo(-dueIn - 5) : daysAgo(5),
        dueDate: dueIn < 0 ? daysAgo(-dueIn) : daysAhead(dueIn),
        paidAt: paidAgo ? daysAgo(-Number(paidAgo)) : null,
        projectId: client === 'GreenGrocer' ? projectIds['GreenGrocer E-commerce Platform'] : client === 'EduPath' ? projectIds['EduPath Learning Platform'] : null,
      },
    })
  }

  // ============== EXPENSES ==============
  const expDefs: Array<[string, string, string, string, number, number, number, string, string]> = [
    ['Client visit transport (GreenGrocer stores)', 'TRAVEL', 'rafi@orgos.dev', 'GreenGrocer E-commerce Platform', 2400, -3, 'SUBMITTED', '', 'Uber rides across 3 store visits.'],
    ['Design software seats (Q4)', 'SOFTWARE', 'tania@orgos.dev', '', 13500, -5, 'SUBMITTED', '', '2× Figma professional seats.'],
    ['Server costs — staging cluster', 'SOFTWARE', 'meher@orgos.dev', 'EduPath Learning Platform', 8600, -8, 'MANAGER_APPROVED', '', 'Hetzner CX41 + backups.'],
    ['Team lunch — sprint close', 'MEALS', 'maria@orgos.dev', '', 6800, -9, 'MANAGER_APPROVED', '', 'Sprint 14 celebration.'],
    ['QA devices (Android test phone)', 'EQUIPMENT', 'imran@orgos.dev', '', 21500, -12, 'FINANCE_APPROVED', '', 'Redmi for device farm.'],
    ['Meta ads — EduPath pilot campaign', 'MARKETING', 'zahin@orgos.dev', 'EduPath Learning Platform', 18000, -15, 'PAID', 'salma@orgos.dev', 'Lead-gen for pilot schools.'],
    ['Printed brand guidelines (HealthBridge)', 'OFFICE', 'tania@orgos.dev', 'HealthBridge Brand & Website', 9500, -35, 'PAID', 'salma@orgos.dev', '20 hard copies.'],
    [' Courier — contract documents', 'GENERAL', 'salma@orgos.dev', '', 650, -40, 'PAID', 'salma@orgos.dev', 'MSA delivery to GreenGrocer.'],
    ['Conference tickets — React Conf Dhaka', 'TRAINING', 'rafi@orgos.dev', '', 6000, -42, 'PAID', 'salma@orgos.dev', '2 tickets.'],
    ['Office coffee & supplies (month)', 'OFFICE', 'maria@orgos.dev', '', 4200, -28, 'PAID', 'salma@orgos.dev', ''],
    ['Stock photos subscription', 'SOFTWARE', 'lubna@orgos.dev', '', 3000, -22, 'PAID', 'salma@orgos.dev', 'Adobe Stock monthly.'],
    ['Client dinner — UrbanCart founders', 'MEALS', 'arif@orgos.dev', '', 9200, -6, 'REJECTED', 'salma@orgos.dev', 'Above policy limit without pre-approval.'],
    ['Home office chair allowance', 'EQUIPMENT', 'meher@orgos.dev', '', 7500, -18, 'PAID', 'salma@orgos.dev', 'Remote work policy.'],
  ]
  for (const [title, category, email, proj, amount, ago, status, approver, notes] of expDefs) {
    await db.expense.create({
      data: {
        orgId: meridian.id, membershipId: member[email], title, category, amount,
        projectId: proj ? projectIds[proj] : null, date: daysAgo(-ago), status,
        notes, approvedById: approver ? member[approver] : null, createdAt: daysAgo(-ago),
      },
    })
  }

  // ============== CRM ACTIVITIES ==============
  const actDefs: Array<[string, string, string, string, string, number, boolean]> = [
    ['LEAD', 'CALL', 'Intro call with Rehana', 'Discussed ordering app scope; will send deck.', 'rehana', 2, true],
    ['LEAD', 'EMAIL', 'Sent capabilities deck to Adnan', '', 'adnan', 3, true],
    ['LEAD', 'FOLLOWUP', 'Follow up with Jahidul', 'Instagram lead — quick call this week.', 'jahidul', 0, false],
    ['DEAL', 'MEETING', 'UrbanCart prototype walkthrough', 'Walked Shahriar through clickable prototype; positive.', 'urbancart', 1, true],
    ['DEAL', 'CALL', 'FinPro pricing negotiation', 'Budget confirmed at ৳900k if we include dashboards.', 'finpro', 2, true],
    ['DEAL', 'EMAIL', 'Skyline proposal sent', '', 'skyline', 4, true],
    ['DEAL', 'FOLLOWUP', 'Metro Foods — send revised quote', 'They want 10% discount; check with Salma.', 'metro', 0, false],
    ['DEAL', 'MEETING', 'TechNova intro meeting', 'Staff augmentation needs 3 engineers.', 'technova', 5, true],
    ['CLIENT', 'NOTE', 'GreenGrocer stakeholder change', 'New digital head is supportive of phase 2.', 'gg', 3, true],
    ['DEAL', 'EMAIL', 'Bengal Logistics — closing email', 'Confirmed they went with another vendor.', 'bengal', 22, true],
    ['CONTACT', 'CALL', 'Check-in with Nadia (EduPath)', 'Pilot school confirmed for handover plan.', 'nadia', 4, true],
    ['LEAD', 'EMAIL', 'Shirin — sent healthcare case study', '', 'shirin', 6, true],
  ]
  const entityIds: Record<string, string> = {
    rehana: leads[0].id, adnan: leads[5].id, jahidul: leads[9].id, shirin: leads[10].id,
    urbancart: dealRecords[3].id, finpro: dealRecords[4].id, skyline: dealRecords[5].id,
    metro: dealRecords[7].id, technova: dealRecords[8].id, bengal: dealRecords[11].id,
    gg: clientIds['GreenGrocer'], nadia: contactIds['Nadia Chowdhury'],
  }
  for (const [entityType, type, subject, notes, key, ago, done] of actDefs) {
    await db.crmActivity.create({
      data: {
        orgId: meridian.id, entityType, entityId: entityIds[key], type, subject, notes, done,
        createdById: member['arif@orgos.dev'], createdAt: daysAgo(-ago),
        dueDate: !done ? daysAhead(1, 11) : null,
      },
    })
  }

  // ============== ANNOUNCEMENTS ==============
  const annDefs: Array<[string, string, string, boolean, number]> = [
    ['Welcome to OrgOS 🎉', 'We have moved all operations into OrgOS — projects, CRM, HR and finance now live in one connected workspace. Explore the dashboard and let HR know if anything looks off.', 'owner@orgos.dev', true, -9],
    ['Q3 All-hands — Friday 4:00 PM', 'Agenda: Q3 results, GreenGrocer go-live plan, hiring pipeline and the new remote policy. Please add questions to the doc before Thursday.', 'maria@orgos.dev', false, -4],
    ['New leave policy effective this month', 'Annual leave balance now accrues monthly. Casual leave requests need 48h notice except emergencies. Full policy in Documents → Policies.', 'nusrat@orgos.dev', false, -7],
    ['GreenGrocer milestone 2 signed off ✅', 'Great work team — Core Commerce milestone accepted by client ahead of schedule. Next stop: integrations and migration.', 'farhan@orgos.dev', false, -2],
    ['Office closed — Victory Day (16 Dec)', 'The office will remain closed on 16 December. Client communications will resume the next working day.', 'nusrat@orgos.dev', false, -1],
  ]
  for (const [title, body, author, pinned, ago] of annDefs) {
    await db.announcement.create({
      data: { orgId: meridian.id, title, body, authorMembershipId: member[author], pinned, createdAt: daysAgo(-ago) },
    })
  }

  // ============== DOCUMENTS ==============
  const docDefs: Array<[string, string, string, string, number]> = [
    ['MSA — GreenGrocer (signed).pdf', 'Contracts', 'application/pdf', 483000, -62],
    ['SOW — EduPath Phase 2.pdf', 'Contracts', 'application/pdf', 391000, -30],
    ['MSA — HealthBridge (signed).pdf', 'Contracts', 'application/pdf', 350000, -148],
    ['NDA — UrbanCart.pdf', 'Contracts', 'application/pdf', 120000, -11],
    ['Employee Handbook 2025.pdf', 'Policies', 'application/pdf', 820000, -10],
    ['Remote & Hybrid Policy.pdf', 'Policies', 'application/pdf', 210000, -7],
    ['Leave Policy v3.pdf', 'Policies', 'application/pdf', 180000, -7],
    ['Information Security Policy.pdf', 'Policies', 'application/pdf', 340000, -100],
    ['Q3 Management Accounts.xlsx', 'Finance', 'application/vnd.ms-excel', 96000, -5],
    ['Revenue Forecast — FY2026.xlsx', 'Finance', 'application/vnd.ms-excel', 88400, -3],
    ['Tax Filing Acknowledgement.pdf', 'Finance', 'application/pdf', 15000, -90],
    ['GreenGrocer — Technical Architecture.fig', 'Projects', 'application/octet-stream', 15400000, -45],
    ['EduPath — Content Tools Spec.docx', 'Projects', 'application/msword', 220000, -20],
    ['HealthBridge — Brand Guidelines.pdf', 'Projects', 'application/pdf', 15400000, -110],
    ['UrbanCart — Prototype Link.txt', 'Projects', 'text/plain', 240, -9],
    ['Meridian — Case Study Engine Wireframes.fig', 'Projects', 'application/octet-stream', 2400000, -2],
    ['Offer Letter — Nafis Iqbal.docx', 'HR', 'application/msword', 64000, -32],
    ['Interview Rubric — Engineering.docx', 'HR', 'application/msword', 58000, -50],
  ]
  for (const [name, folder, mime, size, ago] of docDefs) {
    await db.document.create({
      data: {
        orgId: meridian.id, folder, name, mimeType: mime, size,
        uploadedById: member['nusrat@orgos.dev'], createdAt: daysAgo(-ago),
        storageKey: `r2://${meridian.slug}/${folder}/${name}`,
      },
    })
  }

  // ============== MEETINGS ==============
  const meetDefs: Array<[string, string, number, number, string]> = [
    ['GreenGrocer weekly sync', 'GreenGrocer E-commerce Platform', 0, 1, 'Progress review, payments integration status, migration plan.'],
    ['EduPath pilot preparation', 'EduPath Learning Platform', 1, 2, 'Finalize onboarding plan and training schedule.'],
    ['Meridian leadership review', '', 2, 4, 'Monthly business review: pipeline, utilization, hiring.'],
  ]
  for (const [title, proj, inDays, hour, agenda] of meetDefs) {
    await db.meeting.create({
      data: {
        orgId: meridian.id, title, projectId: proj ? projectIds[proj] : null,
        startsAt: daysAhead(inDays, hour), agenda, durationMins: 45,
        createdByMembershipId: member['maria@orgos.dev'],
        participants: [member['farhan@orgos.dev'], member['maria@orgos.dev']].join(','),
      },
    })
  }

  // ============== ACTIVITY LOG ==============
  const activityDefs: Array<[string, string, string, number, string]> = [
    ['arif@orgos.dev', 'deal.stage_changed', 'DEAL', -0.1, 'Arif Hossain moved deal "UrbanCart Mobile App" to Proposal'],
    ['rafi@orgos.dev', 'task.status_changed', 'TASK', -0.2, 'Rafi Islam moved task "Guest checkout form" to In Progress'],
    ['nusrat@orgos.dev', 'leave.requested', 'LEAVE', -0.3, 'Tania Sarkar requested 5 days of Annual Leave'],
    ['salma@orgos.dev', 'invoice.overdue', 'INVOICE', -0.4, 'Invoice MER-INV-2025-004 became overdue'],
    ['farhan@orgos.dev', 'milestone.completed', 'MILESTONE', -1.2, 'Milestone "UI/UX Design System" completed for GreenGrocer'],
    ['owner@orgos.dev', 'deal.won', 'DEAL', -1.5, 'Deal "GreenGrocer E-commerce Platform" marked Won — ৳850,000'],
    ['farhan@orgos.dev', 'project.created', 'PROJECT', -1.6, 'Project "GreenGrocer E-commerce Platform" created from won deal'],
    ['nusrat@orgos.dev', 'application.received', 'APPLICATION', -2.1, 'New application from Sadia Noor for Senior Backend Engineer'],
    ['meher@orgos.dev', 'task.completed', 'TASK', -2.3, 'Meherun Nesa completed "Integrate bKash payment gateway — sandbox setup"'],
    ['salma@orgos.dev', 'expense.paid', 'EXPENSE', -2.8, 'Expense "Meta ads — EduPath pilot campaign" marked paid'],
    ['maria@orgos.dev', 'announcement.published', 'ANNOUNCEMENT', -3.0, 'Maria Chowdhury published "Q3 All-hands — Friday 4:00 PM"'],
    ['arif@orgos.dev', 'lead.created', 'LEAD', -3.2, 'New lead "Shirin Sultana (Apex Healthcare)" from Website'],
    ['tania@orgos.dev', 'comment.created', 'TASK', -3.5, 'Tania Sarkar commented on "Develop cart & checkout frontend"'],
    ['imran@orgos.dev', 'attendance.checkin', 'ATTENDANCE', -0.6, 'Imran Shah checked in at 09:12'],
    ['rafi@orgos.dev', 'attendance.checkin', 'ATTENDANCE', -0.7, 'Rafi Islam checked in at 09:41'],
    ['farhan@orgos.dev', 'task.created', 'TASK', -4.1, 'Farhan Karim created "Go-live runbook" in GreenGrocer project'],
  ]
  for (const [email, action, entityType, agoDays, message] of activityDefs) {
    await db.activityLog.create({
      data: { orgId: meridian.id, actorMembershipId: member[email], action, entityType, message, createdAt: new Date(Date.now() - agoDays * day) },
    })
  }

  // ============== NOTIFICATIONS ==============
  const notifDefs: Array<[string, string, string, string, string, number, boolean]> = [
    ['owner@orgos.dev', 'CRM', 'Deal moved to Proposal', 'UrbanCart Mobile App — ৳600,000', 'crm-deals', -0.1, false],
    ['owner@orgos.dev', 'LEAVE', 'Leave request awaiting approval', 'Tania Sarkar requested 5 days Annual Leave', 'hr-leave', -0.3, false],
    ['owner@orgos.dev', 'FINANCE', 'Invoice overdue', 'MER-INV-2025-004 (EduPath) is 8 days overdue', 'finance-invoices', -0.4, false],
    ['owner@orgos.dev', 'RECRUITMENT', 'New job application', 'Sadia Noor applied for Senior Backend Engineer', 'recruit-candidates', -2.1, false],
    ['owner@orgos.dev', 'PROJECT', 'Milestone completed', 'GreenGrocer — "UI/UX Design System" done', 'projects', -1.2, true],
    ['owner@orgos.dev', 'SYSTEM', 'Welcome to OrgOS', 'Your workspace is ready. Invite your team and start connecting work.', 'dashboard', -9, true],
    ['rafi@orgos.dev', 'TASK', 'Task due soon', '"Develop cart & checkout frontend" is due in 3 days', 'my-tasks', -0.2, false],
    ['rafi@orgos.dev', 'TASK', 'You were mentioned', 'Tania mentioned you in a comment', 'my-tasks', -1, true],
    ['nusrat@orgos.dev', 'HR', '3 leave requests pending', 'Rafi, Meherun, Tania and Lubna await decisions', 'hr-leave', -0.3, false],
    ['salma@orgos.dev', 'FINANCE', 'Expense awaiting approval', '2 expenses submitted this week', 'finance-expenses', -0.5, false],
    ['farhan@orgos.dev', 'TASK', 'Task overdue', '"Accessibility audit (WCAG AA)" passed its due date', 'tasks', -0.1, false],
    ['arif@orgos.dev', 'CRM', 'Follow-up due today', 'Metro Foods — send revised quote', 'crm-deals', -0.2, false],
  ]
  for (const [email, type, title, body, module, agoDays, read] of notifDefs) {
    await db.notification.create({
      data: {
        orgId: meridian.id, userId: users[email].id, type, title, body, module,
        readAt: read ? new Date(Date.now() - agoDays * day + 3600000) : null,
        createdAt: new Date(Date.now() - agoDays * day),
      },
    })
  }

  // ============== AUDIT LOG (sample) ==============
  await db.auditLog.create({
    data: {
      orgId: meridian.id, actorMembershipId: member['nusrat@orgos.dev'],
      action: 'membership.updated', entity: 'Membership', entityId: member['rafi@orgos.dev'],
      oldValues: JSON.stringify({ department: 'Technology' }), newValues: JSON.stringify({ title: 'Senior Frontend Developer' }),
      createdAt: daysAgo(60),
    },
  })

  // ============== T3: MODULE ACCESS MATRIX (RBAC) ==============
  const MODULES = [
    'dashboard', 'reports', 'projects', 'tasks', 'crm-leads', 'crm-deals', 'crm-contacts',
    'hr-employees', 'hr-attendance', 'hr-leave', 'org-structure', 'recruit-jobs', 'recruit-candidates',
    'finance-invoices', 'finance-expenses', 'finance-payroll', 'documents', 'announcements', 'meetings',
  ] as const
  const fullFor = (exceptions: Record<string, string> = {}) =>
    Object.fromEntries(MODULES.map((m) => [m, exceptions[m] ?? 'FULL'])) as Record<string, string>
  // Mirrors DEFAULT_ACCESS in src/lib/server/access.ts (CONTRACTOR/INTERN = EMPLOYEE defaults)
  const EMPLOYEE_ACCESS: Record<string, string> = {
    dashboard: 'HIDDEN', reports: 'HIDDEN', projects: 'VIEW', tasks: 'VIEW',
    'crm-leads': 'HIDDEN', 'crm-deals': 'HIDDEN', 'crm-contacts': 'HIDDEN',
    'hr-employees': 'VIEW', 'hr-attendance': 'HIDDEN', 'hr-leave': 'FULL', 'org-structure': 'VIEW',
    'recruit-jobs': 'HIDDEN', 'recruit-candidates': 'HIDDEN',
    'finance-invoices': 'HIDDEN', 'finance-expenses': 'HIDDEN', 'finance-payroll': 'HIDDEN',
    documents: 'VIEW', announcements: 'VIEW', meetings: 'VIEW',
  }
  const ACCESS_MATRIX: Record<string, Record<string, string>> = {
    ADMIN: fullFor(),
    MANAGER: fullFor({ 'hr-employees': 'VIEW', 'hr-attendance': 'VIEW', 'org-structure': 'VIEW', 'finance-invoices': 'VIEW', 'finance-expenses': 'VIEW', 'finance-payroll': 'VIEW' }),
    HR: fullFor({ reports: 'VIEW', projects: 'VIEW', tasks: 'VIEW', 'crm-leads': 'VIEW', 'crm-deals': 'VIEW', 'crm-contacts': 'VIEW', 'finance-invoices': 'VIEW', 'finance-expenses': 'VIEW', 'finance-payroll': 'VIEW' }),
    FINANCE: fullFor({ projects: 'VIEW', tasks: 'VIEW', 'crm-leads': 'VIEW', 'crm-deals': 'VIEW', 'crm-contacts': 'VIEW', 'hr-employees': 'VIEW', 'hr-attendance': 'HIDDEN', 'hr-leave': 'VIEW', 'org-structure': 'VIEW', 'recruit-jobs': 'HIDDEN', 'recruit-candidates': 'HIDDEN', documents: 'VIEW', meetings: 'VIEW' }),
    EMPLOYEE: EMPLOYEE_ACCESS,
  }
  const meridianAccess: Array<{ orgId: string; module: string; role: string; level: string }> = []
  for (const [role, levels] of Object.entries(ACCESS_MATRIX)) {
    for (const [module, level] of Object.entries(levels)) {
      meridianAccess.push({ orgId: meridian.id, module, role, level })
    }
  }
  // Northwind: minimal — ADMIN FULL + EMPLOYEE defaults
  const northwindAccess: Array<{ orgId: string; module: string; role: string; level: string }> = [
    ...MODULES.map((m) => ({ orgId: northwind.id, module: m, role: 'ADMIN', level: 'FULL' })),
    ...MODULES.map((m) => ({ orgId: northwind.id, module: m, role: 'EMPLOYEE', level: EMPLOYEE_ACCESS[m] })),
  ]
  await db.moduleAccess.createMany({ data: [...meridianAccess, ...northwindAccess] })

  // ============== T3: ORG POLICY ==============
  await db.orgPolicy.create({
    data: {
      orgId: meridian.id,
      checkInTime: '09:30',
      latePenaltyEnabled: true, // T5 demo: 3 lates/month → half-day deduction
      latePenaltyThreshold: 3,
      latePenaltyMode: 'HALF_DAY',
    },
  })
  await db.orgPolicy.create({ data: { orgId: northwind.id, latePenaltyEnabled: true, latePenaltyMode: 'AMOUNT', latePenaltyAmount: 300 } })

  // ============== T5: HOLIDAY CALENDAR (both orgs) ==============
  // Bangladesh public holidays 2026 (template) + one company closure per org.
  const bdHolidays: Array<[string, number, number, number]> = [
    ['February 21 — Shaheed Day & International Mother Language Day', 2, 21, 1],
    ['Eid-ul-Fitr (day 1 of 3)', 3, 20, 3],
    ['Independence Day', 3, 26, 1],
    ['Pohela Boishakh — Bengali New Year', 4, 14, 1],
    ['May Day', 5, 1, 1],
    ['Eid-ul-Adha (day 1 of 3)', 5, 27, 3],
    ['National Mourning Day', 8, 15, 1],
    ['Ashura', 8, 25, 1],
    ['Durga Puja — Vijaya Dashami', 10, 20, 1],
    ['Victory Day', 12, 16, 1],
    ['Christmas Day', 12, 25, 1],
  ]
  for (const org of [meridian, northwind]) {
    await db.holiday.createMany({
      data: bdHolidays.map(([name, month, day, days]) => ({
        orgId: org.id,
        name,
        type: 'GOVT',
        startDate: new Date(2026, month - 1, day),
        endDate: new Date(2026, month - 1, day + days - 1),
        description: 'Bangladesh public holiday (2026 template)',
      })),
    })
  }
  await db.holiday.create({
    data: {
      orgId: meridian.id,
      name: 'Meridian Foundation Day',
      type: 'COMPANY',
      startDate: new Date(2026, 10, 1),
      endDate: new Date(2026, 10, 1),
      description: 'Company-wide foundation day off',
    },
  })

  // ============== T3: KANBAN BOARD COLUMNS (both orgs) ==============
  // TASK columns — colors map the TASK status tone palette (muted/slate, outline/slate, info/teal, warning/amber, success/emerald)
  const taskColumnDefs: Array<[string, string, number, boolean, boolean, string]> = [
    ['BACKLOG', 'Backlog', 0, false, false, '#94a3b8'],
    ['TODO', 'To do', 1, false, false, '#64748b'],
    ['IN_PROGRESS', 'In progress', 2, false, false, '#14b8a6'],
    ['REVIEW', 'Review', 3, false, false, '#f59e0b'],
    ['DONE', 'Done', 4, true, false, '#10b981'],
  ]
  // HIRING columns — colors follow the application stage tone palette
  const hiringColumnDefs: Array<[string, string, number, boolean, boolean, string]> = [
    ['APPLIED', 'Applied', 0, false, false, '#64748b'],
    ['SCREENING', 'Screening', 1, false, false, '#14b8a6'],
    ['SHORTLISTED', 'Shortlisted', 2, false, false, '#0d9488'],
    ['INTERVIEW', 'Interview', 3, false, false, '#f59e0b'],
    ['ASSESSMENT', 'Assessment', 4, false, false, '#fbbf24'],
    ['OFFER', 'Offer', 5, false, false, '#34d399'],
    ['HIRED', 'Hired', 6, true, false, '#059669'],
    ['REJECTED', 'Rejected', 7, false, true, '#f43f5e'],
  ]
  for (const org of [meridian, northwind]) {
    await db.boardColumn.createMany({
      data: [
        ...taskColumnDefs.map(([key, label, order, isDone, isRejected, color]) => ({ orgId: org.id, surface: 'TASK', key, label, order, isDone, isRejected, color })),
        ...hiringColumnDefs.map(([key, label, order, isDone, isRejected, color]) => ({ orgId: org.id, surface: 'HIRING', key, label, order, isDone, isRejected, color })),
      ],
    })
  }

  // ============== T3: LEAVE TYPES (paid flag) ==============
  // Existing types keep paid=true (schema default); add one unpaid type for Meridian
  const unpaidLeaveType = await db.leaveType.create({
    data: { orgId: meridian.id, name: 'Unpaid leave', daysPerYear: 5, color: '#64748b', paid: false },
  })
  ltIds['Unpaid leave'] = unpaidLeaveType.id

  // ============== T3: BASE SALARIES (BDT, monthly gross) ==============
  const baseSalaries: Record<string, number> = {
    'owner@orgos.dev': 250000, 'maria@orgos.dev': 180000, 'farhan@orgos.dev': 120000,
    'nusrat@orgos.dev': 85000, 'arif@orgos.dev': 120000, 'salma@orgos.dev': 80000,
    'rafi@orgos.dev': 60000, 'meher@orgos.dev': 48000, 'imran@orgos.dev': 42000,
    'tania@orgos.dev': 45000, 'zahin@orgos.dev': 35000, 'lubna@orgos.dev': 35000,
  }
  for (const [email, baseSalary] of Object.entries(baseSalaries)) {
    await db.membership.update({ where: { id: member[email] }, data: { baseSalary } })
  }

  // ============== T3: SALARY COMPONENTS ==============
  const componentDefs: Array<[string, string, string, number]> = [
    // email, label, kind, amount
    ['rafi@orgos.dev', 'Transport allowance', 'ALLOWANCE', 5000],
    ['meher@orgos.dev', 'Transport allowance', 'ALLOWANCE', 5000],
    ['imran@orgos.dev', 'Transport allowance', 'ALLOWANCE', 5000],
    ['owner@orgos.dev', 'Provident fund', 'DEDUCTION', 12500], // 5% of base
    ['maria@orgos.dev', 'Provident fund', 'DEDUCTION', 9000],
    ['farhan@orgos.dev', 'Provident fund', 'DEDUCTION', 6000],
    ['arif@orgos.dev', 'Provident fund', 'DEDUCTION', 6000],
    ['nusrat@orgos.dev', 'Provident fund', 'DEDUCTION', 4250],
    ['salma@orgos.dev', 'Provident fund', 'DEDUCTION', 4000],
    ['owner@orgos.dev', 'Tax withholding', 'DEDUCTION', 25000], // high earners only
    ['maria@orgos.dev', 'Tax withholding', 'DEDUCTION', 18000],
    ['farhan@orgos.dev', 'Tax withholding', 'DEDUCTION', 12000],
    ['arif@orgos.dev', 'Tax withholding', 'DEDUCTION', 12000],
  ]
  for (const [email, label, kind, amount] of componentDefs) {
    await db.salaryComponent.create({ data: { orgId: meridian.id, membershipId: member[email], label, kind, amount } })
  }

  // ============== T3: PREVIOUS-MONTH ATTENDANCE (payroll demo period) ==============
  // The existing block above generates the last 14 days only; the previous-month PayrollRun
  // needs attendance rows in ITS period, so we add the full previous calendar month (weekdays).
  // Existing generation above is untouched; overlapping dates are skipped via the unique guard.
  const pmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const pmDaysInMonth = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
  for (let dom = 1; dom <= pmDaysInMonth; dom++) {
    const date = new Date(pmStart.getFullYear(), pmStart.getMonth(), dom)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue
    for (let i = 0; i < employeeEmails.length; i++) {
      const email = employeeEmails[i]
      const roll = (i * 7 + dom * 3) % 10
      let status = 'PRESENT'
      let checkIn: Date | null = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, (i * 17 + dom * 7) % 40)
      let checkOut: Date | null = null
      if (roll === 3) { status = 'LATE'; checkIn = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 35 + (i % 20)) }
      if (roll === 7) { status = 'LEAVE'; checkIn = null }
      if (roll === 9) { status = 'ABSENT'; checkIn = null }
      if (checkIn && status !== 'LEAVE' && status !== 'ABSENT') {
        checkOut = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 20 + (i * 13) % 35)
      }
      const workedMinutes = checkIn && checkOut ? Math.round((checkOut.getTime() - checkIn.getTime()) / 60000) : null
      await db.attendance.create({
        data: {
          orgId: meridian.id, membershipId: member[email], date: dstr(date),
          checkIn, checkOut, status, workedMinutes,
          note: status === 'LATE' ? 'Traffic on Bijoy Sarani' : null,
        },
      }).catch(() => {}) // unique constraint guard
    }
  }

  // ============== T3: PAYROLL — ONE APPROVED UNPAID LEAVE + PREVIOUS-MONTH PAID RUN ==============
  const pm = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const pmEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999) // last day of previous month
  // one approved Unpaid leave request INSIDE the payroll period (lubna, 2 days)
  await db.leaveRequest.create({
    data: {
      orgId: meridian.id, membershipId: member['lubna@orgos.dev'], leaveTypeId: ltIds['Unpaid leave'],
      startDate: new Date(pm.getFullYear(), pm.getMonth(), 24, 9),
      endDate: new Date(pm.getFullYear(), pm.getMonth(), 25, 18),
      days: 2, reason: 'Personal trip — unpaid days', status: 'APPROVED',
      approverMembershipId: member['arif@orgos.dev'],
      decidedAt: new Date(pm.getFullYear(), pm.getMonth(), 20, 14),
      createdAt: new Date(pm.getFullYear(), pm.getMonth(), 18, 11),
    },
  })

  const period = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, '0')}` // "YYYY-MM"
  const runMembers = await db.membership.findMany({
    where: { orgId: meridian.id, status: 'ACTIVE' },
    include: { salaryComponents: true },
  })
  const allAttendance = await db.attendance.findMany({
    where: { orgId: meridian.id },
    select: { membershipId: true, date: true, status: true },
  })
  const periodStartStr = dstr(pm)
  const periodEndStr = dstr(pmEnd)
  const periodAttendance = allAttendance.filter((a) => a.date >= periodStartStr && a.date <= periodEndStr)
  const approvedLeaves = await db.leaveRequest.findMany({
    where: { orgId: meridian.id, status: 'APPROVED' },
    include: { leaveType: { select: { paid: true } } },
  })

  const payrollRun = await db.payrollRun.create({
    data: {
      orgId: meridian.id, period, status: 'PAID',
      note: 'Monthly payroll — previous cycle',
      createdById: member['salma@orgos.dev'],
      approvedById: member['maria@orgos.dev'],
      approvedAt: new Date(pm.getFullYear(), pm.getMonth(), 27, 16),
      paidAt: new Date(pm.getFullYear(), pm.getMonth(), 28, 11),
      createdAt: new Date(pm.getFullYear(), pm.getMonth(), 26, 10),
    },
  })

  for (const m of runMembers) {
    const base = m.baseSalary ?? 0
    const allowances = m.salaryComponents.filter((c) => c.kind === 'ALLOWANCE').reduce((s, c) => s + c.amount, 0)
    const fixedDeductions = m.salaryComponents.filter((c) => c.kind === 'DEDUCTION').reduce((s, c) => s + c.amount, 0)
    const myAtt = periodAttendance.filter((a) => a.membershipId === m.id)
    const presentDays = myAtt.filter((a) => a.status === 'PRESENT').length
    const lateDays = myAtt.filter((a) => a.status === 'LATE').length
    const absentDays = myAtt.filter((a) => a.status === 'ABSENT').length
    const unpaidLeaveDays = approvedLeaves
      .filter((lr) => lr.membershipId === m.id && !lr.leaveType.paid && lr.startDate <= pmEnd && lr.endDate >= pm)
      .reduce((s, lr) => s + lr.days, 0)
    const unpaidLeaveAmount = Math.round((base / 30) * unpaidLeaveDays)
    const gross = base + allowances
    const net = gross - fixedDeductions - unpaidLeaveAmount
    const breakdown = JSON.stringify([
      { label: 'Base salary', kind: 'BASE', amount: base },
      ...m.salaryComponents.map((c) => ({ label: c.label, kind: c.kind, amount: c.amount })),
      ...(unpaidLeaveDays > 0 ? [{ label: `Unpaid leave (${unpaidLeaveDays} days)`, kind: 'DEDUCTION', amount: unpaidLeaveAmount }] : []),
    ])
    await db.payslip.create({
      data: {
        runId: payrollRun.id, membershipId: m.id,
        baseSalary: base, allowances, deductions: fixedDeductions,
        unpaidLeaveDays, unpaidLeaveAmount, gross, net,
        presentDays, absentDays, lateDays, breakdown,
        createdAt: new Date(pm.getFullYear(), pm.getMonth(), 26, 12),
      },
    })
  }

  // ============== T3: ATTENDANCE SESSIONS (derived from attendance rows with check-in + check-out) ==============
  // NOTE: `{ not: null }` filters are rejected by this Prisma/SQLite client — filter in JS.
  const sessionSource = (await db.attendance.findMany({
    where: { orgId: meridian.id },
    select: { id: true, membershipId: true, checkIn: true, checkOut: true },
  })).filter((a) => a.checkIn && a.checkOut)
  for (const a of sessionSource) {
    const minutes = Math.round((a.checkOut!.getTime() - a.checkIn!.getTime()) / 60000)
    await db.attendanceSession.create({
      data: {
        orgId: meridian.id, membershipId: a.membershipId, attendanceId: a.id,
        checkIn: a.checkIn!, checkOut: a.checkOut!, minutes,
      },
    })
  }

  // ============== T3: SESSION TASK ENTRIES (samples on recent sessions) ==============
  const memberEmailById: Record<string, string> = {}
  for (const [email, membershipId] of Object.entries(member)) memberEmailById[membershipId] = email
  const taskEntryDefs: Record<string, Array<[string, number, string]>> = {
    // email -> [task title, minutes, note][]
    'rafi@orgos.dev': [
      ['Develop cart & checkout frontend', 120, 'Built guest checkout form states'],
      ['Parent portal dashboard', 75, 'Grades and attendance cards'],
    ],
    'meher@orgos.dev': [
      ['Integrate bKash payment gateway', 110, 'Webhook handler + reconciliation'],
      ['Live class WebRTC tuning', 60, 'Simulcast layer experiments'],
    ],
    'imran@orgos.dev': [
      ['Checkout E2E test suite', 90, 'Stabilized cart→payment flow'],
      ['Migrate 12k SKUs from legacy ERP', 45, 'Dry-run image mapping fixes'],
    ],
    'tania@orgos.dev': [
      ['Accessibility audit (WCAG AA)', 105, 'Focus states and contrast fixes'],
      ['Clickable app prototype', 50, 'Prototype flow polish'],
    ],
    'farhan@orgos.dev': [
      ['Go-live runbook', 60, 'Rollback plan draft'],
      ['Technical architecture proposal', 80, 'RN vs Flutter trade-offs'],
    ],
    'maria@orgos.dev': [
      ['Pilot school onboarding plan', 70, 'Teacher training schedule'],
      ['Quarterly OKR planning doc', 55, 'Q4 objectives draft'],
    ],
    'nusrat@orgos.dev': [['Update employee handbook (2025)', 65, 'Hybrid policy section']],
    'zahin@orgos.dev': [['Prepare Eid campaign brief for clients', 45, 'Drafted one-pager']],
    'lubna@orgos.dev': [
      ['Teacher training deck', 90, 'Exercise sections'],
      ['Agency positioning copy', 60, 'Homepage narrative'],
    ],
  }
  const recentCutoff = new Date(Date.now() - 10 * day)
  const recentSessions = await db.attendanceSession.findMany({
    where: { orgId: meridian.id, checkIn: { gte: recentCutoff } },
    orderBy: { checkIn: 'desc' },
  })
  let entriesCreated = 0
  for (const s of recentSessions) {
    if (entriesCreated >= 24) break
    const email = memberEmailById[s.membershipId]
    const defs = email ? taskEntryDefs[email] : undefined
    if (!defs) continue
    const [title, minutes, note] = defs[entriesCreated % defs.length]
    const taskId = taskIds[title]
    if (!taskId) continue
    await db.sessionTaskEntry.create({ data: { sessionId: s.id, taskId, minutes, note } })
    entriesCreated++
  }

  console.log('✅ Seed complete')
  console.log('   Org 1:', meridian.name, meridian.id)
  console.log('   Org 2:', northwind.name, northwind.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
