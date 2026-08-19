const page = document.getElementById('page-products')

let scheduled = false

function ensureEnhancedCatalog() {
  if (!page || !page.classList.contains('active')) return
  if (page.querySelector('#newProductButton, .catalog-loading')) return

  page.dataset.catalogEnhanced = '0'
  const marker = document.createComment('koda-catalog-refresh')
  page.appendChild(marker)
  queueMicrotask(() => marker.remove())
}

function schedule() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    ensureEnhancedCatalog()
  })
}

if (page) {
  new MutationObserver(schedule).observe(page, { childList: true, subtree: false })
  new MutationObserver(schedule).observe(page, { attributes: true, attributeFilter: ['class'] })
  schedule()
}
