# API Документація - Cafe Finder

## Встановлення

1. Переконайтесь, що встановлені залежності:
```bash
cd server
npm install
```

2. Створіть файл `.env` з наступними змінними:
```
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=cafe_finder
JWT_SECRET=your-secret-key-change-in-production
PORT=3001
UPLOAD_DIR=uploads
```

3. Створіть базу даних та таблиці:
```sql
-- Виконайте SQL з schema.sql
mysql -u your_db_user -p your_db_name < schema.sql
```

## API Endpoints

### Авторизація

#### POST `/api/register`
Реєстрація нового користувача
```json
{
  "name": "Ім'я",
  "surname": "Прізвище",
  "nickname": "користувач",
  "email": "user@example.com",
  "password": "password123"
}
```

#### POST `/api/login`
Вхід користувача
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
Повертає: `{ token, user }`

### Профіль (потребує авторизації)

#### GET `/api/profile`
Отримати профіль поточного користувача
Headers: `Authorization: Bearer <token>`

#### PUT `/api/profile`
Оновити профіль
```json
{
  "name": "Нове ім'я",
  "email": "new@example.com"
}
```

#### POST `/api/profile/avatar`
Завантажити аватар
FormData: `avatar` (файл зображення)

### Відгуки

#### POST `/api/reviews`
Створити відгук (потребує авторизації)
```json
{
  "place_id": "ChIJ...",
  "place_name": "Назва кав'ярні",
  "rating": 5,
  "comment": "Чудове місце!"
}
```

#### GET `/api/reviews`
Отримати всі відгуки (опціональні query параметри):
- `place_id` - фільтр по місцю
- `user_id` - фільтр по користувачу

#### GET `/api/reviews/place/:place_id`
Отримати відгуки для конкретного місця

#### DELETE `/api/reviews/:id`
Видалити свій відгук (потребує авторизації)

## Запуск сервера

```bash
node server.js
```

Сервер запуститься на `http://localhost:3001`




