const API = '../backend/api';
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginMessage = document.getElementById('loginMessage');
let csrfToken = '';

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase())) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = await response.json().catch(() => ({ success:false, message:'Resposta inválida do servidor.' }));
  if (!response.ok || !data.success) throw new Error(data.message || 'Erro na operação.');
  return data;
}

function showLogin(message = '') {
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
  loginMessage.textContent = message;
}

function showApp(user) {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  document.getElementById('welcome').textContent = `Bem-vindo, ${user.display_name}.`;
}

async function checkSession() {
  try {
    const result = await request(`${API}/auth.php?action=status`);
    if (result.data.authenticated) {
      csrfToken = result.data.csrf_token || '';
      showApp(result.data.user);
    } else {
      showLogin();
    }
  } catch (_) {
    showLogin('Não foi possível verificar a sessão.');
  }
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = 'Entrando...';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const result = await request(`${API}/auth.php?action=login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, password })
    });
    csrfToken = result.data.csrf_token || '';
    showApp(result.data.user);
    event.target.reset();
  } catch (error) {
    showLogin(error.message);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await request(`${API}/auth.php?action=logout`, { method: 'POST' });
  } catch (error) {
    console.error(error);
  } finally {
    csrfToken = '';
    showLogin();
  }
});

checkSession();
