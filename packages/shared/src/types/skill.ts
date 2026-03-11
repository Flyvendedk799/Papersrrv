export interface CompanySkill {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  content: string;
  /** Additional files in the skill folder: { "assets/foo.txt": "contents...", ... } */
  files: Record<string, string>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
