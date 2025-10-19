const sqlite3 = require("sqlite3").verbose()
const path = require("path")

// Создаем базу данных в папке data
const dbPath = path.join(__dirname, "data", "botUsers.db")
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("[v0] ❌ Ошибка подключения к базе данных:", err.message)
  } else {
    console.log("[v0] ✅ Подключено к базе данных SQLite:", dbPath)
  }
})

// Создаем таблицу пользователей при инициализации
db.serialize(() => {
  db.run(
    `
    CREATE TABLE IF NOT EXISTS bot_users (
      chat_id INTEGER PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      joined_at TEXT NOT NULL,
      last_interaction TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    )
  `,
    (err) => {
      if (err) {
        console.error("[v0] ❌ Ошибка создания таблицы bot_users:", err.message)
      } else {
        console.log("[v0] ✅ Таблица bot_users готова")
      }
    },
  )
})

// Функция для добавления или обновления пользователя
function saveUser(chatId, firstName, lastName, username) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString()

    db.run(
      `
      INSERT INTO bot_users (chat_id, first_name, last_name, username, joined_at, last_interaction, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(chat_id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        username = excluded.username,
        last_interaction = excluded.last_interaction,
        is_active = 1
    `,
      [chatId, firstName, lastName, username, now, now],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка сохранения пользователя:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Пользователь сохранен/обновлен:", chatId, firstName)
          resolve(this.changes)
        }
      },
    )
  })
}

// Функция для получения всех активных пользователей
function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT chat_id as chatId, first_name as firstName, last_name as lastName, 
             username, joined_at as joinedAt, last_interaction as lastInteraction
      FROM bot_users
      WHERE is_active = 1
      ORDER BY joined_at DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения пользователей:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено пользователей из БД:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

// Функция для получения количества пользователей
function getUserCount() {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT COUNT(*) as count
      FROM bot_users
      WHERE is_active = 1
    `,
      [],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка подсчета пользователей:", err.message)
          reject(err)
        } else {
          resolve(row.count)
        }
      },
    )
  })
}

// Функция для деактивации пользователя (мягкое удаление)
function deactivateUser(chatId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE bot_users
      SET is_active = 0
      WHERE chat_id = ?
    `,
      [chatId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка деактивации пользователя:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Пользователь деактивирован:", chatId)
          resolve(this.changes)
        }
      },
    )
  })
}

// Функция для миграции данных из JSON в SQLite
async function migrateFromJSON(jsonUsers) {
  console.log("[v0] 🔄 Начало миграции пользователей из JSON в SQLite...")
  let migrated = 0
  let skipped = 0

  for (const user of jsonUsers) {
    try {
      await saveUser(user.chatId, user.firstName, user.lastName || null, user.username || null)
      migrated++
    } catch (err) {
      console.error("[v0] ❌ Ошибка миграции пользователя:", user.chatId, err.message)
      skipped++
    }
  }

  console.log("[v0] ✅ Миграция завершена. Мигрировано:", migrated, "Пропущено:", skipped)
  return { migrated, skipped }
}

module.exports = {
  db,
  saveUser,
  getAllUsers,
  getUserCount,
  deactivateUser,
  migrateFromJSON,
}
