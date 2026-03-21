import type { CaseStatus, ViewerMode } from "@magic-compare/content-schema";

export interface CaseCatalogItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  status: CaseStatus;
  publishedAt: string | null;
  updatedAt: string;
  groupCount: number;
  publicGroupCount: number;
}

export interface CaseSearchGroupSummary {
  slug: string;
  title: string;
}

export interface CaseSearchResult extends CaseCatalogItem {
  groups: CaseSearchGroupSummary[];
}

export interface CaseWorkspaceGroup {
  id: string;
  slug: string;
  title: string;
  description: string;
  order: number;
  defaultMode: ViewerMode;
  isPublic: boolean;
  publicSlug: string | null;
  frameCount: number;
}

export interface CaseWorkspaceData {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: CaseStatus;
  publishedAt: string | null;
  tags: string[];
  groups: CaseWorkspaceGroup[];
}
