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
    csrfToken = result.data.csrf_token || ''; showApp(result.data.user); event.target.reset();
  } catch (error) { showLogin(error.message); }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await request(`${API}/auth.php?action=logout`, {method:'POST'}); } catch (error) { console.error(error); }
  csrfToken = ''; showLogin();
});

document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.module-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(btn.dataset.view).classList.remove('hidden');
  if (btn.dataset.view === 'usersView') loadUsers();
  if (btn.dataset.view === 'rolesView') loadRolesAdmin();
}));

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
