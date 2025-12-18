<div align="center">

# ☕ Cafe Finder

### Знайди найкращу каву поруч

Веб-додаток для пошуку кав'ярень з інтеграцією Google Maps API, системою відгуків та персональними списками улюблених місць.

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org)
[![MySQL](https://img.shields.io/badge/mysql-%3E%3D5.7-orange.svg)](https://www.mysql.com/)

</div>

---

## ✨ Особливості

<table>
<tr>
<td width="50%">

### 🗺️ Інтерактивна карта
Пошук кав'ярень на Google Maps з автоматичною геолокацією

### 🔍 Розумні фільтри
- Радіус пошуку
- Мінімальний рейтинг
- Відкрито зараз

</td>
<td width="50%">

### 💖 Персоналізація
Улюблені місця, списки та відгуки

### ⭐ Соціальні функції
Діліться враженнями та читайте відгуки інших

</td>
</tr>
</table>

## 📸 Скріншоти

> *Додайте скріншоти вашого додатку тут*

## 🚀 Швидкий старт

### Передумови

Переконайтесь, що у вас встановлено:

- [Node.js](https://nodejs.org/) (версія 14 або вища)
- [MySQL](https://www.mysql.com/) (версія 5.7 або вища)
- [Google Maps API Key](https://developers.google.com/maps/documentation/javascript/get-api-key)

### Інсталяція

1. **Клонуйте репозиторій**

```bash
git clone https://github.com/yourusername/cafe-finder.git
cd cafe-finder
```

2. **Налаштуйте backend**

```bash
cd server
npm install
```

3. **Створіть файл `.env`**

```bash
cp .env.example .env
```

Відредагуйте `.env`:

```env
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=cafefinder
JWT_SECRET=your-secret-key-change-in-production
PORT=3001
UPLOAD_DIR=uploads
```

4. **Ініціалізуйте базу даних**

```bash
mysql -u your_db_user -p your_db_name < schema.sql
```

5. **Налаштуйте Google Maps API ключ**

Відкрийте `index.html` та замініть `YOUR_API_KEY`:

```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places"></script>
```

6. **Запустіть сервер**

```bash
node server.js
```

> ✅ Сервер запущено на `http://localhost:3001`

7. **Відкрийте додаток**

Просто відкрийте `index.html` у браузері або використайте локальний веб-сервер.

## 📁 Структура проекту

```
cafe-finder/
├── 📄 index.html          # Головна сторінка
├── 📜 script.js           # Frontend логіка
├── 🎨 styles.css          # Стилі додатку
├── 📖 README.md           # Ця документація
│
└── 📁 server/             # Backend API
    ├── server.js          # Express сервер
    ├── schema.sql         # Схема бази даних
    ├── auth.js            # JWT автентифікація
    ├── profile.js         # Управління профілем
    ├── reviews.js         # Система відгуків
    ├── lists.js           # Списки кав'ярень
    ├── package.json       # NPM залежності
    └── README.md          # API документація
```

## 🔧 Налаштування Google Maps API

<details>
<summary>Розгорнути інструкції</summary>

### Якщо отримуєте помилку `RefererNotAllowedMapError`:

1. Відкрийте [Google Cloud Console](https://console.cloud.google.com/)
2. Перейдіть до **APIs & Services → Credentials**
3. Оберіть ваш API ключ
4. В розділі **Application restrictions** виберіть **HTTP referrers (websites)**
5. Додайте дозволені домени:

```
http://localhost/*
http://127.0.0.1/*
https://yourdomain.com/*
```

6. Переконайтесь, що увімкнено:
   - ✅ Maps JavaScript API
   - ✅ Places API
   - ✅ Geolocation API

7. Збережіть зміни та почекайте кілька хвилин для застосування

</details>

## 📚 API Документація

Повна документація API доступна в [`server/README.md`](server/README.md)

### Основні endpoints

#### 🔐 Автентифікація

| Метод | Endpoint | Опис |
|-------|----------|------|
| `POST` | `/api/register` | Реєстрація нового користувача |
| `POST` | `/api/login` | Вхід в систему |

#### 👤 Профіль (потребує авторизації)

| Метод | Endpoint | Опис |
|-------|----------|------|
| `GET` | `/api/profile` | Отримати профіль користувача |
| `PUT` | `/api/profile` | Оновити дані профілю |
| `POST` | `/api/profile/avatar` | Завантажити аватар |

#### ⭐ Відгуки

| Метод | Endpoint | Опис |
|-------|----------|------|
| `POST` | `/api/reviews` | Створити новий відгук |
| `GET` | `/api/reviews` | Отримати список відгуків |
| `GET` | `/api/reviews/place/:place_id` | Відгуки для конкретного місця |
| `DELETE` | `/api/reviews/:id` | Видалити свій відгук |

#### 📝 Списки

| Метод | Endpoint | Опис |
|-------|----------|------|
| `POST` | `/api/lists` | Створити новий список |
| `GET` | `/api/lists` | Отримати списки користувача |
| `POST` | `/api/lists/:id/places` | Додати місце до списку |

## 🛠️ Технологічний стек

### Frontend
- ![JavaScript](https://img.shields.io/badge/-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) Vanilla JavaScript (ES6+)
- ![Google Maps](https://img.shields.io/badge/-Google_Maps-4285F4?style=flat-square&logo=google-maps&logoColor=white) Google Maps JavaScript API
- ![CSS3](https://img.shields.io/badge/-CSS3-1572B6?style=flat-square&logo=css3) CSS3 (Flexbox/Grid)

### Backend
- ![Node.js](https://img.shields.io/badge/-Node.js-339933?style=flat-square&logo=node.js&logoColor=white) Node.js + Express
- ![MySQL](https://img.shields.io/badge/-MySQL-4479A1?style=flat-square&logo=mysql&logoColor=white) MySQL
- ![JWT](https://img.shields.io/badge/-JWT-000000?style=flat-square&logo=json-web-tokens) JWT Authentication

### Бібліотеки
- `bcrypt` — хешування паролів
- `multer` — завантаження файлів
- `mysql2` — MySQL драйвер


Made with ❤️ and lots of ☕

</div>
