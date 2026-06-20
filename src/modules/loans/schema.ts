import { z } from 'zod';

const documentSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.string().optional(),
  url: z.string().nullable().optional(),
});

const documentGroupSchema = z.object({
  category: z.string(),
  label: z.string(),
  documents: z.array(documentSchema),
});

const personalInfoSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dob: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  aadhar: z.string().optional(),
  pan: z.string().optional(),
}).optional();

const educationInfoSchema = z.object({
  universityName: z.string().optional(),
  course: z.string().optional(),
  country: z.string().optional(),
  intakeYear: z.string().optional(),
  intakeSemester: z.string().optional(),
}).optional();

const financialInfoSchema = z.object({
  monthlyIncome: z.string().optional(),
  existingEMIs: z.string().optional(),
  collateral: z.string().optional(),
}).optional();

const guarantorSchema = z.object({
  relation: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  mobile: z.string().optional(),
  aadhar: z.string().optional(),
  pan: z.string().optional(),
}).optional();

const coApplicantSchema = z.object({
  relation: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  mobile: z.string().optional(),
  aadhar: z.string().optional(),
  pan: z.string().optional(),
}).optional();

export const createLoanSchema = z.object({
  body: z.object({
    amount: z.string().min(1),
    details: z.object({
      loanPurpose: z.string().optional(),
      personalInfo: personalInfoSchema,
      educationInfo: educationInfoSchema,
      financialInfo: financialInfoSchema,
      guarantor: guarantorSchema,
      coApplicant: coApplicantSchema,
      documentGroups: z.array(documentGroupSchema).optional(),
    }).optional(),
  }),
});

export const updateLoanStatusSchema = z.object({
  body: z.object({
    status: z.string().min(1),
    reason: z.string().optional(),
    documentRequest: z.object({
      reason: z.string().min(1),
      docs: z.array(z.string()).min(1),
    }).optional(),
  }),
});

export const updateDocumentStatusSchema = z.object({
  body: z.object({ status: z.string().min(1) }),
});
