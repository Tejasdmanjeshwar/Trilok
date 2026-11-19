export type PreviewVerification = {
  status: "public-content-verified" | "private-api-ready";
  previewUrl: string;
  deployId: string;
};
export function parsePreviewUrl(value: string): { origin: string; deployId: string };
export function confirmDeploy(deploy: unknown, expected: {
  deployId: string;
  siteId: string;
  origin: string;
}): void;
export function verifyPreview(input: {
  previewUrl: string;
  siteId: string;
  token: string;
  expectedSha: string;
  staticDir: string;
  request?: typeof fetch;
}): Promise<PreviewVerification>;
