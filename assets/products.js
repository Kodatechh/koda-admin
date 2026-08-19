import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'

const SUPABASE_URL = 'https://qqvwnsemihkknzodkxob.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zrtmwfwuVzwsuMwCvyAMlg_TAP2tgNS'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const page = document.getElementById('page-products')
const modal = document.getElementById('modal')
const modalContent = document.getElementById('modalContent')
const closeButton = document.getElementById('close')

let products = []
let busy = false
let searchTerm = ''
let takeoverQueued = false

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char])
}

function centsToInput(cents) {
  if (cents === null || cents === undefined) return ''
  return (Number(cents) / 100).toFixed(2).replace('.', ',')
}

function inputToCents(value, allowNull = true) {
  const raw = String(value ?? '').trim()
  if (!raw && allowNull) return null
  const normalized = raw.replace(/\./g, '').replace(',', '.')
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Informe um valor válido.')
  return Math.round(amount * 100)
}

function money(cents, currency = 'BRL') {
  if (cents === null || cents === undefined) return 'Preço não definido'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(Number(cents) / 100)
}

function margin(product) {
  const price = Number(product.unit_amount_cents)
  const cost = Number(product.cost_cents)
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) return null
  return ((price - cost) / price) * 100
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function humanType(value) {
  return ({ physical: 'Produto físico', digital: 'Digital', service: 'Serviço', coverage: 'Cobertura' })[value] || value || 'Produto'
}

function friendlyError(code) {
  const errors = {
    unauthorized: 'Sua sessão expirou. Entre novamente no Koda Admin.',
    forbidden: 'Somente administradores podem alterar o catálogo.',
    invalid_name: 'Informe o nome do produto.',
    invalid_slug: 'O slug deve usar apenas letras minúsculas, números e hífens.',
    invalid_price: 'Informe um preço válido.',
    invalid_cost: 'Informe um preço de custo válido.',
    invalid_stock: 'Informe um estoque válido.',
    duplicate_product: 'Já existe um produto com esse slug ou SKU.',
    product_has_orders: 'Este produto já possui pedidos e não pode ser excluído. Desative-o em vez disso.',
    product_not_found: 'Produto não encontrado.',
  }
  return errors[code] || 'Não foi possível concluir a alteração do produto.'
}

async function api(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('unauthorized')
  const response = await fetch(`${SUPABASE_URL}/functions/v1/koda-pay-admin-product`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'request_failed')
  return body
}

function notify(message, tone = 'success') {
  let node = document.querySelector('.toast')
  if (!node) {
    node = document.createElement('div')
    node.className = 'toast'
    document.body.appendChild(node)
  }
  node.textContent = message
  node.dataset.tone = tone
  node.classList.add('show')
  window.clearTimeout(notify.timer)
  notify.timer = window.setTimeout(() => node.classList.remove('show'), 2800)
}

function openModal(html, wide = true) {
  modalContent.innerHTML = html
  modal.querySelector('.dialog')?.classList.toggle('wide', wide)
  modal.hidden = false
}

function closeModal() {
  modal.hidden = true
  modalContent.innerHTML = ''
}

async function loadProducts() {
  if (busy) return
  busy = true
  renderLoading()
  try {
    const result = await api('list')
    products = result.products || []
    renderCatalog()
  } catch (error) {
    page.dataset.catalogEnhanced = '1'
    page.innerHTML = `<div class="catalog-empty"><strong>Não foi possível carregar o catálogo.</strong><p>${escapeHtml(friendlyError(error.message))}</p><button class="primary" id="catalogRetry" type="button">Tentar novamente</button></div>`
    document.getElementById('catalogRetry')?.addEventListener('click', loadProducts)
  } finally {
    busy = false
  }
}

function renderLoading() {
  page.dataset.catalogEnhanced = '1'
  page.innerHTML = '<div class="catalog-loading">Carregando catálogo da Koda…</div>'
}

function renderCatalog() {
  const normalized = searchTerm.trim().toLowerCase()
  const visible = normalized
    ? products.filter((product) => `${product.name} ${product.slug} ${product.sku || ''} ${product.category || ''}`.toLowerCase().includes(normalized))
    : products
  const published = products.filter((product) => product.active).length
  const stockUnits = products.filter((product) => product.track_stock).reduce((sum, product) => sum + Number(product.stock_quantity || 0), 0)
  const inventoryCost = products.filter((product) => product.track_stock).reduce((sum, product) => sum + Number(product.cost_cents || 0) * Number(product.stock_quantity || 0), 0)

  page.dataset.catalogEnhanced = '1'
  page.innerHTML = `
    <div class="template-title">
      <div><div class="eyebrow">KODA ADMIN · CATÁLOGO</div><h1>Produtos</h1><p>Crie e gerencie os produtos que alimentam o catálogo e o checkout do site da Koda.</p></div>
      <button class="primary" id="newProductButton" type="button">+ Novo produto</button>
    </div>
    <div class="catalog-stats">
      <div class="catalog-stat"><span>Produtos</span><strong>${products.length}</strong></div>
      <div class="catalog-stat"><span>Publicados</span><strong>${published}</strong></div>
      <div class="catalog-stat"><span>Unidades em estoque</span><strong>${stockUnits}</strong></div>
      <div class="catalog-stat"><span>Custo do estoque</span><strong>${escapeHtml(money(inventoryCost))}</strong></div>
    </div>
    <div class="catalog-toolbar">
      <input class="catalog-search" id="catalogSearch" value="${escapeHtml(searchTerm)}" placeholder="Buscar nome, SKU, categoria ou slug…" />
      <div class="catalog-actions"><button class="secondary" id="refreshCatalog" type="button">Atualizar catálogo</button></div>
    </div>
    ${visible.length ? `<div class="catalog-grid">${visible.map(productCard).join('')}</div>` : '<div class="catalog-empty"><strong>Nenhum produto encontrado.</strong><p>Ajuste a busca ou crie um novo produto.</p></div>'}
  `

  document.getElementById('newProductButton')?.addEventListener('click', () => openProductForm())
  document.getElementById('refreshCatalog')?.addEventListener('click', loadProducts)
  const search = document.getElementById('catalogSearch')
  search?.addEventListener('input', (event) => {
    searchTerm = event.target.value
    renderCatalog()
    const next = document.getElementById('catalogSearch')
    next?.focus()
    next?.setSelectionRange(searchTerm.length, searchTerm.length)
  })
  page.querySelectorAll('[data-edit-product]').forEach((button) => button.addEventListener('click', () => {
    const product = products.find((item) => item.id === button.dataset.editProduct)
    if (product) openProductForm(product)
  }))
}

function productCard(product) {
  const grossMargin = margin(product)
  const marginText = grossMargin === null ? 'Margem —' : `Margem ${grossMargin.toFixed(1).replace('.', ',')}%`
  return `<article class="catalog-card">
    <div class="catalog-card-head">
      <div class="catalog-meta">
        <span class="catalog-tag ${product.active ? 'live' : ''}">${product.active ? 'Publicado' : 'Inativo'}</span>
        <span class="catalog-tag">${escapeHtml(product.category || 'Sem categoria')}</span>
      </div>
      <span class="catalog-tag">${escapeHtml(humanType(product.product_type))}</span>
    </div>
    <h3>${escapeHtml(product.name)}</h3>
    <p>${escapeHtml(product.description || 'Sem descrição.')}</p>
    <div class="catalog-meta">
      <span class="catalog-tag">${escapeHtml(product.sku || 'Sem SKU')}</span>
      <span class="catalog-tag">/${escapeHtml(product.slug)}</span>
      ${product.track_stock ? `<span class="catalog-tag">${Number(product.stock_quantity || 0)} em estoque</span>` : ''}
    </div>
    <div class="catalog-price">
      <div><strong>${escapeHtml(money(product.unit_amount_cents, product.currency))}</strong><small>Custo ${escapeHtml(money(product.cost_cents, product.currency))}</small></div>
      <span class="catalog-margin ${grossMargin !== null && grossMargin < 0 ? 'negative' : ''}">${escapeHtml(marginText)}</span>
    </div>
    <div class="catalog-card-buttons"><button class="secondary" data-edit-product="${escapeHtml(product.id)}" type="button">Editar</button></div>
  </article>`
}

function productFormHtml(product = null) {
  const editing = Boolean(product)
  const physical = (product?.product_type || 'physical') === 'physical'
  return `
    <div class="eyebrow">${editing ? 'EDITAR PRODUTO' : 'NOVO PRODUTO'}</div>
    <h3>${editing ? escapeHtml(product.name) : 'Adicionar ao catálogo'}</h3>
    <p>${editing ? 'As alterações publicadas ficam disponíveis para o catálogo Koda.' : 'Cadastre preço, custo, estoque, categoria e disponibilidade.'}</p>
    <form class="product-form" id="productForm">
      <div class="product-form-grid">
        <label>Nome<input id="productName" maxlength="120" required value="${escapeHtml(product?.name || '')}" placeholder="Ex.: KodaCharge Mini" /></label>
        <label>Slug<input id="productSlug" maxlength="120" required value="${escapeHtml(product?.slug || '')}" placeholder="kodacharge-mini" /></label>
        <label>SKU<input id="productSku" maxlength="80" value="${escapeHtml(product?.sku || '')}" placeholder="KODA-CHARGE-001" /></label>
        <label>Categoria<input id="productCategory" maxlength="80" list="productCategoryList" value="${escapeHtml(product?.category || '')}" placeholder="Acessórios" /><datalist id="productCategoryList"><option value="KodaBot"><option value="Acessórios"><option value="Energia"><option value="KodaCare"><option value="Peças"><option value="Serviços"></datalist></label>
        <label>Tipo<select id="productType"><option value="physical" ${(product?.product_type || 'physical') === 'physical' ? 'selected' : ''}>Produto físico</option><option value="digital" ${product?.product_type === 'digital' ? 'selected' : ''}>Digital</option><option value="service" ${product?.product_type === 'service' ? 'selected' : ''}>Serviço</option><option value="coverage" ${product?.product_type === 'coverage' ? 'selected' : ''}>Cobertura</option></select></label>
        <label>Ordem no catálogo<input id="productSort" type="number" min="0" step="1" value="${Number(product?.sort_order || 0)}" /></label>
        <label>Preço de venda (R$)<input id="productPrice" inputmode="decimal" value="${escapeHtml(centsToInput(product?.unit_amount_cents))}" placeholder="99,90" /></label>
        <label>Preço de custo (R$)<input id="productCost" inputmode="decimal" value="${escapeHtml(centsToInput(product?.cost_cents))}" placeholder="45,00" /></label>
        <label class="full-row">Descrição<textarea id="productDescription" rows="4" maxlength="2000" placeholder="Descrição pública do produto">${escapeHtml(product?.description || '')}</textarea></label>
        <label class="full-row">URL da imagem<input id="productImageUrl" type="url" maxlength="800" value="${escapeHtml(product?.image_url || '')}" placeholder="https://…" /></label>
      </div>
      <div class="product-switches">
        <label class="product-switch"><input id="productActive" type="checkbox" ${product?.active ? 'checked' : ''} /><span><strong>Publicado</strong><small>Visível e comprável no site quando houver preço e estoque.</small></span></label>
        <label class="product-switch" id="trackStockLabel"><input id="productTrackStock" type="checkbox" ${product?.track_stock ? 'checked' : ''} ${physical ? '' : 'disabled'} /><span><strong>Controlar estoque</strong><small>Bloqueia a compra quando chegar a zero.</small></span></label>
      </div>
      <div class="product-form-grid" id="stockFields" ${physical ? '' : 'hidden'}>
        <label>Quantidade em estoque<input id="productStock" type="number" min="0" step="1" value="${product?.stock_quantity ?? ''}" placeholder="0" /></label>
        <label>Moeda<select id="productCurrency"><option value="BRL" selected>BRL · Real brasileiro</option></select></label>
      </div>
      <div class="product-form-footer"><button class="secondary" id="cancelProduct" type="button">Cancelar</button><button class="primary" id="saveProduct" type="submit">${editing ? 'Salvar alterações' : 'Criar produto'}</button></div>
      ${editing ? `<div class="product-danger"><p>Produtos que já aparecem em pedidos são preservados para manter o histórico. Nesse caso, desative em vez de excluir.</p><button class="danger-button" id="deleteProduct" type="button">Excluir produto</button></div>` : ''}
    </form>
  `
}

function openProductForm(product = null) {
  openModal(productFormHtml(product), true)
  const form = document.getElementById('productForm')
  const name = document.getElementById('productName')
  const slug = document.getElementById('productSlug')
  const type = document.getElementById('productType')
  const stockFields = document.getElementById('stockFields')
  const trackStock = document.getElementById('productTrackStock')
  let slugTouched = Boolean(product)

  slug?.addEventListener('input', () => { slugTouched = true })
  name?.addEventListener('input', () => {
    if (!slugTouched && slug) slug.value = slugify(name.value)
  })
  type?.addEventListener('change', () => {
    const isPhysical = type.value === 'physical'
    stockFields.hidden = !isPhysical
    trackStock.disabled = !isPhysical
    if (!isPhysical) trackStock.checked = false
  })
  document.getElementById('cancelProduct')?.addEventListener('click', closeModal)
  document.getElementById('deleteProduct')?.addEventListener('click', () => deleteProduct(product))
  form?.addEventListener('submit', (event) => saveProduct(event, product))
  window.setTimeout(() => name?.focus(), 40)
}

async function saveProduct(event, existing) {
  event.preventDefault()
  const button = document.getElementById('saveProduct')
  button.disabled = true
  try {
    const type = document.getElementById('productType').value
    const trackStock = type === 'physical' && document.getElementById('productTrackStock').checked
    const stockRaw = document.getElementById('productStock')?.value ?? ''
    const product = {
      name: document.getElementById('productName').value.trim(),
      slug: document.getElementById('productSlug').value.trim().toLowerCase(),
      sku: document.getElementById('productSku').value.trim(),
      category: document.getElementById('productCategory').value.trim(),
      product_type: type,
      sort_order: Number(document.getElementById('productSort').value || 0),
      unit_amount_cents: inputToCents(document.getElementById('productPrice').value),
      cost_cents: inputToCents(document.getElementById('productCost').value),
      description: document.getElementById('productDescription').value.trim(),
      image_url: document.getElementById('productImageUrl').value.trim(),
      active: document.getElementById('productActive').checked,
      track_stock: trackStock,
      stock_quantity: trackStock ? Number(stockRaw || 0) : null,
      currency: 'BRL',
    }
    if (!Number.isInteger(product.stock_quantity) && product.stock_quantity !== null) throw new Error('invalid_stock')
    if (existing) await api('update', { id: existing.id, product })
    else await api('create', { product })
    closeModal()
    notify(existing ? 'Produto atualizado no catálogo.' : 'Produto criado no catálogo.', 'success')
    await loadProducts()
  } catch (error) {
    notify(error.message === 'Informe um valor válido.' ? error.message : friendlyError(error.message), 'error')
    button.disabled = false
  }
}

async function deleteProduct(product) {
  if (!product) return
  if (!window.confirm(`Excluir ${product.name}? Esta ação só funciona se o produto nunca tiver sido usado em um pedido.`)) return
  const button = document.getElementById('deleteProduct')
  button.disabled = true
  try {
    await api('delete', { id: product.id })
    closeModal()
    notify('Produto excluído.', 'success')
    await loadProducts()
  } catch (error) {
    notify(friendlyError(error.message), 'error')
    button.disabled = false
  }
}

function scheduleTakeover() {
  if (takeoverQueued || !page) return
  takeoverQueued = true
  queueMicrotask(() => {
    takeoverQueued = false
    if (!page.classList.contains('active')) return
    if (page.dataset.catalogEnhanced === '1') return
    loadProducts()
  })
}

if (page) {
  new MutationObserver(() => scheduleTakeover()).observe(page, { childList: true, subtree: false })
  new MutationObserver(() => scheduleTakeover()).observe(page, { attributes: true, attributeFilter: ['class'] })
  scheduleTakeover()
}

closeButton?.addEventListener('click', closeModal)
