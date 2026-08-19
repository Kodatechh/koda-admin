import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'

const SUPABASE_URL = 'https://qqvwnsemihkknzodkxob.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zrtmwfwuVzwsuMwCvyAMlg_TAP2tgNS'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const page = document.getElementById('page-products')
const modal = document.getElementById('modal')
const modalContent = document.getElementById('modalContent')
let products = []
let loading = false
let searchTerm = ''

const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
const money = (cents, currency = 'BRL') => cents == null ? 'Preço não definido' : new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(Number(cents)/100)
const centsToInput = cents => cents == null ? '' : (Number(cents)/100).toFixed(2).replace('.', ',')
const inputToCents = value => {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const normalized = raw.replace(/\./g,'').replace(',','.')
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid_money')
  return Math.round(n*100)
}
const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
const humanType = value => ({physical:'Produto físico',digital:'Digital',service:'Serviço',coverage:'Cobertura'})[value] || 'Produto'

function toast(message, tone='success') {
  let node = document.querySelector('.toast')
  if (!node) { node = document.createElement('div'); node.className='toast'; document.body.appendChild(node) }
  node.textContent = message
  node.dataset.tone = tone
  node.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(()=>node.classList.remove('show'),2800)
}

async function api(action, payload={}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('unauthorized')
  const response = await fetch(`${SUPABASE_URL}/functions/v1/koda-pay-admin-product`, {
    method:'POST',
    headers:{Authorization:`Bearer ${session.access_token}`,apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({action,...payload})
  })
  const body = await response.json().catch(()=>({}))
  if (!response.ok) throw new Error(body.error || 'request_failed')
  return body
}

function friendly(code) {
  return ({unauthorized:'Sua sessão expirou. Entre novamente.',forbidden:'Somente administradores podem alterar produtos.',duplicate_product:'Já existe um produto com esse slug ou SKU.',product_has_orders:'Este produto já está em pedidos. Desative-o em vez de excluir.',invalid_slug:'Use apenas letras minúsculas, números e hífens no slug.',invalid_name:'Informe o nome.',invalid_price:'Preço inválido.',invalid_cost:'Preço de custo inválido.',invalid_stock:'Estoque inválido.',invalid_money:'Informe um valor válido.'})[code] || 'Não foi possível concluir esta alteração.'
}

function openModal(html) {
  if (!modal || !modalContent) return
  modalContent.innerHTML = html
  modal.querySelector('.dialog')?.classList.add('wide')
  modal.hidden = false
}
function closeModal(){ if(modal){modal.hidden=true} if(modalContent) modalContent.innerHTML='' }

function margin(product){
  if(product.unit_amount_cents == null || product.cost_cents == null || Number(product.unit_amount_cents)<=0) return null
  return ((Number(product.unit_amount_cents)-Number(product.cost_cents))/Number(product.unit_amount_cents))*100
}

function productCard(product){
  const m=margin(product)
  return `<article class="catalog-card">
    <div class="catalog-card-head"><div class="catalog-meta"><span class="catalog-tag ${product.active?'live':''}">${product.active?'Publicado':'Inativo'}</span><span class="catalog-tag">${esc(product.category||'Sem categoria')}</span></div><span class="catalog-tag">${esc(humanType(product.product_type))}</span></div>
    ${product.image_url ? `<div style="height:150px;border-radius:18px;overflow:hidden;background:#f5f5f7;margin:16px 0"><img src="${esc(product.image_url)}" alt="" style="width:100%;height:100%;object-fit:contain" /></div>` : ''}
    <h3>${esc(product.name)}</h3><p>${esc(product.description||'Sem descrição.')}</p>
    <div class="catalog-meta"><span class="catalog-tag">${esc(product.sku||'Sem SKU')}</span><span class="catalog-tag">/${esc(product.slug)}</span>${product.track_stock?`<span class="catalog-tag">${Number(product.stock_quantity||0)} em estoque</span>`:''}</div>
    <div class="catalog-price"><div><strong>${esc(money(product.unit_amount_cents,product.currency))}</strong><small>Custo ${esc(money(product.cost_cents,product.currency))}</small></div><span class="catalog-margin ${m!=null&&m<0?'negative':''}">${m==null?'Margem —':`Margem ${m.toFixed(1).replace('.',',')}%`}</span></div>
    <div class="catalog-card-buttons"><button class="secondary" data-edit-product="${esc(product.id)}" type="button">Editar produto</button></div>
  </article>`
}

function render(){
  if(!page || !page.classList.contains('active')) return
  const term=searchTerm.trim().toLowerCase()
  const visible=term?products.filter(p=>`${p.name} ${p.slug} ${p.sku||''} ${p.category||''}`.toLowerCase().includes(term)):products
  const published=products.filter(p=>p.active).length
  const units=products.filter(p=>p.track_stock).reduce((s,p)=>s+Number(p.stock_quantity||0),0)
  const stockCost=products.filter(p=>p.track_stock).reduce((s,p)=>s+Number(p.cost_cents||0)*Number(p.stock_quantity||0),0)
  page.innerHTML=`<div class="template-title"><div><div class="eyebrow">KODA ADMIN · CATÁLOGO CONECTADO À LOJA</div><h1>Produtos</h1><p>Cadastre aqui os produtos que aparecem na Loja Koda e no Koda Pay.</p></div><div style="display:flex;gap:10px;align-items:center"><a class="secondary" href="https://koda-site-koda16.vercel.app/loja" target="_blank" rel="noreferrer">Abrir Loja Koda ↗</a><button class="primary" id="newProductButton" type="button">+ Novo produto</button></div></div>
  <div class="catalog-stats"><div class="catalog-stat"><span>Produtos</span><strong>${products.length}</strong></div><div class="catalog-stat"><span>Publicados</span><strong>${published}</strong></div><div class="catalog-stat"><span>Unidades em estoque</span><strong>${units}</strong></div><div class="catalog-stat"><span>Custo do estoque</span><strong>${esc(money(stockCost))}</strong></div></div>
  <div class="catalog-toolbar"><input class="catalog-search" id="catalogSearch" value="${esc(searchTerm)}" placeholder="Buscar nome, SKU, categoria ou slug…"/><button class="secondary" id="refreshCatalog" type="button">Atualizar</button></div>
  ${visible.length?`<div class="catalog-grid">${visible.map(productCard).join('')}</div>`:'<div class="catalog-empty"><strong>Nenhum produto encontrado.</strong><p>Crie um novo produto ou altere sua busca.</p></div>'}`
  document.getElementById('newProductButton')?.addEventListener('click',()=>openForm())
  document.getElementById('refreshCatalog')?.addEventListener('click',()=>load(true))
  document.getElementById('catalogSearch')?.addEventListener('input',e=>{searchTerm=e.target.value;render();const el=document.getElementById('catalogSearch');el?.focus();el?.setSelectionRange(searchTerm.length,searchTerm.length)})
  page.querySelectorAll('[data-edit-product]').forEach(btn=>btn.addEventListener('click',()=>openForm(products.find(p=>p.id===btn.dataset.editProduct))))
}

function formHtml(p){
 const editing=Boolean(p), type=p?.product_type||'physical', physical=type==='physical'
 return `<div class="eyebrow">${editing?'EDITAR PRODUTO':'NOVO PRODUTO'}</div><h3>${editing?esc(p.name):'Adicionar produto'}</h3><p>Preço, custo, estoque, categoria e publicação são controlados aqui.</p>
 <form class="product-form" id="productForm"><div class="product-form-grid">
 <label>Nome<input id="productName" required maxlength="120" value="${esc(p?.name||'')}" placeholder="Ex.: KodaPower Mini"/></label>
 <label>Slug<input id="productSlug" required maxlength="120" value="${esc(p?.slug||'')}" placeholder="kodapower-mini"/></label>
 <label>SKU<input id="productSku" maxlength="80" value="${esc(p?.sku||'')}" placeholder="KODA-PWR-001"/></label>
 <label>Categoria<input id="productCategory" maxlength="80" value="${esc(p?.category||'')}" placeholder="Energia" list="categories"/><datalist id="categories"><option value="KodaBot"><option value="Acessórios"><option value="Energia"><option value="KodaCare"><option value="Peças"><option value="Serviços"></datalist></label>
 <label>Tipo<select id="productType"><option value="physical" ${type==='physical'?'selected':''}>Produto físico</option><option value="digital" ${type==='digital'?'selected':''}>Digital</option><option value="service" ${type==='service'?'selected':''}>Serviço</option><option value="coverage" ${type==='coverage'?'selected':''}>Cobertura</option></select></label>
 <label>Ordem na loja<input id="productSort" type="number" min="0" step="1" value="${Number(p?.sort_order||0)}"/></label>
 <label>Preço de venda (R$)<input id="productPrice" inputmode="decimal" value="${esc(centsToInput(p?.unit_amount_cents))}" placeholder="99,90"/></label>
 <label>Preço de custo (R$)<input id="productCost" inputmode="decimal" value="${esc(centsToInput(p?.cost_cents))}" placeholder="45,00"/></label>
 <label class="full-row">Descrição<textarea id="productDescription" rows="4" maxlength="2000">${esc(p?.description||'')}</textarea></label>
 <label class="full-row">Imagem (URL)<input id="productImageUrl" type="url" maxlength="800" value="${esc(p?.image_url||'')}" placeholder="https://…"/></label></div>
 <div class="product-switches"><label class="product-switch"><input id="productActive" type="checkbox" ${p?.active?'checked':''}/><span><strong>Publicado</strong><small>Exibe na Loja Koda quando houver preço e disponibilidade.</small></span></label><label class="product-switch"><input id="productTrackStock" type="checkbox" ${p?.track_stock?'checked':''} ${physical?'':'disabled'}/><span><strong>Controlar estoque</strong><small>Impede venda quando chegar a zero.</small></span></label></div>
 <div class="product-form-grid" id="stockFields" ${physical?'':'hidden'}><label>Estoque<input id="productStock" type="number" min="0" step="1" value="${p?.stock_quantity??''}" placeholder="0"/></label><label>Moeda<select id="productCurrency"><option value="BRL">BRL · Real</option></select></label></div>
 <div class="product-form-footer"><button class="secondary" id="cancelProduct" type="button">Cancelar</button><button class="primary" id="saveProduct" type="submit">${editing?'Salvar alterações':'Criar produto'}</button></div>
 ${editing?'<div class="product-danger"><p>Se já houver pedidos, desative o produto para preservar o histórico.</p><button class="danger-button" id="deleteProduct" type="button">Excluir produto</button></div>':''}</form>`
}

function openForm(p=null){
 openModal(formHtml(p))
 const name=document.getElementById('productName'), slug=document.getElementById('productSlug'), type=document.getElementById('productType'), stock=document.getElementById('stockFields'), track=document.getElementById('productTrackStock')
 let touched=Boolean(p)
 slug?.addEventListener('input',()=>{touched=true})
 name?.addEventListener('input',()=>{if(!touched&&slug)slug.value=slugify(name.value)})
 type?.addEventListener('change',()=>{const physical=type.value==='physical';stock.hidden=!physical;track.disabled=!physical;if(!physical)track.checked=false})
 document.getElementById('cancelProduct')?.addEventListener('click',closeModal)
 document.getElementById('deleteProduct')?.addEventListener('click',()=>removeProduct(p))
 document.getElementById('productForm')?.addEventListener('submit',e=>saveProduct(e,p))
 setTimeout(()=>name?.focus(),30)
}

async function saveProduct(event,existing){
 event.preventDefault();const button=document.getElementById('saveProduct');button.disabled=true
 try{
  const type=document.getElementById('productType').value, track=type==='physical'&&document.getElementById('productTrackStock').checked
  const stockRaw=document.getElementById('productStock')?.value||''
  const product={name:document.getElementById('productName').value.trim(),slug:document.getElementById('productSlug').value.trim().toLowerCase(),sku:document.getElementById('productSku').value.trim(),category:document.getElementById('productCategory').value.trim(),product_type:type,sort_order:Number(document.getElementById('productSort').value||0),unit_amount_cents:inputToCents(document.getElementById('productPrice').value),cost_cents:inputToCents(document.getElementById('productCost').value),description:document.getElementById('productDescription').value.trim(),image_url:document.getElementById('productImageUrl').value.trim(),active:document.getElementById('productActive').checked,track_stock:track,stock_quantity:track?Number(stockRaw||0):null,currency:'BRL'}
  if(product.stock_quantity!==null&&!Number.isInteger(product.stock_quantity))throw new Error('invalid_stock')
  await api(existing?'update':'create',existing?{id:existing.id,product}:{product});closeModal();toast(existing?'Produto atualizado.':'Produto criado.');await load(true)
 }catch(err){toast(friendly(err.message),'error');button.disabled=false}
}

async function removeProduct(product){
 if(!product||!confirm(`Excluir ${product.name}?`))return
 try{await api('delete',{id:product.id});closeModal();toast('Produto excluído.');await load(true)}catch(err){toast(friendly(err.message),'error')}
}

async function load(force=false){
 if(!page||loading||!page.classList.contains('active'))return
 if(!force&&page.querySelector('#newProductButton'))return
 loading=true;page.innerHTML='<div class="catalog-loading">Carregando catálogo da Koda…</div>'
 try{const result=await api('list');products=result.products||[];render()}catch(err){page.innerHTML=`<div class="catalog-empty"><strong>Não foi possível carregar o catálogo.</strong><p>${esc(friendly(err.message))}</p><button class="primary" id="catalogRetry">Tentar novamente</button></div>`;document.getElementById('catalogRetry')?.addEventListener('click',()=>load(true))}finally{loading=false}
}

function ensureTakeover(){
 if(!page?.classList.contains('active'))return
 if(page.querySelector('#newProductButton')||page.querySelector('.catalog-loading'))return
 load(true)
}

if(page){
 new MutationObserver(()=>queueMicrotask(ensureTakeover)).observe(page,{childList:true})
 new MutationObserver(()=>queueMicrotask(ensureTakeover)).observe(page,{attributes:true,attributeFilter:['class']})
 document.querySelector('[data-page="products"]')?.addEventListener('click',()=>setTimeout(()=>load(true),0))
 document.getElementById('refreshData')?.addEventListener('click',()=>setTimeout(ensureTakeover,150))
 if(location.hash==='#products')setTimeout(()=>load(true),250)
}

document.getElementById('close')?.addEventListener('click',closeModal)
