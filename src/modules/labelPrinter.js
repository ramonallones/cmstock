import cheUrl from '../assets/logo.png'
import defaultLogoUrl from '../assets/logos.png'

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
})[character])

const truncate = (value, length) => {
  const text = String(value || '')
  return escapeHtml(text.length > length ? `${text.slice(0, length - 1)}...` : text)
}

export function buildLabelHTML(order = {}) {
  const items = (Array.isArray(order.items) ? order.items : [])
    .map((item) => `<tr><td>${truncate(item.name, 34)}</td><td class="label-qty">${escapeHtml(item.qty)}</td></tr>`)
    .join('')
  const senderName = order.sender_name || 'CERUTUMURAH'
  const senderPhone = order.sender_phone || '0816283356'
  const labelLogo = order.logo_url || defaultLogoUrl
  const tagline = order.tagline || 'whatever price or origin, a good cigar is a good cigar!'
  const footer = order.footer_note || 'CERUTUMURAH.COM'

  return `<div class="print-label"><div class="label-inner">
    <div class="label-header">
      <div class="label-logo-box"><img src="${escapeHtml(labelLogo)}" alt="${truncate(senderName, 24)}"></div>
      <div class="label-expedition"><small>EKSPEDISI</small>${truncate(order.courier || '-', 20)}</div>
    </div>
    <div class="label-box label-sender"><div class="label-title">PENGIRIM</div><strong>${truncate(senderName, 30)}</strong><span>Tel. ${truncate(senderPhone, 20)}</span></div>
    <div class="label-watermark-area">
      <img class="label-watermark" src="${cheUrl}" alt="" aria-hidden="true">
      <div class="label-box label-receiver"><div class="label-title">PENERIMA</div><strong>${truncate(order.receiver_name || '-', 34)}</strong><p>${escapeHtml(order.receiver_address || '-')}</p><strong>Tel. ${truncate(order.receiver_phone || '-', 20)}</strong></div>
      <div class="label-tagline">${truncate(tagline, 80)}</div>
      <div class="label-box label-items"><div class="label-title">PESANAN</div><table><thead><tr><th>Nama Produk</th><th>Qty</th></tr></thead><tbody>${items || '<tr><td>-</td><td class="label-qty">-</td></tr>'}</tbody></table></div>
    </div>
    <div class="label-footer">${truncate(footer, 64)}</div>
  </div></div>`
}

export async function printLabel(order) {
  const printWindow = window.open('', '_blank', 'width=500,height=760')
  if (!printWindow) throw new Error('Popup print diblokir browser.')

  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((node) => node.outerHTML)
    .join('\n')

  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print Label</title><base href="${escapeHtml(document.baseURI)}">${styles}</head><body><div class="print-label-batch">${buildLabelHTML(order)}</div></body></html>`)
  printWindow.document.close()

  await Promise.race([
    Promise.all([...printWindow.document.images].map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        image.onload = resolve
        image.onerror = resolve
      }))),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ])

  printWindow.focus()
  printWindow.print()
}
