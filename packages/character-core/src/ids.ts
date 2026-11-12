/** IDs encode a stable instance path; they are never derived from bone list positions. */
const MODULE = /^[a-z][a-z0-9_]*\[[a-z0-9_,]+\]$/;
const PART = /^[a-z][a-z0-9_]*(?:\[[a-z0-9_,]+\])?$/;
export function validateModuleId(id: string): void {
  if (!MODULE.test(id)) throw new Error("Invalid module ID: " + id);
}
export function anatomyId(moduleId: string, rolePath: string): string {
  validateModuleId(moduleId);
  if (!rolePath || rolePath.split("/").some(part => !PART.test(part))) {
    throw new Error("Invalid anatomy role path: " + rolePath);
  }
  return "root/" + moduleId + "/" + rolePath;
}
export function validAnatomyId(id: string): boolean {
  const parts = id.split("/");
  if (parts.length < 3 || parts[0] !== "root") return false;
  try { validateModuleId(parts[1]!); } catch { return false; }
  return parts.slice(2).every(part => PART.test(part));
}
export function moduleOfAnatomyId(id: string): string {
  if (!validAnatomyId(id)) throw new Error("Invalid anatomy ID: " + id);
  return id.split("/")[1]!;
}
