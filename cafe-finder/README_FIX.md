# Виправлення помилки 403 (RefererNotAllowedMapError)

## Проблема:
API ключ Google Maps обмежений певними доменами, і localhost не дозволений.

## Рішення:

### 1. Перейдіть до Google Cloud Console
   - Відкрийте: https://console.cloud.google.com/
   - Увійдіть в акаунт

### 2. Відкрийте налаштування API ключа
   - Dashboard → APIs & Services → Credentials
   - Знайдіть ваш ключ: `AIzaSyCb9cRlGECUzW0GDgWDWH-bqz9Qqr-IsLA`
   - Натисніть на назву ключа для редагування

### 3. Налаштуйте обмеження для Application restrictions
   - В розділі **Application restrictions** виберіть **HTTP referrers (websites)**
   - Натисніть **+ Add an item**
   - Додайте ці рядки:
     ```
     http://localhost/*
     http://127.0.0.1/*
     https://localhost/*
     https://127.0.0.1/*
     ```
   
### АБО для швидкого тестування (не рекомендовано для продакшену):
   - Виберіть **None** в обмеженнях
   - Це дозволить роботу з будь-якого домену

### 4. Переконайтесь що Places API увімкнений
   - Dashboard → APIs & Services → Library
   - Знайдіть "Places API"
   - Перевірте що він увімкнений (Enable)

### 5. Збережіть зміни і оновіть сторінку

## Альтернативний варіант (для розробки):
Якщо ви не можете змінити налаштування API ключа, можна тимчасово використати:
- VSCode Live Server
- Або інший локальний сервер
- Або використати публічний API ключ для тестування

---

**Важливо:** Зміни в Google Cloud Console можуть зайняти кілька хвилин для застосування.


