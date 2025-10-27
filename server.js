require("dotenv").config()

const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")
const multer = require("multer")
const path = require("path")
const fs = require("fs").promises
const ExcelJS = require("exceljs")
const newsParser = require("./parsers/newsParser")

// Helper to build compact callback_data (<=64 bytes)
function buildCallbackData(kind, id, action) {
  // kind: 'e' (event), 'v' (video), 'p' (photo)
  // action: 'ap' (approve), 'rj' (reject)
  try {
    return JSON.stringify({ t: kind, i: String(id), a: action })
  } catch (e) {
    // Fallback minimal string if JSON fails
    return `${kind}|${String(id)}|${action}`.slice(0, 64)
  }
}
const scheduleParser = require("./parsers/scheduleParser")
const TelegramBot = require("node-telegram-bot-api")
const { exec } = require("child_process")
const util = require("util")
const execPromise = util.promisify(exec)
const {
  saveUser,
  getAllUsers,
  getUserCount,
  migrateFromJSON,
  getAllEvents,
  getAllEventsWithStatus,
  getAllPendingEvents,
  getEventById,
  insertEvent,
  updateEventStatus,
  deleteEvent,
  incrementEventParticipants,
  decrementEventParticipants,
  getEventParticipants,
  checkUserJoinedEvent,
  insertEventParticipant,
  deleteEventParticipant,
  getEventMessages,
  insertEventMessage,
  getAllApprovedPhotos,
  getPhotoById,
  getPhotosByEvent,
  insertPhoto,
  updatePhoto,
  updatePhotoStatus,
  incrementPhotoUnlockCount,
  incrementPhotoPaidUnlocks,
  deletePhoto,
  getPhotoReactions,
  insertPhotoReaction,
  deletePhotoReaction,
  getPhotoUnlocks,
  checkPhotoUnlocked,
  insertPhotoUnlock,
  deletePhotoUnlock,
  getDailyPhotoUpload,
  updateDailyPhotoUpload,
  incrementDailyPhotoUpload,
  getWeeklyBlurPhoto,
  insertWeeklyBlurPhoto,
  deleteWeeklyBlurPhoto,
  getPhotoEarning,
  updatePhotoEarning,
  incrementPhotoEarning,
  getUserStarsBalance,
  updateUserStarsBalance,
  incrementUserStarsBalance,
  decrementUserStarsBalance,
  getAllBalances,
  getAllWithdrawalRequests,
  getPendingWithdrawalRequests,
  getWithdrawalRequestById,
  getUserWithdrawalRequests,
  insertWithdrawalRequest,
  updateWithdrawalRequestStatus,
  deleteWithdrawalRequest,
  getAllApprovedVideos,
  getAllPendingVideos,
  getVideoById,
  insertVideo,
  updateVideoStatus,
  deleteVideo,
  getAllSchedules,
  getScheduleById,
  insertSchedule,
  deleteSchedule,
  getAllNavigationPhotos,
  insertNavigationPhoto,
  deleteNavigationPhoto,
  getAllAdminSettings,
  updateAdminSetting,
  getEventUserRestriction,
  insertEventUserRestriction,
  deleteEventUserRestriction,
  getUserSchedule,
  insertUserSchedule,
  deleteUserSchedule,
} = require("./db")

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(bodyParser.json({ limit: "200mb" }))
app.use(bodyParser.urlencoded({ extended: true, limit: "200mb" }))

// Disable caching for HTML, JS, and CSS files
app.use((req, res, next) => {
  if (req.url.match(/\.(html|js|css)$/)) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Expires", "0")
  }
  next()
})

app.use(express.static("public"))
app.use("/uploads", express.static("uploads"))

const videoStorage = multer.diskStorage({
  destination: "./uploads/videos",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname)
  },
})

const photoStorage = multer.diskStorage({
  destination: "./uploads/photos",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname)
  },
})

const heroImageStorage = multer.diskStorage({
  destination: "./uploads/hero-images",
  filename: (req, file, cb) => {
    cb(null, "hero-" + Date.now() + "-" + file.originalname)
  },
})

const scheduleStorage = multer.diskStorage({
  destination: "./uploads/schedules",
  filename: (req, file, cb) => {
    cb(null, "schedule-" + Date.now() + "-" + file.originalname)
  },
})

const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 1024 * 1024 * 1024 } })
const uploadPhoto = multer({ storage: photoStorage, limits: { fileSize: 10 * 1024 * 1024 } })
const uploadHeroImage = multer({ storage: heroImageStorage, limits: { fileSize: 10 * 1024 * 1024 } })
const uploadSchedule = multer({ storage: scheduleStorage, limits: { fileSize: 5 * 1024 * 1024 } })

const uploadVideoWithThumbnail = multer({
  storage: videoStorage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // Увеличено с 200MB до 1GB (1024 MB)
}).fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
])

let newsCache = []

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234"

function getWeekStart() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "5336123108"
function getAdminChatIds() {
  return [ADMIN_TELEGRAM_ID].filter(Boolean)
}
let bot = null

if (BOT_TOKEN) {
  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true })
    console.log("Telegram bot initialized")

    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id
      const user = msg.from

      try {
        await saveUser(chatId, user.first_name, user.last_name, user.username)
        bot.sendMessage(chatId, "Вітаємо в U-hub Bot! Тут ви отримаєте сповіщення про відео та події.")
      } catch (error) {
        console.error("[v0] ❌ Ошибка сохранения пользователя:", error.message)
        bot.sendMessage(chatId, "Вітаємо в U-hub Bot! Тут ви отримаєте сповіщення про відео та події.")
      }
    })

    bot.on("message", async (msg) => {
      if (msg.text && msg.text.startsWith("/")) return // Пропускаем команды, они обрабатываются отдельно

      const chatId = msg.chat.id
      const user = msg.from

      try {
        await saveUser(chatId, user.first_name, user.last_name, user.username)
      } catch (error) {
        console.error("[v0] ❌ Ошибка сохранения пользователя при сообщении:", error.message)
      }
    })

    bot.on("pre_checkout_query", async (query) => {
      try {
        console.log("[v0] 💳 Отримано pre_checkout_query:", query)
        await bot.answerPreCheckoutQuery(query.id, true)
      } catch (error) {
        console.error("[v0] ❌ Помилка pre_checkout_query:", error)
      }
    })

    bot.on("successful_payment", async (msg) => {
      try {
        console.log("[v0] ✅ Успішна оплата:", msg.successful_payment)
        const payload = JSON.parse(msg.successful_payment.invoice_payload)
        const { type, photoId, userId } = payload

        if (type === "photo_unlock") {
          const photo = await getPhotoById(photoId)
          if (!photo) {
            console.error("[v0] ❌ Фото не знайдено:", photoId)
            return
          }

          // Розблоковуємо фото для користувача
          const alreadyUnlocked = await checkPhotoUnlocked(photoId, userId)
          if (!alreadyUnlocked) {
            await insertPhotoUnlock(photoId, userId)
          }

          const authorId = String(photo.user_id)
          
          // Нараховуємо зірку автору
          await incrementUserStarsBalance(authorId, 1)

          // Оновлюємо лічильник відкриттів фото
          await incrementPhotoUnlockCount(photoId)
          
          // Get updated photo to check unlock count
          const updatedPhoto = await getPhotoById(photoId)
          const unlockCount = updatedPhoto.unlock_count || 1

          // Відправляємо уведомление владельцу фото о каждом открытии
          if (String(authorId) !== String(userId) && bot) {
            try {
              const balance = await getUserStarsBalance(authorId)
              await bot.sendMessage(
                authorId,
                `📸 Ваше фото відкрили за 1 ⭐\n\n` +
                  `💰 Вам нараховано 1 зірку\n` +
                  `⭐ Поточний баланс: ${balance || 1} зірок\n\n` +
                  `Всього відкриттів цього фото: ${unlockCount}`
              )
              console.log(`[v0] 📬 Відправлено уведомление автору ${authorId} про відкриття фото`)
            } catch (error) {
              console.error(`[v0] ❌ Помилка відправки уведомления автору:`, error)
            }
          }

          if (unlockCount % 50 === 0) {
            const starsToTransfer = 50
            
            // Нараховуємо бонус 50 зірок
            await incrementUserStarsBalance(authorId, starsToTransfer)
            
            // Отримуємо оновлений баланс
            const updatedBalance = await getUserStarsBalance(authorId)

            // Відправляємо повідомлення автору про нагороду
            try {
              await bot.sendMessage(
                authorId,
                `🎉 Вітаємо! Ваше фото набрало ${unlockCount} відкриттів!\n\n` +
                  `⭐ Вам нараховано ${starsToTransfer} зірок Telegram!\n` +
                  `💰 Ваш поточний баланс: ${updatedBalance || 0} зірок\n\n` +
                  `Продовжуйте публікувати якісні фото! 📸`,
              )
              console.log(`[v0] 🎁 Відправлено повідомлення автору ${authorId} про ${starsToTransfer} зірок`)
            } catch (error) {
              console.error(`[v0] ❌ Помилка відправки повідомлення автору:`, error)
            }
          }

          await bot.sendMessage(userId, "✅ Фото успішно розблоковано!")
          console.log(`[v0] 🔓 Фото ${photoId} розблоковано для користувача ${userId}`)
        }
      } catch (error) {
        console.error("[v0] ❌ Помилка обробки successful_payment:", error)
      }
    })

    bot.on("callback_query", async (query) => {
      const chatId = query.message.chat.id
      const user = query.from

      try {
        await saveUser(chatId, user.first_name, user.last_name, user.username)
      } catch (error) {
        console.error("[v0] ❌ Ошибка сохранения пользователя при callback:", error.message)
      }

      let data
      try {
        data = JSON.parse(query.data)
      } catch (e) {
        // поддержка компактного формата {t:'p',i:'id',a:'ap'}
        const parts = String(query.data).split("|")
        if (parts.length === 3) {
          data = { t: parts[0], i: parts[1], a: parts[2] }
        } else {
          data = {}
        }
      }

      const type = data.type || data.t
      const action = data.action || data.a
      const videoId = data.videoId || data.i
      const eventId = data.eventId || data.i
      const photoId = data.photoId || data.i

      if (type === "video_mod" || type === 'v') {
        try {
          const video = await getVideoById(videoId)
          if (video) {
            const timestamp = new Date().toISOString()
            if (action === "approve" || action === 'ap') {
              await updateVideoStatus(videoId, "approved", timestamp)
              bot.editMessageCaption(`✅ Відео схвалено`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
              })
            } else if (action === "reject" || action === 'rj') {
              await updateVideoStatus(videoId, "rejected", timestamp)
              bot.editMessageCaption(`❌ Відео відхилено`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
              })
            }
          }
        } catch (error) {
          console.error("[v0] ❌ Error updating video status:", error.message)
        }
        bot.answerCallbackQuery(query.id)
      } else if (type === "event_mod" || type === 'e') {
        try {
          const event = await getEventById(eventId)
          if (event) {
            const timestamp = new Date().toISOString()
            if (action === "approve" || action === 'ap') {
              await updateEventStatus(eventId, "approved", timestamp)
              bot.editMessageText(`✅ Івент схвалено`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
              })
            } else if (action === "reject" || action === 'rj') {
              await updateEventStatus(eventId, "rejected", timestamp)
              bot.editMessageText(`❌ Івент відхилено`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
              })
            }
          }
        } catch (error) {
          console.error("[v0] ❌ Error updating event status:", error.message)
        }
        bot.answerCallbackQuery(query.id)
      } else if (type === "photo_mod" || type === 'p') {
        try {
          const photo = await getPhotoById(photoId)
          if (photo) {
            const timestamp = new Date().toISOString()
            if (action === "approve" || action === 'ap') {
              await updatePhotoStatus(photoId, "approved", timestamp)
              bot.editMessageCaption(`✅ Фото схвалено`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
              })
            } else if (action === "reject" || action === 'rj') {
              await updatePhotoStatus(photoId, "rejected", timestamp)
              bot.editMessageCaption(`❌ Фото відхилено`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
              })
            }
          }
        } catch (error) {
          console.error("[v0] ❌ Error updating photo status:", error.message)
        }
        bot.answerCallbackQuery(query.id)
      }
    })
  } catch (error) {
    console.error("Error initializing Telegram bot:", error.message)
  }
}

// Система Push сповіщень за 1 годину до події
const notifiedEvents = new Set()

function parseEventDateTime(eventDate, eventTime) {
  try {
    const [day, month, year] = eventDate.split(".")
    const [hours, minutes] = eventTime.split(":")
    return new Date(year, month - 1, day, hours, minutes)
  } catch (error) {
    console.error("Error parsing event date/time:", error)
    return null
  }
}

async function checkUpcomingEvents() {
  try {
    console.log("[v0] 🔔 Проверяем предстоящие события...")

    const now = new Date()
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    const fiveMinutesFromOneHour = new Date(now.getTime() + 55 * 60 * 1000)

    const allEvents = await getAllEvents()

    for (const event of allEvents) {
      if (notifiedEvents.has(event.id)) continue

      const eventDateTime = parseEventDateTime(event.date, event.time)

      if (eventDateTime >= fiveMinutesFromOneHour && eventDateTime <= oneHourFromNow) {
        console.log(`[v0] 🔔 Отправляем уведомление для события: ${event.title}`)

        const participants = await getEventParticipants(event.id)

        for (const participant of participants) {
          if (bot && participant.user_id) {
            try {
              await bot.sendMessage(
                participant.user_id,
                `🔔 Нагадування!\n\nПодія "${event.title}" почнеться через 1 годину!\n\n📅 ${event.date} о ${event.time}\n📍 ${event.location}`,
              )
              console.log(`[v0] ✅ Уведомление отправлено пользователю ${participant.user_id}`)
            } catch (error) {
              console.error(`[v0] ❌ Ошибка отправки уведомления пользователю ${participant.user_id}:`, error.message)
            }
          }
        }

        notifiedEvents.add(event.id)
      }
    }
  } catch (error) {
    console.error("[v0] ❌ Ошибка проверки предстоящих событий:", error)
  }
}

// Запускаем проверку каждые 5 минут
setInterval(checkUpcomingEvents, 5 * 60 * 1000)

async function updateNewsCache() {
  try {
    newsCache = await newsParser.getAllNews()
    console.log(`News cache updated: ${newsCache.length} articles`)
  } catch (error) {
    console.error("Error updating news cache:", error)
  }
}

app.get("/api/news", async (req, res) => {
  try {
    if (newsCache.length === 0) {
      await updateNewsCache()
    }
    res.json(newsCache)
  } catch (error) {
    console.error("Error fetching news:", error)
    res.status(500).json({ error: "Failed to fetch news" })
  }
})

app.get("/api/schedules/search", async (req, res) => {
  try {
    const { course, query } = req.query

    const results = await scheduleParser.searchSchedules(query, course)
    res.json(results)
  } catch (error) {
    console.error("Error searching schedules:", error)
    res.status(500).json({ error: "Failed to search schedules" })
  }
})

app.get("/api/events", async (req, res) => {
  try {
    const allEvents = await getAllEvents()
    const now = new Date()
    const cutoffTime = new Date(now.getTime() - 72 * 60 * 60 * 1000)

    const filteredEvents = allEvents
      .filter((e) => {
        if (e.expiresAt) {
          const expiresAt = new Date(e.expiresAt)
          if (expiresAt < cutoffTime) {
            return false
          }
        }
        return true
      })
      .sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt))

    res.json(filteredEvents)
  } catch (error) {
    console.error("Error fetching events:", error)
    res.status(500).json({ error: "Failed to fetch events" })
  }
})

app.get("/api/events/:id", async (req, res) => {
  try {
    const event = await getEventById(req.params.id)
    if (event) {
      res.json(event)
    } else {
      res.status(404).json({ error: "Event not found" })
    }
  } catch (error) {
    console.error("Error fetching event:", error)
    res.status(500).json({ error: "Failed to fetch event" })
  }
})

app.post("/api/events", async (req, res) => {
  try {
    const { title, date, time, location, description, duration, creatorUsername } = req.body

    const newEvent = {
      id: Date.now().toString(),
      title,
      date,
      time,
      location,
      description,
      participantsCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (duration || 24) * 60 * 60 * 1000).toISOString(),
      status: "pending",
      organizer: creatorUsername || "Анонім",
    }

    await insertEvent(newEvent)

    if (bot) {
      const adminUsers = getAdminChatIds()
      for (const adminChatId of adminUsers) {
        try {
          await bot.sendMessage(
            adminChatId,
            `🎉 Новий івент на модерацію:\n\n📝 Назва: ${newEvent.title}\n📅 Дата: ${newEvent.date}\n⏰ Час: ${newEvent.time}\n📍 Місце: ${newEvent.location}\n👤 Автор: ${newEvent.organizer}\n\nОпис: ${newEvent.description}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Підтвердити",
                      callback_data: buildCallbackData('e', newEvent.id, 'ap'),
                    },
                    {
                      text: "❌ Відхилити",
                      callback_data: buildCallbackData('e', newEvent.id, 'rj'),
                    },
                  ],
                ],
              },
            },
          )
        } catch (error) {
          console.error("Error sending event notification to bot:", error.message)
        }
      }
    }

    res.json({ success: true, message: "Ваш івент відправлено на модерацію. Очікуйте на розгляд.", event: newEvent })
  } catch (error) {
    console.error("Error creating event:", error)
    res.status(500).json({ error: "Failed to create event" })
  }
})

app.post("/api/events/:id/join", async (req, res) => {
  console.log("[v0] 🎉 ========== ПРИСОЕДИНЕНИЕ К СОБЫТИЮ ==========")
  console.log("[v0] 📋 Event ID:", req.params.id)
  console.log("[v0] 👤 User data:", req.body)

  try {
    const { userId, firstName, photoUrl } = req.body
    const eventId = req.params.id

    const event = await getEventById(eventId)

    if (event) {
      const alreadyJoined = await checkUserJoinedEvent(eventId, userId)

      if (!alreadyJoined) {
        const participant = {
          userId,
          firstName,
          photoUrl,
          joinedAt: new Date().toISOString(),
        }
        await insertEventParticipant(eventId, participant)
        console.log("[v0] ✅ Участник добавлен")

        await incrementEventParticipants(eventId)

        const welcomeMessage = {
          userId: userId,
          firstName: firstName,
          message: "Привіт👋",
          photoUrl: photoUrl,
          timestamp: new Date().toISOString(),
        }
        await insertEventMessage(eventId, welcomeMessage)
        console.log("[v0] 👋 Добавлено приветственное сообщение с эмодзи")
      } else {
        console.log("[v0] ⚠️ Участник уже в списке")
      }

      const participants = await getEventParticipants(eventId)
      const participantCount = participants.length
      console.log("[v0] 📊 Количество участников:", participantCount)

      res.json({ success: true, participants: participantCount, joined: true })
      console.log("[v0] 🎉 ========== КОНЕЦ ПРИСОЕДИНЕНИЯ ==========")
    } else {
      console.error("[v0] ❌ Событие не найдено!")
      res.status(404).json({ error: "Event not found" })
    }
  } catch (error) {
    console.error("[v0] 💥 Ошибка присоединения:", error)
    res.status(500).json({ error: "Failed to join event" })
  }
})

app.post("/api/events/:id/leave", async (req, res) => {
  try {
    const { userId } = req.body
    const eventId = req.params.id

    const event = await getEventById(eventId)

    if (event) {
      await deleteEventParticipant(eventId, userId)
      await decrementEventParticipants(eventId)

      const participants = await getEventParticipants(eventId)
      const participantCount = participants.length

      res.json({ success: true, participants: participantCount, joined: false })
    } else {
      res.status(404).json({ error: "Event not found" })
    }
  } catch (error) {
    console.error("Error leaving event:", error)
    res.status(500).json({ error: "Failed to leave event" })
  }
})

app.get("/api/events/:id/joined", async (req, res) => {
  console.log("[v0] 🔍 Проверка участия в событии:", req.params.id, "User:", req.query.userId)

  try {
    const { userId } = req.query
    const eventId = req.params.id

    const event = await getEventById(eventId)

    if (event) {
      const isJoined = await checkUserJoinedEvent(eventId, userId)
      const participants = await getEventParticipants(eventId)
      const participantCount = participants.length

      console.log("[v0] 📊 Результат проверки:")
      console.log("[v0]   - Joined:", isJoined)
      console.log("[v0]   - Participants:", participantCount)

      res.json({ joined: isJoined, participants: participantCount })
    } else {
      console.log("[v0] ⚠️ Событие не найдено")
      res.json({ joined: false, participants: 0 })
    }
  } catch (error) {
    console.error("Error checking joined status:", error)
    res.status(500).json({ error: "Failed to check joined status" })
  }
})

const typingUsers = {} // { eventId: { userId: { firstName, timestamp } } }

app.post("/api/events/:id/messages", async (req, res) => {
  console.log("[v0] 💬 ========== ОТПРАВКА СООБЩЕНИЯ ==========")
  console.log("[v0] 📋 Event ID:", req.params.id)
  console.log("[v0] 📝 Message:", req.body.message)
  console.log("[v0] 👤 User:", req.body.firstName)

  try {
    const { message, userId, firstName, photoUrl } = req.body
    const eventId = req.params.id

    const restrictionData = await getEventUserRestriction(eventId, userId)
    if (restrictionData) {
      const restriction = restrictionData.restriction
      if (restriction.blocked) {
        console.log("[v0] ❌ Пользователь заблокирован")
        return res.status(403).json({ error: "Ви заблоковані в цьому івенті" })
      }
      if (restriction.muted && (!restriction.muteUntil || new Date(restriction.muteUntil) > new Date())) {
        console.log("[v0] ❌ Пользователь в муте")
        return res.status(403).json({ error: "Ви в муті. Не можете писати повідомлення" })
      }
    }

    const newMessage = {
      userId,
      firstName,
      message,
      photoUrl,
      timestamp: new Date().toISOString(),
    }

    await insertEventMessage(eventId, newMessage)
    console.log("[v0] ✅ Сообщение добавлено в базу данных")

    if (typingUsers[eventId] && typingUsers[eventId][userId]) {
      delete typingUsers[eventId][userId]
    }

    console.log("[v0] 💬 ========== КОНЕЦ ОТПРАВКИ СООБЩЕНИЯ ==========")
    res.json({
      id: Date.now().toString(),
      text: message,
      timestamp: newMessage.timestamp,
      sender: "user",
      userId,
      firstName,
      photoUrl,
    })
  } catch (error) {
    console.error("[v0] ❌ Ошибка отправки сообщения:", error)
    res.status(500).json({ error: "Failed to send message" })
  }
})

app.get("/api/events/:id/messages", async (req, res) => {
  try {
    const eventId = req.params.id
    console.log("[v0] 📨 Запрос сообщений для события:", eventId)

    const messages = await getEventMessages(eventId)
    console.log("[v0] 📊 Количество сообщений:", messages.length)

    const formattedMessages = messages.map(msg => ({
      id: msg.id?.toString(),
      text: msg.message,
      timestamp: msg.timestamp,
      sender: msg.user_id ? "user" : "system",
      userId: msg.user_id,
      firstName: msg.first_name,
      photoUrl: msg.photo_url,
    }))

    res.json(formattedMessages)
  } catch (error) {
    console.error("Error fetching messages:", error)
    res.status(500).json({ error: "Failed to fetch messages" })
  }
})

app.post("/api/events/:id/typing", (req, res) => {
  const eventId = req.params.id
  const { userId, firstName, isTyping } = req.body

  console.log("[v0] ⌨️ Typing event:", { eventId, userId, firstName, isTyping })

  if (!typingUsers[eventId]) {
    typingUsers[eventId] = {}
    console.log("[v0] 📝 Создан новый объект для события")
  }

  if (isTyping) {
    typingUsers[eventId][userId] = {
      firstName,
      timestamp: Date.now(),
    }
    console.log("[v0] ✅ Пользователь добавлен в печатающие:", firstName)
    console.log("[v0] 📊 Всего печатающих:", Object.keys(typingUsers[eventId]).length)
  } else {
    delete typingUsers[eventId][userId]
    console.log("[v0] ❌ Пользователь удален из печатающих:", firstName)
  }

  res.json({ success: true })
})

app.get("/api/events/:id/typing", (req, res) => {
  const eventId = req.params.id
  const { userId } = req.query

  console.log("[v0] 👀 Запрос печатающих для события:", eventId, "от пользователя:", userId)

  if (!typingUsers[eventId]) {
    console.log("[v0] ⚠️ Нет печатающих пользователей для этого события")
    return res.json([])
  }

  // Очищаем устаревшие индикаторы (старше 5 секунд)
  const now = Date.now()
  let cleaned = 0
  Object.keys(typingUsers[eventId]).forEach((uid) => {
    if (now - typingUsers[eventId][uid].timestamp > 5000) {
      delete typingUsers[eventId][uid]
      cleaned++
    }
  })

  if (cleaned > 0) {
    console.log("[v0] 🧹 Очищено устаревших индикаторов:", cleaned)
  }

  // Возвращаем список печатающих пользователей (кроме текущего)
  const typing = Object.entries(typingUsers[eventId])
    .filter(([uid]) => uid !== userId)
    .map(([uid, data]) => data.firstName)

  console.log("[v0] 📊 Печатающие пользователи (кроме текущего):", typing)

  res.json(typing)
})

app.get("/api/events/:eventId/participants/:userId", async (req, res) => {
  try {
    const { eventId, userId } = req.params

    const participants = await getEventParticipants(eventId)
    
    if (participants.length === 0) {
      return res.status(404).json({ error: "Event not found" })
    }

    const participant = participants.find((p) => String(p.user_id) === String(userId))

    if (!participant) {
      return res.status(404).json({ error: "Participant not found" })
    }

    res.json({
      userId: participant.user_id,
      firstName: participant.first_name,
      joinedAt: participant.joined_at,
    })
  } catch (error) {
    console.error("Error fetching participant:", error)
    res.status(500).json({ error: "Failed to fetch participant" })
  }
})

const thumbnailStorage = multer.diskStorage({
  destination: "./uploads/thumbnails",
  filename: (req, file, cb) => {
    cb(null, "thumb-" + Date.now() + ".jpg")
  },
})

app.post("/api/videos/upload", uploadVideoWithThumbnail, async (req, res) => {
  console.log("[v0] 🎬 ========== НАЧАЛО ОБРАБОТКИ ЗАГРУЗКИ ВИДЕО ==========")
  console.log("[v0] ⏰ Время запроса:", new Date().toISOString())
  console.log("[v0] 🌐 IP клиента:", req.ip || req.connection.remoteAddress)
  console.log("[v0] 📋 Headers:", JSON.stringify(req.headers, null, 2))

  try {
    console.log("[v0] 📦 Проверяем наличие файлов в req.files...")
    console.log("[v0] 📊 req.files:", req.files ? Object.keys(req.files) : "отсутствует")

    if (!req.files) {
      console.error("[v0] ❌ ОШИБКА: req.files отсутствует!")
      console.error("[v0] 📋 req.body:", req.body)
      return res.status(400).json({ error: "Файлы не загружены (req.files отсутствует)" })
    }

    console.log("[v0] 📁 Содержимое req.files:", JSON.stringify(Object.keys(req.files)))

    if (!req.files.video) {
      console.error("[v0] ❌ ОШИБКА: Видео файл не найден в req.files!")
      console.error("[v0] 📋 Доступные поля:", Object.keys(req.files))
      return res.status(400).json({ error: "Видео файл не загружен" })
    }

    const videoFile = req.files.video[0]
    console.log("[v0] ✅ Видео файл получен:")
    console.log("[v0]   - Имя:", videoFile.originalname)
    console.log("[v0]   - Размер:", (videoFile.size / 1024 / 1024).toFixed(2), "MB")
    console.log("[v0]   - MIME тип:", videoFile.mimetype)
    console.log("[v0]   - Путь на сервере:", videoFile.path)
    console.log("[v0]   - Имя файла:", videoFile.filename)

    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null

    let thumbnailPath = null

    if (thumbnailFile) {
      console.log("[v0] 🖼️ Превью получено от клиента:")
      console.log("[v0]   - Размер:", (thumbnailFile.size / 1024).toFixed(2), "KB")
      console.log("[v0]   - MIME тип:", thumbnailFile.mimetype)
      console.log("[v0]   - Путь:", thumbnailFile.path)

      console.log("[v0] 💾 Сохраняем превью...")
      const thumbnailFilename = "thumb-" + Date.now() + ".jpg"
      const thumbnailDestPath = path.join(__dirname, "uploads/thumbnails", thumbnailFilename)

      console.log("[v0] 📁 Создаем директорию для превью:", path.join(__dirname, "uploads/thumbnails"))
      await fs.mkdir(path.join(__dirname, "uploads/thumbnails"), { recursive: true })

      console.log("[v0] 🔄 Перемещаем файл превью:")
      console.log("[v0]   - Из:", thumbnailFile.path)
      console.log("[v0]   - В:", thumbnailDestPath)

      await fs.rename(thumbnailFile.path, thumbnailDestPath)
      thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`

      console.log("[v0] ✅ Превью сохранено:", thumbnailPath)
    } else {
      console.log("[v0] ⚠️ Превью не предоставлено клиентом")
      console.log("[v0] 🎬 Пытаемся сгенерировать превью на сервере с помощью ffmpeg...")

      try {
        const thumbnailFilename = "thumb-" + Date.now() + ".jpg"
        const thumbnailDestPath = path.join(__dirname, "uploads/thumbnails", thumbnailFilename)

        console.log("[v0] 📁 Создаем директорию для превью:", path.join(__dirname, "uploads/thumbnails"))
        await fs.mkdir(path.join(__dirname, "uploads/thumbnails"), { recursive: true })

        const videoPath = path.join(__dirname, videoFile.path)
        console.log("[v0] 🎥 Путь к видео:", videoPath)
        console.log("[v0] 🖼️ Путь для превью:", thumbnailDestPath)

        // Генерируем превью из первого кадра видео
        const ffmpegCommand = `ffmpeg -i "${videoPath}" -ss 00:00:00.500 -vframes 1 -vf "scale=640:-1" "${thumbnailDestPath}"`
        console.log("[v0] 🔧 Команда ffmpeg:", ffmpegCommand)

        const { stdout, stderr } = await execPromise(ffmpegCommand)
        console.log("[v0] 📤 ffmpeg stdout:", stdout)
        if (stderr) console.log("[v0] 📤 ffmpeg stderr:", stderr)

        // Проверяем, что файл создан
        try {
          await fs.access(thumbnailDestPath)
          thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`
          console.log("[v0] ✅ Превью успешно сгенерировано на сервере:", thumbnailPath)
        } catch (accessError) {
          console.error("[v0] ❌ Файл превью не был создан")
          thumbnailPath = null
        }
      } catch (ffmpegError) {
        console.error("[v0] ❌ ОШИБКА генерации превью с ffmpeg:")
        console.error("[v0] 📛 Сообщение:", ffmpegError.message)
        console.error("[v0] 📚 Stack:", ffmpegError.stack)
        console.log("[v0] ⚠️ Видео будет сохранено БЕЗ превью")
        thumbnailPath = null
      }
    }

    console.log("[v0] 📝 Создаем объект данных видео...")
    
    const { userId, firstName, description } = req.body

    const videoData = {
      id: Date.now().toString(),
      filename: videoFile.filename,
      thumbnailFilename: thumbnailFile ? thumbnailFile.filename : null,
      url: `/uploads/videos/${videoFile.filename}`,
      thumbnailUrl: thumbnailPath,
      description: description || videoFile.originalname,
      userId: userId || null,
      firstName: firstName || null,
      uploadedAt: new Date().toISOString(),
      status: "pending",
    }

    console.log("[v0] 📊 Данные видео:", JSON.stringify(videoData, null, 2))

    console.log("[v0] 💾 Сохраняем видео в базу данных...")
    try {
      await insertVideo(videoData)
      console.log("[v0] ✅ Видео успешно сохранено в базе данных")
    } catch (dbError) {
      console.error("[v0] ❌ Ошибка сохранения видео в БД:", dbError.message)
      throw new Error("Не удалось сохранить видео в базе данных")
    }

    if (bot) {
      console.log("[v0] 🤖 Отправляем уведомление в Telegram бот...")
      const adminUsers = getAdminChatIds()
      console.log("[v0] 👤 Отправляем админам:", adminUsers)

      for (const adminChatId of adminUsers) {
        try {
          console.log("[v0] 📤 Отправляем сообщение админу:", adminChatId)
          await bot.sendMessage(
            adminChatId,
            `🎥 Нове відео на модерацію:\n\n📝 Назва: ${videoData.description}\n📅 Дата: ${new Date(videoData.uploadedAt).toLocaleString("uk-UA")}\n💾 Розмір: ${(videoFile.size / 1024 / 1024).toFixed(2)} MB`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Підтвердити", callback_data: buildCallbackData('v', videoData.id, 'ap') },
                    { text: "❌ Відхилити", callback_data: buildCallbackData('v', videoData.id, 'rj') },
                  ],
                ],
              },
            },
          )
          console.log("[v0] ✅ Сообщение отправлено успешно")
        } catch (error) {
          console.error("[v0] ❌ Ошибка отправки в Telegram:", error.message)
          console.error("[v0] 📚 Stack:", error.stack)
        }
      }
    }

    console.log("[v0] 📤 Отправляем успешный ответ клиенту...")
    const response = {
      success: true,
      message: "Ваше відео відправлено на модерацію. Очікуйте на розгляд.",
      video: videoData,
    }
    console.log("[v0] 📋 Ответ:", JSON.stringify(response, null, 2))

    res.json(response)
    console.log("[v0] ✅ Ответ отправлен")
    console.log("[v0] 🎬 ========== КОНЕЦ ОБРАБОТКИ ЗАГРУЗКИ ВИДЕО ==========")
  } catch (error) {
    console.error("[v0] 💥 ========== КРИТИЧЕСКАЯ ОШИБКА ==========")
    console.error("[v0] 📛 Тип ошибки:", error.name)
    console.error("[v0] 📄 Сообщение:", error.message)
    console.error("[v0] 📚 Stack trace:", error.stack)
    console.error("[v0] 📋 req.files:", req.files)
    console.error("[v0] 📋 req.body:", req.body)
    console.error("[v0] 💥 ========================================")

    res.status(500).json({ error: "Помилка завантаження відео: " + error.message })
  }
})

app.get("/api/videos/pending", async (req, res) => {
  try {
    const pendingVideos = await getAllPendingVideos()
    res.json(pendingVideos)
  } catch (error) {
    console.error("Error fetching pending videos:", error)
    res.status(500).json({ error: "Failed to fetch pending videos" })
  }
})

app.get("/api/videos/approved", async (req, res) => {
  try {
    const approvedVideos = await getAllApprovedVideos()
    const sortedVideos = approvedVideos
      .sort((a, b) => new Date(b.approved_at) - new Date(a.approved_at))
      .slice(0, 3)
    res.json(sortedVideos)
  } catch (error) {
    console.error("Error fetching approved videos:", error)
    res.status(500).json({ error: "Failed to fetch approved videos" })
  }
})

app.post("/api/videos/:id/moderate", async (req, res) => {
  try {
    const { action } = req.body
    const video = await getVideoById(req.params.id)

    if (!video) {
      return res.status(404).json({ error: "Video not found" })
    }

    const timestamp = new Date().toISOString()
    if (action === "approve") {
      await updateVideoStatus(req.params.id, "approved", timestamp)
      res.json({ success: true, message: "Відео схвалено" })
    } else if (action === "reject") {
      await updateVideoStatus(req.params.id, "rejected", timestamp)
      res.json({ success: true, message: "Відео відхилено" })
    }
  } catch (error) {
    console.error("Error moderating video:", error)
    res.status(500).json({ error: "Failed to moderate video" })
  }
})

app.post("/api/photos/upload", uploadPhoto.single("photo"), async (req, res) => {
  console.log("[v0] 📸 ========== НАЧАЛО ОБРАБОТКИ ЗАГРУЗКИ ФОТО ==========")
  console.log("[v0] ⏰ Время запроса:", new Date().toISOString())
  console.log("[v0] 📋 req.body:", req.body)
  console.log("[v0] 📁 req.file:", req.file)

  try {
    if (!req.file) {
      console.error("[v0] ❌ ОШИБКА: Файл фото не загружен!")
      return res.status(400).json({ error: "No photo uploaded" })
    }

    console.log("[v0] ✅ Файл фото получен:")
    console.log("[v0]   - Имя:", req.file.originalname)
    console.log("[v0]   - Размер:", (req.file.size / 1024).toFixed(2), "KB")
    console.log("[v0]   - MIME тип:", req.file.mimetype)
    console.log("[v0]   - Путь:", req.file.path)

    const { eventId, description, userId, firstName, albumId, albumIndex, albumTotal, hasBlur } = req.body

    if (!eventId) {
      console.error("[v0] ❌ ОШИБКА: Event ID не предоставлен!")
      return res.status(400).json({ error: "Event ID is required" })
    }

    const blurEnabled = hasBlur === "true" || hasBlur === true

    // Check weekly blur photo limit
    if (blurEnabled) {
      const weekStart = getWeekStart()
      const existingBlurPhoto = await getWeeklyBlurPhoto(userId, weekStart)

      if (existingBlurPhoto) {
        // Allow if it's the same album with blur from the same user
        if (albumId && existingBlurPhoto.album_id === albumId) {
          console.log("[v0] ✅ Це той самий альбом із блюром, дозволяємо продовжити")
        } else {
          console.log("[v0] ⚠️ Ліміт блюр-фото: вже було фото з блюром цього тижня")
          return res.status(400).json({
            error: "Ви вже використали ліміт блюр-фото на цей тиждень (1 фото/альбом з блюром на тиждень)",
          })
        }
      } else {
        // Mark blur photo usage for this week
        await insertWeeklyBlurPhoto(userId, weekStart, albumId || null)
        console.log(`[v0] ✅ Встановлено блюр для користувача ${userId}, тиждень: ${weekStart}, альбом: ${albumId || 'single'}`)
      }
    }

    console.log("[v0] 📝 Дані фото:")
    console.log("[v0]   - Event ID:", eventId)
    console.log("[v0]   - Description:", description)
    console.log("[v0]   - User ID:", userId)
    console.log("[v0]   - First Name:", firstName)
    console.log("[v0]   - Album ID:", albumId)
    console.log("[v0]   - Album Index:", albumIndex)
    console.log("[v0]   - Album Total:", albumTotal)
    console.log("[v0]   - Has Blur:", blurEnabled)

    const photoId = Date.now().toString() + "-" + (albumIndex || "0")
    const newPhoto = {
      id: photoId,
      filename: req.file.filename,
      url: `/uploads/photos/${req.file.filename}`,
      event_id: eventId,
      description: description || "",
      user_id: userId,
      first_name: firstName || "Анонім",
      uploaded_at: new Date().toISOString(),
      status: "pending",
      album_id: albumId || null,
      album_index: albumIndex ? Number.parseInt(albumIndex) : null,
      album_total: albumTotal ? Number.parseInt(albumTotal) : null,
      unlock_count: 0,
      has_blur: blurEnabled ? 1 : 0,
      paid_unlocks: 0,
    }

    console.log("[v0] 💾 Сохраняем фото в базу данных...")
    await insertPhoto(newPhoto)
    console.log("[v0] ✅ Фото сохранено в БД")

    // Increment daily photo upload count
    const today = new Date().toISOString().split('T')[0]
    await incrementDailyPhotoUpload(userId, today)
    console.log("[v0] ✅ Обновлен счетчик ежедневных загрузок")

    // Відправляємо повідомлення в Telegram тільки для першого фото альбому або окремого фото
    if (bot && (!albumIndex || albumIndex === "0")) {
      console.log("[v0] 🤖 Отправляем уведомление в Telegram...")
      const adminUsers = getAdminChatIds()
      for (const adminChatId of adminUsers) {
        try {
          const event = await getEventById(eventId)
          const eventName = event ? event.title : "Подія"
          const photoCount = albumTotal ? ` (${albumTotal} фото)` : ""
          console.log("[v0] 📤 Отправляем фото адміну:", adminChatId)

          // Определяем публичный базовый URL для отправки фото в Telegram (локальный URL не подойдет)
          const baseUrlFromEnv = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || process.env.BASE_URL || null
          const requestBaseUrl = `${req.protocol}://${req.get("host")}`
          const publicBaseUrl = baseUrlFromEnv || (requestBaseUrl.startsWith("http://localhost") ? null : requestBaseUrl)

          if (!publicBaseUrl) {
            console.warn(
              "[v0] ⚠️ PUBLIC_BASE_URL не задан и хост локальный. Пропускаем отправку фото админу, чтобы избежать 'wrong HTTP URL specified'",
            )
          } else {
            await bot.sendPhoto(
              adminChatId,
              `${publicBaseUrl}${newPhoto.url}`,
              {
              caption: `📸 Нове фото на модерацію${photoCount}:\n\n🎉 Івент: ${eventName}\n👤 Автор: ${newPhoto.first_name}\n📝 Опис: ${newPhoto.description || "без опису"}`,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Підтвердити", callback_data: buildCallbackData('p', photoId, 'ap') },
                    { text: "❌ Відхилити", callback_data: buildCallbackData('p', photoId, 'rj') },
                  ],
                ],
              },
              },
            )
            console.log("[v0] ✅ Уведомление отправлено (baseUrl=", publicBaseUrl, ")")
          }
        } catch (error) {
          console.error("[v0] ❌ Ошибка отправки в Telegram:", error.message)
        }
      }
    }

    console.log("[v0] 📤 Отправляем успешный ответ клиенту")
    
    // Convert response to camelCase for compatibility
    const photoResponse = {
      id: newPhoto.id,
      filename: newPhoto.filename,
      url: newPhoto.url,
      eventId: newPhoto.event_id,
      description: newPhoto.description,
      userId: newPhoto.user_id,
      firstName: newPhoto.first_name,
      uploadedAt: newPhoto.uploaded_at,
      status: newPhoto.status,
      albumId: newPhoto.album_id,
      albumIndex: newPhoto.album_index,
      albumTotal: newPhoto.album_total,
      unlockCount: newPhoto.unlock_count,
      hasBlur: newPhoto.has_blur === 1,
      paidUnlocks: newPhoto.paid_unlocks,
    }
    
    res.json({
      success: true,
      message: "Фото відправлено на модерацію",
      photo: photoResponse,
    })
    console.log("[v0] 📸 ========== КІНЕЦЬ ОБРОБКИ ЗАВАНТАЖЕННЯ ФОТО ==========")
  } catch (error) {
    console.error("[v0] 💥 ========== КРИТИЧЕСКАЯ ОШИБКА ==========")
    console.error("[v0] 📛 Тип ошибки:", error.name)
    console.error("[v0] 📄 Сообщение:", error.message)
    console.error("[v0] 📚 Stack trace:", error.stack)
    console.error("[v0] 💥 ========================================")
    res.status(500).json({ error: "Failed to upload photo" })
  }
})

app.get("/api/photos", async (req, res) => {
  try {
    const { eventId } = req.query

    let photos
    if (eventId) {
      photos = await getPhotosByEvent(eventId)
    } else {
      photos = await getAllApprovedPhotos()
    }

    // Convert snake_case to camelCase and sort by date (newest first)
    const photosWithCamelCase = photos
      .map((photo) => ({
        id: photo.id,
        filename: photo.filename,
        url: photo.url,
        eventId: photo.event_id,
        description: photo.description,
        userId: photo.user_id,
        firstName: photo.first_name,
        uploadedAt: photo.uploaded_at,
        status: photo.status,
        approvedAt: photo.approved_at,
        rejectedAt: photo.rejected_at,
        albumId: photo.album_id,
        albumIndex: photo.album_index,
        albumTotal: photo.album_total,
        unlockCount: photo.unlock_count || 0,
        hasBlur: photo.has_blur === 1,
        paidUnlocks: photo.paid_unlocks || 0,
      }))
      .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))

    res.json(photosWithCamelCase)
  } catch (error) {
    console.error("[v0] ❌ Error fetching photos:", error)
    res.status(500).json({ error: "Failed to fetch photos" })
  }
})

app.get("/api/photos/pending", async (req, res) => {
  try {
    const allPhotos = await getAllApprovedPhotos()
    // getAllApprovedPhotos returns approved photos, we need to query for pending separately
    // For now, filter from all photos (we may need a dedicated function in db.js)
    const db = require("./db").db
    db.all(
      `SELECT * FROM photos WHERE status = 'pending' ORDER BY uploaded_at DESC`,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Error fetching pending photos:", err)
          return res.status(500).json({ error: "Failed to fetch pending photos" })
        }
        
        const photosWithCamelCase = rows.map((photo) => ({
          id: photo.id,
          filename: photo.filename,
          url: photo.url,
          eventId: photo.event_id,
          description: photo.description,
          userId: photo.user_id,
          firstName: photo.first_name,
          uploadedAt: photo.uploaded_at,
          status: photo.status,
          approvedAt: photo.approved_at,
          rejectedAt: photo.rejected_at,
          albumId: photo.album_id,
          albumIndex: photo.album_index,
          albumTotal: photo.album_total,
          unlockCount: photo.unlock_count || 0,
          hasBlur: photo.has_blur === 1,
          paidUnlocks: photo.paid_unlocks || 0,
        }))
        
        res.json(photosWithCamelCase)
      }
    )
  } catch (error) {
    console.error("[v0] ❌ Error fetching pending photos:", error)
    res.status(500).json({ error: "Failed to fetch pending photos" })
  }
})

app.post("/api/photos/:id/moderate", async (req, res) => {
  try {
    const { action, description, eventId, albumId } = req.body
    const photo = await getPhotoById(req.params.id)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    const timestamp = new Date().toISOString()

    if (action === "approve") {
      await updatePhotoStatus(req.params.id, "approved", timestamp)
      
      // Update additional fields if provided
      const updates = {}
      if (description !== undefined) updates.description = description
      if (eventId !== undefined) updates.event_id = eventId
      if (albumId !== undefined) updates.album_id = albumId
      
      if (Object.keys(updates).length > 0) {
        await updatePhoto(req.params.id, updates)
      }
      
      console.log(`[v0] ✅ Фото ${req.params.id} одобрено, hasBlur: ${photo.has_blur}`)
      
      res.json({ success: true, message: "Фото схвалено", hasBlur: photo.has_blur === 1 })
    } else if (action === "reject") {
      await updatePhotoStatus(req.params.id, "rejected", timestamp)
      res.json({ success: true, message: "Фото відхилено" })
    }
  } catch (error) {
    console.error("Error moderating photo:", error)
    res.status(500).json({ error: "Failed to moderate photo" })
  }
})

app.delete("/api/photos/:id", async (req, res) => {
  try {
    const photo = await getPhotoById(req.params.id)
    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    // Delete the physical file
    try {
      await fs.unlink(path.join(__dirname, "uploads/photos", photo.filename))
    } catch (error) {
      console.error("Error deleting photo file:", error)
    }

    // Delete from database
    await deletePhoto(req.params.id)

    res.json({ success: true, message: "Фото видалено" })
  } catch (error) {
    console.error("Error deleting photo:", error)
    res.status(500).json({ error: "Failed to delete photo" })
  }
})

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: "admin-authenticated" })
  } else {
    res.status(401).json({ error: "Невірний пароль" })
  }
})

app.get("/api/admin/settings", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const dbSettings = await getAllAdminSettings()
    
    const settingsObj = dbSettings.reduce((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {})

    if (Object.keys(settingsObj).length === 0) {
      settingsObj.heroImages = {
        news: "https://placehold.co/600x300/a3e635/444?text=News",
        schedule: "https://placehold.co/600x300/60a5fa/FFF?text=Schedule",
        video: "https://placehold.co/600x300/f87171/FFF?text=Video",
        events: "https://placehold.co/600x300/c084fc/FFF?text=Events",
      }
      settingsObj.imagePositions = {
        news: { x: 50, y: 50 },
        schedule: { x: 50, y: 50 },
        video: { x: 50, y: 50 },
        events: { x: 50, y: 50 },
      }
    }

    res.json(settingsObj)
  } catch (error) {
    console.error("Error fetching admin settings:", error)
    res.status(500).json({ error: "Помилка завантаження налаштувань" })
  }
})

app.get("/api/admin/bot-users-count", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const count = await getUserCount()
    res.json({ count })
  } catch (error) {
    console.error("[v0] ❌ Ошибка получения количества пользователей:", error.message)
    res.json({ count: botUsers.length }) // Fallback на JSON
  }
})

app.post("/api/admin/settings", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    for (const [key, value] of Object.entries(req.body)) {
      await updateAdminSetting(key, value)
    }

    const dbSettings = await getAllAdminSettings()
    const settingsObj = dbSettings.reduce((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {})

    res.json({ success: true, settings: settingsObj })
  } catch (error) {
    console.error("Error updating admin settings:", error)
    res.status(500).json({ error: "Помилка оновлення налаштувань" })
  }
})

app.post("/api/admin/broadcast", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  const uploadBroadcastPhotos = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  }).array("photos", 10)

  uploadBroadcastPhotos(req, res, async (err) => {
    if (err) {
      console.error("[v0] ❌ Ошибка загрузки фото для рассылки:", err)
      return res.status(400).json({ error: "Помилка завантаження фото" })
    }

    try {
      const message = req.body.message
      const photos = req.files || []

      console.log("[v0] 📢 Начало рассылки")
      console.log("[v0] 📝 Сообщение:", message)
      console.log("[v0] 🖼️ Количество фото:", photos.length)

      if (!bot) {
        console.error("[v0] ❌ Telegram бот не настроен")
        console.error("[v0] 💡 Проверьте переменную окружения TELEGRAM_BOT_TOKEN")
        return res.status(400).json({
          error: "Telegram бот не налаштований. Перевірте змінну оточення TELEGRAM_BOT_TOKEN",
        })
      }

      let users = []
      try {
        users = await getAllUsers()
        console.log("[v0] 👥 Загружено пользователей из SQLite:", users.length)
      } catch (error) {
        console.error("[v0] ❌ Ошибка загрузки из SQLite:", error.message)
        users = []
        console.log("[v0] ⚠️ Нет пользователей для рассылки")
      }

      if (users.length === 0) {
        console.error("[v0] ❌ Нет пользователей для рассылки")
        console.error("[v0] 💡 Пользователи должны написать /start боту")
        return res.status(400).json({
          error: "Немає користувачів для розсилки. Користувачі повинні написати /start боту",
        })
      }

      if (!message && photos.length === 0) {
        console.error("[v0] ❌ Нет контента для рассылки")
        return res.status(400).json({ error: "Додайте текст або фото для розсилки" })
      }

      let successCount = 0
      let errorCount = 0
      const errors = []

      for (const user of users) {
        try {
          console.log("[v0] 📤 Отправка пользователю:", user.chatId, user.firstName)

          if (photos.length > 0) {
            if (photos.length === 1) {
              // Одно фото - отправляем как фото с подписью
              console.log("[v0] 📸 Отправка одного фото с подписью")
              await bot.sendPhoto(user.chatId, photos[0].buffer, {
                caption: message || "",
              })
            } else {
              // Несколько фото - отправляем как медиа-группу
              console.log("[v0] 🖼️ Отправка медиа-группы из", photos.length, "фото")
              const mediaGroup = photos.map((photo, index) => ({
                type: "photo",
                media: photo.buffer,
                caption: index === 0 && message ? message : undefined,
              }))
              await bot.sendMediaGroup(user.chatId, mediaGroup)
            }
          } else if (message) {
            // Только текст
            console.log("[v0] 💬 Отправка текстового сообщения")
            await bot.sendMessage(user.chatId, message)
          }

          successCount++
          console.log("[v0] ✅ Отправлено успешно")

          // Задержка между отправками, чтобы не превысить лимиты Telegram API
          await new Promise((resolve) => setTimeout(resolve, 100))
        } catch (error) {
          console.error(`[v0] ❌ Ошибка отправки пользователю ${user.chatId} (${user.firstName}):`, error.message)
          errorCount++
          errors.push({
            chatId: user.chatId,
            firstName: user.firstName,
            error: error.message,
          })
        }
      }

      console.log("[v0] 📊 Результаты рассылки:")
      console.log("[v0]   - Успешно:", successCount)
      console.log("[v0]   - Ошибок:", errorCount)
      console.log("[v0]   - Всего пользователей:", users.length)

      if (errors.length > 0) {
        console.log("[v0] 📋 Детали ошибок:")
        errors.forEach((err) => {
          console.log(`[v0]   - ${err.firstName} (${err.chatId}): ${err.error}`)
        })
      }

      res.json({
        success: true,
        sent: successCount,
        failed: errorCount,
        total: users.length,
        message: `Розсилка завершена. Успішно: ${successCount}, Помилок: ${errorCount}`,
      })
    } catch (error) {
      console.error("[v0] 💥 Критическая ошибка рассылки:", error)
      console.error("[v0] 📚 Stack:", error.stack)
      res.status(500).json({ error: "Помилка розсилки: " + error.message })
    }
  })
})

app.get("/api/admin/videos/pending", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const pendingVideos = await getAllPendingVideos()
    res.json(pendingVideos)
  } catch (error) {
    console.error("Error fetching admin pending videos:", error)
    res.status(500).json({ error: "Failed to fetch pending videos" })
  }
})

app.get("/api/admin/events/pending", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const pendingEvents = await getAllPendingEvents()
    res.json(pendingEvents)
  } catch (error) {
    console.error("Error fetching pending events:", error)
    res.status(500).json({ error: "Failed to fetch pending events" })
  }
})

app.delete("/api/admin/events/:id", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const eventId = req.params.id

    const event = await getEventById(eventId)
    if (!event) {
      return res.status(404).json({ error: "Event not found" })
    }

    await deleteEvent(eventId)

    res.json({ success: true, message: "Івент видалено. Фото залишились в галереї." })
  } catch (error) {
    console.error("Error deleting event:", error)
    res.status(500).json({ error: "Failed to delete event" })
  }
})

app.post("/api/admin/events/:id/moderate", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const { action } = req.body
    const eventId = req.params.id

    const event = await getEventById(eventId)

    if (!event) {
      return res.status(404).json({ error: "Event not found" })
    }

    const timestamp = new Date().toISOString()
    if (action === "approve") {
      await updateEventStatus(eventId, "approved", timestamp)
      res.json({ success: true, message: "Івент схвалено" })
    } else if (action === "reject") {
      await updateEventStatus(eventId, "rejected", timestamp)
      res.json({ success: true, message: "Івент відхилено" })
    }
  } catch (error) {
    console.error("Error moderating event:", error)
    res.status(500).json({ error: "Failed to moderate event" })
  }
})

app.get("/api/admin/events/all", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const allEvents = await getAllEventsWithStatus()
    res.json(allEvents)
  } catch (error) {
    console.error("Error fetching all events:", error)
    res.status(500).json({ error: "Failed to fetch events" })
  }
})

app.get("/api/admin/events/:id/participants", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const eventId = req.params.id
    const participants = await getEventParticipants(eventId)

    const participantsWithRestrictions = await Promise.all(participants.map(async (p) => {
      const restrictionData = await getEventUserRestriction(eventId, p.user_id)
      return {
        userId: p.user_id,
        firstName: p.first_name,
        joinedAt: p.joined_at,
        restrictions: restrictionData ? restrictionData.restriction : null,
      }
    }))

    res.json(participantsWithRestrictions)
  } catch (error) {
    console.error("Error fetching participants:", error)
    res.status(500).json({ error: "Failed to fetch participants" })
  }
})

app.post("/api/admin/events/:id/restrict-user", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const eventId = req.params.id
    const { userId, action, duration } = req.body

    const existingRestrictionData = await getEventUserRestriction(eventId, userId)
    const existingRestriction = existingRestrictionData ? existingRestrictionData.restriction : {}

    if (action === "block") {
      await insertEventUserRestriction(eventId, userId, {
        ...existingRestriction,
        blocked: true,
        blockedAt: new Date().toISOString(),
      })
    } else if (action === "mute") {
      const muteUntil = duration ? new Date(Date.now() + duration * 60 * 1000).toISOString() : null
      await insertEventUserRestriction(eventId, userId, {
        ...existingRestriction,
        muted: true,
        mutedAt: new Date().toISOString(),
        muteUntil,
      })
    } else if (action === "unblock") {
      if (existingRestrictionData) {
        const { blocked, blockedAt, ...rest } = existingRestriction
        if (Object.keys(rest).length === 0) {
          await deleteEventUserRestriction(eventId, userId)
        } else {
          await insertEventUserRestriction(eventId, userId, rest)
        }
      }
    } else if (action === "unmute") {
      if (existingRestrictionData) {
        const { muted, mutedAt, muteUntil, ...rest } = existingRestriction
        if (Object.keys(rest).length === 0) {
          await deleteEventUserRestriction(eventId, userId)
        } else {
          await insertEventUserRestriction(eventId, userId, rest)
        }
      }
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Error restricting user:", error)
    res.status(500).json({ error: "Failed to restrict user" })
  }
})

app.get("/api/admin/users", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const users = await getAllUsers()
    res.json(users)
  } catch (error) {
    console.error("Error fetching users:", error)
    res.status(500).json({ error: "Failed to fetch users" })
  }
})

app.get("/api/admin/balances", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const balances = await getAllBalances()
    res.json(balances)
  } catch (error) {
    console.error("Error fetching balances:", error)
    res.status(500).json({ error: "Failed to fetch balances" })
  }
})

app.get("/api/admin/photos/pending", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const db = require("./db").db
    db.all(
      `SELECT * FROM photos WHERE status = 'pending' ORDER BY uploaded_at DESC`,
      [],
      (err, rows) => {
        if (err) {
          console.error("[v0] ❌ Error fetching pending photos:", err)
          return res.status(500).json({ error: "Failed to fetch pending photos" })
        }
        
        const photosWithCamelCase = rows.map((photo) => ({
          id: photo.id,
          filename: photo.filename,
          url: photo.url,
          eventId: photo.event_id,
          description: photo.description,
          userId: photo.user_id,
          user_id: photo.user_id,
          firstName: photo.first_name,
          uploadedAt: photo.uploaded_at,
          createdAt: photo.uploaded_at,
          created_at: photo.uploaded_at,
          status: photo.status,
          approvedAt: photo.approved_at,
          rejectedAt: photo.rejected_at,
          albumId: photo.album_id,
          albumIndex: photo.album_index,
          albumTotal: photo.album_total,
          unlockCount: photo.unlock_count || 0,
          hasBlur: photo.has_blur === 1,
          paidUnlocks: photo.paid_unlocks || 0,
        }))
        
        res.json(photosWithCamelCase)
      }
    )
  } catch (error) {
    console.error("[v0] ❌ Error fetching pending photos:", error)
    res.status(500).json({ error: "Failed to fetch pending photos" })
  }
})

app.post("/api/admin/videos/:id/moderate", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const { action } = req.body
    const video = await getVideoById(req.params.id)

    if (!video) {
      return res.status(404).json({ error: "Video not found" })
    }

    const timestamp = new Date().toISOString()

    if (action === "approve") {
      await updateVideoStatus(req.params.id, "approved", timestamp)
      res.json({ success: true, message: "Відео схвалено" })
    } else if (action === "reject") {
      await updateVideoStatus(req.params.id, "rejected", timestamp)
      res.json({ success: true, message: "Відео відхилено" })
    }
  } catch (error) {
    console.error("Error moderating video:", error)
    res.status(500).json({ error: "Failed to moderate video" })
  }
})

app.post("/api/admin/photos/:id/moderate", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const { action } = req.body
    const photo = await getPhotoById(req.params.id)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    const timestamp = new Date().toISOString()

    if (action === "approve") {
      await updatePhotoStatus(req.params.id, "approved", timestamp)
      res.json({ success: true, message: "Фото схвалено" })
    } else if (action === "reject") {
      await updatePhotoStatus(req.params.id, "rejected", timestamp)
      res.json({ success: true, message: "Фото відхилено" })
    }
  } catch (error) {
    console.error("Error moderating photo:", error)
    res.status(500).json({ error: "Failed to moderate photo" })
  }
})

app.post("/api/admin/hero-image", uploadHeroImage.single("image"), async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const { block } = req.body
    
    if (!block || !["news", "schedule", "video", "events"].includes(block)) {
      return res.status(400).json({ error: "Invalid block name" })
    }

    const dbSettings = await getAllAdminSettings()
    const settingsObj = dbSettings.reduce((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {})

    let heroImages = settingsObj.heroImages || {
      news: "https://placehold.co/600x300/a3e635/444?text=News",
      schedule: "https://placehold.co/600x300/60a5fa/FFF?text=Schedule",
      video: "https://placehold.co/600x300/f87171/FFF?text=Video",
      events: "https://placehold.co/600x300/c084fc/FFF?text=Events",
    }

    if (req.file) {
      heroImages[block] = `/uploads/hero-images/${req.file.filename}`
    }

    await updateAdminSetting("heroImages", heroImages)

    res.json({ success: true, heroImages })
  } catch (error) {
    console.error("Error uploading hero image:", error)
    res.status(500).json({ error: "Failed to upload hero image" })
  }
})

app.post(
  "/api/admin/upload-hero-images",
  uploadHeroImage.fields([
    { name: "news", maxCount: 1 },
    { name: "schedule", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "events", maxCount: 1 },
  ]),
  async (req, res) => {
    const { token } = req.query
    if (token !== "admin-authenticated") {
      return res.status(401).json({ error: "Не авторизовано" })
    }

    try {
      const blocks = ["news", "schedule", "video", "events"]

      const dbSettings = await getAllAdminSettings()
      const settingsObj = dbSettings.reduce((acc, s) => {
        acc[s.key] = s.value
        return acc
      }, {})

      let heroImages = settingsObj.heroImages || {
        news: "https://placehold.co/600x300/a3e635/444?text=News",
        schedule: "https://placehold.co/600x300/60a5fa/FFF?text=Schedule",
        video: "https://placehold.co/600x300/f87171/FFF?text=Video",
        events: "https://placehold.co/600x300/c084fc/FFF?text=Events",
      }

      let imagePositions = settingsObj.imagePositions || {}

      for (const block of blocks) {
        if (req.files && req.files[block]) {
          const file = req.files[block][0]
          heroImages[block] = `/uploads/hero-images/${file.filename}`
        } else if (req.body[`${block}_url`]) {
          heroImages[block] = req.body[`${block}_url`]
        }

        if (req.body[`${block}_position_x`] !== undefined && req.body[`${block}_position_y`] !== undefined) {
          const posX = Number.parseInt(req.body[`${block}_position_x`])
          const posY = Number.parseInt(req.body[`${block}_position_y`])
          imagePositions[block] = {
            x: Number.isNaN(posX) ? 50 : posX,
            y: Number.isNaN(posY) ? 50 : posY,
          }
        }
      }

      await updateAdminSetting('heroImages', heroImages)
      await updateAdminSetting('imagePositions', imagePositions)

      res.json({ success: true, images: heroImages, positions: imagePositions })
    } catch (error) {
      console.error("Error uploading hero images:", error)
      res.status(500).json({ error: "Failed to upload images" })
    }
  },
)

app.get("/api/settings/images", async (req, res) => {
  try {
    const dbSettings = await getAllAdminSettings()
    const settingsObj = dbSettings.reduce((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {})

    res.json({
      images: settingsObj.heroImages || {
        news: "https://placehold.co/600x300/a3e635/444?text=News",
        schedule: "https://placehold.co/600x300/60a5fa/FFF?text=Schedule",
        video: "https://placehold.co/600x300/f87171/FFF?text=Video",
        events: "https://placehold.co/600x300/c084fc/FFF?text=Events",
      },
      positions: settingsObj.imagePositions || {},
    })
  } catch (error) {
    console.error("Error fetching settings images:", error)
    res.status(500).json({ error: "Помилка завантаження налаштувань зображень" })
  }
})

async function parseExcelSchedule(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const worksheet = workbook.worksheets[0]
  const schedule = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
  }

  const dayMap = {
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const timeCell = row.getCell(1).value
    if (!timeCell) return

    const time = String(timeCell).trim()

    for (let col = 2; col <= 6; col++) {
      const cell = row.getCell(col)
      const cellValue = cell.value

      if (cellValue && String(cellValue).trim()) {
        const parts = String(cellValue)
          .split("/")
          .map((p) => p.trim())
        const subject = parts[0] || ""
        const teacher = parts[1] || ""
        const room = parts[2] || ""

        const dayKey = dayMap[col - 1]
        if (dayKey && subject) {
          schedule[dayKey].push({
            time,
            subject,
            teacher,
            room,
          })
        }
      }
    }
  })

  return schedule
}

app.post("/api/admin/upload-schedule", uploadSchedule.single("schedule"), async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "Файл не завантажено" })
    }

    const { name } = req.body
    if (!name) {
      return res.status(400).json({ error: "Назва розкладу обов'язкова" })
    }

    const schedule = await parseExcelSchedule(req.file.path)

    const newSchedule = {
      id: Date.now().toString(),
      name: name,
      scheduleData: schedule,
      createdAt: new Date().toISOString(),
    }

    await insertSchedule(newSchedule)

    res.json({ 
      success: true, 
      schedule: {
        id: newSchedule.id,
        name: newSchedule.name,
        schedule: schedule,
        uploadedAt: newSchedule.createdAt,
        filePath: req.file.path
      }
    })
  } catch (error) {
    console.error("Error uploading schedule:", error)
    res.status(500).json({ error: "Помилка обробки файлу: " + error.message })
  }
})

app.get("/api/admin/schedules", async (req, res) => {
  const { token } = req.query

  try {
    const dbSchedules = await getAllSchedules()
    
    const schedulesData = dbSchedules.map(s => ({
      id: s.id,
      name: s.name,
      schedule: typeof s.schedule_data === 'string' ? JSON.parse(s.schedule_data) : s.schedule_data,
      uploadedAt: s.created_at
    }))

    if (token === "admin-authenticated") {
      res.json(schedulesData)
    } else if (token === "public" || !token) {
      const schedulesToReturn = schedulesData.filter((s) => !s.userId)
      res.json(schedulesToReturn)
    } else {
      return res.status(401).json({ error: "Не авторизовано" })
    }
  } catch (error) {
    console.error("Error fetching schedules:", error)
    res.status(500).json({ error: "Помилка завантаження розкладів" })
  }
})

app.delete("/api/admin/schedules/:id", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const schedule = await getScheduleById(req.params.id)
    if (!schedule) {
      return res.status(404).json({ error: "Розклад не знайдено" })
    }

    await deleteSchedule(req.params.id)

    res.json({ success: true })
  } catch (error) {
    console.error("Error deleting schedule:", error)
    res.status(500).json({ error: "Помилка видалення" })
  }
})

app.get("/api/schedules/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId
    const userScheduleData = await getUserSchedule(userId)

    if (userScheduleData) {
      const schedule = await getScheduleById(userScheduleData.schedule_id)
      if (schedule) {
        res.json({
          id: schedule.id,
          name: schedule.name,
          schedule: typeof schedule.schedule_data === 'string' ? JSON.parse(schedule.schedule_data) : schedule.schedule_data,
          uploadedAt: schedule.created_at,
          userId: userId
        })
      } else {
        res.json(null)
      }
    } else {
      res.json(null)
    }
  } catch (error) {
    console.error("Error fetching user schedule:", error)
    res.status(500).json({ error: "Failed to fetch user schedule" })
  }
})

app.post("/api/schedules/user/:userId/set", async (req, res) => {
  try {
    const userId = req.params.userId
    const { scheduleId } = req.body

    const schedule = await getScheduleById(scheduleId)
    if (!schedule) {
      return res.status(404).json({ error: "Розклад не знайдено" })
    }

    await insertUserSchedule(userId, scheduleId)
    
    res.json({ 
      success: true, 
      schedule: {
        id: schedule.id,
        name: schedule.name,
        schedule: typeof schedule.schedule_data === 'string' ? JSON.parse(schedule.schedule_data) : schedule.schedule_data,
        uploadedAt: schedule.created_at,
        userId: userId
      }
    })
  } catch (error) {
    console.error("Error setting user schedule:", error)
    res.status(500).json({ error: "Помилка встановлення розкладу" })
  }
})

app.delete("/api/schedules/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId
    await deleteUserSchedule(userId)
    res.json({ success: true })
  } catch (error) {
    console.error("Error removing user schedule:", error)
    res.status(500).json({ error: "Помилка видалення розкладу" })
  }
})

// Эндпоинт для очистки базы данных (сейчас не используется, так как используется SQLite)
app.post("/api/admin/clean-database", async (req, res) => {
  const { password, type } = req.body

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: "Invalid password" })
  }

  // Этот endpoint больше не выполняет очистку, так как теперь используется SQLite
  // Для очистки базы данных используйте SQL команды напрямую или миграционные инструменты
  res.json({ 
    success: false, 
    message: "Database cleanup is disabled. Please use migration tools or SQL commands directly for database management." 
  })
})

app.post("/api/admin/events", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const { title, date, time, location, description, duration, creatorUsername } = req.body

    const newEvent = {
      id: Date.now().toString(),
      title,
      date,
      time,
      location,
      description,
      participantsCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (duration || 24) * 60 * 60 * 1000).toISOString(),
      status: "approved",
      organizer: creatorUsername || "Адміністратор",
    }

    await insertEvent(newEvent)

    res.json({ success: true, message: "Івент створено та автоматично схвалено", event: newEvent })
  } catch (error) {
    console.error("Error creating event:", error)
    res.status(500).json({ error: "Failed to create event" })
  }
})

app.post("/api/events/:id/messages/photos", uploadPhoto.array("photos", 10), async (req, res) => {
  console.log("[v0] 📸 ========== ВІДПРАВКА МНОЖИННИХ ФОТО В ЧАТ ==========")

  try {
    const { message, userId, firstName, photoUrl } = req.body
    const photos = req.files
    const eventId = req.params.id

    if (!photos || photos.length === 0) {
      return res.status(400).json({ error: "Фото не завантажено" })
    }

    if (photos.length > 10) {
      return res.status(400).json({ error: "Максимум 10 фото" })
    }

    console.log("[v0] 📷 Кількість фото:", photos.length)

    const restrictionData = await getEventUserRestriction(eventId, userId)
    if (restrictionData) {
      const restriction = restrictionData.restriction
      if (restriction.blocked) {
        return res.status(403).json({ error: "Ви заблоковані в цьому івенті" })
      }
      if (restriction.muted && (!restriction.muteUntil || new Date(restriction.muteUntil) > new Date())) {
        return res.status(403).json({ error: "Ви в муті. Не можете писати повідомлення" })
      }
    }

    const photoPaths = photos.map((photo) => `/uploads/photos/${photo.filename}`)

    const newMessageData = {
      userId,
      firstName,
      message: message || "",
      photoUrl,
      timestamp: new Date().toISOString(),
    }

    await insertEventMessage(eventId, newMessageData)
    console.log("[v0] ✅ Повідомлення з фото додано в базу данных")

    if (typingUsers[eventId] && typingUsers[eventId][userId]) {
      delete typingUsers[eventId][userId]
    }

    const responseMessage = {
      id: Date.now().toString(),
      text: message || "",
      timestamp: newMessageData.timestamp,
      sender: "user",
      userId,
      firstName,
      photoUrl,
      photos: photoPaths,
    }

    res.json(responseMessage)
  } catch (error) {
    console.error("[v0] ❌ Помилка:", error)
    res.status(500).json({ error: "Помилка відправки фото" })
  }
})

const uploadNavigation = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/navigation/")
    },
    filename: (req, file, cb) => {
      const uniqueName = "nav-" + Date.now() + path.extname(file.originalname)
      cb(null, uniqueName)
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
})

// Створюємо директорію для фото навігації
const navigationDir = path.join(__dirname, "uploads/navigation")
fs.mkdir(navigationDir, { recursive: true }).catch(console.error)

app.post("/api/navigation/upload", uploadNavigation.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Фото не завантажено" })
    }

    const { userId } = req.body

    const newPhoto = {
      filename: req.file.filename,
      url: `/uploads/navigation/${req.file.filename}`,
      uploadedAt: new Date().toISOString(),
    }

    const uploadsDir = path.join(__dirname, "uploads")
    await insertNavigationPhoto(newPhoto, uploadsDir)

    res.json({ 
      success: true, 
      photo: {
        id: Date.now().toString(),
        filename: newPhoto.filename,
        url: newPhoto.url,
        userId,
        uploadedAt: newPhoto.uploadedAt
      }
    })
  } catch (error) {
    console.error("Error uploading navigation photo:", error)
    res.status(500).json({ error: "Помилка завантаження фото" })
  }
})

app.get("/api/navigation/photos", async (req, res) => {
  try {
    const dbPhotos = await getAllNavigationPhotos()
    
    const photos = dbPhotos.map(p => ({
      id: p.id.toString(),
      filename: p.filename,
      url: p.url,
      uploadedAt: p.uploaded_at
    }))
    
    res.json(photos)
  } catch (error) {
    console.error("Error fetching navigation photos:", error)
    res.status(500).json({ error: "Помилка завантаження фото навігації" })
  }
})

app.delete("/api/navigation/photos/:id", async (req, res) => {
  try {
    const dbPhotos = await getAllNavigationPhotos()
    const photo = dbPhotos.find((p) => p.id.toString() === req.params.id)

    if (!photo) {
      return res.status(404).json({ error: "Фото не знайдено" })
    }

    try {
      await fs.unlink(path.join(__dirname, "uploads/navigation", photo.filename))
    } catch (err) {
      console.error("Error deleting file:", err)
    }

    await deleteNavigationPhoto(photo.filename)

    res.json({ success: true })
  } catch (error) {
    console.error("Error deleting navigation photo:", error)
    res.status(500).json({ error: "Помилка видалення фото" })
  }
})

// ========== API для Telegram Stars ==========

// Helper function to convert withdrawal DB row to API format (snake_case to camelCase)
function convertWithdrawalToApi(dbRow) {
  if (!dbRow) return null
  return {
    id: dbRow.id,
    userId: dbRow.user_id,
    username: dbRow.username,
    amount: dbRow.amount,
    balance: dbRow.balance,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    processedAt: dbRow.processed_at,
    rejectionReason: dbRow.rejection_reason
  }
}

// Отримати баланс користувача
app.get("/api/stars/balance/:userId", async (req, res) => {
  try {
    const { userId } = req.params
    const balance = await getUserStarsBalance(userId)
    res.json({ balance })
  } catch (error) {
    console.error("Error fetching balance:", error)
    res.status(500).json({ error: "Failed to fetch balance" })
  }
})

// Додати або видалити реакцію на фото (toggle)
app.post("/api/photos/:photoId/react", async (req, res) => {
  try {
    const { photoId } = req.params
    const { userId, reaction } = req.body

    if (!photoId || !userId || !reaction) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    // Get current reactions for this photo
    const reactions = await getPhotoReactions(photoId)
    const userReaction = reactions.find(r => r.user_id === String(userId))

    // Toggle logic: if user already has this reaction, remove it
    if (userReaction && userReaction.reaction === reaction) {
      await deletePhotoReaction(photoId, userId)
      console.log(`[v0] ❌ Користувач ${userId} прибрав реакцію ${reaction} з фото ${photoId}`)
    } else {
      // Add/update reaction (toggle on or change)
      await insertPhotoReaction(photoId, userId, reaction)
      console.log(`[v0] ✅ Користувач ${userId} поставив реакцію ${reaction} на фото ${photoId}`)
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Error toggling reaction:", error)
    res.status(500).json({ error: "Failed to toggle reaction" })
  }
})

// Отримати реакції на фото
app.get("/api/photos/:photoId/reactions", async (req, res) => {
  try {
    const { photoId } = req.params
    const { userId } = req.query

    const reactions = await getPhotoReactions(photoId)

    // Aggregate counts
    const counts = { "❤️": 0 }
    reactions.forEach((r) => {
      if (counts[r.reaction] !== undefined) {
        counts[r.reaction]++
      }
    })

    // Find user's reaction
    const userReaction = userId 
      ? reactions.find(r => r.user_id === String(userId))?.reaction || null
      : null

    res.json({ reactions: counts, userReaction })
  } catch (error) {
    console.error("Error fetching reactions:", error)
    res.status(500).json({ error: "Failed to fetch reactions" })
  }
})

// Створити інвойс для розблокування фото
app.post("/api/photos/:photoId/createInvoice", async (req, res) => {
  try {
    const { photoId } = req.params
    const { userId } = req.body

    const photo = await getPhotoById(photoId)
    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    // Перевірка, чи вже розблоковано
    const alreadyUnlocked = await checkPhotoUnlocked(photoId, userId)
    if (alreadyUnlocked) {
      return res.json({ alreadyUnlocked: true })
    }

    if (!bot) {
      return res.status(500).json({ error: "Telegram bot not configured" })
    }

    // Створюємо посилання на інвойс, щоб оплатити всередині Mini App
    const prices = [{ label: "XTR", amount: 1 }]
    const payload = JSON.stringify({ type: "photo_unlock", photoId, userId })
    const invoiceLink = await bot.createInvoiceLink(
      "Відкрити фото",
      `Розблокуйте фото для перегляду`,
      payload,
      "",
      "XTR",
      prices,
    )

    res.json({ success: true, invoiceLink })
  } catch (error) {
    console.error("Error creating invoice:", error)
    res.status(500).json({ error: "Failed to create invoice" })
  }
})

// Перевірити, чи фото розблоковано
app.get("/api/photos/:photoId/unlocked", async (req, res) => {
  try {
    const { photoId } = req.params
    const { userId } = req.query

    const unlocked = await checkPhotoUnlocked(photoId, userId)
    res.json({ unlocked })
  } catch (error) {
    console.error("[v0] ❌ Error checking photo unlock status:", error)
    res.status(500).json({ error: "Failed to check unlock status" })
  }
})

// Перевірити ліміт блюр-фото на тиждень
app.get("/api/photos/blur-limit/:userId", async (req, res) => {
  try {
    const { userId } = req.params
    const weekStart = getWeekStart()
    
    const blurPhoto = await getWeeklyBlurPhoto(userId, weekStart)
    const limitReached = !!blurPhoto
    res.json({ limitReached })
  } catch (error) {
    console.error("[v0] ❌ Error checking blur limit:", error)
    res.status(500).json({ error: "Failed to check blur limit" })
  }
})

// Запит на вивід зірок
app.post("/api/stars/withdraw", async (req, res) => {
  try {
    const { userId, amount, username } = req.body

    if (!userId || !amount) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const balance = await getUserStarsBalance(userId)

    if (amount < 50) {
      return res.status(400).json({ error: "Мінімальна сума виводу - 50 зірок" })
    }

    if (balance < amount) {
      return res.status(400).json({ error: "Недостатньо зірок на балансі" })
    }

    // Deduct Stars from balance IMMEDIATELY to prevent double withdrawal
    await decrementUserStarsBalance(userId, amount)

    // Create withdrawal request
    const requestId = `WR-${Date.now()}`
    const withdrawalRequest = {
      id: requestId,
      user_id: String(userId),
      username: username || 'unknown',
      amount: amount,
      balance: balance,
      status: 'pending',
      created_at: new Date().toISOString(),
      processed_at: null,
      rejection_reason: null
    }

    await insertWithdrawalRequest(withdrawalRequest)

    // Відправляємо повідомлення адміну для ручної обробки
    if (bot) {
      try {
        await bot.sendMessage(
          ADMIN_TELEGRAM_ID,
          `💰 Новий запит на вивід зірок:\n\n` +
          `ID запиту: ${requestId}\n` +
          `Користувач: @${username || userId}\n` +
          `User ID: ${userId}\n` +
          `Сума: ${amount} ⭐\n` +
          `Баланс до виводу: ${balance} ⭐\n` +
          `Новий баланс: ${balance - amount} ⭐\n\n` +
          `Перейдіть в адмін панель для обробки запиту`
        )
      } catch (error) {
        console.error("[v0] ❌ Помилка відправки повідомлення адміну:", error)
      }
    }

    res.json({ success: true, message: "Запит на вивід відправлено адміністратору" })
  } catch (error) {
    console.error("Error processing withdrawal:", error)
    res.status(500).json({ error: "Failed to process withdrawal" })
  }
})

// Получить все запросы на вывод (админ)
app.get("/api/admin/withdrawal-requests", async (req, res) => {
  try {
    const { token } = req.query
    if (token !== "admin-authenticated") {
      return res.status(401).json({ error: "Не авторизовано" })
    }

    const dbRequests = await getAllWithdrawalRequests()
    // Convert from snake_case to camelCase
    const requests = dbRequests.map(convertWithdrawalToApi)

    res.json(requests)
  } catch (error) {
    console.error("Error fetching withdrawal requests:", error)
    res.status(500).json({ error: "Failed to fetch withdrawal requests" })
  }
})

// Одобрить запрос на вывод (админ)
app.post("/api/admin/withdrawal-requests/:id/approve", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const { id } = req.params
    const dbRequest = await getWithdrawalRequestById(id)

    if (!dbRequest) {
      return res.status(404).json({ error: "Запит не знайдено" })
    }

    if (dbRequest.status !== 'pending') {
      return res.status(400).json({ error: "Запит вже оброблено" })
    }

    // Update status to approved (Stars already deducted when request was created)
    const processedAt = new Date().toISOString()
    await updateWithdrawalRequestStatus(id, 'approved', processedAt, null)

    // Get current balance for notification
    const currentBalance = await getUserStarsBalance(dbRequest.user_id)

    // Уведомляем пользователя
    if (bot) {
      try {
        await bot.sendMessage(
          dbRequest.user_id,
          `✅ Ваш запит на вивід схвалено!\n\n` +
          `Сума: ${dbRequest.amount} ⭐\n` +
          `Поточний баланс: ${currentBalance} ⭐\n\n` +
          `Зірки будуть переведені найближчим часом.`
        )
      } catch (error) {
        console.error("[v0] ❌ Помилка відправки повідомлення користувачу:", error)
      }
    }

    // Convert to API format for response
    const updatedRequest = await getWithdrawalRequestById(id)
    res.json({ success: true, request: convertWithdrawalToApi(updatedRequest) })
  } catch (error) {
    console.error("Error approving withdrawal:", error)
    res.status(500).json({ error: "Помилка обробки запиту" })
  }
})

// Отклонить запрос на вывод (админ)
app.post("/api/admin/withdrawal-requests/:id/reject", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const { id } = req.params
    const { reason } = req.body
    const dbRequest = await getWithdrawalRequestById(id)

    if (!dbRequest) {
      return res.status(404).json({ error: "Запит не знайдено" })
    }

    if (dbRequest.status !== 'pending') {
      return res.status(400).json({ error: "Запит вже оброблено" })
    }

    // Refund Stars back to user balance (they were deducted when request was created)
    await incrementUserStarsBalance(dbRequest.user_id, dbRequest.amount)

    // Update status to rejected
    const processedAt = new Date().toISOString()
    const rejectionReason = reason || 'Причина не вказана'
    await updateWithdrawalRequestStatus(id, 'rejected', processedAt, rejectionReason)

    // Get updated balance for notification
    const currentBalance = await getUserStarsBalance(dbRequest.user_id)

    // Уведомляем пользователя
    if (bot) {
      try {
        await bot.sendMessage(
          dbRequest.user_id,
          `❌ Ваш запит на вивід відхилено\n\n` +
          `Сума: ${dbRequest.amount} ⭐\n` +
          `Причина: ${rejectionReason}\n\n` +
          `Зірки повернуто на ваш баланс: ${currentBalance} ⭐`
        )
      } catch (error) {
        console.error("[v0] ❌ Помилка відправки повідомлення користувачу:", error)
      }
    }

    // Convert to API format for response
    const updatedRequest = await getWithdrawalRequestById(id)
    res.json({ success: true, request: convertWithdrawalToApi(updatedRequest) })
  } catch (error) {
    console.error("Error rejecting withdrawal:", error)
    res.status(500).json({ error: "Помилка обробки запиту" })
  }
})

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"))
})

app.listen(PORT, "0.0.0.0", () => {
  console.log(`U-hub server running on port ${PORT}`)
  console.log(`Access the app at: http://0.0.0.0:${PORT}`)

  updateNewsCache()
  setInterval(updateNewsCache, 30 * 60 * 1000)
})

module.exports = app
