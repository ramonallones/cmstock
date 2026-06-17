export const productNameOnly = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const parts = text.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)

  if (parts.length % 2 === 0) {
    const middle = parts.length / 2
    const firstHalf = parts.slice(0, middle).join(' - ')
    const secondHalf = parts.slice(middle).join(' - ')
    if (firstHalf && firstHalf === secondHalf) return firstHalf
  }

  return text
}
