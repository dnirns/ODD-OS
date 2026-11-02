export const PROMPT = "C:\\>";

// The `$P$G` prompt: the current drive and directory, then `>`.
export const formatPrompt = (cwd: string) => `${cwd}>`;
