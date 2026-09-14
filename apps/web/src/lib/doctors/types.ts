import type { DoctorSpecialty } from "./specialties";

export type DoctorStatus =
  | "invited"
  | "details_submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "suspended";

export type DoctorCredentialDocumentType =
  | "registration_certificate"
  | "degree_certificate"
  | "government_id"
  | "other";

export type DoctorProfileRecord = {
  additionalQualifications: string[];
  bio: string | null;
  createdAt: string;
  fullName: string;
  languages: string[];
  primaryDegree: string;
  profilePhotoPath: string | null;
  registrationCouncil: string;
  registrationNumber: string;
  registrationYear: number | null;
  rejectionReason: string | null;
  specialties: DoctorSpecialty[];
  status: DoctorStatus;
  updatedAt: string;
  userId: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  yearsExperience: number | null;
};

/**
 * Reviewer details safe to show a patient. Never carries registration
 * number, credential documents, or verification metadata.
 */
export type DoctorPublicProfile = {
  additionalQualifications: string[];
  bio: string | null;
  fullName: string;
  languages: string[];
  primaryDegree: string;
  profilePhotoPath: string | null;
  specialties: DoctorSpecialty[];
  userId: string;
  yearsExperience: number | null;
};

export type DoctorCredentialDocumentRecord = {
  checksum: string;
  documentType: DoctorCredentialDocumentType;
  doctorUserId: string;
  id: string;
  scanStatus: string;
  storagePath: string;
  uploadedAt: string;
};

export type DoctorInviteRecord = {
  consumedAt: string | null;
  consumedBy: string | null;
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  invitedBy: string;
  note: string | null;
  revokedAt: string | null;
};

export type DoctorCapacityRecord = {
  avgTurnaroundSeconds: number | null;
  doctorUserId: string;
  isAccepting: boolean;
  lastAssignedAt: string | null;
  lifetimeReviewCount: number;
  maxOpenReviews: number;
  openReviewCount: number;
  updatedAt: string;
};

export type DoctorApplicationInput = {
  additionalQualifications: string[];
  bio: string | null;
  fullName: string;
  languages: string[];
  primaryDegree: string;
  registrationCouncil: string;
  registrationNumber: string;
  registrationYear: number | null;
  specialties: DoctorSpecialty[];
  yearsExperience: number | null;
};

export type DoctorAssignmentRequest = {
  priority: "standard" | "urgent";
  reportType: string | null;
  userId: string;
};

export type DoctorAssignmentResult = {
  assignedDoctorId: string | null;
  reason: "assigned" | "no_doctor_available";
  requiredSpecialty: DoctorSpecialty | null;
};
