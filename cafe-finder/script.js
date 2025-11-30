let state = {
  activeTab: 'map',
  places: [],         // відфільтровані результати для відображення
  placesRaw: [],      // оригінальні результати Places API (зберігаються при перемиканні вкладок)
  placeDetails: {},   // кеш деталей місць (place_id -> details)
  favorites: [], // Буде завантажено з сервера або localStorage при ініціалізації через loadAuth()
  currentIndex: 0,    // індекс картки у вкладці "Карта"
  placesToShow: 20,   // кількість закладів для показу (пагінація)
  map: null,
  markers: [],
  userMarker: null,
  userPos: { lat: 49.8397, lng: 24.0297 }, // Львів fallback
  errorMessage: null,  // повідомлення про помилку
  filters: {
    radius: 2500,
    keyword: '',
    minRating: 0,
    minReviews: 0,
    openNow: false,
    sortBy: 'distance' // distance, rating, reviews
  },
  focusedPlaceId: null,  // ID місця для фокусування при переході з "Карти"
  reviewPlace: null,     // Місце для створення відгуку (перехід з інших вкладок)
  // Авторизація
  user: null,
  token: localStorage.getItem('authToken') || null,
  apiUrl: 'http://localhost:3001/api'  // URL backend API
};

// ====== УТИЛІТИ ======
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const showToast = (msg='💖 Додано в улюблені') => {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
};

const confirmDialog = (message, options = {}) => {
  const {
    title = 'Підтвердження',
    confirmText = 'Підтвердити',
    cancelText = 'Скасувати',
    icon = 'alert-triangle'
  } = options;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-icon">
          <i data-lucide="${icon}"></i>
        </div>
        <h3 class="confirm-title">${title}</h3>
        <p class="confirm-message">${message}</p>
        <div class="confirm-actions">
          <button type="button" class="confirm-btn cancel" data-confirm="cancel">
            <i data-lucide="x"></i>${cancelText}
          </button>
          <button type="button" class="confirm-btn danger" data-confirm="ok">
            <i data-lucide="trash-2"></i>${confirmText}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    lucide.createIcons?.();

    const cleanup = (result) => {
      overlay.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };

    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    overlay.querySelector('[data-confirm="cancel"]')?.addEventListener('click', () => cleanup(false));
    overlay.querySelector('[data-confirm="ok"]')?.addEventListener('click', () => cleanup(true));
  });
};
const saveFavs = () => localStorage.setItem('favorites', JSON.stringify(state.favorites));

// Дебаунс для інпутів
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Збереження/відновлення фільтрів
function saveFilters() {
  localStorage.setItem('cafeFilters', JSON.stringify(state.filters));
}
function loadFilters() {
  const saved = localStorage.getItem('cafeFilters');
  if (saved) {
    try {
      state.filters = { ...state.filters, ...JSON.parse(saved) };
    } catch(e) {
      console.warn('Помилка завантаження фільтрів:', e);
    }
  }
}

// ====== API ФУНКЦІЇ ======
async function apiRequest(endpoint, options = {}) {
  const url = `${state.apiUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if(state.token && !options.skipAuth) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Перевіряємо, чи є response (може бути undefined при помилці мережі)
    if(!response) {
      throw new Error('Не вдалося підключитися до сервера. Перевірте з\'єднання з інтернетом.');
    }

    let data;
    try {
      data = await response.json();
    } catch(parseError) {
      // Якщо не вдалося розпарсити JSON, можливо сервер повернув помилку
      if(!response.ok) {
        throw new Error(`Помилка сервера: ${response.status} ${response.statusText}`);
      }
      throw new Error('Не вдалося обробити відповідь сервера');
    }
    
    if(!response.ok) {
      throw new Error(data.error || `Помилка запиту: ${response.status}`);
    }

    return data;
  } catch(error) {
    console.error('API помилка:', error);
    // Якщо це помилка мережі, повертаємо зрозуміле повідомлення
    if(error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Не вдалося підключитися до сервера. Перевірте, чи запущений сервер на http://localhost:3001');
    }
    throw error;
  }
}

async function registerUser(userData) {
  return await apiRequest('/register', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
}

async function loginUser(identifier, password) {
  // identifier може бути email або nickname
  return await apiRequest('/login', {
    method: 'POST',
    body: JSON.stringify({ email: identifier, nickname: identifier, password })
  });
}

async function getProfile() {
  return await apiRequest('/profile');
}

async function updateProfile(updates) {
  return await apiRequest('/profile', {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);

  const url = `${state.apiUrl}/profile/avatar`;
  const headers = {
    'Authorization': `Bearer ${state.token}`
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData
  });

  const data = await response.json();
  
  if(!response.ok) {
    throw new Error(data.error || 'Помилка завантаження');
  }

  return data;
}

async function checkNickname(nickname) {
  try {
    const response = await fetch(`${state.apiUrl}/check-nickname?nickname=${encodeURIComponent(nickname)}`);
    if(!response.ok) {
      console.error('Помилка перевірки нікнейму: HTTP', response.status);
      return null; // Невідомо, чи доступний
    }
    const data = await response.json();
    return data.available;
  } catch(error) {
    console.error('Помилка перевірки нікнейму:', error);
    return null; // Помилка мережі - не можемо визначити
  }
}

// ====== REVIEWS API ======
async function getReviews(placeId = null, userId = null) {
  let endpoint = '/reviews';
  if(placeId) {
    endpoint = `/reviews/place/${placeId}`;
  } else if(userId) {
    endpoint = `/reviews?user_id=${userId}`;
  }
  return await apiRequest(endpoint);
}

async function createReview(placeId, placeName, rating, comment) {
  return await apiRequest('/reviews', {
    method: 'POST',
    body: JSON.stringify({ place_id: placeId, place_name: placeName, rating, comment })
  });
}

async function deleteReview(reviewId) {
  return await apiRequest(`/reviews/${reviewId}`, {
    method: 'DELETE'
  });
}

async function toggleReviewLike(reviewId) {
  return await apiRequest(`/reviews/${reviewId}/like`, {
    method: 'POST'
  });
}

// API для улюблених
async function getFavorites() {
  return await apiRequest('/favorites');
}

async function addFavorite(place) {
  // Guard: avoid sending very long data-URIs (SVG placeholders) or huge strings to the server
  let photo = place.photo || null;
  try {
    if(photo && (typeof photo === 'string')) {
      // If it's a data URI (inline SVG/base64), don't send it to DB — use null so server stores nothing
      if(photo.startsWith('data:')) photo = null;
      // If it's unexpectedly long, drop it as well (DB column limits)
      if(photo && photo.length > 1000) photo = null;
    }
  } catch(e) {
    photo = null;
  }

  return await apiRequest('/favorites', {
    method: 'POST',
    body: JSON.stringify({
      place_id: place.place_id || place.id,
      place_name: place.name,
      place_photo: photo,
      place_rating: place.rating || null,
      place_vicinity: place.vicinity || place.formatted_address || null,
      geometry: place.geometry || null
    })
  });
}

async function removeFavorite(placeId) {
  return await apiRequest(`/favorites/${placeId}`, {
    method: 'DELETE'
  });
}

async function checkFavorite(placeId) {
  return await apiRequest(`/favorites/check/${placeId}`);
}

async function saveAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('authToken', token);
  localStorage.setItem('user', JSON.stringify(user));
  
  // Завантажуємо улюблені з сервера
  if(token && user) {
    try {
      const favoritesData = await getFavorites();
      state.favorites = favoritesData.favorites || [];
      saveFavs(); // Зберігаємо в localStorage для швидкого доступу
    } catch(error) {
      console.error('Помилка завантаження улюблених:', error);
      // Якщо не вдалося завантажити, використовуємо з localStorage
      state.favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    }
  }
}

function clearAuth() {
  state.token = null;
  state.user = null;
  state.favorites = []; // Очищаємо улюблені при виході
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  // Не очищаємо favorites з localStorage, щоб зберегти для неавторизованих користувачів
}

async function loadAuth() {
  const token = localStorage.getItem('authToken');
  const userStr = localStorage.getItem('user');
  if(token && userStr) {
    state.token = token;
    try {
      state.user = JSON.parse(userStr);
      // Перевіряємо, чи токен ще дійсний, завантажуючи профіль
      getProfile().then(async data => {
        state.user = data.user;
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Завантажуємо улюблені з сервера
        try {
          const favoritesData = await getFavorites();
          state.favorites = favoritesData.favorites || [];
          saveFavs(); // Зберігаємо в localStorage для швидкого доступу
        } catch(error) {
          console.error('Помилка завантаження улюблених:', error);
          // Якщо не вдалося завантажити, використовуємо з localStorage
          state.favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        }
      }).catch(() => {
        // Токен недійсний, очищаємо
        clearAuth();
      });
    } catch(e) {
      clearAuth();
    }
  } else {
    // Якщо не авторизований, завантажуємо з localStorage
    state.favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  }
}

// ====== STARTUP (викликається maps callback'ом) ======
window.CafeApp_init = function CafeApp_init(){
  loadFilters();
  loadAuth();
  bindNav();
  render();
  initMapAndSearch();    // ініт карти + пошук кафе
};

// ====== Вкладки ======
function bindNav(){
  $$('.nav-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTab = btn.dataset.tab;
      render();
    });
  });
}

function render(){
  const root = $('#root');
  
  // Для карти - особлива обробка, щоб не руйнувати її
  if(state.activeTab === 'map' && state.map) {
    // Якщо карта вже створена, оновлюємо тільки ліву панель
    const leftPane = $('.left-pane');
    if(leftPane) {
      leftPane.innerHTML = leftPaneHTML();
      afterMapTabMount();
      return;
    }
  }
  
  // При перемиканні на "Дослідити" використовуємо placesRaw, якщо places порожній
  if(state.activeTab === 'explore' && state.places.length === 0 && state.placesRaw.length > 0) {
    state.places = state.placesRaw;
  }
  
  if(state.activeTab === 'map') return root.innerHTML = mapTabHTML(), afterMapTabMount();
  if(state.activeTab === 'explore') return root.innerHTML = exploreTabHTML(), afterExploreMount();
  if(state.activeTab === 'reviews') return root.innerHTML = reviewsTabHTML(), afterReviewsMount();
  if(state.activeTab === 'favorites') return root.innerHTML = favoritesTabHTML(), afterFavoritesMount();
  if(state.activeTab === 'profile') return root.innerHTML = profileTabHTML(), afterProfileMount();
}

// ====== TAB: MAP (left: card, right: map) ======
function leftPaneHTML(){
  const c = currentPlace();
  const total = state.places.length || 0;
  const idx = Math.min(state.currentIndex+1, total);
  return `
  <div style="max-width:600px;margin:0 auto">
    <h1 class="h1">Кав'ярні поруч</h1>
    <p class="p-lead">Знайдіть ідеальне місце для кави</p>
    
    ${c ? `
    <div class="swipe-hint" style="background:rgba(115,75,52,0.1);padding:12px 16px;border-radius:12px;margin-bottom:24px;font-size:14px;color:var(--accent);display:flex;align-items:center;gap:8px">
      <i data-lucide="info" style="width:18px;height:18px"></i>
      <span><strong>Підказка:</strong> Свайпніть вправо → додати в улюблені, вліво → пропустити</span>
    </div>
    ` : ''}

    ${state.errorMessage ? `
    <div class="empty">
      <i data-lucide="alert-circle" class="icon"></i>
      <h3 style="margin:0 0 8px">${state.errorMessage}</h3>
      <button class="btn-solid" onclick="window.location.reload()">🔄 Спробувати знову</button>
    </div>
    ` : c ? `
    <div class="counter">${idx} / ${total}</div>
    <div class="card">
      <div class="card-img" style="background-image:url('${placePhoto(c)}')">
      </div>
      <div class="card-body">
        <div class="card-top">
          <h3 class="title">${c.name}</h3>
          <div class="rating"><i data-lucide="star" style="width:16px;height:16px"></i><span style="font-weight:600">${fmtRating(c.rating)}</span></div>
        </div>
        <div class="meta"><i data-lucide="map-pin"></i><span>${c.vicinity || c.formatted_address || '—'}</span></div>
        ${c.distance !== undefined ? `<div class="meta"><i data-lucide="navigation"></i><span>${c.distance < 1 ? Math.round(c.distance * 1000) + ' м' : c.distance.toFixed(1) + ' км'} від вас</span></div>` : ''}
        <div class="meta"><i data-lucide="clock"></i><span>${getHoursStatus(c)}</span></div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-outline" id="route-btn" title="Побудувати маршрут до цієї кав'ярні"><i data-lucide="navigation"></i> Маршрут</button>
      ${state.user && state.token ? `
      <button class="btn btn-outline" id="add-review-map-btn" title="Залишити відгук про цю кав'ярню"><i data-lucide="star"></i> Відгук</button>
      ` : ''}
      <button class="btn btn-pill" id="learn-more-btn" title="Переглянути детальну інформацію про заклад"><i data-lucide="arrow-right"></i> Дізнатись більше</button>
    </div>
    <p class="bottom-note">Показано ${idx} з ${state.placesRaw.length} кав'ярень (сортування: рейтинг + відстань)</p>
    ${state.placesRaw.length > state.placesToShow ? `
    <button class="btn btn-outline" id="load-more-btn" style="width:100%;margin-top:16px" title="Завантажити наступні 20 закладів">
      <i data-lucide="arrow-down"></i> Завантажити ще (${state.placesRaw.length - state.placesToShow} залишилось)
    </button>
    ` : ''}
    ` : emptyAllSeenHTML() }
  </div>`;
}

function mapTabHTML(){
  return `
  <div class="map-grid">
    <div class="left-pane">
      ${leftPaneHTML()}
    </div>

    <div class="right-pane">
      <div class="map-controls">
        <button class="ctrl" id="recenter" title="Повернути карту до вашої локації"><i data-lucide="send"></i></button>
        <button class="ctrl" id="zoom-in" title="Збільшити масштаб карти"><i data-lucide="plus"></i></button>
        <button class="ctrl" id="zoom-out" title="Зменшити масштаб карти"><i data-lucide="minus"></i></button>
      </div>
      <div id="map"></div>
    </div>
  </div>`;
}
function emptyAllSeenHTML(){
  return `
    <div class="empty">
      <i data-lucide="coffee" class="icon"></i>
      <h3 style="margin:0 0 8px">Всі кав'ярні переглянуті!</h3>
      <p style="color:#838c8b">Оновіть сторінку для нового пошуку</p>
    </div>`;
}
function afterMapTabMount(){
  lucide.createIcons();

  // Кнопка "Маршрут"
  const routeBtn = $('#route-btn');
  if(routeBtn) {
    routeBtn.onclick = () => {
      const p = currentPlace();
      if(!p || !p.geometry) return;
      const dest = p.geometry.location;
      const url = `https://www.google.com/maps/dir/?api=1&origin=${state.userPos.lat},${state.userPos.lng}&destination=${dest.lat()},${dest.lng()}&travelmode=walking`;
      window.open(url, '_blank');
    };
  }

  // Кнопка "Дізнатись більше"
  const learnMoreBtn = $('#learn-more-btn');
  if(learnMoreBtn) {
    learnMoreBtn.onclick = () => {
      navigateToExploreForCurrent();
    };
  }

  // Кнопка "Додати відгук" на карті
  const addReviewMapBtn = $('#add-review-map-btn');
  if(addReviewMapBtn) {
    addReviewMapBtn.onclick = () => {
      const p = currentPlace();
      if(p && state.user && state.token) {
        navigateToReviewsForPlace(p);
      } else {
        showToast('⚠️ Увійдіть до акаунту, щоб залишити відгук');
        setTimeout(() => {
          $$('.nav-btn').forEach(b => b.classList.remove('active'));
          const profileBtn = $$('.nav-btn').find(b => b.dataset.tab === 'profile');
          if(profileBtn) {
            profileBtn.classList.add('active');
            state.activeTab = 'profile';
            render();
          }
        }, 500);
      }
    };
  }

  // Жести свайпу (приємний бонус)
  const card = $('.card');
  if(card && window.Hammer){
    const hm = new Hammer(card); hm.get('pan').set({direction:Hammer.DIRECTION_HORIZONTAL});
    let dx=0;
    hm.on('panmove',e=>{dx=e.deltaX; card.style.transform = `translateX(${dx}px) rotate(${dx/20}deg)`;});
    hm.on('panend',()=>{
      card.style.transition = 'transform .25s';
      if(dx>100){ 
        // Свайп вправо - додати в улюблені
        const p = currentPlace();
        if(p) {
          addToFavorites(p);
          showToast('💖 Додано в улюблені');
          // Перехід до наступного закладу
          nextPlace();
        }
      }
      else if(dx<-100){ 
        // Свайп вліво - пропустити (перехід до наступного)
        nextPlace();
      }
      card.style.transform = 'translateX(0) rotate(0deg)';
      setTimeout(()=>card.style.transition='',250);
    });
  }

  // Підключаємо карту до DOM (повторний attach)
  const mapEl = $('#map');
  if(mapEl) {
    try {
      // Якщо карта ще не створена або її контейнер змінився (рендер перезаписав DOM),
      // створюємо новий екземпляр карти і перемальовуємо маркери
      if(!state.map || (state.map.getDiv && state.map.getDiv() !== mapEl)) {
        state.map = new google.maps.Map(mapEl, {
          center: state.userPos,
          zoom: 14,
          styles:[{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]}]
        });
        // Перемальовуємо маркер користувача і маркери місць для нового екземпляра карти
        try { drawUserMarker(); } catch(e){ console.warn('drawUserMarker failed:', e); }
        try { drawPlaceMarkers(state.places || []); } catch(e){ console.warn('drawPlaceMarkers failed:', e); }
      } else {
        google.maps.event.trigger(state.map,'resize');
      }
    } catch(e) {
      console.warn('Помилка підключення карти до DOM:', e);
    }
  }

  // Контроли карти
  $('#recenter')?.addEventListener('click', ()=> state.map && state.userPos && state.map.setCenter(state.userPos));
  $('#zoom-in')?.addEventListener('click', ()=> state.map && state.map.setZoom(state.map.getZoom()+1));
  $('#zoom-out')?.addEventListener('click', ()=> state.map && state.map.setZoom(state.map.getZoom()-1));
  
  // Кнопка "Завантажити ще"
  const loadMoreBtn = $('#load-more-btn');
  if(loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      state.placesToShow += 20;
      state.places = state.placesRaw.slice(0, state.placesToShow);
      drawPlaceMarkers(state.places);
      // Оновлюємо тільки ліву панель
      const leftPane = $('.left-pane');
      if(leftPane) {
        leftPane.innerHTML = leftPaneHTML();
        afterMapTabMount();
      }
    });
  }
}

// ====== TAB: EXPLORE (grid of places) ======
function filtersHTML() {
  return `
    <div class="filters-section">
      <div class="filters-header">
        <h3 class="filters-title">Фільтри</h3>
      </div>

      <!-- Фільтри -->
      <div class="filters-grid">
        <div class="filter-group">
          <label class="filter-label">Максимальна відстань</label>
          <input type="range" class="filter-range" id="filter-radius" min="500" max="5000" step="500" value="${state.filters.radius}">
          <span class="filter-value" id="radius-value">${Math.round(state.filters.radius / 1000 * 10) / 10} км</span>
          <div class="filter-hint">Фільтрує заклади в межах цієї відстані</div>
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Мінімальний рейтинг</label>
          <input type="range" class="filter-range" id="filter-rating" min="0" max="5" step="0.1" value="${state.filters.minRating}">
          <span class="filter-value" id="rating-value">${state.filters.minRating > 0 ? state.filters.minRating.toFixed(1) : 'Будь-який'}</span>
          <div class="filter-hint">Показувати тільки заклади з рейтингом від ${state.filters.minRating > 0 ? state.filters.minRating.toFixed(1) : '0'}</div>
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Мінімальна кількість відгуків</label>
          <input type="range" class="filter-range" id="filter-minReviews" min="0" max="100" step="5" value="${state.filters.minReviews || 0}">
          <span class="filter-value" id="minReviews-value">${state.filters.minReviews > 0 ? state.filters.minReviews + '+' : 'Будь-яка'}</span>
          <div class="filter-hint">Фільтрує заклади з мінімальною кількістю відгуків</div>
        </div>
        
        <div class="filter-group">
          <label class="filter-checkbox-label">
            <input type="checkbox" class="filter-checkbox" id="filter-openNow" ${state.filters.openNow ? 'checked' : ''}>
            <span>Тільки відкриті зараз</span>
          </label>
          <div class="filter-hint">Показувати тільки заклади, які зараз працюють</div>
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Сортування</label>
          <select class="filter-select" id="filter-sortBy">
            <option value="distance" ${state.filters.sortBy === 'distance' ? 'selected' : ''}>Рейтинг + відстань (рекомендовано)</option>
            <option value="rating" ${state.filters.sortBy === 'rating' ? 'selected' : ''}>За рейтингом (вищі спочатку)</option>
            <option value="reviews" ${state.filters.sortBy === 'reviews' ? 'selected' : ''}>За кількістю відгуків</option>
          </select>
        </div>
      </div>
      
      <!-- Кнопки застосування та скидання фільтрів -->
      <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-outline" id="reset-filters-btn" style="min-width:150px">
          <i data-lucide="x"></i> Скинути
        </button>
        <button class="btn btn-pill" id="apply-filters-btn" style="min-width:200px">
          <i data-lucide="check"></i> Застосувати фільтри
        </button>
      </div>
    </div>
  `;
}

function exploreTabHTML(){
  // Якщо немає даних, використовуємо placesRaw
  if(state.places.length === 0 && state.placesRaw.length > 0) {
    state.places = [...state.placesRaw];
  }
  
  return `
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="h2">Дослідити кав'ярні</h2>
        <p class="sub">Знайдіть ідеальне місце для кави</p>
      </div>
    </div>
    
    ${state.places.length > 0 ? `
    <div style="background:rgba(115,75,52,0.1);padding:12px 16px;border-radius:12px;margin-bottom:24px;font-size:14px;color:var(--accent);display:flex;align-items:center;gap:8px">
      <i data-lucide="info" style="width:18px;height:18px"></i>
      <span><strong>Підказка:</strong> Наведіть курсор на картку або натисніть для перегляду додаткових опцій</span>
    </div>
    ` : ''}

    ${filtersHTML()}

    <div class="grid">
      ${state.places.length > 0 ? state.places.map(p=>`
        <div class="tile" data-id="${p.place_id}">
          <div class="tile-img" style="background-image:url('${placePhoto(p, 800)}')">
            <button class="tile-fav-btn" data-id="${p.place_id}" onclick="event.stopPropagation()" title="Додати в улюблені">
              <i data-lucide="heart" style="width:20px;height:20px"></i>
            </button>
            <div class="tile-overlay" data-place-id="${p.place_id}">
              <div class="tile-actions">
                ${(p.website || state.placeDetails[p.place_id]?.data?.website) ? `
                <a href="#" class="tile-action-btn" data-action="website" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                  <i data-lucide="globe"></i> Сайт
                </a>
                ` : ''}
                ${(p.website || state.placeDetails[p.place_id]?.data?.website) ? `
                <a href="#" class="tile-action-btn" data-action="menu" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                  <i data-lucide="utensils"></i> Меню
                </a>
                ` : ''}
                <a href="#" class="tile-action-btn" data-action="route" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                  <i data-lucide="navigation"></i> Маршрут
                </a>
                <a href="#" class="tile-action-btn" data-action="maps" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                  <i data-lucide="map"></i> В Google Maps
                </a>
                <a href="javascript:void(0)" class="tile-action-btn" data-action="review" data-place-id="${p.place_id}">
                  <i data-lucide="star"></i> Відгук
                </a>
              </div>
            </div>
          </div>
          <div class="tile-body">
            <div class="row">
              <h3 class="tile-title">${p.name}</h3>
              <div class="rating" title="Рейтинг закладу"><i data-lucide="star" style="width:16px;height:16px"></i> <span style="font-weight:600">${fmtRating(p.rating)}</span></div>
            </div>
            <div class="meta"><i data-lucide="map-pin"></i><span>${p.vicinity || p.formatted_address || '—'}</span></div>
            ${p.distance !== undefined ? `<div class="meta"><i data-lucide="navigation"></i><span>${p.distance < 1 ? Math.round(p.distance * 1000) + ' м' : p.distance.toFixed(1) + ' км'} від вас</span></div>` : ''}
            <div class="meta"><i data-lucide="clock"></i><span>${getHoursStatus(p)}</span></div>
          </div>
        </div>`).join('') : `
        <div class="empty" style="grid-column: 1 / -1">
          <i data-lucide="coffee" class="icon"></i>
          <h3 style="margin:0 0 8px">Не знайдено кав'ярень</h3>
          <p style="color:#838c8b">Спробуйте змінити фільтри</p>
        </div>
      `}
    </div>
  </div>`;
}
function bindFilters() {
  // Радіус
  const radiusInput = $('#filter-radius');
  const radiusValue = $('#radius-value');
  if(radiusInput && radiusValue) {
    // Оновлюємо градієнт треку при зміні значення
    const updateRadiusTrack = () => {
      const value = parseInt(radiusInput.value);
      const min = parseInt(radiusInput.min) || 500;
      const max = parseInt(radiusInput.max) || 5000;
      const percent = ((value - min) / (max - min)) * 100;
      radiusInput.style.setProperty('--progress', `${percent}%`);
    };
    updateRadiusTrack();
    
    radiusInput.addEventListener('input', () => {
      // Тільки оновлюємо відображення, не застосовуємо фільтри
      const value = parseInt(radiusInput.value);
      radiusValue.textContent = `${Math.round(value / 1000 * 10) / 10} км`;
      updateRadiusTrack();
    });
  }

  // Рейтинг
  const ratingInput = $('#filter-rating');
  const ratingValue = $('#rating-value');
  if(ratingInput && ratingValue) {
    // Оновлюємо градієнт треку при зміні значення
    const updateRatingTrack = () => {
      const value = parseFloat(ratingInput.value);
      const min = parseFloat(ratingInput.min) || 0;
      const max = parseFloat(ratingInput.max) || 5;
      const percent = ((value - min) / (max - min)) * 100;
      ratingInput.style.setProperty('--progress', `${percent}%`);
    };
    updateRatingTrack();
    
    ratingInput.addEventListener('input', () => {
      // Тільки оновлюємо відображення, не застосовуємо фільтри
      const value = parseFloat(ratingInput.value);
      ratingValue.textContent = value > 0 ? value.toFixed(1) : 'Будь-який';
      // Оновлюємо підказку
      const hint = ratingInput.closest('.filter-group')?.querySelector('.filter-hint');
      if(hint) {
        hint.textContent = `Показувати тільки заклади з рейтингом від ${value > 0 ? value.toFixed(1) : '0'}`;
      }
      updateRatingTrack();
    });
  }

  // Мінімальна кількість відгуків
  const minReviewsInput = $('#filter-minReviews');
  const minReviewsValue = $('#minReviews-value');
  if(minReviewsInput && minReviewsValue) {
    const updateMinReviewsTrack = () => {
      const value = parseInt(minReviewsInput.value);
      const min = parseInt(minReviewsInput.min) || 0;
      const max = parseInt(minReviewsInput.max) || 100;
      const percent = ((value - min) / (max - min)) * 100;
      minReviewsInput.style.setProperty('--progress', `${percent}%`);
    };
    updateMinReviewsTrack();
    
    minReviewsInput.addEventListener('input', () => {
      const value = parseInt(minReviewsInput.value);
      minReviewsValue.textContent = value > 0 ? value + '+' : 'Будь-яка';
      updateMinReviewsTrack();
    });
  }

  // Відкрито зараз
  const openNowCheckbox = $('#filter-openNow');
  if(openNowCheckbox) {
    // Не застосовуємо одразу, тільки при натисканні кнопки
  }

  // Сортування
  const sortSelect = $('#filter-sortBy');
  if(sortSelect) {
    // Не застосовуємо одразу, тільки при натисканні кнопки
  }

  // Кнопка застосування фільтрів
  const applyBtn = $('#apply-filters-btn');
  if(applyBtn) {
    applyBtn.addEventListener('click', () => {
      // Збираємо всі значення з полів
      const oldRadius = state.filters.radius;
      if(radiusInput) {
        state.filters.radius = parseInt(radiusInput.value);
      }
      if(ratingInput) {
        state.filters.minRating = parseFloat(ratingInput.value);
      }
      if(minReviewsInput) {
        state.filters.minReviews = parseInt(minReviewsInput.value) || 0;
      }
      if(openNowCheckbox) {
        state.filters.openNow = openNowCheckbox.checked;
      }
      if(sortSelect) {
        state.filters.sortBy = sortSelect.value;
      }
      
      saveFilters();
      
      // Якщо радіус значно збільшився (більше ніж на 500м), робимо новий пошук
      // Якщо радіус зменшився або змінився незначно, просто фільтруємо наявні результати
      if(state.userPos && state.placesRaw.length > 0) {
        const radiusChanged = oldRadius !== state.filters.radius;
        const radiusIncreased = state.filters.radius > oldRadius + 500;
        
        if(radiusIncreased) {
          // Радіус значно збільшився - робимо новий пошук
          searchNearbyWithFilters();
        } else {
          // Радіус зменшився або змінився незначно - фільтруємо наявні результати
          applyFilters();
        }
      } else if(state.userPos) {
        // Немає даних - робимо новий пошук
        searchNearbyWithFilters();
      } else {
        // Немає позиції - просто застосовуємо фільтри
        applyFilters();
      }
      
      // Візуальний фідбек
      applyBtn.innerHTML = '<i data-lucide="check"></i> Застосовано!';
      applyBtn.style.background = 'var(--accent-2)';
      lucide.createIcons();
      setTimeout(() => {
        applyBtn.innerHTML = '<i data-lucide="check"></i> Застосувати фільтри';
        applyBtn.style.background = '';
        lucide.createIcons();
      }, 1500);
    });
  }

  // Кнопка скидання фільтрів
  const resetBtn = $('#reset-filters-btn');
  if(resetBtn) {
    resetBtn.addEventListener('click', () => {
      // Скидаємо до значень за замовчуванням
      state.filters = {
        radius: 2500,
        keyword: '',
        minRating: 0,
        minReviews: 0,
        openNow: false,
        sortBy: 'distance'
      };
      
      saveFilters();
      
      // Оновлюємо UI
      if(state.activeTab === 'explore') {
        const root = $('#root');
        if(root) {
          root.innerHTML = exploreTabHTML();
          afterExploreMount();
        }
      }
      
      // Застосовуємо скинуті фільтри
      if(state.userPos && state.placesRaw.length > 0) {
        applyFilters();
      } else if(state.userPos) {
        searchNearbyWithFilters();
      }
    });
  }
}

function afterExploreMount(){
  lucide.createIcons();
  
  // Прив'язка фільтрів
  bindFilters();
  
  // Застосовуємо фільтри при першому відкритті (тільки якщо є дані для фільтрації)
  // Перевіряємо, чи потрібно застосувати фільтри
  if(state.placesRaw.length > 0) {
    const filtered = applyFiltersInternal();
    const currentIds = state.places.map(p => p.place_id).sort().join(',');
    const filteredIds = filtered.map(p => p.place_id).sort().join(',');
    if(currentIds !== filteredIds) {
      // Фільтри змінили результати, оновлюємо
      state.places = filtered;
      // Оновлюємо тільки grid, не весь HTML
      const grid = $('.grid');
      if(grid) {
        grid.innerHTML = state.places.length > 0 ? state.places.map(p=>`
          <div class="tile" data-id="${p.place_id}">
            <div class="tile-img" style="background-image:url('${placePhoto(p, 800)}')">
              <button class="tile-fav-btn" data-id="${p.place_id}" onclick="event.stopPropagation()">
                <i data-lucide="heart" style="width:20px;height:20px"></i>
              </button>
              <div class="tile-overlay" data-place-id="${p.place_id}">
                <div class="tile-actions">
                  ${(p.website || state.placeDetails[p.place_id]?.data?.website) ? `
                  <a href="#" class="tile-action-btn" data-action="website" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                    <i data-lucide="globe"></i> Сайт
                  </a>
                  ` : ''}
                  ${(p.website || state.placeDetails[p.place_id]?.data?.website) ? `
                  <a href="#" class="tile-action-btn" data-action="menu" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                    <i data-lucide="utensils"></i> Меню
                  </a>
                  ` : ''}
                  <a href="#" class="tile-action-btn" data-action="route" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                    <i data-lucide="navigation"></i> Маршрут
                  </a>
                  <a href="#" class="tile-action-btn" data-action="maps" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                    <i data-lucide="map"></i> В Google Maps
                  </a>
                  <a href="javascript:void(0)" class="tile-action-btn" data-action="review" data-place-id="${p.place_id}">
                    <i data-lucide="star"></i> Відгук
                  </a>
                </div>
              </div>
            </div>
            <div class="tile-body">
              <div class="row">
                <h3 class="tile-title">${p.name}</h3>
                <div class="rating" title="Рейтинг закладу"><i data-lucide="star" style="width:16px;height:16px"></i> <span style="font-weight:600">${fmtRating(p.rating)}</span></div>
              </div>
              <div class="meta"><i data-lucide="map-pin"></i><span>${p.vicinity || p.formatted_address || '—'}</span></div>
              ${p.distance !== undefined ? `<div class="meta"><i data-lucide="navigation"></i><span>${p.distance < 1 ? Math.round(p.distance * 1000) + ' м' : p.distance.toFixed(1) + ' км'} від вас</span></div>` : ''}
              <div class="meta"><i data-lucide="clock"></i><span>${getHoursStatus(p)}</span></div>
            </div>
          </div>`).join('') : `
          <div class="empty" style="grid-column: 1 / -1">
            <i data-lucide="coffee" class="icon"></i>
            <h3 style="margin:0 0 8px">Не знайдено кав'ярень</h3>
            <p style="color:#838c8b">Спробуйте змінити фільтри</p>
          </div>
        `;
        lucide.createIcons();
        // Повторно прив'язуємо обробники для нових плиток
        bindTileHandlers();
      }
      if(state.map) {
        drawPlaceMarkers(filtered);
      }
    }
  }
  
  // Фокусування на потрібній плитці (якщо перейшли з "Карти" або "Улюблених")
  if(state.focusedPlaceId) {
    setTimeout(() => {
      const tile = $(`[data-id="${state.focusedPlaceId}"]`);
      if(tile) {
        // Скролимо до плитки
        tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Додаємо виділення
        tile.classList.add('focused');
        // Після анімації залишаємо помітне виділення ще на 3 секунди
        setTimeout(() => {
          tile.classList.remove('focused');
          // Додаємо постійне виділення
          tile.style.border = '2px solid var(--accent)';
          tile.style.boxShadow = '0 4px 16px rgba(115,75,52,.2)';
          setTimeout(() => {
            tile.style.border = '';
            tile.style.boxShadow = '';
          }, 3000);
        }, 2000);
      }
      state.focusedPlaceId = null;
    }, 300);
  }
  
  // кнопка сердечка -> додати в улюблені
  $$('.tile-fav-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const p = state.places.find(x=>x.place_id===id);
      if(p){ 
        addToFavorites(p); 
        showToast();
        // візуальний фідбек
        btn.style.background = 'var(--accent)';
        btn.style.color = '#fff';
      }
    });
  });

  // Прив'язуємо обробники для плиток
  bindTileHandlers();
}

function bindTileHandlers() {
  // Hover-оверлей та обробка дій
  $$('.tile').forEach(tile => {
    const placeId = tile.dataset.id;
    const overlay = tile.querySelector('.tile-overlay');
    const place = state.places.find(p => p.place_id === placeId);
    
    if(!overlay || !place) return;

    let isHovered = false;
    let detailsLoaded = false;

    // Desktop hover
    tile.addEventListener('mouseenter', () => {
      if(window.innerWidth > 768) {
        isHovered = true;
        overlay.classList.add('active');
        if(!detailsLoaded) {
          // Спочатку налаштовуємо базові посилання для миттєвого відгуку
          updateTileActionsBasic(placeId, place);
          // Потім завантажуємо деталі та оновлюємо
          fetchPlaceDetails(placeId, (details) => {
            if(details) {
              updateTileActions(placeId, place, details);
            }
            detailsLoaded = true;
          });
        }
      }
    });

    tile.addEventListener('mouseleave', () => {
      if(window.innerWidth > 768) {
        isHovered = false;
        overlay.classList.remove('active');
      }
    });

    // Mobile tap
    let tapCount = 0;
    tile.addEventListener('click', (e) => {
      if(window.innerWidth <= 768) {
        e.preventDefault();
        tapCount++;
        if(tapCount === 1) {
          setTimeout(() => {
            if(tapCount === 1) {
              // Одиночний тап - відкрити оверлей
              overlay.classList.toggle('active');
              if(!detailsLoaded) {
                // Спочатку налаштовуємо базові посилання для миттєвого відгуку
                updateTileActionsBasic(placeId, place);
                // Потім завантажуємо деталі та оновлюємо
                fetchPlaceDetails(placeId, (details) => {
                  if(details) {
                    updateTileActions(placeId, place, details);
                  }
                  detailsLoaded = true;
                });
              }
            }
            tapCount = 0;
          }, 300);
        } else {
          // Подвійний тап - закрити
          overlay.classList.remove('active');
          tapCount = 0;
        }
      }
    });
  });

  // Обробка дій в оверлеї
  $$('.tile-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const action = btn.dataset.action;
      const placeId = btn.dataset.placeId;
      
      // Для action 'review' обробляємо одразу, не шукаючи place в state.places
      if(action === 'review') {
        // Шукаємо місце в різних джерелах
        let place = state.places.find(p => p.place_id === placeId);
        if(!place) {
          place = state.placesRaw.find(p => p.place_id === placeId);
        }
        if(!place) {
          // Якщо не знайдено, створюємо мінімальний об'єкт з даних з кнопки
          const tile = btn.closest('.tile');
          if(tile) {
            const tileTitle = tile.querySelector('.tile-title');
            const tileMeta = tile.querySelectorAll('.meta');
            place = {
              place_id: placeId,
              name: tileTitle?.textContent || 'Кав\'ярня',
              vicinity: tileMeta[0]?.textContent || ''
            };
          }
        }
        if(place) {
          handleTileAction('review', place, btn);
        } else {
          console.warn('Place not found for review:', placeId);
        }
        return;
      }
      
      const place = state.places.find(p => p.place_id === placeId);
      if(!place) return;

      // Якщо посилання вже встановлене і це не Google пошук, просто переходимо
      if(btn.href && btn.href !== '#' && btn.href !== 'javascript:void(0)' && btn.href !== window.location.href && !btn.href.includes('google.com/search')) {
        window.open(btn.href, '_blank');
        return;
      }

      // Для "Сайт" та "Меню" спочатку завантажуємо деталі, якщо їх ще немає
      if((action === 'website' || action === 'menu') && !place.website && !state.placeDetails[placeId]) {
        // Показуємо індикатор завантаження
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" style="width:16px;height:16px"></i> Завантаження...';
        btn.disabled = true;
        lucide.createIcons();
        
        // Завантажуємо деталі
        await new Promise((resolve) => {
          fetchPlaceDetails(placeId, (details) => {
            if(details) {
              updateTileActions(placeId, place, details);
              // Оновлюємо посилання на кнопці
              const updatedBtn = $(`.tile-action-btn[data-action="${action}"][data-place-id="${placeId}"]`);
              if(updatedBtn && updatedBtn.href && updatedBtn.href !== '#' && !updatedBtn.href.includes('google.com/search')) {
                window.open(updatedBtn.href, '_blank');
              } else {
                // Якщо сайту немає, використовуємо handleTileAction
                handleTileAction(action, place, updatedBtn || btn);
              }
            } else {
              // Якщо деталі не завантажилися, використовуємо базову логіку
              handleTileAction(action, place, btn);
            }
            btn.innerHTML = originalText;
            btn.disabled = false;
            lucide.createIcons();
            resolve();
          });
        });
        return;
      }

      // Інакше обробляємо дію
      handleTileAction(action, place, btn);
    });
  });
}

// Базова настройка посилань без деталей
function updateTileActionsBasic(placeId, place) {
  const overlay = $(`.tile-overlay[data-place-id="${placeId}"]`);
  if(!overlay) return;

  const websiteBtn = overlay.querySelector('[data-action="website"]');
  const menuBtn = overlay.querySelector('[data-action="menu"]');
  const routeBtn = overlay.querySelector('[data-action="route"]');
  const mapsBtn = overlay.querySelector('[data-action="maps"]');

  // Сайт - приховуємо, якщо немає website (буде показано після завантаження деталей)
  if(websiteBtn) {
    if(place.website || state.placeDetails[placeId]?.data?.website) {
      websiteBtn.href = place.website || state.placeDetails[placeId].data.website;
      websiteBtn.style.display = 'flex';
    } else {
      websiteBtn.style.display = 'none';
    }
    websiteBtn.target = '_blank';
  }

  // Меню - приховуємо, якщо немає website (буде показано після завантаження деталей)
  if(menuBtn) {
    if(place.website || state.placeDetails[placeId]?.data?.website) {
      menuBtn.href = place.website || state.placeDetails[placeId].data.website;
      menuBtn.style.display = 'flex';
    } else {
      menuBtn.style.display = 'none';
    }
    menuBtn.target = '_blank';
  }

  // Маршрут
  if(routeBtn && place.geometry) {
    const dest = place.geometry.location;
    routeBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${state.userPos.lat},${state.userPos.lng}&destination=${dest.lat()},${dest.lng()}&travelmode=walking`;
    routeBtn.target = '_blank';
  }

  // Google Maps
  if(mapsBtn) {
    mapsBtn.href = `https://www.google.com/maps/search/?api=1&query=place_id:${placeId}`;
    mapsBtn.target = '_blank';
  }
}

function updateTileActions(placeId, place, details) {
  const overlay = $(`.tile-overlay[data-place-id="${placeId}"]`);
  if(!overlay) return;

  // Оновлюємо посилання
  const websiteBtn = overlay.querySelector('[data-action="website"]');
  const menuBtn = overlay.querySelector('[data-action="menu"]');
  const routeBtn = overlay.querySelector('[data-action="route"]');
  const mapsBtn = overlay.querySelector('[data-action="maps"]');

  // Сайт - показуємо тільки якщо є website
  if(websiteBtn) {
    if(details.website) {
      websiteBtn.href = details.website;
      websiteBtn.style.display = 'flex';
      // Зберігаємо дані для швидкого доступу
      place.website = details.website;
    } else {
      // Приховуємо кнопку, якщо немає сайту
      websiteBtn.style.display = 'none';
      place.website = null;
    }
    websiteBtn.target = '_blank';
  }

  // Меню - показуємо тільки якщо є website
  if(menuBtn) {
    if(details.website) {
      menuBtn.href = details.website;
      menuBtn.style.display = 'flex';
    } else {
      // Приховуємо кнопку, якщо немає сайту
      menuBtn.style.display = 'none';
    }
    menuBtn.target = '_blank';
  }

  // Маршрут
  if(routeBtn && place.geometry) {
    const dest = place.geometry.location;
    routeBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${state.userPos.lat},${state.userPos.lng}&destination=${dest.lat()},${dest.lng()}&travelmode=walking`;
    routeBtn.target = '_blank';
  }

  // Google Maps
  if(mapsBtn) {
    if(details.url) {
      mapsBtn.href = details.url;
      place.url = details.url;
    } else {
      mapsBtn.href = `https://www.google.com/maps/search/?api=1&query=place_id:${placeId}`;
    }
    mapsBtn.target = '_blank';
  }
}

function handleTileAction(action, place, btn) {
  switch(action) {
    case 'website':
      // Сайт закладу - перевіряємо кеш деталей
      const cachedWebsite = state.placeDetails[place.place_id];
      if(cachedWebsite && cachedWebsite.data && cachedWebsite.data.website) {
        window.open(cachedWebsite.data.website, '_blank');
      } else if(place.website) {
        window.open(place.website, '_blank');
      } else {
        // Якщо немає сайту, шукаємо в Google
        window.open(`https://www.google.com/search?q=${encodeURIComponent(place.name)}`, '_blank');
      }
      break;
    case 'menu':
      // Меню закладу - перевіряємо кеш деталей
      const cachedMenu = state.placeDetails[place.place_id];
      if(cachedMenu && cachedMenu.data && cachedMenu.data.website) {
        window.open(cachedMenu.data.website, '_blank');
      } else if(place.website) {
        window.open(place.website, '_blank');
      } else {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(place.name + ' menu')}`, '_blank');
      }
      break;
    case 'route':
      // Маршрут до закладу
      if(place.geometry && place.geometry.location) {
        const dest = place.geometry.location;
        const url = `https://www.google.com/maps/dir/?api=1&origin=${state.userPos.lat},${state.userPos.lng}&destination=${dest.lat()},${dest.lng()}&travelmode=walking`;
        window.open(url, '_blank');
      }
      break;
    case 'maps':
      // Відкрити в Google Maps
      if(place.url) {
        window.open(place.url, '_blank');
      } else {
        const url = `https://www.google.com/maps/search/?api=1&query=place_id:${place.place_id}`;
        window.open(url, '_blank');
      }
      break;
    case 'review':
      // Залишити відгук - перекидаємо на вкладку відгуків
      if(state.user && state.token) {
        navigateToReviewsForPlace(place);
      } else {
        showToast('⚠️ Увійдіть до акаунту, щоб залишити відгук');
        // Перемикаємо на вкладку профілю
        setTimeout(() => {
          $$('.nav-btn').forEach(b => b.classList.remove('active'));
          const profileBtn = $$('.nav-btn').find(b => b.dataset.tab === 'profile');
          if(profileBtn) {
            profileBtn.classList.add('active');
            state.activeTab = 'profile';
            render();
          }
        }, 500);
      }
      break;
  }
}

// ====== TAB: REVIEWS / PROFILE ======
// ====== TAB: REVIEWS ======
function reviewsTabHTML(){
  return `
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="h2">Відгуки</h2>
        <p class="sub">Всі відгуки користувачів про кав'ярні</p>
      </div>
    </div>

    ${!state.user || !state.token ? `
    <div style="background:rgba(115,75,52,0.1);padding:12px 16px;border-radius:12px;margin-bottom:24px;font-size:14px;color:var(--accent);display:flex;align-items:center;gap:8px">
      <i data-lucide="info" style="width:18px;height:18px"></i>
      <span>Увійдіть до акаунту, щоб ставити лайки та залишати відгуки</span>
    </div>
    ` : ''}

    <div id="reviews-list" class="reviews-list">
      <div class="center" style="padding:48px">
        <i data-lucide="loader-2" class="big-icon" style="animation:spin 1s linear infinite"></i>
        <p style="color:var(--muted)">Завантаження відгуків...</p>
      </div>
    </div>
  </div>`;
}

function reviewCardHTML(review) {
  const avatarUrl = review.user?.avatar_url ? `${state.apiUrl.replace('/api', '')}${review.user.avatar_url}` : null;
  const date = new Date(review.created_at);
  const formattedDate = date.toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
  const isUpdated = review.updated_at && review.updated_at !== review.created_at;
  const isOwnReview = state.user && review.user?.id === state.user.id;
  const likesCount = review.likes_count || 0;
  const isLiked = review.is_liked || false;
  
  // Try to get place photo from cached place details
  let placeImg = '';
  if(review.place_id && state.placeDetails[review.place_id]?.data) {
    try {
      placeImg = placePhoto(state.placeDetails[review.place_id].data, 300);
    } catch(e) {
      placeImg = placeholderImg();
    }
  } else {
    placeImg = placeholderImg();
  }

  return `
    <div class="review-card" data-review-id="${review.id}">
      <div class="review-header">
        <div class="review-user">
          <div class="review-avatar-icon-small">
            <i data-lucide="coffee" style="width:28px;height:28px"></i>
          </div>
          <div>
            <div class="review-user-name">${review.user?.name || 'Користувач'}</div>
            <div class="review-date">${formattedDate}${isUpdated ? ' (оновлено)' : ''}</div>
          </div>
        </div>
        <div class="review-rating">
          ${Array.from({length: 5}, (_, i) => 
            `<i data-lucide="${i < review.rating ? 'star' : 'star'}" class="star-icon ${i < review.rating ? 'filled' : ''}"></i>`
          ).join('')}
          <span class="rating-value">${review.rating}</span>
        </div>
      </div>
      <div class="review-place">
        <img class="review-place-photo" src="${placeImg}" alt="Фото закладу" />
        <i data-lucide="map-pin" style="width:16px;height:16px"></i>
        <span>${review.place_name || 'Кав\'ярня'}</span>
        ${review.place_id ? `
        <button class="btn-link" data-go-to-place="${review.place_id}" title="Перейти до кав'ярні">
          <i data-lucide="arrow-right" style="width:14px;height:14px"></i> Перейти
        </button>
        ` : ''}
      </div>
      ${review.comment ? `
      <div class="review-comment">${escapeHtml(review.comment)}</div>
      ` : ''}
      <div class="review-actions">
        ${state.user && state.token ? `
        <button class="btn btn-outline btn-sm ${isLiked ? 'liked' : ''}" data-like-review="${review.id}" title="${isLiked ? 'Прибрати лайк' : 'Поставити лайк'}">
          <i data-lucide="${isLiked ? 'heart' : 'heart'}" style="width:16px;height:16px;${isLiked ? 'fill:currentColor' : ''}"></i>
          <span>${likesCount}</span>
        </button>
        ` : ''}
        ${isOwnReview ? `
        <button class="btn btn-outline btn-sm" data-edit-review="${review.id}">
          <i data-lucide="edit"></i> Редагувати
        </button>
        <button class="btn btn-outline btn-sm btn-danger" data-delete-review="${review.id}">
          <i data-lucide="trash-2"></i> Видалити
        </button>
        ` : ''}
      </div>
    </div>
  `;
}

function reviewFormHTML(place = null, review = null) {
  const isEdit = !!review;
  const placeName = place?.name || review?.place_name || '';
  const placeId = place?.place_id || review?.place_id || '';
  const rating = review?.rating || 0;
  const comment = review?.comment || '';

  return `
    <div class="review-form-modal" id="review-form-modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${isEdit ? 'Редагувати відгук' : 'Додати відгук'}</h3>
          <button class="modal-close" id="close-review-form">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form id="review-form">
          ${!place ? `
          <div class="form-group">
            <label class="form-label">Назва кав'ярні</label>
            <input type="text" class="form-input" id="review-place-name" value="${placeName}" placeholder="Введіть назву кав'ярні" required>
          </div>
          <div class="form-group">
            <label class="form-label">ID місця (Google Places)</label>
            <input type="text" class="form-input" id="review-place-id" value="${placeId}" placeholder="Опціонально">
          </div>
          ` : `
          <div class="form-group">
            <label class="form-label">Кав'ярня</label>
            <div class="review-place-preview">
              <i data-lucide="map-pin" style="width:18px;height:18px"></i>
              <span>${placeName}</span>
            </div>
            <input type="hidden" id="review-place-id" value="${placeId}">
            <input type="hidden" id="review-place-name" value="${placeName}">
          </div>
          `}
          <div class="form-group">
            <label class="form-label">Рейтинг</label>
            <div class="rating-input" id="rating-input">
              ${Array.from({length: 5}, (_, i) => 
                `<button type="button" class="star-btn ${i < rating ? 'active' : ''}" data-rating="${i + 1}">
                  <i data-lucide="star" style="width:32px;height:32px"></i>
                </button>`
              ).join('')}
            </div>
            <input type="hidden" id="review-rating" value="${rating}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Коментар</label>
            <textarea class="form-input" id="review-comment" rows="4" placeholder="Залиште свій відгук про кав'ярню...">${comment}</textarea>
          </div>
          <div class="form-error" id="review-form-error"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-outline" id="cancel-review-form">Скасувати</button>
            <button type="submit" class="btn btn-pill">
              <i data-lucide="check"></i> ${isEdit ? 'Зберегти зміни' : 'Опублікувати відгук'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function afterReviewsMount() {
  lucide.createIcons();
  
  // Якщо є місце для відгуку (перехід з інших вкладок), відкриваємо форму
  if(state.reviewPlace) {
    if(state.user && state.token) {
      const place = state.reviewPlace;
      state.reviewPlace = null; // Очищаємо після використання
      // Затримка для завершення рендерингу та завантаження відгуків
      setTimeout(() => {
        showReviewForm(place);
      }, 300);
    } else {
      // Якщо є місце для відгуку, але користувач не авторизований
      showToast('⚠️ Увійдіть до акаунту, щоб залишити відгук');
      state.reviewPlace = null; // Очищаємо
      // Перемикаємо на вкладку профілю
      setTimeout(() => {
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        const profileBtn = $$('.nav-btn').find(b => b.dataset.tab === 'profile');
        if(profileBtn) {
          profileBtn.classList.add('active');
          state.activeTab = 'profile';
          render();
        }
      }, 500);
    }
  }

  // Завантажуємо всі відгуки
  loadAllReviews();
}

async function loadAllReviews() {
  const listEl = $('#reviews-list');
  if(!listEl) return;

  try {
    const data = await getReviews(); // Отримуємо всі відгуки
    const reviews = data.reviews || [];

    if(reviews.length === 0) {
      listEl.innerHTML = `
        <div class="empty" style="grid-column: 1 / -1">
          <i data-lucide="star" class="icon"></i>
          <h3 style="margin:0 0 8px">Немає відгуків</h3>
          <p style="color:#838c8b">Поки що ніхто не залишив відгуків. Будьте першим!</p>
        </div>
      `;
      lucide.createIcons();
    } else {
      listEl.innerHTML = reviews.map(review => reviewCardHTML(review)).join('');
      lucide.createIcons();
      bindReviewActions();
      // Fetch place details (photos) for reviews if missing, then refresh once
      const missing = [...new Set(reviews.filter(r => r.place_id).map(r => r.place_id))]
        .filter(pid => !state.placeDetails[pid]);
      if(missing.length > 0 && state.map) {
        let done = 0;
        missing.forEach(pid => {
          fetchPlaceDetails(pid, () => {
            done++;
            if(done === missing.length) {
              // Re-render reviews to show photos
              loadAllReviews();
            }
          });
        });
      }
    }
  } catch(error) {
    console.error('Помилка завантаження відгуків:', error);
    listEl.innerHTML = `
      <div class="empty" style="grid-column: 1 / -1">
        <i data-lucide="alert-circle" class="icon"></i>
        <h3 style="margin:0 0 8px">Помилка завантаження</h3>
        <p style="color:#838c8b">${error.message || 'Не вдалося завантажити відгуки'}</p>
      </div>
    `;
    lucide.createIcons();
  }
}

function bindReviewActions() {
  // Лайк відгуку
  $$('[data-like-review]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reviewId = btn.getAttribute('data-like-review');
      if(!state.user || !state.token) {
        showToast('⚠️ Увійдіть до акаунту, щоб ставити лайки');
        return;
      }
      try {
        await toggleReviewLike(reviewId);
        loadAllReviews(); // Перезавантажуємо відгуки
      } catch(error) {
        showToast(`❌ ${error.message || 'Помилка'}`);
      }
    });
  });

  // Перехід до кав'ярні
  $$('[data-go-to-place]').forEach(btn => {
    btn.addEventListener('click', () => {
      const placeId = btn.getAttribute('data-go-to-place');
      navigateToExploreForPlace(placeId);
    });
  });

  // Редагування відгуку (тільки свої)
  $$('[data-edit-review]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reviewId = btn.getAttribute('data-edit-review');
      try {
        const data = await getReviews();
        const review = data.reviews?.find(r => r.id == reviewId);
        if(review) {
          const reviewPlace = review.place_id ? { place_id: review.place_id, name: review.place_name } : null;
          showReviewForm(reviewPlace, review);
        }
      } catch(error) {
        showToast(`❌ ${error.message || 'Помилка завантаження відгуку'}`);
      }
    });
  });

  // Видалення відгуку (тільки свої)
  $$('[data-delete-review]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reviewId = btn.getAttribute('data-delete-review');
      const confirmed = await confirmDialog(
        'Цю дію не можна скасувати, але ви зможете залишити новий відгук пізніше.',
        { title: 'Видалити відгук?', confirmText: 'Видалити', cancelText: 'Скасувати', icon: 'trash-2' }
      );
      if(!confirmed) return;

      try {
        await deleteReview(reviewId);
        showToast('✅ Відгук видалено');
        loadAllReviews();
      } catch(error) {
        showToast(`❌ ${error.message || 'Помилка видалення відгуку'}`);
      }
    });
  });
}

function showReviewForm(place = null, review = null) {
  const modal = document.createElement('div');
  modal.innerHTML = reviewFormHTML(place, review);
  document.body.appendChild(modal);
  lucide.createIcons();

  const modalEl = $('#review-form-modal');
  const form = $('#review-form');
  const ratingInput = $('#rating-input');
  const ratingValue = $('#review-rating');
  const closeBtn = $('#close-review-form');
  const cancelBtn = $('#cancel-review-form');

  // Обробка рейтингу
  if(ratingInput) {
    $$('.star-btn', ratingInput).forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const rating = index + 1;
        ratingValue.value = rating;
        $$('.star-btn', ratingInput).forEach((b, i) => {
          b.classList.toggle('active', i < rating);
        });
        lucide.createIcons();
      });
    });
  }

  // Закриття модального вікна
  const closeModal = () => {
    modal.remove();
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modalEl?.addEventListener('click', (e) => {
    if(e.target === modalEl) closeModal();
  });

  // Відправка форми
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('#review-form-error');
    if(errorEl) errorEl.textContent = '';

    const placeId = $('#review-place-id')?.value.trim();
    const placeName = $('#review-place-name')?.value.trim();
    const rating = parseInt(ratingValue?.value || '0');
    const comment = $('#review-comment')?.value.trim();

    if(!placeName) {
      if(errorEl) errorEl.textContent = 'Введіть назву кав\'ярні';
      return;
    }

    if(!rating || rating < 1 || rating > 5) {
      if(errorEl) errorEl.textContent = 'Оберіть рейтинг від 1 до 5';
      return;
    }

    try {
      await createReview(placeId || null, placeName, rating, comment || null);
      showToast('✅ Відгук збережено!');
      closeModal();
      loadAllReviews();
    } catch(error) {
      if(errorEl) {
        errorEl.textContent = error.message || 'Помилка збереження відгуку';
      }
    }
  });
}
function profileTabHTML(){
  // Якщо користувач не авторизований, показуємо форми реєстрації/логіну
  if(!state.user || !state.token) {
    return authFormsHTML();
  }
  
  // Якщо авторизований, показуємо профіль
  return profileViewHTML();
}

function authFormsHTML() {
  return `
  <div class="page">
    <div class="auth-container">
      <div class="auth-tabs">
        <button class="auth-tab active" data-auth-mode="login">Вхід</button>
        <button class="auth-tab" data-auth-mode="register">Реєстрація</button>
      </div>

      <!-- Форма входу -->
      <div class="auth-form active" id="login-form">
        <h2 class="auth-title">Вхід до акаунту</h2>
        <form id="login-form-element" onsubmit="handleLogin(event)">
          <div class="form-group">
            <label class="form-label">Email або нікнейм</label>
            <input type="text" class="form-input" id="login-email" required placeholder="your@email.com або username">
            <div class="form-hint" style="font-size:12px;color:var(--muted);margin-top:4px">Можна ввести email або нікнейм</div>
          </div>
          <div class="form-group">
            <label class="form-label">Пароль</label>
            <input type="password" class="form-input" id="login-password" required placeholder="••••••••">
          </div>
          <div class="form-error" id="login-error"></div>
          <button type="submit" class="btn btn-pill" style="width:100%;margin-top:8px">
            <i data-lucide="log-in"></i> Увійти
          </button>
        </form>
      </div>

      <!-- Форма реєстрації -->
      <div class="auth-form" id="register-form">
        <h2 class="auth-title">Створення акаунту</h2>
        <form id="register-form-element" onsubmit="handleRegister(event)">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Ім'я</label>
              <input type="text" class="form-input" id="register-name" placeholder="Ім'я">
            </div>
            <div class="form-group">
              <label class="form-label">Прізвище</label>
              <input type="text" class="form-input" id="register-surname" placeholder="Прізвище">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Нікнейм <span class="required">*</span></label>
            <input type="text" class="form-input" id="register-nickname" required placeholder="username">
            <div class="form-hint" id="nickname-hint"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Email <span class="required">*</span></label>
            <input type="email" class="form-input" id="register-email" required placeholder="your@email.com">
          </div>
          <div class="form-group">
            <label class="form-label">Пароль <span class="required">*</span></label>
            <input type="password" class="form-input" id="register-password" required placeholder="••••••••" minlength="6">
            <div class="form-hint">Мінімум 6 символів</div>
          </div>
          <div class="form-error" id="register-error"></div>
          <button type="submit" class="btn btn-pill" style="width:100%;margin-top:8px">
            <i data-lucide="user-plus"></i> Зареєструватися
          </button>
        </form>
      </div>
    </div>
  </div>`;
}

function profileViewHTML() {
  const user = state.user;
  const isEditing = state.profileEditing || false;
  
  /* 
   * РОЗТАШУВАННЯ ЕЛЕМЕНТІВ НА ВКЛАДЦІ ПРОФІЛЬ:
   * 
   * ┌─────────────────────────────────────────┐
   * │  profile-header                          │
   * │  ┌──────────────┐  ┌─────────────────┐  │
   * │  │ avatar-icon  │  │ Кнопки дій      │  │
   * │  │ (чашка кави) │  │ (Редагувати/    │  │
   * │  │              │  │  Вийти)         │  │
   * │  │ Ім'я         │  └─────────────────┘  │
   * │  │ @нікнейм    │                       │
   * │  └──────────────┘                       │
   * └─────────────────────────────────────────┘
   * 
   * ┌─────────────────────────────────────────┐
   * │  profile-content                         │
   * │  ┌───────────────────────────────────┐  │
   * │  │ profile-section (Особисті дані)    │  │
   * │  │ ┌──────┐ ┌──────┐ ┌──────┐       │  │
   * │  │ │ Ім'я │ │Прізв.│ │Нікн. │       │  │
   * │  │ └──────┘ └──────┘ └──────┘       │  │
   * │  │ ┌──────┐                        │  │
   * │  │ │Email │                        │  │
   * │  │ └──────┘                        │  │
   * │  └───────────────────────────────────┘  │
   * │  ┌───────────────────────────────────┐  │
   * │  │ profile-section (Статистика)      │  │
   * │  │ ┌────────┐ ┌────────┐            │  │
   * │  │ │Улюблені│ │Дата    │            │  │
   * │  │ │місця   │ │реєстр. │            │  │
   * │  │ └────────┘ └────────┘            │  │
   * │  └───────────────────────────────────┘  │
   * └─────────────────────────────────────────┘
   */
  
  return `
  <div class="page">
    <div class="profile-container">
      <div class="profile-header">
        <div class="profile-avatar-section">
          <div class="profile-avatar-icon">
            <i data-lucide="coffee" style="width:80px;height:80px"></i>
          </div>
          <h2 class="profile-name">${(user.name || '') + ' ' + (user.surname || '') || 'Користувач'}</h2>
          <div class="profile-nickname-display">
            <i data-lucide="at-sign" style="width:16px;height:16px"></i>
            <span class="profile-nickname-text">${user.nickname || 'nickname'}</span>
          </div>
        </div>
        <div class="profile-header-actions">
          ${!isEditing ? `
          <button class="btn btn-pill" id="edit-profile-btn">
            <i data-lucide="edit"></i> Редагувати профіль
          </button>
          ` : ''}
          <button class="btn btn-outline" id="logout-btn" onclick="handleLogout()">
            <i data-lucide="log-out"></i> Вийти
          </button>
        </div>
      </div>

      <div class="profile-content">
        ${!isEditing ? `
        <!-- Режим перегляду -->
        <div class="profile-section">
          <h3 class="section-title">Особисті дані</h3>
          <div class="profile-info-grid">
            <div class="profile-info-item">
              <div class="profile-info-label">Ім'я</div>
              <div class="profile-info-value">${user.name || '—'}</div>
            </div>
            <div class="profile-info-item">
              <div class="profile-info-label">Прізвище</div>
              <div class="profile-info-value">${user.surname || '—'}</div>
            </div>
            <div class="profile-info-item">
              <div class="profile-info-label">Нікнейм</div>
              <div class="profile-info-value">@${user.nickname || '—'}</div>
            </div>
            <div class="profile-info-item">
              <div class="profile-info-label">Email</div>
              <div class="profile-info-value">${user.email || '—'}</div>
            </div>
          </div>
        </div>
        ` : `
        <!-- Режим редагування -->
        <div class="profile-section">
          <h3 class="section-title">Редагування профілю</h3>
          <form id="profile-edit-form" onsubmit="handleProfileUpdate(event)">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Ім'я</label>
                <input type="text" class="form-input" id="profile-name" value="${user.name || ''}" placeholder="Ім'я">
              </div>
              <div class="form-group">
                <label class="form-label">Прізвище</label>
                <input type="text" class="form-input" id="profile-surname" value="${user.surname || ''}" placeholder="Прізвище">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Нікнейм <span class="required">*</span></label>
              <input type="text" class="form-input" id="profile-nickname" value="${user.nickname || ''}" required placeholder="username">
              <div class="form-hint" id="profile-nickname-hint"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Email <span class="required">*</span></label>
              <input type="email" class="form-input" id="profile-email" value="${user.email || ''}" required placeholder="your@email.com">
            </div>
            <div class="form-error" id="profile-error"></div>
            <div class="form-actions" style="margin-top:24px">
              <button type="button" class="btn btn-outline" id="cancel-edit-profile-btn">
                Скасувати
              </button>
              <button type="submit" class="btn btn-pill">
                <i data-lucide="save"></i> Зберегти зміни
              </button>
            </div>
          </form>
        </div>
        `}

        <div class="profile-section">
          <h3 class="section-title">Статистика</h3>
          <div class="stats-grid">
            <div class="stat-card">
              <i data-lucide="heart" class="stat-icon"></i>
              <div class="stat-value">${state.favorites.length}</div>
              <div class="stat-label">Улюблених місць</div>
            </div>
            <div class="stat-card">
              <i data-lucide="calendar" class="stat-icon"></i>
              <div class="stat-value">${user.created_at ? new Date(user.created_at).toLocaleDateString('uk-UA') : '—'}</div>
              <div class="stat-label">Дата реєстрації</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function afterProfileMount() {
  lucide.createIcons();
  
  // Якщо не авторизований, налаштовуємо перемикання між формами
  if(!state.user || !state.token) {
    bindAuthTabs();
    return;
  }
  
  // Якщо авторизований, налаштовуємо обробники профілю
  bindProfileHandlers();
  
  // Кнопка редагування профілю
  const editBtn = $('#edit-profile-btn');
  if(editBtn) {
    editBtn.addEventListener('click', () => {
      state.profileEditing = true;
      render();
    });
  }
  
  // Кнопка скасування редагування
  const cancelBtn = $('#cancel-edit-profile-btn');
  if(cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.profileEditing = false;
      render();
    });
  }
}

function bindAuthTabs() {
  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.authMode;
      
      // Оновлюємо активні таби
      $$('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Показуємо відповідну форму
      $$('.auth-form').forEach(f => f.classList.remove('active'));
      $(`#${mode}-form`).classList.add('active');
      
      // Очищаємо помилки
      $$('.form-error').forEach(e => e.textContent = '');
    });
  });
  
  // Перевірка нікнейму при реєстрації
  const registerNickname = $('#register-nickname');
  if(registerNickname) {
    const debouncedCheck = debounce(async () => {
      const nickname = registerNickname.value.trim();
      const hint = $('#nickname-hint');
      if(!hint) return;
      
      if(nickname.length < 3) {
        hint.textContent = 'Мінімум 3 символи';
        hint.style.color = 'var(--muted)';
        return;
      }
      
      // Перевірка на англійські літери, цифри та підкреслення
      if(!/^[a-zA-Z0-9_]+$/.test(nickname)) {
        hint.textContent = 'Тільки англійські літери, цифри та _';
        hint.style.color = '#e74c3c';
        return;
      }
      
      const available = await checkNickname(nickname);
      if(available === true) {
        hint.textContent = '✓ Нікнейм доступний';
        hint.style.color = 'var(--accent)';
      } else if(available === false) {
        hint.textContent = '✗ Нікнейм вже зайнятий';
        hint.style.color = '#e74c3c';
      } else {
        // available === null - помилка мережі
        hint.textContent = '⚠ Не вдалося перевірити. Спробуйте пізніше.';
        hint.style.color = '#f39c12';
      }
    }, 500);
    
    registerNickname.addEventListener('input', debouncedCheck);
  }
}

function bindProfileHandlers() {
  // Перевірка нікнейму при зміні
  const nicknameInput = $('#profile-nickname');
  if(nicknameInput) {
    const debouncedCheck = debounce(async () => {
      const nickname = nicknameInput.value.trim();
      const hint = $('#profile-nickname-hint');
      if(!hint) return;
      
      if(nickname.length < 3) {
        hint.textContent = '';
        return;
      }
      
      // Перевірка на англійські літери, цифри та підкреслення
      if(!/^[a-zA-Z0-9_]+$/.test(nickname)) {
        hint.textContent = 'Тільки англійські літери, цифри та _';
        hint.style.color = '#e74c3c';
        return;
      }
      
      if(nickname === state.user.nickname) {
        hint.textContent = '';
        return;
      }
      
      const available = await checkNickname(nickname);
      if(available === true) {
        hint.textContent = '✓ Нікнейм доступний';
        hint.style.color = 'var(--accent)';
      } else if(available === false) {
        hint.textContent = '✗ Нікнейм вже зайнятий';
        hint.style.color = '#e74c3c';
      } else {
        // available === null - помилка мережі
        hint.textContent = '⚠ Не вдалося перевірити. Спробуйте пізніше.';
        hint.style.color = '#f39c12';
      }
    }, 500);
    
    nicknameInput.addEventListener('input', debouncedCheck);
  }
}

// Обробники подій (глобальні, щоб працювали з inline handlers)
window.handleLogin = async function(event) {
  event.preventDefault();
  const errorEl = $('#login-error');
  const identifier = $('#login-email').value.trim(); // Може бути email або nickname
  const password = $('#login-password').value;
  
  if(errorEl) errorEl.textContent = '';
  
  if(!identifier) {
    if(errorEl) errorEl.textContent = 'Введіть email або нікнейм';
    return;
  }
  
  try {
    const data = await loginUser(identifier, password);
    await saveAuth(data.token, data.user);
    // Завантажуємо повний профіль з аватаром
    try {
      const profileData = await getProfile();
      state.user = profileData.user;
      localStorage.setItem('user', JSON.stringify(profileData.user));
    } catch(e) {
      console.warn('Не вдалося завантажити профіль:', e);
    }
    showToast('✅ Успішний вхід!');
    render(); // Оновлюємо інтерфейс
  } catch(error) {
    if(errorEl) {
      // Показуємо зрозуміле повідомлення про помилку
      let errorMessage = 'Помилка входу';
      if(error.message) {
        errorMessage = error.message;
        // Якщо це помилка мережі, додаємо підказку
        if(error.message.includes('Failed to fetch') || error.message.includes('підключитися')) {
          errorMessage = 'Не вдалося підключитися до сервера. Перевірте, чи запущений сервер на http://localhost:3001';
        }
      }
      errorEl.textContent = errorMessage;
    }
    console.error('Помилка входу:', error);
  }
};

window.handleRegister = async function(event) {
  event.preventDefault();
  const errorEl = $('#register-error');
  const name = $('#register-name').value.trim();
  const surname = $('#register-surname').value.trim();
  const nickname = $('#register-nickname').value.trim();
  const email = $('#register-email').value.trim();
  const password = $('#register-password').value;
  
  if(errorEl) errorEl.textContent = '';
  
  // Валідація
  if(nickname.length < 3) {
    if(errorEl) errorEl.textContent = 'Нікнейм має бути мінімум 3 символи';
    return;
  }
  
  // Перевірка на англійські літери, цифри та підкреслення
  if(!/^[a-zA-Z0-9_]+$/.test(nickname)) {
    if(errorEl) errorEl.textContent = 'Нікнейм має містити тільки англійські літери, цифри та _';
    return;
  }
  
  if(password.length < 6) {
    if(errorEl) errorEl.textContent = 'Пароль має бути мінімум 6 символів';
    return;
  }
  
  try {
    const data = await registerUser({ name, surname, nickname, email, password });
    await saveAuth(data.token, data.user);
    // Завантажуємо повний профіль з аватаром
    try {
      const profileData = await getProfile();
      state.user = profileData.user;
      localStorage.setItem('user', JSON.stringify(profileData.user));
    } catch(e) {
      console.warn('Не вдалося завантажити профіль:', e);
    }
    showToast('✅ Реєстрація успішна!');
    render(); // Оновлюємо інтерфейс
  } catch(error) {
    if(errorEl) {
      // Показуємо зрозуміле повідомлення про помилку
      let errorMessage = 'Помилка реєстрації';
      if(error.message) {
        errorMessage = error.message;
        // Якщо це помилка мережі, додаємо підказку
        if(error.message.includes('Failed to fetch') || error.message.includes('підключитися')) {
          errorMessage = 'Не вдалося підключитися до сервера. Перевірте, чи запущений сервер на http://localhost:3001';
        }
      }
      errorEl.textContent = errorMessage;
    }
    console.error('Помилка реєстрації:', error);
  }
};

window.handleProfileUpdate = async function(event) {
  event.preventDefault();
  const errorEl = $('#profile-error');
  const name = $('#profile-name').value.trim();
  const surname = $('#profile-surname').value.trim();
  const nickname = $('#profile-nickname').value.trim();
  const email = $('#profile-email').value.trim();
  
  if(errorEl) errorEl.textContent = '';
  
  // Валідація нікнейму
  if(nickname.length < 3) {
    if(errorEl) errorEl.textContent = 'Нікнейм має бути мінімум 3 символи';
    return;
  }
  
  // Перевірка на англійські літери, цифри та підкреслення
  if(!/^[a-zA-Z0-9_]+$/.test(nickname)) {
    if(errorEl) errorEl.textContent = 'Нікнейм має містити тільки англійські літери, цифри та _';
    return;
  }
  
  try {
    const data = await updateProfile({ name, surname, nickname, email });
    // Зберігаємо оригінальну дату реєстрації, якщо вона вже була
    const originalCreatedAt = state.user?.created_at;
    state.user = {
      ...data.user,
      created_at: data.user.created_at || originalCreatedAt // Зберігаємо оригінальну дату реєстрації
    };
    localStorage.setItem('user', JSON.stringify(state.user));
    state.profileEditing = false; // Виходимо з режиму редагування
    showToast('✅ Профіль оновлено!');
    render(); // Оновлюємо профіль
  } catch(error) {
    if(errorEl) {
      errorEl.textContent = error.message || 'Помилка оновлення';
    }
  }
};

window.handleAvatarUpload = async function(event) {
  const file = event.target.files[0];
  if(!file) return;
  
  // Перевірка розміру (5MB)
  if(file.size > 5 * 1024 * 1024) {
    showToast('❌ Файл занадто великий (макс. 5MB)');
    return;
  }
  
  // Перевірка типу
  if(!file.type.startsWith('image/')) {
    showToast('❌ Оберіть зображення');
    return;
  }
  
  try {
    const data = await uploadAvatar(file);
    // Оновлюємо аватар в профілі
    state.user.avatar_url = data.avatar_url;
    localStorage.setItem('user', JSON.stringify(state.user));
    
    const img = $('#profile-avatar-img');
    if(img) {
      img.src = `${state.apiUrl.replace('/api', '')}${data.avatar_url}`;
    }
    
    showToast('✅ Аватар оновлено!');
  } catch(error) {
    showToast(`❌ ${error.message || 'Помилка завантаження'}`);
  }
};

window.handleLogout = function() {
  clearAuth();
  showToast('👋 До побачення!');
  render();
};


// ====== TAB: FAVORITES ======
function favoritesTabHTML(){
  if(!state.favorites.length){
    return `
    <div class="page">
      <h2 class="h2" style="margin-bottom:24px">Улюблені кав'ярні</h2>
      <div style="background:rgba(115,75,52,0.1);padding:12px 16px;border-radius:12px;margin-bottom:24px;font-size:14px;color:var(--accent);display:flex;align-items:center;gap:8px">
        <i data-lucide="info" style="width:18px;height:18px"></i>
        <span><strong>Підказка:</strong> Свайпніть вправо на картці закладу або натисніть ❤️, щоб додати в улюблені</span>
      </div>
      <div class="empty">
        <i data-lucide="heart" class="icon"></i>
        <h3 style="margin:0 0 8px">Немає улюблених кав'ярень</h3>
        <p style="color:#838c8b">Додавайте кав'ярні в улюблені, щоб швидко знаходити їх пізніше</p>
      </div>
    </div>`;
  }
  return `
  <div class="page">
    <h2 class="h2" style="margin-bottom:24px">Улюблені кав'ярні</h2>
    <div style="background:rgba(115,75,52,0.1);padding:12px 16px;border-radius:12px;margin-bottom:24px;font-size:14px;color:var(--accent);display:flex;align-items:center;gap:8px">
      <i data-lucide="info" style="width:18px;height:18px"></i>
      <span>У вас ${state.favorites.length} ${state.favorites.length === 1 ? 'улюблена кав\'ярня' : 'улюблених кав\'ярень'}</span>
    </div>
    <div class="fav-grid">
      ${state.favorites.map(f=>`
        <div class="fav-card">
          <div class="fav-img" style="background-image:url('${f.photo || placeholderImg()}')"></div>
          <div class="fav-body">
            <h3 class="tile-title" style="margin:0 0 8px">${f.name}</h3>
            <div class="row" style="margin-bottom:8px">
              <div class="rating"><i data-lucide="star" style="width:14px;height:14px"></i><span style="font-weight:600">${fmtRating(f.rating)}</span></div>
            </div>
            <div class="meta" style="margin-bottom:16px"><i data-lucide="map-pin"></i><span>${f.vicinity || '—'}</span></div>
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
              ${f.geometry && f.geometry.location ? `
              <button class="btn btn-outline" style="flex:1;min-width:120px;padding:10px;font-size:14px" data-fav-route="${f.id}" title="Побудувати маршрут">
                <i data-lucide="navigation" style="width:16px;height:16px"></i> Маршрут
              </button>
              ` : ''}
              ${state.user && state.token ? `
              <button class="btn btn-outline" style="flex:1;min-width:120px;padding:10px;font-size:14px" data-fav-review="${f.id}" title="Залишити відгук">
                <i data-lucide="star" style="width:16px;height:16px"></i> Відгук
              </button>
              ` : ''}
              <button class="btn btn-outline" style="flex:1;min-width:120px;padding:10px;font-size:14px" data-fav-explore="${f.id}" title="Дізнатись більше" ${!f.place_id && !f.id ? 'disabled' : ''}>
                <i data-lucide="arrow-right" style="width:16px;height:16px"></i> Деталі
              </button>
            </div>
            <button class="remove" data-id="${f.id}" title="Видалити з улюблених"><i data-lucide="x" style="width:16px;height:16px"></i> Видалити</button>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}
function afterFavoritesMount(){
  lucide.createIcons();
  
  // Видалення з улюблених
  $$('.remove').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-id');
      const placeId = id; // id це place_id
      
      // Якщо користувач авторизований, видаляємо з сервера
      if(state.user && state.token) {
        try {
          await removeFavorite(placeId);
          state.favorites = state.favorites.filter(x=>x.id!==id && x.place_id!==placeId);
          saveFavs();
          showToast('✅ Видалено з улюблених');
          render();
        } catch(error) {
          console.error('Помилка видалення з улюблених:', error);
          showToast(`❌ ${error.message || 'Помилка видалення'}`);
        }
      } else {
        // Якщо не авторизований, видаляємо тільки з localStorage
        state.favorites = state.favorites.filter(x=>x.id!==id && x.place_id!==placeId);
        saveFavs();
        showToast('✅ Видалено з улюблених');
        render();
      }
    });
  });
  
  // Кнопка "Маршрут"
  $$('[data-fav-route]').forEach(btn => {
    btn.addEventListener('click', () => {
      const favId = btn.getAttribute('data-fav-route');
      const fav = state.favorites.find(f => f.id === favId);
      if(fav && fav.geometry && fav.geometry.location && state.userPos) {
        const url = `https://www.google.com/maps/dir/?api=1&origin=${state.userPos.lat},${state.userPos.lng}&destination=${fav.geometry.location.lat},${fav.geometry.location.lng}&travelmode=walking`;
        window.open(url, '_blank');
      }
    });
  });
  
  // Кнопка "Дізнатись більше"
  $$('[data-fav-explore]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(btn.disabled) return;
      const favId = btn.getAttribute('data-fav-explore');
      const fav = state.favorites.find(f => f.id === favId);
      if(fav) {
        // Використовуємо place_id або id (який також є place_id)
        const placeId = fav.place_id || fav.id;
        if(placeId) {
          navigateToExploreForPlace(placeId);
        } else {
          // Якщо немає place_id, шукаємо в placesRaw або places
          const foundPlace = state.placesRaw.find(p => p.name === fav.name) || 
                            state.places.find(p => p.name === fav.name);
          if(foundPlace && foundPlace.place_id) {
            navigateToExploreForPlace(foundPlace.place_id);
          } else {
            showToast('⚠️ Не вдалося знайти заклад');
          }
        }
      }
    });
  });

  // Кнопка "Додати відгук" з улюблених
  $$('[data-fav-review]').forEach(btn => {
    btn.addEventListener('click', () => {
      const favId = btn.getAttribute('data-fav-review');
      const fav = state.favorites.find(f => f.id === favId);
      if(fav) {
        if(state.user && state.token) {
          // Створюємо об'єкт місця з даних улюбленого
          const place = {
            place_id: fav.place_id || fav.id,
            name: fav.name,
            vicinity: fav.vicinity,
            geometry: fav.geometry
          };
          navigateToReviewsForPlace(place);
        } else {
          showToast('⚠️ Увійдіть до акаунту, щоб залишити відгук');
          setTimeout(() => {
            $$('.nav-btn').forEach(b => b.classList.remove('active'));
            const profileBtn = $$('.nav-btn').find(b => b.dataset.tab === 'profile');
            if(profileBtn) {
              profileBtn.classList.add('active');
              state.activeTab = 'profile';
              render();
            }
          }, 500);
        }
      }
    });
  });
}

// ====== Map + Places ======
function initMapAndSearch(){
  // створюємо карту у правій панелі, але DOM ще не створено — рендеримо tab і тоді ініт
  state.activeTab = 'map';
  render(); // намалювати DOM (#map існує)

  state.map = new google.maps.Map($('#map'), {
    center: state.userPos,
    zoom: 14,
    styles:[{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]}]
  });

  // геолокація
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      state.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      state.map.setCenter(state.userPos);
      drawUserMarker();
      searchNearby(state.userPos);
    }, ()=>{
      drawUserMarker(); // з fallback
      searchNearby(state.userPos);
    }, {enableHighAccuracy:true,timeout:10000});
  } else {
    drawUserMarker();
    searchNearby(state.userPos);
  }
}

function drawUserMarker(){
  if(state.userMarker) state.userMarker.setMap(null);
  
  // Створюємо маркер користувача - червона точка з білою обводкою
  const userMarkerIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: '#734B34',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3
  };
  
  state.userMarker = new google.maps.Marker({
    position: state.userPos,
    map: state.map,
    title: 'Ви тут',
    icon: userMarkerIcon,
    zIndex: 1000
  });
  
  // Додаємо інфо-вікно з підписом для користувача
  const infoWindow = new google.maps.InfoWindow({
    content: '<div style="padding:8px 12px;font-weight:600;color:#734B34;text-align:center">📍 Ви тут</div>',
    disableAutoPan: true,
    pixelOffset: new google.maps.Size(0, -35)
  });
  
  state.userMarker.addListener('click', () => {
    infoWindow.open(state.map, state.userMarker);
  });
  
  // Відкриваємо інфо-вікно автоматично
  setTimeout(() => infoWindow.open(state.map, state.userMarker), 500);
}

function searchNearby(center){
  console.log('🔍 Шукаю кав\'ярні поруч...', center);
  
  try {
    // Використовуємо старий PlacesService (все ще працює, хоча deprecated)
    const svc = new google.maps.places.PlacesService(state.map);
    svc.nearbySearch({
      location: center,
      radius: 2500,
      type: 'cafe'
    }, (res,status)=>{
      console.log('📊 Результат пошуку:', {status, count: res?.length});
      
      if(status !== google.maps.places.PlacesServiceStatus.OK || !res?.length){
        console.error('❌ Помилка пошуку або немає результатів:', status);
        if(status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS){
          state.errorMessage = null;
          showEmptyState();
        } else if(status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED){
          state.errorMessage = '🔒 API обмежений. Додайте localhost в налаштування API ключа.';
        } else {
          state.errorMessage = '❌ Не вдалося знайти кав\'ярні';
        }
        state.places = [];
        render();
        return;
      }
      
      console.log('✅ Знайдено кав\'ярень:', res.length);
      // Додаємо відстань до кожного закладу та сортуємо за комбінованим score
      const placesWithDistance = addDistanceToPlaces(res);
      // Сортуємо за комбінованим score (рейтинг важливіший, але відстань теж враховується)
      placesWithDistance.forEach(place => {
        place.smartScore = calculateSmartScore(place);
      });
      placesWithDistance.sort((a, b) => (b.smartScore || -1000) - (a.smartScore || -1000));
      
      state.placesRaw = placesWithDistance;  // зберігаємо оригінальні результати з відстанню
      state.placesToShow = 20; // скидаємо пагінацію
      state.places = placesWithDistance.slice(0, state.placesToShow); // для карти показуємо перші 20
      state.currentIndex = 0;
      state.errorMessage = null;
      drawPlaceMarkers(state.places);
      render();
    });
  } catch(error) {
    console.error('❌ Помилка ініціалізації пошуку:', error);
    state.places = [];
    state.errorMessage = '❌ Помилка ініціалізації пошуку кав\'ярень';
    render();
  }
}

function showEmptyState(){
  state.errorMessage = '💭 Поруч немає кав\'ярень';
}


function drawPlaceMarkers(places){
  // очистити старі маркери
  state.markers.forEach(m=>m.setMap(null));
  state.markers = [];

  places.forEach(p=>{
    // Використовуємо стандартні червоні маркери Google Maps
    const m = new google.maps.Marker({ 
      position: p.geometry.location, 
      map: state.map, 
      title: p.name
    });
    
    // Створюємо індивідуальне інфо-вікно для кожного маркера
    const info = new google.maps.InfoWindow({
      content: `<div style="padding:8px;max-width:200px">
        <div style="font-weight:600;color:#734B34;margin-bottom:4px">☕ ${p.name}</div>
        <div style="font-size:12px;color:#666;margin-bottom:4px">${p.vicinity || p.formatted_address || ''}</div>
        <div style="font-size:13px;color:#333">⭐ ${fmtRating(p.rating)}</div>
      </div>`
    });
    
    m.addListener('click', ()=>{
      info.setContent(`<div style="padding:8px;max-width:200px">
        <div style="font-weight:600;color:#734B34;margin-bottom:4px">☕ ${p.name}</div>
        <div style="font-size:12px;color:#666;margin-bottom:4px">${p.vicinity || p.formatted_address || ''}</div>
        <div style="font-size:13px;color:#333">⭐ ${fmtRating(p.rating)}</div>
      </div>`);
      // Закриваємо всі інші інфо-вікна
      state.markers.forEach(marker => {
        const infoWin = marker.infoWindow;
        if(infoWin) infoWin.close();
      });
      info.open(state.map, m);
    });
    
    // Зберігаємо посилання на інфо-вікно
    m.infoWindow = info;
    state.markers.push(m);
  });
}

// ====== Helpers ======
function currentPlace(){ return state.places[state.currentIndex]; }
function nextPlace(){
  if(state.currentIndex < state.places.length - 1) {
    state.currentIndex++;
    // Оновлюємо тільки ліву панель
    const leftPane = $('.left-pane');
    if(leftPane) {
      leftPane.innerHTML = leftPaneHTML();
      afterMapTabMount();
    }
  }
}
function fmtRating(r){ return r ? Number(r).toFixed(1) : '—'; }

// Розрахунок відстані між двома точками (Haversine формула)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Радіус Землі в кілометрах
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Відстань в кілометрах
}

// Додаємо відстань до кожного закладу
function addDistanceToPlaces(places) {
  if(!state.userPos) return places;
  
  return places.map(place => {
    if(place.geometry && place.geometry.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      place.distance = calculateDistance(state.userPos.lat, state.userPos.lng, lat, lng);
    } else {
      place.distance = Infinity; // Якщо немає координат, ставимо велику відстань
    }
    return place;
  });
}

// Розрахунок комбінованого score (рейтинг важливіший за відстань)
function calculateSmartScore(place) {
  const rating = place.rating || 0;
  const distance = place.distance || Infinity;
  const maxDistance = 5; // Максимальна відстань в км (не показуємо далі)
  
  // Якщо заклад занадто далеко, повертаємо дуже низький score
  if(distance > maxDistance) {
    return -1000;
  }
  
  // Нормалізуємо рейтинг (0-5 -> 0-100)
  const ratingScore = rating * 20; // 70% ваги
  
  // Нормалізуємо відстань (0-5км -> 100-0)
  // Чим ближче, тим краще
  const distanceScore = Math.max(0, (maxDistance - distance) / maxDistance * 100); // 30% ваги
  
  // Комбінований score: рейтинг 70%, відстань 30%
  return ratingScore * 0.7 + distanceScore * 0.3;
}
function placeholderImg(){
  // мʼякий градієнт якщо немає фото
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8B6F47"/><stop offset="1" stop-color="#A6896B"/>
  </linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Inter" font-size="32">Cafe</text></svg>`)}`
}
function placePhoto(p, w=800){
  try {
    if(p.photos && p.photos.length > 0 && p.photos[0].getUrl) {
      return p.photos[0].getUrl({maxWidth:w});
    }
  } catch(e) {
    console.warn('Помилка отримання фото:', e);
  }
  return placeholderImg();
}
function distanceBadge(p){
  // без точних даних про відстань - показуємо "~ поруч"
  return 'поруч';
}
function getHoursStatus(p){
  if(!p.opening_hours) return 'Інформація недоступна';
  if(p.opening_hours.open_now === true) return 'Відкрито зараз';
  if(p.opening_hours.open_now === false) return 'Зараз закрито';
  return 'Години роботи невідомі';
}
async function addToFavorites(p){
  if(state.favorites.some(x=>x.id===p.place_id || x.place_id===p.place_id)) {
    showToast('ℹ️ Це місце вже в улюблених');
    return;
  }
  
  let photoUrl = null;
  try {
    if(p.photos && p.photos.length > 0 && p.photos[0].getUrl) {
      photoUrl = p.photos[0].getUrl({maxWidth:600});
    }
  } catch(e) {
    console.warn('Помилка отримання фото для улюблених:', e);
  }
  
  const favoriteData = {
    id: p.place_id,
    name: p.name,
    rating: p.rating,
    vicinity: p.vicinity || p.formatted_address,
    photo: photoUrl,
    place_id: p.place_id, // Зберігаємо place_id для маршруту
    geometry: p.geometry ? {
      location: {
        lat: p.geometry.location.lat(),
        lng: p.geometry.location.lng()
      }
    } : null
  };
  
  // Якщо користувач авторизований, зберігаємо на сервері
  if(state.user && state.token) {
    try {
      await addFavorite(favoriteData);
      state.favorites.push(favoriteData);
      saveFavs(); // Також зберігаємо в localStorage для швидкого доступу
      showToast('✅ Додано до улюблених');
    } catch(error) {
      console.error('Помилка додавання до улюблених:', error);
      showToast(`❌ ${error.message || 'Помилка додавання до улюблених'}`);
    }
  } else {
    // Якщо не авторизований, зберігаємо тільки в localStorage
    state.favorites.push(favoriteData);
    saveFavs();
    showToast('✅ Додано до улюблених (увійдіть для синхронізації)');
  }
}

// ====== НАВІГАЦІЯ ======
function navigateToExploreForPlace(placeId) {
  state.focusedPlaceId = placeId;
  // Перемикаємо на вкладку "Дослідити"
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const exploreBtn = $$('.nav-btn').find(b => b.dataset.tab === 'explore');
  if(exploreBtn) {
    exploreBtn.classList.add('active');
    state.activeTab = 'explore';
    render();
    // Виділення відбудеться в afterExploreMount через state.focusedPlaceId
  }
}

function navigateToExploreForCurrent() {
  const p = currentPlace();
  if(p && p.place_id) {
    navigateToExploreForPlace(p.place_id);
  }
}

// Навігація на вкладку відгуків з місцем для створення відгуку
function navigateToReviewsForPlace(place) {
  if(!place) {
    console.warn('navigateToReviewsForPlace: place is null or undefined');
    return;
  }
  
  // Зберігаємо місце для відгуку
  state.reviewPlace = {
    place_id: place.place_id || place.id,
    name: place.name || 'Кав\'ярня',
    vicinity: place.vicinity || place.formatted_address || '',
    geometry: place.geometry
  };
  
  // Перемикаємо на вкладку "Відгуки"
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const reviewsBtn = $$('.nav-btn').find(b => b.dataset.tab === 'reviews');
  if(reviewsBtn) {
    reviewsBtn.classList.add('active');
    state.activeTab = 'reviews';
    render();
  } else {
    console.warn('navigateToReviewsForPlace: reviews button not found');
  }
}

// ====== PLACE DETAILS API ======
function fetchPlaceDetails(placeId, callback) {
  // Перевіряємо кеш (10 хвилин)
  const cached = state.placeDetails[placeId];
  if(cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    callback(cached.data);
    return;
  }

  if(!state.map) {
    console.warn('Карта не ініціалізована для Place Details');
    callback(null);
    return;
  }

  const service = new google.maps.places.PlacesService(state.map);
  service.getDetails({
    placeId: placeId,
    fields: ['website', 'formatted_phone_number', 'international_phone_number', 'url', 'name', 'formatted_address', 'opening_hours', 'photos']
  }, (place, status) => {
    if(status === google.maps.places.PlacesServiceStatus.OK && place) {
      state.placeDetails[placeId] = {
        data: place,
        timestamp: Date.now()
      };
      callback(place);
    } else {
      console.warn('Помилка отримання деталей місця:', status);
      callback(null);
    }
  });
}

// ====== ФІЛЬТРАЦІЯ ======
function applyFiltersInternal() {
  let filtered = [...state.placesRaw];

  // Фільтр по відстані (радіус)
  if(state.filters.radius && state.userPos) {
    filtered = filtered.filter(p => {
      if(!p.distance && p.geometry && p.geometry.location) {
        // Якщо відстань не розрахована, розраховуємо її
        const lat = p.geometry.location.lat();
        const lng = p.geometry.location.lng();
        p.distance = calculateDistance(state.userPos.lat, state.userPos.lng, lat, lng);
      }
      // Фільтруємо заклади в межах радіусу (в км)
      return p.distance !== undefined && p.distance <= (state.filters.radius / 1000);
    });
  }

  // Фільтр по рейтингу
  if(state.filters.minRating > 0) {
    filtered = filtered.filter(p => p.rating && p.rating >= state.filters.minRating);
  }

  // Фільтр по мінімальній кількості відгуків
  if(state.filters.minReviews > 0) {
    filtered = filtered.filter(p => (p.user_ratings_total || 0) >= state.filters.minReviews);
  }

  // Фільтр "Відкрито зараз"
  if(state.filters.openNow) {
    filtered = filtered.filter(p => {
      // Перевіряємо, чи є інформація про години роботи
      if(!p.opening_hours) {
        // Якщо немає даних про години роботи, виключаємо заклад
        return false;
      }
      // Перевіряємо open_now (може бути true, false або undefined)
      return p.opening_hours.open_now === true;
    });
  }

  // Перераховуємо відстань для відфільтрованих закладів
  filtered = addDistanceToPlaces(filtered);

  // Сортування
  switch(state.filters.sortBy) {
    case 'rating':
      filtered.sort((a, b) => {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        // Якщо рейтинги рівні, сортуємо за відстанню
        if(ratingA === ratingB) {
          return (a.distance || Infinity) - (b.distance || Infinity);
        }
        return ratingB - ratingA;
      });
      break;
    case 'reviews':
      filtered.sort((a, b) => {
        const reviewsA = a.user_ratings_total || 0;
        const reviewsB = b.user_ratings_total || 0;
        // Якщо кількість відгуків рівна, сортуємо за рейтингом
        if(reviewsA === reviewsB) {
          return (b.rating || 0) - (a.rating || 0);
        }
        return reviewsB - reviewsA;
      });
      break;
    case 'distance':
    default:
      // Сортування за комбінованим score (рейтинг важливіший за відстань)
      filtered.forEach(place => {
        place.smartScore = calculateSmartScore(place);
      });
      filtered.sort((a, b) => (b.smartScore || -1000) - (a.smartScore || -1000));
      break;
  }

  return filtered;
}

function applyFilters() {
  const filtered = applyFiltersInternal();
  // Зберігаємо всі відфільтровані результати для пагінації
  // Для карти - зберігаємо в placesRaw, для explore - використовуємо всі
  if(state.activeTab === 'map') {
    state.placesRaw = filtered; // Зберігаємо всі відфільтровані для пагінації
    state.placesToShow = 20;
    state.places = filtered.slice(0, state.placesToShow);
    if(state.map) {
      drawPlaceMarkers(state.places);
    }
    // Оновлюємо ліву панель
    const leftPane = $('.left-pane');
    if(leftPane) {
      leftPane.innerHTML = leftPaneHTML();
      afterMapTabMount();
    }
  } else {
    // Для explore показуємо всі відфільтровані
    state.places = filtered;
    const root = $('#root');
    if(root) {
      root.innerHTML = exploreTabHTML();
      afterExploreMount();
    }
    if(state.map) {
      drawPlaceMarkers(filtered);
    }
  }
}

function searchNearbyWithFilters() {
  if(!state.map || !state.userPos) return;

  const svc = new google.maps.places.PlacesService(state.map);
  const request = {
    location: state.userPos,
    radius: state.filters.radius,
    type: 'cafe'
  };

  if(state.filters.keyword) {
    request.keyword = state.filters.keyword;
  }

  svc.nearbySearch(request, (res, status) => {
    if(status === google.maps.places.PlacesServiceStatus.OK && res?.length) {
      // Додаємо відстань та сортуємо за комбінованим score
      const placesWithDistance = addDistanceToPlaces(res);
      placesWithDistance.forEach(place => {
        place.smartScore = calculateSmartScore(place);
      });
      placesWithDistance.sort((a, b) => (b.smartScore || -1000) - (a.smartScore || -1000));
      state.placesRaw = placesWithDistance;
      applyFilters();
    } else {
      console.warn('Помилка пошуку з фільтрами:', status);
      applyFilters(); // застосовуємо фільтри до наявних даних
    }
  });
}
