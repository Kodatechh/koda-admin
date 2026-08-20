import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'

const SUPABASE_URL = 'https://qqvwnsemihkknzodkxob.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zrtmwfwuVzwsuMwCvyAMlg_TAP2tgNS'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const money = (cents = 0, currency = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format((Number(cents) || 0) / 100)
const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c])

const labels = {
  draft: 'Pedido recebido', pending_payment: 'Aguardando pagamento', paid: 'Pagamento confirmado',
  processing: 'Em preparação', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado',
  refunded: 'Estornado', payment_failed: 'Pagamento não aprovado'
}

let loading = false
let rerenderTimer = null

function isTestOrder(order) {
  return (order.payments || []).some((payment) => /^ORDTST/i.test(payment.provider_payment_id || ''))
}

function addressText(address) {
  if (!address || typeof address !== 'object' || !address.street) return 'Endereço não informado'
  return [
    `${address.street}, ${address.number || 's/n'}${address.complement ? ` · ${address.complement}` : ''}`,
    `${address.neighborhood || ''} · ${address.city || ''} - ${address.state || ''}`,
    address.postal_code ? `CEP ${address.postal_code}` : ''
  ].filter(Boolean).join('<br>')
}

function actionHtml(order) {
  const testMode = isTestOrder(order)
  if (testMode) return '<div class="order-op-note test">Pedido de teste · nenhuma ação logística real será executada.</div>'
  if (order.status === 'paid') {
    return `<button class="order-op-primary" data-order-action="start_processing" data-order-id="${esc(order.id)}" type="button">Iniciar preparação</button>`
  }
  if (order.status === 'processing') {
    return `<div class="order-op-ship-form">
      <label>Código de rastreio<input data-tracking-code="${esc(order.id)}" type="text" autocomplete="off" placeholder="Ex.: BR123456789" /></label>
      <label>Link de rastreio <span>(opcional)</span><input data-tracking-url="${esc(order.id)}" type="url" autocomplete="off" placeholder="https://..." /></label>
      <button class="order-op-primary" data-order-action="mark_shipped" data-order-id="${esc(order.id)}" type="button">Marcar como enviado</button>
    </div>`
  }
  if (order.status === 'shipped') {
    return `<button class="order-op-primary" data-order-action="mark_delivered" data-order-id="${esc(order.id)}" type="button">Marcar como entregue</button>`
  }
  if (order.status === 'delivered') return '<div class="order-op-note success">Fluxo concluído.</div>'
  return '<div class="order-op-note">Aguardando a próxima etapa automática do pedido.</div>'
}

function cardHtml(order) {
  const testMode = isTestOrder(order)
  const items = (order.order_items || []).map((item) => `${item.quantity}× ${esc(item.product_name)}`).join(' · ') || 'Itens não carregados'
  return `<article class="order-op-card ${testMode ? 'is-test' : ''}">
    <div class="order-op-head">
      <div><span class="order-op-number">KD-${String(order.order_number).padStart(6, '0')}</span><h3>${esc(labels[order.status] || order.status)}</h3><p>${esc(order.customer_name || 'Cliente Koda')} · ${esc(order.customer_email || 'sem e-mail')}</p></div>
      <div class="order-op-value"><strong>${esc(money(order.total_cents, order.currency))}</strong><span>${esc(date(order.created_at))}</span></div>
    </div>
    <div class="order-op-grid">
      <div><span>Itens</span><strong>${items}</strong></div>
      <div><span>Entrega</span><strong>${esc(order.shipping_service || 'Sem entrega')}</strong>${order.shipping_deadline_days != null ? `<small>Até ${esc(order.shipping_deadline_days)} dias úteis após postagem</small>` : ''}</div>
      <div><span>Destino</span><strong class="order-op-address">${addressText(order.shipping_address)}</strong></div>
      <div><span>Rastreio</span><strong>${esc(order.tracking_code || 'Ainda não informado')}</strong>${order.tracking_url ? `<small><a href="${esc(order.tracking_url)}" target="_blank" rel="noreferrer">Abrir rastreio ↗</a></small>` : ''}</div>
    </div>
    <div class="order-op-actions">${actionHtml(order)}<div class="order-op-status" data-order-status="${esc(order.id)}" role="status"></div></div>
  </article>`
}

async function loadOperations() {
  const page = document.getElementById('page-orders')
  if (!page || page.hidden || loading) return
  loading = true
  try {
    let root = document.getElementById('ordersOps')
    if (!root) {
      root = document.createElement('section')
      root.id = 'ordersOps'
      root.className = 'orders-ops'
      page.appendChild(root)
    }
    root.innerHTML = '<div class="order-op-loading">Carregando operação dos pedidos…</div>'

    const { data, error } = await supabase
      .from('orders')
      .select('id,order_number,user_id,status,currency,total_cents,customer_name,customer_email,created_at,paid_at,shipping_service,shipping_deadline_days,shipping_address,tracking_code,tracking_url,shipped_at,delivered_at,fulfillment_status,order_items(product_name,quantity,total_amount_cents),payments(provider_payment_id,status,method)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    root.innerHTML = `<div class="order-op-title"><div><div class="eyebrow">OPERAÇÃO</div><h2>Preparação e envio</h2><p>Atualize a etapa real do pedido. O cliente vê as mudanças na Conta Koda.</p></div><button class="order-op-refresh" id="ordersOpsRefresh" type="button">Atualizar</button></div>
      <div class="order-op-list">${(data || []).map(cardHtml).join('') || '<div class="order-op-empty">Nenhum pedido para operar.</div>'}</div>`
    bindActions()
    document.getElementById('ordersOpsRefresh')?.addEventListener('click', () => loadOperations())
  } catch (error) {
    const root = document.getElementById('ordersOps')
    if (root) root.innerHTML = `<div class="order-op-error">Não foi possível carregar a operação dos pedidos. ${esc(error?.message || '')}</div>`
  } finally {
    loading = false
  }
}

function bindActions() {
  document.querySelectorAll('[data-order-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const orderId = button.dataset.orderId
      const action = button.dataset.orderAction
      const status = document.querySelector(`[data-order-status="${CSS.escape(orderId)}"]`)
      const trackingCode = document.querySelector(`[data-tracking-code="${CSS.escape(orderId)}"]`)?.value?.trim() || ''
      const trackingUrl = document.querySelector(`[data-tracking-url="${CSS.escape(orderId)}"]`)?.value?.trim() || ''
      if (action === 'mark_shipped' && trackingCode.length < 4) {
        if (status) status.textContent = 'Informe um código de rastreio válido.'
        return
      }
      button.disabled = true
      if (status) status.textContent = 'Salvando…'
      const { error } = await supabase.functions.invoke('koda-pay-admin-order', {
        body: { orderId, action, ...(trackingCode ? { trackingCode } : {}), ...(trackingUrl ? { trackingUrl } : {}) }
      })
      if (error) {
        if (status) status.textContent = 'Não foi possível atualizar o pedido. Confira a etapa atual e tente novamente.'
        button.disabled = false
        return
      }
      if (status) status.textContent = 'Atualizado.'
      window.setTimeout(loadOperations, 500)
    })
  })
}

function scheduleLoad() {
  window.clearTimeout(rerenderTimer)
  rerenderTimer = window.setTimeout(() => {
    const page = document.getElementById('page-orders')
    if (page?.classList.contains('active')) loadOperations()
  }, 120)
}

const observer = new MutationObserver(scheduleLoad)
observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] })
document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-page="orders"]')) window.setTimeout(loadOperations, 160)
})
window.addEventListener('load', scheduleLoad)
