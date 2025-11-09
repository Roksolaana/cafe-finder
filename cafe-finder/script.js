// ====== ГЛОБАЛЬНИЙ СТАН ======
let state = {
  activeTab: 'map',
  places: [],         // відфільтровані результати для відображення
  placesRaw: [],      // оригінальні результати Places API (зберігаються при перемиканні вкладок)
  placeDetails: {},   // кеш деталей місць (place_id -> details)
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
  currentIndex: 0,    // індекс картки у вкладці "Карта"
  map: null,
  markers: [],
  userMarker: null,
  userPos: { lat: 49.8397, lng: 24.0297 }, // Львів fallback
  errorMessage: null,  // повідомлення про помилку
  filters: {
    radius: 2500,
    keyword: '',
    minRating: 0,
    openNow: false,
    sortBy: 'distance', // distance, rating, reviews, smart
    purposePreset: null
  },
  focusedPlaceId: null,  // ID місця для фокусування при переході з "Карти"
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

    const data = await response.json();
    
    if(!response.ok) {
      throw new Error(data.error || 'Помилка запиту');
    }

    return data;
  } catch(error) {
    console.error('API помилка:', error);
    throw error;
  }
}

async function registerUser(userData) {
  return await apiRequest('/register', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
}

async function loginUser(email, password) {
  return await apiRequest('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
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
    const data = await response.json();
    return data.available;
  } catch(error) {
    console.error('Помилка перевірки нікнейму:', error);
    return false;
  }
}

function saveAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('authToken', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
}

function loadAuth() {
  const token = localStorage.getItem('authToken');
  const userStr = localStorage.getItem('user');
  if(token && userStr) {
    state.token = token;
    try {
      state.user = JSON.parse(userStr);
      // Перевіряємо, чи токен ще дійсний, завантажуючи профіль
      getProfile().then(data => {
        state.user = data.user;
        localStorage.setItem('user', JSON.stringify(data.user));
      }).catch(() => {
        // Токен недійсний, очищаємо
        clearAuth();
      });
    } catch(e) {
      clearAuth();
    }
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
  if(state.activeTab === 'reviews') return root.innerHTML = reviewsTabHTML();
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
        <div class="meta"><i data-lucide="clock"></i><span>${getHoursStatus(c)}</span></div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-outline" id="route-btn"><i data-lucide="navigation"></i> Маршрут</button>
      <button class="btn btn-pill" id="learn-more-btn"><i data-lucide="arrow-right"></i> Дізнатись більше</button>
    </div>
    <p class="bottom-note">Показано ${idx} кав'ярень поруч</p>
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
        <button class="ctrl" id="recenter"><i data-lucide="send"></i></button>
        <button class="ctrl" id="zoom-in"><i data-lucide="plus"></i></button>
        <button class="ctrl" id="zoom-out"><i data-lucide="minus"></i></button>
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

  // Жести свайпу (приємний бонус)
  const card = $('.card');
  if(card && window.Hammer){
    const hm = new Hammer(card); hm.get('pan').set({direction:Hammer.DIRECTION_HORIZONTAL});
    let dx=0;
    hm.on('panmove',e=>{dx=e.deltaX; card.style.transform = `translateX(${dx}px) rotate(${dx/20}deg)`;});
    hm.on('panend',()=>{
      card.style.transition = 'transform .25s';
      if(dx>100){ $('#save-btn')?.click(); }
      else if(dx<-100){ $('#skip-btn')?.click(); }
      card.style.transform = 'translateX(0) rotate(0deg)';
      setTimeout(()=>card.style.transition='',250);
    });
  }

  // Підключаємо карту до DOM (повторний attach)
  if(state.map){ google.maps.event.trigger(state.map,'resize'); }

  // Контроли карти
  $('#recenter')?.addEventListener('click', ()=> state.map && state.userPos && state.map.setCenter(state.userPos));
  $('#zoom-in')?.addEventListener('click', ()=> state.map && state.map.setZoom(state.map.getZoom()+1));
  $('#zoom-out')?.addEventListener('click', ()=> state.map && state.map.setZoom(state.map.getZoom()-1));
}

// ====== TAB: EXPLORE (grid of places) ======
function filtersHTML() {
  return `
    <div class="filters-section">
      <div class="filters-header">
        <h3 class="filters-title">Фільтри</h3>
      </div>
      
      <!-- Пресети цілей -->
      <div class="presets">
        <button class="preset-btn ${state.filters.purposePreset === 'work' ? 'active' : ''}" data-preset="work">
          <i data-lucide="briefcase"></i> Для роботи
        </button>
        <button class="preset-btn ${state.filters.purposePreset === 'date' ? 'active' : ''}" data-preset="date">
          <i data-lucide="heart"></i> Побачення
        </button>
        <button class="preset-btn ${state.filters.purposePreset === 'friends' ? 'active' : ''}" data-preset="friends">
          <i data-lucide="users"></i> З друзями
        </button>
        <button class="preset-btn ${state.filters.purposePreset === 'quick' ? 'active' : ''}" data-preset="quick">
          <i data-lucide="zap"></i> Швидка кава
        </button>
      </div>

      <!-- Фільтри -->
      <div class="filters-grid">
        <div class="filter-group">
          <label class="filter-label">Пошук</label>
          <input type="text" class="filter-input" id="filter-keyword" placeholder="Назва або адреса..." value="${state.filters.keyword}">
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Радіус</label>
          <input type="range" class="filter-range" id="filter-radius" min="500" max="5000" step="500" value="${state.filters.radius}">
          <span class="filter-value" id="radius-value">${Math.round(state.filters.radius / 1000 * 10) / 10} км</span>
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Мінімальний рейтинг</label>
          <input type="range" class="filter-range" id="filter-rating" min="0" max="5" step="0.1" value="${state.filters.minRating}">
          <span class="filter-value" id="rating-value">${state.filters.minRating > 0 ? state.filters.minRating.toFixed(1) : 'Будь-який'}</span>
        </div>
        
        <div class="filter-group">
          <label class="filter-checkbox-label">
            <input type="checkbox" class="filter-checkbox" id="filter-openNow" ${state.filters.openNow ? 'checked' : ''}>
            <span>Відкрито зараз</span>
          </label>
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Сортування</label>
          <select class="filter-select" id="filter-sortBy">
            <option value="distance" ${state.filters.sortBy === 'distance' ? 'selected' : ''}>За відстанню</option>
            <option value="rating" ${state.filters.sortBy === 'rating' ? 'selected' : ''}>За рейтингом</option>
            <option value="reviews" ${state.filters.sortBy === 'reviews' ? 'selected' : ''}>За кількістю відгуків</option>
            <option value="smart" ${state.filters.sortBy === 'smart' ? 'selected' : ''}>Розумне</option>
          </select>
        </div>
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

    ${filtersHTML()}

    <div class="grid">
      ${state.places.length > 0 ? state.places.map(p=>`
        <div class="tile" data-id="${p.place_id}">
          <div class="tile-img" style="background-image:url('${placePhoto(p, 800)}')">
            <button class="tile-fav-btn" data-id="${p.place_id}" onclick="event.stopPropagation()">
              <i data-lucide="heart" style="width:20px;height:20px"></i>
            </button>
            <div class="tile-overlay" data-place-id="${p.place_id}">
              <div class="tile-actions">
                <a href="#" class="tile-action-btn" data-action="website" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                  <i data-lucide="globe"></i> Сайт
                </a>
                <a href="#" class="tile-action-btn" data-action="menu" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                  <i data-lucide="utensils"></i> Меню
                </a>
                <a href="#" class="tile-action-btn" data-action="route" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                  <i data-lucide="navigation"></i> Маршрут
                </a>
                <a href="#" class="tile-action-btn" data-action="maps" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                  <i data-lucide="map"></i> В Google Maps
                </a>
                <a href="#" class="tile-action-btn" data-action="phone" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;" style="display:none">
                  <i data-lucide="phone"></i> Подзвонити
                </a>
              </div>
            </div>
          </div>
          <div class="tile-body">
            <div class="row">
              <h3 class="tile-title">${p.name}</h3>
              <div class="rating"><i data-lucide="star" style="width:16px;height:16px"></i> <span style="font-weight:600">${fmtRating(p.rating)}</span></div>
            </div>
            <div class="meta"><i data-lucide="map-pin"></i><span>${p.vicinity || p.formatted_address || '—'}</span></div>
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
  // Пресети
  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      applyPurposePreset(preset);
    });
  });

  // Пошук (з дебаунсом)
  const keywordInput = $('#filter-keyword');
  if(keywordInput) {
    const debouncedKeyword = debounce(() => {
      state.filters.keyword = keywordInput.value;
      saveFilters();
      applyFilters();
    }, 400);
    keywordInput.addEventListener('input', debouncedKeyword);
  }

  // Радіус
  const radiusInput = $('#filter-radius');
  const radiusValue = $('#radius-value');
  if(radiusInput && radiusValue) {
    radiusInput.addEventListener('input', () => {
      state.filters.radius = parseInt(radiusInput.value);
      radiusValue.textContent = `${Math.round(state.filters.radius / 1000 * 10) / 10} км`;
      saveFilters();
    });
    radiusInput.addEventListener('change', () => {
      searchNearbyWithFilters();
    });
  }

  // Рейтинг
  const ratingInput = $('#filter-rating');
  const ratingValue = $('#rating-value');
  if(ratingInput && ratingValue) {
    ratingInput.addEventListener('input', () => {
      state.filters.minRating = parseFloat(ratingInput.value);
      ratingValue.textContent = state.filters.minRating > 0 ? state.filters.minRating.toFixed(1) : 'Будь-який';
      saveFilters();
      applyFilters();
    });
  }

  // Відкрито зараз
  const openNowCheckbox = $('#filter-openNow');
  if(openNowCheckbox) {
    openNowCheckbox.addEventListener('change', () => {
      state.filters.openNow = openNowCheckbox.checked;
      saveFilters();
      applyFilters();
    });
  }

  // Сортування
  const sortSelect = $('#filter-sortBy');
  if(sortSelect) {
    sortSelect.addEventListener('change', () => {
      state.filters.sortBy = sortSelect.value;
      saveFilters();
      applyFilters();
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
                  <a href="#" class="tile-action-btn" data-action="website" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                    <i data-lucide="globe"></i> Сайт
                  </a>
                  <a href="#" class="tile-action-btn" data-action="menu" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                    <i data-lucide="utensils"></i> Меню
                  </a>
                  <a href="#" class="tile-action-btn" data-action="route" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                    <i data-lucide="navigation"></i> Маршрут
                  </a>
                  <a href="#" class="tile-action-btn" data-action="maps" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;">
                    <i data-lucide="map"></i> В Google Maps
                  </a>
                  <a href="#" class="tile-action-btn" data-action="phone" data-place-id="${p.place_id}" onclick="event.stopPropagation(); return false;" style="display:none">
                    <i data-lucide="phone"></i> Подзвонити
                  </a>
                </div>
              </div>
            </div>
            <div class="tile-body">
              <div class="row">
                <h3 class="tile-title">${p.name}</h3>
                <div class="rating"><i data-lucide="star" style="width:16px;height:16px"></i> <span style="font-weight:600">${fmtRating(p.rating)}</span></div>
              </div>
              <div class="meta"><i data-lucide="map-pin"></i><span>${p.vicinity || p.formatted_address || '—'}</span></div>
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
  
  // Фокусування на потрібній плитці (якщо перейшли з "Карти")
  if(state.focusedPlaceId) {
    setTimeout(() => {
      const tile = $(`[data-id="${state.focusedPlaceId}"]`);
      if(tile) {
        tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tile.classList.add('focused');
        setTimeout(() => tile.classList.remove('focused'), 2000);
      }
      state.focusedPlaceId = null;
    }, 100);
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
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      const placeId = btn.dataset.placeId;
      const place = state.places.find(p => p.place_id === placeId);
      if(!place) return;

      handleTileAction(action, place);
    });
  });
}

function updateTileActions(placeId, place, details) {
  const overlay = $(`.tile-overlay[data-place-id="${placeId}"]`);
  if(!overlay) return;

  // Оновлюємо посилання
  const websiteBtn = overlay.querySelector('[data-action="website"]');
  const menuBtn = overlay.querySelector('[data-action="menu"]');
  const routeBtn = overlay.querySelector('[data-action="route"]');
  const mapsBtn = overlay.querySelector('[data-action="maps"]');
  const phoneBtn = overlay.querySelector('[data-action="phone"]');

  // Сайт
  if(websiteBtn && details.website) {
    websiteBtn.href = details.website;
    websiteBtn.target = '_blank';
  } else if(websiteBtn) {
    websiteBtn.href = `https://www.google.com/search?q=${encodeURIComponent(place.name)}`;
    websiteBtn.target = '_blank';
  }

  // Меню
  if(menuBtn) {
    if(details.website) {
      menuBtn.href = details.website;
    } else {
      menuBtn.href = `https://www.google.com/search?q=${encodeURIComponent(place.name + ' menu')}`;
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
    } else {
      mapsBtn.href = `https://www.google.com/maps/search/?api=1&query=place_id:${placeId}`;
    }
    mapsBtn.target = '_blank';
  }

  // Телефон
  if(phoneBtn && details.international_phone_number) {
    phoneBtn.href = `tel:${details.international_phone_number}`;
    phoneBtn.style.display = 'flex';
  }
}

function handleTileAction(action, place) {
  switch(action) {
    case 'website':
    case 'menu':
    case 'maps':
    case 'route':
      // Посилання вже налаштовані в updateTileActions
      break;
    case 'phone':
      // Вже налаштовано як tel: посилання
      break;
  }
}

// ====== TAB: REVIEWS / PROFILE ======
function reviewsTabHTML(){
  return `
  <div class="center">
    <i data-lucide="star" class="big-icon"></i>
    <h3>Відгуки</h3>
    <p>Ця функція незабаром з'явиться</p>
  </div>`;
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
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="login-email" required placeholder="your@email.com">
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
              <input type="text" class="form-input" id="register-name" placeholder="Іван">
            </div>
            <div class="form-group">
              <label class="form-label">Прізвище</label>
              <input type="text" class="form-input" id="register-surname" placeholder="Іванов">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Нікнейм <span class="required">*</span></label>
            <input type="text" class="form-input" id="register-nickname" required placeholder="ivan_user">
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
  const avatarUrl = user.avatar_url ? `${state.apiUrl.replace('/api', '')}${user.avatar_url}` : null;
  
  return `
  <div class="page">
    <div class="profile-container">
      <div class="profile-header">
        <div class="profile-avatar-section">
          <div class="avatar-wrapper">
            <img src="${avatarUrl || placeholderImg()}" alt="Аватар" class="profile-avatar" id="profile-avatar-img">
            <label for="avatar-upload" class="avatar-upload-btn">
              <i data-lucide="camera"></i>
              <input type="file" id="avatar-upload" accept="image/*" style="display:none" onchange="handleAvatarUpload(event)">
            </label>
          </div>
          <h2 class="profile-name">${user.name || ''} ${user.surname || ''}</h2>
          <p class="profile-nickname">@${user.nickname || ''}</p>
        </div>
        <button class="btn btn-outline" id="logout-btn" onclick="handleLogout()">
          <i data-lucide="log-out"></i> Вийти
        </button>
      </div>

      <div class="profile-content">
        <div class="profile-section">
          <h3 class="section-title">Особисті дані</h3>
          <form id="profile-edit-form" onsubmit="handleProfileUpdate(event)">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Ім'я</label>
                <input type="text" class="form-input" id="profile-name" value="${user.name || ''}" placeholder="Іван">
              </div>
              <div class="form-group">
                <label class="form-label">Прізвище</label>
                <input type="text" class="form-input" id="profile-surname" value="${user.surname || ''}" placeholder="Іванов">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Нікнейм <span class="required">*</span></label>
              <input type="text" class="form-input" id="profile-nickname" value="${user.nickname || ''}" required placeholder="ivan_user">
              <div class="form-hint" id="profile-nickname-hint"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Email <span class="required">*</span></label>
              <input type="email" class="form-input" id="profile-email" value="${user.email || ''}" required placeholder="your@email.com">
            </div>
            <div class="form-error" id="profile-error"></div>
            <button type="submit" class="btn btn-pill" style="width:100%;margin-top:16px">
              <i data-lucide="save"></i> Зберегти зміни
            </button>
          </form>
        </div>

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
      
      const available = await checkNickname(nickname);
      if(available) {
        hint.textContent = '✓ Нікнейм доступний';
        hint.style.color = 'var(--accent)';
      } else {
        hint.textContent = '✗ Нікнейм вже зайнятий';
        hint.style.color = '#e74c3c';
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
      
      if(nickname === state.user.nickname) {
        hint.textContent = '';
        return;
      }
      
      const available = await checkNickname(nickname);
      if(available) {
        hint.textContent = '✓ Нікнейм доступний';
        hint.style.color = 'var(--accent)';
      } else {
        hint.textContent = '✗ Нікнейм вже зайнятий';
        hint.style.color = '#e74c3c';
      }
    }, 500);
    
    nicknameInput.addEventListener('input', debouncedCheck);
  }
}

// Обробники подій (глобальні, щоб працювали з inline handlers)
window.handleLogin = async function(event) {
  event.preventDefault();
  const errorEl = $('#login-error');
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  
  if(errorEl) errorEl.textContent = '';
  
  try {
    const data = await loginUser(email, password);
    saveAuth(data.token, data.user);
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
      errorEl.textContent = error.message || 'Помилка входу';
    }
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
  
  if(password.length < 6) {
    if(errorEl) errorEl.textContent = 'Пароль має бути мінімум 6 символів';
    return;
  }
  
  try {
    const data = await registerUser({ name, surname, nickname, email, password });
    saveAuth(data.token, data.user);
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
      errorEl.textContent = error.message || 'Помилка реєстрації';
    }
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
  
  try {
    const data = await updateProfile({ name, surname, nickname, email });
    state.user = data.user;
    localStorage.setItem('user', JSON.stringify(data.user));
    showToast('✅ Профіль оновлено!');
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
            <button class="remove" data-id="${f.id}"><i data-lucide="x" style="width:16px;height:16px"></i> Видалити</button>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}
function afterFavoritesMount(){
  lucide.createIcons();
  $$('.remove').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-id');
      state.favorites = state.favorites.filter(x=>x.id!==id);
      saveFavs(); render();
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
    fillColor: '#86461d',
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
    content: '<div style="padding:8px 12px;font-weight:600;color:#86461d;text-align:center">📍 Ви тут</div>',
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
      state.placesRaw = res;  // зберігаємо оригінальні результати
      state.places = res;     // для карти використовуємо всі
      state.currentIndex = 0;
      state.errorMessage = null;
      drawPlaceMarkers(res);
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
        <div style="font-weight:600;color:#86461d;margin-bottom:4px">☕ ${p.name}</div>
        <div style="font-size:12px;color:#666;margin-bottom:4px">${p.vicinity || p.formatted_address || ''}</div>
        <div style="font-size:13px;color:#333">⭐ ${fmtRating(p.rating)}</div>
      </div>`
    });
    
    m.addListener('click', ()=>{
      info.setContent(`<div style="padding:8px;max-width:200px">
        <div style="font-weight:600;color:#86461d;margin-bottom:4px">☕ ${p.name}</div>
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
function fmtRating(r){ return r ? Number(r).toFixed(1) : '—'; }
function placeholderImg(){
  // мʼякий градієнт якщо немає фото
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#a76c53"/><stop offset="1" stop-color="#c17857"/>
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
function addToFavorites(p){
  if(state.favorites.some(x=>x.id===p.place_id)) return;
  
  let photoUrl = null;
  try {
    if(p.photos && p.photos.length > 0 && p.photos[0].getUrl) {
      photoUrl = p.photos[0].getUrl({maxWidth:600});
    }
  } catch(e) {
    console.warn('Помилка отримання фото для улюблених:', e);
  }
  
  state.favorites.push({
    id: p.place_id,
    name: p.name,
    rating: p.rating,
    vicinity: p.vicinity || p.formatted_address,
    photo: photoUrl
  });
  saveFavs();
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
    // Після рендеру скролимо до потрібної плитки
    setTimeout(() => {
      const tile = $(`[data-id="${placeId}"]`);
      if(tile) {
        tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tile.classList.add('focused');
        setTimeout(() => tile.classList.remove('focused'), 2000);
      }
    }, 100);
  }
}

function navigateToExploreForCurrent() {
  const p = currentPlace();
  if(p && p.place_id) {
    navigateToExploreForPlace(p.place_id);
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
    fields: ['website', 'formatted_phone_number', 'international_phone_number', 'url', 'name', 'formatted_address']
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

  // Фільтр по ключовому слову
  if(state.filters.keyword) {
    const keyword = state.filters.keyword.toLowerCase();
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(keyword) ||
      (p.vicinity && p.vicinity.toLowerCase().includes(keyword))
    );
  }

  // Фільтр по рейтингу
  if(state.filters.minRating > 0) {
    filtered = filtered.filter(p => p.rating && p.rating >= state.filters.minRating);
  }

  // Фільтр "Відкрито зараз"
  if(state.filters.openNow) {
    filtered = filtered.filter(p => p.opening_hours && p.opening_hours.open_now === true);
  }

  // Сортування
  switch(state.filters.sortBy) {
    case 'rating':
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'reviews':
      filtered.sort((a, b) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0));
      break;
    case 'smart':
      // Комбінований: рейтинг * log(відгуків + 1)
      filtered.sort((a, b) => {
        const scoreA = (a.rating || 0) * Math.log((a.user_ratings_total || 0) + 1);
        const scoreB = (b.rating || 0) * Math.log((b.user_ratings_total || 0) + 1);
        return scoreB - scoreA;
      });
      break;
    case 'distance':
    default:
      // Сортування по відстані (якщо є дані про відстань)
      // Поки що залишаємо як є
      break;
  }

  return filtered;
}

function applyFilters() {
  const filtered = applyFiltersInternal();
  state.places = filtered;
  
  // Оновлюємо тільки якщо ми на вкладці "Дослідити"
  if(state.activeTab === 'explore') {
    const root = $('#root');
    if(root) {
      root.innerHTML = exploreTabHTML();
      afterExploreMount();
    }
  }
  
  if(state.map) {
    drawPlaceMarkers(filtered);
  }
}

// Пресети цілей
const PURPOSE_PRESETS = {
  work: {
    name: 'Для роботи',
    radius: 1000,
    minRating: 4.0,
    openNow: true,
    sortBy: 'rating',
    keyword: ''
  },
  date: {
    name: 'Побачення',
    radius: 2000,
    minRating: 4.3,
    openNow: false,
    sortBy: 'smart',
    keyword: ''
  },
  friends: {
    name: 'З друзями',
    radius: 3000,
    minRating: 4.0,
    openNow: false,
    sortBy: 'reviews',
    keyword: ''
  },
  quick: {
    name: 'Швидка кава',
    radius: 500,
    minRating: 3.5,
    openNow: true,
    sortBy: 'distance',
    keyword: ''
  }
};

function applyPurposePreset(presetKey) {
  const preset = PURPOSE_PRESETS[presetKey];
  if(!preset) return;

  state.filters.radius = preset.radius;
  state.filters.minRating = preset.minRating;
  state.filters.openNow = preset.openNow;
  state.filters.sortBy = preset.sortBy;
  state.filters.keyword = preset.keyword;
  state.filters.purposePreset = presetKey;

  saveFilters();
  
  // Оновлюємо UI фільтрів
  if(state.activeTab === 'explore') {
    const root = $('#root');
    if(root) {
      root.innerHTML = exploreTabHTML();
      afterExploreMount();
    }
  }
  
  // Якщо змінився радіус або openNow, робимо новий пошук
  if(state.userPos) {
    searchNearbyWithFilters();
  } else {
    applyFilters();
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
      state.placesRaw = res;
      applyFilters();
    } else {
      console.warn('Помилка пошуку з фільтрами:', status);
      applyFilters(); // застосовуємо фільтри до наявних даних
    }
  });
}
