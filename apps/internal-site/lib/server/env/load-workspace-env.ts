import { loadWorkspaceEnvFromModule } from "@magic-compare/shared-utils/workspace-env";

export function loadWorkspaceEnv(): void {
  loadWorkspaceEnvFromModule(import.meta.url, 5);
}
