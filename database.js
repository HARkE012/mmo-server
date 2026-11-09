import Database from 'better-sqlite3';

// Создаёт файл game.db в папке сервера
const db = new Database('game.db');

// Создаём таблицу пользователей, если её ещё нет
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    race TEXT NOT NULL
  )
`);

export default db;