const state = {
  isLoggedIn: false,
  username: '',
  authView: 'login',
  loginUser: '',
  loginPass: '',
  showPassword: false,
  loadingLogin: false,
  forgotStep: 'email',
  forgotEmail: '',
  forgotCode: ['', '', '', ''],
  users: [],
  darkMode: false,
  dashboard: {
    currentView: 'home',
    displayTime: '10:00',
    displayDate: '12 feb',
    currentUV: 7.5,
    exposureTime: 45,
    isRefreshing: false,
    showRecommendation: true,
    lastRecommendation: null,
    isConnected: true,
    recommendations: [
      { id: 1, uv: 6.2, message: 'Usa sombrero y busca sombra.', timestamp: '10 Feb, 09:30', level: 'Moderado' },
      { id: 2, uv: 4.5, message: 'Nivel seguro. Disfruta el exterior.', timestamp: '9 Feb, 14:15', level: 'Bajo' },
    ],
    weeklyData: [
      { day: 'L', minutes: 15, uv: 4.2, fullDay: 'Lunes' },
      { day: 'M', minutes: 25, uv: 6.5, fullDay: 'Martes' },
      { day: 'X', minutes: 50, uv: 7.8, fullDay: 'Miércoles' },
      { day: 'J', minutes: 40, uv: 6.2, fullDay: 'Jueves' },
      { day: 'V', minutes: 55, uv: 8.5, fullDay: 'Viernes' },
      { day: 'S', minutes: 30, uv: 5.3, fullDay: 'Sábado' },
      { day: 'D', minutes: 35, uv: 6.8, fullDay: 'Domingo' },
    ],
    selectedDay: null,
    showAllRecommendations: false,
  },
  profile: {
    skinTypeIndex: 2,
    spf: 50,
    notifications: true,
    isEditing: false,
    showCamera: false,
    isScanning: false,
  },
  ui: {
    modal: '',
    modalData: null,
    calendarOffset: 0,
    popoverAnchor: null,
  },
};

const skinTypes = [
  { type: 'Tipo I (Muy Clara)', description: 'Siempre se quema, nunca se broncea' },
  { type: 'Tipo II (Clara)', description: 'Se quema fácilmente, bronceado mínimo' },
  { type: 'Tipo III (Trigueña)', description: 'Se broncea moderadamente, puede quemarse' },
  { type: 'Tipo IV (Morena Clara)', description: 'Se broncea bien, rara vez se quema' },
  { type: 'Tipo V (Morena)', description: 'Se broncea con facilidad, muy rara vez se quema' },
  { type: 'Tipo VI (Muy Oscura)', description: 'Nunca se quema, siempre se broncea' },
];

const spfOptions = [15, 30, 50, 70, 100];
const logo = 'assets/logo.png';
const app = document.getElementById('app');
let toastTimer;
let toastEl;
let cameraStream;
let cameraPermissionError = false;

function loadUsers() {
  try {
    const stored = localStorage.getItem('heli_users');
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((u) => typeof u?.username === 'string' && typeof u?.password === 'string')
      .map((u) => ({
        username: u.username,
        password: u.password,
        email: u.email || `${u.username}@demo.com`,
        displayName: u.displayName || u.username,
        avatar: u.avatar || '',
      }));
  } catch {
    return [];
  }
}

function saveUsers() {
  try {
    localStorage.setItem('heli_users', JSON.stringify(state.users));
  } catch {
    // ignore
  }
}

function ensureDefaultDemoUser() {
  const exists = state.users.some((u) => u.username?.toLowerCase() === 'admin');
  if (exists) return;
  state.users.push({ username: 'admin', email: 'admin@demo.com', password: '123', displayName: 'Administrador', avatar: '' });
  saveUsers();
}

function getCurrentUser() {
  return state.users.find((u) => u.username === state.username) || null;
}

function getUserDisplayName(user) {
  return user?.displayName?.trim() || user?.username || state.username || 'Usuario';
}

function normalizeUsername(value = '') {
  return value.trim().toLowerCase();
}

function isUsernameAvailable(username, currentUsername = '') {
  const candidate = normalizeUsername(username);
  const current = normalizeUsername(currentUsername);
  if (!candidate) return false;
  if (candidate === current) return true;
  return !state.users.some((u) => normalizeUsername(u.username) === candidate);
}

function validatePassword(password = '') {
  if (password.length < 8) return 'La contraseña debe tener mínimo 8 caracteres.';
  if (!/[A-Za-z]/.test(password)) return 'La contraseña debe incluir al menos una letra.';
  if (!/\d/.test(password)) return 'La contraseña debe incluir al menos un número.';
  return '';
}

function validateName(name = '') {
  if (!name.trim()) return 'El nombre no puede estar vacío.';
  return '';
}

const formatTime = (d = new Date()) =>
  d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
const formatDate = (d = new Date()) =>
  d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

function ensureToastEl() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.className =
    'fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-xl opacity-0 pointer-events-none transition-opacity duration-300';
  document.body.appendChild(toastEl);
  return toastEl;
}

function showToast(msg) {
  const el = ensureToastEl();
  if (toastTimer) clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.remove('opacity-0');
  el.classList.add('opacity-100');
  toastTimer = setTimeout(() => {
    el.classList.remove('opacity-100');
    el.classList.add('opacity-0');
  }, 1600);
}

function stopCameraPreview() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
}

async function startCameraPreview() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraPermissionError = true;
    showToast('Tu navegador no permite abrir cámara');
    return;
  }
  try {
    stopCameraPreview();
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = document.getElementById('camera-feed');
    if (video) {
      video.srcObject = cameraStream;
      cameraPermissionError = false;
      await video.play().catch(() => {});
    }
  } catch {
    cameraPermissionError = true;
    showToast('No se pudo acceder a la cámara');
  }
}

function getUVStatus(uv) {
  if (uv <= 2.9) return { label: 'Bajo',     from: 'from-green-400',  to: 'to-green-500',  textCol: 'text-green-600',  bg: 'bg-green-50'  };
  if (uv <= 5.9) return { label: 'Moderado', from: 'from-yellow-300', to: 'to-yellow-500', textCol: 'text-yellow-600', bg: 'bg-yellow-50' };
  if (uv <= 7.9) return { label: 'Alto',     from: 'from-orange-400', to: 'to-red-500',    textCol: 'text-[#FF5E62]',  bg: 'bg-orange-50' };
  return           { label: 'Muy alto',      from: 'from-red-500',    to: 'to-rose-600',   textCol: 'text-rose-600',   bg: 'bg-red-50'    };
}

function getRecommendationText(uv) {
  if (uv < 3) return 'Nivel seguro. Disfruta el exterior.';
  if (uv < 6) return 'Usa sombrero y busca sombra.';
  return '¡Alerta! Aplica protector solar FPS 50+.';
}

function wrapScreen(gradient, content) {
  return `<div class="w-full min-h-dvh bg-[#FFFBF2] text-gray-800 font-sans pb-safe">
            <div class="screen-shell ${gradient}">${content}</div>
          </div>`;
}

// ─── FIX 1: botón login se habilita via oninput inline, sin llamar render() ───
function loginView() {
  const canSubmit = state.loginUser.trim() && state.loginPass.trim();
  return wrapScreen('bg-gradient-to-b from-[#FFE8B6] via-[#FFF5E1] to-white', `
    <div class="min-h-dvh flex flex-col items-center justify-center px-8 pt-12 pb-10 w-full">
      <div class="flex flex-col items-center mb-12 animate-fade-in">
        <div class="relative mb-6 filter drop-shadow-xl">
          <img src="${logo}" alt="Heli-Band Logo" class="logo-size object-contain" />
        </div>
        <p class="text-gray-500 text-sm mt-2 font-medium">Tu protección solar inteligente</p>
      </div>
      <form id="login-form" class="w-full space-y-5">
        <input id="login-user" type="text" value="${state.loginUser}"
          placeholder="Nombre de usuario"
          oninput="state.loginUser=this.value; document.getElementById('login-submit').disabled=!(this.value.trim()&&document.getElementById('login-pass').value.trim());"
          class="w-full bg-white/80 rounded-2xl px-6 py-4 text-center border border-orange-100/50 outline-none" />
        <div class="relative">
          <input id="login-pass" type="${state.showPassword ? 'text' : 'password'}" value="${state.loginPass}"
            placeholder="Contraseña"
            oninput="state.loginPass=this.value; document.getElementById('login-submit').disabled=!(this.value.trim()&&document.getElementById('login-user').value.trim());"
            class="w-full bg-white/80 rounded-2xl px-6 py-4 text-center border border-orange-100/50 outline-none" />
          <button id="toggle-pass" type="button" class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
            ${state.showPassword ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>'}
          </button>
        </div>
        <button id="login-submit" type="submit"
          ${state.loadingLogin || !canSubmit ? 'disabled' : ''}
          class="w-full mt-6 bg-gradient-to-r from-[#FF6B4A] to-[#FF4D4D] text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-50">
          ${state.loadingLogin
            ? '<div class="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>'
            : 'Iniciar Sesión'}
        </button>
      </form>
      <div class="mt-10 flex flex-col items-center space-y-6">
        <button id="forgot-btn" class="text-sm font-medium text-gray-500">¿Olvidaste tu contraseña?</button>
        <button id="create-btn" class="text-sm font-bold text-orange-500">Crear una cuenta</button>
      </div>
    </div>`);
}

function forgotView() {
  const step = state.forgotStep;
  const blocks = {
    email: `<form id="forgot-email-form" class="space-y-4 w-full">
      <h2 class="text-2xl font-bold text-center">Recuperar contraseña</h2>
      <input id="forgot-email" type="email" value="${state.forgotEmail}" placeholder="Correo" class="w-full bg-white/80 rounded-2xl px-6 py-4 text-center" />
      <button class="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold">Enviar código</button>
    </form>`,
    code: `<form id="forgot-code-form" class="space-y-4 w-full">
      <h2 class="text-2xl font-bold text-center">Código de verificación</h2>
      <div class="flex justify-center gap-2">
        ${state.forgotCode.map((x, i) => `<input data-code="${i}" maxlength="1" value="${x}" class="w-12 h-12 text-center rounded-xl bg-white" />`).join('')}
      </div>
      <button class="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold">Verificar</button>
    </form>`,
    success: `<div class="w-full text-center space-y-4">
      <h2 class="text-2xl font-bold">¡Listo!</h2>
      <p>Tu contraseña fue actualizada.</p>
      <button id="forgot-back-login" class="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold">Volver al login</button>
    </div>`,
  };
  return wrapScreen('bg-gradient-to-b from-[#FFF8E7] via-[#FFE4C4] to-[#FFF8F0]',
    `<div class="min-h-dvh flex flex-col px-8 pt-16 w-full relative">
      ${step !== 'success' ? '<button id="forgot-back" class="absolute top-16 left-6 p-2 text-2xl">←</button>' : ''}
      <div class="mt-20 flex justify-center">${blocks[step]}</div>
    </div>`);
}

function createView() {
  return wrapScreen('bg-gradient-to-b from-[#FFE8B6] via-[#FFF5E1] to-white',
    `<div class="min-h-dvh flex flex-col px-8 pt-20 pb-10 w-full">
      <button id="create-back" class="self-start mb-6 text-2xl">←</button>
      <form id="create-form" class="space-y-3">
        <h2 class="text-2xl font-bold text-center mb-2">Crear cuenta</h2>

        <div>
          <input id="create-user" type="text" placeholder="Nombre de usuario"
            class="w-full bg-white/80 rounded-2xl px-6 py-4 text-center border border-transparent outline-none" />
          <p id="create-user-msg" class="text-xs text-center mt-1 min-h-[1rem]"></p>
        </div>

        <div>
          <input id="create-email" type="email" placeholder="Correo electrónico"
            class="w-full bg-white/80 rounded-2xl px-6 py-4 text-center border border-transparent outline-none" />
          <p id="create-email-msg" class="text-xs text-center mt-1 min-h-[1rem]"></p>
        </div>

        <div>
          <input id="create-pass" type="password" placeholder="Contraseña"
            class="w-full bg-white/80 rounded-2xl px-6 py-4 text-center border border-transparent outline-none" />
          <p id="create-pass-msg" class="text-[11px] text-center mt-1 text-gray-400 min-h-[1rem]">Mínimo 8 caracteres, al menos una letra y un número.</p>
        </div>

        <button class="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold mt-2">Crear cuenta</button>
      </form>
    </div>`);
}

function homeContent() {
  const d = state.dashboard;
  const uv = getUVStatus(d.currentUV);
  const exposurePercentage = (d.exposureTime / 60) * 100;
  return `<div class="px-6 pt-10 pb-safe animate-fade-in">
    <div class="flex items-center justify-between mb-5 pt-4">
      <div>
        <div class="flex items-center gap-2"><i data-lucide="sun" class="text-orange-500"></i><h1 class="text-3xl font-bold">Inicio</h1></div>
        <p class="text-xs text-gray-500">Hola, ${state.username || 'Usuario'}</p>
      </div>
      <div class="flex gap-2">
        <button id="help-btn" class="p-2.5 rounded-xl bg-white border border-orange-100"><i data-lucide="help-circle" class="text-orange-500"></i></button>
        <button id="refresh" class="p-2.5 rounded-xl bg-white border border-orange-100 ${d.isRefreshing ? 'animate-spin' : ''}"><i data-lucide="refresh-cw" class="text-orange-500"></i></button>
      </div>
    </div>
    ${d.showRecommendation ? `<div class="mb-4 animate-slide-down">
      <div class="${uv.bg} rounded-2xl p-4 shadow-lg border-2 border-orange-200 flex items-start gap-3">
        <div class="bg-white p-2.5 rounded-full text-orange-500"><i data-lucide="shield"></i></div>
        <div class="flex-1">
          <p class="text-orange-600/70 text-[10px] font-bold uppercase">RECOMENDACIÓN ACTUAL</p>
          <p class="text-gray-800 font-semibold text-xs">${getRecommendationText(d.currentUV)}</p>
          <p class="text-gray-500 text-[10px] mt-1">UV: ${d.currentUV} • ${uv.label}</p>
        </div>
        <button id="close-rec">✕</button>
      </div>
    </div>` : ''}
    <div class="bg-white rounded-[2rem] p-5 shadow-xl mb-4 border border-white overflow-hidden">
      <div class="flex flex-col items-center pt-1">
        <div class="relative w-40 h-40 rounded-full bg-gradient-to-br ${uv.from} ${uv.to} shadow-[0_15px_30px_-10px_rgba(255,100,50,0.3)] flex items-center justify-center mb-3">
          <div class="text-center text-black z-10"><span class="text-5xl font-bold">${d.currentUV}</span></div>
        </div>
        <div class="text-center mb-4">
          <span class="text-gray-400 text-[10px] font-bold tracking-[0.2em] uppercase">ÍNDICE UV ACTUAL</span>
          <div class="text-xl font-bold mt-0.5 ${uv.textCol}">${uv.label}</div>
        </div>
        <div class="w-full bg-gray-50 rounded-xl p-3 border border-gray-100">
          <div class="flex justify-between text-[10px] font-medium mb-1.5">
            <span class="text-gray-400">Exposición</span><span class="text-gray-600">${d.exposureTime} / 60 min</span>
          </div>
          <div class="h-2 w-full bg-gray-200/70 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r ${uv.from} ${uv.to}" style="width:${exposurePercentage}%"></div>
          </div>
        </div>
      </div>
    </div>
    ${d.lastRecommendation ? `<div class="bg-white rounded-2xl p-4 shadow-lg border border-orange-100 mb-4">
      <div class="flex items-start justify-between mb-1">
        <p class="text-[10px] font-bold text-orange-500 uppercase">Última recomendación</p>
        <span class="text-[10px] text-gray-400">${d.lastRecommendation.timestamp}</span>
      </div>
      <p class="text-sm text-gray-800 font-semibold">${d.lastRecommendation.message}</p>
      <div class="flex items-center gap-2 mt-2">
        <span class="text-[11px] text-gray-500">UV: ${d.lastRecommendation.uv}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-bold">${d.lastRecommendation.level}</span>
      </div>
    </div>` : ''}
    <div class="flex flex-col gap-3">
      <button id="calculate-risk" class="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5">
        <i data-lucide="calculator" class="text-orange-400"></i><span>Calcular riesgo personal</span>
      </button>
      <div class="w-full py-3 flex items-center justify-center gap-2.5">
        <div class="w-2 h-2 rounded-full ${d.isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-300'}"></div>
        <i data-lucide="wifi" class="${d.isConnected ? 'text-green-600' : 'text-gray-400'}"></i>
        <span class="text-xs font-bold ${d.isConnected ? 'text-gray-700' : 'text-gray-400'}">${d.isConnected ? 'Pulsera conectada' : 'Pulsera desconectada'}</span>
      </div>
    </div>
  </div>`;
}

function getExposureMeta(minutes) {
  if (minutes >= 40) return { level: 'Alta',   chip: 'bg-red-100 text-red-700',       dayBg: 'bg-red-100 text-red-700 border-red-200'       };
  if (minutes >= 20) return { level: 'Media',  chip: 'bg-yellow-100 text-yellow-700', dayBg: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return               { level: 'Segura', chip: 'bg-green-100 text-green-700',   dayBg: 'bg-green-100 text-green-700 border-green-200'   };
}

function historyContent() {
  const d = state.dashboard;
  const avg = Math.round(d.weeklyData.reduce((s, x) => s + x.minutes, 0) / d.weeklyData.length);
  const total = d.weeklyData.reduce((s, x) => s + x.minutes, 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const maxMinutes = Math.max(...d.weeklyData.map((x) => x.minutes));

  const yGrid = [0, 20, 40, 60]
    .map((v) => `<div class="absolute left-0 right-0 border-t border-dashed border-gray-200" style="bottom:${(v / 60) * 100}%">
      <span class="absolute -left-6 -top-2 text-[10px] text-gray-400">${v}</span>
    </div>`)
    .join('');

  const bars = d.weeklyData
    .map((w, i) => {
      const selected = d.selectedDay === i;
      const color = selected ? '#6a6e73' : w.minutes < 20 ? '#4ADE80' : w.minutes < 40 ? '#FACC15' : '#FF5E62';
      const h = Math.max(12, (w.minutes / maxMinutes) * 140);
      return `<button data-bar="${i}" class="group flex flex-col items-center gap-2 relative">
        <span class="text-[10px] font-bold ${selected ? 'text-gray-700' : 'text-transparent group-hover:text-gray-500'}">${w.minutes}m</span>
        <div class="w-7 rounded-md transition-all" style="height:${h}px;background:${color}"></div>
        <span class="text-[11px] ${selected ? 'text-gray-700 font-bold' : 'text-gray-500'}">${w.day}</span>
      </button>`;
    })
    .join('');

  const recs = d.recommendations
    .slice(0, d.showAllRecommendations ? d.recommendations.length : 3)
    .map((rec) => {
      const s = getUVStatus(rec.uv);
      return `<div class="${s.bg} rounded-xl p-3 border border-gray-100 shadow-sm">
        <div class="flex justify-between mb-1">
          <span class="text-[10px] font-bold ${s.textCol}">${rec.level} • UV ${rec.uv}</span>
          <span class="text-[9px] text-gray-400">${rec.timestamp}</span>
        </div>
        <p class="text-xs text-gray-700 font-medium">${rec.message}</p>
      </div>`;
    })
    .join('');

  return `<div class="px-6 pt-10 pb-32 animate-fade-in">
    <div class="flex items-center justify-between mb-5 pt-4">
      <div>
        <div class="flex items-center gap-2"><i data-lucide="clock" class="text-orange-500"></i><h1 class="text-3xl font-bold">Historial</h1></div>
        <p class="text-xs text-gray-500">Resumen semanal</p>
      </div>
      <div class="flex gap-2">
        <button id="calendar-btn" class="p-2.5 rounded-xl bg-white border border-orange-100 text-orange-500">
          <i data-lucide="calendar"></i><span class="sr-only">Vista Mensual</span>
        </button>
      </div>
    </div>
    <div class="bg-white rounded-[2rem] p-5 shadow-xl mb-5 border border-white">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-gray-500 text-xs font-bold tracking-[0.15em]">EXPOSICIÓN UV (MINUTOS)</h2>
        <button id="chart-help" class="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
          <i data-lucide="help-circle" style="width:16px;height:16px"></i>
        </button>
      </div>
      <div class="relative h-48">
        <div class="absolute left-8 right-0 top-0 bottom-6">${yGrid}</div>
        <div class="absolute left-8 right-0 bottom-0 top-2 flex items-end justify-between">${bars}</div>
      </div>
    </div>
    ${d.selectedDay !== null ? `<div class="w-full bg-orange-50 rounded-2xl p-4 border border-orange-100 mb-5 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-white p-3 rounded-full text-orange-500"><i data-lucide="sun"></i></div>
        <div>
          <p class="text-orange-600/70 text-xs font-bold uppercase">${d.weeklyData[d.selectedDay].fullDay}</p>
          <p class="text-gray-800 font-bold text-[17px]">${d.weeklyData[d.selectedDay].minutes} min</p>
          <p class="text-gray-500 text-[13px] font-semibold">Promedio de minutos de exposición solar ese día</p>
          <p class="text-gray-500 text-[13px] font-bold">UV máx ${d.weeklyData[d.selectedDay].uv}</p>
        </div>
      </div>
      <button id="close-day" class="text-sm font-medium text-orange-600 px-4 py-2 bg-white/50 rounded-xl">Cerrar</button>
    </div>` : ''}
    <div class="grid grid-cols-2 gap-3 mb-5">
      <div class="bg-white rounded-2xl p-4 border border-gray-100">
        <p class="text-gray-400 text-[10px] font-bold uppercase">PROMEDIO DIARIO DE EXPOSICIÓN</p>
        <p class="text-2xl text-gray-800 font-bold">${avg}<span class="text-xs text-gray-500"> min al día</span></p>
        <p class="text-[11px] text-gray-500 mt-1">Tiempo promedio de exposición al sol por día.</p>
      </div>
      <div class="bg-white rounded-2xl p-4 border border-gray-100">
        <p class="text-gray-400 text-[10px] font-bold uppercase">TOTAL SEMANA</p>
        <p class="text-2xl text-gray-800 font-bold">${hours}h ${mins}m</p>
        <p class="text-[11px] text-gray-500 mt-1">Tiempo total de exposición al sol durante la semana.</p>
      </div>
    </div>
    <div class="mb-4">
      <h3 class="text-xs font-bold text-gray-400 uppercase mb-3">Historial de recomendaciones</h3>
      <div class="space-y-2">${recs}</div>
      ${d.recommendations.length > 3
        ? `<button id="toggle-all-recs" class="w-full mt-2 py-2 text-xs font-bold text-orange-600">
            ${d.showAllRecommendations ? 'Ver menos' : `Ver más (${d.recommendations.length - 3})`}
          </button>`
        : ''}
    </div>
  </div>`;
}

function profileContent() {
  const p = state.profile;
  const spfIndex = spfOptions.indexOf(p.spf);
  const user = getCurrentUser();
  const displayName = getUserDisplayName(user);
  const email = user?.email || 'sin-correo@demo.com';
  const avatar = user?.avatar || '';

  // ─── FIX 3: cámara pantalla completa, X con z-index explícito bien visible ───
  const cameraOverlay = p.showCamera ? `
    <div class="fixed inset-0 z-[100] bg-black">
      <div class="absolute top-0 left-0 right-0 z-[110] flex items-center justify-between px-5 pt-10 pb-4 bg-gradient-to-b from-black/70 to-transparent">
        <button data-stop-camera class="w-10 h-10 flex items-center justify-center bg-black/60 rounded-full border border-white/30 text-white text-xl font-bold">✕</button>
        <span class="text-white font-semibold text-sm bg-black/50 px-4 py-1.5 rounded-full">Escáner IA de piel</span>
        <div class="w-10"></div>
      </div>
      <video id="camera-feed" autoplay playsinline muted
        class="absolute inset-0 w-full h-full object-cover ${cameraPermissionError ? 'hidden' : ''}"></video>
      ${cameraPermissionError
        ? '<div class="absolute inset-0 flex items-center justify-center bg-gray-900 text-white/80 text-sm px-10 text-center">No se pudo abrir tu cámara. Puedes seguir usando la simulación.</div>'
        : ''}
      <div class="absolute inset-0 flex items-center justify-center z-[105]">
        <div class="relative w-56 h-72 rounded-[2.5rem] border-[3px] border-orange-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
          ${p.isScanning ? '<div class="absolute top-0 left-0 w-full h-1.5 bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,1)] animate-scan z-20"></div>' : ''}
          <div class="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-orange-400 rounded-tl-2xl"></div>
          <div class="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-orange-400 rounded-tr-2xl"></div>
          <div class="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-orange-400 rounded-bl-2xl"></div>
          <div class="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-orange-400 rounded-br-2xl"></div>
        </div>
      </div>
      <div class="absolute z-[110] left-0 right-0 flex justify-center" style="top: calc(50% + 160px)">
        <p class="text-white/90 text-sm font-medium bg-black/50 px-6 py-2 rounded-full text-center">
          ${p.isScanning ? 'Analizando pigmentación...' : 'Centra tu rostro dentro del marco naranja'}
        </p>
      </div>
      <div class="absolute bottom-12 left-0 right-0 z-[110] flex items-center justify-center">
        <button id="scan-skin" ${p.isScanning ? 'disabled' : ''}
          class="w-20 h-20 p-1.5 rounded-full border-[5px] border-white disabled:opacity-50">
          <div class="w-full h-full bg-white rounded-full shadow-lg"></div>
        </button>
      </div>
    </div>` : '';

  return `<div class="px-6 pt-10 pb-32 animate-fade-in relative">
    <div class="flex items-center justify-between mb-5 pt-4">
      <div>
        <div class="flex items-center gap-2"><i data-lucide="user" class="text-orange-500"></i><h1 class="text-3xl font-bold">Perfil</h1></div>
        <p class="text-xs text-gray-500">Cuenta y configuración</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="account-settings" class="p-2.5 rounded-xl bg-white border border-orange-100 text-gray-500"><i data-lucide="settings"></i></button>
        <button id="toggle-edit" class="p-2.5 rounded-xl bg-white border border-orange-100 ${p.isEditing ? 'bg-orange-50 text-orange-600' : 'text-gray-400'}"><i data-lucide="edit-3"></i></button>
      </div>
    </div>
    <div class="bg-white rounded-[2rem] p-5 shadow-xl mb-5 border border-white">
      <div class="flex items-center gap-4 mb-2">
        ${avatar
          ? `<img src="${avatar}" alt="Foto de perfil" class="w-16 h-16 rounded-full object-cover border border-orange-100" />`
          : `<div class="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-2xl font-medium">${displayName.charAt(0).toUpperCase()}</div>`}
        <div>
          <h2 class="text-xl text-gray-800 font-bold">${displayName}</h2>
          <p class="text-xs text-gray-500 font-medium">@${user?.username || state.username || 'usuario'}</p>
          <p class="text-xs text-gray-400 font-medium">${email}</p>
        </div>
      </div>
      <label class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-4 mb-2 block">TU TIPO DE PIEL</label>
      <div class="flex gap-2">
        <div class="relative flex-1">
          <i data-lucide="droplets" class="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500"></i>
          <select id="skin-select" ${p.isEditing ? '' : 'disabled'}
            class="w-full appearance-none bg-gray-50 border border-gray-100 text-gray-700 py-3 pl-10 pr-8 rounded-2xl font-bold text-sm disabled:opacity-60">
            ${skinTypes.map((s, i) => `<option value="${i}" ${i === p.skinTypeIndex ? 'selected' : ''}>${s.type}</option>`).join('')}
          </select>
          <i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        </div>
        <button id="start-camera" ${p.isEditing ? '' : 'disabled'}
          class="bg-orange-500 text-white p-3 rounded-2xl disabled:opacity-50"><i data-lucide="scan-line"></i></button>
      </div>
      <p class="text-[10px] text-gray-400 mt-2 italic">${skinTypes[p.skinTypeIndex].description}</p>
    </div>
    <div class="space-y-3 mb-6">
      <div class="bg-white rounded-2xl p-4 border border-gray-100 flex items-start gap-3">
        <div class="bg-green-50 p-2.5 rounded-full"><i data-lucide="shield" class="text-green-500"></i></div>
        <div class="flex-1">
          <p class="text-[10px] text-gray-400 font-bold uppercase mb-2">FPS ACTUAL</p>
          <div class="flex items-center justify-between">
            <button id="spf-dec" ${spfIndex === 0 || !p.isEditing ? 'disabled' : ''}
              class="p-2 rounded-xl ${spfIndex === 0 || !p.isEditing ? 'bg-gray-100 text-gray-300' : 'bg-orange-50 text-orange-600'}">
              <i data-lucide="chevron-left"></i>
            </button>
            <p class="text-3xl text-gray-800 font-bold">${p.spf}+</p>
            <button id="spf-inc" ${spfIndex === spfOptions.length - 1 || !p.isEditing ? 'disabled' : ''}
              class="p-2 rounded-xl ${spfIndex === spfOptions.length - 1 || !p.isEditing ? 'bg-gray-100 text-gray-300' : 'bg-orange-50 text-orange-600'}">
              <i data-lucide="chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-4 border border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="bg-yellow-50 p-2.5 rounded-full"><i data-lucide="bell" class="text-yellow-600"></i></div>
          <div><p class="text-gray-800 font-bold text-sm">Notificaciones</p><p class="text-[10px] text-gray-400 font-medium">Alertas activas</p></div>
        </div>
        <button id="toggle-notifications"
          class="w-11 h-6 rounded-full flex items-center p-1 ${p.notifications ? 'bg-orange-500' : 'bg-gray-200'}">
          <div class="w-4 h-4 bg-white rounded-full transition-transform ${p.notifications ? 'translate-x-5' : 'translate-x-0'}"></div>
        </button>
      </div>
      <div class="bg-white rounded-2xl p-4 border border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="bg-purple-50 p-2.5 rounded-full"><i data-lucide="moon" class="text-purple-600"></i></div>
          <div><p class="text-gray-800 font-bold text-sm">Modo oscuro</p><p class="text-[10px] text-gray-400 font-medium">Activar tema oscuro</p></div>
        </div>
        <button id="toggle-darkmode"
          class="w-11 h-6 rounded-full flex items-center p-1 ${state.darkMode ? 'bg-orange-500' : 'bg-gray-200'}">
          <div class="w-4 h-4 bg-white rounded-full transition-transform ${state.darkMode ? 'translate-x-5' : 'translate-x-0'}"></div>
        </button>
      </div>
    </div>
    <div class="space-y-3">
      <button id="band-settings" class="w-full bg-white rounded-2xl p-4 flex items-center justify-between border border-gray-100">
        <div class="flex items-center gap-3"><i data-lucide="settings" class="text-gray-400"></i><span class="text-sm text-gray-600 font-medium">Configuración de pulsera</span></div>
        <i data-lucide="chevron-right" class="text-gray-300"></i>
      </button>
      <button id="logout" class="w-full bg-red-50 rounded-2xl p-4 flex items-center justify-between border border-red-100">
        <div class="flex items-center gap-3"><i data-lucide="log-out" class="text-red-500"></i><span class="text-sm text-red-600 font-bold">Cerrar sesión</span></div>
      </button>
    </div>
    ${cameraOverlay}
  </div>`;
}

function buildCalendarEntries(offset = 0) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const week = state.dashboard.weeklyData;
  const entries = Array.from({ length: daysInMonth }).map((_, i) => {
    const day = i + 1;
    const source = week[(i + Math.abs(offset) * 2) % week.length];
    const variation = ((day * 5 + offset * 7) % 9) - 4;
    const minutes = Math.max(5, source.minutes + variation);
    const uv = Math.max(1, +(source.uv + variation * 0.1).toFixed(1));
    const exposure = getExposureMeta(minutes);
    return { day, month, year, minutes, uv, sourceDay: source.fullDay, exposure };
  });
  return {
    monthLabel: base.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    firstWeekday,
    entries,
  };
}

// ─── FIX 2: popover real, anclado al día con posición fixed calculada ───
function calendarPopover() {
  const data = state.ui.modalData;
  const anchor = state.ui.popoverAnchor;
  if (!data || !anchor) return '';

  const popW = 220;
  const vw = window.innerWidth;
  let left = anchor.left + anchor.width / 2 - popW / 2;
  if (left < 8) left = 8;
  if (left + popW > vw - 8) left = vw - popW - 8;
  const top = anchor.top + anchor.height + 6;

  const chipClass = data.level === 'Alta'
    ? 'bg-red-100 text-red-700'
    : data.level === 'Media'
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-green-100 text-green-700';

  return `
    <div id="popover-dismiss" class="fixed inset-0 z-[160]"></div>
    <div class="fixed z-[161] bg-white rounded-2xl shadow-2xl border border-orange-100 p-4"
      style="top:${top}px; left:${left}px; width:${popW}px;">
      <div class="flex items-center justify-between mb-2">
        <p class="text-sm font-bold text-gray-800">Día ${data.day}</p>
        <button id="calendar-popover-close" class="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>
      <p class="text-xs text-gray-600">Exposición: <strong>${data.minutes} min</strong></p>
      <p class="text-xs text-gray-600 mt-1">UV máx: <strong>${data.uv}</strong></p>
      <p class="mt-2"><span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${chipClass}">${data.level}</span></p>
    </div>`;
}

function modalView() {
  if (state.ui.modal === 'calendar') {
    const model = buildCalendarEntries(state.ui.calendarOffset);
    return `<div id="modal-backdrop" class="fixed inset-0 z-[140] bg-black/50 flex items-end">
      <div class="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-5 relative">
        <div class="flex justify-between items-center mb-3">
          <button id="calendar-prev" class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">‹</button>
          <h3 class="font-bold text-lg capitalize text-center">${model.monthLabel}</h3>
          <div class="flex gap-2">
            <button id="calendar-next" class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">›</button>
            <button id="close-modal" class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold">✕</button>
          </div>
        </div>
        <div class="grid grid-cols-7 gap-1.5 text-center text-[11px] text-gray-400 mb-2">
          <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
        </div>
        <div class="grid grid-cols-7 gap-1.5 text-center text-xs">
          ${Array.from({ length: model.firstWeekday }).map(() => '<div></div>').join('')}
          ${model.entries.map((x) =>
            `<button data-calendar-day="${x.day}" data-calendar-month="${x.month}" data-calendar-year="${x.year}"
              data-calendar-minutes="${x.minutes}" data-calendar-uv="${x.uv}"
              data-calendar-level="${x.exposure.level}" data-calendar-source="${x.sourceDay}"
              class="py-2 rounded-lg border ${x.exposure.dayBg} active:scale-95 transition-transform">${x.day}</button>`
          ).join('')}
        </div>
        <p class="text-[11px] text-gray-400 mt-3 text-center">Verde = segura · Amarillo = media · Rojo = alta</p>
      </div>
    </div>
    ${state.ui.modalData ? calendarPopover() : ''}`;
  }

  if (state.ui.modal === 'chart-help') {
    return `<div id="modal-backdrop" class="fixed inset-0 z-[145] bg-black/50 flex items-center justify-center p-6">
      <div class="bg-white w-full max-w-sm rounded-3xl p-5">
        <div class="flex justify-between items-center mb-2"><h3 class="font-bold">Cómo interpretar Historial</h3><button id="close-modal">✕</button></div>
        <p class="text-sm text-gray-600 mb-2">La gráfica muestra el <strong>tiempo promedio diario de exposición al sol</strong> (en minutos) para cada día.</p>
        <ul class="text-sm text-gray-600 list-disc pl-5 space-y-1">
          <li><strong>Promedio diario:</strong> minutos promedio que estuviste expuesto(a) al sol ese día.</li>
          <li><strong>Minutos mostrados:</strong> mientras más minutos, mayor exposición.</li>
          <li><strong>Barras:</strong> una barra más alta significa más tiempo al sol ese día.</li>
        </ul>
        <div class="mt-3 text-sm text-gray-600">
          <p class="font-semibold mb-1">Colores del calendario:</p>
          <p><span class="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>Verde: exposición segura.</p>
          <p><span class="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>Amarillo: exposición media.</p>
          <p><span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-2"></span>Rojo: exposición alta.</p>
        </div>
      </div>
    </div>`;
  }

  if (state.ui.modal === 'tutorial') {
    return `<div id="modal-backdrop" class="fixed inset-0 z-[145] bg-black/50 flex items-center justify-center p-6">
      <div class="bg-white w-full max-w-sm rounded-3xl p-5">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-bold text-lg">Cómo usar Heli-Band</h3>
          <button id="close-modal" class="text-gray-500">✕</button>
        </div>
        <ul class="list-disc pl-5 text-sm text-gray-600 space-y-2">
          <li><strong>Inicio:</strong> Revisa el índice UV actual y las recomendaciones. Actualiza los datos con el botón de recarga.</li>
          <li><strong>Historial:</strong> Consulta tu exposición semanal, promedios y recomendaciones pasadas. Toca un día de la gráfica para ver detalles.</li>
          <li><strong>Perfil:</strong> Configura tu tipo de piel, FPS, notificaciones y modo oscuro. Usa el escáner IA para detectar tu tipo de piel automáticamente.</li>
          <li><strong>Pulsera:</strong> Mantén tu pulsera sincronizada para recibir datos en tiempo real.</li>
        </ul>
      </div>
    </div>`;
  }

  if (state.ui.modal === 'account') {
    const user = getCurrentUser();
    if (!user) return '';
    const displayName = getUserDisplayName(user);
    const avatar = user.avatar || '';
    return `<div id="modal-backdrop" class="fixed inset-0 z-[145] bg-black/50 flex items-end">
      <div class="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-5">
        <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">Gestión de cuenta</h3><button id="close-modal">✕</button></div>
        <form id="account-form" class="space-y-3">
          <div class="flex items-center gap-3">
            ${avatar
              ? `<img src="${avatar}" alt="Foto" class="w-14 h-14 rounded-full object-cover border border-orange-100" />`
              : `<div class="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-xl font-medium">${displayName.charAt(0).toUpperCase()}</div>`}
            <div class="flex-1">
              <p class="text-xs text-gray-400">Foto de perfil</p>
              <button id="account-change-photo" type="button" class="text-sm text-orange-600 font-semibold">Cambiar foto</button>
              <input id="account-photo-input" type="file" accept="image/*" class="hidden" />
            </div>
          </div>
          <div>
            <label class="text-xs text-gray-500">Nombre</label>
            <input id="account-name" type="text" value="${displayName}" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2" />
            <p id="account-name-msg" class="text-[11px] text-red-500 mt-1"></p>
          </div>
          <div>
            <label class="text-xs text-gray-500">Nombre de usuario</label>
            <input id="account-username" type="text" value="${user.username}" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2" />
            <p id="account-user-msg" class="text-[11px] mt-1 text-gray-500"></p>
          </div>
          <div>
            <label class="text-xs text-gray-500">Correo electrónico</label>
            <input type="email" value="${user.email}" readonly class="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-500" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Contraseña</label>
            <input id="account-password" type="password" value="${user.password}" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2" />
            <p id="account-pass-msg" class="text-[11px] text-gray-500 mt-1">Mínimo 8 caracteres, una letra y un número.</p>
          </div>
          <button type="submit" class="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold">Guardar cambios</button>
        </form>
      </div>
    </div>`;
  }

  if (state.ui.modal === 'band') {
    return `<div id="modal-backdrop" class="fixed inset-0 z-[140] bg-black/50 flex items-end">
      <div class="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-5">
        <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">Pulsera UV • Especificaciones</h3><button id="close-modal">✕</button></div>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between"><span class="text-gray-500">Modelo</span><span class="font-semibold">HB-UV Sense V2</span></div>
          <div class="flex justify-between"><span class="text-gray-500">Batería</span><span class="font-semibold">84% (3 días estimados)</span></div>
          <div class="flex justify-between"><span class="text-gray-500">Frecuencia</span><span class="font-semibold">Cada 5 min</span></div>
          <div class="flex justify-between"><span class="text-gray-500">Última sincronización</span><span class="font-semibold">Hace 1 min</span></div>
          <div class="flex justify-between"><span class="text-gray-500">Firmware</span><span class="font-semibold">v1.8.4</span></div>
        </div>
        <button id="force-sync" class="mt-5 w-full bg-orange-500 text-white py-3 rounded-2xl font-bold">Sincronizar ahora</button>
      </div>
    </div>`;
  }

  if (state.ui.modal === 'risk') {
    const risk = ((state.dashboard.currentUV * 100) / state.profile.spf).toFixed(1);
    return `<div id="modal-backdrop" class="fixed inset-0 z-[140] bg-black/50 flex items-center justify-center p-6">
      <div class="bg-white w-full max-w-sm rounded-3xl p-5">
        <div class="flex justify-between items-center mb-2"><h3 class="font-bold">Riesgo personal</h3><button id="close-modal">✕</button></div>
        <p class="text-sm text-gray-500 mb-3">Estimado con UV actual y FPS seleccionado.</p>
        <div class="bg-orange-50 rounded-2xl p-4">
          <p class="text-xs text-gray-500">Índice estimado</p>
          <p class="text-3xl font-bold text-[#FF5E62]">${risk}%</p>
        </div>
      </div>
    </div>`;
  }

  return '';
}

function dashboardView() {
  const view = state.dashboard.currentView;
  const content = view === 'home' ? homeContent() : view === 'history' ? historyContent() : profileContent();
  return wrapScreen('bg-[#FFFBF2]', `
    <div class="h-dvh overflow-y-auto hide-scroll pt-0">${content}</div>
    <div class="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)]">
      <div class="bg-white px-2 py-3 rounded-3xl border border-gray-50 flex justify-around items-center shadow-[0_10px_30px_-5px_rgba(0,0,0,0.1)]">
        <button data-view="home" class="w-12 h-12 ${view === 'home' ? 'bg-[#FFEDE1] text-orange-600' : 'text-gray-400'} rounded-2xl flex items-center justify-center"><i data-lucide="home"></i></button>
        <button data-view="history" class="w-12 h-12 ${view === 'history' ? 'bg-[#FFEDE1] text-orange-600' : 'text-gray-400'} rounded-2xl flex items-center justify-center"><i data-lucide="clock"></i></button>
        <button data-view="profile" class="w-12 h-12 ${view === 'profile' ? 'bg-[#FFEDE1] text-orange-600' : 'text-gray-400'} rounded-2xl flex items-center justify-center"><i data-lucide="user"></i></button>
      </div>
    </div>
    ${modalView()}`);
}

function bind() {
  lucide.createIcons();

  // ── Auth ──
  document.getElementById('toggle-pass')?.addEventListener('click', () => { state.showPassword = !state.showPassword; render(); });
  document.getElementById('forgot-btn')?.addEventListener('click', () => { state.authView = 'forgot-password'; render(); });
  document.getElementById('create-btn')?.addEventListener('click', () => { state.authView = 'create-account'; render(); });

  document.getElementById('create-user')?.addEventListener('input', (e) => {
    const value = e.target.value || '';
    const msg = document.getElementById('create-user-msg');
    if (!msg) return;
    if (!value.trim()) { msg.textContent = ''; msg.className = 'text-xs text-center mt-1 min-h-[1rem]'; return; }
    if (isUsernameAvailable(value)) {
      msg.textContent = '✓ Nombre de usuario disponible';
      msg.className = 'text-xs text-center mt-1 min-h-[1rem] text-green-600';
    } else {
      msg.textContent = 'Este nombre de usuario ya está en uso';
      msg.className = 'text-xs text-center mt-1 min-h-[1rem] text-red-500';
    }
  });

  document.getElementById('create-email')?.addEventListener('input', (e) => {
    const value = (e.target.value || '').trim();
    const msg = document.getElementById('create-email-msg');
    if (!msg) return;
    if (!value) { msg.textContent = ''; msg.className = 'text-xs text-center mt-1 min-h-[1rem]'; return; }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (!emailOk) {
      msg.textContent = 'Ingresa un correo válido (ej. nombre@correo.com)';
      msg.className = 'text-xs text-center mt-1 min-h-[1rem] text-red-500';
    } else {
      msg.textContent = '✓ Correo válido';
      msg.className = 'text-xs text-center mt-1 min-h-[1rem] text-green-600';
    }
  });

  document.getElementById('create-pass')?.addEventListener('input', (e) => {
    const value = e.target.value || '';
    const msg = document.getElementById('create-pass-msg');
    if (!msg) return;
    if (!value) { msg.textContent = 'Mínimo 8 caracteres, al menos una letra y un número.'; msg.className = 'text-[11px] text-center mt-1 text-gray-400 min-h-[1rem]'; return; }
    const err = validatePassword(value);
    if (err) {
      msg.textContent = err;
      msg.className = 'text-[11px] text-center mt-1 min-h-[1rem] text-red-500';
    } else {
      msg.textContent = '✓ Contraseña válida';
      msg.className = 'text-[11px] text-center mt-1 min-h-[1rem] text-green-600';
    }
  });

  // FIX 1: sin render() — el botón se habilita via oninput declarado en el HTML
  document.getElementById('login-user')?.addEventListener('input', (e) => { state.loginUser = e.target.value; });
  document.getElementById('login-pass')?.addEventListener('input', (e) => { state.loginPass = e.target.value; });

  document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.loginUser.trim() || !state.loginPass.trim()) return;
    const user = state.users.find(
      (u) => u.username.toLowerCase() === state.loginUser.trim().toLowerCase() && u.password === state.loginPass
    );
    if (!user) return showToast('Credenciales inválidas');
    state.loadingLogin = true;
    render();
    setTimeout(() => {
      state.username = user.username;
      state.isLoggedIn = true;
      state.loadingLogin = false;
      render();
      showToast('Sesión iniciada');
    }, 1500);
  });

  document.getElementById('forgot-back')?.addEventListener('click', () => {
    if (state.forgotStep === 'email') state.authView = 'login';
    else state.forgotStep = 'email';
    render();
  });
  document.getElementById('forgot-email')?.addEventListener('input', (e) => { state.forgotEmail = e.target.value; });
  document.getElementById('forgot-email-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.forgotEmail.trim()) return showToast('Ingresa un correo');
    setTimeout(() => { state.forgotStep = 'code'; render(); showToast('Código enviado'); }, 800);
  });
  document.querySelectorAll('[data-code]').forEach((el) =>
    el.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.code);
      state.forgotCode[i] = e.target.value;
      if (e.target.value && i < 3) document.querySelector(`[data-code="${i + 1}"]`)?.focus();
    })
  );
  document.getElementById('forgot-code-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.forgotCode.join('').length !== 4) return showToast('Completa 4 dígitos');
    setTimeout(() => { state.forgotStep = 'success'; render(); showToast('Código verificado'); }, 800);
  });
  document.getElementById('forgot-back-login')?.addEventListener('click', () => {
    state.authView = 'login'; state.forgotStep = 'email'; state.forgotCode = ['', '', '', '']; render();
  });
  document.getElementById('create-back')?.addEventListener('click', () => { state.authView = 'login'; render(); });
  document.getElementById('create-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('create-user')?.value.trim() || '';
    const email    = (document.getElementById('create-email')?.value || '').trim();
    const password = document.getElementById('create-pass')?.value || '';

    const userMsg  = document.getElementById('create-user-msg');
    const emailMsg = document.getElementById('create-email-msg');
    const passMsg  = document.getElementById('create-pass-msg');

    // Limpiar mensajes previos
    if (userMsg)  { userMsg.textContent  = ''; userMsg.className  = 'text-xs text-center mt-1 min-h-[1rem]'; }
    if (emailMsg) { emailMsg.textContent = ''; emailMsg.className = 'text-xs text-center mt-1 min-h-[1rem]'; }
    if (passMsg)  { passMsg.textContent  = ''; passMsg.className  = 'text-[11px] text-center mt-1 min-h-[1rem]'; }

    let hasError = false;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Validar usuario
    if (!username) {
      if (userMsg) { userMsg.textContent = 'El nombre de usuario es obligatorio.'; userMsg.className = 'text-xs text-center mt-1 min-h-[1rem] text-red-500'; }
      hasError = true;
    } else if (!isUsernameAvailable(username)) {
      if (userMsg) { userMsg.textContent = 'Este nombre de usuario ya está en uso.'; userMsg.className = 'text-xs text-center mt-1 min-h-[1rem] text-red-500'; }
      hasError = true;
    }

    // Validar correo
    if (!email) {
      if (emailMsg) { emailMsg.textContent = 'El correo es obligatorio.'; emailMsg.className = 'text-xs text-center mt-1 min-h-[1rem] text-red-500'; }
      hasError = true;
    } else if (!emailOk) {
      if (emailMsg) { emailMsg.textContent = 'Ingresa un correo válido (ej. nombre@correo.com).'; emailMsg.className = 'text-xs text-center mt-1 min-h-[1rem] text-red-500'; }
      hasError = true;
    }

    // Validar contraseña
    if (!password) {
      if (passMsg) { passMsg.textContent = 'La contraseña es obligatoria.'; passMsg.className = 'text-[11px] text-center mt-1 min-h-[1rem] text-red-500'; }
      hasError = true;
    } else {
      const passError = validatePassword(password);
      if (passError) {
        if (passMsg) { passMsg.textContent = passError; passMsg.className = 'text-[11px] text-center mt-1 min-h-[1rem] text-red-500'; }
        hasError = true;
      }
    }

    if (hasError) return;

    state.users.push({ username, email, password, displayName: username, avatar: '' });
    saveUsers();
    state.loginUser = username;
    state.loginPass = password;
    state.authView = 'login';
    render();
    showToast('Cuenta creada');
  });

  // ── Dashboard nav ──
  document.querySelectorAll('[data-view]').forEach((btn) =>
    btn.addEventListener('click', () => { state.dashboard.currentView = btn.dataset.view; render(); })
  );

  // ── Home ──
  document.getElementById('refresh')?.addEventListener('click', () => {
    state.dashboard.isRefreshing = true;
    render();
    setTimeout(() => {
      if (state.dashboard.showRecommendation) {
        state.dashboard.lastRecommendation = {
          id: Date.now(), uv: state.dashboard.currentUV,
          message: getRecommendationText(state.dashboard.currentUV),
          timestamp: `${formatDate()}, ${formatTime()}`,
          level: getUVStatus(state.dashboard.currentUV).label,
        };
      }
      const newUV = +(Math.random() * 10 + 1).toFixed(1);
      state.dashboard.currentUV = newUV;
      state.dashboard.displayTime = formatTime();
      state.dashboard.displayDate = formatDate();
      state.dashboard.isRefreshing = false;
      state.dashboard.showRecommendation = true;
      state.dashboard.recommendations.unshift({
        id: Date.now(), uv: newUV,
        message: getRecommendationText(newUV),
        timestamp: `${formatDate()}, ${formatTime()}`,
        level: getUVStatus(newUV).label,
      });
      render();
      showToast('Datos UV actualizados');
    }, 1200);
  });
  document.getElementById('close-rec')?.addEventListener('click', () => {
    state.dashboard.lastRecommendation = {
      id: Date.now(), uv: state.dashboard.currentUV,
      message: getRecommendationText(state.dashboard.currentUV),
      timestamp: `${formatDate()}, ${formatTime()}`,
      level: getUVStatus(state.dashboard.currentUV).label,
    };
    state.dashboard.showRecommendation = false;
    render();
  });
  document.getElementById('calculate-risk')?.addEventListener('click', () => { state.ui.modal = 'risk'; render(); });
  document.getElementById('help-btn')?.addEventListener('click', () => { state.ui.modal = 'tutorial'; render(); });

  // ── History ──
  document.querySelectorAll('[data-bar]').forEach((el) =>
    el.addEventListener('click', () => {
      const i = Number(el.dataset.bar);
      state.dashboard.selectedDay = state.dashboard.selectedDay === i ? null : i;
      render();
    })
  );
  document.getElementById('close-day')?.addEventListener('click', () => { state.dashboard.selectedDay = null; render(); });
  document.getElementById('calendar-btn')?.addEventListener('click', () => {
    state.ui.modal = 'calendar'; state.ui.modalData = null; state.ui.popoverAnchor = null; render();
  });

  // FIX 2: guardar posición real del botón para anclar el popover
  document.querySelectorAll('[data-calendar-day]').forEach((el) =>
    el.addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      state.ui.popoverAnchor = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      state.ui.modalData = {
        day: Number(el.dataset.calendarDay),
        month: Number(el.dataset.calendarMonth),
        year: Number(el.dataset.calendarYear),
        minutes: Number(el.dataset.calendarMinutes),
        uv: Number(el.dataset.calendarUv),
        level: el.dataset.calendarLevel,
        sourceDay: el.dataset.calendarSource,
      };
      // modal sigue siendo 'calendar'; el popover se superpone sobre él
      render();
    })
  );
  document.getElementById('calendar-prev')?.addEventListener('click', () => {
    state.ui.calendarOffset -= 1; state.ui.modalData = null; state.ui.popoverAnchor = null; render();
  });
  document.getElementById('calendar-next')?.addEventListener('click', () => {
    state.ui.calendarOffset += 1; state.ui.modalData = null; state.ui.popoverAnchor = null; render();
  });
  document.getElementById('calendar-popover-close')?.addEventListener('click', () => {
    state.ui.modalData = null; state.ui.popoverAnchor = null; render();
  });
  document.getElementById('popover-dismiss')?.addEventListener('click', () => {
    state.ui.modalData = null; state.ui.popoverAnchor = null; render();
  });

  document.getElementById('chart-help')?.addEventListener('click', () => { state.ui.modal = 'chart-help'; render(); });
  document.getElementById('toggle-all-recs')?.addEventListener('click', () => {
    state.dashboard.showAllRecommendations = !state.dashboard.showAllRecommendations; render();
  });

  // ── Profile ──
  document.getElementById('toggle-edit')?.addEventListener('click', () => {
    state.profile.isEditing = !state.profile.isEditing;
    render();
    showToast(state.profile.isEditing ? 'Modo edición activado' : 'Modo edición desactivado');
  });
  document.getElementById('skin-select')?.addEventListener('change', (e) => {
    if (!state.profile.isEditing) return;
    state.profile.skinTypeIndex = Number(e.target.value);
    render();
  });
  document.getElementById('toggle-notifications')?.addEventListener('click', () => {
    state.profile.notifications = !state.profile.notifications;
    render();
    showToast(state.profile.notifications ? 'Notificaciones activadas' : 'Notificaciones desactivadas');
  });
  document.getElementById('toggle-darkmode')?.addEventListener('click', () => {
    state.darkMode = !state.darkMode;
    document.body.classList.toggle('dark', state.darkMode);
    render();
  });
  document.getElementById('spf-inc')?.addEventListener('click', () => {
    if (!state.profile.isEditing) return showToast('Activa modo edición');
    const i = spfOptions.indexOf(state.profile.spf);
    if (i < spfOptions.length - 1) state.profile.spf = spfOptions[i + 1];
    render();
  });
  document.getElementById('spf-dec')?.addEventListener('click', () => {
    if (!state.profile.isEditing) return showToast('Activa modo edición');
    const i = spfOptions.indexOf(state.profile.spf);
    if (i > 0) state.profile.spf = spfOptions[i - 1];
    render();
  });
  document.getElementById('band-settings')?.addEventListener('click', () => { state.ui.modal = 'band'; render(); });
  document.getElementById('force-sync')?.addEventListener('click', () => { showToast('Pulsera sincronizada'); state.ui.modal = ''; render(); });

  // FIX 3: cámara con X visible
  document.getElementById('start-camera')?.addEventListener('click', async () => {
    if (!state.profile.isEditing) return showToast('Activa modo edición');
    state.profile.showCamera = true;
    render();
    await startCameraPreview();
  });
  document.querySelectorAll('[data-stop-camera]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.profile.showCamera = false;
      state.profile.isScanning = false;
      stopCameraPreview();
      render();
    })
  );
  document.getElementById('scan-skin')?.addEventListener('click', () => {
    state.profile.isScanning = true;
    render();
    setTimeout(() => {
      state.profile.skinTypeIndex = Math.floor(Math.random() * 3) + 1;
      state.profile.isScanning = false;
      state.profile.showCamera = false;
      stopCameraPreview();
      render();
      showToast('Escaneo completado');
    }, 2200);
  });

  // ── Account ──
  document.getElementById('account-settings')?.addEventListener('click', () => { state.ui.modal = 'account'; render(); });
  document.getElementById('account-username')?.addEventListener('input', (e) => {
    const msg = document.getElementById('account-user-msg');
    if (!msg) return;
    const value = e.target.value || '';
    const current = getCurrentUser()?.username || '';
    if (!value.trim()) {
      msg.textContent = 'El nombre de usuario es obligatorio.';
      msg.className = 'text-[11px] mt-1 text-red-500';
      return;
    }
    if (isUsernameAvailable(value, current)) {
      msg.textContent = 'Nombre de usuario disponible';
      msg.className = 'text-[11px] mt-1 text-green-600';
    } else {
      msg.textContent = 'Este nombre de usuario ya está en uso';
      msg.className = 'text-[11px] mt-1 text-red-500';
    }
  });
  document.getElementById('account-change-photo')?.addEventListener('click', () => {
    document.getElementById('account-photo-input')?.click();
  });
  document.getElementById('account-photo-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const user = getCurrentUser();
    if (!user) return;
    const reader = new FileReader();
    reader.onload = () => {
      user.avatar = String(reader.result || '');
      saveUsers();
      showToast('Foto de perfil actualizada');
      state.ui.modal = 'account';
      render();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('account-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;
    const nextName = document.getElementById('account-name')?.value || '';
    const nextUser = document.getElementById('account-username')?.value || '';
    const nextPass = document.getElementById('account-password')?.value || '';
    const nameMsg = document.getElementById('account-name-msg');
    const userMsg = document.getElementById('account-user-msg');
    const passMsg = document.getElementById('account-pass-msg');
    if (nameMsg) nameMsg.textContent = '';
    if (passMsg) passMsg.textContent = '';
    const nameError = validateName(nextName);
    if (nameError) { if (nameMsg) nameMsg.textContent = nameError; return; }
    if (!isUsernameAvailable(nextUser, user.username)) {
      if (userMsg) { userMsg.textContent = 'Este nombre de usuario ya está en uso'; userMsg.className = 'text-[11px] mt-1 text-red-500'; }
      return;
    }
    const passError = validatePassword(nextPass);
    if (passError) {
      if (passMsg) { passMsg.textContent = passError; passMsg.className = 'text-[11px] text-red-500 mt-1'; }
      return;
    }
    user.displayName = nextName.trim();
    user.username = nextUser.trim();
    user.password = nextPass;
    state.username = user.username;
    saveUsers();
    state.ui.modal = '';
    render();
    showToast('Datos actualizados correctamente');
  });

  // ── Cierre de modales ──
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        state.ui.modal = '';
        state.ui.modalData = null;
        state.ui.popoverAnchor = null;
        render();
      }
    });
  }
  document.getElementById('close-modal')?.addEventListener('click', () => {
    state.ui.modal = '';
    state.ui.modalData = null;
    state.ui.popoverAnchor = null;
    render();
  });
  document.getElementById('logout')?.addEventListener('click', () => {
    setTimeout(() => {
      stopCameraPreview();
      state.isLoggedIn = false;
      state.username = '';
      state.authView = 'login';
      state.ui.modal = '';
      render();
    }, 500);
  });
}

function render() {
  ensureToastEl();
  document.body.classList.toggle('dark', state.darkMode);
  if (state.isLoggedIn) app.innerHTML = dashboardView();
  else if (state.authView === 'login') app.innerHTML = loginView();
  else if (state.authView === 'forgot-password') app.innerHTML = forgotView();
  else app.innerHTML = createView();
  bind();
}

state.users = loadUsers();
ensureDefaultDemoUser();
render();
