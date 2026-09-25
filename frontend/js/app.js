const API = '../backend/api';
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');

// Alguns navegadores/instalações podem estar servindo uma versão antiga do index.html.
// Não deixamos uma mensagem ausente derrubar todo o fluxo da aplicação.
function getElement(id) {
  return document.getElementById(id);
}

function setLoginMessage(message = '') {
  const element = getElement('loginMessage');
  if (element) element.textContent = message;
}
let csrfToken = '';
let currentUser = null;
let usersPage = 1;
let usersTotalPages = 1;
let editingUserId = 0;
let editingRoleId = 0;
let editingModuleId = 0;
let mdiIconCatalog = [];
let iconPickerSelected = '';
let iconPickerOriginal = '';
let availableMenuItems = [];
let auditPage = 1;
let auditTotalPages = 1;
let editingSettingId = 0;
let messagingPollTimer = null;
let messagingCurrentUserId = 0;
let messagingCurrentUserName = '';
let messagingCurrentConversationUserId = 0;

async function loadDynamicMenu() {
  try {
    const result = await request(`${API}/menu.php?action=list`);
    availableMenuItems = result.data.items || [];
    renderDynamicMenu();
  } catch (error) {
    console.error('Menu dinâmico:', error);
  }
}

function renderDynamicMenu() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  addNavButton(sidebar, 'Início', 'homeView', 'home');

  const byParent = {};
  availableMenuItems.forEach(m => {
    const key = m.parent_id ? String(m.parent_id) : 'root';
    (byParent[key] ||= []).push(m);
  });
  Object.values(byParent).forEach(list => list.sort((a,b) => Number(a.sort_order)-Number(b.sort_order) || String(a.name).localeCompare(String(b.name), 'pt-BR')));

  function walk(parentKey, depth) {
    (byParent[parentKey] || []).forEach(m => {
      addNavButton(sidebar, m.menu_label || m.name, m.route, String(m.id), depth, m.icon, m.description || '');
      walk(String(m.id), depth + 1);
    });
  }
  walk('root', 0);
  setActiveNav(document.querySelector('.module-view:not(.hidden)')?.id || 'homeView');
}

function normalizeMdiIcon(icon) {
  const value = String(icon || '').trim();
  if (!value) return '';

  // Aceita tanto "mdi-wallet" quanto "mdi mdi-wallet".
  const classes = value.split(/\s+/).filter(Boolean);
  const iconClass = classes.find(c => c.startsWith('mdi-'));
  return iconClass && /^[a-z0-9_-]+$/i.test(iconClass) ? `mdi ${iconClass}` : '';
}

function addNavButton(sidebar, label, route, key, depth = 0, icon = '', title = '') {
  const btn = document.createElement('button');
  btn.className = 'nav-item';
  btn.dataset.route = route || '';
  btn.dataset.menuKey = key;
  btn.style.paddingLeft = `${12 + depth * 18}px`;
  if (title) btn.title = title;

  const mdiIcon = normalizeMdiIcon(icon);
  btn.innerHTML = `${mdiIcon ? `<span class="nav-icon ${mdiIcon}" aria-hidden="true"></span>` : ''}<span class="nav-label">${escapeHtml(label)}</span>`;
  btn.addEventListener('click', () => { navigateMenuItem(btn); closeMobileMenu(); });
  sidebar.appendChild(btn);
}

function setMobileMenu(open) {
  const body = document.getElementById('appBody');
  const toggle = document.getElementById('menuToggleBtn');
  if (!body || !toggle) return;
  body.classList.toggle('menu-open', !!open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
}

function closeMobileMenu() { setMobileMenu(false); }

function setActiveNav(viewId) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('.nav-item')).find(b => b.dataset.route === viewId);
  if (btn) btn.classList.add('active');
}

function navigateMenuItem(btn) {
  const route = btn.dataset.route || '';
  if (!route) return;
  const view = document.getElementById(route);
  if (view) {
    document.querySelectorAll('.module-view').forEach(v => v.classList.add('hidden'));
    view.classList.remove('hidden');
    setActiveNav(route);
    if (route === 'usersView') loadUsers();
    if (route === 'rolesView') loadRolesAdmin();
    if (route === 'modulesView') loadModulesAdmin();
    if (route === 'auditView') loadAudit();
    if (route === 'settingsView') loadSettings();
    if (route === 'companiesView') loadCompanies();
    if (route === 'productsView') loadProducts();
    return;
  }
  if (/^(https?:)?\//.test(route)) window.location.href = route;
  else window.location.href = route;
}



async function loadSettingsCategories() {
  try {
    const result = await request(`${API}/settings.php?action=categories`);
    const select = document.getElementById('settingsCategoryFilter');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Todas as categorias</option>' + (result.data.items || []).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    select.value = current;
  } catch (error) {
    setMessage('settingsMessage', error.message);
  }
}

function settingTypeLabel(type) {
  return ({string:'Texto', integer:'Inteiro', decimal:'Decimal', boolean:'Sim/Não', json:'JSON'})[type] || type;
}

function settingDisplayValue(setting) {
  if (setting.value === null || setting.value === undefined) return '—';
  if (setting.data_type === 'boolean') return setting.value ? 'Sim' : 'Não';
  if (setting.data_type === 'json') {
    try { return JSON.stringify(setting.value); } catch (_) { return String(setting.value); }
  }
  return String(setting.value);
}

async function loadSettings() {
  setMessage('settingsMessage', 'Carregando...');
  const search = document.getElementById('settingsSearch').value.trim();
  const category = document.getElementById('settingsCategoryFilter').value;
  const status = document.getElementById('settingsStatusFilter').value;
  try {
    const params = new URLSearchParams({ action:'list' });
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (status) params.set('status', status);
    const result = await request(`${API}/settings.php?${params.toString()}`);
    const items = result.data.items || [];
    const body = document.getElementById('settingsTableBody');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">Nenhuma configuração encontrada.</td></tr>';
    } else {
      body.innerHTML = items.map(s => `
        <tr>
          <td><strong>${escapeHtml(s.code)}</strong></td>
          <td>${escapeHtml(s.name)}${s.description ? `<div class="muted settings-description">${escapeHtml(s.description)}</div>` : ''}</td>
          <td>${escapeHtml(s.category)}</td>
          <td>${escapeHtml(settingTypeLabel(s.data_type))}</td>
          <td><code class="setting-value">${escapeHtml(settingDisplayValue(s))}</code></td>
          <td><span class="status ${s.status === 'active' ? 'active' : 'inactive'}">${s.status === 'active' ? 'Ativo' : 'Inativo'}</span></td>
          <td><div class="row-actions">${s.can_manage && s.is_editable && s.status === 'active' ? `<button class="secondary" data-edit-setting="${s.id}">Editar</button><button class="secondary" data-reset-setting="${s.id}">Restaurar</button>` : '—'}</div></td>
        </tr>`).join('');
    }
    setMessage('settingsMessage', '');
  } catch (error) { setMessage('settingsMessage', error.message); }
}

function renderSettingInput(setting) {
  const container = document.getElementById('settingEditor');
  const value = setting.value;
  if (setting.data_type === 'boolean') {
    container.innerHTML = `<label>Valor<select id="formSettingValue"><option value="true" ${value === true ? 'selected' : ''}>Sim</option><option value="false" ${value === false ? 'selected' : ''}>Não</option></select></label>`;
    return;
  }
  if (setting.data_type === 'json') {
    let text = '';
    try { text = JSON.stringify(value, null, 2); } catch (_) { text = String(value ?? ''); }
    container.innerHTML = `<label>Valor<textarea id="formSettingValue" rows="9" spellcheck="false">${escapeHtml(text)}</textarea></label>`;
    return;
  }
  const inputType = setting.data_type === 'integer' ? 'number' : (setting.data_type === 'decimal' ? 'number' : 'text');
  const step = setting.data_type === 'integer' ? '1' : (setting.data_type === 'decimal' ? 'any' : '');
  const safeValue = value === null || value === undefined ? '' : String(value);
  container.innerHTML = `<label>Valor<input id="formSettingValue" type="${inputType}" ${step ? `step="${step}"` : ''} value="${escapeHtml(safeValue)}"></label>`;
}

async function openEditSetting(id) {
  try {
    const result = await request(`${API}/settings.php?action=get&id=${id}`);
    const setting = result.data;
    editingSettingId = Number(setting.id);
    document.getElementById('settingModalTitle').textContent = `Editar configuração: ${setting.name}`;
    document.getElementById('settingCode').textContent = setting.code;
    document.getElementById('settingDescription').textContent = setting.description || '';
    document.getElementById('settingType').textContent = settingTypeLabel(setting.data_type);
    document.getElementById('settingDefault').textContent = settingDisplayValue({value:setting.default_value, data_type:setting.data_type});
    renderSettingInput(setting);
    setMessage('settingFormMessage', '');
    openModal('settingModal');
  } catch (error) { setMessage('settingsMessage', error.message); }
}

async function saveSetting(event) {
  event.preventDefault();
  setMessage('settingFormMessage', 'Salvando...');
  const setting = document.getElementById('formSettingValue');
  const type = document.getElementById('settingType').textContent;
  let value = setting.value;
  if (type === 'Inteiro') value = Number(value);
  if (type === 'Decimal') value = Number(value);
  if (type === 'Sim/Não') value = value === 'true';
  if (type === 'JSON') {
    try { value = JSON.parse(value); } catch (_) { setMessage('settingFormMessage', 'O valor informado não é um JSON válido.'); return; }
  }
  try {
    const result = await request(`${API}/settings.php?action=update&id=${editingSettingId}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({value})
    });
    closeModal('settingModal');
    setMessage('settingsMessage', result.message);
    await loadSettings();
  } catch (error) { setMessage('settingFormMessage', error.message); }
}

async function resetSetting(id) {
  if (!confirm('Restaurar esta configuração para o valor padrão?')) return;
  try {
    const result = await request(`${API}/settings.php?action=reset&id=${id}`, {method:'POST'});
    setMessage('settingsMessage', result.message);
    await loadSettings();
  } catch (error) { setMessage('settingsMessage', error.message); }
}

async function loadAuditFilters() {
  try {
    const result = await request(`${API}/audit.php?action=filters`);
    const data = result.data || {};
    const fill = (id, values, emptyLabel) => {
      const select = document.getElementById(id);
      if (!select) return;
      select.innerHTML = `<option value="">${emptyLabel}</option>` + (values || []).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    };
    fill('auditModuleFilter', data.modules, 'Todos os módulos');
    fill('auditActionFilter', data.actions, 'Todas as ações');
    fill('auditEntityFilter', data.entity_types, 'Todos os tipos');
  } catch (error) {
    setMessage('auditMessage', error.message);
  }
}

function auditJson(value) {
  if (value === null || value === undefined) return '';
  try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
}

async function loadAudit() {
  const params = new URLSearchParams({ page: String(auditPage), per_page: '25' });
  const search = document.getElementById('auditSearch').value.trim();
  const moduleCode = document.getElementById('auditModuleFilter').value;
  const auditAction = document.getElementById('auditActionFilter').value;
  const entityType = document.getElementById('auditEntityFilter').value;
  const dateFrom = document.getElementById('auditDateFrom').value;
  const dateTo = document.getElementById('auditDateTo').value;
  if (search) params.set('search', search);
  if (moduleCode) params.set('module_code', moduleCode);
  if (auditAction) params.set('audit_action', auditAction);
  if (entityType) params.set('entity_type', entityType);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  try {
    const result = await request(`${API}/audit.php?action=list&${params.toString()}`);
    const items = result.data.items || [];
    const pagination = result.data.pagination || {};
    auditTotalPages = Number(pagination.total_pages || 1);
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = items.length ? items.map(log => {
      const details = [
        log.old_data !== null ? `Antes:\n${auditJson(log.old_data)}` : '',
        log.new_data !== null ? `Depois:\n${auditJson(log.new_data)}` : ''
      ].filter(Boolean).join('\n\n');
      return `<tr>
        <td>${escapeHtml(formatDateTime(log.created_at))}</td>
        <td>${escapeHtml(log.display_name || log.username || 'Sistema')}</td>
        <td>${escapeHtml(log.module_code || '—')}</td>
        <td><span class="audit-action">${escapeHtml(log.action || '—')}</span></td>
        <td>${escapeHtml(log.entity_type || '—')}</td>
        <td>${escapeHtml(log.entity_id || '—')}</td>
        <td>${escapeHtml(log.ip_address || '—')}</td>
        <td>${details ? `<details><summary>Ver</summary><pre class="audit-details">${escapeHtml(details)}</pre></details>` : '—'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="muted">Nenhum registro encontrado.</td></tr>';
    document.getElementById('auditPageInfo').textContent = `Página ${Number(pagination.page || 1)} de ${auditTotalPages} — ${Number(pagination.total || 0)} registro(s)`;
    document.getElementById('auditPrevPage').disabled = auditPage <= 1;
    document.getElementById('auditNextPage').disabled = auditPage >= auditTotalPages;
    setMessage('auditMessage', '');
  } catch (error) {
    setMessage('auditMessage', error.message);
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR');
}

async function request(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = await response.json().catch(() => ({ success:false, message:'Resposta inválida do servidor.' }));
  if (!response.ok || !data.success) throw new Error(data.message || 'Erro na operação.');
  return data;
}

function showLogin(message = '') {
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
  setLoginMessage(message);
  currentUser = null;
}

function showApp(user) {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  currentUser = user;
  messagingCurrentUserId = Number(user.id || 0);
  messagingCurrentUserName = user.display_name || user.username || '';
  document.getElementById('topbarUser').textContent = messagingCurrentUserName;
  startMessagingPolling();
}

function setMessage(id, message = '') { document.getElementById(id).textContent = message; }

function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.getElementById(id).setAttribute('aria-hidden', 'false'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); document.getElementById(id).setAttribute('aria-hidden', 'true'); }

async function checkSession() {
  try {
    const result = await request(`${API}/auth.php?action=status`);
    if (result.data.authenticated) {
      csrfToken = result.data.csrf_token || '';
      showApp(result.data.user);
      await loadDynamicMenu();
      await loadAuditFilters();
      await loadSettingsCategories();
    } else showLogin();
  } catch (_) { showLogin('Não foi possível verificar a sessão.'); }
}

async function loadRoles(selected = []) {
  const list = document.getElementById('rolesList');
  list.innerHTML = '<span class="muted">Carregando perfis...</span>';
  try {
    const result = await request(`${API}/users.php?action=roles`);
    const roles = result.data.items || [];
    if (!roles.length) { list.innerHTML = '<span class="muted">Nenhum perfil ativo cadastrado.</span>'; return; }
    const selectedSet = new Set(selected.map(Number));
    list.innerHTML = roles.map(role => `
      <label class="role-option">
        <input type="checkbox" value="${role.id}" ${selectedSet.has(Number(role.id)) ? 'checked' : ''}>
        <span><strong>${escapeHtml(role.name)}</strong><small>${escapeHtml(role.code)}${role.description ? ' — ' + escapeHtml(role.description) : ''}</small></span>
      </label>`).join('');
  } catch (error) { list.innerHTML = `<span class="message">${escapeHtml(error.message)}</span>`; }
}


function permissionGroup(code) {
  const parts = String(code || '').split('.');
  return parts.length > 1 ? parts[0].toUpperCase() : 'SISTEMA';
}

function permissionLabel(code, name) {
  const action = String(code || '').split('.').slice(1).join('.');
  const labels = {view:'Visualizar', create:'Criar', edit:'Editar', delete:'Excluir', manage:'Gerenciar', access:'Acessar'};
  return labels[action] || name || code;
}

async function loadPermissions(selected = []) {
  const list = document.getElementById('permissionsList');
  list.innerHTML = '<span class="muted">Carregando permissões...</span>';
  try {
    const result = await request(`${API}/roles.php?action=permissions`);
    const permissions = result.data.items || [];
    const selectedSet = new Set(selected.map(Number));
    const groups = {};
    permissions.forEach(p => { const group = permissionGroup(p.code); (groups[group] ||= []).push(p); });
    if (!permissions.length) { list.innerHTML = '<span class="muted">Nenhuma permissão cadastrada.</span>'; return; }
    list.innerHTML = Object.entries(groups).map(([group, items]) => `
      <div class="permission-group">
        <div class="permission-group-title">${escapeHtml(group)}</div>
        <div class="permission-items">${items.map(p => `
          <label class="permission-option"><input type="checkbox" value="${p.id}" ${selectedSet.has(Number(p.id)) ? 'checked' : ''}><span><strong>${escapeHtml(permissionLabel(p.code, p.name))}</strong><small>${escapeHtml(p.code)}</small></span></label>`).join('')}
        </div>
      </div>`).join('');
  } catch (error) { list.innerHTML = `<span class="message">${escapeHtml(error.message)}</span>`; }
}

async function loadRolesAdmin() {
  setMessage('rolesMessage', 'Carregando...');
  const search = document.getElementById('roleSearch').value.trim();
  const status = document.getElementById('roleStatusFilter').value;
  try {
    const params = new URLSearchParams({action:'list'});
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    const result = await request(`${API}/roles.php?${params.toString()}`);
    const items = result.data.items || [];
    const body = document.getElementById('rolesTableBody');
    if (!items.length) { body.innerHTML = '<tr><td colspan="7" class="muted">Nenhum perfil encontrado.</td></tr>'; }
    else body.innerHTML = items.map(role => `
      <tr><td><strong>${escapeHtml(role.code)}</strong></td><td>${escapeHtml(role.name)}</td><td>${escapeHtml(role.description || '—')}</td><td>${Number(role.user_count || 0)}</td><td>${Number(role.permission_count || 0)}</td><td><span class="status ${role.status === 'active' ? 'active' : 'inactive'}">${role.status === 'active' ? 'Ativo' : 'Inativo'}</span></td><td><div class="row-actions"><button class="secondary" data-edit-role="${role.id}">Editar</button>${role.code !== 'ROOT' && role.status === 'active' ? `<button class="secondary" data-inactivate-role="${role.id}">Inativar</button>` : ''}</div></td></tr>`).join('');
    setMessage('rolesMessage', '');
  } catch (error) { setMessage('rolesMessage', error.message); }
}

async function openNewRole() {
  editingRoleId = 0;
  document.getElementById('roleModalTitle').textContent = 'Novo perfil';
  document.getElementById('roleForm').reset();
  document.getElementById('formRoleStatus').value = 'active';
  document.getElementById('formRoleCode').disabled = false;
  setMessage('roleFormMessage', '');
  await loadPermissions([]);
  openModal('roleModal');
}

async function openEditRole(id) {
  try {
    const result = await request(`${API}/roles.php?action=get&id=${id}`);
    const role = result.data;
    editingRoleId = Number(role.id);
    document.getElementById('roleModalTitle').textContent = 'Editar perfil';
    document.getElementById('roleId').value = role.id;
    document.getElementById('formRoleCode').value = role.code;
    document.getElementById('formRoleCode').disabled = role.code === 'ROOT';
    document.getElementById('formRoleName').value = role.name;
    document.getElementById('formRoleDescription').value = role.description || '';
    document.getElementById('formRoleStatus').value = role.status;
    setMessage('roleFormMessage', '');
    await loadPermissions(role.permission_ids || []);
    openModal('roleModal');
  } catch (error) { setMessage('rolesMessage', error.message); }
}

async function saveRole(event) {
  event.preventDefault();
  setMessage('roleFormMessage', 'Salvando...');
  const permissionIds = [...document.querySelectorAll('#permissionsList input[type="checkbox"]:checked')].map(i => Number(i.value));
  const payload = {
    code: document.getElementById('formRoleCode').value.trim(),
    name: document.getElementById('formRoleName').value.trim(),
    description: document.getElementById('formRoleDescription').value.trim(),
    status: document.getElementById('formRoleStatus').value,
    permission_ids: permissionIds
  };
  if (editingRoleId) payload.id = editingRoleId;
  try {
    const result = await request(`${API}/roles.php?action=${editingRoleId ? 'update' : 'create'}`, {method:editingRoleId ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    closeModal('roleModal');
    setMessage('rolesMessage', result.message);
    await loadRolesAdmin();
  } catch (error) { setMessage('roleFormMessage', error.message); }
}

async function inactivateRole(id) {
  if (!confirm('Inativar este perfil? Usuários associados perderão o acesso concedido por ele.')) return;
  try {
    const result = await request(`${API}/roles.php?action=delete`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})});
    setMessage('rolesMessage', result.message);
    await loadRolesAdmin();
  } catch (error) { setMessage('rolesMessage', error.message); }
}

async function loadModulePermissions(selected = []) {
  const list = document.getElementById('modulePermissionsList');
  list.innerHTML = '<span class="muted">Carregando permissões...</span>';
  try {
    const result = await request(`${API}/roles.php?action=permissions`);
    const permissions = result.data.items || [];
    const selectedSet = new Set(selected.map(Number));
    const groups = {};
    permissions.forEach(p => { const group = permissionGroup(p.code); (groups[group] ||= []).push(p); });
    list.innerHTML = Object.entries(groups).map(([group, items]) => `
      <div class="permission-group"><div class="permission-group-title">${escapeHtml(group)}</div>
      <div class="permission-items">${items.map(p => `<label class="permission-option"><input type="checkbox" value="${p.id}" ${selectedSet.has(Number(p.id)) ? 'checked' : ''}><span><strong>${escapeHtml(permissionLabel(p.code, p.name))}</strong><small>${escapeHtml(p.code)}</small></span></label>`).join('')}</div></div>`).join('');
    if (!permissions.length) list.innerHTML = '<span class="muted">Nenhuma permissão cadastrada.</span>';
  } catch (error) { list.innerHTML = `<span class="message">${escapeHtml(error.message)}</span>`; }
}

async function loadModuleParents(selectedId = 0) {
  const select = document.getElementById('formModuleParent');
  select.innerHTML = '<option value="">— Nenhum —</option>';
  try {
    const params = new URLSearchParams({ action:'parents' });
    if (selectedId) params.set('exclude_id', String(selectedId));
    const result = await request(`${API}/modules.php?${params.toString()}`);
    const items = result.data.items || [];
    select.innerHTML = '<option value="">— Nenhum —</option>' + items.map(m =>
      `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.code)})${m.status === 'inactive' ? ' — Inativo' : ''}</option>`
    ).join('');
  } catch (error) {
    select.innerHTML = '<option value="">Não foi possível carregar</option>';
    throw error;
  }
}

function moduleRows(items) {
  const byParent = {};
  items.forEach(m => { const key = m.parent_id ? String(m.parent_id) : 'root'; (byParent[key] ||= []).push(m); });
  Object.values(byParent).forEach(list => list.sort((a,b) => Number(a.sort_order) - Number(b.sort_order) || String(a.name).localeCompare(String(b.name), 'pt-BR')));
  const result = [];
  function walk(parentKey, depth) {
    (byParent[parentKey] || []).forEach(m => {
      result.push({ module:m, depth });
      walk(String(m.id), depth + 1);
    });
  }
  walk('root', 0);
  // Keep orphaned records visible if an old database contains a broken parent reference.
  const known = new Set(result.map(r => Number(r.module.id)));
  items.filter(m => !known.has(Number(m.id))).forEach(m => result.push({module:m, depth:0}));
  return result;
}

async function loadModulesAdmin() {
  setMessage('modulesMessage', 'Carregando...');
  const search = document.getElementById('moduleSearch').value.trim();
  const status = document.getElementById('moduleStatusFilter').value;
  try {
    const params = new URLSearchParams({ action:'list' });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    const result = await request(`${API}/modules.php?${params.toString()}`);
    const items = result.data.items || [];
    const body = document.getElementById('modulesTableBody');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="9" class="muted">Nenhum módulo encontrado.</td></tr>';
    } else {
      body.innerHTML = moduleRows(items).map(({module:m, depth}) => `
        <tr>
          <td>${Number(m.sort_order)}</td>
          <td><strong>${escapeHtml(m.code)}</strong></td>
          <td><span style="display:inline-block;padding-left:${depth * 20}px">${depth ? '↳ ' : ''}${escapeHtml(m.name)}</span></td>
          <td>${escapeHtml(m.menu_label || m.name)}</td>
          <td>${escapeHtml(m.parent_name || '—')}</td>
          <td>${escapeHtml(m.icon || '—')}</td>
          <td>${escapeHtml(m.route || '—')}</td>
          <td><span class="status ${m.status === 'active' ? 'active' : 'inactive'}">${m.status === 'active' ? 'Ativo' : 'Inativo'}</span></td>
          <td><div class="row-actions"><button class="secondary" data-edit-module="${m.id}">Editar</button>${m.status === 'active' ? `<button class="secondary" data-inactivate-module="${m.id}">Inativar</button>` : ''}</div></td>
        </tr>`).join('');
    }
    setMessage('modulesMessage', '');
  } catch (error) { setMessage('modulesMessage', error.message); }
}

async function openNewModule() {
  editingModuleId = 0;
  document.getElementById('moduleModalTitle').textContent = 'Novo módulo';
  document.getElementById('moduleForm').reset();
  setModuleIconPreview('');
  document.getElementById('formModuleStatus').value = 'active';
  document.getElementById('formModuleSort').value = '0';
  setMessage('moduleFormMessage', '');
  try { await loadModuleParents(); await loadModulePermissions(); openModal('moduleModal'); }
  catch (error) { setMessage('modulesMessage', error.message); }
}

async function openEditModule(id) {
  try {
    const result = await request(`${API}/modules.php?action=get&id=${id}`);
    const module = result.data;
    editingModuleId = Number(module.id);
    document.getElementById('moduleModalTitle').textContent = 'Editar módulo';
    document.getElementById('moduleId').value = module.id;
    document.getElementById('formModuleCode').value = module.code;
    document.getElementById('formModuleName').value = module.name;
    document.getElementById('formModuleMenuLabel').value = module.menu_label || '';
    document.getElementById('formModuleDescription').value = module.description || '';
    document.getElementById('formModuleIcon').value = module.icon || '';
    setModuleIconPreview(module.icon || '');
    document.getElementById('formModuleRoute').value = module.route || '';
    document.getElementById('formModuleSort').value = module.sort_order;
    document.getElementById('formModuleStatus').value = module.status;
    await loadModuleParents(editingModuleId);
    await loadModulePermissions(module.permission_ids || []);
    document.getElementById('formModuleParent').value = module.parent_id ? String(module.parent_id) : '';
    setMessage('moduleFormMessage', '');
    openModal('moduleModal');
  } catch (error) { setMessage('modulesMessage', error.message); }
}

function canonicalMdiIcon(icon) {
  const value = String(icon || '').trim();
  if (!value) return '';
  const classes = value.split(/\s+/).filter(Boolean);
  const iconClass = classes.find(c => c.startsWith('mdi-'));
  return iconClass && /^[a-z0-9_-]+$/i.test(iconClass) ? iconClass : '';
}

function iconLabel(icon) {
  const canonical = canonicalMdiIcon(icon);
  return canonical ? canonical.replace(/^mdi-/, '') : '';
}

function setModuleIconPreview(icon) {
  const preview = document.getElementById('formModuleIconPreview');
  if (!preview) return;
  const canonical = canonicalMdiIcon(icon);
  preview.className = `icon-picker-preview${canonical ? ` mdi ${canonical}` : ''}`;
  preview.textContent = canonical ? '' : '◇';
  preview.title = canonical ? canonical : 'Nenhum ícone selecionado';
}

function setIconPickerSelected(icon) {
  iconPickerSelected = canonicalMdiIcon(icon);
  const preview = document.getElementById('iconPickerSelectedPreview');
  const name = document.getElementById('iconPickerSelectedName');
  const confirm = document.getElementById('confirmIconPickerBtn');
  if (preview) preview.className = `icon-picker-selected-preview${iconPickerSelected ? ` mdi ${iconPickerSelected}` : ''}`;
  if (name) name.textContent = iconPickerSelected || 'Nenhum';
  if (confirm) confirm.disabled = !iconPickerSelected;
}

function renderIconPicker() {
  const grid = document.getElementById('iconPickerGrid');
  const searchInput = document.getElementById('iconPickerSearch');
  const count = document.getElementById('iconPickerCount');
  const message = document.getElementById('iconPickerMessage');
  if (!grid || !searchInput || !count) return;

  const term = searchInput.value.trim().toLowerCase();
  const filtered = mdiIconCatalog.filter(icon => icon.toLowerCase().includes(term));
  const maxVisible = 240;
  const visible = filtered.slice(0, maxVisible);
  count.textContent = filtered.length > maxVisible
    ? `${filtered.length} encontrados · mostrando ${maxVisible}`
    : `${filtered.length} encontrado${filtered.length === 1 ? '' : 's'}`;

  if (!mdiIconCatalog.length) {
    grid.innerHTML = '';
    if (message) message.textContent = 'Não foi possível carregar o catálogo de ícones.';
    return;
  }
  if (!filtered.length) {
    grid.innerHTML = '';
    if (message) message.textContent = 'Nenhum ícone encontrado.';
    return;
  }
  if (message) message.textContent = '';

  grid.innerHTML = visible.map(icon => {
    const canonical = canonicalMdiIcon(icon);
    if (!canonical) return '';
    const selected = canonical === iconPickerSelected ? ' selected' : '';
    return `<button type="button" class="icon-picker-item${selected}" data-icon-value="${escapeHtml(canonical)}" role="option" aria-selected="${selected ? 'true' : 'false'}" title="${escapeHtml(canonical)}">
      <span class="mdi ${escapeHtml(canonical)}" aria-hidden="true"></span>
      <span>${escapeHtml(iconLabel(canonical))}</span>
    </button>`;
  }).join('');
}

async function loadMdiIconCatalog() {
  if (mdiIconCatalog.length) return mdiIconCatalog;
  const response = await fetch('assets/mdi/icons.json', { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Não foi possível carregar o catálogo de ícones (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('O catálogo de ícones possui formato inválido.');
  mdiIconCatalog = [...new Set(data.map(canonicalMdiIcon).filter(Boolean))];
  return mdiIconCatalog;
}

async function openIconPicker() {
  const current = document.getElementById('formModuleIcon')?.value || '';
  iconPickerOriginal = canonicalMdiIcon(current);
  setIconPickerSelected(iconPickerOriginal);
  const search = document.getElementById('iconPickerSearch');
  if (search) search.value = '';
  const message = document.getElementById('iconPickerMessage');
  if (message) message.textContent = 'Carregando ícones...';
  openModal('iconPickerModal');
  try {
    await loadMdiIconCatalog();
    renderIconPicker();
    search?.focus();
  } catch (error) {
    if (message) message.textContent = error.message;
  }
}

function closeIconPicker() {
  closeModal('iconPickerModal');
  iconPickerSelected = iconPickerOriginal;
}

function confirmIconPicker() {
  const input = document.getElementById('formModuleIcon');
  if (!input || !iconPickerSelected) return;
  input.value = iconPickerSelected;
  setModuleIconPreview(iconPickerSelected);
  closeModal('iconPickerModal');
}

async function saveModule(event) {
  event.preventDefault();
  setMessage('moduleFormMessage', 'Salvando...');
  const payload = {
    code: document.getElementById('formModuleCode').value.trim(),
    name: document.getElementById('formModuleName').value.trim(),
    menu_label: document.getElementById('formModuleMenuLabel').value.trim(),
    description: document.getElementById('formModuleDescription').value.trim(),
    icon: document.getElementById('formModuleIcon').value.trim(),
    route: document.getElementById('formModuleRoute').value.trim(),
    parent_id: document.getElementById('formModuleParent').value ? Number(document.getElementById('formModuleParent').value) : null,
    sort_order: Number(document.getElementById('formModuleSort').value || 0),
    status: document.getElementById('formModuleStatus').value,
    permission_ids: Array.from(document.querySelectorAll('#modulePermissionsList input[type="checkbox"]:checked')).map(input => Number(input.value))
  };
  if (editingModuleId) payload.id = editingModuleId;
  try {
    const result = await request(`${API}/modules.php?action=${editingModuleId ? 'update' : 'create'}`, {
      method: editingModuleId ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
    closeModal('moduleModal');
    setMessage('modulesMessage', result.message);
    await loadModulesAdmin();
  } catch (error) { setMessage('moduleFormMessage', error.message); }
}

async function inactivateModule(id) {
  if (!confirm('Inativar este módulo? Ele deixará de ser considerado ativo para a navegação do sistema.')) return;
  try {
    const result = await request(`${API}/modules.php?action=delete`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})});
    setMessage('modulesMessage', result.message);
    await loadModulesAdmin();
  } catch (error) { setMessage('modulesMessage', error.message); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('pt-BR');
}

function roleNames(user) { return (user.roles || []).map(r => escapeHtml(r.name)).join(', ') || '—'; }

async function loadUsers() {
  setMessage('usersMessage', 'Carregando...');
  const search = document.getElementById('userSearch').value.trim();
  const status = document.getElementById('userStatusFilter').value;
  try {
    const params = new URLSearchParams({ action:'list', page:String(usersPage), per_page:'20' });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    const result = await request(`${API}/users.php?${params.toString()}`);
    const data = result.data;
    usersTotalPages = data.pagination.pages;
    document.getElementById('pageInfo').textContent = `Página ${data.pagination.page} de ${usersTotalPages} — ${data.pagination.total} usuário(s)`;
    document.getElementById('prevPage').disabled = usersPage <= 1;
    document.getElementById('nextPage').disabled = usersPage >= usersTotalPages;
    const body = document.getElementById('usersTableBody');
    if (!data.items.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">Nenhum usuário encontrado.</td></tr>';
    } else {
      body.innerHTML = data.items.map(user => `
        <tr>
          <td><strong>${escapeHtml(user.username)}</strong></td>
          <td>${escapeHtml(user.display_name)}</td>
          <td>${escapeHtml(user.email || '—')}</td>
          <td>${roleNames(user)}</td>
          <td><span class="status ${user.status}">${statusLabel(user.status)}</span></td>
          <td>${formatDate(user.last_login_at)}</td>
          <td><div class="row-actions">
            <button class="secondary" data-edit-user="${user.id}">Editar</button>
            <button class="secondary" data-reset-user="${user.id}" data-user-name="${escapeHtml(user.display_name)}">Senha</button>
            ${user.id !== currentUser?.id && user.status !== 'inactive' ? `<button class="secondary" data-inactivate-user="${user.id}">Inativar</button>` : ''}
          </div></td>
        </tr>`).join('');
    }
    setMessage('usersMessage', '');
  } catch (error) { setMessage('usersMessage', error.message); }
}

function statusLabel(status) { return ({active:'Ativo', blocked:'Bloqueado', inactive:'Inativo'})[status] || status; }

async function openNewUser() {
  editingUserId = 0;
  document.getElementById('modalTitle').textContent = 'Novo usuário';
  document.getElementById('userForm').reset();
  document.getElementById('formStatus').value = 'active';
  document.getElementById('formUsername').disabled = false;
  document.getElementById('formPassword').required = true;
  document.getElementById('passwordField').classList.remove('hidden');
  setMessage('formMessage', '');
  await loadRoles([]);
  openModal('userModal');
}

async function openEditUser(id) {
  try {
    const result = await request(`${API}/users.php?action=get&id=${id}`);
    const user = result.data;
    editingUserId = Number(user.id);
    document.getElementById('modalTitle').textContent = 'Editar usuário';
    document.getElementById('userId').value = user.id;
    document.getElementById('formUsername').value = user.username;
    document.getElementById('formDisplayName').value = user.display_name;
    document.getElementById('formEmail').value = user.email || '';
    document.getElementById('formStatus').value = user.status;
    document.getElementById('formUsername').disabled = false;
    document.getElementById('formPassword').required = false;
    document.getElementById('passwordField').classList.add('hidden');
    setMessage('formMessage', '');
    await loadRoles(user.role_ids || []);
    openModal('userModal');
  } catch (error) { setMessage('usersMessage', error.message); }
}

async function saveUser(event) {
  event.preventDefault();
  setMessage('formMessage', 'Salvando...');
  const roleIds = [...document.querySelectorAll('#rolesList input[type="checkbox"]:checked')].map(i => Number(i.value));
  const payload = {
    username: document.getElementById('formUsername').value.trim(),
    display_name: document.getElementById('formDisplayName').value.trim(),
    email: document.getElementById('formEmail').value.trim(),
    status: document.getElementById('formStatus').value,
    role_ids: roleIds
  };
  if (!editingUserId) payload.password = document.getElementById('formPassword').value;
  if (editingUserId) payload.id = editingUserId;
  try {
    const result = await request(`${API}/users.php?action=${editingUserId ? 'update' : 'create'}`, {
      method: editingUserId ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    closeModal('userModal');
    setMessage('usersMessage', result.message);
    await loadUsers();
  } catch (error) { setMessage('formMessage', error.message); }
}

function openPasswordModal(id, name) {
  document.getElementById('passwordUserId').value = id;
  document.getElementById('passwordUserName').textContent = `Usuário: ${name}`;
  document.getElementById('resetPassword').value = '';
  setMessage('passwordMessage', '');
  openModal('passwordModal');
}

async function resetPassword(event) {
  event.preventDefault();
  setMessage('passwordMessage', 'Redefinindo...');
  try {
    const result = await request(`${API}/users.php?action=reset-password`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id:Number(document.getElementById('passwordUserId').value), password:document.getElementById('resetPassword').value })
    });
    closeModal('passwordModal');
    setMessage('usersMessage', result.message);
    await loadUsers();
  } catch (error) { setMessage('passwordMessage', error.message); }
}

async function inactivateUser(id) {
  if (!confirm('Inativar este usuário? Ele não poderá mais entrar no sistema.')) return;
  try {
    const result = await request(`${API}/users.php?action=delete`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
    setMessage('usersMessage', result.message);
    await loadUsers();
  } catch (error) { setMessage('usersMessage', error.message); }
}


async function refreshUnreadMessages() {
  if (!currentUser) return;
  try {
    const result = await request(`${API}/messages.php?action=unread-count`);
    const count = Number(result.data.unread_count || 0);
    const badge = document.getElementById('messagesBadge');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('hidden', count <= 0);
    badge.setAttribute('aria-label', `${count} mensagem${count === 1 ? '' : 'ns'} não lida${count === 1 ? '' : 's'}`);
  } catch (error) {
    console.debug('Mensagens: não foi possível atualizar o contador.', error);
  }
}

function startMessagingPolling() {
  if (messagingPollTimer) clearInterval(messagingPollTimer);
  refreshUnreadMessages();
  messagingPollTimer = setInterval(() => {
    refreshUnreadMessages();
    if (!document.getElementById('messagesModal')?.classList.contains('hidden') && messagingCurrentConversationUserId) {
      loadMessageConversation(messagingCurrentConversationUserId, true);
    }
  }, 15000);
}

function stopMessagingPolling() {
  if (messagingPollTimer) clearInterval(messagingPollTimer);
  messagingPollTimer = null;
}

function renderConversationList(items) {
  const list = document.getElementById('messagesConversationList');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="messages-list-empty">Nenhuma conversa ainda.</div>';
    return;
  }
  list.innerHTML = items.map(item => {
    const active = Number(item.user_id) === messagingCurrentConversationUserId ? ' active' : '';
    const unread = Number(item.unread_count || 0);
    return `<button type="button" class="message-conversation-item${active}" data-message-user="${Number(item.user_id)}">
      <span class="message-avatar"><span class="mdi mdi-account-outline" aria-hidden="true"></span></span>
      <span class="message-conversation-main">
        <strong>${escapeHtml(item.display_name || item.username)}</strong>
        <small>${escapeHtml(item.last_body || '')}</small>
      </span>
      <span class="message-conversation-meta">
        <small>${escapeHtml(formatMessageDate(item.last_created_at))}</small>
        ${unread ? `<b class="conversation-unread">${unread > 99 ? '99+' : unread}</b>` : ''}
      </span>
    </button>`;
  }).join('');
}

function formatMessageDate(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
}

async function loadMessageConversations(selectUserId = 0) {
  try {
    const result = await request(`${API}/messages.php?action=conversations`);
    const items = result.data.items || [];
    renderConversationList(items);
    if (selectUserId) {
      const found = items.some(item => Number(item.user_id) === Number(selectUserId));
      if (found) await loadMessageConversation(Number(selectUserId));
    }
  } catch (error) {
    const list = document.getElementById('messagesConversationList');
    if (list) list.innerHTML = `<div class="message">${escapeHtml(error.message)}</div>`;
  }
}

function showMessagesPane(name) {
  ['messagesEmptyState','messagesConversationView','messagesNewView'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById(name)?.classList.remove('hidden');
}

function renderMessages(items) {
  const list = document.getElementById('messagesList');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="messages-list-empty">Nenhuma mensagem nesta conversa.</div>';
    return;
  }
  list.innerHTML = items.map(item => {
    const mine = Number(item.sender_id) === messagingCurrentUserId;
    return `<div class="message-bubble-row ${mine ? 'mine' : 'theirs'}">
      <div class="message-bubble">
        <div class="message-bubble-text">${escapeHtml(item.body).replace(/\n/g, '<br>')}</div>
        <div class="message-bubble-time">${escapeHtml(formatMessageDate(item.created_at))}${mine && item.read_at ? ' · Lida' : ''}</div>
      </div>
    </div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
}

async function loadMessageConversation(userId, silent = false) {
  messagingCurrentConversationUserId = Number(userId);
  try {
    const result = await request(`${API}/messages.php?action=conversation&user_id=${encodeURIComponent(userId)}`);
    const data = result.data || {};
    document.getElementById('messagesChatName').textContent = data.user?.display_name || data.user?.username || 'Usuário';
    document.getElementById('messagesChatUsername').textContent = data.user?.username ? `@${data.user.username}` : '';
    document.getElementById('messagesChatStatus').textContent = data.user?.status === 'active' ? 'Ativo' : 'Inativo';
    document.getElementById('messagesChatStatus').className = `status ${data.user?.status === 'active' ? 'active' : 'inactive'}`;
    renderMessages(data.messages || []);
    showMessagesPane('messagesConversationView');
    document.getElementById('messageBody').focus();
    await request(`${API}/messages.php?action=mark-read&user_id=${encodeURIComponent(userId)}`, {method:'POST'});
    await refreshUnreadMessages();
    if (!silent) await loadMessageConversations(userId);
  } catch (error) {
    if (!silent) setMessage('messageSendMessage', error.message);
  }
}

async function loadMessageRecipients() {
  const select = document.getElementById('messageRecipient');
  if (!select) return;
  select.innerHTML = '<option value="">Carregando usuários...</option>';
  try {
    const result = await request(`${API}/messages.php?action=users`);
    const items = result.data.items || [];
    select.innerHTML = '<option value="">Selecione um usuário...</option>' + items.map(user => `<option value="${Number(user.id)}">${escapeHtml(user.display_name)} (@${escapeHtml(user.username)})</option>`).join('');
    if (!items.length) select.innerHTML = '<option value="">Nenhum outro usuário ativo</option>';
  } catch (error) {
    select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`;
  }
}

async function openMessagesModal() {
  openModal('messagesModal');
  messagingCurrentConversationUserId = 0;
  showMessagesPane('messagesEmptyState');
  setMessage('messageSendMessage', '');
  setMessage('newMessageMessage', '');
  await loadMessageConversations();
  await refreshUnreadMessages();
}

function closeMessagesModal() {
  closeModal('messagesModal');
  messagingCurrentConversationUserId = 0;
}

async function openNewMessageComposer() {
  showMessagesPane('messagesNewView');
  document.getElementById('newMessageBody').value = '';
  setMessage('newMessageMessage', '');
  await loadMessageRecipients();
  document.getElementById('messageRecipient').focus();
}

async function sendMessageToRecipient() {
  const recipientId = Number(document.getElementById('messageRecipient').value || 0);
  const body = document.getElementById('newMessageBody').value.trim();
  if (!recipientId) { setMessage('newMessageMessage', 'Selecione um destinatário.'); return; }
  if (!body) { setMessage('newMessageMessage', 'Digite uma mensagem.'); return; }
  setMessage('newMessageMessage', 'Enviando...');
  try {
    await request(`${API}/messages.php?action=send`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({recipient_id:recipientId, body})});
    document.getElementById('newMessageBody').value = '';
    setMessage('newMessageMessage', 'Mensagem enviada.');
    await loadMessageConversations(recipientId);
    await refreshUnreadMessages();
  } catch (error) { setMessage('newMessageMessage', error.message); }
}

async function sendCurrentMessage(event) {
  event.preventDefault();
  if (!messagingCurrentConversationUserId) return;
  const textarea = document.getElementById('messageBody');
  const body = textarea.value.trim();
  if (!body) return;
  setMessage('messageSendMessage', 'Enviando...');
  try {
    await request(`${API}/messages.php?action=send`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({recipient_id:messagingCurrentConversationUserId, body})});
    textarea.value = '';
    setMessage('messageSendMessage', '');
    await loadMessageConversation(messagingCurrentConversationUserId);
  } catch (error) { setMessage('messageSendMessage', error.message); }
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); setLoginMessage('Entrando...');
  try {
    const result = await request(`${API}/auth.php?action=login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:document.getElementById('username').value.trim(), password:document.getElementById('password').value}) });
    csrfToken = result.data.csrf_token || ''; showApp(result.data.user); await loadDynamicMenu(); await loadAuditFilters(); await loadSettingsCategories(); event.target.reset();
  } catch (error) { showLogin(error.message); }
});

document.getElementById('menuToggleBtn').addEventListener('click', () => {
  const body = document.getElementById('appBody');
  setMobileMenu(!body?.classList.contains('menu-open'));
});
document.getElementById('menuBackdrop').addEventListener('click', closeMobileMenu);

/* =========================
   Cadastros: Empresas
   ========================= */
let companiesPage = 1, companiesTotalPages = 1, editingCompanyId = 0;
let productsPage = 1, productsTotalPages = 1, editingProductId = 0;

function companyTypeLabel(type) {
  return ({CLI:'Cliente', FOR:'Fornecedor'})[type] || type || '—';
}

function formatCrudNumber(value) {
  if (value === null || value === undefined || value === '') return '0';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', {maximumFractionDigits: 4}) : String(value);
}

async function loadCompanies() {
  setMessage('companiesMessage','Carregando...');
  const params = new URLSearchParams({action:'list', page:String(companiesPage), per_page:'20'});
  const field = document.getElementById('companySearchField').value;
  const search = document.getElementById('companySearch').value.trim();
  const status = 'active';
  params.set('field', field); if (search) params.set('search', search); params.set('status', status);
  try {
    const result = await request(`${API}/companies.php?${params}`);
    const data = result.data || {};
    const items = data.items || [];
    companiesTotalPages = Number(data.total_pages || 1);
    const body = document.getElementById('companiesTableBody');
    body.innerHTML = items.length ? items.map(c => `
      <tr>
        <td>${escapeHtml(c.id)}</td>
        <td><strong>${escapeHtml(c.razao_social)}</strong></td>
        <td>${escapeHtml(c.fantasia || '—')}</td>
        <td>${escapeHtml(c.cnpj || '—')}</td>
        <td>${escapeHtml(companyTypeLabel(c.tipo))}</td>
        <td>${escapeHtml(c.ramo || '—')}</td>
        <td><span class="status ${c.status === 'active' ? 'active' : 'inactive'}">${c.status === 'active' ? 'Ativa' : 'Inativa'}</span></td>
        <td><div class="row-actions"><button class="secondary" data-edit-company="${c.id}">Editar</button><button class="secondary" data-inactivate-company="${c.id}">Inativar</button></div></td>
      </tr>`).join('') : '<tr><td colspan="8" class="muted">Nenhuma empresa encontrada.</td></tr>';
    document.getElementById('companiesPageInfo').textContent = `Página ${companiesPage} de ${companiesTotalPages}`;
    document.getElementById('companiesPrev').disabled = companiesPage <= 1;
    document.getElementById('companiesNext').disabled = companiesPage >= companiesTotalPages;
    setMessage('companiesMessage','');
  } catch (e) { setMessage('companiesMessage',e.message); }
}

function clearCompanyForm() {
  document.getElementById('companyForm').reset();
  document.getElementById('companyId').value = '';
  document.getElementById('formCompanyType').value = 'CLI';
  document.getElementById('formCompanyStatus').value = 'active';
  setMessage('companyFormMessage','');
}

function fillCompanyForm(c) {
  document.getElementById('companyId').value = c.id;
  document.getElementById('formCompanyName').value = c.razao_social || '';
  document.getElementById('formCompanyFantasy').value = c.fantasia || '';
  document.getElementById('formCompanyType').value = c.tipo || 'CLI';
  document.getElementById('formCompanyCnpj').value = c.cnpj || '';
  document.getElementById('formCompanyIe').value = c.ie || '';
  document.getElementById('formCompanyIm').value = c.im || '';
  document.getElementById('formCompanyBranch').value = c.ramo || '';
  document.getElementById('formCompanyPhone').value = c.tel || '';
  document.getElementById('formCompanyEmail').value = c.email || '';
  document.getElementById('formCompanyCep').value = c.cep || '';
  document.getElementById('formCompanyAddress').value = c.endereco || '';
  document.getElementById('formCompanyNumber').value = c.num || '';
  document.getElementById('formCompanyComplement').value = c.comp || '';
  document.getElementById('formCompanyNeighborhood').value = c.bairro || '';
  document.getElementById('formCompanyCity').value = c.cidade || '';
  document.getElementById('formCompanyState').value = c.uf || '';
  document.getElementById('formCompanyStatus').value = c.status || 'active';
}

async function openCompany(id = 0) {
  editingCompanyId = Number(id);
  clearCompanyForm();
  document.getElementById('companyModalTitle').textContent = id ? 'Editar empresa' : 'Nova empresa';
  if (id) {
    try {
      const result = await request(`${API}/companies.php?action=get&id=${id}`);
      fillCompanyForm(result.data);
    } catch (e) { setMessage('companyFormMessage',e.message); return; }
  }
  openModal('companyModal');
}

async function saveCompany(event) {
  event.preventDefault();
  setMessage('companyFormMessage','Salvando...');
  const data = {
    id: Number(document.getElementById('companyId').value || 0),
    razao_social: document.getElementById('formCompanyName').value.trim(),
    fantasia: document.getElementById('formCompanyFantasy').value.trim(),
    tipo: document.getElementById('formCompanyType').value,
    cnpj: document.getElementById('formCompanyCnpj').value.trim(),
    ie: document.getElementById('formCompanyIe').value.trim(),
    im: document.getElementById('formCompanyIm').value.trim(),
    ramo: document.getElementById('formCompanyBranch').value.trim(),
    tel: document.getElementById('formCompanyPhone').value.trim(),
    email: document.getElementById('formCompanyEmail').value.trim(),
    cep: document.getElementById('formCompanyCep').value.trim(),
    endereco: document.getElementById('formCompanyAddress').value.trim(),
    num: document.getElementById('formCompanyNumber').value.trim(),
    comp: document.getElementById('formCompanyComplement').value.trim(),
    bairro: document.getElementById('formCompanyNeighborhood').value.trim(),
    cidade: document.getElementById('formCompanyCity').value.trim(),
    uf: document.getElementById('formCompanyState').value,
    status: document.getElementById('formCompanyStatus').value
  };
  try {
    const action = data.id ? 'update' : 'create';
    await request(`${API}/companies.php?action=${action}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
    closeModal('companyModal'); await loadCompanies(); await loadDynamicMenu();
  } catch (e) { setMessage('companyFormMessage',e.message); }
}

async function inactivateCompany(id) {
  if (!confirm('Deseja realmente inativar esta empresa?')) return;
  try { await request(`${API}/companies.php?action=delete`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); await loadCompanies(); }
  catch(e) { setMessage('companiesMessage',e.message); }
}

/* =========================
   Cadastros: Produtos
   ========================= */
async function loadProducts() {
  setMessage('productsMessage','Carregando...');
  const params = new URLSearchParams({action:'list', page:String(productsPage), per_page:'20'});
  const field = document.getElementById('productSearchField').value;
  const search = document.getElementById('productSearch').value.trim();
  params.set('field',field); if(search) params.set('search',search); params.set('status','active');
  try {
    const result = await request(`${API}/products.php?${params}`);
    const data = result.data || {};
    const items = data.items || [];
    productsTotalPages = Number(data.total_pages || 1);
    const body = document.getElementById('productsTableBody');
    body.innerHTML = items.length ? items.map(p => `
      <tr>
        <td>${escapeHtml(p.cod_int ?? '—')}</td>
        <td><strong>${escapeHtml(p.descricao)}</strong></td>
        <td>${escapeHtml(p.unidade || '—')}</td>
        <td>${escapeHtml(formatCrudNumber(p.estoque))}</td>
        <td>${escapeHtml(formatCrudNumber(p.reserva))}</td>
        <td>${escapeHtml(formatCrudNumber(p.disponivel))}</td>
        <td>${escapeHtml(p.fornecedor_nome || '—')}</td>
        <td><span class="status ${p.status === 'active' ? 'active' : 'inactive'}">${p.status === 'active' ? 'Ativo' : 'Inativo'}</span></td>
        <td><div class="row-actions"><button class="secondary" data-edit-product="${p.id}">Editar</button><button class="secondary" data-inactivate-product="${p.id}">Inativar</button></div></td>
      </tr>`).join('') : '<tr><td colspan="9" class="muted">Nenhum produto encontrado.</td></tr>';
    document.getElementById('productsPageInfo').textContent = `Página ${productsPage} de ${productsTotalPages}`;
    document.getElementById('productsPrev').disabled = productsPage <= 1;
    document.getElementById('productsNext').disabled = productsPage >= productsTotalPages;
    setMessage('productsMessage','');
  } catch(e) { setMessage('productsMessage',e.message); }
}

async function loadProductSuppliers(selectedId = '') {
  const select = document.getElementById('formProductSupplier');
  try {
    const result = await request(`${API}/companies.php?action=options`);
    select.innerHTML = '<option value="">— Nenhum —</option>' + (result.data.items || []).map(c =>
      `<option value="${c.id}">${escapeHtml(c.fantasia || c.razao_social)}</option>`).join('');
    select.value = selectedId || '';
  } catch(e) { select.innerHTML = '<option value="">Não foi possível carregar</option>'; }
}

function clearProductForm() {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('formProductUnit').value = 'UND';
  document.getElementById('formProductConsumption').value = '0';
  document.getElementById('formProductStock').value = '0';
  document.getElementById('formProductMinStock').value = '0';
  document.getElementById('formProductCost').value = '0';
  document.getElementById('formProductMarkup').value = '0';
  document.getElementById('formProductStatus').value = 'active';
  setMessage('productFormMessage','');
}

function fillProductForm(p) {
  document.getElementById('productId').value = p.id;
  document.getElementById('formProductDescription').value = p.descricao || '';
  document.getElementById('formProductCode').value = p.cod_int ?? '';
  document.getElementById('formProductSupplierCode').value = p.cod_forn || '';
  document.getElementById('formProductBarcode').value = p.cod_bar || '';
  document.getElementById('formProductUnit').value = p.unidade || 'UND';
  document.getElementById('formProductNcm').value = p.ncm || '';
  document.getElementById('formProductConsumption').value = p.consumo ? '1' : '0';
  document.getElementById('formProductStock').value = p.estoque ?? 0;
  document.getElementById('formProductMinStock').value = p.estq_min ?? 0;
  document.getElementById('formProductCost').value = p.custo ?? 0;
  document.getElementById('formProductMarkup').value = p.markup ?? 0;
  document.getElementById('formProductLocation').value = p.local || '';
  document.getElementById('formProductStatus').value = p.status || 'active';
}

async function openProduct(id = 0) {
  editingProductId = Number(id);
  clearProductForm();
  document.getElementById('productModalTitle').textContent = id ? 'Editar produto' : 'Novo produto';
  if (id) {
    try {
      const result = await request(`${API}/products.php?action=get&id=${id}`);
      fillProductForm(result.data);
      await loadProductSuppliers(result.data.id_emp || '');
    } catch(e) { setMessage('productFormMessage',e.message); return; }
  } else await loadProductSuppliers();
  openModal('productModal');
}

async function saveProduct(event) {
  event.preventDefault();
  setMessage('productFormMessage','Salvando...');
  const data = {
    id:Number(document.getElementById('productId').value || 0),
    id_emp:document.getElementById('formProductSupplier').value ? Number(document.getElementById('formProductSupplier').value) : null,
    descricao:document.getElementById('formProductDescription').value.trim(),
    estoque:Number(document.getElementById('formProductStock').value || 0),
    estq_min:Number(document.getElementById('formProductMinStock').value || 0),
    unidade:document.getElementById('formProductUnit').value.trim(),
    ncm:document.getElementById('formProductNcm').value.trim(),
    cod_int:document.getElementById('formProductCode').value ? Number(document.getElementById('formProductCode').value) : null,
    cod_bar:document.getElementById('formProductBarcode').value.trim(),
    cod_forn:document.getElementById('formProductSupplierCode').value.trim(),
    consumo:document.getElementById('formProductConsumption').value === '1',
    custo:Number(document.getElementById('formProductCost').value || 0),
    markup:Number(document.getElementById('formProductMarkup').value || 0),
    local:document.getElementById('formProductLocation').value.trim(),
    status:document.getElementById('formProductStatus').value
  };
  try {
    const action = data.id ? 'update' : 'create';
    await request(`${API}/products.php?action=${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    closeModal('productModal'); await loadProducts();
  } catch(e) { setMessage('productFormMessage',e.message); }
}

async function inactivateProduct(id) {
  if (!confirm('Deseja realmente inativar este produto?')) return;
  try { await request(`${API}/products.php?action=delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); await loadProducts(); }
  catch(e) { setMessage('productsMessage',e.message); }
}



document.getElementById('newCompanyBtn').addEventListener('click', () => openCompany());
document.getElementById('refreshCompaniesBtn').addEventListener('click', () => { companiesPage=1; loadCompanies(); });
document.getElementById('companySearchBtn').addEventListener('click', () => { companiesPage=1; loadCompanies(); });
document.getElementById('companySearch').addEventListener('keydown', e => { if(e.key==='Enter'){ companiesPage=1; loadCompanies(); }});
document.getElementById('companiesPrev').addEventListener('click',()=>{if(companiesPage>1){companiesPage--;loadCompanies();}});
document.getElementById('companiesNext').addEventListener('click',()=>{if(companiesPage<companiesTotalPages){companiesPage++;loadCompanies();}});
document.getElementById('companiesTableBody').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-company]'); if(edit) return openCompany(Number(edit.dataset.editCompany));
  const del=e.target.closest('[data-inactivate-company]'); if(del) return inactivateCompany(Number(del.dataset.inactivateCompany));
});
document.getElementById('closeCompanyModal').addEventListener('click',()=>closeModal('companyModal'));
document.getElementById('cancelCompanyBtn').addEventListener('click',()=>closeModal('companyModal'));
document.getElementById('companyForm').addEventListener('submit',saveCompany);
document.getElementById('companyCnpjBtn').addEventListener('click',()=>{
  const cnpj=document.getElementById('formCompanyCnpj').value.replace(/\D/g,'');
  if(cnpj) window.open(`https://servicos.receita.fazenda.gov.br/servicos/cnpjreva/Cnpjreva_Solicitacao.asp?cnpj=${encodeURIComponent(cnpj)}`,'_blank');
});

document.getElementById('newProductBtn').addEventListener('click',()=>openProduct());
document.getElementById('refreshProductsBtn').addEventListener('click',()=>{productsPage=1;loadProducts();});
document.getElementById('productSearchBtn').addEventListener('click',()=>{productsPage=1;loadProducts();});
document.getElementById('productSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){productsPage=1;loadProducts();}});
document.getElementById('productsPrev').addEventListener('click',()=>{if(productsPage>1){productsPage--;loadProducts();}});
document.getElementById('productsNext').addEventListener('click',()=>{if(productsPage<productsTotalPages){productsPage++;loadProducts();}});
document.getElementById('productsTableBody').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-product]'); if(edit) return openProduct(Number(edit.dataset.editProduct));
  const del=e.target.closest('[data-inactivate-product]'); if(del) return inactivateProduct(Number(del.dataset.inactivateProduct));
});
document.getElementById('closeProductModal').addEventListener('click',()=>closeModal('productModal'));
document.getElementById('cancelProductBtn').addEventListener('click',()=>closeModal('productModal'));
document.getElementById('productForm').addEventListener('submit',saveProduct);

window.addEventListener('resize', () => { if (window.innerWidth > 760) closeMobileMenu(); });

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await request(`${API}/auth.php?action=logout`, {method:'POST'}); } catch (error) { console.error(error); }
  csrfToken = ''; stopMessagingPolling(); showLogin();
});

// A navegação é montada pelo catálogo dinâmico em menu.php.


document.getElementById('refreshSettingsBtn').addEventListener('click', () => { loadSettingsCategories(); loadSettings(); });
document.getElementById('settingsCategoryFilter').addEventListener('change', loadSettings);
document.getElementById('settingsStatusFilter').addEventListener('change', loadSettings);
document.getElementById('settingsSearch').addEventListener('keydown', e => { if (e.key === 'Enter') loadSettings(); });
document.getElementById('settingsTableBody').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-setting]');
  if (edit) return openEditSetting(Number(edit.dataset.editSetting));
  const reset = event.target.closest('[data-reset-setting]');
  if (reset) return resetSetting(Number(reset.dataset.resetSetting));
});
document.getElementById('closeSettingModal').addEventListener('click', () => closeModal('settingModal'));
document.getElementById('cancelSettingBtn').addEventListener('click', () => closeModal('settingModal'));
document.getElementById('settingForm').addEventListener('submit', saveSetting);

document.getElementById('refreshAuditBtn').addEventListener('click', () => { auditPage = 1; loadAudit(); });
document.getElementById('auditActionFilter').addEventListener('change', () => { auditPage = 1; loadAudit(); });
document.getElementById('auditModuleFilter').addEventListener('change', () => { auditPage = 1; loadAudit(); });
document.getElementById('auditEntityFilter').addEventListener('change', () => { auditPage = 1; loadAudit(); });
document.getElementById('auditDateFrom').addEventListener('change', () => { auditPage = 1; loadAudit(); });
document.getElementById('auditDateTo').addEventListener('change', () => { auditPage = 1; loadAudit(); });
document.getElementById('auditSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { auditPage = 1; loadAudit(); } });
document.getElementById('auditPrevPage').addEventListener('click', () => { if (auditPage > 1) { auditPage--; loadAudit(); } });
document.getElementById('auditNextPage').addEventListener('click', () => { if (auditPage < auditTotalPages) { auditPage++; loadAudit(); } });

document.getElementById('newModuleBtn').addEventListener('click', openNewModule);
document.getElementById('refreshModulesBtn').addEventListener('click', loadModulesAdmin);
document.getElementById('moduleStatusFilter').addEventListener('change', loadModulesAdmin);
document.getElementById('moduleSearch').addEventListener('keydown', e => { if (e.key === 'Enter') loadModulesAdmin(); });
document.getElementById('moduleForm').addEventListener('submit', saveModule);
document.getElementById('closeModuleModal').addEventListener('click', () => closeModal('moduleModal'));
document.getElementById('cancelModuleBtn').addEventListener('click', () => closeModal('moduleModal'));
document.getElementById('chooseModuleIconBtn').addEventListener('click', openIconPicker);
document.getElementById('formModuleIcon').addEventListener('input', event => setModuleIconPreview(event.target.value));
document.getElementById('closeIconPickerModal').addEventListener('click', closeIconPicker);
document.getElementById('cancelIconPickerBtn').addEventListener('click', closeIconPicker);
document.getElementById('confirmIconPickerBtn').addEventListener('click', confirmIconPicker);
document.getElementById('iconPickerSearch').addEventListener('input', renderIconPicker);
document.getElementById('iconPickerGrid').addEventListener('click', event => {
  const item = event.target.closest('[data-icon-value]');
  if (!item) return;
  setIconPickerSelected(item.dataset.iconValue);
  renderIconPicker();
});

document.getElementById('modulesTableBody').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-module]');
  if (edit) return openEditModule(Number(edit.dataset.editModule));
  const inactive = event.target.closest('[data-inactivate-module]');
  if (inactive) return inactivateModule(Number(inactive.dataset.inactivateModule));
});

document.getElementById('newRoleBtn').addEventListener('click', openNewRole);
document.getElementById('refreshRolesBtn').addEventListener('click', loadRolesAdmin);
document.getElementById('roleStatusFilter').addEventListener('change', loadRolesAdmin);
document.getElementById('roleSearch').addEventListener('keydown', e => { if (e.key === 'Enter') loadRolesAdmin(); });
document.getElementById('roleForm').addEventListener('submit', saveRole);
document.getElementById('closeRoleModal').addEventListener('click', () => closeModal('roleModal'));
document.getElementById('cancelRoleBtn').addEventListener('click', () => closeModal('roleModal'));
document.getElementById('rolesTableBody').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-role]');
  if (edit) return openEditRole(Number(edit.dataset.editRole));
  const inactive = event.target.closest('[data-inactivate-role]');
  if (inactive) return inactivateRole(Number(inactive.dataset.inactivateRole));
});

document.getElementById('newUserBtn').addEventListener('click', openNewUser);
document.getElementById('refreshUsersBtn').addEventListener('click', () => { usersPage = 1; loadUsers(); });
document.getElementById('userStatusFilter').addEventListener('change', () => { usersPage = 1; loadUsers(); });
document.getElementById('userSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { usersPage = 1; loadUsers(); } });
document.getElementById('prevPage').addEventListener('click', () => { if (usersPage > 1) { usersPage--; loadUsers(); } });
document.getElementById('nextPage').addEventListener('click', () => { if (usersPage < usersTotalPages) { usersPage++; loadUsers(); } });
document.getElementById('userForm').addEventListener('submit', saveUser);
document.getElementById('passwordForm').addEventListener('submit', resetPassword);
document.getElementById('closeUserModal').addEventListener('click', () => closeModal('userModal'));
document.getElementById('cancelUserBtn').addEventListener('click', () => closeModal('userModal'));
document.getElementById('closePasswordModal').addEventListener('click', () => closeModal('passwordModal'));
document.getElementById('cancelPasswordBtn').addEventListener('click', () => closeModal('passwordModal'));

document.getElementById('usersTableBody').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-user]');
  if (edit) return openEditUser(Number(edit.dataset.editUser));
  const reset = event.target.closest('[data-reset-user]');
  if (reset) return openPasswordModal(Number(reset.dataset.resetUser), reset.dataset.userName);
  const inactive = event.target.closest('[data-inactivate-user]');
  if (inactive) return inactivateUser(Number(inactive.dataset.inactivateUser));
});


document.getElementById('messagesBtn').addEventListener('click', openMessagesModal);
document.getElementById('closeMessagesModal').addEventListener('click', closeMessagesModal);
document.getElementById('newMessageBtn').addEventListener('click', openNewMessageComposer);
document.getElementById('cancelNewMessageBtn').addEventListener('click', () => showMessagesPane('messagesEmptyState'));
document.getElementById('sendNewMessageBtn').addEventListener('click', sendMessageToRecipient);
document.getElementById('messageSendForm').addEventListener('submit', sendCurrentMessage);
document.getElementById('messageBody').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.getElementById('messageSendForm').requestSubmit(); }
});
document.getElementById('messagesConversationList').addEventListener('click', event => {
  const item = event.target.closest('[data-message-user]');
  if (item) loadMessageConversation(Number(item.dataset.messageUser));
});

checkSession();
