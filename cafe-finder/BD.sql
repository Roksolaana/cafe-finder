-- ========================================
-- CAFE FINDER DATABASE SCHEMA
-- Версія: 2.0 (з соціальним функціоналом)
-- ========================================

CREATE DATABASE IF NOT EXISTS cafefinder;
USE cafefinder;

-- ========================================
-- ОСНОВНІ ТАБЛИЦІ (оновлені)
-- ========================================

-- Таблиця користувачів (розширена)
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  surname VARCHAR(100) COMMENT 'Прізвище користувача',
  nickname VARCHAR(100) UNIQUE COMMENT 'Унікальний нікнейм',
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255),
  bio TEXT COMMENT 'Короткий опис користувача',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблиця відгуків (розширена)
CREATE TABLE IF NOT EXISTS reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  place_id VARCHAR(255) NOT NULL COMMENT 'Google Place ID',
  place_name VARCHAR(255) COMMENT 'Назва місця',
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT COMMENT 'Текст відгуку',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  INDEX idx_user (user_id),
  INDEX idx_place (place_id),
  INDEX idx_rating (rating),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- НОВІ ТАБЛИЦІ (соціальний функціонал)
-- ========================================

-- 1. Таблиця підписок
CREATE TABLE IF NOT EXISTS follows (
  follower_id INT NOT NULL COMMENT 'ID користувача, який підписується',
  following_id INT NOT NULL COMMENT 'ID користувача, на якого підписуються',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (follower_id, following_id),
  
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
  
  INDEX idx_follower (follower_id),
  INDEX idx_following (following_id),
  
  -- Перевірка: не можна підписатися на себе
  CHECK (follower_id != following_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Підписки між користувачами';

-- 2. Таблиця списків кав'ярень
CREATE TABLE IF NOT EXISTS lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT 'Власник списку',
  name VARCHAR(255) NOT NULL COMMENT 'Назва списку',
  description TEXT COMMENT 'Опис списку',
  is_public BOOLEAN DEFAULT true COMMENT 'Чи публічний список',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  INDEX idx_user (user_id),
  INDEX idx_public (is_public, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Списки кав\'ярень користувачів';

-- 3. Таблиця місць у списках
CREATE TABLE IF NOT EXISTS list_places (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_id INT NOT NULL COMMENT 'ID списку',
  place_id VARCHAR(255) NOT NULL COMMENT 'Google Place ID',
  place_name VARCHAR(255) COMMENT 'Назва кав\'ярні',
  place_photo VARCHAR(500) COMMENT 'URL фото',
  place_rating DECIMAL(2,1) COMMENT 'Рейтинг (з Google)',
  place_vicinity VARCHAR(500) COMMENT 'Адреса',
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  
  -- Унікальність: одне місце може бути лише раз в одному списку
  UNIQUE KEY unique_list_place (list_id, place_id),
  
  INDEX idx_list (list_id),
  INDEX idx_place (place_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Кав\'ярні в списках';

-- 4. Таблиця лайків відгуків
CREATE TABLE IF NOT EXISTS review_likes (
  user_id INT NOT NULL COMMENT 'Хто лайкнув',
  review_id INT NOT NULL COMMENT 'Який відгук',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (user_id, review_id),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  
  INDEX idx_review (review_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Лайки відгуків';

-- ========================================
-- МІГРАЦІЯ ДАНИХ З СТАРИХ ТАБЛИЦЬ
-- ========================================

-- Перенести favorites -> lists + list_places (якщо потрібно)
-- Виконуйте тільки якщо у вас є дані в favorites!

-- Крок 1: Створити список "Улюблені" для кожного користувача
INSERT IGNORE INTO lists (user_id, name, description, is_public)
SELECT DISTINCT 
  user_id, 
  'Улюблені', 
  'Автоматично перенесено зі старих улюблених',
  true
FROM favorites;

-- Крок 2: Перенести місця в списки
INSERT IGNORE INTO list_places (list_id, place_id, place_name, place_rating, place_vicinity, place_photo, added_at)
SELECT 
  l.id,
  f.place_id,
  f.name,
  f.rating,
  f.address,
  f.photo_url,
  f.created_at
FROM favorites f
JOIN lists l ON l.user_id = f.user_id AND l.name = 'Улюблені';

-- Крок 3: Видалити стару таблицю favorites (опціонально, після перевірки!)
-- DROP TABLE IF EXISTS favorites;

-- ========================================
-- ПЕРЕВІРКА СТВОРЕНИХ ТАБЛИЦЬ
-- ========================================

-- Показати всі таблиці
SHOW TABLES;

-- Перевірити структуру нових таблиць
DESCRIBE follows;
DESCRIBE lists;
DESCRIBE list_places;
DESCRIBE review_likes;

-- Підрахунок записів
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL
SELECT 'follows', COUNT(*) FROM follows
UNION ALL
SELECT 'lists', COUNT(*) FROM lists
UNION ALL
SELECT 'list_places', COUNT(*) FROM list_places
UNION ALL
SELECT 'review_likes', COUNT(*) FROM review_likes;

-- Перевірити foreign keys
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'cafefinder'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME;