import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'

const SUPABASE_URL='https://qqvwnsemihkknzodkxob.supabase.co'
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_zrtmwfwuVzwsuMwCvyAMlg_TAP2tgNS'
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY)
const page=document.getElementById('page-factory')
const modal=document.getElementById('modal')
const modalContent=document.getElementById('modalContent')
let devices=[]
let query=''
let loading=false

const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
const stageLabel=s=>({registered:'Aguardando provisionamento',provisioned:'Provisionado',factory_tested:'Testado',ready:'Pronto'})[s]||s
const modelLabel=m=>m==='kodabot-i'?'KodaBot':m==='kodabot-i-pro'?'KodaBot Pro':m
const online=last=>last&&Date.now()-Date.parse(last)<=120000

function toast(message,tone='success'){let n=document.querySelector('.toast');if(!n){n=document.createElement('div');n.className='toast';document.body.appendChild(n)}n.textContent=message;n.dataset.tone=tone;n.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.classList.remove('show'),3000)}
function openModal(html){modalContent.innerHTML=html;modal.querySelector('.dialog')?.classList.add('wide');modal.hidden=false}
function closeModal(){modal.hidden=true;modalContent.innerHTML=''}

async function load(force=false){
 if(!page||loading||!page.classList.contains('active'))return
 if(!force&&page.querySelector('[data-factory-ready]'))return
 loading=true;page.innerHTML='<div class="loading-state">Carregando produção real do KodaCloud…</div>'
 try{
  const [factory,presence]=await Promise.all([supabase.rpc('factory_list_devices'),supabase.from('devices').select('id,last_seen_at')])
  if(factory.error)throw factory.error
  const seen=new Map((presence.data||[]).map(d=>[d.id,d.last_seen_at]))
  devices=(factory.data||[]).map(d=>({...d,last_seen_at:seen.get(d.id)||null}))
  render()
 }catch(error){page.innerHTML=`<div class="catalog-empty"><strong>Não foi possível carregar a fábrica.</strong><p>${esc(error.message||'Verifique sua permissão administrativa.')}</p><button class="primary" id="retryFactory">Tentar novamente</button></div>`;document.getElementById('retryFactory')?.addEventListener('click',()=>load(true))}
 finally{loading=false}
}

function render(){
 const q=query.trim().toLowerCase(),visible=q?devices.filter(d=>`${d.serial_number} ${d.model} ${d.provisioning_status} ${d.owner_email_masked||''}`.toLowerCase().includes(q)):devices
 const ready=devices.filter(d=>d.provisioning_status==='ready').length,activated=devices.filter(d=>d.status==='activated').length,connected=devices.filter(d=>online(d.last_seen_at)).length
 page.innerHTML=`<div data-factory-ready="1"><div class="template-title"><div><div class="eyebrow">KODA ADMIN · FÁBRICA</div><h1>Produção</h1><p>Provisionamento, testes e liberação de cada KodaBot ficam agora somente no painel administrativo.</p></div><button class="primary" id="provisionDevice">+ Provisionar KodaBot</button></div>
 <div class="catalog-stats"><div class="catalog-stat"><span>Unidades</span><strong>${devices.length}</strong></div><div class="catalog-stat"><span>Prontas</span><strong>${ready}</strong></div><div class="catalog-stat"><span>Ativadas</span><strong>${activated}</strong></div><div class="catalog-stat"><span>Online agora</span><strong>${connected}</strong></div></div>
 <div class="factory-flow"><span>1. Registrado</span><span>2. Provisionado</span><span>3. Testado</span><span>4. Pronto</span><span>5. Ativado</span></div>
 <div class="catalog-toolbar"><input class="catalog-search" id="factorySearch" value="${esc(query)}" placeholder="Buscar serial, modelo ou status…"/><button class="secondary" id="refreshFactory">Atualizar</button></div>
 <div class="factory-table-wrap"><table class="factory-table"><thead><tr><th>Serial</th><th>Modelo</th><th>Produção</th><th>KODA OS</th><th>Conexão</th><th>Ativação</th><th>Proprietário</th><th></th></tr></thead><tbody>${visible.map(d=>`<tr><td><code>${esc(d.serial_number)}</code></td><td>${esc(modelLabel(d.model))}</td><td><span class="catalog-tag ${d.provisioning_status==='ready'?'live':''}">${esc(stageLabel(d.provisioning_status))}</span></td><td>${esc(d.kodaos_version||'—')}</td><td><span class="catalog-tag ${online(d.last_seen_at)?'live':''}">${online(d.last_seen_at)?'Online':'Offline'}</span></td><td>${d.status==='activated'?'Ativado':'Não ativado'}</td><td>${esc(d.owner_email_masked||'Nenhum')}</td><td><button class="secondary" data-factory-device="${esc(d.id)}">Ver</button></td></tr>`).join('')}</tbody></table>${visible.length?'':'<div class="catalog-empty">Nenhum dispositivo encontrado.</div>'}</div></div>`
 document.getElementById('provisionDevice')?.addEventListener('click',openProvision)
 document.getElementById('refreshFactory')?.addEventListener('click',()=>load(true))
 document.getElementById('factorySearch')?.addEventListener('input',e=>{query=e.target.value;render();const el=document.getElementById('factorySearch');el?.focus();el?.setSelectionRange(query.length,query.length)})
 page.querySelectorAll('[data-factory-device]').forEach(btn=>btn.addEventListener('click',()=>openDevice(devices.find(d=>d.id===btn.dataset.factoryDevice))))
}

function openProvision(){
 openModal(`<div class="eyebrow">FÁBRICA · PROVISIONAMENTO</div><h3>Provisionar KodaBot</h3><p>A identidade é criada uma única vez. O segredo só será incluído no arquivo baixado.</p><form class="product-form" id="factoryProvisionForm"><div class="product-form-grid"><label>Modelo<select id="factoryModel"><option value="kodabot-i">KodaBot</option><option value="kodabot-i-pro">KodaBot Pro</option></select></label><label>Número de série<input id="factorySerial" required placeholder="KBP-0001" autocomplete="off"/></label><label class="full-row">Board UID<input id="factoryBoardUid" required placeholder="49b0eb4b537cd293" autocomplete="off" spellcheck="false"/></label></div><div class="product-form-footer"><button class="secondary" id="cancelProvision" type="button">Cancelar</button><button class="primary" id="submitProvision" type="submit">Provisionar</button></div><div class="form-status" id="factoryProvisionStatus"></div></form>`)
 document.getElementById('cancelProvision').addEventListener('click',closeModal)
 document.getElementById('factoryProvisionForm').addEventListener('submit',async e=>{e.preventDefault();const button=document.getElementById('submitProvision'),status=document.getElementById('factoryProvisionStatus');button.disabled=true;button.textContent='Provisionando…';status.textContent='';try{const serial=document.getElementById('factorySerial').value.trim().toUpperCase(),board_uid=document.getElementById('factoryBoardUid').value.trim().toLowerCase(),model=document.getElementById('factoryModel').value;if(serial.length<4||!/^[0-9a-f]{8,}$/.test(board_uid))throw new Error('Revise o serial e o Board UID.');const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Sua sessão expirou.');const {data,error}=await supabase.functions.invoke('kodacloud-factory-provision',{body:{serial,model,board_uid},headers:{Authorization:`Bearer ${session.access_token}`}});if(error||!data?.ok||!data?.factory_identity)throw error||new Error('Resposta inválida do KodaCloud.');const blob=new Blob([JSON.stringify(data.factory_identity,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);modalContent.innerHTML=`<div class="eyebrow">PROVISIONADO</div><h3>${esc(data.device.serial)}</h3><p>O dispositivo foi registrado com segurança no KodaCloud.</p><div class="factory-result"><div><span>Modelo</span><strong>${esc(modelLabel(data.device.model))}</strong></div><div><span>Board UID</span><strong>${esc(data.device.board_uid)}</strong></div><div><span>Status</span><strong>Não ativado</strong></div></div><a class="primary factory-download" id="downloadFactoryIdentity" href="${url}" download="factory_identity.json">Baixar factory_identity.json</a><p class="factory-secret-note">Guarde este arquivo em local seguro. O segredo não será exibido na tela nem poderá ser recuperado depois.</p>`;document.getElementById('downloadFactoryIdentity').addEventListener('click',()=>setTimeout(()=>URL.revokeObjectURL(url),1000));await load(true)}catch(error){status.textContent=error.message||'Não foi possível provisionar.';status.style.color='#b42318';button.disabled=false;button.textContent='Provisionar'}})
}

async function openDevice(device){
 if(!device)return
 openModal(`<div class="loading-state">Carregando ${esc(device.serial_number)}…</div>`)
 const {data:tests}=await supabase.rpc('get_device_factory_tests',{_device_id:device.id})
 renderDevice(device,tests||[])
}

function renderDevice(device,tests){
 const components=device.model==='kodabot-i-pro'?['wifi','microphones','speaker','buttons','battery','charging','kodaos','kodacloud']:['display','touch','wifi','buzzer','bme280','kodaos','kodacloud']
 const stage={registered:0,provisioned:1,factory_tested:2,ready:3}[device.provisioning_status]??0
 const passed=components.length>0&&components.every(c=>tests.find(t=>t.component_name===c)?.status==='passed')
 modalContent.innerHTML=`<div class="eyebrow">FÁBRICA · ${esc(device.serial_number)}</div><h3>${esc(modelLabel(device.model))}</h3><div class="factory-detail-grid"><div><span>Serial</span><strong>${esc(device.serial_number)}</strong></div><div><span>KODA OS</span><strong>${esc(device.kodaos_version||'—')}</strong></div><div><span>Produção</span><strong>${esc(stageLabel(device.provisioning_status))}</strong></div><div><span>Ativação</span><strong>${device.status==='activated'?'Ativado':'Não ativado'}</strong></div></div>
 <div class="factory-timeline">${['Registrado','Provisionado','Testado','Pronto para venda','Ativado'].map((x,i)=>`<div class="${i<4?(stage>=i?'done':''):(device.status==='activated'?'done':'')}"><i></i><span>${x}</span></div>`).join('')}</div>
 ${stage>=1?`<div class="form-section"><h4>Testes de fábrica</h4><div class="factory-tests">${components.map(c=>{const t=tests.find(x=>x.component_name===c);return `<label><span>${esc(c)}</span><select data-test-component="${esc(c)}" ${stage!==1?'disabled':''}><option value="pending" ${(t?.status||'pending')==='pending'?'selected':''}>Pendente</option><option value="passed" ${t?.status==='passed'?'selected':''}>Aprovado</option><option value="failed" ${t?.status==='failed'?'selected':''}>Reprovado</option></select></label>`}).join('')}</div>${stage===1?`<button class="primary factory-stage-button" id="markFactoryTested" ${passed?'':'disabled'}>Marcar como Testado</button>`:''}${stage===2?'<button class="primary factory-stage-button" id="markFactoryReady">Pronto para venda</button>':''}</div>`:''}
 <div class="product-danger"><p>A exclusão só deve ser usada para unidades não ativadas e sem proprietário.</p><button class="danger-button" id="deleteFactoryDevice">Excluir KodaBot</button></div>`
 modalContent.querySelectorAll('[data-test-component]').forEach(select=>select.addEventListener('change',async()=>{const {error}=await supabase.rpc('update_device_factory_test',{_device_id:device.id,_component_name:select.dataset.testComponent,_status:select.value});if(error)toast(error.message,'error');else openDevice(device)}))
 document.getElementById('markFactoryTested')?.addEventListener('click',async()=>{const {error}=await supabase.rpc('mark_device_factory_tested',{_device_id:device.id});if(error)toast(error.message,'error');else{toast('Unidade marcada como testada.');closeModal();await load(true)}})
 document.getElementById('markFactoryReady')?.addEventListener('click',async()=>{const {error}=await supabase.rpc('mark_device_ready_for_sale',{_device_id:device.id});if(error)toast(error.message,'error');else{toast('Unidade pronta para venda.');closeModal();await load(true)}})
 document.getElementById('deleteFactoryDevice')?.addEventListener('click',()=>confirmDelete(device))
}

function confirmDelete(device){
 openModal(`<div class="eyebrow">AÇÃO PERMANENTE</div><h3>Excluir ${esc(device.serial_number)}?</h3><p>Digite o número de série para confirmar. Esta ação não pode ser desfeita.</p><form class="product-form" id="deleteFactoryForm"><label>Serial<input id="confirmFactorySerial" autocomplete="off"/></label><div class="product-form-footer"><button class="secondary" type="button" id="cancelFactoryDelete">Cancelar</button><button class="danger-button" type="submit">Excluir permanentemente</button></div></form>`)
 document.getElementById('cancelFactoryDelete').addEventListener('click',closeModal)
 document.getElementById('deleteFactoryForm').addEventListener('submit',async e=>{e.preventDefault();if(document.getElementById('confirmFactorySerial').value.trim()!==device.serial_number){toast('O serial não confere.','error');return}const {error}=await supabase.rpc('factory_delete_device',{_device_id:device.id});if(error)toast(error.message,'error');else{closeModal();toast(`${device.serial_number} excluído.`);await load(true)}})
}

function ensure(){if(page?.classList.contains('active')&&!page.querySelector('[data-factory-ready]')&&!page.querySelector('.loading-state'))load(true)}
if(page){new MutationObserver(()=>queueMicrotask(ensure)).observe(page,{attributes:true,attributeFilter:['class']});document.querySelector('[data-page="factory"]')?.addEventListener('click',()=>setTimeout(()=>load(true),0));document.getElementById('refreshData')?.addEventListener('click',()=>setTimeout(ensure,150))}
document.getElementById('close')?.addEventListener('click',closeModal)
