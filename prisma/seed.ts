import { PrismaClient } from '@prisma/client';
import type { ApplicationStatus, DocType, PaymentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Wipe everything in FK-safe order so `npm run seed` always yields a known-good state. */
async function clean() {
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

const REQUIRED_DOCS: DocType[] = ['PASSPORT', 'AADHAR', 'ACADEMICS', 'IELTS'];

async function main() {
  await clean();

  // Demo users (password: Password1!)
  const passwordHash = await bcrypt.hash('Password1!', 10);

  await prisma.user.create({
    data: { email: 'admin@flytogether.com', passwordHash, role: 'ADMIN' },
  });

  const agentUser = await prisma.user.create({
    data: { email: 'agent@flytogether.com', passwordHash, role: 'AGENT', agent: { create: { name: 'Premium Agent' } } },
    include: { agent: true },
  });
  const agentId = agentUser.agent!.id;

  // ---- Students + their course applications (so the admin queue is populated) ----
  type DemoStudent = {
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
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
      email: 'alex.j@example.com', firstName: 'Alex', lastName: 'Johnson', phoneNumber: '+91 98200 11001',
      profileCompletion: 100, completed: true, withDocs: true, agent: true,
      application: { universityName: 'University of Oxford', course: 'Computer Science', status: 'VERIFICATION' },
    },
    {
      email: 'maria.g@example.com', firstName: 'Maria', lastName: 'Garcia', phoneNumber: '+91 98200 11002',
      profileCompletion: 100, completed: true, withDocs: true, agent: true,
      application: { universityName: 'Imperial College London', course: 'Engineering', status: 'APPLICATION' },
    },
    {
      email: 'chen.w@example.com', firstName: 'Chen', lastName: 'Wei', phoneNumber: '+91 98200 11003',
      profileCompletion: 55, completed: false, withDocs: false, agent: false,
      application: { universityName: 'University of Manchester', course: 'Physics', status: 'DOCUMENTS' },
    },
    {
      email: 'sarah.m@example.com', firstName: 'Sarah', lastName: 'Miller', phoneNumber: '+91 98200 11004',
      profileCompletion: 100, completed: true, withDocs: true, agent: true,
      application: {
        universityName: 'University College London', course: 'Business Analytics', status: 'PAYMENT',
        paymentStatus: 'PENDING', paymentLink: 'https://pay.flytogether.com/inv/LFT-2024-8892',
      },
    },
  ];

  for (const d of demoStudents) {
    const user = await prisma.user.create({
      data: {
        email: d.email, passwordHash, role: 'STUDENT', phoneNumber: d.phoneNumber,
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
              ? { create: REQUIRED_DOCS.map((docType) => ({
                  docType,
                  docUrl: `seed/${d.firstName.toLowerCase()}-${docType.toLowerCase()}.pdf`,
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
      await prisma.application.create({
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
              ...(a.status !== 'PROFILE' ? [{ action: `STATUS_${a.status}`, actionTakenBy: agentUser.id }] : []),
            ],
          },
        },
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
