-- Reset and clean database for Cafe Finder
-- This script will clean all existing data and reset to fresh state

-- Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- Clean all tables
TRUNCATE TABLE review_likes;
TRUNCATE TABLE list_places;
TRUNCATE TABLE lists;
TRUNCATE TABLE follows;
TRUNCATE TABLE reviews;
TRUNCATE TABLE users;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Reset auto-increment counters
ALTER TABLE users AUTO_INCREMENT = 1;
ALTER TABLE lists AUTO_INCREMENT = 1;
ALTER TABLE reviews AUTO_INCREMENT = 1;
ALTER TABLE list_places AUTO_INCREMENT = 1;

-- Insert default admin user (password: admin123)
INSERT INTO users (name, email, password_hash, nickname) VALUES 
('Admin', 'admin@cafefinder.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Insert test users with better data
INSERT INTO users (name, surname, nickname, email, password_hash, bio) VALUES 
('Олена', 'Коваль', 'lena_coffee', 'olena@example.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Кавовий експерт та мандрівниця. Люблю знаходити затишні кав''ярні у Львові.'),
('Іван', 'Петренко', 'coffee_lover', 'ivan@example.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Шукаю найкращу каву в місті. Фотографую красиві місця.'),
('Марія', 'Сидоренко', 'mari_cafe', 'maria@example.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Бариста з досвідом. Ділюсь порадами про каву та кав''ярні.');

-- Insert sample reviews for testing
INSERT INTO reviews (user_id, place_id, place_name, rating, comment) VALUES 
(2, 'ChIJoRyG2ZtOKEcR2xBfP1i0D1U', 'Кав''ярня "Кава і Книги"', 5, 'Чудова атмосфера! Кава дуже смачна, особливо рекомендую їхній лате. Привітний персонал і затишний інтер''єр.'),
(3, 'ChIJoRyG2ZtOKEcR2xBfP1i0D1U', 'Кав''ярня "Кава і Книги"', 4, 'Гарне місце для роботи з ноутбуком. Wi-Fi швидкий, кава якісна. Трохи шумно ввечері.'),
(4, 'ChIJdT5fM8ZyL0cRkP9zX8Y0A2B', 'Cafe "Lviv Coffee"', 5, 'Найкраща кава в місті! Атмосфера чудова, персонал професійний. Обов''язково спробуйте їхній фірмовий десерт.'),
(2, 'ChIJdT5fM8ZyL0cRkP9zX8Y0A2B', 'Cafe "Lviv Coffee"', 4, 'Миле місце з гарним дизайном. Ціни трохи вищі за середні, але якість варта того.'),
(3, 'ChIKeR5xN9TzL0cRmQ8yY9Z1B3C', 'Coffee House "Central"', 3, 'Середня кава, нічого особливого. Підійде для швидкої перекуси.'),
(4, 'ChIKeR5xN9TzL0cRmQ8yY9Z1B3C', 'Coffee House "Central"', 4, 'Зручне розташування в центрі. Хороший вибір кави та десертів.');

-- Insert sample lists
INSERT INTO lists (user_id, name, description, is_public) VALUES 
(2, 'Улюблені кав''ярні', 'Мої улюблені місця для кави', 1),
(3, 'Кав''ярні для роботи', 'Тихі місця з Wi-Fi для роботи', 1),
(4, 'Краща кава в місті', 'Топ кав''ярні за якістю кави', 1);

-- Insert sample list places
INSERT INTO list_places (list_id, place_id, place_name, place_rating, place_vicinity) VALUES 
(1, 'ChIJoRyG2ZtOKEcR2xBfP1i0D1U', 'Кав''ярня "Кава і Книги"', 4.8, 'вул. Котляревського, 8, Львів'),
(1, 'ChIJdT5fM8ZyL0cRkP9zX8Y0A2B', 'Cafe "Lviv Coffee"', 4.9, 'вул. Руська, 12, Львів'),
(2, 'ChIJoRyG2ZtOKEcR2xBfP1i0D1U', 'Кав''ярня "Кава і Книги"', 4.8, 'вул. Котляревського, 8, Львів'),
(3, 'ChIJdT5fM8ZyL0cRkP9zX8Y0A2B', 'Cafe "Lviv Coffee"', 4.9, 'вул. Руська, 12, Львів');

-- Insert sample follows
INSERT INTO follows (follower_id, following_id) VALUES 
(2, 3),
(2, 4),
(3, 2),
(3, 4),
(4, 2),
(4, 3);