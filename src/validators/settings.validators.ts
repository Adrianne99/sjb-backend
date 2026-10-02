import { z } from "zod";

/** Grading is configuration-driven — nothing about the scale is hard-coded. */
export const gradingConfigSchema = z
  .object({
    scaleLabel: z.string().trim().min(1).max(100),
    minGrade: z.coerce.number(),
    maxGrade: z.coerce.number(),
    passingGrade: z.coerce.number(),
    /** false for the 1.00–5.00 college scale (1.00 is best); true for 0–100 percentages. */
    higherIsBetter: z.boolean(),
    decimalPlaces: z.coerce.number().int().min(0).max(2),
  })
  .refine((config) => config.minGrade < config.maxGrade, { message: "Minimum must be lower than maximum.", path: ["maxGrade"] })
  .refine((config) => config.passingGrade >= config.minGrade && config.passingGrade <= config.maxGrade, {
    message: "Passing grade must be within the scale.",
    path: ["passingGrade"],
  });

export type GradingConfig = z.infer<typeof gradingConfigSchema>;

/** Different scales per program level, e.g. { "Senior High School": {...} }. */
export const gradingByLevelSchema = z.record(z.string().trim().min(1).max(60), gradingConfigSchema);

export const gradingLevelQuerySchema = z.object({
  level: z.string().trim().max(60).optional().transform((value) => value || undefined),
});

/** Profile fields a student is ALLOWED to edit (admins choose a subset). */
export const STUDENT_PROFILE_FIELDS = [
  "email",
  "contactNumber",
  "addressLine",
  "barangay",
  "city",
  "province",
  "zipCode",
  "guardianName",
  "guardianRelationship",
  "guardianContactNumber",
] as const;

export type StudentProfileField = (typeof STUDENT_PROFILE_FIELDS)[number];

export const studentEditableFieldsSchema = z.object({
  fields: z.array(z.enum(STUDENT_PROFILE_FIELDS)).max(STUDENT_PROFILE_FIELDS.length),
});

export const DEFAULT_GRADING_CONFIG: GradingConfig = {
  scaleLabel: "1.00 – 5.00 (1.00 highest, 3.00 passing)",
  minGrade: 1,
  maxGrade: 5,
  passingGrade: 3,
  higherIsBetter: false,
  decimalPlaces: 2,
};

/** DepEd Senior High School: 60–100, 75 passing, whole numbers. Editable in Settings. */
export const DEFAULT_GRADING_BY_LEVEL: Record<string, GradingConfig> = {
  "Senior High School": {
    scaleLabel: "60 – 100 (75 passing)",
    minGrade: 60,
    maxGrade: 100,
    passingGrade: 75,
    higherIsBetter: true,
    decimalPlaces: 0,
  },
};

export const DEFAULT_STUDENT_EDITABLE_FIELDS: StudentProfileField[] = [
  "email",
  "contactNumber",
  "addressLine",
  "barangay",
  "city",
  "province",
  "zipCode",
];
