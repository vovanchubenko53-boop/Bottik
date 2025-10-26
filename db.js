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

// Создаем таблицы при инициализации
db.serialize(() => {
  // Таблица пользователей бота
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

  // Таблица событий
  db.run(
    `
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      start_date TEXT,
      end_date TEXT,
      location TEXT,
      organizer TEXT,
      status TEXT DEFAULT 'pending',
      approved_at TEXT,
      rejected_at TEXT,
      created_at TEXT NOT NULL,
      participants_count INTEGER DEFAULT 0
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы events:", err.message)
      else console.log("[v0] ✅ Таблица events готова")
    },
  )

  // Таблица расписаний
  db.run(
    `
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule_data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы schedules:", err.message)
      else console.log("[v0] ✅ Таблица schedules готова")
    },
  )

  // Таблица видео
  db.run(
    `
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      thumbnail_filename TEXT,
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      description TEXT,
      user_id TEXT,
      first_name TEXT,
      uploaded_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      approved_at TEXT,
      rejected_at TEXT
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы videos:", err.message)
      else console.log("[v0] ✅ Таблица videos готова")
    },
  )

  // Таблица фотографий
  db.run(
    `
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      event_id TEXT,
      description TEXT,
      user_id TEXT,
      first_name TEXT,
      uploaded_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      approved_at TEXT,
      rejected_at TEXT,
      album_id TEXT,
      album_index INTEGER,
      album_total INTEGER,
      unlock_count INTEGER DEFAULT 0,
      has_blur INTEGER DEFAULT 0,
      paid_unlocks INTEGER DEFAULT 0
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы photos:", err.message)
      else console.log("[v0] ✅ Таблица photos готова")
    },
  )

  // Таблица участников событий
  db.run(
    `
    CREATE TABLE IF NOT EXISTS event_participants (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      first_name TEXT,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (event_id, user_id)
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы event_participants:", err.message)
      else console.log("[v0] ✅ Таблица event_participants готова")
    },
  )

  // Таблица сообщений событий
  db.run(
    `
    CREATE TABLE IF NOT EXISTS event_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      first_name TEXT,
      message TEXT NOT NULL,
      photo_url TEXT,
      timestamp TEXT NOT NULL
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы event_messages:", err.message)
      else console.log("[v0] ✅ Таблица event_messages готова")
    },
  )

  // Таблица балансов Stars
  db.run(
    `
    CREATE TABLE IF NOT EXISTS user_stars_balances (
      user_id TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы user_stars_balances:", err.message)
      else console.log("[v0] ✅ Таблица user_stars_balances готова")
    },
  )

  // Таблица реакций на фото
  db.run(
    `
    CREATE TABLE IF NOT EXISTS photo_reactions (
      photo_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reaction TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (photo_id, user_id)
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы photo_reactions:", err.message)
      else console.log("[v0] ✅ Таблица photo_reactions готова")
    },
  )

  // Таблица разблокировок фото
  db.run(
    `
    CREATE TABLE IF NOT EXISTS photo_unlocks (
      photo_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (photo_id, user_id)
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы photo_unlocks:", err.message)
      else console.log("[v0] ✅ Таблица photo_unlocks готова")
    },
  )

  // Таблица ежедневных загрузок фото
  db.run(
    `
    CREATE TABLE IF NOT EXISTS daily_photo_uploads (
      user_date_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 0
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы daily_photo_uploads:", err.message)
      else console.log("[v0] ✅ Таблица daily_photo_uploads готова")
    },
  )

  // Таблица еженедельных блюр-фото
  db.run(
    `
    CREATE TABLE IF NOT EXISTS weekly_blur_photos (
      user_week_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      album_id TEXT
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы weekly_blur_photos:", err.message)
      else console.log("[v0] ✅ Таблица weekly_blur_photos готова")
    },
  )

  // Таблица заработков по фото
  db.run(
    `
    CREATE TABLE IF NOT EXISTS photo_earnings (
      photo_id TEXT PRIMARY KEY,
      earned INTEGER DEFAULT 0,
      last_payout INTEGER DEFAULT 0
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы photo_earnings:", err.message)
      else console.log("[v0] ✅ Таблица photo_earnings готова")
    },
  )

  // Таблица запросов на вывод
  db.run(
    `
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT,
      amount INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      processed_at TEXT,
      rejection_reason TEXT
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы withdrawal_requests:", err.message)
      else console.log("[v0] ✅ Таблица withdrawal_requests готова")
    },
  )

  // Таблица настроек админа
  db.run(
    `
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы admin_settings:", err.message)
      else console.log("[v0] ✅ Таблица admin_settings готова")
    },
  )

  // Таблица ограничений пользователей
  db.run(
    `
    CREATE TABLE IF NOT EXISTS user_restrictions (
      user_id TEXT PRIMARY KEY,
      photo_upload_restricted_until TEXT,
      video_upload_restricted_until TEXT,
      chat_restricted_until TEXT
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы user_restrictions:", err.message)
      else console.log("[v0] ✅ Таблица user_restrictions готова")
    },
  )

  // Таблица фото навигации
  db.run(
    `
    CREATE TABLE IF NOT EXISTS navigation_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы navigation_photos:", err.message)
      else console.log("[v0] ✅ Таблица navigation_photos готова")
    },
  )

  // Таблица расписаний пользователей
  db.run(
    `
    CREATE TABLE IF NOT EXISTS user_schedules (
      user_id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL
    )
  `,
    (err) => {
      if (err) console.error("[v0] ❌ Ошибка создания таблицы user_schedules:", err.message)
      else console.log("[v0] ✅ Таблица user_schedules готова")
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
