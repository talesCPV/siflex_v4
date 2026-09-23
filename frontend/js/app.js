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
let availableMenuItems = [];
let auditPage = 1;
let auditTotalPages = 1;
let editingSettingId = 0;

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
  document.getElementById('topbarUser').textContent = user.display_name || user.username;
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
window.addEventListener('resize', () => { if (window.innerWidth > 760) closeMobileMenu(); });

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await request(`${API}/auth.php?action=logout`, {method:'POST'}); } catch (error) { console.error(error); }
  csrfToken = ''; showLogin();
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

checkSession();
