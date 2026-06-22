import cheUrl from '../assets/logo.png'
import defaultLogoUrl from '../assets/label-print-logo.png'

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

const FIRST_PAGE_ITEM_LIMIT = 10
const CONTINUATION_PAGE_ITEM_LIMIT = 28

const renderItemRows = (items) => items
  .map((item) => `<tr><td>${truncate(item.name, 34)}</td><td class="label-qty">${escapeHtml(item.qty)}</td></tr>`)
  .join('')

const chunkItems = (items, size) => {
  const chunks = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

export function buildLabelHTML(order = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  const firstPageItems = items.slice(0, FIRST_PAGE_ITEM_LIMIT)
  const continuationChunks = chunkItems(items.slice(FIRST_PAGE_ITEM_LIMIT), CONTINUATION_PAGE_ITEM_LIMIT)
  const firstPageRows = renderItemRows(firstPageItems)
  const senderName = order.sender_name || 'CERUTUMURAH'
  const senderPhone = order.sender_phone || '0816283356'
  const labelLogo = order.logo_url || defaultLogoUrl
  const tagline = order.tagline || 'whatever price or origin, a good cigar is a good cigar!'
  const footer = order.footer_note || 'CERUTUMURAH.COM'
  const totalPages = 1 + continuationChunks.length
  const compactClass = items.length > FIRST_PAGE_ITEM_LIMIT ? ' label-items-compact' : ''

  const firstPage = `<div class="print-label"><div class="label-inner">
    <div class="label-header">
      <div class="label-logo-box"><img src="${escapeHtml(labelLogo)}" alt="${truncate(senderName, 24)}"></div>
      <div class="label-expedition"><small>EKSPEDISI</small>${truncate(order.courier || '-', 20)}</div>
    </div>
    <div class="label-box label-sender"><div class="label-title">PENGIRIM</div><strong>${truncate(senderName, 30)}</strong><span>Tel. ${truncate(senderPhone, 20)}</span></div>
    <div class="label-watermark-area">
      <img class="label-watermark" src="${cheUrl}" alt="" aria-hidden="true">
      <div class="label-box label-receiver"><div class="label-title">PENERIMA</div><strong>${truncate(order.receiver_name || '-', 34)}</strong><p>${escapeHtml(order.receiver_address || '-')}</p><strong>Tel. ${truncate(order.receiver_phone || '-', 20)}</strong></div>
      <div class="label-tagline">${truncate(tagline, 80)}</div>
      <div class="label-box label-items${compactClass}"><div class="label-title">PESANAN${totalPages > 1 ? ` · HALAMAN 1/${totalPages}` : ''}</div><table><thead><tr><th>Nama Produk</th><th>Qty</th></tr></thead><tbody>${firstPageRows || '<tr><td>-</td><td class="label-qty">-</td></tr>'}</tbody></table></div>
    </div>
    <div class="label-footer">${truncate(footer, 64)}</div>
  </div></div>`

  const continuationPages = continuationChunks.map((pageItems, index) => `<div class="print-label print-label-continuation"><div class="label-inner">
    <div class="label-header">
      <div class="label-logo-box"><img src="${escapeHtml(labelLogo)}" alt="${truncate(senderName, 24)}"></div>
      <div class="label-expedition"><small>LANJUTAN PESANAN</small>HALAMAN ${index + 2}/${totalPages}</div>
    </div>
    <div class="label-box label-continuation-recipient"><div><span>PENERIMA</span><strong>${truncate(order.receiver_name || '-', 34)}</strong></div><div><span>EKSPEDISI</span><strong>${truncate(order.courier || '-', 20)}</strong></div></div>
    <div class="label-box label-items label-items-continuation"><div class="label-title">DAFTAR PRODUK (LANJUTAN)</div><table><thead><tr><th>Nama Produk</th><th>Qty</th></tr></thead><tbody>${renderItemRows(pageItems)}</tbody></table></div>
    <div class="label-footer">${truncate(footer, 64)}</div>
  </div></div>`).join('')

  return firstPage + continuationPages
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
