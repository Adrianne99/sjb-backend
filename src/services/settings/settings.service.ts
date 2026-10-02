// System settings stored in the system_settings table.
// If a setting was never saved (or is invalid), safe defaults are used.
//
// Grading: there is one DEFAULT scale (College: 1.00–5.00) plus optional scales
// per program level (Senior High School: 60–100). A grade always uses the scale
// of the student's program level for that term.
import { SETTING_KEYS } from "../../config/constants";
import * as settingsRepository from "../../repositories/settings.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import {
  DEFAULT_GRADING_BY_LEVEL,
  DEFAULT_GRADING_CONFIG,
  DEFAULT_STUDENT_EDITABLE_FIELDS,
  gradingByLevelSchema,
  gradingConfigSchema,
  studentEditableFieldsSchema,
  type GradingConfig,
  type StudentProfileField,
} from "../../validators/settings.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";

export interface GradingSettings {
  default: GradingConfig;
  byLevel: Record<string, GradingConfig>;
}

export async function getGradingSettings(): Promise<GradingSettings> {
  const [defaultRow, byLevelRow] = await Promise.all([
    settingsRepository.findSetting(SETTING_KEYS.grading),
    settingsRepository.findSetting(SETTING_KEYS.gradingByLevel),
  ]);
  const parsedDefault = gradingConfigSchema.safeParse(defaultRow?.value);
  const parsedByLevel = gradingByLevelSchema.safeParse(byLevelRow?.value);
  return {
    default: parsedDefault.success ? parsedDefault.data : DEFAULT_GRADING_CONFIG,
    // Never saved yet -> built-in defaults (Senior High 60–100).
    byLevel: byLevelRow ? (parsedByLevel.success ? parsedByLevel.data : {}) : DEFAULT_GRADING_BY_LEVEL,
  };
}

function pickConfig(settings: GradingSettings, level?: string | null): GradingConfig {
  if (!level) return settings.default;
  const key = Object.keys(settings.byLevel).find((name) => name.toLowerCase() === level.toLowerCase());
  return key ? settings.byLevel[key] : settings.default;
}

/**
 * Loads grading settings ONCE and returns a function that gives the scale for
 * a program level. Use it when a list mixes levels (dashboards, histories).
 *
 *   const gradingFor = await getGradingResolver();
 *   const config = gradingFor(enrollment.program.level);
 */
export async function getGradingResolver(): Promise<(level?: string | null) => GradingConfig> {
  const settings = await getGradingSettings();
  return (level) => pickConfig(settings, level);
}

export async function getGradingConfig(level?: string | null): Promise<GradingConfig> {
  return pickConfig(await getGradingSettings(), level);
}

export async function getStudentEditableFields(): Promise<StudentProfileField[]> {
  const setting = await settingsRepository.findSetting(SETTING_KEYS.studentEditableFields);
  const parsed = studentEditableFieldsSchema.safeParse({ fields: setting?.value });
  return parsed.success ? parsed.data.fields : DEFAULT_STUDENT_EDITABLE_FIELDS;
}

export async function getAllSettings() {
  const [grading, studentEditableFields] = await Promise.all([getGradingSettings(), getStudentEditableFields()]);
  return { grading: grading.default, gradingByLevel: grading.byLevel, studentEditableFields };
}

/** Saves the default scale, or the scale for one program level. */
export async function updateGradingConfig(config: GradingConfig, actor: Actor, level?: string) {
  if (level) {
    const { byLevel } = await getGradingSettings();
    const next = { ...Object.fromEntries(Object.entries(byLevel).filter(([name]) => name.toLowerCase() !== level.toLowerCase())), [level]: config };
    await settingsRepository.upsertSetting(SETTING_KEYS.gradingByLevel, next, actor.userId);
  } else {
    await settingsRepository.upsertSetting(SETTING_KEYS.grading, config, actor.userId);
  }
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: "system_setting",
    entityId: level ? SETTING_KEYS.gradingByLevel : SETTING_KEYS.grading,
    description: `Updated ${level ? `${level} ` : "default "}grading scale to "${config.scaleLabel}"`,
    metadata: { level: level ?? null, ...config },
  });
  return config;
}

/** Removes a level's own scale so it uses the default again. */
export async function removeGradingOverride(level: string, actor: Actor) {
  const { byLevel } = await getGradingSettings();
  const key = Object.keys(byLevel).find((name) => name.toLowerCase() === level.toLowerCase());
  if (!key) throw AppError.notFound("This level has no separate grading scale.");
  const next = Object.fromEntries(Object.entries(byLevel).filter(([name]) => name !== key));
  await settingsRepository.upsertSetting(SETTING_KEYS.gradingByLevel, next, actor.userId);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: "system_setting",
    entityId: SETTING_KEYS.gradingByLevel,
    description: `${key} now uses the default grading scale`,
  });
}

export async function updateStudentEditableFields(fields: StudentProfileField[], actor: Actor) {
  const unique = [...new Set(fields)];
  await settingsRepository.upsertSetting(SETTING_KEYS.studentEditableFields, unique, actor.userId);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: "system_setting",
    entityId: SETTING_KEYS.studentEditableFields,
    description: `Updated student-editable profile fields (${unique.length} fields)`,
    metadata: { fields: unique },
  });
  return unique;
}
