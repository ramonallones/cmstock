export const productNameOnly = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  return text.replace(/\s+-\s+[^-]+$/, '').trim() || text
}
