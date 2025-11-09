const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function resetDatabase() {
  try {
    console.log('🧹 Starting database reset...');
    
    // Read the reset SQL script
    const sqlPath = path.join(__dirname, 'reset-database.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Create connection
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cafe_finder',
      multipleStatements: true
    });
    
    console.log('📡 Connected to database');
    
    // Execute the reset script
    await connection.query(sql);
    
    console.log('✅ Database reset completed successfully!');
    console.log('👤 Admin user created: admin@cafefinder.com (password: admin123)');
    console.log('👥 Test users created with sample reviews and data');
    
    await connection.end();
    
  } catch (error) {
    console.error('❌ Database reset failed:', error.message);
    process.exit(1);
  }
}

// Run the reset
resetDatabase();