import type { UserRole } from "@/lib/reports/types";

const roleRank: Record<UserRole, number> = {
  admin: 2,
  doctor: 1,
  superadmin: 3,
  user: 0
};

export function inferUserRole(email: string): UserRole {
  const normalized = email.trim().toLowerCase();
  const configured = roleFromConfiguredEmails(normalized);

  if (configured) {
    return configured;
  }

  if (normalized === "superadmin@lyf9.ai") return "superadmin";
  if (normalized === "admin@lyf9.ai") return "admin";
  if (normalized === "doctor@lyf9.ai") return "doctor";
  return "user";
}

export function roleCanAccess(role: UserRole, allowed: UserRole[]) {
  if (allowed.includes(role)) {
    return true;
  }

  if (role === "superadmin") {
    return true;
  }

  return allowed.some((allowedRole) => roleRank[role] >= roleRank[allowedRole] && allowedRole !== "doctor");
}

function roleFromConfiguredEmails(email: string): UserRole | null {
  if (emailList("LYF9_SUPERADMIN_EMAILS").includes(email)) return "superadmin";
  if (emailList("LYF9_ADMIN_EMAILS").includes(email)) return "admin";
  if (emailList("LYF9_DOCTOR_EMAILS").includes(email)) return "doctor";
  return null;
}

function emailList(envKey: string) {
  return (process.env[envKey] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
