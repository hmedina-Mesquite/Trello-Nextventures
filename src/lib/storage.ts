// Supabase Storage object keys reject characters like spaces and accented
// letters (real-world files - e.g. macOS screenshot names, "Captura de
// pantalla ... a la(s) ...png" - are full of both). Sanitize before building
// a storage path; keep the original name for display (DB file_name column,
// not the path).
export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}
