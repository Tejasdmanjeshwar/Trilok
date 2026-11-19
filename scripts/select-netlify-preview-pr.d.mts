export interface OpenPreviewPullRequest {
  number: number;
  state: string;
  updated_at: string;
  base?: { ref?: string; repo?: { full_name?: string } };
  head?: { sha?: string; ref?: string; repo?: { full_name?: string } };
}
export function selectPreviewPr(
  input: OpenPreviewPullRequest[] | OpenPreviewPullRequest[][],
  options: { repository: string; requested?: string | number },
): number;
