import { z } from 'zod';

// ── Auth ────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().trim().min(2).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('A valid email is required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Invalid token'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

// ── Enums ───────────────────────────────────────────────────────────
export const roleEnum = z.enum(['user', 'agent', 'team_lead', 'admin']);
export const priorityEnum = z.enum(['low', 'medium', 'high']);
export const statusEnum = z.enum(['open', 'in_progress', 'closed']);

// ── Tickets ─────────────────────────────────────────────────────────
const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(15);

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(150),
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(5000),
  priority: priorityEnum.default('medium'),
  category: z.string().trim().max(80).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  assigneeIds: z.array(z.string().uuid()).max(20).optional(),
  tags: tagsSchema.optional(),
});

export const updateTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(150).optional(),
    message: z.string().trim().min(5).max(5000).optional(),
    priority: priorityEnum.optional(),
    status: statusEnum.optional(),
    category: z.string().trim().max(80).optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    assigneeIds: z.array(z.string().uuid()).max(20).optional(),
    tags: tagsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const bulkTicketSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['status', 'delete', 'assign']),
  status: statusEnum.optional(),
  assigneeIds: z.array(z.string().uuid()).max(20).optional(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(120).nullable(),
});

const slaTargetSchema = z.object({
  response: z.coerce.number().int().min(1).max(100000),
  resolution: z.coerce.number().int().min(1).max(1000000),
});
export const updateSlaSchema = z.object({
  high: slaTargetSchema,
  medium: slaTargetSchema,
  low: slaTargetSchema,
});

export const exportFiltersSchema = z.object({
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  departmentId: z.string().uuid().optional(),
  tag: z.string().trim().max(30).optional(),
  search: z.string().trim().max(120).optional(),
});

export const listTicketsQuerySchema = z.object({
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  departmentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  scope: z.enum(['all', 'mine', 'unassigned', 'created']).optional(),
  search: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(30).optional(),
});

export const createReplySchema = z.object({
  message: z.string().trim().min(1, 'Reply message is required').max(5000),
  isInternal: z.boolean().optional().default(false),
});

export const csatSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const createCannedSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(120),
  body: z.string().trim().min(2).max(5000),
  departmentId: z.string().uuid().optional().nullable(),
});

export const updateCannedSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    body: z.string().trim().min(2).max(5000).optional(),
    departmentId: z.string().uuid().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export const assignTicketSchema = z.object({
  assigneeIds: z.array(z.string().uuid()).max(20),
});

// ── Departments ─────────────────────────────────────────────────────
export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().trim().max(300).optional().nullable(),
  memberIds: z.array(z.string().uuid()).max(100).optional(),
});

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(300).optional().nullable(),
    memberIds: z.array(z.string().uuid()).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// ── User management (admin) ─────────────────────────────────────────
export const createUserSchema = z.object({
  email: z.string().email('A valid email is required'),
  fullName: z.string().trim().min(2).max(120).optional(),
  role: roleEnum.default('agent'),
  departmentIds: z.array(z.string().uuid()).max(100).optional(),
});

export const updateUserSchema = z
  .object({
    role: roleEnum.optional(),
    fullName: z.string().trim().min(2).max(120).optional().nullable(),
    departmentIds: z.array(z.string().uuid()).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listUsersQuerySchema = z.object({
  role: roleEnum.optional(),
  departmentId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});

export type Role = z.infer<typeof roleEnum>;
