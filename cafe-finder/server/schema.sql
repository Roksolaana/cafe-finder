-- Cafe Finder MySQL schema

-- 1) Create database (optional)
CREATE DATABASE IF NOT EXISTS `cafefinder`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Use the database
USE `cafefinder`;

-- 2) Users table
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NULL,
  `surname` VARCHAR(100) NULL,
  `nickname` VARCHAR(50) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `avatar_url` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_nickname` (`nickname`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Reviews table
DROP TABLE IF EXISTS `reviews`;
CREATE TABLE `reviews` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `place_id` VARCHAR(64) NOT NULL, 
  `place_name` VARCHAR(255) NULL,
  `rating` TINYINT UNSIGNED NOT NULL, -- 1..5
  `comment` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reviews_user_id` (`user_id`),
  KEY `idx_reviews_place_id` (`place_id`),
  CONSTRAINT `fk_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_reviews_rating` CHECK (`rating` BETWEEN 1 AND 5),
  UNIQUE KEY `uq_reviews_user_place` (`user_id`, `place_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Lists table (custom user lists / collections)
DROP TABLE IF EXISTS `lists`;
CREATE TABLE `lists` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `is_public` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lists_user_id` (`user_id`),
  CONSTRAINT `fk_lists_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) List places (items inside a list)
DROP TABLE IF EXISTS `list_places`;
CREATE TABLE `list_places` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `list_id` INT UNSIGNED NOT NULL,
  `place_id` VARCHAR(64) NOT NULL,
  `place_name` VARCHAR(255) NULL,
  `place_photo` VARCHAR(255) NULL,
  `place_rating` DECIMAL(3,2) NULL, 
  `place_vicinity` VARCHAR(255) NULL,
  `added_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_list_places_list_id` (`list_id`),
  KEY `idx_list_places_place_id` (`place_id`),
  CONSTRAINT `fk_list_places_list` FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_list_places_unique` (`list_id`, `place_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Review likes table
DROP TABLE IF EXISTS `review_likes`;
CREATE TABLE `review_likes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `review_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_review_likes_review_id` (`review_id`),
  KEY `idx_review_likes_user_id` (`user_id`),
  CONSTRAINT `fk_review_likes_review` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_review_likes_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_review_likes_user_review` (`user_id`, `review_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7) User favorites table
DROP TABLE IF EXISTS `user_favorites`;
CREATE TABLE `user_favorites` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `place_id` VARCHAR(64) NOT NULL,
  `place_name` VARCHAR(255) NOT NULL,
  `place_photo` VARCHAR(500) NULL,
  `place_rating` DECIMAL(3,2) NULL,
  `place_vicinity` VARCHAR(255) NULL,
  `place_geometry_lat` DECIMAL(10,8) NULL,
  `place_geometry_lng` DECIMAL(11,8) NULL,
  `added_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_favorites_user_id` (`user_id`),
  KEY `idx_user_favorites_place_id` (`place_id`),
  CONSTRAINT `fk_user_favorites_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_user_favorites_user_place` (`user_id`, `place_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


