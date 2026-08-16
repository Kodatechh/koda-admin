import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3'

const SUPABASE_URL = 'https://qqvwnsemihkknzodkxob.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zrtmwfwuVzwsuMwCvyAMlg_TAP2tgNS'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const BUCKET = 'koda-os-releases'
const MAX_FILE_SIZE = 25 * 1024 * 1024
const RELEASE_STATUSES = {
  draft: 'Rascunho',
  published: 'Publicado',
  paused: 'Pausado',
  archived: 'Arquivado'
}

const otaState = {
  user: null,
  isAdmin: false,
  devices: [],
  releases: [],
  loading: false
}

const $ = (id) => document.getElementById(id)

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char])
}

function normalizeModel(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function versionParts(value) {
  return String(value || '0').replace(/^v/i, '').split('.').map((part) => Number(part.replace(/\D.*/, '')) || 0)
}

function compareVersions(a, b) {
  const av = versionParts(a)
  const bv = versionParts(b)
  const length = Math.max(av.length, bv.length)
  for (let i = 0; i < length; i += 1) {
    const left = av[i] || 0
    const right = bv[i] || 0
    if (left !== right) return left - right
  }
  return 0
}

function parseChangelogItems(value) {
  const seen = new Set()
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 280))
    .filter((item) => {
      const key = item.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 30)
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(date)
}

function releaseStatusClass(status) {
  if (status === 'published') return 'success'
  if (status === 'draft' || status === 'paused') return 'pending'
  return ''
}

function uniqueModels() {
  const map = new Map()
  otaState.devices.forEach((device) => {
    if (!device.model) return
    const key = normalizeModel(device.model)
    if (!map.has(key)) map.set(key, device.model)
  })
  if (!map.size) map.set('kodaboti', 'kodabot-i')
  return [...map.values()]
}

function eligibleDevices(release) {
  const model = normalizeModel(release.target_model)
  return otaState.devices.filter((device) =>
    normalizeModel(device.model) === model &&
    compareVersions(release.version, device.kodaos_version || '0') > 0 &&
    device.status !== 'retired'
  )
}

function currentPublishedRelease() {
  return otaState.releases
    .filter((release) => release.status === 'published' && release.channel === 'stable')
    .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at))[0] || null
}

function showNotice(message, tone = 'default') {
  let node = $('otaNotice')
  if (!node) {
    node = document.createElement('div')
    node.id = 'otaNotice'
    node.className = 'ota-notice'
    document.body.appendChild(node)
  }
  node.textContent = message
  node.dataset.tone = tone
  node.classList.add('show')
  clearTimeout(showNotice.timer)
  showNotice.timer = setTimeout(() => node.classList.remove('show'), 3200)
}

async function ensureAccess() {
  const { data: { user } } = await supabase.auth.getUser()
  otaState.user = user || null
  otaState.isAdmin = false
  if (!user) return false

  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  if (error) return false
  otaState.isAdmin = (roles || []).some((item) => item.role === 'admin')
  return true
}

async function loadOtaData() {
  if (otaState.loading) return
  otaState.loading = true
  try {
    await ensureAccess()
    const [{ data: devices, error: deviceError }, { data: releases, error: releaseError }] = await Promise.all([
      supabase
        .from('devices')
        .select('id,serial_number,model,status,kodaos_version,latest_available_kodaos')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('koda_os_releases')
        .select('id,version,target_model,channel,release_notes,changelog_items,storage_path,original_filename,sha256,file_size,status,created_by,published_by,created_at,published_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(100)
    ])

    if (deviceError) throw deviceError
    if (releaseError) throw releaseError
    otaState.devices = devices || []
    otaState.releases = releases || []
  } catch (error) {
    console.error('[Koda Admin OTA]', error)
  } finally {
    otaState.loading = false
  }
}

function releaseRow(release) {
  const eligible = eligibleDevices(release)
  const changelogCount = Array.isArray(release.changelog_items) ? release.changelog_items.length : 0
  let action = '<span class="ota-muted">Somente leitura</span>'

  if (otaState.isAdmin && ['draft', 'paused'].includes(release.status)) {
    action = `<button class="ota-action primary-action" data-ota-publish="${escapeHtml(release.id)}" type="button">Publicar</button>`
  } else if (otaState.isAdmin && release.status === 'published') {
    action = `<button class="ota-action" data-ota-pause="${escapeHtml(release.id)}" type="button">Pausar</button>`
  } else if (otaState.isAdmin && release.status === 'archived') {
    action = `<button class="ota-action" data-ota-publish="${escapeHtml(release.id)}" type="button">Republicar</button>`
  }

  return `<div class="ota-release-row">
    <div class="ota-release-main">
      <div class="ota-release-title"><strong>KODA OS ${escapeHtml(release.version)}</strong><i class="pill ${releaseStatusClass(release.status)}">${escapeHtml(RELEASE_STATUSES[release.status] || release.status)}</i></div>
      <span>${escapeHtml(release.target_model)} · ${escapeHtml(release.channel)} · ${escapeHtml(formatBytes(release.file_size))}</span>
      <small>${escapeHtml(release.original_filename)} · SHA-256 ${escapeHtml(String(release.sha256 || '').slice(0, 12))}… · ${changelogCount} item${changelogCount === 1 ? '' : 's'} no changelog</small>
    </div>
    <div class="ota-release-meta"><strong>${eligible.length}</strong><span>elegível${eligible.length === 1 ? '' : 'is'}</span></div>
    <div class="ota-release-meta"><strong>${escapeHtml(formatDate(release.published_at || release.created_at))}</strong><span>${release.published_at ? 'publicado' : 'enviado'}</span></div>
    <div class="ota-release-action">${action}</div>
  </div>`
}

function renderPublisher() {
  const page = $('page-os')
  if (!page || !page.innerHTML.trim()) return
  const old = $('otaPublisher')
  if (old) old.remove()

  const published = currentPublishedRelease()
  const eligible = published ? eligibleDevices(published).length : 0
  const drafts = otaState.releases.filter((release) => release.status === 'draft').length
  const action = otaState.isAdmin
    ? '<button class="primary" id="otaNewRelease" type="button">+ Nova atualização</button>'
    : ''

  const html = `<section class="ota-publisher" id="otaPublisher">
    <div class="ota-publisher-head">
      <div><div class="eyebrow">DISTRIBUIÇÃO OTA · KODACLOUD</div><h2>Publicar atualização</h2><p>Envie um pacote do KODA OS, escreva o changelog público, confira a compatibilidade e publique para os KodaBots elegíveis.</p></div>
      ${action}
    </div>
    <div class="ota-summary">
      <article><span>Publicação atual</span><strong>${published ? `KODA OS ${escapeHtml(published.version)}` : 'Nenhuma'}</strong><small>${published ? escapeHtml(published.target_model) : 'Nenhum pacote publicado'}</small></article>
      <article><span>Receberão a atualização</span><strong>${eligible}</strong><small>KodaBots com versão anterior e modelo compatível</small></article>
      <article><span>Rascunhos</span><strong>${drafts}</strong><small>Pacotes enviados, ainda não distribuídos</small></article>
    </div>
    <div class="ota-flow-note"><strong>Como funciona</strong><span>Upload → changelog → validação SHA-256 → publicação → site Koda atualizado → KodaBot consulta o KodaCloud → download autenticado → confirmação após instalação.</span></div>
    <div class="ota-release-list">
      ${otaState.releases.length ? otaState.releases.map(releaseRow).join('') : '<div class="ota-empty"><strong>Nenhuma atualização enviada ainda.</strong><span>O primeiro pacote aparecerá aqui depois do upload.</span></div>'}
    </div>
  </section>`

  page.insertAdjacentHTML('beforeend', html)
  $('otaNewRelease')?.addEventListener('click', openUploadModal)
  page.querySelectorAll('[data-ota-publish]').forEach((button) => button.addEventListener('click', () => publishRelease(button.dataset.otaPublish)))
  page.querySelectorAll('[data-ota-pause]').forEach((button) => button.addEventListener('click', () => pauseRelease(button.dataset.otaPause)))
}

async function refreshPublisher() {
  await loadOtaData()
  renderPublisher()
}

function openUploadModal() {
  if (!otaState.isAdmin) return showNotice('Somente administradores podem publicar atualizações.', 'error')
  $('otaUploadModal')?.remove()

  const options = uniqueModels().map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join('')
  const modal = document.createElement('div')
  modal.id = 'otaUploadModal'
  modal.className = 'ota-modal'
  modal.innerHTML = `<div class="ota-dialog">
    <button class="ota-close" type="button" aria-label="Fechar">×</button>
    <div class="eyebrow">NOVA ATUALIZAÇÃO</div>
    <h3>Enviar pacote do KODA OS</h3>
    <p>O pacote fica privado até você clicar em <strong>Publicar</strong>. O changelog só aparece no site quando a versão for publicada.</p>
    <form id="otaUploadForm" class="ota-form">
      <div class="ota-form-grid">
        <label>Versão<input id="otaVersion" required placeholder="0.5.0" inputmode="decimal" /></label>
        <label>Modelo compatível<select id="otaModel" required>${options}</select></label>
      </div>
      <label>Notas internas da atualização<textarea id="otaNotes" rows="3" placeholder="Observações internas sobre a versão (opcional)."></textarea></label>
      <label>Changelog público
        <textarea id="otaChangelog" rows="6" required placeholder="- Correção de bugs e melhorias&#10;- Wi‑Fi mais estável&#10;- Melhorias no painel de tarefas"></textarea>
        <span class="ota-muted">Um item por linha. Você pode começar com -, • ou *; o site transforma em uma lista automaticamente.</span>
      </label>
      <label class="ota-file-label">Pacote da atualização<input id="otaFile" type="file" accept=".zip,application/zip,application/x-zip-compressed" required /><span>ZIP · máximo de 25 MB</span></label>
      <div class="ota-upload-status" id="otaUploadStatus"></div>
      <button class="primary ota-submit" id="otaUploadSubmit" type="submit">Enviar como rascunho</button>
    </form>
  </div>`
  document.body.appendChild(modal)
  modal.querySelector('.ota-close').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove() })
  $('otaUploadForm').addEventListener('submit', uploadRelease)
}

async function sha256File(file) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function uploadRelease(event) {
  event.preventDefault()
  const version = $('otaVersion').value.trim().replace(/^v/i, '')
  const targetModel = $('otaModel').value.trim()
  const notes = $('otaNotes').value.trim()
  const changelog = parseChangelogItems($('otaChangelog').value)
  const file = $('otaFile').files?.[0]
  const status = $('otaUploadStatus')
  const submit = $('otaUploadSubmit')

  if (!/^\d+(\.\d+){1,3}$/.test(version)) {
    status.textContent = 'Use uma versão numérica, por exemplo 0.5 ou 1.2.0.'
    return
  }
  if (!changelog.length) {
    status.textContent = 'Adicione pelo menos um item ao changelog público.'
    return
  }
  if (!file) {
    status.textContent = 'Selecione o arquivo ZIP da atualização.'
    return
  }
  if (!file.name.toLowerCase().endsWith('.zip')) {
    status.textContent = 'O pacote da atualização precisa ser um arquivo .zip.'
    return
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    status.textContent = 'O arquivo precisa ter entre 1 byte e 25 MB.'
    return
  }

  const matchingDevices = otaState.devices.filter((device) => normalizeModel(device.model) === normalizeModel(targetModel))
  const newestInstalled = matchingDevices.map((device) => device.kodaos_version).filter(Boolean).sort(compareVersions).at(-1)
  if (newestInstalled && compareVersions(version, newestInstalled) <= 0) {
    status.textContent = `A versão precisa ser maior que a versão instalada mais alta (${newestInstalled}).`
    return
  }

  submit.disabled = true
  try {
    status.textContent = 'Calculando SHA-256…'
    const sha256 = await sha256File(file)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${normalizeModel(targetModel)}/${version}/${Date.now()}-${safeName}`

    status.textContent = 'Enviando pacote para o KodaCloud…'
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'application/zip', upsert: false })
    if (uploadError) throw uploadError

    const { data: release, error: insertError } = await supabase
      .from('koda_os_releases')
      .insert({
        version,
        target_model: targetModel,
        channel: 'stable',
        release_notes: notes || null,
        changelog_items: changelog,
        storage_path: path,
        original_filename: file.name,
        sha256,
        file_size: file.size,
        status: 'draft',
        created_by: otaState.user.id
      })
      .select('id')
      .single()

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([path])
      throw insertError
    }

    await supabase.from('admin_audit_log').insert({
      actor_user_id: otaState.user.id,
      action: 'koda_os_release_uploaded',
      entity_type: 'koda_os_release',
      entity_id: release.id,
      details: { version, target_model: targetModel, file_size: file.size, sha256, changelog_items: changelog.length }
    })

    $('otaUploadModal')?.remove()
    await refreshPublisher()
    showNotice(`KODA OS ${version} enviado como rascunho com ${changelog.length} item${changelog.length === 1 ? '' : 's'} no changelog.`, 'success')
  } catch (error) {
    console.error('[Koda Admin OTA upload]', error)
    status.textContent = error?.message || 'Não foi possível enviar a atualização.'
    submit.disabled = false
  }
}

async function publishRelease(releaseId) {
  const release = otaState.releases.find((item) => item.id === releaseId)
  if (!release || !otaState.isAdmin) return
  const eligible = eligibleDevices(release)
  const changelogCount = Array.isArray(release.changelog_items) ? release.changelog_items.length : 0

  if (!changelogCount) {
    showNotice('Esta versão não possui changelog público. Envie novamente o pacote com pelo menos um item.', 'error')
    return
  }

  const message = eligible.length
    ? `Publicar KODA OS ${release.version} para ${eligible.length} KodaBot${eligible.length === 1 ? '' : 's'} elegível${eligible.length === 1 ? '' : 'is'} e liberar ${changelogCount} item${changelogCount === 1 ? '' : 's'} no site Koda?`
    : `Publicar KODA OS ${release.version} e liberar ${changelogCount} item${changelogCount === 1 ? '' : 's'} no site Koda? Nenhum KodaBot precisa desta versão neste momento.`
  if (!window.confirm(message)) return

  try {
    const now = new Date().toISOString()
    await supabase
      .from('koda_os_releases')
      .update({ status: 'archived', updated_at: now })
      .eq('target_model', release.target_model)
      .eq('channel', release.channel)
      .eq('status', 'published')
      .neq('id', release.id)

    const { error } = await supabase
      .from('koda_os_releases')
      .update({
        status: 'published',
        published_at: now,
        published_by: otaState.user.id,
        updated_at: now
      })
      .eq('id', release.id)
    if (error) throw error

    if (eligible.length) {
      const { error: deviceError } = await supabase
        .from('devices')
        .update({ latest_available_kodaos: release.version })
        .in('id', eligible.map((device) => device.id))
      if (deviceError) throw deviceError
    }

    await supabase.from('admin_audit_log').insert({
      actor_user_id: otaState.user.id,
      action: 'koda_os_release_published',
      entity_type: 'koda_os_release',
      entity_id: release.id,
      details: { version: release.version, target_model: release.target_model, eligible_devices: eligible.length, changelog_items: changelogCount }
    })

    await refreshPublisher()
    $('refreshData')?.click()
    showNotice(`KODA OS ${release.version} publicado. O changelog já está disponível no site Koda.`, 'success')
  } catch (error) {
    console.error('[Koda Admin OTA publish]', error)
    showNotice(error?.message || 'Não foi possível publicar a atualização.', 'error')
  }
}

async function pauseRelease(releaseId) {
  const release = otaState.releases.find((item) => item.id === releaseId)
  if (!release || !otaState.isAdmin) return
  if (!window.confirm(`Pausar a distribuição do KODA OS ${release.version}?`)) return

  try {
    const { error } = await supabase
      .from('koda_os_releases')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', release.id)
    if (error) throw error

    const matching = otaState.devices.filter((device) =>
      normalizeModel(device.model) === normalizeModel(release.target_model) &&
      device.latest_available_kodaos === release.version
    )
    if (matching.length) {
      await supabase.from('devices').update({ latest_available_kodaos: null }).in('id', matching.map((device) => device.id))
    }

    await supabase.from('admin_audit_log').insert({
      actor_user_id: otaState.user.id,
      action: 'koda_os_release_paused',
      entity_type: 'koda_os_release',
      entity_id: release.id,
      details: { version: release.version, target_model: release.target_model }
    })

    await refreshPublisher()
    $('refreshData')?.click()
    showNotice(`Distribuição do KODA OS ${release.version} pausada.`, 'success')
  } catch (error) {
    console.error('[Koda Admin OTA pause]', error)
    showNotice(error?.message || 'Não foi possível pausar a atualização.', 'error')
  }
}

function watchOsPage() {
  const page = $('page-os')
  if (!page) return

  const observer = new MutationObserver(() => {
    if (page.innerHTML.trim() && !$('otaPublisher')) {
      refreshPublisher()
    }
  })
  observer.observe(page, { childList: true })

  document.querySelectorAll('[data-page="os"]').forEach((button) => {
    button.addEventListener('click', () => setTimeout(refreshPublisher, 80))
  })

  $('refreshData')?.addEventListener('click', () => setTimeout(() => {
    if ($('page-os')?.classList.contains('active')) refreshPublisher()
  }, 180))

  if (location.hash === '#os') setTimeout(refreshPublisher, 250)
}

watchOsPage()
