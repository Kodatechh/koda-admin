import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'

const SUPABASE_URL = 'https://qqvwnsemihkknzodkxob.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zrtmwfwuVzwsuMwCvyAMlg_TAP2tgNS'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const STAFF_ROLES = new Set(['admin', 'support_agent', 'support_advanced'])
const SUPPORT_STATUSES = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']

const names = {
  dashboard: 'Visão geral', devices: 'Dispositivos', os: 'KODA OS', orders: 'Pedidos',
  customers: 'Clientes', products: 'Produtos', cloud: 'KodaCloud', support: 'Chamados',
  audit: 'Auditoria', settings: 'Configurações'
}

const leads = {
  devices: 'Cada KodaBot registrado no KodaCloud, com proprietário, ativação, software e telemetria.',
  os: 'Versões instaladas na frota e disponibilidade de atualização informada pelos próprios dispositivos.',
  orders: 'Pedidos reais registrados pelo comércio Koda.',
  customers: 'Contas Koda com vínculos de dispositivos e chamados.',
  products: 'Catálogo real de produtos, preços, disponibilidade e estoque.',
  cloud: 'Estado atual da conexão entre o Admin, banco e telemetria dos KodaBots.',
  support: 'Chamados abertos pelos clientes, atendimento humano e histórico de respostas.',
  audit: 'Ações administrativas e eventos importantes registrados pelo KodaCloud.',
  settings: 'Conta administrativa, permissões e origem dos dados deste painel.'
}

const state = {
  user: null,
  roles: [],
  devices: [],
  health: [],
  cases: [],
  orders: [],
  products: [],
  payments: [],
  profiles: [],
  audit: [],
  loadErrors: [],
  lastLoadedAt: null,
  activePage: 'dashboard'
}

const $ = (id) => document.getElementById(id)
const authShell = $('authShell')
const adminApp = $('adminApp')
const modal = $('modal')
const modalContent = $('modalContent')

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char])
}

function emptyValue(value, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : value
}

function formatDate(value, includeTime = true) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', includeTime
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' }
  ).format(date)
}

function relativeTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  if (Number.isNaN(diff)) return '—'
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} d`
  return formatDate(value, false)
}

function money(cents = 0, currency = 'BRL') {
  const code = (currency || 'BRL').toUpperCase()
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }).format((Number(cents) || 0) / 100)
  } catch {
    return `${code} ${((Number(cents) || 0) / 100).toFixed(2)}`
  }
}

function sameLocalDay(value, date = new Date()) {
  if (!value) return false
  const other = new Date(value)
  return other.getFullYear() === date.getFullYear()
    && other.getMonth() === date.getMonth()
    && other.getDate() === date.getDate()
}

function initials(name, email) {
  const source = (name || email || 'K').trim()
  const parts = source.split(/\s+|@/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2)).toUpperCase()
}

function statusLabel(value) {
  const labels = {
    not_activated: 'Não ativado', activated: 'Ativado', service: 'Em serviço', retired: 'Retirado',
    registered: 'Registrado', provisioned: 'Provisionado', factory_tested: 'Testado', ready: 'Pronto',
    open: 'Aberto', in_progress: 'Em atendimento', waiting_customer: 'Aguardando cliente', resolved: 'Resolvido', closed: 'Fechado',
    paid: 'Pago', pending: 'Pendente', processing: 'Processando', cancelled: 'Cancelado', canceled: 'Cancelado',
    shipped: 'Enviado', delivered: 'Entregue', refunded: 'Reembolsado', failed: 'Falhou', active: 'Ativo', inactive: 'Inativo',
    admin: 'Administrador', support_agent: 'Suporte', support_advanced: 'Suporte avançado'
  }
  return labels[value] || String(value || '—').replaceAll('_', ' ')
}

function pillClass(value) {
  const good = ['activated', 'ready', 'resolved', 'closed', 'paid', 'delivered', 'active']
  const warn = ['not_activated', 'registered', 'open', 'in_progress', 'waiting_customer', 'pending', 'processing', 'shipped']
  const danger = ['retired', 'cancelled', 'canceled', 'failed']
  if (good.includes(value)) return 'success'
  if (danger.includes(value)) return 'danger'
  if (warn.includes(value)) return 'pending'
  return ''
}

function profileMap() {
  return new Map(state.profiles.map((profile) => [profile.user_id, profile]))
}

function profileName(userId) {
  if (!userId) return 'Sem proprietário'
  return profileMap().get(userId)?.full_name || `Conta ${String(userId).slice(0, 8)}`
}

function healthMap() {
  return new Map(state.health.map((item) => [item.device_id, item]))
}

function versionParts(version) {
  return String(version || '').replace(/^v/i, '').split('.').map((part) => Number(part.replace(/\D.*/, '')) || 0)
}

function compareVersions(a, b) {
  const av = versionParts(a), bv = versionParts(b)
  const length = Math.max(av.length, bv.length)
  for (let i = 0; i < length; i += 1) {
    if ((av[i] || 0) !== (bv[i] || 0)) return (av[i] || 0) - (bv[i] || 0)
  }
  return 0
}

function maxVersion(values) {
  return values.filter(Boolean).sort(compareVersions).at(-1) || null
}

function toast(message, tone = 'default') {
  let node = document.querySelector('.toast')
  if (!node) {
    node = document.createElement('div')
    node.className = 'toast'
    document.body.appendChild(node)
  }
  node.textContent = message
  node.dataset.tone = tone
  node.classList.add('show')
  window.clearTimeout(toast.timer)
  toast.timer = window.setTimeout(() => node.classList.remove('show'), 2800)
}

function showModal(html, wide = false) {
  modalContent.innerHTML = html
  modal.querySelector('.dialog').classList.toggle('wide', wide)
  modal.hidden = false
}

function closeModal() {
  modal.hidden = true
  modalContent.innerHTML = ''
}

function emptyState(title, text) {
  return `<div class="empty-state"><div class="empty-icon">○</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`
}

function pageHeader(key, action = '') {
  return `<div class="template-title"><div><div class="eyebrow">KODA ADMIN · DADOS REAIS</div><h1>${escapeHtml(names[key])}</h1><p>${escapeHtml(leads[key])}</p></div>${action}</div>`
}

function card(label, value, meta = '') {
  return `<article class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="meta">${escapeHtml(meta)}</div></article>`
}

function table(rows, headers) {
  if (!rows.length) return ''
  return `<div class="tablebox"><div class="trow head">${headers.map((h) => `<span>${escapeHtml(h)}</span>`).join('')}</div>${rows.join('')}</div>`
}

async function query(label, request) {
  const { data, error } = await request
  if (error) {
    console.error(`[Koda Admin] ${label}`, error)
    state.loadErrors.push({ label, error })
    return []
  }
  return data || []
}

async function loadAllData({ quiet = false } = {}) {
  state.loadErrors = []
  if (!quiet) $('refreshData').disabled = true

  const [devices, health, cases, orders, products, payments, profiles, audit] = await Promise.all([
    query('devices', supabase.from('devices').select('id,serial_number,model,status,manufactured_at,kodaos_version,owner_user_id,activated_at,created_at,updated_at,hardware_revision,latest_available_kodaos,provisioning_status').order('created_at', { ascending: false }).limit(500)),
    query('device_health', supabase.from('device_health').select('device_id,online,last_seen_at,wifi_status,wifi_signal,system_status,display_status,touch_status,sensor_status,audio_status,storage_status,last_boot_at,last_restart_reason,updated_at').limit(500)),
    query('support_cases', supabase.from('support_cases').select('id,owner_user_id,device_id,category,subject,message,status,created_at,updated_at').order('created_at', { ascending: false }).limit(300)),
    query('orders', supabase.from('orders').select('id,order_number,user_id,status,currency,total_cents,customer_name,customer_email,created_at,updated_at,paid_at,cancelled_at').order('created_at', { ascending: false }).limit(300)),
    query('commerce_products', supabase.from('commerce_products').select('id,slug,name,description,active,currency,unit_amount_cents,track_stock,stock_quantity,created_at,updated_at').order('created_at', { ascending: false }).limit(100)),
    query('payments', supabase.from('payments').select('id,order_id,user_id,provider_key,method,status,amount_cents,installments,created_at,updated_at,paid_at').order('created_at', { ascending: false }).limit(300)),
    query('profiles', supabase.from('profiles').select('user_id,full_name,created_at,updated_at').order('created_at', { ascending: false }).limit(500)),
    query('admin_audit_log', supabase.from('admin_audit_log').select('id,actor_user_id,action,entity_type,entity_id,details,created_at').order('created_at', { ascending: false }).limit(100))
  ])

  Object.assign(state, { devices, health, cases, orders, products, payments, profiles, audit, lastLoadedAt: new Date() })
  renderCurrentPage()
  updateSystemStatus()
  $('refreshData').disabled = false
  if (!quiet) toast(state.loadErrors.length ? 'Dados atualizados com alguns avisos.' : 'Dados atualizados.', state.loadErrors.length ? 'warning' : 'success')
}

function updateSystemStatus() {
  const box = $('systemStatus')
  const critical = state.loadErrors.filter((item) => ['devices', 'support_cases', 'orders'].includes(item.label))
  if (!state.loadErrors.length) {
    box.innerHTML = '<strong><i class="dot"></i>KodaCloud conectado</strong><span>Dados sincronizados agora</span>'
    return
  }
  box.innerHTML = `<strong><i class="dot ${critical.length ? 'warning' : ''}"></i>KodaCloud</strong><span>${critical.length ? 'Conexão parcial' : 'Conectado com avisos'}</span>`
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function dashboardHtml() {
  const hMap = healthMap()
  const total = state.devices.length
  const online = state.devices.filter((d) => hMap.get(d.id)?.online === true).length
  const offline = state.devices.filter((d) => hMap.has(d.id) && hMap.get(d.id)?.online === false).length
  const noTelemetry = total - online - offline
  const awaitingActivation = state.devices.filter((d) => d.status === 'not_activated').length
  const activeCases = state.cases.filter((c) => ['open', 'in_progress', 'waiting_customer'].includes(c.status)).length
  const todayOrders = state.orders.filter((o) => sameLocalDay(o.created_at))
  const revenueToday = state.payments.filter((p) => p.paid_at && sameLocalDay(p.paid_at)).reduce((sum, p) => sum + (p.amount_cents || 0), 0)

  const targets = state.devices.map((d) => d.latest_available_kodaos).filter(Boolean)
  const installed = state.devices.map((d) => d.kodaos_version).filter(Boolean)
  const targetVersion = maxVersion(targets) || maxVersion(installed)
  const updated = targetVersion ? state.devices.filter((d) => d.kodaos_version === targetVersion).length : 0
  const adoption = total && targetVersion ? Math.round((updated / total) * 100) : 0
  const rolloutLabel = targets.length ? `KODA OS ${targetVersion}` : targetVersion ? `Versão mais recente: ${targetVersion}` : 'KODA OS'
  const rolloutMeta = targetVersion ? `${updated} de ${total} dispositivo${total === 1 ? '' : 's'} nessa versão` : 'Nenhuma versão reportada ainda'
  const profile = state.profiles.find((p) => p.user_id === state.user?.id)
  const firstName = profile?.full_name?.split(' ')[0] || state.user?.email?.split('@')[0] || 'Admin'
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date()).toUpperCase()

  const activity = state.audit.slice(0, 5).map((item) => {
    const detail = item.details && typeof item.details === 'object'
      ? Object.entries(item.details).slice(0, 2).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
      : item.entity_type
    return `<div class="activity-row"><div class="acticon">${activityIcon(item.action)}</div><div><strong>${escapeHtml(humanAction(item.action))}</strong><span>${escapeHtml(detail || item.entity_type || 'KodaCloud')}</span></div><span>${escapeHtml(relativeTime(item.created_at))}</span></div>`
  }).join('')

  return `<div class="hero"><div><div class="eyebrow">KODA ADMIN · ${escapeHtml(dateLabel)}</div><h1>${escapeHtml(greeting())}, ${escapeHtml(firstName)}.</h1><p>Agora esta tela reflete o que existe de verdade no KodaCloud — sem métricas demonstrativas.</p></div><button class="primary" data-goto="devices" type="button">Ver frota</button></div>
  <div class="hero-grid">
    <article class="feature"><small>FROTA KODA · AO VIVO</small><div class="big">${total}</div><h2>${online} online agora.</h2><p>${offline ? `${offline} offline. ` : ''}${noTelemetry ? `${noTelemetry} ainda sem telemetria. ` : ''}${awaitingActivation ? `${awaitingActivation} aguardando ativação.` : total ? 'Todos os dispositivos registrados já foram ativados.' : 'Nenhum KodaBot foi registrado ainda.'}</p></article>
    <div class="stack">
      <article class="tile"><div class="tile-head"><span>${escapeHtml(rolloutLabel)}</span><span>${targets.length ? 'Disponível' : 'Frota'}</span></div><strong>${targetVersion ? `${adoption}%` : '—'}</strong><div class="sub">${escapeHtml(rolloutMeta)}</div><div class="progress"><i style="width:${adoption}%"></i></div></article>
      <article class="tile"><div class="tile-head"><span>Pedidos hoje</span><span>Base real</span></div><strong>${todayOrders.length}</strong><div class="sub">${escapeHtml(money(revenueToday))} em pagamentos confirmados hoje</div></article>
    </div>
  </div>
  <div class="section-head"><div><h2>Agora na Koda</h2><p>Indicadores calculados diretamente do banco.</p></div><button class="linkbtn" data-goto="support" type="button">Ver chamados →</button></div>
  <div class="cards3">
    ${card('Aguardando ativação', String(awaitingActivation), `${total} dispositivo${total === 1 ? '' : 's'} registrado${total === 1 ? '' : 's'}`)}
    ${card('KodaCloud', state.loadErrors.length ? 'Atenção' : 'Conectado', state.lastLoadedAt ? `Atualizado ${relativeTime(state.lastLoadedAt)}` : 'Sincronizando')}
    ${card('Chamados ativos', String(activeCases), `${state.cases.length} chamado${state.cases.length === 1 ? '' : 's'} no total`)}
  </div>
  <div class="section-head"><div><h2>Atividade recente</h2><p>Eventos registrados no log administrativo.</p></div><button class="linkbtn" data-goto="audit" type="button">Ver auditoria →</button></div>
  <div class="activity">${activity || `<div class="activity-empty">Nenhuma atividade administrativa registrada ainda.</div>`}</div>`
}

function activityIcon(action = '') {
  if (/activ|create|register|insert/i.test(action)) return '✓'
  if (/update|status|edit/i.test(action)) return '↻'
  if (/delete|remove/i.test(action)) return '−'
  return '·'
}

function humanAction(action = '') {
  const map = {
    support_case_status_updated: 'Status de chamado atualizado',
    support_case_reply_added: 'Resposta adicionada a chamado'
  }
  return map[action] || String(action || 'Evento').replaceAll('_', ' ')
}

function renderDashboard() {
  $('page-dashboard').innerHTML = dashboardHtml()
}

function renderDevices() {
  const hMap = healthMap()
  const rows = state.devices.map((device) => {
    const health = hMap.get(device.id)
    const connection = health ? (health.online ? 'Online' : 'Offline') : 'Sem telemetria'
    const status = device.status === 'not_activated' ? 'not_activated' : health?.online ? 'activated' : device.status
    return `<button class="trow rowbutton" data-device-id="${escapeHtml(device.id)}" type="button">
      <span><strong>${escapeHtml(device.serial_number)}</strong><small>${escapeHtml(emptyValue(device.hardware_revision, 'Revisão não informada'))}</small></span>
      <span>${escapeHtml(device.model)}</span>
      <span>${escapeHtml(profileName(device.owner_user_id))}</span>
      <span>${escapeHtml(emptyValue(device.kodaos_version))}<small>${escapeHtml(connection)}</small></span>
      <span><i class="pill ${pillClass(status)}">${escapeHtml(statusLabel(device.status))}</i></span>
    </button>`
  })
  $('page-devices').innerHTML = pageHeader('devices') + (rows.length
    ? table(rows, ['Serial', 'Modelo', 'Proprietário', 'KODA OS', 'Estado'])
    : emptyState('Nenhum KodaBot registrado', 'Quando a fábrica cadastrar o primeiro dispositivo, ele aparecerá aqui.'))
  document.querySelectorAll('[data-device-id]').forEach((button) => button.addEventListener('click', () => openDevice(button.dataset.deviceId)))
}

function openDevice(deviceId) {
  const device = state.devices.find((item) => item.id === deviceId)
  if (!device) return
  const health = healthMap().get(device.id)
  showModal(`<div class="eyebrow">DISPOSITIVO</div><h3>${escapeHtml(device.serial_number)}</h3><p>${escapeHtml(device.model)} · ${escapeHtml(statusLabel(device.status))}</p>
    <div class="detail-grid">
      <div><span>Proprietário</span><strong>${escapeHtml(profileName(device.owner_user_id))}</strong></div>
      <div><span>KODA OS</span><strong>${escapeHtml(emptyValue(device.kodaos_version))}</strong></div>
      <div><span>Atualização disponível</span><strong>${escapeHtml(emptyValue(device.latest_available_kodaos, 'Nenhuma informada'))}</strong></div>
      <div><span>Provisionamento</span><strong>${escapeHtml(statusLabel(device.provisioning_status))}</strong></div>
      <div><span>Conexão</span><strong>${health ? (health.online ? 'Online' : 'Offline') : 'Sem telemetria'}</strong></div>
      <div><span>Último contato</span><strong>${escapeHtml(health?.last_seen_at ? formatDate(health.last_seen_at) : 'Nunca reportado')}</strong></div>
      <div><span>Wi‑Fi</span><strong>${escapeHtml(emptyValue(health?.wifi_status, 'Sem dados'))}${health?.wifi_signal != null ? ` · ${escapeHtml(health.wifi_signal)} dBm` : ''}</strong></div>
      <div><span>Sistema</span><strong>${escapeHtml(emptyValue(health?.system_status, 'Sem dados'))}</strong></div>
    </div>`, true)
}

function renderOs() {
  const target = maxVersion(state.devices.map((d) => d.latest_available_kodaos).filter(Boolean))
  const currentMax = maxVersion(state.devices.map((d) => d.kodaos_version).filter(Boolean))
  const basis = target || currentMax
  const onBasis = basis ? state.devices.filter((d) => d.kodaos_version === basis).length : 0
  const pct = state.devices.length && basis ? Math.round(onBasis / state.devices.length * 100) : 0
  const versions = new Map()
  state.devices.forEach((d) => {
    const version = d.kodaos_version || 'Não informado'
    versions.set(version, (versions.get(version) || 0) + 1)
  })
  const versionRows = [...versions.entries()].sort(([a], [b]) => compareVersions(b, a)).map(([version, count]) => `<div class="version-row"><strong>${escapeHtml(version)}</strong><span>${count} dispositivo${count === 1 ? '' : 's'}</span></div>`).join('')
  $('page-os').innerHTML = pageHeader('os') + `<div class="cards3">
    ${card('Versão mais alta instalada', currentMax || '—', state.devices.length ? 'Reportada pela frota' : 'Sem dispositivos')}
    ${card('Atualização disponível', target || 'Nenhuma', target ? 'Informada pelos dispositivos' : 'Nenhum rollout informado')}
    ${card('Adoção', basis ? `${pct}%` : '—', basis ? `${onBasis} de ${state.devices.length} em ${basis}` : 'Sem dados de versão')}
  </div><div class="section-head"><div><h2>Distribuição da frota</h2><p>Versões reportadas por cada dispositivo.</p></div></div>
  <div class="version-list">${versionRows || emptyState('Sem versões reportadas', 'Os KodaBots ainda não enviaram informações de KODA OS.')}</div>`
}

function renderOrders() {
  const rows = state.orders.map((order) => `<div class="trow">
    <span><strong>#${escapeHtml(order.order_number)}</strong><small>${escapeHtml(order.customer_email || 'Sem e-mail')}</small></span>
    <span>${escapeHtml(order.customer_name || profileName(order.user_id))}</span>
    <span>${escapeHtml(money(order.total_cents, order.currency))}</span>
    <span>${escapeHtml(formatDate(order.created_at))}</span>
    <span><i class="pill ${pillClass(order.status)}">${escapeHtml(statusLabel(order.status))}</i></span>
  </div>`)
  const paidTotal = state.payments.filter((p) => p.paid_at).reduce((sum, p) => sum + (p.amount_cents || 0), 0)
  $('page-orders').innerHTML = pageHeader('orders') + `<div class="cards3 order-summary">
    ${card('Pedidos', String(state.orders.length), 'Total registrado')}
    ${card('Pagamentos confirmados', String(state.payments.filter((p) => p.paid_at).length), money(paidTotal))}
    ${card('Pedidos hoje', String(state.orders.filter((o) => sameLocalDay(o.created_at)).length), 'Criados hoje')}
  </div><div class="section-head"><div><h2>Pedidos</h2><p>Mais recentes primeiro.</p></div></div>` + (rows.length
    ? table(rows, ['Pedido', 'Cliente', 'Total', 'Criado', 'Status'])
    : emptyState('Nenhum pedido ainda', 'Assim que o primeiro cliente comprar pelo site Koda, o pedido aparecerá aqui.'))
}

function renderCustomers() {
  const deviceCounts = new Map()
  const caseCounts = new Map()
  state.devices.forEach((d) => d.owner_user_id && deviceCounts.set(d.owner_user_id, (deviceCounts.get(d.owner_user_id) || 0) + 1))
  state.cases.forEach((c) => caseCounts.set(c.owner_user_id, (caseCounts.get(c.owner_user_id) || 0) + 1))
  const rows = state.profiles.map((profile) => `<div class="trow">
    <span><strong>${escapeHtml(profile.full_name || 'Conta Koda')}</strong><small>${escapeHtml(String(profile.user_id).slice(0, 8))}</small></span>
    <span>${deviceCounts.get(profile.user_id) || 0}</span>
    <span>${caseCounts.get(profile.user_id) || 0}</span>
    <span>${escapeHtml(formatDate(profile.created_at, false))}</span>
    <span><i class="pill success">Ativo</i></span>
  </div>`)
  $('page-customers').innerHTML = pageHeader('customers') + (rows.length
    ? table(rows, ['Cliente', 'KodaBots', 'Chamados', 'Conta criada', 'Estado'])
    : emptyState('Nenhuma Conta Koda', 'Os clientes aparecerão aqui após criarem uma conta.'))
}

function renderProducts() {
  const productCards = state.products.map((product) => `<article class="product-card">
    <div class="product-top"><span class="product-status ${product.active ? 'on' : ''}">${product.active ? 'Publicado' : 'Inativo'}</span><span>${escapeHtml(product.slug)}</span></div>
    <h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || 'Sem descrição.')}</p>
    <div class="product-bottom"><strong>${product.unit_amount_cents == null ? 'Preço não definido' : escapeHtml(money(product.unit_amount_cents, product.currency))}</strong><span>${product.track_stock ? `${product.stock_quantity ?? 0} em estoque` : 'Estoque não controlado'}</span></div>
  </article>`).join('')
  $('page-products').innerHTML = pageHeader('products') + (productCards
    ? `<div class="product-grid">${productCards}</div>`
    : emptyState('Nenhum produto cadastrado', 'Cadastre produtos no backend de comércio para que apareçam aqui.'))
}

function renderCloud() {
  const latestSeen = state.health.map((h) => h.last_seen_at).filter(Boolean).sort().at(-1)
  const healthy = state.health.filter((h) => h.system_status && !/error|fail|fault/i.test(h.system_status)).length
  $('page-cloud').innerHTML = pageHeader('cloud') + `<div class="cards3">
    ${card('Banco do KodaCloud', state.loadErrors.length ? 'Parcial' : 'Conectado', 'Supabase · sessão autenticada')}
    ${card('Telemetria', `${state.health.length}/${state.devices.length}`, 'Dispositivos com estado de saúde')}
    ${card('Último contato', latestSeen ? relativeTime(latestSeen) : 'Nenhum', latestSeen ? formatDate(latestSeen) : 'Sem telemetria recebida')}
  </div><div class="section-head"><div><h2>Saúde da frota</h2><p>Esta área não inventa SLA: mostra somente sinais que o KodaCloud realmente possui.</p></div></div>
  <div class="info-panel"><div><span>Dispositivos com telemetria</span><strong>${state.health.length}</strong></div><div><span>Reportando sistema sem falha indicada</span><strong>${healthy}</strong></div><div><span>Falhas de carregamento do Admin</span><strong>${state.loadErrors.length}</strong></div></div>`
}

function supportStats() {
  const count = (status) => state.cases.filter((c) => c.status === status).length
  return { open: count('open'), inProgress: count('in_progress'), waiting: count('waiting_customer'), resolved: count('resolved') + count('closed') }
}

function renderSupport() {
  const stats = supportStats()
  const rows = state.cases.map((item) => {
    const device = state.devices.find((d) => d.id === item.device_id)
    return `<button class="trow rowbutton" data-case-id="${escapeHtml(item.id)}" type="button">
      <span><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.category)}</small></span>
      <span>${escapeHtml(profileName(item.owner_user_id))}</span>
      <span>${escapeHtml(device?.serial_number || 'Sem dispositivo')}</span>
      <span>${escapeHtml(formatDate(item.updated_at || item.created_at))}</span>
      <span><i class="pill ${pillClass(item.status)}">${escapeHtml(statusLabel(item.status))}</i></span>
    </button>`
  })
  $('page-support').innerHTML = pageHeader('support', '<div class="ai-badge"><span>◇</span>Koda Support AI · próxima etapa</div>') + `<div class="cards4">
    ${card('Novos', String(stats.open), 'Aguardando triagem')}
    ${card('Em atendimento', String(stats.inProgress), 'Com a equipe')}
    ${card('Aguardando cliente', String(stats.waiting), 'Resposta pendente')}
    ${card('Resolvidos', String(stats.resolved), 'Histórico concluído')}
  </div><div class="section-head"><div><h2>Caixa de entrada</h2><p>Clique em um chamado para ler, responder e alterar o estado.</p></div></div>` + (rows.length
    ? table(rows, ['Chamado', 'Cliente', 'KodaBot', 'Atualizado', 'Status'])
    : emptyState('Nenhum chamado aberto', 'Quando um cliente abrir um chamado no site da Koda, ele aparecerá aqui automaticamente.'))
  document.querySelectorAll('[data-case-id]').forEach((button) => button.addEventListener('click', () => openCase(button.dataset.caseId)))
}

async function openCase(caseId) {
  const item = state.cases.find((entry) => entry.id === caseId)
  if (!item) return
  const device = state.devices.find((d) => d.id === item.device_id)
  showModal('<div class="loading-state compact">Carregando conversa…</div>', true)
  const notes = await query('support_case_notes', supabase.from('support_case_notes').select('id,case_id,author_user_id,body,visibility,created_at').eq('case_id', caseId).order('created_at', { ascending: true }))
  const thread = notes.map((note) => {
    const mine = note.author_user_id === state.user?.id
    return `<div class="note ${mine ? 'staff' : ''}"><div class="note-meta"><strong>${escapeHtml(note.author_user_id ? profileName(note.author_user_id) : 'Sistema')}</strong><span>${note.visibility === 'internal' ? 'Nota interna' : 'Visível ao cliente'} · ${escapeHtml(formatDate(note.created_at))}</span></div><p>${escapeHtml(note.body)}</p></div>`
  }).join('')

  showModal(`<div class="case-head"><div><div class="eyebrow">CHAMADO · ${escapeHtml(item.category)}</div><h3>${escapeHtml(item.subject)}</h3><p>${escapeHtml(profileName(item.owner_user_id))}${device ? ` · ${escapeHtml(device.serial_number)} · KODA OS ${escapeHtml(emptyValue(device.kodaos_version))}` : ''}</p></div><i class="pill ${pillClass(item.status)}">${escapeHtml(statusLabel(item.status))}</i></div>
    <div class="case-layout">
      <div class="case-thread"><div class="original-message"><div class="note-meta"><strong>Mensagem inicial do cliente</strong><span>${escapeHtml(formatDate(item.created_at))}</span></div><p>${escapeHtml(item.message)}</p></div>${thread || '<div class="thread-empty">Ainda não há respostas neste chamado.</div>'}</div>
      <aside class="case-tools">
        <label>Status<select id="caseStatus">${SUPPORT_STATUSES.map((status) => `<option value="${status}" ${status === item.status ? 'selected' : ''}>${escapeHtml(statusLabel(status))}</option>`).join('')}</select></label>
        <button class="secondary full" id="saveCaseStatus" type="button">Salvar status</button>
        <hr>
        <form id="caseReplyForm"><label>Responder<textarea id="caseReply" rows="5" required placeholder="Escreva uma resposta ou nota…"></textarea></label><label>Visibilidade<select id="caseVisibility"><option value="customer">Resposta ao cliente</option><option value="internal">Nota interna</option></select></label><button class="primary full" type="submit">Adicionar mensagem</button></form>
      </aside>
    </div>`, true)

  $('saveCaseStatus').addEventListener('click', async () => updateCaseStatus(item, $('caseStatus').value))
  $('caseReplyForm').addEventListener('submit', async (event) => {
    event.preventDefault()
    await addCaseReply(item, $('caseReply').value.trim(), $('caseVisibility').value)
  })
}

async function updateCaseStatus(item, status) {
  if (!SUPPORT_STATUSES.includes(status) || status === item.status) return
  const { error } = await supabase.from('support_cases').update({ status }).eq('id', item.id)
  if (error) return toast('Não foi possível atualizar o chamado.', 'error')
  await logAudit('support_case_status_updated', 'support_case', item.id, { from: item.status, to: status })
  item.status = status
  await loadAllData({ quiet: true })
  closeModal()
  toast('Status do chamado atualizado.', 'success')
}

async function addCaseReply(item, body, visibility) {
  if (!body) return
  const submit = $('caseReplyForm').querySelector('button[type="submit"]')
  submit.disabled = true
  const { error } = await supabase.from('support_case_notes').insert({
    case_id: item.id,
    author_user_id: state.user.id,
    body,
    visibility
  })
  if (error) {
    submit.disabled = false
    return toast('Não foi possível salvar a mensagem.', 'error')
  }
  await logAudit('support_case_reply_added', 'support_case', item.id, { visibility })
  await loadAllData({ quiet: true })
  toast(visibility === 'customer' ? 'Resposta adicionada ao chamado.' : 'Nota interna adicionada.', 'success')
  await openCase(item.id)
}

async function logAudit(action, entityType, entityId, details = {}) {
  const { error } = await supabase.from('admin_audit_log').insert({
    actor_user_id: state.user?.id || null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details
  })
  if (error) console.warn('[Koda Admin] audit log', error)
}

function renderAudit() {
  const rows = state.audit.map((item) => `<div class="trow">
    <span><strong>${escapeHtml(humanAction(item.action))}</strong><small>${escapeHtml(item.entity_type)}</small></span>
    <span>${escapeHtml(item.actor_user_id ? profileName(item.actor_user_id) : 'Sistema')}</span>
    <span>${escapeHtml(item.entity_id ? String(item.entity_id).slice(0, 8) : '—')}</span>
    <span>${escapeHtml(formatDate(item.created_at))}</span>
    <span><i class="pill success">Registrado</i></span>
  </div>`)
  $('page-audit').innerHTML = pageHeader('audit') + (rows.length
    ? table(rows, ['Ação', 'Responsável', 'Entidade', 'Data', 'Registro'])
    : emptyState('Sem eventos de auditoria', 'As ações administrativas importantes serão registradas aqui.'))
}

function renderSettings() {
  const profile = state.profiles.find((p) => p.user_id === state.user?.id)
  $('page-settings').innerHTML = pageHeader('settings') + `<div class="settings-grid">
    <article class="settings-card"><div class="settings-icon">◎</div><div><span>Conta</span><strong>${escapeHtml(profile?.full_name || 'Administrador Koda')}</strong><p>${escapeHtml(state.user?.email || '')}</p></div></article>
    <article class="settings-card"><div class="settings-icon">◇</div><div><span>Permissão</span><strong>${escapeHtml(state.roles.map(statusLabel).join(', '))}</strong><p>Controlada por user_roles + RLS.</p></div></article>
    <article class="settings-card"><div class="settings-icon">☁</div><div><span>Dados</span><strong>KodaCloud</strong><p>Projeto ${escapeHtml(SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] || '')}</p></div></article>
    <article class="settings-card"><div class="settings-icon">↻</div><div><span>Última sincronização</span><strong>${escapeHtml(state.lastLoadedAt ? formatDate(state.lastLoadedAt) : '—')}</strong><p>${state.loadErrors.length ? `${state.loadErrors.length} fonte(s) com aviso` : 'Todas as fontes carregadas'}</p></div></article>
  </div>`
}

function renderPage(key) {
  const renderers = {
    dashboard: renderDashboard,
    devices: renderDevices,
    os: renderOs,
    orders: renderOrders,
    customers: renderCustomers,
    products: renderProducts,
    cloud: renderCloud,
    support: renderSupport,
    audit: renderAudit,
    settings: renderSettings
  }
  renderers[key]?.()
  bindGotoButtons()
}

function renderCurrentPage() {
  renderPage(state.activePage)
}

function go(key) {
  if (!names[key]) key = 'dashboard'
  state.activePage = key
  document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'))
  $(`page-${key}`).classList.add('active')
  document.querySelectorAll('.navbtn').forEach((button) => button.classList.toggle('active', button.dataset.page === key))
  $('crumb').textContent = names[key]
  renderPage(key)
  history.replaceState(null, '', `#${key}`)
}

function bindGotoButtons() {
  document.querySelectorAll('[data-goto]').forEach((button) => {
    button.onclick = () => {
      closeModal()
      go(button.dataset.goto)
    }
  })
}

function globalSearch() {
  showModal(`<div class="eyebrow">BUSCA GLOBAL</div><h3>Encontrar na Koda</h3><p>Busque serial, cliente, pedido ou chamado.</p><input class="search-input" id="globalSearchInput" autofocus placeholder="Digite para buscar…"><div class="search-results" id="searchResults"></div>`, true)
  const input = $('globalSearchInput')
  const results = $('searchResults')
  const run = () => {
    const term = input.value.trim().toLowerCase()
    if (term.length < 2) return results.innerHTML = '<div class="search-hint">Digite pelo menos 2 caracteres.</div>'
    const matches = []
    state.devices.filter((d) => `${d.serial_number} ${d.model} ${profileName(d.owner_user_id)}`.toLowerCase().includes(term)).slice(0, 5).forEach((d) => matches.push({ page: 'devices', label: d.serial_number, meta: `Dispositivo · ${d.model}` }))
    state.orders.filter((o) => `${o.order_number} ${o.customer_name} ${o.customer_email}`.toLowerCase().includes(term)).slice(0, 5).forEach((o) => matches.push({ page: 'orders', label: `Pedido #${o.order_number}`, meta: o.customer_name || o.customer_email || 'Pedido' }))
    state.cases.filter((c) => `${c.subject} ${c.category} ${profileName(c.owner_user_id)}`.toLowerCase().includes(term)).slice(0, 5).forEach((c) => matches.push({ page: 'support', label: c.subject, meta: `Chamado · ${statusLabel(c.status)}` }))
    state.products.filter((p) => `${p.name} ${p.slug}`.toLowerCase().includes(term)).slice(0, 5).forEach((p) => matches.push({ page: 'products', label: p.name, meta: 'Produto' }))
    results.innerHTML = matches.length ? matches.slice(0, 12).map((m) => `<button data-search-page="${m.page}" type="button"><strong>${escapeHtml(m.label)}</strong><span>${escapeHtml(m.meta)}</span></button>`).join('') : '<div class="search-hint">Nada encontrado.</div>'
    results.querySelectorAll('[data-search-page]').forEach((button) => button.addEventListener('click', () => { closeModal(); go(button.dataset.searchPage) }))
  }
  input.addEventListener('input', run)
  window.setTimeout(() => input.focus(), 40)
}

async function enterAdmin(user) {
  const { data: roles, error } = await supabase.from('user_roles').select('role').eq('user_id', user.id)
  if (error) throw new Error('Não foi possível validar as permissões desta conta.')
  const roleValues = (roles || []).map((entry) => entry.role)
  if (!roleValues.some((role) => STAFF_ROLES.has(role))) {
    await supabase.auth.signOut({ scope: 'local' })
    throw new Error('Esta conta não possui acesso ao Koda Admin.')
  }

  state.user = user
  state.roles = roleValues
  $('accountEmail').textContent = user.email || ''
  $('accountName').textContent = 'Conta Koda'
  $('accountButton').textContent = initials('', user.email)
  authShell.hidden = true
  adminApp.hidden = false
  const initial = location.hash.slice(1)
  state.activePage = names[initial] ? initial : 'dashboard'
  go(state.activePage)
  await loadAllData({ quiet: true })
  const ownProfile = state.profiles.find((p) => p.user_id === user.id)
  $('accountName').textContent = ownProfile?.full_name || 'Administrador Koda'
  $('accountButton').textContent = initials(ownProfile?.full_name, user.email)
}

async function restoreAuth() {
  const status = $('loginStatus')
  status.textContent = 'Verificando sessão…'
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    status.textContent = ''
    authShell.hidden = false
    adminApp.hidden = true
    return
  }
  try {
    await enterAdmin(user)
  } catch (err) {
    authShell.hidden = false
    adminApp.hidden = true
    status.textContent = err.message || 'Não foi possível acessar o Admin.'
  }
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = $('loginEmail').value.trim()
  const password = $('loginPassword').value
  const submit = $('loginSubmit')
  const status = $('loginStatus')
  submit.disabled = true
  status.textContent = 'Entrando…'
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    submit.disabled = false
    status.textContent = 'E-mail ou senha inválidos.'
    return
  }
  try {
    await enterAdmin(data.user)
    status.textContent = ''
  } catch (err) {
    status.textContent = err.message || 'Acesso não autorizado.'
    submit.disabled = false
  }
})

$('logoutButton').addEventListener('click', async () => {
  await supabase.auth.signOut({ scope: 'local' })
  state.user = null
  state.roles = []
  $('accountMenu').hidden = true
  adminApp.hidden = true
  authShell.hidden = false
  $('loginPassword').value = ''
  $('loginStatus').textContent = 'Sessão encerrada.'
})

$('accountButton').addEventListener('click', () => {
  $('accountMenu').hidden = !$('accountMenu').hidden
})

$('refreshData').addEventListener('click', () => loadAllData())
$('search').addEventListener('click', globalSearch)
$('close').addEventListener('click', closeModal)
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal() })
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal() })
document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => go(button.dataset.page)))

restoreAuth()
