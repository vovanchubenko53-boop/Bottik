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
      filename TEXT NOT NULL UNIQUE,
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

// ============== МИГРАЦИОННЫЕ ФУНКЦИИ ==============

const fs = require("fs").promises
const fsSync = require("fs")

// Вспомогательная функция для выполнения SQL в транзакции
function runInTransaction(queries) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION", (err) => {
        if (err) {
          reject(err)
          return
        }

        let completed = 0
        let hasError = false

        const checkComplete = () => {
          if (completed === queries.length && !hasError) {
            db.run("COMMIT", (err) => {
              if (err) {
                reject(err)
              } else {
                resolve()
              }
            })
          }
        }

        queries.forEach((query) => {
          db.run(query.sql, query.params || [], (err) => {
            if (err && !hasError) {
              hasError = true
              db.run("ROLLBACK", () => {
                reject(err)
              })
            } else if (!hasError) {
              completed++
              checkComplete()
            }
          })
        })
      })
    })
  })
}

// 1. Миграция событий (events)
function insertEvent(event) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO events (
        id, title, description, start_date, end_date, location, organizer,
        status, approved_at, rejected_at, created_at, participants_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        event.id,
        event.title,
        event.description || null,
        event.startDate || null,
        event.endDate || null,
        event.location || null,
        event.organizer || null,
        event.status || "pending",
        event.approvedAt || null,
        event.rejectedAt || null,
        event.createdAt || new Date().toISOString(),
        event.participantsCount || 0,
      ],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 2. Миграция расписаний (schedules)
function insertSchedule(schedule) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO schedules (id, name, schedule_data, created_at)
      VALUES (?, ?, ?, ?)
    `,
      [
        schedule.id,
        schedule.name,
        typeof schedule.scheduleData === "string"
          ? schedule.scheduleData
          : JSON.stringify(schedule.scheduleData),
        schedule.createdAt || new Date().toISOString(),
      ],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 3. Миграция видео (videos)
function insertVideo(video) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO videos (
        id, filename, thumbnail_filename, url, thumbnail_url, description,
        user_id, first_name, uploaded_at, status, approved_at, rejected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        video.id,
        video.filename,
        video.thumbnailFilename || null,
        video.url,
        video.thumbnailUrl || null,
        video.description || null,
        video.userId || null,
        video.firstName || null,
        video.uploadedAt || new Date().toISOString(),
        video.status || "pending",
        video.approvedAt || null,
        video.rejectedAt || null,
      ],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 4. Миграция фотографий (photos)
function insertPhoto(photo) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO photos (
        id, filename, url, event_id, description, user_id, first_name,
        uploaded_at, status, approved_at, rejected_at, album_id, album_index,
        album_total, unlock_count, has_blur, paid_unlocks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        photo.id,
        photo.filename,
        photo.url,
        photo.eventId || null,
        photo.description || null,
        photo.userId || null,
        photo.firstName || null,
        photo.uploadedAt || new Date().toISOString(),
        photo.status || "pending",
        photo.approvedAt || null,
        photo.rejectedAt || null,
        photo.albumId || null,
        photo.albumIndex || null,
        photo.albumTotal || null,
        photo.unlockCount || 0,
        photo.hasBlur || 0,
        photo.paidUnlocks || 0,
      ],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 5. Миграция фото навигации (navigation_photos)
async function insertNavigationPhoto(navPhoto, uploadsDir) {
  return new Promise(async (resolve, reject) => {
    let uploadedAt = navPhoto.uploadedAt || navPhoto.uploaded_at

    // Если uploaded_at отсутствует, пытаемся получить из file stats
    if (!uploadedAt && navPhoto.filename && uploadsDir) {
      try {
        const filePath = path.join(uploadsDir, "navigation", navPhoto.filename)
        const stats = await fs.stat(filePath)
        uploadedAt = stats.birthtime.toISOString()
      } catch (err) {
        console.log("[v0] ⚠️ Не удалось получить время создания файла:", navPhoto.filename)
        uploadedAt = new Date().toISOString()
      }
    }

    if (!uploadedAt) {
      uploadedAt = new Date().toISOString()
    }

    db.run(
      `
      INSERT INTO navigation_photos (filename, url, uploaded_at)
      VALUES (?, ?, ?)
      ON CONFLICT(filename) DO UPDATE SET
        url = excluded.url,
        uploaded_at = excluded.uploaded_at
    `,
      [navPhoto.filename, navPhoto.url, uploadedAt],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 6. Миграция участников событий (event_participants)
function insertEventParticipant(eventId, participant) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO event_participants (event_id, user_id, first_name, joined_at)
      VALUES (?, ?, ?, ?)
    `,
      [
        eventId,
        participant.userId || participant.id,
        participant.firstName || null,
        participant.joinedAt || new Date().toISOString(),
      ],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 7. Миграция сообщений событий (event_messages)
function insertEventMessage(eventId, message) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO event_messages (event_id, user_id, first_name, message, photo_url, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [
        eventId,
        message.userId,
        message.firstName || null,
        message.message,
        message.photoUrl || null,
        message.timestamp || new Date().toISOString(),
      ],
      function (err) {
        if (err) reject(err)
        else resolve(this.lastID)
      },
    )
  })
}

// 8. Миграция балансов Stars (user_stars_balances)
function insertUserStarsBalance(userId, balance) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO user_stars_balances (user_id, balance, updated_at)
      VALUES (?, ?, ?)
    `,
      [userId, balance, new Date().toISOString()],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 9. Миграция реакций на фото (photo_reactions)
function insertPhotoReaction(photoId, userId, reaction) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO photo_reactions (photo_id, user_id, reaction, created_at)
      VALUES (?, ?, ?, ?)
    `,
      [photoId, userId, reaction, new Date().toISOString()],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 10. Миграция разблокировок фото (photo_unlocks)
function insertPhotoUnlock(photoId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO photo_unlocks (photo_id, user_id, unlocked_at)
      VALUES (?, ?, ?)
    `,
      [photoId, userId, new Date().toISOString()],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 11. Миграция ежедневных загрузок фото (daily_photo_uploads)
function insertDailyPhotoUpload(userId, date, count) {
  return new Promise((resolve, reject) => {
    const userDateKey = `${userId}_${date}`
    db.run(
      `
      INSERT OR REPLACE INTO daily_photo_uploads (user_date_key, user_id, date, count)
      VALUES (?, ?, ?, ?)
    `,
      [userDateKey, userId, date, count],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 12. Миграция еженедельных блюр-фото (weekly_blur_photos)
function insertWeeklyBlurPhoto(userId, weekStart, albumId) {
  return new Promise((resolve, reject) => {
    const userWeekKey = `${userId}_${weekStart}`
    db.run(
      `
      INSERT OR REPLACE INTO weekly_blur_photos (user_week_key, user_id, week_start, album_id)
      VALUES (?, ?, ?, ?)
    `,
      [userWeekKey, userId, weekStart, albumId || null],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 13. Миграция заработков по фото (photo_earnings)
function insertPhotoEarning(photoId, earned, lastPayout) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO photo_earnings (photo_id, earned, last_payout)
      VALUES (?, ?, ?)
    `,
      [photoId, earned || 0, lastPayout || 0],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 14. Миграция запросов на вывод (withdrawal_requests)
function insertWithdrawalRequest(request) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO withdrawal_requests (
        id, user_id, username, amount, balance, status, created_at, processed_at, rejection_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        request.id,
        request.userId,
        request.username || null,
        request.amount,
        request.balance,
        request.status || "pending",
        request.createdAt || new Date().toISOString(),
        request.processedAt || null,
        request.rejectionReason || null,
      ],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 15. Миграция настроек админа (admin_settings)
function insertAdminSetting(key, value) {
  return new Promise((resolve, reject) => {
    // Если value - объект, сериализуем в JSON
    const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value)

    db.run(
      `
      INSERT OR REPLACE INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `,
      [key, valueStr, new Date().toISOString()],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 16. Миграция ограничений пользователей (user_restrictions)
function insertUserRestriction(userId, restrictions) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO user_restrictions (
        user_id, photo_upload_restricted_until, video_upload_restricted_until, chat_restricted_until
      ) VALUES (?, ?, ?, ?)
    `,
      [
        userId,
        restrictions.photoUploadRestrictedUntil || null,
        restrictions.videoUploadRestrictedUntil || null,
        restrictions.chatRestrictedUntil || null,
      ],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// 17. Миграция расписаний пользователей (user_schedules)
function insertUserSchedule(userId, scheduleId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO user_schedules (user_id, schedule_id, assigned_at)
      VALUES (?, ?, ?)
    `,
      [userId, scheduleId, new Date().toISOString()],
      function (err) {
        if (err) reject(err)
        else resolve(this.changes)
      },
    )
  })
}

// ============== ГЛАВНАЯ ФУНКЦИЯ МИГРАЦИИ ==============

async function migrateAllData(dataDir = path.join(__dirname, "data")) {
  console.log("[v0] 🚀 ========== НАЧАЛО ПОЛНОЙ МИГРАЦИИ ==========")
  const startTime = Date.now()
  const stats = {
    events: 0,
    schedules: 0,
    videos: 0,
    photos: 0,
    navigationPhotos: 0,
    eventParticipants: 0,
    eventMessages: 0,
    photoReactions: 0,
    photoUnlocks: 0,
    photoEarnings: 0,
    userStarsBalances: 0,
    withdrawalRequests: 0,
    dailyPhotoUploads: 0,
    weeklyBlurPhotos: 0,
    adminSettings: 0,
    userRestrictions: 0,
    userSchedules: 0,
    botUsers: 0,
  }

  try {
    // Шаг 1: Создание резервных копий
    console.log("[v0] 📦 Создание резервных копий JSON файлов...")
    const backupDir = path.join(dataDir, "backup")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = path.join(backupDir, timestamp)

    if (!fsSync.existsSync(backupDir)) {
      await fs.mkdir(backupDir, { recursive: true })
    }
    await fs.mkdir(backupPath, { recursive: true })

    const jsonFiles = [
      "events.json",
      "schedules.json",
      "videos.json",
      "photos.json",
      "navigationPhotos.json",
      "eventParticipants.json",
      "eventMessages.json",
      "photoReactions.json",
      "photoUnlocks.json",
      "photoEarnings.json",
      "userStarsBalances.json",
      "withdrawalRequests.json",
      "dailyPhotoUploads.json",
      "weeklyBlurPhotos.json",
      "adminSettings.json",
      "userRestrictions.json",
      "userSchedules.json",
      "botUsers.json",
    ]

    for (const file of jsonFiles) {
      const sourcePath = path.join(dataDir, file)
      const destPath = path.join(backupPath, file)
      try {
        await fs.copyFile(sourcePath, destPath)
        console.log(`[v0] ✅ Создан backup: ${file}`)
      } catch (err) {
        console.log(`[v0] ⚠️ Файл не найден: ${file} (пропускаем)`)
      }
    }

    // Шаг 2: Миграция базовых таблиц (без зависимостей)
    console.log("\n[v0] 📋 Миграция базовых таблиц...")

    // 2.1 Events
    try {
      const eventsData = JSON.parse(await fs.readFile(path.join(dataDir, "events.json"), "utf-8"))
      for (const event of eventsData) {
        await insertEvent(event)
        stats.events++
      }
      console.log(`[v0] ✅ События: ${stats.events}`)
    } catch (err) {
      console.log("[v0] ⚠️ events.json не найден или пуст")
    }

    // 2.2 Schedules
    try {
      const schedulesData = JSON.parse(await fs.readFile(path.join(dataDir, "schedules.json"), "utf-8"))
      for (const schedule of schedulesData) {
        await insertSchedule(schedule)
        stats.schedules++
      }
      console.log(`[v0] ✅ Расписания: ${stats.schedules}`)
    } catch (err) {
      console.log("[v0] ⚠️ schedules.json не найден или пуст")
    }

    // 2.3 Videos
    try {
      const videosData = JSON.parse(await fs.readFile(path.join(dataDir, "videos.json"), "utf-8"))
      for (const video of videosData) {
        await insertVideo(video)
        stats.videos++
      }
      console.log(`[v0] ✅ Видео: ${stats.videos}`)
    } catch (err) {
      console.log("[v0] ⚠️ videos.json не найден или пуст")
    }

    // 2.4 Photos
    try {
      const photosData = JSON.parse(await fs.readFile(path.join(dataDir, "photos.json"), "utf-8"))
      for (const photo of photosData) {
        await insertPhoto(photo)
        stats.photos++
      }
      console.log(`[v0] ✅ Фотографии: ${stats.photos}`)
    } catch (err) {
      console.log("[v0] ⚠️ photos.json не найден или пуст")
    }

    // 2.5 Navigation Photos
    try {
      const navPhotosData = JSON.parse(await fs.readFile(path.join(dataDir, "navigationPhotos.json"), "utf-8"))
      const uploadsDir = path.join(__dirname, "uploads")
      for (const navPhoto of navPhotosData) {
        await insertNavigationPhoto(navPhoto, uploadsDir)
        stats.navigationPhotos++
      }
      console.log(`[v0] ✅ Фото навигации: ${stats.navigationPhotos}`)
    } catch (err) {
      console.log("[v0] ⚠️ navigationPhotos.json не найден или пуст")
    }

    // Шаг 3: Миграция зависимых таблиц (зависят от events)
    console.log("\n[v0] 👥 Миграция данных событий...")

    // 3.1 Event Participants
    try {
      const participantsData = JSON.parse(
        await fs.readFile(path.join(dataDir, "eventParticipants.json"), "utf-8"),
      )
      for (const [eventId, participants] of Object.entries(participantsData)) {
        if (Array.isArray(participants)) {
          for (const participant of participants) {
            await insertEventParticipant(eventId, participant)
            stats.eventParticipants++
          }
        }
      }
      console.log(`[v0] ✅ Участники событий: ${stats.eventParticipants}`)
    } catch (err) {
      console.log("[v0] ⚠️ eventParticipants.json не найден или пуст")
    }

    // 3.2 Event Messages
    try {
      const messagesData = JSON.parse(await fs.readFile(path.join(dataDir, "eventMessages.json"), "utf-8"))
      for (const [eventId, messages] of Object.entries(messagesData)) {
        if (Array.isArray(messages)) {
          for (const message of messages) {
            await insertEventMessage(eventId, message)
            stats.eventMessages++
          }
        }
      }
      console.log(`[v0] ✅ Сообщения событий: ${stats.eventMessages}`)
    } catch (err) {
      console.log("[v0] ⚠️ eventMessages.json не найден или пуст")
    }

    // Шаг 4: Миграция данных фото (зависят от photos)
    console.log("\n[v0] 📸 Миграция данных фотографий...")

    // 4.1 Photo Reactions
    try {
      const reactionsData = JSON.parse(await fs.readFile(path.join(dataDir, "photoReactions.json"), "utf-8"))
      for (const [photoId, reactions] of Object.entries(reactionsData)) {
        if (typeof reactions === "object" && !Array.isArray(reactions)) {
          for (const [userId, reaction] of Object.entries(reactions)) {
            await insertPhotoReaction(photoId, userId, reaction)
            stats.photoReactions++
          }
        }
      }
      console.log(`[v0] ✅ Реакции на фото: ${stats.photoReactions}`)
    } catch (err) {
      console.log("[v0] ⚠️ photoReactions.json не найден или пуст")
    }

    // 4.2 Photo Unlocks
    try {
      const unlocksData = JSON.parse(await fs.readFile(path.join(dataDir, "photoUnlocks.json"), "utf-8"))
      for (const [photoId, userIds] of Object.entries(unlocksData)) {
        if (Array.isArray(userIds)) {
          for (const userId of userIds) {
            await insertPhotoUnlock(photoId, userId)
            stats.photoUnlocks++
          }
        }
      }
      console.log(`[v0] ✅ Разблокировки фото: ${stats.photoUnlocks}`)
    } catch (err) {
      console.log("[v0] ⚠️ photoUnlocks.json не найден или пуст")
    }

    // 4.3 Photo Earnings
    try {
      const earningsData = JSON.parse(await fs.readFile(path.join(dataDir, "photoEarnings.json"), "utf-8"))
      for (const [photoId, earning] of Object.entries(earningsData)) {
        await insertPhotoEarning(photoId, earning.earned, earning.lastPayout)
        stats.photoEarnings++
      }
      console.log(`[v0] ✅ Заработки по фото: ${stats.photoEarnings}`)
    } catch (err) {
      console.log("[v0] ⚠️ photoEarnings.json не найден или пуст")
    }

    // Шаг 5: Миграция пользовательских данных
    console.log("\n[v0] 💰 Миграция пользовательских данных...")

    // 5.1 User Stars Balances
    try {
      const balancesData = JSON.parse(await fs.readFile(path.join(dataDir, "userStarsBalances.json"), "utf-8"))
      for (const [userId, balance] of Object.entries(balancesData)) {
        await insertUserStarsBalance(userId, balance)
        stats.userStarsBalances++
      }
      console.log(`[v0] ✅ Балансы Stars: ${stats.userStarsBalances}`)
    } catch (err) {
      console.log("[v0] ⚠️ userStarsBalances.json не найден или пуст")
    }

    // 5.2 Withdrawal Requests
    try {
      const withdrawalsData = JSON.parse(await fs.readFile(path.join(dataDir, "withdrawalRequests.json"), "utf-8"))
      // Может быть объектом с id в качестве ключей или массивом
      const withdrawalsList = Array.isArray(withdrawalsData)
        ? withdrawalsData
        : Object.values(withdrawalsData)
      for (const request of withdrawalsList) {
        if (request && request.id) {
          await insertWithdrawalRequest(request)
          stats.withdrawalRequests++
        }
      }
      console.log(`[v0] ✅ Запросы на вывод: ${stats.withdrawalRequests}`)
    } catch (err) {
      console.log("[v0] ⚠️ withdrawalRequests.json не найден или пуст")
    }

    // Шаг 6: Миграция составных ключей
    console.log("\n[v0] 🔑 Миграция данных с составными ключами...")

    // 6.1 Daily Photo Uploads
    try {
      const dailyUploadsData = JSON.parse(await fs.readFile(path.join(dataDir, "dailyPhotoUploads.json"), "utf-8"))
      for (const [key, count] of Object.entries(dailyUploadsData)) {
        const [userId, date] = key.split("_")
        if (userId && date) {
          await insertDailyPhotoUpload(userId, date, count)
          stats.dailyPhotoUploads++
        }
      }
      console.log(`[v0] ✅ Ежедневные загрузки: ${stats.dailyPhotoUploads}`)
    } catch (err) {
      console.log("[v0] ⚠️ dailyPhotoUploads.json не найден или пуст")
    }

    // 6.2 Weekly Blur Photos
    try {
      const weeklyBlurData = JSON.parse(await fs.readFile(path.join(dataDir, "weeklyBlurPhotos.json"), "utf-8"))
      for (const [key, albumId] of Object.entries(weeklyBlurData)) {
        const [userId, weekStart] = key.split("_")
        if (userId && weekStart) {
          await insertWeeklyBlurPhoto(userId, weekStart, albumId)
          stats.weeklyBlurPhotos++
        }
      }
      console.log(`[v0] ✅ Еженедельные блюр-фото: ${stats.weeklyBlurPhotos}`)
    } catch (err) {
      console.log("[v0] ⚠️ weeklyBlurPhotos.json не найден или пуст")
    }

    // Шаг 7: Миграция настроек и ограничений
    console.log("\n[v0] ⚙️ Миграция настроек и ограничений...")

    // 7.1 Admin Settings
    try {
      const adminSettingsData = JSON.parse(await fs.readFile(path.join(dataDir, "adminSettings.json"), "utf-8"))
      for (const [key, value] of Object.entries(adminSettingsData)) {
        await insertAdminSetting(key, value)
        stats.adminSettings++
      }
      console.log(`[v0] ✅ Настройки админа: ${stats.adminSettings}`)
    } catch (err) {
      console.log("[v0] ⚠️ adminSettings.json не найден или пуст")
    }

    // 7.2 User Restrictions
    try {
      const restrictionsData = JSON.parse(await fs.readFile(path.join(dataDir, "userRestrictions.json"), "utf-8"))
      for (const [userId, restrictions] of Object.entries(restrictionsData)) {
        await insertUserRestriction(userId, restrictions)
        stats.userRestrictions++
      }
      console.log(`[v0] ✅ Ограничения пользователей: ${stats.userRestrictions}`)
    } catch (err) {
      console.log("[v0] ⚠️ userRestrictions.json не найден или пуст")
    }

    // 7.3 User Schedules (если есть отдельный файл)
    try {
      const userSchedulesData = JSON.parse(await fs.readFile(path.join(dataDir, "userSchedules.json"), "utf-8"))
      for (const [userId, scheduleId] of Object.entries(userSchedulesData)) {
        await insertUserSchedule(userId, scheduleId)
        stats.userSchedules++
      }
      console.log(`[v0] ✅ Расписания пользователей: ${stats.userSchedules}`)
    } catch (err) {
      console.log("[v0] ⚠️ userSchedules.json не найден или пуст")
    }

    // Шаг 8: Миграция пользователей бота (если еще не мигрированы)
    try {
      const botUsersData = JSON.parse(await fs.readFile(path.join(dataDir, "botUsers.json"), "utf-8"))
      for (const user of botUsersData) {
        await saveUser(user.chatId, user.firstName, user.lastName || null, user.username || null)
        stats.botUsers++
      }
      console.log(`[v0] ✅ Пользователи бота: ${stats.botUsers}`)
    } catch (err) {
      console.log("[v0] ⚠️ botUsers.json не найден или пуст")
    }

    // Итоговая статистика
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log("\n[v0] 🎉 ========== МИГРАЦИЯ ЗАВЕРШЕНА ==========")
    console.log("[v0] ⏱️ Время выполнения:", duration, "секунд")
    console.log("[v0] 📊 Статистика миграции:")
    console.log(`
      События:                ${stats.events}
      Расписания:             ${stats.schedules}
      Видео:                  ${stats.videos}
      Фотографии:             ${stats.photos}
      Фото навигации:         ${stats.navigationPhotos}
      Участники событий:      ${stats.eventParticipants}
      Сообщения событий:      ${stats.eventMessages}
      Реакции на фото:        ${stats.photoReactions}
      Разблокировки фото:     ${stats.photoUnlocks}
      Заработки по фото:      ${stats.photoEarnings}
      Балансы Stars:          ${stats.userStarsBalances}
      Запросы на вывод:       ${stats.withdrawalRequests}
      Ежедневные загрузки:    ${stats.dailyPhotoUploads}
      Еженедельные блюр-фото: ${stats.weeklyBlurPhotos}
      Настройки админа:       ${stats.adminSettings}
      Ограничения польз.:     ${stats.userRestrictions}
      Расписания польз.:      ${stats.userSchedules}
      Пользователи бота:      ${stats.botUsers}
    `)
    console.log("[v0] 💾 Резервные копии сохранены в:", backupPath)

    return stats
  } catch (error) {
    console.error("[v0] ❌ Критическая ошибка миграции:", error)
    throw error
  }
}

// ============== CRUD FUNCTIONS ==============

// ===== 1. EVENTS TABLE =====

function getAllEvents() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM events
      WHERE status = 'approved'
      ORDER BY start_date DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения событий:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено событий:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function getEventById(eventId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM events
      WHERE id = ?
    `,
      [eventId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения события:", err.message)
          reject(err)
        } else {
          resolve(row)
        }
      },
    )
  })
}

function updateEvent(eventId, updates) {
  return new Promise((resolve, reject) => {
    const fields = []
    const values = []

    if (updates.title !== undefined) {
      fields.push("title = ?")
      values.push(updates.title)
    }
    if (updates.description !== undefined) {
      fields.push("description = ?")
      values.push(updates.description)
    }
    if (updates.startDate !== undefined) {
      fields.push("start_date = ?")
      values.push(updates.startDate)
    }
    if (updates.endDate !== undefined) {
      fields.push("end_date = ?")
      values.push(updates.endDate)
    }
    if (updates.location !== undefined) {
      fields.push("location = ?")
      values.push(updates.location)
    }
    if (updates.organizer !== undefined) {
      fields.push("organizer = ?")
      values.push(updates.organizer)
    }

    if (fields.length === 0) {
      return resolve(0)
    }

    values.push(eventId)

    db.run(
      `UPDATE events SET ${fields.join(", ")} WHERE id = ?`,
      values,
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления события:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Событие обновлено:", eventId)
          resolve(this.changes)
        }
      },
    )
  })
}

function updateEventStatus(eventId, status, timestamp) {
  return new Promise((resolve, reject) => {
    const field = status === "approved" ? "approved_at" : "rejected_at"

    db.run(
      `
      UPDATE events
      SET status = ?, ${field} = ?
      WHERE id = ?
    `,
      [status, timestamp || new Date().toISOString(), eventId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления статуса события:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Статус события обновлен:", eventId, status)
          resolve(this.changes)
        }
      },
    )
  })
}

function deleteEvent(eventId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM events
      WHERE id = ?
    `,
      [eventId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления события:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Событие удалено:", eventId)
          resolve(this.changes)
        }
      },
    )
  })
}

function incrementEventParticipants(eventId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE events
      SET participants_count = participants_count + 1
      WHERE id = ?
    `,
      [eventId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка инкремента участников:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Участники события увеличены:", eventId)
          resolve(this.changes)
        }
      },
    )
  })
}

function decrementEventParticipants(eventId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE events
      SET participants_count = CASE
        WHEN participants_count > 0 THEN participants_count - 1
        ELSE 0
      END
      WHERE id = ?
    `,
      [eventId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка декремента участников:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Участники события уменьшены:", eventId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 2. EVENT PARTICIPANTS =====

function getEventParticipants(eventId) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM event_participants
      WHERE event_id = ?
      ORDER BY joined_at DESC
    `,
      [eventId],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения участников события:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено участников события:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function checkUserJoinedEvent(eventId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM event_participants
      WHERE event_id = ? AND user_id = ?
    `,
      [eventId, userId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка проверки участия:", err.message)
          reject(err)
        } else {
          resolve(!!row)
        }
      },
    )
  })
}

function deleteEventParticipant(eventId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM event_participants
      WHERE event_id = ? AND user_id = ?
    `,
      [eventId, userId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления участника:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Участник удален:", userId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 3. EVENT MESSAGES =====

function getEventMessages(eventId) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM event_messages
      WHERE event_id = ?
      ORDER BY timestamp ASC
    `,
      [eventId],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения сообщений события:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено сообщений события:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function deleteEventMessage(messageId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM event_messages
      WHERE id = ?
    `,
      [messageId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления сообщения:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Сообщение удалено:", messageId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 4. PHOTOS =====

function getAllApprovedPhotos() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM photos
      WHERE status = 'approved'
      ORDER BY uploaded_at DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения фотографий:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено фотографий:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function getPhotoById(photoId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM photos
      WHERE id = ?
    `,
      [photoId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения фотографии:", err.message)
          reject(err)
        } else {
          resolve(row)
        }
      },
    )
  })
}

function getPhotosByEvent(eventId) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM photos
      WHERE event_id = ? AND status = 'approved'
      ORDER BY uploaded_at DESC
    `,
      [eventId],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения фото события:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено фото события:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function updatePhoto(photoId, updates) {
  return new Promise((resolve, reject) => {
    const fields = []
    const values = []

    if (updates.description !== undefined) {
      fields.push("description = ?")
      values.push(updates.description)
    }
    if (updates.eventId !== undefined) {
      fields.push("event_id = ?")
      values.push(updates.eventId)
    }
    if (updates.albumId !== undefined) {
      fields.push("album_id = ?")
      values.push(updates.albumId)
    }
    if (updates.hasBlur !== undefined) {
      fields.push("has_blur = ?")
      values.push(updates.hasBlur)
    }

    if (fields.length === 0) {
      return resolve(0)
    }

    values.push(photoId)

    db.run(
      `UPDATE photos SET ${fields.join(", ")} WHERE id = ?`,
      values,
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления фото:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Фото обновлено:", photoId)
          resolve(this.changes)
        }
      },
    )
  })
}

function updatePhotoStatus(photoId, status, timestamp) {
  return new Promise((resolve, reject) => {
    const field = status === "approved" ? "approved_at" : "rejected_at"

    db.run(
      `
      UPDATE photos
      SET status = ?, ${field} = ?
      WHERE id = ?
    `,
      [status, timestamp || new Date().toISOString(), photoId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления статуса фото:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Статус фото обновлен:", photoId, status)
          resolve(this.changes)
        }
      },
    )
  })
}

function incrementPhotoUnlockCount(photoId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE photos
      SET unlock_count = unlock_count + 1
      WHERE id = ?
    `,
      [photoId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка инкремента разблокировок:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Разблокировки фото увеличены:", photoId)
          resolve(this.changes)
        }
      },
    )
  })
}

function incrementPhotoPaidUnlocks(photoId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE photos
      SET paid_unlocks = paid_unlocks + 1
      WHERE id = ?
    `,
      [photoId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка инкремента платных разблокировок:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Платные разблокировки фото увеличены:", photoId)
          resolve(this.changes)
        }
      },
    )
  })
}

function deletePhoto(photoId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM photos
      WHERE id = ?
    `,
      [photoId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления фото:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Фото удалено:", photoId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 5. PHOTO REACTIONS =====

function getPhotoReactions(photoId) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM photo_reactions
      WHERE photo_id = ?
      ORDER BY created_at DESC
    `,
      [photoId],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения реакций:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено реакций:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function deletePhotoReaction(photoId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM photo_reactions
      WHERE photo_id = ? AND user_id = ?
    `,
      [photoId, userId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления реакции:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Реакция удалена:", photoId, userId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 6. PHOTO UNLOCKS =====

function getPhotoUnlocks(photoId) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM photo_unlocks
      WHERE photo_id = ?
      ORDER BY unlocked_at DESC
    `,
      [photoId],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения разблокировок:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено разблокировок:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function checkPhotoUnlocked(photoId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM photo_unlocks
      WHERE photo_id = ? AND user_id = ?
    `,
      [photoId, userId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка проверки разблокировки:", err.message)
          reject(err)
        } else {
          resolve(!!row)
        }
      },
    )
  })
}

function deletePhotoUnlock(photoId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM photo_unlocks
      WHERE photo_id = ? AND user_id = ?
    `,
      [photoId, userId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления разблокировки:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Разблокировка удалена:", photoId, userId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 7. VIDEOS =====

function getAllApprovedVideos() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM videos
      WHERE status = 'approved'
      ORDER BY uploaded_at DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения видео:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено видео:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function getAllPendingVideos() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM videos
      WHERE status = 'pending'
      ORDER BY uploaded_at DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения ожидающих видео:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено ожидающих видео:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function getVideoById(videoId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM videos
      WHERE id = ?
    `,
      [videoId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения видео:", err.message)
          reject(err)
        } else {
          resolve(row)
        }
      },
    )
  })
}

function updateVideoStatus(videoId, status, timestamp) {
  return new Promise((resolve, reject) => {
    const field = status === "approved" ? "approved_at" : "rejected_at"

    db.run(
      `
      UPDATE videos
      SET status = ?, ${field} = ?
      WHERE id = ?
    `,
      [status, timestamp || new Date().toISOString(), videoId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления статуса видео:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Статус видео обновлен:", videoId, status)
          resolve(this.changes)
        }
      },
    )
  })
}

function deleteVideo(videoId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM videos
      WHERE id = ?
    `,
      [videoId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления видео:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Видео удалено:", videoId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 8. USER STARS BALANCES =====

function getUserStarsBalance(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM user_stars_balances
      WHERE user_id = ?
    `,
      [userId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения баланса:", err.message)
          reject(err)
        } else {
          resolve(row || { user_id: userId, balance: 0 })
        }
      },
    )
  })
}

function updateUserStarsBalance(userId, newBalance) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO user_stars_balances (user_id, balance, updated_at)
      VALUES (?, ?, ?)
    `,
      [userId, newBalance, new Date().toISOString()],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления баланса:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Баланс обновлен:", userId, newBalance)
          resolve(this.changes)
        }
      },
    )
  })
}

function incrementUserStarsBalance(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO user_stars_balances (user_id, balance, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        balance = balance + ?,
        updated_at = ?
    `,
      [userId, amount, new Date().toISOString(), amount, new Date().toISOString()],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка инкремента баланса:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Баланс увеличен:", userId, amount)
          resolve(this.changes)
        }
      },
    )
  })
}

function decrementUserStarsBalance(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE user_stars_balances
      SET balance = CASE
        WHEN balance >= ? THEN balance - ?
        ELSE 0
      END,
      updated_at = ?
      WHERE user_id = ?
    `,
      [amount, amount, new Date().toISOString(), userId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка декремента баланса:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Баланс уменьшен:", userId, amount)
          resolve(this.changes)
        }
      },
    )
  })
}

function getAllBalances() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM user_stars_balances
      ORDER BY balance DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения балансов:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено балансов:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

// ===== 9. WITHDRAWAL REQUESTS =====

function getAllWithdrawalRequests() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM withdrawal_requests
      ORDER BY created_at DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения запросов на вывод:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено запросов на вывод:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function getPendingWithdrawalRequests() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM withdrawal_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения ожидающих запросов:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено ожидающих запросов:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function getWithdrawalRequestById(requestId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM withdrawal_requests
      WHERE id = ?
    `,
      [requestId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения запроса на вывод:", err.message)
          reject(err)
        } else {
          resolve(row)
        }
      },
    )
  })
}

function updateWithdrawalRequestStatus(requestId, status, processedAt, rejectionReason) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE withdrawal_requests
      SET status = ?, processed_at = ?, rejection_reason = ?
      WHERE id = ?
    `,
      [status, processedAt || new Date().toISOString(), rejectionReason || null, requestId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления статуса запроса:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Статус запроса обновлен:", requestId, status)
          resolve(this.changes)
        }
      },
    )
  })
}

function deleteWithdrawalRequest(requestId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM withdrawal_requests
      WHERE id = ?
    `,
      [requestId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления запроса на вывод:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Запрос на вывод удален:", requestId)
          resolve(this.changes)
        }
      },
    )
  })
}

function getUserWithdrawalRequests(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM withdrawal_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
      [userId],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения запросов пользователя:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено запросов пользователя:", rows.length)
          resolve(rows || [])
        }
      },
    )
  })
}

// ===== 10. PHOTO EARNINGS =====

function getPhotoEarning(photoId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM photo_earnings
      WHERE photo_id = ?
    `,
      [photoId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения заработка:", err.message)
          reject(err)
        } else {
          resolve(row || { photo_id: photoId, earned: 0, last_payout: 0 })
        }
      },
    )
  })
}

function updatePhotoEarning(photoId, earned, lastPayout) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT OR REPLACE INTO photo_earnings (photo_id, earned, last_payout)
      VALUES (?, ?, ?)
    `,
      [photoId, earned, lastPayout],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления заработка:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Заработок обновлен:", photoId)
          resolve(this.changes)
        }
      },
    )
  })
}

function incrementPhotoEarning(photoId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO photo_earnings (photo_id, earned, last_payout)
      VALUES (?, ?, 0)
      ON CONFLICT(photo_id) DO UPDATE SET
        earned = earned + ?
    `,
      [photoId, amount, amount],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка инкремента заработка:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Заработок увеличен:", photoId, amount)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 11. DAILY PHOTO UPLOADS =====

function getDailyPhotoUpload(userId, date) {
  return new Promise((resolve, reject) => {
    const userDateKey = `${userId}_${date}`
    db.get(
      `
      SELECT * FROM daily_photo_uploads
      WHERE user_date_key = ?
    `,
      [userDateKey],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения дневных загрузок:", err.message)
          reject(err)
        } else {
          resolve(row || { user_date_key: userDateKey, user_id: userId, date: date, count: 0 })
        }
      },
    )
  })
}

function updateDailyPhotoUpload(userId, date, count) {
  return new Promise((resolve, reject) => {
    const userDateKey = `${userId}_${date}`
    db.run(
      `
      INSERT OR REPLACE INTO daily_photo_uploads (user_date_key, user_id, date, count)
      VALUES (?, ?, ?, ?)
    `,
      [userDateKey, userId, date, count],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления дневных загрузок:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Дневные загрузки обновлены:", userId, date, count)
          resolve(this.changes)
        }
      },
    )
  })
}

function incrementDailyPhotoUpload(userId, date) {
  return new Promise((resolve, reject) => {
    const userDateKey = `${userId}_${date}`
    db.run(
      `
      INSERT INTO daily_photo_uploads (user_date_key, user_id, date, count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(user_date_key) DO UPDATE SET
        count = count + 1
    `,
      [userDateKey, userId, date],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка инкремента дневных загрузок:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Дневные загрузки увеличены:", userId, date)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 12. WEEKLY BLUR PHOTOS =====

function getWeeklyBlurPhoto(userId, weekStart) {
  return new Promise((resolve, reject) => {
    const userWeekKey = `${userId}_${weekStart}`
    db.get(
      `
      SELECT * FROM weekly_blur_photos
      WHERE user_week_key = ?
    `,
      [userWeekKey],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения недельного блюр-фото:", err.message)
          reject(err)
        } else {
          resolve(row)
        }
      },
    )
  })
}

function deleteWeeklyBlurPhoto(userId, weekStart) {
  return new Promise((resolve, reject) => {
    const userWeekKey = `${userId}_${weekStart}`
    db.run(
      `
      DELETE FROM weekly_blur_photos
      WHERE user_week_key = ?
    `,
      [userWeekKey],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления недельного блюр-фото:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Недельное блюр-фото удалено:", userId, weekStart)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 13. SCHEDULES =====

function getAllSchedules() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM schedules
      ORDER BY created_at DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения расписаний:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено расписаний:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function getScheduleById(scheduleId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM schedules
      WHERE id = ?
    `,
      [scheduleId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения расписания:", err.message)
          reject(err)
        } else {
          resolve(row)
        }
      },
    )
  })
}

function deleteSchedule(scheduleId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM schedules
      WHERE id = ?
    `,
      [scheduleId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления расписания:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Расписание удалено:", scheduleId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 14. NAVIGATION PHOTOS =====

function getAllNavigationPhotos() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM navigation_photos
      ORDER BY uploaded_at DESC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения фото навигации:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Загружено фото навигации:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function deleteNavigationPhoto(filename) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM navigation_photos
      WHERE filename = ?
    `,
      [filename],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления фото навигации:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Фото навигации удалено:", filename)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 15. ADMIN SETTINGS =====

function getAdminSetting(key) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM admin_settings
      WHERE key = ?
    `,
      [key],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения настройки:", err.message)
          reject(err)
        } else {
          if (row) {
            try {
              row.value = JSON.parse(row.value)
            } catch (e) {
              // Если не JSON, оставляем как есть
            }
          }
          resolve(row)
        }
      },
    )
  })
}

function getAllAdminSettings() {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT * FROM admin_settings
      ORDER BY key ASC
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения настроек:", err.message)
          reject(err)
        } else {
          rows.forEach((row) => {
            try {
              row.value = JSON.parse(row.value)
            } catch (e) {
              // Если не JSON, оставляем как есть
            }
          })
          console.log("[v0] ✅ Загружено настроек:", rows.length)
          resolve(rows)
        }
      },
    )
  })
}

function updateAdminSetting(key, value) {
  return new Promise((resolve, reject) => {
    const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value)

    db.run(
      `
      INSERT OR REPLACE INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `,
      [key, valueStr, new Date().toISOString()],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка обновления настройки:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Настройка обновлена:", key)
          resolve(this.changes)
        }
      },
    )
  })
}

function deleteAdminSetting(key) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM admin_settings
      WHERE key = ?
    `,
      [key],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления настройки:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Настройка удалена:", key)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 16. USER RESTRICTIONS =====

function getUserRestrictions(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM user_restrictions
      WHERE user_id = ?
    `,
      [userId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения ограничений:", err.message)
          reject(err)
        } else {
          resolve(row)
        }
      },
    )
  })
}

function deleteUserRestriction(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM user_restrictions
      WHERE user_id = ?
    `,
      [userId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления ограничений:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Ограничения удалены:", userId)
          resolve(this.changes)
        }
      },
    )
  })
}

// ===== 17. USER SCHEDULES =====

function getUserSchedule(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM user_schedules
      WHERE user_id = ?
    `,
      [userId],
      (err, row) => {
        if (err) {
          console.error("[v0] ❌ Ошибка получения расписания пользователя:", err.message)
          reject(err)
        } else {
          resolve(row)
        }
      },
    )
  })
}

function deleteUserSchedule(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      DELETE FROM user_schedules
      WHERE user_id = ?
    `,
      [userId],
      function (err) {
        if (err) {
          console.error("[v0] ❌ Ошибка удаления расписания пользователя:", err.message)
          reject(err)
        } else {
          console.log("[v0] ✅ Расписание пользователя удалено:", userId)
          resolve(this.changes)
        }
      },
    )
  })
}

module.exports = {
  db,
  saveUser,
  getAllUsers,
  getUserCount,
  deactivateUser,
  migrateFromJSON,
  // Функции миграции отдельных таблиц
  insertEvent,
  insertSchedule,
  insertVideo,
  insertPhoto,
  insertNavigationPhoto,
  insertEventParticipant,
  insertEventMessage,
  insertUserStarsBalance,
  insertPhotoReaction,
  insertPhotoUnlock,
  insertDailyPhotoUpload,
  insertWeeklyBlurPhoto,
  insertPhotoEarning,
  insertWithdrawalRequest,
  insertAdminSetting,
  insertUserRestriction,
  insertUserSchedule,
  // Главная функция миграции
  migrateAllData,
  // CRUD функции для Events
  getAllEvents,
  getEventById,
  updateEvent,
  updateEventStatus,
  deleteEvent,
  incrementEventParticipants,
  decrementEventParticipants,
  // CRUD функции для Event Participants
  getEventParticipants,
  checkUserJoinedEvent,
  deleteEventParticipant,
  // CRUD функции для Event Messages
  getEventMessages,
  deleteEventMessage,
  // CRUD функции для Photos
  getAllApprovedPhotos,
  getPhotoById,
  getPhotosByEvent,
  updatePhoto,
  updatePhotoStatus,
  incrementPhotoUnlockCount,
  incrementPhotoPaidUnlocks,
  deletePhoto,
  // CRUD функции для Photo Reactions
  getPhotoReactions,
  deletePhotoReaction,
  // CRUD функции для Photo Unlocks
  getPhotoUnlocks,
  checkPhotoUnlocked,
  deletePhotoUnlock,
  // CRUD функции для Videos
  getAllApprovedVideos,
  getAllPendingVideos,
  getVideoById,
  updateVideoStatus,
  deleteVideo,
  // CRUD функции для User Stars Balances
  getUserStarsBalance,
  updateUserStarsBalance,
  incrementUserStarsBalance,
  decrementUserStarsBalance,
  getAllBalances,
  // CRUD функции для Withdrawal Requests
  getAllWithdrawalRequests,
  getPendingWithdrawalRequests,
  getWithdrawalRequestById,
  getUserWithdrawalRequests,
  updateWithdrawalRequestStatus,
  deleteWithdrawalRequest,
  // CRUD функции для Photo Earnings
  getPhotoEarning,
  updatePhotoEarning,
  incrementPhotoEarning,
  // CRUD функции для Daily Photo Uploads
  getDailyPhotoUpload,
  updateDailyPhotoUpload,
  incrementDailyPhotoUpload,
  // CRUD функции для Weekly Blur Photos
  getWeeklyBlurPhoto,
  deleteWeeklyBlurPhoto,
  // CRUD функции для Schedules
  getAllSchedules,
  getScheduleById,
  deleteSchedule,
  // CRUD функции для Navigation Photos
  getAllNavigationPhotos,
  deleteNavigationPhoto,
  // CRUD функции для Admin Settings
  getAdminSetting,
  getAllAdminSettings,
  updateAdminSetting,
  deleteAdminSetting,
  // CRUD функции для User Restrictions
  getUserRestrictions,
  deleteUserRestriction,
  // CRUD функции для User Schedules
  getUserSchedule,
  deleteUserSchedule,
}
