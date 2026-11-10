import { z } from 'zod';

// Application-level validation mirrors the database constraints, so users get
// field-level messages; the database constraints remain the final guarantee.
const level = z.coerce.number().int().min(1).max(5);
const url = z.string().trim().regex(/^https?:\/\/\S+$/, 'Must start with http:// or https://').max(300);
const optionalUrl = z.union([url, z.literal('').transform(() => null), z.null()]).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalDate = z.union([isoDate, z.literal('').transform(() => null), z.null()]).optional();

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string()
    .min(8, 'Use at least 8 characters')
    .max(72, 'Use at most 72 characters')
    .regex(/[A-Za-z]/, 'Include a letter')
    .regex(/\d/, 'Include a number'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  educationLevel: z.enum(['high_school', 'diploma', 'bachelors', 'masters', 'phd', 'other']).nullable().optional(),
  institution: z.string().trim().max(150).nullable().optional(),
  graduationYear: z.coerce.number().int().min(1980).max(2040).nullable().optional(),
  interests: z.array(z.string().trim().min(2).max(40)).max(15).default([]),
  bio: z.string().trim().max(1000).nullable().optional(),
  weeklyHours: z.coerce.number().int().min(1).max(80),
});

export const goalSchema = z.object({
  roleId: z.coerce.number().int().positive(),
  targetDate: optionalDate,
});

export const userSkillSchema = z.object({
  skillId: z.coerce.number().int().positive(),
  claimedLevel: level,
});

export const projectSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  repoUrl: optionalUrl,
  startedOn: optionalDate,
  completedOn: optionalDate,
  skillIds: z.array(z.coerce.number().int().positive()).max(20).default([]),
}).refine((p) => !p.startedOn || !p.completedOn || p.completedOn >= p.startedOn,
  { message: 'Completion date must be on or after the start date', path: ['completedOn'] });

export const evidenceSchema = z.object({
  skillId: z.coerce.number().int().positive(),
  projectId: z.string().uuid().nullable().optional(),
  kind: z.enum(['certificate', 'repository', 'project', 'assessment', 'publication']),
  title: z.string().trim().min(3).max(150),
  url: optionalUrl,
  demonstratedLevel: level,
}).refine((e) => e.url || e.projectId, { message: 'Add a link or choose a project', path: ['url'] });

export const reviewSchema = z.object({
  decision: z.enum(['verified', 'rejected']),
  note: z.string().trim().max(500).optional(),
});

export const importSkillsSchema = z.object({
  skills: z.array(z.object({ skillId: z.coerce.number().int().positive(), claimedLevel: level })).min(1).max(60),
  applyProfile: z.object({ educationLevel: z.string().nullable().optional() }).optional(),
});

export const itemStatusSchema = z.object({ status: z.enum(['todo', 'doing', 'done']) });

export const skillCatalogSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(['language', 'frontend', 'backend', 'data', 'ml', 'devops', 'cloud', 'database', 'foundation', 'soft']),
  description: z.string().trim().min(10).max(1000),
  aliases: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  effortHours: z.coerce.number().int().min(1).max(400),
});

export const prerequisiteSchema = z.object({
  skillId: z.coerce.number().int().positive(),
  prereqSkillId: z.coerce.number().int().positive(),
  strength: z.coerce.number().gt(0).max(1).default(1),
});

export const jobIngestSchema = z.object({
  title: z.string().trim().min(3).max(150),
  company: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(120),
  workMode: z.enum(['onsite', 'remote', 'hybrid']),
  description: z.string().trim().min(30).max(5000),
  requiredSkills: z.array(z.string().trim().min(1)).min(1).max(25),
  optionalSkills: z.array(z.string().trim().min(1)).max(25).default([]),
  roleTitle: z.string().trim().max(100).nullable().optional(),
  salaryMin: z.coerce.number().positive().max(999).nullable().optional(),
  salaryMax: z.coerce.number().positive().max(999).nullable().optional(),
});

export const userAdminSchema = z.object({
  role: z.enum(['student', 'mentor', 'admin']).optional(),
  isActive: z.boolean().optional(),
});

export const weightsSchema = z.object({
  weights: z.partialRecord(z.enum(['demand', 'relevance', 'gap', 'readiness', 'interest', 'evidence', 'ease']), z.coerce.number().min(0).max(1)),
});
