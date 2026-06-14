import { PrismaClient } from '@prisma/client';
import type { ApplicationStatus, DocType, AcademicSubType, PaymentStatus, Gender } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();

/** Wipe everything in FK-safe order so `npm run seed` always yields a known-good state. */
async function clean() {
  await prisma.notification.deleteMany();
  await prisma.applicationTimeline.deleteMany();
  await prisma.application.deleteMany();
  await prisma.studentDocument.deleteMany();
  await prisma.loanApplication.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.student.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.course.deleteMany();
  await prisma.university.deleteMany();
  await prisma.accommodation.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.blog.deleteMany();
  await prisma.testimonial.deleteMany();
}

// Identity/test docs plus academic certificates (subtypes of ACADEMICS).
const SEED_DOCS: { docType: DocType; subType?: AcademicSubType }[] = [
  { docType: 'PASSPORT' },
  { docType: 'AADHAR' },
  { docType: 'IELTS' },
  { docType: 'ACADEMICS', subType: 'TENTH' },
  { docType: 'ACADEMICS', subType: 'TWELFTH' },
  { docType: 'ACADEMICS', subType: 'GRADUATION' },
];

const docKey = (firstName: string, d: { docType: DocType; subType?: AcademicSubType }) =>
  `seed/${firstName.toLowerCase()}-${d.docType.toLowerCase()}${d.subType ? '-' + d.subType.toLowerCase() : ''}.pdf`;

const STATUS_TITLES: Record<string, string> = {
  DOCUMENT_VERIFIED: 'Documents verified',
  SENT_TO_UNIVERSITY: 'Sent to university',
  PENDING_WITH_UNIVERSITY: 'Pending with university',
  VERIFIED_BY_UNIVERSITY: 'Verified by university',
  PAYMENT_PENDING: 'Payment pending',
  COMPLETED: 'Application completed',
  REJECTED: 'Application rejected',
};

async function main() {
  await clean();

  // Demo users (password: Password1!)
  const passwordHash = await bcrypt.hash('Password1!', 10);

  await prisma.user.create({
    data: { email: 'admin@flytogether.com', passwordHash, role: 'ADMIN', gender: 'OTHERS' },
  });

  const agentUser = await prisma.user.create({
    data: { email: 'agent@flytogether.com', passwordHash, role: 'AGENT', gender: 'FEMALE', agent: { create: { name: 'Premium Agent' } } },
    include: { agent: true },
  });
  const agentId = agentUser.agent!.id;

  // ---- Students + their course applications (so the admin queue is populated) ----
  type DemoStudent = {
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    gender: Gender;
    profileCompletion: number;
    completed: boolean;
    withDocs: boolean;
    agent: boolean;
    application?: {
      universityName: string;
      course: string;
      status: ApplicationStatus;
      paymentStatus?: PaymentStatus;
      paymentLink?: string;
    };
  };

  const demoStudents: DemoStudent[] = [
    {
      email: 'alex.j@example.com', firstName: 'Alex', lastName: 'Johnson', phoneNumber: '+91 98200 11001', gender: 'MALE',
      profileCompletion: 100, completed: true, withDocs: true, agent: true,
      application: { universityName: 'University of Oxford', course: 'Computer Science', status: 'DOCUMENT_VERIFIED' },
    },
    {
      email: 'maria.g@example.com', firstName: 'Maria', lastName: 'Garcia', phoneNumber: '+91 98200 11002', gender: 'FEMALE',
      profileCompletion: 100, completed: true, withDocs: true, agent: true,
      application: { universityName: 'Imperial College London', course: 'Engineering', status: 'SENT_TO_UNIVERSITY' },
    },
    {
      email: 'chen.w@example.com', firstName: 'Chen', lastName: 'Wei', phoneNumber: '+91 98200 11003', gender: 'MALE',
      profileCompletion: 55, completed: false, withDocs: false, agent: false,
      application: { universityName: 'University of Manchester', course: 'Physics', status: 'CREATED' },
    },
    {
      email: 'sarah.m@example.com', firstName: 'Sarah', lastName: 'Miller', phoneNumber: '+91 98200 11004', gender: 'FEMALE',
      profileCompletion: 100, completed: true, withDocs: true, agent: true,
      application: {
        universityName: 'University College London', course: 'Business Analytics', status: 'PAYMENT_PENDING',
        paymentStatus: 'PENDING', paymentLink: 'https://pay.flytogether.com/inv/LFT-2024-8892',
      },
    },
  ];

  // Write placeholder PDF files so signed-URL previews work in dev.
  const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
  const minimalPdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 72 720 Td (Demo Document) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
    'xref\n0 6\n0000000000 65535 f \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n9\n%%EOF\n',
    'utf8',
  );
  await fs.mkdir(path.join(uploadDir, 'seed'), { recursive: true });
  for (const d of demoStudents) {
    if (!d.withDocs) continue;
    for (const spec of SEED_DOCS) {
      await fs.writeFile(path.join(uploadDir, docKey(d.firstName, spec)), minimalPdf);
    }
  }

  for (const d of demoStudents) {
    const user = await prisma.user.create({
      data: {
        email: d.email, passwordHash, role: 'STUDENT', phoneNumber: d.phoneNumber, gender: d.gender,
        student: {
          create: {
            firstName: d.firstName, lastName: d.lastName,
            dob: new Date('2002-05-14'), address: '221B Baker Street, Mumbai',
            profileCompletion: d.profileCompletion,
            isProfileCompleted: d.completed,
            isProfileVerified: d.agent && d.completed,
            isDocSubmitted: d.withDocs,
            agentId: d.agent ? agentId : null,
            documents: d.withDocs
              ? { create: SEED_DOCS.map((spec) => ({
                  docType: spec.docType,
                  subType: spec.subType ?? null,
                  docUrl: docKey(d.firstName, spec),
                  status: 'VERIFIED',
                })) }
              : undefined,
          },
        },
      },
      include: { student: true },
    });

    if (d.application) {
      const a = d.application;
      const created = await prisma.application.create({
        data: {
          studentId: user.student!.id,
          universityName: a.universityName,
          course: a.course,
          status: a.status,
          paymentStatus: a.paymentStatus ?? 'PENDING',
          paymentLink: a.paymentLink ?? null,
          timeline: {
            create: [
              { action: 'CREATED', actionTakenBy: user.id },
              ...(a.status !== 'CREATED' ? [{ action: `STATUS_${a.status}`, actionTakenBy: agentUser.id }] : []),
            ],
          },
        },
      });

      // Seed matching notifications (the latest one left unread for demo).
      const ctx = `${a.universityName} — ${a.course}`;
      const notifs: { title: string; message: string; read: boolean }[] = [
        { title: 'Application created', message: `Your application for ${ctx} was submitted.`, read: true },
      ];
      if (a.status !== 'CREATED') {
        const label = STATUS_TITLES[a.status] ?? a.status;
        notifs.push({ title: label, message: `Your application for ${ctx} is now “${label}”.`, read: false });
      }
      await prisma.notification.createMany({
        data: notifs.map((n) => ({ userId: user.id, applicationId: created.id, ...n })),
      });
    }
  }

  // Universities (from mockUniversities)
  const universities = [
    { name: 'University of Oxford', location: 'Oxford, UK', logo: 'https://logo.clearbit.com/ox.ac.uk', rating: 4.9, tuitionFee: '£28,000 - £45,000', description: 'The oldest university in the English-speaking world.', courses: ['Computer Science', 'Philosophy', 'Medicine'] },
    { name: 'Imperial College London', location: 'London, UK', logo: 'https://logo.clearbit.com/imperial.ac.uk', rating: 4.8, tuitionFee: '£32,000 - £50,000', description: 'A world-class university focusing on science, engineering, medicine and business.', courses: ['Engineering', 'Business', 'Natural Sciences'] },
    { name: 'University of Manchester', location: 'Manchester, UK', logo: 'https://logo.clearbit.com/manchester.ac.uk', rating: 4.6, tuitionFee: '£22,000 - £35,000', description: 'A prestigious Red Brick university with a rich heritage.', courses: ['Physics', 'Economics', 'Arts'] },
  ];
  for (const u of universities) {
    const { courses, ...rest } = u;
    await prisma.university.create({ data: { ...rest, courses: { create: courses.map((name) => ({ name })) } } });
  }

  // Service providers (from mockServices)
  await prisma.serviceProvider.createMany({ data: [
    { name: 'Royal Rahi Logistics', category: 'LOGISTICS', rating: 4.9, price: 'Price per KG', image: 'https://picsum.photos/seed/truck/400/300', description: 'Safe and secure shipping for your baggage and documents worldwide.' },
    { name: 'UniSafe Payments', category: 'ONLINE_PAYMENT', rating: 4.9, price: 'Zero Fee', image: 'https://picsum.photos/seed/finance/400/300', description: 'Secure tuition fee payments and currency exchange services for students.' },
    { name: 'SkyHigh Travels', category: 'TICKET_BOOKING', rating: 4.8, price: 'Student Deals', image: 'https://picsum.photos/seed/travel/400/300', description: 'Special student fares for international and domestic flights.' },
    { name: 'Student Comforts', category: 'ACCOMMODATION', rating: 4.7, price: 'From £120/week', image: 'https://picsum.photos/seed/house/400/300', description: 'Premium student housing near major universities.' },
  ] });

  // Accommodations (illustrative; FE Accommodation screen)
  await prisma.accommodation.createMany({ data: [
    { name: 'Oxford Student Lodge', city: 'Oxford', universityProximity: 'University of Oxford', price: 'From £150/week', type: 'Studio', amenities: ['WiFi', 'Laundry', 'Gym'], image: 'https://picsum.photos/seed/acc1/400/300', description: 'Modern studios near campus.' },
    { name: 'London City Rooms', city: 'London', universityProximity: 'Imperial College London', price: 'From £220/week', type: 'Shared', amenities: ['WiFi', 'Kitchen'], image: 'https://picsum.photos/seed/acc2/400/300', description: 'Affordable shared housing in central London.' },
  ] });

  // Home partners (from mockHomePartners)
  await prisma.partner.createMany({ data: [
    { name: 'Avila University', imageUrl: 'https://universitysearch-jvqc.onrender.com/icons/Avila_university.png', redirectionUrl: 'https://universitysearch-jvqc.onrender.com/pdfs/a5eTf000000IjhTIAS.pdf' },
    { name: 'The Language Gallery Canada', imageUrl: 'https://universitysearch-jvqc.onrender.com/icons/the_language_gallery_canada.png', redirectionUrl: 'https://universitysearch-jvqc.onrender.com/pdfs/Canada.pdf' },
    { name: 'BSBI Berlin', imageUrl: 'https://universitysearch-jvqc.onrender.com/icons/school_of_business_innovation.png', redirectionUrl: 'https://universitysearch-jvqc.onrender.com/pdfs/BSBI_SPAIN_MASTER_SLIDES.pdf' },
  ] });

  // Blogs (from mockBlogPosts)
  await prisma.blog.createMany({ data: [
    { title: 'Top 5 UK Universities for 2024 International Students', slug: 'top-5-uk-universities-2024', excerpt: 'Explore the best picks for academic excellence, student life, and career prospects in the United Kingdom this year.', content: 'Choosing the right university is a pivotal decision...', coverImage: 'https://images.pexels.com/photos/32752097/pexels-photo-32752097.jpeg', author: 'UniFlow Editorial', category: 'Education', readTime: '6 min read' },
    { title: 'How to Secure an Education Loan without Collateral', slug: 'education-loan-no-collateral', excerpt: 'Detailed guide on financing your overseas education through student loans with favorable terms.', content: 'Financial barriers should not stop your dreams...', coverImage: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f', author: 'Finance Team', category: 'Finance', readTime: '8 min read' },
  ] });

  // Testimonials (from mockTestimonials)
  await prisma.testimonial.createMany({ data: [
    { studentName: 'Aarav Sharma', universityName: 'University of Oxford', content: 'The journey from application to arrival was seamless.', mediaUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6', mediaType: 'IMAGE', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aarav' },
    { studentName: 'Priya Patel', universityName: 'Imperial College London', content: 'Getting my visa and student loan was easy with the team.', mediaUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330', mediaType: 'IMAGE', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya' },
    { studentName: 'Michael Chen', universityName: 'University of Manchester', content: 'The logistics service was a lifesaver.', mediaUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d', mediaType: 'IMAGE', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael' },
  ] });

  console.log('Seed complete.');
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
