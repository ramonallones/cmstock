import { BANK_ACCOUNTS } from './bankInfo'
import { productNameOnly } from '../lib/productDisplay'

const rupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value) || 0)

export function buildOrderMessage(order = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  const name = String(order.receiver_name || '').trim()
  const courier = String(order.courier || '').trim()
  const lines = [`Halo Om${name ? ` ${name}` : ''},`, '', 'Berikut rincian pesanan:', '']

  if (!items.length) lines.push('Belum ada produk yang dipilih.')
  items.forEach((item, index) => {
    const total = Number(item.total ?? (Number(item.price || 0) * Number(item.qty || 0)))
    lines.push(`${index + 1}. ${productNameOnly(item.name)} x${item.qty} = ${rupiah(total)}`)
  })

  if (Number(order.shipping || 0) > 0) {
    lines.push(`${items.length + 1}. Ongkir${courier ? ` ${courier}` : ''} = ${rupiah(order.shipping)}`)
  }
  if (Number(order.discount || 0) > 0) {
    lines.push(`Diskon = -${rupiah(order.discount)}`)
  }

  lines.push('', '━━━━━━━━━━━━━━', `TOTAL : ${rupiah(order.total)}`, '━━━━━━━━━━━━━━')
  lines.push('', 'Silakan dicek kembali. Jika sudah sesuai, Om dapat melanjutkan pembayaran.', '', 'Terima kasih 🙏')
  return lines.join('\n')
}

export function buildPaymentReceivedMessage(order = {}) {
  const name = String(order.receiver_name || '').trim()
  return `Halo Om${name ? ` ${name}` : ''},\n\nPembayaran sebesar ${rupiah(order.total)} sudah kami terima. Pesanan Om akan segera kami proses dan siapkan untuk pengiriman.\n\nNomor resi akan kami informasikan setelah paket dikirim.\n\nTerima kasih sudah berbelanja di CERUTUMURAH 🙏`
}

export function buildTrackingMessage(order = {}) {
  const name = String(order.receiver_name || '').trim()
  const courier = String(order.courier || '').trim()
  const trackingNumber = String(order.tracking_number || '').trim()
  if (!trackingNumber) return ''
  return `Halo Om${name ? ` ${name}` : ''},\n\nPesanan Om sudah dikirim${courier ? ` melalui ${courier}` : ''}.\n\nNomor resi:\n${trackingNumber}\n\nSilakan cek status pengiriman secara berkala. Mohon konfirmasi setelah paket diterima.\n\nTerima kasih 🙏`
}

export function buildBankMessage(accountKey) {
  if (accountKey) {
    const account = BANK_ACCOUNTS[String(accountKey).toLowerCase()]
    if (!account) throw new Error(`Rekening tidak ditemukan: ${accountKey}`)
    return `🏦 ${account.bank}\n\n${account.number}\n\na.n. ${account.name}\n\nMohon kirim bukti transfer setelah pembayaran dilakukan.\n\nTerima kasih 🙏`
  }

  const accounts = Object.values(BANK_ACCOUNTS)
    .map((account) => `🏦 ${account.bank}\n${account.number}\na.n. ${account.name}`)
    .join('\n\n')
  return `Pembayaran dapat ditransfer ke salah satu rekening berikut:\n\n${accounts}\n\nMohon kirim bukti transfer setelah pembayaran dilakukan.\n\nTerima kasih 🙏`
}

export async function copyToClipboard(text) {
  if (!text) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}
