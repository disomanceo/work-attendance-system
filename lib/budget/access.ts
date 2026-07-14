export type BudgetProfileAccess = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  work_permissions?: unknown;
  departments?: unknown;
};

export const BUDGET_PERMISSIONS = {
  procurement: "budget.procurement",
  finance: "budget.finance",
  requester: "budget.requester",
} as const;

export const DEPARTMENTS = {
  academic: "academic_administration",
  budget: "budget_administration",
  personnel: "personnel_administration",
  general: "general_administration",
} as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}

export function budgetWorkPermissions(profile: BudgetProfileAccess) {
  return stringArray(profile.work_permissions);
}

export function budgetDepartments(profile: BudgetProfileAccess) {
  return stringArray(profile.departments);
}

export function isBudgetSystemManager(profile: BudgetProfileAccess) {
  const role = text(profile.role).toLowerCase();
  return role === "admin" || role === "director";
}

export function isBudgetAdministration(profile: BudgetProfileAccess) {
  return budgetDepartments(profile).includes(DEPARTMENTS.budget);
}

export function isBudgetProcurement(profile: BudgetProfileAccess) {
  return budgetWorkPermissions(profile).includes(BUDGET_PERMISSIONS.procurement);
}

export function isBudgetFinance(profile: BudgetProfileAccess) {
  return budgetWorkPermissions(profile).includes(BUDGET_PERMISSIONS.finance);
}

export function canManageAllBudget(profile: BudgetProfileAccess) {
  return (
    isBudgetSystemManager(profile) ||
    isBudgetAdministration(profile) ||
    isBudgetProcurement(profile)
  );
}

export function canRecordBudgetPayment(profile: BudgetProfileAccess) {
  return canManageAllBudget(profile) || isBudgetFinance(profile);
}

export function canCreateOwnBudgetProject(profile: BudgetProfileAccess) {
  return canManageAllBudget(profile) || isBudgetFinance(profile);
}

export function canEditOwnBudgetProject(profile: BudgetProfileAccess) {
  return canCreateOwnBudgetProject(profile);
}

export function isOwnBudgetProject(
  profile: BudgetProfileAccess,
  ownerName: unknown,
) {
  const currentName = text(profile.full_name);
  return Boolean(currentName && text(ownerName) === currentName);
}

export function budgetAccessSummary(profile: BudgetProfileAccess) {
  return {
    canManageAll: canManageAllBudget(profile),
    canFinance: canRecordBudgetPayment(profile),
    canCreateOwnProject: canCreateOwnBudgetProject(profile),
    canEditOwnProject: canEditOwnBudgetProject(profile),
    isProcurement: isBudgetProcurement(profile),
    isFinance: isBudgetFinance(profile),
    isBudgetAdministration: isBudgetAdministration(profile),
  };
}
