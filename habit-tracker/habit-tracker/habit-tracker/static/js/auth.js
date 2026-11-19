const form = document.querySelector('#auth-form');
const errorBox = document.querySelector('#form-error');
const isRegister = location.pathname === '/register';

async function getCsrf() {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось начать защищённую сессию. Обнови страницу.');
  return (await response.json()).csrf_token;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const csrf = await getCsrf();
    const data = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(`/api/auth/${isRegister ? 'register' : 'login'}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(Array.isArray(result.detail) ? result.detail.map(x => x.msg).join(', ') : (result.detail || 'Не удалось выполнить запрос'));
    location.replace('/');
  } catch (error) {
    errorBox.textContent = error.message || 'Произошла ошибка';
    button.disabled = false;
  }
});
