/** Values stamped by apps/web/vite.config.mjs at bundle creation. */
export interface BuildIdentity {
  readonly playableVersion: string;
  readonly combatEngineVersion: string;
  readonly channel: string;
  readonly commitSha: string;
  readonly builtAtUtc: string;
  readonly buildId: string;
}
declare const __TRILOK_BUILD_INFO__: BuildIdentity;
export function getBuildIdentity(): BuildIdentity {
  return __TRILOK_BUILD_INFO__;
}
/** Short enough to stay visible in the mobile combat header. */
export function compactBuildLabel(build: BuildIdentity): string {
  const revision = build.commitSha === "unknown" ? "LOCAL" : build.commitSha.slice(0, 8);
  return "BUILD " + revision + " · " + build.builtAtUtc.slice(11, 16) + " UTC";
}
export function formatBuildReport(build: BuildIdentity): string {
  return [
    "Trilok Build",
    "Playable version: v" + build.playableVersion,
    "Combat engine: v" + build.combatEngineVersion,
    "Channel: " + build.channel,
    "Build ID: " + build.buildId,
    "Commit SHA: " + build.commitSha,
    "Built (UTC): " + build.builtAtUtc,
  ].join("\n");
}
