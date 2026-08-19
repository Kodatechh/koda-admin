import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'

const SUPABASE_URL = 'https://qqvwnsemihkknzodkxob.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zrtmwfwuVzwsuMwCvyAMlg_TAP2tgNS'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const page = document.getElementById('page-products')
const modal = document.getElementById('modal')
const modalContent = document.getElementById('modalContent')
let products = []
let categories = []
let media = []
let files = []
let loading = false
let searchTerm = ''
let view = 'products'

const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
const money = (cents, currency = 'BRL') => cents == null ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(Number(cents)/100)
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
const humanType = value => ({physical:'Produto físico',digital:'Digital',service:'Serviço',coverage:'Cobertura',subscription:'Assinatura'})[value] || 'Produto'
const safeName = name => String(name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-120)

function toast(message, tone='success') {
  let node = document.querySelector('.toast')
  if (!node) { node = document.createElement('div'); node.className='toast'; document.body.appendChild(node) }
  node.textContent = message
  node.dataset.tone = tone
  node.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(()=>node.classList.remove('show'),3200)
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
  return ({
    unauthorized:'Sua sessão expirou. Entre novamente.', forbidden:'Somente administradores podem alterar produtos.',
    duplicate_product:'Já existe um produto com esse slug ou SKU.', product_has_orders:'Este produto já está em pedidos. Desative-o em vez de excluir.',
    invalid_slug:'Use apenas letras minúsculas, números e hífens no slug.', invalid_name:'Informe o nome.', invalid_price:'Preço inválido.', invalid_cost:'Preço de custo inválido.',
    invalid_stock:'Estoque inválido.', invalid_money:'Informe um valor válido.', invalid_category:'Categoria inválida.', duplicate_category:'Já existe uma categoria com este nome ou slug.',
    category_has_products:'Mova os produtos desta categoria antes de excluí-la.', insufficient_stock:'O ajuste deixaria o estoque negativo.', stock_not_tracked:'Ative o controle de estoque antes de ajustar.',
    invalid_stock_adjustment:'Informe uma movimentação diferente de zero.', media_record_failed:'A imagem foi enviada, mas não pôde ser vinculada ao produto.', file_record_failed:'O arquivo foi enviado, mas não pôde ser vinculado ao produto.'
  })[code] || 'Não foi possível concluir esta alteração.'
}

function openModal(html) {
  if (!modal || !modalContent) return
  modalContent.innerHTML = html
  modal.querySelector('.dialog')?.classList.add('wide')
  modal.hidden = false
}
function closeModal(){ if(modal) modal.hidden=true; if(modalContent) modalContent.innerHTML='' }
function margin(product){
  if(product.unit_amount_cents == null || product.cost_cents == null || Number(product.unit_amount_cents)<=0) return null
  return ((Number(product.unit_amount_cents)-Number(product.cost_cents))/Number(product.unit_amount_cents))*100
}
function productMedia(productId){ return media.filter(item=>item.product_id===productId).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||Number(a.sort_order)-Number(b.sort_order)) }
function productFiles(productId){ return files.filter(item=>item.product_id===productId).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)) }
function mediaUrl(item){ return item ? supabase.storage.from('product-media').getPublicUrl(item.storage_path).data.publicUrl : null }
function primaryImage(product){ const item=productMedia(product.id).find(x=>x.is_primary)||productMedia(product.id)[0]; return mediaUrl(item)||product.image_url||null }

function header() {
  return `<div class="template-title"><div><div class="eyebrow">KODA ADMIN · CATÁLOGO</div><h1>Produtos</h1><p>O catálogo oficial da Koda. O que você publica aqui alimenta a loja e o checkout.</p></div><div class="catalog-actions"><a class="secondary" href="https://koda-site-koda16.vercel.app/loja" target="_blank" rel="noreferrer">Ver loja ↗</a><button class="primary" id="newProductButton" type="button">+ Adicionar produto</button></div></div>
  <div class="catalog-tabs"><button data-catalog-view="products" class="${view==='products'?'active':''}">Produtos</button><button data-catalog-view="categories" class="${view==='categories'?'active':''}">Categorias</button><button data-catalog-view="inventory" class="${view==='inventory'?'active':''}">Estoque</button></div>`
}

function productCard(product){
  const m=margin(product), image=primaryImage(product)
  const low=product.track_stock && Number(product.stock_quantity||0)<=Number(product.low_stock_threshold||0)
  return `<article class="catalog-card">
    <div class="catalog-product-image">${image?`<img src="${esc(image)}" alt="${esc(product.name)}"/>`:`<span>${esc(product.name.slice(0,1).toUpperCase())}</span>`}</div>
    <div class="catalog-card-head"><div class="catalog-meta"><span class="catalog-tag ${product.active?'live':''}">${product.active?'Publicado':'Rascunho'}</span>${product.featured?'<span class="catalog-tag featured">Destaque</span>':''}</div><span class="catalog-tag">${esc(humanType(product.product_type))}</span></div>
    <h3>${esc(product.name)}</h3><p>${esc(product.short_description||product.description||'Sem descrição.')}</p>
    <div class="catalog-meta"><span class="catalog-tag">${esc(product.category||'Sem categoria')}</span><span class="catalog-tag">${esc(product.sku||'Sem SKU')}</span>${product.track_stock?`<span class="catalog-tag ${low?'warning':''}">${Number(product.stock_quantity||0)} em estoque</span>`:''}</div>
    <div class="catalog-price"><div><strong>${esc(money(product.unit_amount_cents,product.currency))}</strong><small>Custo ${esc(money(product.cost_cents,product.currency))}</small></div><span class="catalog-margin ${m!=null&&m<0?'negative':''}">${m==null?'Margem —':`Margem ${m.toFixed(1).replace('.',',')}%`}</span></div>
    <div class="catalog-card-buttons"><button class="secondary" data-edit-product="${esc(product.id)}" type="button">Editar</button></div>
  </article>`
}

function renderProducts(){
  const term=searchTerm.trim().toLowerCase()
  const visible=term?products.filter(p=>`${p.name} ${p.slug} ${p.sku||''} ${p.category||''}`.toLowerCase().includes(term)):products
  const published=products.filter(p=>p.active).length
  const low=products.filter(p=>p.track_stock&&Number(p.stock_quantity||0)<=Number(p.low_stock_threshold||0)).length
  const stockCost=products.filter(p=>p.track_stock).reduce((s,p)=>s+Number(p.cost_cents||0)*Number(p.stock_quantity||0),0)
  return `${header()}<div class="catalog-stats"><div class="catalog-stat"><span>Produtos</span><strong>${products.length}</strong></div><div class="catalog-stat"><span>Publicados</span><strong>${published}</strong></div><div class="catalog-stat"><span>Estoque baixo</span><strong>${low}</strong></div><div class="catalog-stat"><span>Custo do estoque</span><strong>${esc(money(stockCost))}</strong></div></div>
  <div class="catalog-toolbar"><input class="catalog-search" id="catalogSearch" value="${esc(searchTerm)}" placeholder="Buscar nome, SKU, categoria ou slug…"/><button class="secondary" id="refreshCatalog" type="button">Atualizar</button></div>
  ${visible.length?`<div class="catalog-grid">${visible.map(productCard).join('')}</div>`:'<div class="catalog-empty"><strong>Nenhum produto encontrado.</strong><p>Crie um produto ou altere sua busca.</p></div>'}`
}

function renderCategories(){
  return `${header()}<div class="catalog-section-head"><div><h2>Categorias da loja</h2><p>Organize a navegação da Koda Store sem editar código.</p></div><button class="primary" id="newCategory">+ Nova categoria</button></div>
  <div class="category-list">${categories.map(c=>`<article><div><span class="catalog-tag ${c.active?'live':''}">${c.active?'Ativa':'Oculta'}</span><h3>${esc(c.name)}</h3><p>/${esc(c.slug)}</p></div><div><button class="secondary" data-edit-category="${esc(c.id)}">Editar</button></div></article>`).join('')||'<div class="catalog-empty">Nenhuma categoria cadastrada.</div>'}</div>`
}

function renderInventory(){
  const tracked=products.filter(p=>p.track_stock)
  return `${header()}<div class="catalog-section-head"><div><h2>Estoque</h2><p>Entradas e ajustes ficam registrados no histórico administrativo.</p></div></div>
  <div class="inventory-list">${tracked.map(p=>{const low=Number(p.stock_quantity||0)<=Number(p.low_stock_threshold||0);return `<article><div><strong>${esc(p.name)}</strong><span>${esc(p.sku||p.slug)}</span></div><div class="inventory-count ${low?'low':''}">${Number(p.stock_quantity||0)} un.</div><button class="secondary" data-adjust-stock="${esc(p.id)}">Movimentar</button></article>`}).join('')||'<div class="catalog-empty"><strong>Nenhum produto com estoque controlado.</strong></div>'}</div>`
}

function render(){
  if(!page || !page.classList.contains('active')) return
  page.innerHTML=view==='categories'?renderCategories():view==='inventory'?renderInventory():renderProducts()
  bindPage()
}

function bindPage(){
  page.querySelectorAll('[data-catalog-view]').forEach(btn=>btn.addEventListener('click',()=>{view=btn.dataset.catalogView;render()}))
  document.getElementById('newProductButton')?.addEventListener('click',()=>openForm())
  document.getElementById('refreshCatalog')?.addEventListener('click',()=>load(true))
  document.getElementById('newCategory')?.addEventListener('click',()=>openCategory())
  document.getElementById('catalogSearch')?.addEventListener('input',e=>{searchTerm=e.target.value;render();const el=document.getElementById('catalogSearch');el?.focus();el?.setSelectionRange(searchTerm.length,searchTerm.length)})
  page.querySelectorAll('[data-edit-product]').forEach(btn=>btn.addEventListener('click',()=>openForm(products.find(p=>p.id===btn.dataset.editProduct))))
  page.querySelectorAll('[data-edit-category]').forEach(btn=>btn.addEventListener('click',()=>openCategory(categories.find(c=>c.id===btn.dataset.editCategory))))
  page.querySelectorAll('[data-adjust-stock]').forEach(btn=>btn.addEventListener('click',()=>openStock(products.find(p=>p.id===btn.dataset.adjustStock))))
}

function formHtml(p){
 const editing=Boolean(p), type=p?.product_type||'physical', physical=type==='physical', pMedia=editing?productMedia(p.id):[], pFiles=editing?productFiles(p.id):[]
 return `<div class="eyebrow">${editing?'EDITAR PRODUTO':'NOVO PRODUTO'}</div><h3>${editing?esc(p.name):'Adicionar produto'}</h3><p>Produto, preço, estoque, mídia, arquivos e publicação em um único lugar.</p>
 <form class="product-form" id="productForm">
 <div class="form-section"><h4>Informações</h4><div class="product-form-grid">
 <label>Nome<input id="productName" required maxlength="120" value="${esc(p?.name||'')}" placeholder="Ex.: KodaPower Mini"/></label>
 <label>Slug<input id="productSlug" required maxlength="120" value="${esc(p?.slug||'')}" placeholder="kodapower-mini"/></label>
 <label>SKU<input id="productSku" maxlength="80" value="${esc(p?.sku||'')}" placeholder="KODA-PWR-001"/></label>
 <label>Categoria<select id="productCategory"><option value="">Sem categoria</option>${categories.map(c=>`<option value="${esc(c.id)}" ${p?.category_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
 <label>Tipo<select id="productType"><option value="physical" ${type==='physical'?'selected':''}>Produto físico</option><option value="digital" ${type==='digital'?'selected':''}>Digital</option><option value="service" ${type==='service'?'selected':''}>Serviço</option><option value="coverage" ${type==='coverage'?'selected':''}>Cobertura</option><option value="subscription" ${type==='subscription'?'selected':''}>Assinatura</option></select></label>
 <label>Ordem na loja<input id="productSort" type="number" min="0" step="1" value="${Number(p?.sort_order||0)}"/></label>
 <label class="full-row">Descrição curta<input id="productShortDescription" maxlength="280" value="${esc(p?.short_description||'')}" placeholder="Uma frase curta para cards e destaques."/></label>
 <label class="full-row">Descrição completa<textarea id="productDescription" rows="5" maxlength="5000">${esc(p?.description||'')}</textarea></label>
 </div></div>
 <div class="form-section"><h4>Preço</h4><div class="product-form-grid"><label>Preço de venda (R$)<input id="productPrice" inputmode="decimal" value="${esc(centsToInput(p?.unit_amount_cents))}" placeholder="99,90"/></label><label>Preço de custo (R$)<input id="productCost" inputmode="decimal" value="${esc(centsToInput(p?.cost_cents))}" placeholder="45,00"/></label><label>Preço anterior / referência (R$)<input id="productComparePrice" inputmode="decimal" value="${esc(centsToInput(p?.compare_at_cents))}" placeholder="129,90"/></label><div class="margin-preview" id="marginPreview">Margem calculada ao salvar</div></div></div>
 <div class="form-section"><h4>Disponibilidade</h4><div class="product-switches"><label class="product-switch"><input id="productActive" type="checkbox" ${p?.active?'checked':''}/><span><strong>Publicado</strong><small>Exibe o produto na Koda Store.</small></span></label><label class="product-switch"><input id="productFeatured" type="checkbox" ${p?.featured?'checked':''}/><span><strong>Destaque</strong><small>Pode aparecer nas áreas principais da loja.</small></span></label><label class="product-switch"><input id="productTrackStock" type="checkbox" ${p?.track_stock?'checked':''} ${physical?'':'disabled'}/><span><strong>Controlar estoque</strong><small>Impede venda quando chegar a zero.</small></span></label><label class="product-switch"><input id="productRequiresDevice" type="checkbox" ${p?.requires_device?'checked':''}/><span><strong>Exige dispositivo</strong><small>Use para KodaCare e serviços vinculados a um KodaBot.</small></span></label></div>
 <div class="product-form-grid" id="stockFields" ${physical?'':'hidden'}><label>Quantidade em estoque<input id="productStock" type="number" min="0" step="1" value="${p?.stock_quantity??''}" placeholder="0"/></label><label>Alerta de estoque baixo<input id="productLowStock" type="number" min="0" step="1" value="${p?.low_stock_threshold??5}"/></label><label class="product-switch compact"><input id="productRequiresShipping" type="checkbox" ${p?.requires_shipping?'checked':''}/><span><strong>Precisa de envio</strong><small>Solicita endereço no checkout.</small></span></label></div></div>
 <div class="form-section" id="shippingSection" ${physical?'':'hidden'}><h4>Envio</h4><div class="product-form-grid"><label>Peso (g)<input id="productWeight" type="number" min="0" value="${p?.weight_grams??''}" placeholder="250"/></label><label>Comprimento (mm)<input id="productLength" type="number" min="0" value="${p?.length_mm??''}"/></label><label>Largura (mm)<input id="productWidth" type="number" min="0" value="${p?.width_mm??''}"/></label><label>Altura (mm)<input id="productHeight" type="number" min="0" value="${p?.height_mm??''}"/></label></div></div>
 <div class="form-section"><h4>Fotos e arquivos</h4><div class="upload-grid"><label class="upload-box"><strong>Imagem principal</strong><span>PNG, JPG, WebP ou AVIF · até 15 MB</span><input id="productPrimaryImage" type="file" accept="image/png,image/jpeg,image/webp,image/avif"/></label><label class="upload-box"><strong>Galeria</strong><span>Selecione várias imagens</span><input id="productGallery" type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif"/></label><label class="upload-box"><strong>Arquivos do produto</strong><span>PDF, manual, STL, ZIP e outros · até 50 MB</span><input id="productFiles" type="file" multiple/></label><label>Visibilidade dos arquivos<select id="productFileVisibility"><option value="internal">Somente equipe Koda</option><option value="customer">Clientes do produto</option><option value="public">Público</option></select></label></div>
 ${editing?`<div class="asset-list"><h5>Imagens atuais</h5>${pMedia.length?pMedia.map(item=>`<div><span>${item.is_primary?'Principal · ':''}${esc(item.alt_text||item.storage_path.split('/').pop())}</span><button type="button" data-delete-media="${esc(item.id)}">Remover</button></div>`).join(''):'<p>Nenhuma imagem enviada.</p>'}<h5>Arquivos atuais</h5>${pFiles.length?pFiles.map(item=>`<div><span>${esc(item.label||item.file_name)} · ${esc(item.visibility)}</span><button type="button" data-delete-file="${esc(item.id)}">Remover</button></div>`).join(''):'<p>Nenhum arquivo enviado.</p>'}</div>`:''}
 </div>
 <div class="form-section"><h4>SEO</h4><div class="product-form-grid"><label class="full-row">Título da página<input id="productSeoTitle" maxlength="160" value="${esc(p?.seo_title||'')}"/></label><label class="full-row">Descrição para busca<textarea id="productSeoDescription" rows="3" maxlength="320">${esc(p?.seo_description||'')}</textarea></label></div></div>
 <div class="product-form-footer"><button class="secondary" id="cancelProduct" type="button">Cancelar</button><button class="primary" id="saveProduct" type="submit">${editing?'Salvar alterações':'Criar produto'}</button></div>
 ${editing?'<div class="product-danger"><p>Produtos já usados em pedidos devem ser desativados em vez de excluídos.</p><button class="danger-button" id="deleteProduct" type="button">Excluir produto</button></div>':''}</form>`
}

function openForm(p=null){
 openModal(formHtml(p))
 const name=document.getElementById('productName'), slug=document.getElementById('productSlug'), type=document.getElementById('productType'), stock=document.getElementById('stockFields'), shipping=document.getElementById('shippingSection'), track=document.getElementById('productTrackStock')
 let touched=Boolean(p)
 slug?.addEventListener('input',()=>{touched=true})
 name?.addEventListener('input',()=>{if(!touched&&slug)slug.value=slugify(name.value)})
 type?.addEventListener('change',()=>{const physical=type.value==='physical';stock.hidden=!physical;shipping.hidden=!physical;track.disabled=!physical;if(!physical)track.checked=false})
 for(const id of ['productPrice','productCost']) document.getElementById(id)?.addEventListener('input',updateMarginPreview)
 document.getElementById('cancelProduct')?.addEventListener('click',closeModal)
 document.getElementById('deleteProduct')?.addEventListener('click',()=>removeProduct(p))
 document.getElementById('productForm')?.addEventListener('submit',e=>saveProduct(e,p))
 modalContent.querySelectorAll('[data-delete-media]').forEach(btn=>btn.addEventListener('click',()=>deleteMedia(btn.dataset.deleteMedia,p)))
 modalContent.querySelectorAll('[data-delete-file]').forEach(btn=>btn.addEventListener('click',()=>deleteFile(btn.dataset.deleteFile,p)))
 updateMarginPreview();setTimeout(()=>name?.focus(),30)
}

function updateMarginPreview(){
 const node=document.getElementById('marginPreview'); if(!node)return
 try{const price=inputToCents(document.getElementById('productPrice')?.value),cost=inputToCents(document.getElementById('productCost')?.value);if(price&&cost!=null){const value=((price-cost)/price)*100;node.textContent=`Lucro ${money(price-cost)} · Margem ${value.toFixed(1).replace('.',',')}%`}else node.textContent='Preencha venda e custo para calcular a margem.'}catch{node.textContent='Valores inválidos.'}
}

async function uploadAssets(product){
 const primary=document.getElementById('productPrimaryImage')?.files?.[0]
 const gallery=[...(document.getElementById('productGallery')?.files||[])]
 const docs=[...(document.getElementById('productFiles')?.files||[])]
 const visibility=document.getElementById('productFileVisibility')?.value||'internal'
 const uploadImage=async(file,isPrimary=false,order=0)=>{
   if(file.size>15*1024*1024) throw new Error(`${file.name}: imagem maior que 15 MB`)
   const path=`${product.id}/${crypto.randomUUID()}-${safeName(file.name)}`
   const {error}=await supabase.storage.from('product-media').upload(path,file,{cacheControl:'3600',contentType:file.type,upsert:false});if(error)throw error
   await api('media_record',{product_id:product.id,storage_path:path,media_type:'image',alt_text:product.name,sort_order:order,is_primary:isPrimary})
 }
 if(primary) await uploadImage(primary,true,0)
 let order=10;for(const file of gallery){await uploadImage(file,false,order);order+=10}
 for(const file of docs){
   if(file.size>50*1024*1024) throw new Error(`${file.name}: arquivo maior que 50 MB`)
   const path=`${product.id}/${crypto.randomUUID()}-${safeName(file.name)}`
   const {error}=await supabase.storage.from('product-files').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(error)throw error
   await api('file_record',{product_id:product.id,storage_path:path,file_name:file.name,mime_type:file.type||null,file_size_bytes:file.size,visibility,label:file.name})
 }
}

async function saveProduct(event,existing){
 event.preventDefault();const button=document.getElementById('saveProduct');button.disabled=true;button.textContent='Salvando…'
 try{
  const type=document.getElementById('productType').value, track=type==='physical'&&document.getElementById('productTrackStock').checked
  const stockRaw=document.getElementById('productStock')?.value||''
  const categoryId=document.getElementById('productCategory').value||null
  const category=categories.find(c=>c.id===categoryId)?.name||''
  const product={name:document.getElementById('productName').value.trim(),slug:document.getElementById('productSlug').value.trim().toLowerCase(),sku:document.getElementById('productSku').value.trim(),category_id:categoryId,category,product_type:type,sort_order:Number(document.getElementById('productSort').value||0),unit_amount_cents:inputToCents(document.getElementById('productPrice').value),compare_at_cents:inputToCents(document.getElementById('productComparePrice').value),cost_cents:inputToCents(document.getElementById('productCost').value),short_description:document.getElementById('productShortDescription').value.trim(),description:document.getElementById('productDescription').value.trim(),active:document.getElementById('productActive').checked,featured:document.getElementById('productFeatured').checked,track_stock:track,stock_quantity:track?Number(stockRaw||0):null,low_stock_threshold:Number(document.getElementById('productLowStock')?.value||5),requires_shipping:type==='physical'&&document.getElementById('productRequiresShipping')?.checked,requires_device:document.getElementById('productRequiresDevice').checked,weight_grams:type==='physical'&&document.getElementById('productWeight').value!==''?Number(document.getElementById('productWeight').value):null,length_mm:type==='physical'&&document.getElementById('productLength').value!==''?Number(document.getElementById('productLength').value):null,width_mm:type==='physical'&&document.getElementById('productWidth').value!==''?Number(document.getElementById('productWidth').value):null,height_mm:type==='physical'&&document.getElementById('productHeight').value!==''?Number(document.getElementById('productHeight').value):null,seo_title:document.getElementById('productSeoTitle').value.trim(),seo_description:document.getElementById('productSeoDescription').value.trim(),currency:'BRL'}
  if(product.stock_quantity!==null&&!Number.isInteger(product.stock_quantity))throw new Error('invalid_stock')
  const result=await api(existing?'update':'create',existing?{id:existing.id,product}:{product})
  await uploadAssets(result.product)
  closeModal();toast(existing?'Produto atualizado e sincronizado com a loja.':'Produto criado e sincronizado com a loja.');await load(true)
 }catch(err){toast(friendly(err.message)==='Não foi possível concluir esta alteração.'?(err.message||'Erro ao salvar.'):friendly(err.message),'error');button.disabled=false;button.textContent=existing?'Salvar alterações':'Criar produto'}
}

async function deleteMedia(id,p){if(!confirm('Remover esta imagem?'))return;try{await api('media_delete',{id});toast('Imagem removida.');await load(true);openForm(products.find(x=>x.id===p.id))}catch(err){toast(friendly(err.message),'error')}}
async function deleteFile(id,p){if(!confirm('Remover este arquivo?'))return;try{await api('file_delete',{id});toast('Arquivo removido.');await load(true);openForm(products.find(x=>x.id===p.id))}catch(err){toast(friendly(err.message),'error')}}
async function removeProduct(product){if(!product||!confirm(`Excluir ${product.name}?`))return;try{await api('delete',{id:product.id});closeModal();toast('Produto excluído.');await load(true)}catch(err){toast(friendly(err.message),'error')}}

function openCategory(category=null){
 const editing=Boolean(category);openModal(`<div class="eyebrow">${editing?'EDITAR CATEGORIA':'NOVA CATEGORIA'}</div><h3>${editing?esc(category.name):'Adicionar categoria'}</h3><form class="product-form" id="categoryForm"><div class="product-form-grid"><label>Nome<input id="categoryName" required value="${esc(category?.name||'')}"/></label><label>Slug<input id="categorySlug" required value="${esc(category?.slug||'')}"/></label><label>Ordem<input id="categorySort" type="number" min="0" value="${Number(category?.sort_order||0)}"/></label><label class="product-switch compact"><input id="categoryActive" type="checkbox" ${category?.active!==false?'checked':''}/><span><strong>Ativa</strong><small>Exibe na navegação da loja.</small></span></label><label class="full-row">Descrição<textarea id="categoryDescription" rows="3">${esc(category?.description||'')}</textarea></label></div><div class="product-form-footer"><button class="secondary" type="button" id="cancelCategory">Cancelar</button><button class="primary" type="submit">Salvar categoria</button></div>${editing?'<div class="product-danger"><p>A categoria só pode ser excluída se não tiver produtos vinculados.</p><button type="button" class="danger-button" id="deleteCategory">Excluir categoria</button></div>':''}</form>`)
 const name=document.getElementById('categoryName'),slug=document.getElementById('categorySlug');let touched=editing
 slug.addEventListener('input',()=>touched=true);name.addEventListener('input',()=>{if(!touched)slug.value=slugify(name.value)});document.getElementById('cancelCategory').addEventListener('click',closeModal)
 document.getElementById('categoryForm').addEventListener('submit',async e=>{e.preventDefault();try{const payload={name:name.value.trim(),slug:slug.value.trim().toLowerCase(),description:document.getElementById('categoryDescription').value.trim(),sort_order:Number(document.getElementById('categorySort').value||0),active:document.getElementById('categoryActive').checked};await api(editing?'category_update':'category_create',editing?{id:category.id,category:payload}:{category:payload});closeModal();toast('Categoria salva.');await load(true)}catch(err){toast(friendly(err.message),'error')}})
 document.getElementById('deleteCategory')?.addEventListener('click',async()=>{if(!confirm(`Excluir ${category.name}?`))return;try{await api('category_delete',{id:category.id});closeModal();toast('Categoria excluída.');await load(true)}catch(err){toast(friendly(err.message),'error')}})
}

function openStock(product){
 if(!product)return;openModal(`<div class="eyebrow">MOVIMENTAÇÃO DE ESTOQUE</div><h3>${esc(product.name)}</h3><p>Estoque atual: <strong>${Number(product.stock_quantity||0)} unidades</strong>.</p><form class="product-form" id="stockForm"><div class="product-form-grid"><label>Quantidade<input id="stockDelta" type="number" step="1" required placeholder="Ex.: 10 ou -2"/></label><label>Motivo<input id="stockReason" maxlength="240" placeholder="Compra, ajuste, perda, devolução…"/></label></div><div class="stock-hint">Use valor positivo para entrada e negativo para saída.</div><div class="product-form-footer"><button class="secondary" type="button" id="cancelStock">Cancelar</button><button class="primary" type="submit">Registrar movimentação</button></div></form>`)
 document.getElementById('cancelStock').addEventListener('click',closeModal);document.getElementById('stockForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('inventory_adjust',{id:product.id,quantity_delta:Number(document.getElementById('stockDelta').value),reason:document.getElementById('stockReason').value.trim()});closeModal();toast('Estoque atualizado.');await load(true)}catch(err){toast(friendly(err.message),'error')}})
}

async function load(force=false){
 if(!page||loading||!page.classList.contains('active'))return
 if(!force&&page.querySelector('#newProductButton'))return
 loading=true;page.innerHTML='<div class="catalog-loading">Carregando catálogo da Koda…</div>'
 try{const result=await api('list');products=result.products||[];categories=result.categories||[];media=result.media||[];files=result.files||[];render()}catch(err){page.innerHTML=`<div class="catalog-empty"><strong>Não foi possível carregar o catálogo.</strong><p>${esc(friendly(err.message))}</p><button class="primary" id="catalogRetry">Tentar novamente</button></div>`;document.getElementById('catalogRetry')?.addEventListener('click',()=>load(true))}finally{loading=false}
}
function ensureTakeover(){if(!page?.classList.contains('active'))return;if(page.querySelector('#newProductButton')||page.querySelector('.catalog-loading'))return;load(true)}
if(page){new MutationObserver(()=>queueMicrotask(ensureTakeover)).observe(page,{childList:true});new MutationObserver(()=>queueMicrotask(ensureTakeover)).observe(page,{attributes:true,attributeFilter:['class']});document.querySelector('[data-page="products"]')?.addEventListener('click',()=>setTimeout(()=>load(true),0));document.getElementById('refreshData')?.addEventListener('click',()=>setTimeout(ensureTakeover,150));if(location.hash==='#products')setTimeout(()=>load(true),250)}
document.getElementById('close')?.addEventListener('click',closeModal)
