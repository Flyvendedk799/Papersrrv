const PALETTE = [
  "#B22B1A", "#C2185B", "#D97706", "#2E7D32",
  "#1B5E7A", "#00838F", "#6A1B9A", "#8D6E63",
];

export function authorColor(authorId: string | null | undefined): string {
  if (!authorId) return "#555";
  let h = 0;
  for (let i = 0; i < authorId.length; i++)
    h = (h * 131 + authorId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
