export const formatRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)

export const WIB_TIME_ZONE = 'Asia/Jakarta'

const wibDateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: WIB_TIME_ZONE,
  timeZoneName: 'short',
})

const wibShortDateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: WIB_TIME_ZONE,
  timeZoneName: 'short',
})

const wibFullDateFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'full',
  timeZone: WIB_TIME_ZONE,
})

const wibMonthFormatter = new Intl.DateTimeFormat('id-ID', {
  month: 'short',
  year: 'numeric',
  timeZone: WIB_TIME_ZONE,
})

const wibPartFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: WIB_TIME_ZONE,
})

const toDate = (value = new Date()) => value instanceof Date ? value : new Date(value)

export const formatDateTimeWIB = (value) => {
  if (!value) return '-'
  return wibDateTimeFormatter.format(toDate(value))
}

export const formatShortDateTimeWIB = (value) => {
  if (!value) return '-'
  return wibShortDateTimeFormatter.format(toDate(value))
}

export const formatFullDateWIB = (value = new Date()) =>
  wibFullDateFormatter.format(toDate(value))

export const formatMonthWIB = (value = new Date()) =>
  wibMonthFormatter.format(toDate(value))

export const getWibDateParts = (value = new Date()) => {
  const parts = Object.fromEntries(
    wibPartFormatter
      .formatToParts(toDate(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  }
}

export const formatDatePartWIB = (value = new Date()) => {
  const { year, month, day } = getWibDateParts(value)
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
}

export const formatInputDateWIB = (value = new Date()) => {
  const { year, month, day } = getWibDateParts(value)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const currentMonthValueWIB = (value = new Date()) => {
  const { year, month } = getWibDateParts(value)
  return `${year}-${String(month).padStart(2, '0')}`
}
