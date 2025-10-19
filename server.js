require("dotenv").config()

const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")
const multer = require("multer")
const path = require("path")
const fs = require("fs").promises
const ExcelJS = require("exceljs")
const newsParser = require("./parsers/newsParser")
const scheduleParser = require("./parsers/scheduleParser")
const TelegramBot = require("node-telegram-bot-api")
const { exec } = require("child_process")
const util = require("util")
const execPromise = util.promisify(exec)
const { saveUser, getAllUsers, getUserCount, migrateFromJSON } = require("./db")

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
let eventsData = []
let schedulesData = []
let videosData = []
let photosData = []
let eventMessages = {}
let eventParticipants = {}
let botUsers = []
let userRestrictions = {}
let adminSettings = {
  heroImages: {
    news: "https://placehold.co/600x300/a3e635/444?text=News",
    schedule: "https://placehold.co/600x300/60a5fa/FFF?text=Schedule",
    video: "https://placehold.co/600x300/f87171/FFF?text=Video",
    events: "https://placehold.co/600x300/c084fc/FFF?text=Events",
  },
  imagePositions: {
    news: { x: 50, y: 50 },
    schedule: { x: 50, y: 50 },
    video: { x: 50, y: 50 },
    events: { x: 50, y: 50 },
  },
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234"

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""
let bot = null

let uhubChatMessages = []
const uhubTypingUsers = {}

if (BOT_TOKEN) {
  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true })
    console.log("Telegram bot initialized")

    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id
      const user = msg.from

      try {
        await saveUser(chatId, user.first_name, user.last_name, user.username)

        // Также сохраняем в JSON для обратной совместимости
        if (!botUsers.find((u) => u.chatId === chatId)) {
          botUsers.push({
            chatId,
            firstName: user.first_name,
            username: user.username,
            joinedAt: new Date().toISOString(),
          })
          saveBotUsers()
        }

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

    bot.on("callback_query", async (query) => {
      const chatId = query.message.chat.id
      const user = query.from

      try {
        await saveUser(chatId, user.first_name, user.last_name, user.username)
      } catch (error) {
        console.error("[v0] ❌ Ошибка сохранения пользователя при callback:", error.message)
      }

      const data = JSON.parse(query.data)

      if (data.type === "video_mod") {
        const video = videosData.find((v) => v.id === data.videoId)
        if (video) {
          if (data.action === "approve") {
            video.status = "approved"
            video.approvedAt = new Date().toISOString()
            bot.editMessageCaption(`✅ Відео схвалено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          } else if (data.action === "reject") {
            video.status = "rejected"
            video.rejectedAt = new Date().toISOString()
            bot.editMessageCaption(`❌ Відео відхилено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          }
          await saveData()
        }
        bot.answerCallbackQuery(query.id)
      } else if (data.type === "event_mod") {
        const event = eventsData.find((e) => e.id === data.eventId)
        if (event) {
          if (data.action === "approve") {
            event.status = "approved"
            event.approvedAt = new Date().toISOString()
            bot.editMessageText(`✅ Івент схвалено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          } else if (data.action === "reject") {
            event.status = "rejected"
            event.rejectedAt = new Date().toISOString()
            bot.editMessageText(`❌ Івент відхилено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          }
          await saveData()
        }
        bot.answerCallbackQuery(query.id)
      } else if (data.type === "photo_mod") {
        const photo = photosData.find((p) => p.id === data.photoId)
        if (photo) {
          if (data.action === "approve") {
            photo.status = "approved"
            photo.approvedAt = new Date().toISOString()
            bot.editMessageCaption(`✅ Фото схвалено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          } else if (data.action === "reject") {
            photo.status = "rejected"
            photo.rejectedAt = new Date().toISOString()
            bot.editMessageCaption(`❌ Фото відхилено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          }
          await saveData()
        }
        bot.answerCallbackQuery(query.id)
      }
    })
  } catch (error) {
    console.error("Error initializing Telegram bot:", error.message)
  }
}

async function initializeData() {
  try {
    const dataPath = path.join(__dirname, "data")

    try {
      const eventsFile = await fs.readFile(path.join(dataPath, "events.json"), "utf-8")
      eventsData = JSON.parse(eventsFile)
    } catch (e) {
      eventsData = []
    }

    try {
      const videosFile = await fs.readFile(path.join(dataPath, "videos.json"), "utf-8")
      videosData = JSON.parse(videosFile)
    } catch (e) {
      videosData = []
    }

    try {
      const photosFile = await fs.readFile(path.join(dataPath, "photos.json"), "utf-8")
      photosData = JSON.parse(photosFile)
    } catch (e) {
      photosData = []
    }

    schedulesData = await scheduleParser.initializeSchedules(dataPath)

    await loadBotUsers()

    if (botUsers.length > 0) {
      try {
        await migrateFromJSON(botUsers)
      } catch (error) {
        console.error("[v0] ❌ Ошибка миграции пользователей:", error.message)
      }
    }

    await loadAdminSettings()
    await loadUserRestrictions()
    await loadEventParticipants()

    try {
      const messagesFile = await fs.readFile(path.join(dataPath, "eventMessages.json"), "utf-8")
      eventMessages = JSON.parse(messagesFile)
      console.log("[v0] ✅ Сообщения событий загружены")
    } catch (e) {
      eventMessages = {}
      console.log("[v0] ⚠️ Файл сообщений не найден, создан новый объект")
    }

    try {
      const uhubChatFile = await fs.readFile(path.join(dataPath, "uhubChatMessages.json"), "utf-8")
      uhubChatMessages = JSON.parse(uhubChatFile)
      console.log("[v0] ✅ Сообщения общего чата загружены:", uhubChatMessages.length)
    } catch (e) {
      uhubChatMessages = []
      console.log("[v0] ⚠️ Файл сообщений общего чата не найден, создан новый массив")
    }

    eventsData.forEach((event) => {
      if (!eventParticipants[event.id]) {
        eventParticipants[event.id] = []
      }
      event.participants = eventParticipants[event.id].length
      if (!eventMessages[event.id]) {
        eventMessages[event.id] = []
      }
    })
  } catch (error) {
    console.error("Error initializing data:", error)
  }
}

async function saveData() {
  try {
    const dataPath = path.join(__dirname, "data")
    await fs.mkdir(dataPath, { recursive: true })
    await fs.writeFile(path.join(dataPath, "events.json"), JSON.stringify(eventsData, null, 2))
    await fs.writeFile(path.join(dataPath, "videos.json"), JSON.stringify(videosData, null, 2))
    await fs.writeFile(path.join(dataPath, "photos.json"), JSON.stringify(photosData, null, 2))
    await saveEventParticipants()
    // Сохраняем сообщения событий в файл
    try {
      await fs.mkdir(dataPath, { recursive: true })
      await fs.writeFile(path.join(dataPath, "eventMessages.json"), JSON.stringify(eventMessages, null, 2))
    } catch (error) {
      console.error("Error saving event messages:", error)
    }
    try {
      await fs.writeFile(path.join(dataPath, "uhubChatMessages.json"), JSON.stringify(uhubChatMessages, null, 2))
    } catch (error) {
      console.error("Error saving uhub chat messages:", error)
    }
  } catch (error) {
    console.error("Error saving data:", error)
  }
}

async function saveBotUsers() {
  try {
    const dataPath = path.join(__dirname, "data")
    await fs.mkdir(dataPath, { recursive: true })
    await fs.writeFile(path.join(dataPath, "botUsers.json"), JSON.stringify(botUsers, null, 2))
  } catch (error) {
    console.error("Error saving bot users:", error)
  }
}

async function loadBotUsers() {
  try {
    const dataPath = path.join(__dirname, "data")
    const botUsersFile = await fs.readFile(path.join(dataPath, "botUsers.json"), "utf-8")
    botUsers = JSON.parse(botUsersFile)
  } catch (e) {
    botUsers = []
  }
}

async function saveUserRestrictions() {
  try {
    const dataPath = path.join(__dirname, "data")
    await fs.mkdir(dataPath, { recursive: true })
    await fs.writeFile(path.join(dataPath, "userRestrictions.json"), JSON.stringify(userRestrictions, null, 2))
  } catch (error) {
    console.error("Error saving user restrictions:", error)
  }
}

async function loadUserRestrictions() {
  try {
    const dataPath = path.join(__dirname, "data")
    const restrictionsFile = await fs.readFile(path.join(dataPath, "userRestrictions.json"), "utf-8")
    userRestrictions = JSON.parse(restrictionsFile)
  } catch (e) {
    userRestrictions = {}
  }
}

async function saveAdminSettings() {
  try {
    const dataPath = path.join(__dirname, "data")
    await fs.mkdir(dataPath, { recursive: true })
    await fs.writeFile(path.join(dataPath, "adminSettings.json"), JSON.stringify(adminSettings, null, 2))
  } catch (error) {
    console.error("Error saving admin settings:", error)
  }
}

async function loadAdminSettings() {
  try {
    const dataPath = path.join(__dirname, "data")
    const settingsFile = await fs.readFile(path.join(dataPath, "adminSettings.json"), "utf-8")
    adminSettings = JSON.parse(settingsFile)
  } catch (e) {
    adminSettings = {
      heroImages: {
        news: "https://placehold.co/600x300/a3e635/444?text=News",
        schedule: "https://placehold.co/600x300/60a5fa/FFF?text=Schedule",
        video: "https://placehold.co/600x300/f87171/FFF?text=Video",
        events: "https://placehold.co/600x300/c084fc/FFF?text=Events",
      },
      imagePositions: {
        news: { x: 50, y: 50 },
        schedule: { x: 50, y: 50 },
        video: { x: 50, y: 50 },
        events: { x: 50, y: 50 },
      },
    }
  }
}

async function saveEventParticipants() {
  try {
    const dataPath = path.join(__dirname, "data")
    await fs.mkdir(dataPath, { recursive: true })
    await fs.writeFile(path.join(dataPath, "eventParticipants.json"), JSON.stringify(eventParticipants, null, 2))
  } catch (error) {
    console.error("Error saving event participants:", error)
  }
}

async function loadEventParticipants() {
  try {
    const dataPath = path.join(__dirname, "data")
    const participantsFile = await fs.readFile(path.join(dataPath, "eventParticipants.json"), "utf-8")
    eventParticipants = JSON.parse(participantsFile)
  } catch (e) {
    eventParticipants = {}
  }
}

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

app.get("/api/events", (req, res) => {
  const now = new Date()
  const cutoffTime = new Date(now.getTime() - 72 * 60 * 60 * 1000) // 72 часа назад для автоудаления

  const approvedEvents = eventsData
    .filter((e) => {
      // Показываем только одобренные события
      if (e.status !== "approved" && e.status) return false

      const expiresAt = new Date(e.expiresAt)
      if (expiresAt < cutoffTime) {
        return false // Скрываем события, истекшие более 72 часов назад
      }

      return true
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // Новые вверху

  res.json(approvedEvents)
})

app.get("/api/events/:id", (req, res) => {
  const event = eventsData.find((e) => e.id === req.params.id)
  if (event) {
    res.json(event)
  } else {
    res.status(404).json({ error: "Event not found" })
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
      participants: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (duration || 24) * 60 * 60 * 1000).toISOString(),
      joined: false,
      status: "pending",
      creatorUsername: creatorUsername || "Анонім",
    }

    eventsData.push(newEvent)
    eventMessages[newEvent.id] = []
    await saveData()

    if (bot && botUsers.length > 0) {
      const adminUsers = botUsers.slice(0, 1)
      for (const admin of adminUsers) {
        try {
          await bot.sendMessage(
            admin.chatId,
            `🎉 Новий івент на модерацію:\n\n📝 Назва: ${newEvent.title}\n📅 Дата: ${newEvent.date}\n⏰ Час: ${newEvent.time}\n📍 Місце: ${newEvent.location}\n👤 Автор: ${newEvent.creatorUsername}\n\nОпис: ${newEvent.description}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Підтвердити",
                      callback_data: JSON.stringify({ type: "event_mod", eventId: newEvent.id, action: "approve" }),
                    },
                    {
                      text: "❌ Відхилити",
                      callback_data: JSON.stringify({ type: "event_mod", eventId: newEvent.id, action: "reject" }),
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
    const event = eventsData.find((e) => e.id === req.params.id)

    if (event) {
      if (!eventParticipants[event.id]) {
        eventParticipants[event.id] = []
        console.log("[v0] 📝 Создан новый массив участников для события")
      }

      const existingParticipant = eventParticipants[event.id].find((p) => String(p.userId) === String(userId))

      if (!existingParticipant) {
        eventParticipants[event.id].push({ userId, firstName, photoUrl, joinedAt: new Date().toISOString() })
        console.log("[v0] ✅ Участник добавлен")

        if (!eventMessages[event.id]) {
          eventMessages[event.id] = []
        }

        eventMessages[event.id].push({
          id: Date.now().toString(),
          text: "Привіт👋",
          timestamp: new Date().toISOString(),
          sender: "system",
          userId: userId,
          firstName: firstName,
          photoUrl: photoUrl,
        })
        console.log("[v0] 👋 Добавлено приветственное сообщение с эмодзи")
      } else {
        console.log("[v0] ⚠️ Участник уже в списке")
      }

      event.participants = eventParticipants[event.id].length
      console.log("[v0] 📊 Обновлено количество участников:", event.participants)

      await saveData()
      console.log("[v0] 💾 Данные сохранены")

      res.json({ success: true, participants: event.participants, joined: true })
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
    const event = eventsData.find((e) => e.id === req.params.id)

    if (event) {
      if (eventParticipants[event.id]) {
        eventParticipants[event.id] = eventParticipants[event.id].filter((p) => String(p.userId) !== String(userId))
        event.participants = eventParticipants[event.id].length
        await saveData()
      }

      res.json({ success: true, participants: event.participants, joined: false })
    } else {
      res.status(404).json({ error: "Event not found" })
    }
  } catch (error) {
    console.error("Error leaving event:", error)
    res.status(500).json({ error: "Failed to leave event" })
  }
})

app.get("/api/events/:id/joined", (req, res) => {
  console.log("[v0] 🔍 Проверка участия в событии:", req.params.id, "User:", req.query.userId)

  const { userId } = req.query
  const event = eventsData.find((e) => e.id === req.params.id)

  if (event && eventParticipants[event.id]) {
    const isJoined = eventParticipants[event.id].some((p) => String(p.userId) === String(userId))
    const participants = eventParticipants[event.id].length

    console.log("[v0] 📊 Результат проверки:")
    console.log("[v0]   - Joined:", isJoined)
    console.log("[v0]   - Participants:", participants)

    res.json({ joined: isJoined, participants: participants })
  } else {
    console.log("[v0] ⚠️ Событие не найдено или нет участников")
    res.json({ joined: false, participants: event?.participants || 0 })
  }
})

const typingUsers = {} // { eventId: { userId: { firstName, timestamp } } }

app.post("/api/events/:id/messages", async (req, res) => {
  console.log("[v0] 💬 ========== ОТПРАВКА СООБЩЕНИЯ ==========")
  console.log("[v0] 📋 Event ID:", req.params.id)
  console.log("[v0] 📝 Message:", req.body.message)
  console.log("[v0] 👤 User:", req.body.firstName)

  const { message, userId, firstName, photoUrl } = req.body
  const eventId = req.params.id

  const restrictionKey = `${eventId}_${userId}`
  if (userRestrictions[restrictionKey]) {
    const restriction = userRestrictions[restrictionKey]
    if (restriction.blocked) {
      console.log("[v0] ❌ Пользователь заблокирован")
      return res.status(403).json({ error: "Ви заблоковані в цьому івенті" })
    }
    if (restriction.muted && (!restriction.muteUntil || new Date(restriction.muteUntil) > new Date())) {
      console.log("[v0] ❌ Пользователь в муте")
      return res.status(403).json({ error: "Ви в муті. Не можете писати повідомлення" })
    }
  }

  if (!eventMessages[eventId]) {
    eventMessages[eventId] = []
    console.log("[v0] 📝 Создан новый массив сообщений для события")
  }

  const newMessage = {
    id: Date.now().toString(),
    text: message,
    timestamp: new Date().toISOString(),
    sender: "user",
    userId,
    firstName,
    photoUrl,
  }

  eventMessages[eventId].push(newMessage)
  console.log("[v0] ✅ Сообщение добавлено")
  console.log("[v0] 📊 Всего сообщений в чате:", eventMessages[eventId].length)

  if (typingUsers[eventId] && typingUsers[eventId][userId]) {
    delete typingUsers[eventId][userId]
  }

  // Сохраняем сообщения в файл
  try {
    const dataPath = path.join(__dirname, "data")
    await fs.mkdir(dataPath, { recursive: true })
    await fs.writeFile(path.join(dataPath, "eventMessages.json"), JSON.stringify(eventMessages, null, 2))
    console.log("[v0] 💾 Сообщения сохранены в файл")
  } catch (error) {
    console.error("[v0] ❌ Ошибка сохранения сообщений:", error)
  }

  console.log("[v0] 💬 ========== КОНЕЦ ОТПРАВКИ СООБЩЕНИЯ ==========")
  res.json(newMessage)
})

app.get("/api/events/:id/messages", (req, res) => {
  const eventId = req.params.id
  console.log("[v0] 📨 Запрос сообщений для события:", eventId)
  console.log("[v0] 📊 Количество сообщений:", eventMessages[eventId]?.length || 0)
  res.json(eventMessages[eventId] || [])
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

app.get("/api/events/:eventId/participants/:userId", (req, res) => {
  const { eventId, userId } = req.params

  if (!eventParticipants[eventId]) {
    return res.status(404).json({ error: "Event not found" })
  }

  const participant = eventParticipants[eventId].find((p) => String(p.userId) === String(userId))

  if (!participant) {
    return res.status(404).json({ error: "Participant not found" })
  }

  res.json(participant)
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
    const videoData = {
      id: Date.now().toString(),
      filename: videoFile.filename,
      originalName: videoFile.originalname,
      path: `/uploads/videos/${videoFile.filename}`,
      thumbnailPath: thumbnailPath,
      uploadedAt: new Date().toISOString(),
      status: "pending",
      size: videoFile.size,
    }

    console.log("[v0] 📊 Данные видео:", JSON.stringify(videoData, null, 2))

    console.log("[v0] 💾 Добавляем видео в массив videosData...")
    console.log("[v0] 📈 Текущее количество видео:", videosData.length)
    videosData.push(videoData)
    console.log("[v0] ✅ Видео добавлено. Новое количество:", videosData.length)

    console.log("[v0] 💾 Сохраняем данные в файл...")
    await saveData()
    console.log("[v0] ✅ Данные сохранены успешно")

    if (bot && botUsers.length > 0) {
      console.log("[v0] 🤖 Отправляем уведомление в Telegram бот...")
      console.log("[v0] 👥 Количество пользователей бота:", botUsers.length)

      const adminUsers = botUsers.slice(0, 1)
      console.log("[v0] 👤 Отправляем админам:", adminUsers.length)

      for (const admin of adminUsers) {
        try {
          console.log("[v0] 📤 Отправляем сообщение админу:", admin.chatId)
          await bot.sendMessage(
            admin.chatId,
            `🎥 Нове відео на модерацію:\n\n📝 Назва: ${videoData.originalName}\n📅 Дата: ${new Date(videoData.uploadedAt).toLocaleString("uk-UA")}\n💾 Розмір: ${(videoData.size / 1024 / 1024).toFixed(2)} MB`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Підтвердити",
                      callback_data: JSON.stringify({ type: "video_mod", videoId: videoData.id, action: "approve" }),
                    },
                    {
                      text: "❌ Відхилити",
                      callback_data: JSON.stringify({ type: "video_mod", videoId: videoData.id, action: "reject" }),
                    },
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
    } else {
      console.log("[v0] ⚠️ Telegram бот не настроен или нет пользователей")
      console.log("[v0] 🤖 Bot:", bot ? "инициализирован" : "не инициализирован")
      console.log("[v0] 👥 Пользователей:", botUsers.length)
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

app.get("/api/videos/pending", (req, res) => {
  const pendingVideos = videosData.filter((v) => v.status === "pending")
  res.json(pendingVideos)
})

app.get("/api/videos/approved", (req, res) => {
  const approvedVideos = videosData
    .filter((v) => v.status === "approved")
    .sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt))
    .slice(0, 3)
  res.json(approvedVideos)
})

app.post("/api/videos/:id/moderate", async (req, res) => {
  try {
    const { action } = req.body
    const video = videosData.find((v) => v.id === req.params.id)

    if (!video) {
      return res.status(404).json({ error: "Video not found" })
    }

    if (action === "approve") {
      video.status = "approved"
      video.approvedAt = new Date().toISOString()
      res.json({ success: true, message: "Відео схвалено" })
    } else if (action === "reject") {
      video.status = "rejected"
      video.rejectedAt = new Date().toISOString()
      res.json({ success: true, message: "Відео відхилено" })
    }

    await saveData()
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

    const { eventId, description, userId, firstName } = req.body

    if (!eventId) {
      console.error("[v0] ❌ ОШИБКА: Event ID не предоставлен!")
      return res.status(400).json({ error: "Event ID is required" })
    }

    console.log("[v0] 📝 Данные фото:")
    console.log("[v0]   - Event ID:", eventId)
    console.log("[v0]   - Description:", description)
    console.log("[v0]   - User ID:", userId)
    console.log("[v0]   - First Name:", firstName)

    const newPhoto = {
      id: Date.now().toString(),
      filename: req.file.filename,
      url: `/uploads/photos/${req.file.filename}`,
      eventId,
      description: description || "",
      userId,
      firstName: firstName || "Анонім",
      uploadedAt: new Date().toISOString(),
      status: "pending",
    }

    console.log("[v0] 💾 Добавляем фото в массив photosData...")
    photosData.push(newPhoto)
    console.log("[v0] ✅ Фото добавлено. Всего фото:", photosData.length)

    await saveData()
    console.log("[v0] ✅ Данные сохранены")

    if (bot && botUsers.length > 0) {
      console.log("[v0] 🤖 Отправляем уведомление в Telegram...")
      const adminUsers = botUsers.slice(0, 1)
      for (const admin of adminUsers) {
        try {
          const event = eventsData.find((e) => e.id === eventId)
          const eventName = event ? event.title : "Подія"
          console.log("[v0] 📤 Отправляем фото админу:", admin.chatId)

          await bot.sendPhoto(
            admin.chatId,
            `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : "http://localhost:5000"}${newPhoto.url}`,
            {
              caption: `📸 Нове фото на модерацію:\n\n🎉 Івент: ${eventName}\n👤 Автор: ${newPhoto.firstName}\n📝 Опис: ${newPhoto.description || "без опису"}`,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Підтвердити",
                      callback_data: JSON.stringify({ type: "photo_mod", photoId: newPhoto.id, action: "approve" }),
                    },
                    {
                      text: "❌ Відхилити",
                      callback_data: JSON.stringify({ type: "photo_mod", photoId: newPhoto.id, action: "reject" }),
                    },
                  ],
                ],
              },
            },
          )
          console.log("[v0] ✅ Уведомление отправлено")
        } catch (error) {
          console.error("[v0] ❌ Ошибка отправки в Telegram:", error.message)
        }
      }
    }

    console.log("[v0] 📤 Отправляем успешный ответ клиенту")
    res.json({ success: true, message: "Фото відправлено на модерацію", photo: newPhoto })
    console.log("[v0] 📸 ========== КОНЕЦ ОБРАБОТКИ ЗАГРУЗКИ ФОТО ==========")
  } catch (error) {
    console.error("[v0] 💥 ========== КРИТИЧЕСКАЯ ОШИБКА ==========")
    console.error("[v0] 📛 Тип ошибки:", error.name)
    console.error("[v0] 📄 Сообщение:", error.message)
    console.error("[v0] 📚 Stack trace:", error.stack)
    console.error("[v0] 💥 ========================================")
    res.status(500).json({ error: "Failed to upload photo" })
  }
})

app.get("/api/photos", (req, res) => {
  const { eventId } = req.query
  let photos = photosData.filter((p) => p.status === "approved" || !p.status)

  if (eventId) {
    photos = photos.filter((p) => p.eventId === eventId)
  }

  res.json(photos)
})

app.get("/api/photos/pending", (req, res) => {
  const pendingPhotos = photosData.filter((p) => p.status === "pending")
  res.json(pendingPhotos)
})

app.post("/api/photos/:id/moderate", async (req, res) => {
  try {
    const { action, description, eventId } = req.body
    const photo = photosData.find((p) => p.id === req.params.id)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    if (action === "approve") {
      photo.status = "approved"
      photo.approvedAt = new Date().toISOString()
      if (description !== undefined) photo.description = description
      if (eventId !== undefined) photo.eventId = eventId
      res.json({ success: true, message: "Фото схвалено" })
    } else if (action === "reject") {
      photo.status = "rejected"
      photo.rejectedAt = new Date().toISOString()
      res.json({ success: true, message: "Фото відхилено" })
    }

    await saveData()
  } catch (error) {
    console.error("Error moderating photo:", error)
    res.status(500).json({ error: "Failed to moderate photo" })
  }
})

app.delete("/api/photos/:id", async (req, res) => {
  try {
    const photoIndex = photosData.findIndex((p) => p.id === req.params.id)
    if (photoIndex === -1) {
      return res.status(404).json({ error: "Photo not found" })
    }

    const photo = photosData[photoIndex]
    try {
      await fs.unlink(path.join(__dirname, "uploads/photos", photo.filename))
    } catch (error) {
      console.error("Error deleting photo file:", error)
    }

    photosData.splice(photoIndex, 1)
    await saveData()

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

app.get("/api/admin/settings", (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }
  res.json(adminSettings)
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

  adminSettings = { ...adminSettings, ...req.body }
  await saveAdminSettings()
  res.json({ success: true, settings: adminSettings })
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
        console.error("[v0] ❌ Ошибка загрузки из SQLite, используем JSON:", error.message)
        users = botUsers // Fallback на JSON
        console.log("[v0] 👥 Используем пользователей из JSON:", users.length)
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

app.get("/api/admin/videos/pending", (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  const pendingVideos = videosData.filter((v) => v.status === "pending")
  res.json(pendingVideos)
})

app.get("/api/admin/events/pending", (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  const pendingEvents = eventsData.filter((e) => e.status === "pending")
  res.json(pendingEvents)
})

app.delete("/api/admin/events/:id", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const eventId = req.params.id
    const eventIndex = eventsData.findIndex((e) => e.id === eventId)

    if (eventIndex === -1) {
      return res.status(404).json({ error: "Event not found" })
    }

    eventsData.splice(eventIndex, 1)

    eventParticipants[eventId] = undefined
    delete eventParticipants[eventId]

    eventMessages[eventId] = undefined
    delete eventMessages[eventId]

    // Убрали строку: photosData = photosData.filter((p) => p.eventId !== eventId)

    await saveData()

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
    const event = eventsData.find((e) => e.id === req.params.id)

    if (!event) {
      return res.status(404).json({ error: "Event not found" })
    }

    if (action === "approve") {
      event.status = "approved"
      event.approvedAt = new Date().toISOString()
      res.json({ success: true, message: "Івент схвалено" })
    } else if (action === "reject") {
      event.status = "rejected"
      event.rejectedAt = new Date().toISOString()
      res.json({ success: true, message: "Івент відхилено" })
    }

    await saveData()
  } catch (error) {
    console.error("Error moderating event:", error)
    res.status(500).json({ error: "Failed to moderate event" })
  }
})

app.get("/api/admin/events/all", (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  res.json(eventsData)
})

app.get("/api/admin/events/:id/participants", (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  const eventId = req.params.id
  const participants = eventParticipants[eventId] || []

  const participantsWithRestrictions = participants.map((p) => {
    const restrictionKey = `${eventId}_${p.userId}`
    return {
      ...p,
      restrictions: userRestrictions[restrictionKey] || null,
    }
  })

  res.json(participantsWithRestrictions)
})

app.post("/api/admin/events/:id/restrict-user", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const eventId = req.params.id
    const { userId, action, duration } = req.body
    const restrictionKey = `${eventId}_${userId}`

    if (action === "block") {
      userRestrictions[restrictionKey] = {
        blocked: true,
        blockedAt: new Date().toISOString(),
      }
    } else if (action === "mute") {
      const muteUntil = duration ? new Date(Date.now() + duration * 60 * 1000).toISOString() : null
      userRestrictions[restrictionKey] = {
        muted: true,
        mutedAt: new Date().toISOString(),
        muteUntil,
      }
    } else if (action === "unblock") {
      if (userRestrictions[restrictionKey]) {
        delete userRestrictions[restrictionKey].blocked
        delete userRestrictions[restrictionKey].blockedAt
        if (Object.keys(userRestrictions[restrictionKey]).length === 0) {
          delete userRestrictions[restrictionKey]
        }
      }
    } else if (action === "unmute") {
      if (userRestrictions[restrictionKey]) {
        delete userRestrictions[restrictionKey].muted
        delete userRestrictions[restrictionKey].mutedAt
        delete userRestrictions[restrictionKey].muteUntil
        if (Object.keys(userRestrictions[restrictionKey]).length === 0) {
          delete userRestrictions[restrictionKey]
        }
      }
    }

    await saveUserRestrictions()
    res.json({ success: true })
  } catch (error) {
    console.error("Error restricting user:", error)
    res.status(500).json({ error: "Failed to restrict user" })
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

      if (!adminSettings.imagePositions) {
        adminSettings.imagePositions = {}
      }

      for (const block of blocks) {
        if (req.files && req.files[block]) {
          const file = req.files[block][0]
          adminSettings.heroImages[block] = `/uploads/hero-images/${file.filename}`
        } else if (req.body[`${block}_url`]) {
          adminSettings.heroImages[block] = req.body[`${block}_url`]
        }

        if (req.body[`${block}_position_x`] !== undefined && req.body[`${block}_position_y`] !== undefined) {
          const posX = Number.parseInt(req.body[`${block}_position_x`])
          const posY = Number.parseInt(req.body[`${block}_position_y`])
          adminSettings.imagePositions[block] = {
            x: Number.isNaN(posX) ? 50 : posX,
            y: Number.isNaN(posY) ? 50 : posY,
          }
        }
      }

      await saveAdminSettings()
      res.json({ success: true, images: adminSettings.heroImages, positions: adminSettings.imagePositions })
    } catch (error) {
      console.error("Error uploading hero images:", error)
      res.status(500).json({ error: "Failed to upload images" })
    }
  },
)

app.get("/api/settings/images", (req, res) => {
  res.json({
    images: adminSettings.heroImages,
    positions: adminSettings.imagePositions || {},
  })
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
      schedule: schedule,
      uploadedAt: new Date().toISOString(),
      filePath: req.file.path,
    }

    schedulesData.push(newSchedule)
    await saveData()

    res.json({ success: true, schedule: newSchedule })
  } catch (error) {
    console.error("Error uploading schedule:", error)
    res.status(500).json({ error: "Помилка обробки файлу: " + error.message })
  }
})

app.get("/api/admin/schedules", (req, res) => {
  const { token } = req.query

  if (token === "admin-authenticated") {
    res.json(schedulesData)
  } else if (token === "public" || !token) {
    const schedulesToReturn = schedulesData.filter((s) => !s.userId)
    res.json(schedulesToReturn)
  } else {
    return res.status(401).json({ error: "Не авторизовано" })
  }
})

app.delete("/api/admin/schedules/:id", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const scheduleIndex = schedulesData.findIndex((s) => s.id === req.params.id)
    if (scheduleIndex === -1) {
      return res.status(404).json({ error: "Розклад не знайдено" })
    }

    schedulesData.splice(scheduleIndex, 1)
    await saveData()

    res.json({ success: true })
  } catch (error) {
    console.error("Error deleting schedule:", error)
    res.status(500).json({ error: "Помилка видалення" })
  }
})

app.get("/api/schedules/user/:userId", (req, res) => {
  const userId = req.params.userId
  const userSchedule = schedulesData.find((s) => s.userId === userId)

  if (userSchedule) {
    res.json(userSchedule)
  } else {
    res.json(null)
  }
})

app.post("/api/schedules/user/:userId/set", async (req, res) => {
  try {
    const userId = req.params.userId
    const { scheduleId } = req.body

    const schedule = schedulesData.find((s) => s.id === scheduleId)
    if (!schedule) {
      return res.status(404).json({ error: "Розклад не знайдено" })
    }

    const userScheduleIndex = schedulesData.findIndex((s) => s.userId === userId)
    if (userScheduleIndex !== -1) {
      schedulesData[userScheduleIndex] = { ...schedule, userId }
    } else {
      schedulesData.push({ ...schedule, userId, id: Date.now().toString() })
    }

    await saveData()
    res.json({ success: true, schedule: schedulesData.find((s) => s.userId === userId) })
  } catch (error) {
    console.error("Error setting user schedule:", error)
    res.status(500).json({ error: "Помилка встановлення розкладу" })
  }
})

app.delete("/api/schedules/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId
    const userScheduleIndex = schedulesData.findIndex((s) => s.userId === userId)

    if (userScheduleIndex !== -1) {
      schedulesData.splice(userScheduleIndex, 1)
      await saveData()
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Error removing user schedule:", error)
    res.status(500).json({ error: "Помилка видалення розкладу" })
  }
})

// Новый эндпоинт для очистки базы данных
app.post("/api/admin/clean-database", async (req, res) => {
  const { token } = req.query
  if (token !== "admin-authenticated") {
    return res.status(401).json({ error: "Не авторизовано" })
  }

  try {
    const { type } = req.body

    if (type === "all") {
      eventsData = []
      videosData = []
      schedulesData = schedulesData.filter((s) => !s.userId) // оставить только системные
      photosData = []
      eventMessages = {}
      eventParticipants = {}
      userRestrictions = {}
      uhubChatMessages = [] // Очистка общего чата
    } else if (type === "events") {
      eventsData = []
      eventMessages = {}
      eventParticipants = {}
    } else if (type === "schedules") {
      // Удаляем только пользовательские расписания
      const systemSchedules = schedulesData.filter((s) => !s.userId)
      schedulesData = systemSchedules
    } else if (type === "videos") {
      videosData = []
    } else if (type === "uhubChat") {
      // Добавлена очистка общего чата
      uhubChatMessages = []
    }

    await saveData()
    res.json({ success: true, message: `Базу успішно очищено: ${type}` })
  } catch (error) {
    console.error("Error cleaning database:", error)
    res.status(500).json({ error: "Помилка очищення бази" })
  }
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
      participants: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (duration || 24) * 60 * 60 * 1000).toISOString(),
      joined: false,
      status: "approved", // Автоматически одобряем события от админа
      creatorUsername: creatorUsername || "Адміністратор",
    }

    eventsData.push(newEvent)
    eventMessages[newEvent.id] = []
    eventParticipants[newEvent.id] = []
    await saveData()

    res.json({ success: true, message: "Івент створено та автоматично схвалено", event: newEvent })
  } catch (error) {
    console.error("Error creating event:", error)
    res.status(500).json({ error: "Failed to create event" })
  }
})

app.post("/api/uhub-chat/messages", async (req, res) => {
  console.log("[v0] 💬 ========== ОТПРАВКА СООБЩЕНИЯ В ОБЩИЙ ЧАТ ==========")
  console.log("[v0] 📝 Message:", req.body.message)
  console.log("[v0] 👤 User:", req.body.firstName)

  const { message, userId, firstName, photoUrl } = req.body

  const newMessage = {
    id: Date.now().toString(),
    text: message,
    timestamp: new Date().toISOString(),
    sender: "user",
    userId,
    firstName,
    photoUrl,
  }

  uhubChatMessages.push(newMessage)
  console.log("[v0] ✅ Сообщение добавлено")
  console.log("[v0] 📊 Всего сообщений в общем чате:", uhubChatMessages.length)

  if (uhubTypingUsers[userId]) {
    delete uhubTypingUsers[userId]
  }

  await saveData()
  console.log("[v0] 💾 Сообщения сохранены")

  console.log("[v0] 💬 ========== КОНЕЦ ОТПРАВКИ СООБЩЕНИЯ ==========")
  res.json(newMessage)
})

app.get("/api/uhub-chat/messages", (req, res) => {
  console.log("[v0] 📨 Запрос сообщений общего чата")
  console.log("[v0] 📊 Количество сообщений:", uhubChatMessages.length)
  res.json(uhubChatMessages)
})

app.post("/api/uhub-chat/typing", (req, res) => {
  const { userId, firstName, isTyping } = req.body

  console.log("[v0] ⌨️ Typing event (общий чат):", { userId, firstName, isTyping })

  if (isTyping) {
    uhubTypingUsers[userId] = {
      firstName,
      timestamp: Date.now(),
    }
    console.log("[v0] ✅ Пользователь добавлен в печатающие:", firstName)
  } else {
    delete uhubTypingUsers[userId]
    console.log("[v0] ❌ Пользователь удален из печатающих:", firstName)
  }

  res.json({ success: true })
})

app.get("/api/uhub-chat/typing", (req, res) => {
  const { userId } = req.query

  console.log("[v0] 👀 Запрос печатающих для общего чата от пользователя:", userId)

  const now = Date.now()
  let cleaned = 0
  Object.keys(uhubTypingUsers).forEach((uid) => {
    if (now - uhubTypingUsers[uid].timestamp > 5000) {
      delete uhubTypingUsers[uid]
      cleaned++
    }
  })

  if (cleaned > 0) {
    console.log("[v0] 🧹 Очищено устаревших индикаторов:", cleaned)
  }

  const typing = Object.entries(uhubTypingUsers)
    .filter(([uid]) => uid !== userId)
    .map(([uid, data]) => data.firstName)

  console.log("[v0] 📊 Печатающие пользователи (кроме текущего):", typing)

  res.json(typing)
})

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"))
})

initializeData().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`U-hub server running on port ${PORT}`)
    console.log(`Access the app at: http://0.0.0.0:${PORT}`)

    updateNewsCache()
    setInterval(updateNewsCache, 30 * 60 * 1000)
  })
})

module.exports = app
