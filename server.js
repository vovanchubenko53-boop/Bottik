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
let navigationPhotos = []
let userStarsBalances = {}
let photoReactions = {}
let photoUnlocks = {}
let dailyPhotoUploads = {}
let weeklyBlurPhotos = {}
let photoEarnings = {}
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
      // Обробка успішних платежів
      if (msg.successful_payment) {
        console.log("[v0] ✅ Успішний платіж:", msg.successful_payment)

        try {
          const payload = JSON.parse(msg.successful_payment.invoice_payload)

          if (payload.type === "photo_unlock") {
            const { photoId, userId } = payload
            const photo = photosData.find((p) => p.id === photoId)

            if (photo) {
              // Розблокування фото
              if (!photoUnlocks[photoId]) {
                photoUnlocks[photoId] = []
              }
              if (!photoUnlocks[photoId].includes(String(userId))) {
                photoUnlocks[photoId].push(String(userId))
              }

              // Збільшуємо лічильник платних відкриттів
              photo.paidUnlocks = (photo.paidUnlocks || 0) + 1

              // Перевіряємо чи досягнуто 50 відкриттів
              const authorId = String(photo.userId)
              if (!photoEarnings[photoId]) {
                photoEarnings[photoId] = { earned: 0, lastPayout: 0 }
              }

              photoEarnings[photoId].earned += 1

              // Автоматична виплата кожні 50 відкриттів
              if (photoEarnings[photoId].earned >= 50 && 
                  photoEarnings[photoId].earned % 50 === 0) {
                
                userStarsBalances[authorId] = (userStarsBalances[authorId] || 0) + 50
                photoEarnings[photoId].lastPayout = photoEarnings[photoId].earned

                // Відправляємо повідомлення автору
                try {
                  await bot.sendMessage(
                    photo.userId,
                    `🎉 Вітаємо!\n\nВаше фото набрало ${photoEarnings[photoId].earned} платних переглядів!\n\n💰 Вам нараховано 50 Telegram Stars ⭐\n\nПродовжуйте публікувати якісні фото!`
                  )
                } catch (notifyError) {
                  console.error("[v0] ❌ Помилка відправки повідомлення автору:", notifyError)
                }
              }

              await saveData()

              await bot.sendMessage(msg.chat.id, "✅ Фото розблоковано! Ви можете переглянути його в галереї.")
            }
          }
        } catch (error) {
          console.error("[v0] ❌ Помилка обробки платежу:", error)
        }
        return
      }

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
          const photo = photosData.find((p) => p.id === photoId)
          if (!photo) {
            console.error("[v0] ❌ Фото не знайдено:", photoId)
            return
          }

          // Розблоковуємо фото для користувача
          if (!photoUnlocks[photoId]) {
            photoUnlocks[photoId] = []
          }
          if (!photoUnlocks[photoId].includes(String(userId))) {
            photoUnlocks[photoId].push(String(userId))
          }

          const authorId = String(photo.userId)
          userStarsBalances[authorId] = (userStarsBalances[authorId] || 0) + 1

          // Оновлюємо лічильник відкриттів фото
          photo.unlockCount = (photo.unlockCount || 0) + 1

          if (photo.unlockCount % 50 === 0) {
            const starsToTransfer = 50
            const currentBalance = userStarsBalances[authorId] || 0

            // Відправляємо повідомлення автору про нагороду
            try {
              await bot.sendMessage(
                authorId,
                `🎉 Вітаємо! Ваше фото набрало ${photo.unlockCount} відкриттів!\n\n` +
                  `⭐ Вам нараховано ${starsToTransfer} зірок Telegram!\n` +
                  `💰 Ваш поточний баланс: ${currentBalance} зірок\n\n` +
                  `Продовжуйте публікувати якісні фото! 📸`,
              )
              console.log(`[v0] 🎁 Відправлено повідомлення автору ${authorId} про ${starsToTransfer} зірок`)
            } catch (error) {
              console.error(`[v0] ❌ Помилка відправки повідомлення автору:`, error)
            }
          }

          await saveData()

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
        const video = videosData.find((v) => v.id === videoId)
        if (video) {
          if (action === "approve" || action === 'ap') {
            video.status = "approved"
            video.approvedAt = new Date().toISOString()
            bot.editMessageCaption(`✅ Відео схвалено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          } else if (action === "reject" || action === 'rj') {
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
      } else if (type === "event_mod" || type === 'e') {
        const event = eventsData.find((e) => e.id === eventId)
        if (event) {
          if (action === "approve" || action === 'ap') {
            event.status = "approved"
            event.approvedAt = new Date().toISOString()
            bot.editMessageText(`✅ Івент схвалено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          } else if (action === "reject" || action === 'rj') {
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
      } else if (type === "photo_mod" || type === 'p') {
        const photo = photosData.find((p) => p.id === photoId)
        if (photo) {
          if (action === "approve" || action === 'ap') {
            photo.status = "approved"
            photo.approvedAt = new Date().toISOString()
            bot.editMessageCaption(`✅ Фото схвалено`, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
            })
          } else if (action === "reject" || action === 'rj') {
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
      const navigationPhotosFile = await fs.readFile(path.join(dataPath, "navigationPhotos.json"), "utf-8")
      navigationPhotos = JSON.parse(navigationPhotosFile)
      console.log("[v0] ✅ Фото навігації завантажено:", navigationPhotos.length)
    } catch (error) {
      navigationPhotos = []
      console.log("[v0] ⚠️ Файл фото навігації не знайдено, створено новий масив")
    }

    try {
      const starsBalancesFile = await fs.readFile(path.join(dataPath, "userStarsBalances.json"), "utf-8")
      userStarsBalances = JSON.parse(starsBalancesFile)
      console.log("[v0] ✅ Балансы звезд загружены")
    } catch (e) {
      userStarsBalances = {}
      console.log("[v0] ⚠️ Файл балансов не найден, создан новый объект")
    }

    try {
      const photoReactionsFile = await fs.readFile(path.join(dataPath, "photoReactions.json"), "utf-8")
      photoReactions = JSON.parse(photoReactionsFile)
      console.log("[v0] ✅ Реакции на фото загружены")
    } catch (e) {
      photoReactions = {}
      console.log("[v0] ⚠️ Файл реакций не найден, создан новый объект")
    }

    try {
      const photoUnlocksFile = await fs.readFile(path.join(dataPath, "photoUnlocks.json"), "utf-8")
      photoUnlocks = JSON.parse(photoUnlocksFile)
      console.log("[v0] ✅ Разблокировки фото загружены")
    } catch (e) {
      photoUnlocks = {}
      console.log("[v0] ⚠️ Файл разблокировок не найден, создан новый объект")
    }

    try {
      const dailyPhotoUploadsFile = await fs.readFile(path.join(dataPath, "dailyPhotoUploads.json"), "utf-8")
      dailyPhotoUploads = JSON.parse(dailyPhotoUploadsFile)
      console.log("[v0] ✅ Ежедневные загрузки фото загружены")
    } catch (e) {
      dailyPhotoUploads = {}
      console.log("[v0] ⚠️ Файл ежедневных загрузок не найден, создан новый объект")
    }

    try {
      const weeklyBlurPhotosFile = await fs.readFile(path.join(dataPath, "weeklyBlurPhotos.json"), "utf-8")
      weeklyBlurPhotos = JSON.parse(weeklyBlurPhotosFile)
      console.log("[v0] ✅ Еженедельные блюр-фото загружены")
    } catch (e) {
      weeklyBlurPhotos = {}
      console.log("[v0] ⚠️ Файл еженедельных блюр-фото не найден, создан новый объект")
    }

    try {
      const photoEarningsFile = await fs.readFile(path.join(dataPath, "photoEarnings.json"), "utf-8")
      photoEarnings = JSON.parse(photoEarningsFile)
      console.log("[v0] ✅ Заработки по фото загружены")
    } catch (e) {
      photoEarnings = {}
      console.log("[v0] ⚠️ Файл заработков не найден, создан новый объект")
    }

    eventsData.forEach((event) => {
      if (!eventParticipants[event.id]) {
        eventParticipants[event.id] = []
      }
      event.participants = eventParticipants[event.id].length
      if (!eventMessages[event.id]) {
        eventMessages[event.id] = []
      }
      // Инициализация unlockCount для существующих фото
      photosData.forEach((photo) => {
        if (photo.id === event.id && !photo.unlockCount) {
          photo.unlockCount = 0
        }
      })
    })
    console.log("Data loaded successfully")
  } catch (error) {
    console.error("Error initializing data:", error)
  }
}

async function saveData() {
  try {
    const dataPath = path.join(__dirname, "data")
    await fs.mkdir(dataPath, { recursive: true })

    await Promise.all([
      fs.writeFile(path.join(dataPath, "events.json"), JSON.stringify(eventsData, null, 2)),
      fs.writeFile(path.join(dataPath, "schedules.json"), JSON.stringify(schedulesData, null, 2)),
      fs.writeFile(path.join(dataPath, "videos.json"), JSON.stringify(videosData, null, 2)),
      fs.writeFile(path.join(dataPath, "photos.json"), JSON.stringify(photosData, null, 2)),
      fs.writeFile(path.join(dataPath, "eventMessages.json"), JSON.stringify(eventMessages, null, 2)),
      fs.writeFile(path.join(dataPath, "eventParticipants.json"), JSON.stringify(eventParticipants, null, 2)),
      fs.writeFile(path.join(dataPath, "adminSettings.json"), JSON.stringify(adminSettings, null, 2)),
      fs.writeFile(path.join(dataPath, "userRestrictions.json"), JSON.stringify(userRestrictions, null, 2)),
      fs.writeFile(path.join(dataPath, "navigationPhotos.json"), JSON.stringify(navigationPhotos, null, 2)),
      fs.writeFile(path.join(dataPath, "userStarsBalances.json"), JSON.stringify(userStarsBalances, null, 2)),
      fs.writeFile(path.join(dataPath, "photoReactions.json"), JSON.stringify(photoReactions, null, 2)),
      fs.writeFile(path.join(dataPath, "photoUnlocks.json"), JSON.stringify(photoUnlocks, null, 2)),
      fs.writeFile(path.join(dataPath, "dailyPhotoUploads.json"), JSON.stringify(dailyPhotoUploads, null, 2)),
      fs.writeFile(path.join(dataPath, "weeklyBlurPhotos.json"), JSON.stringify(weeklyBlurPhotos, null, 2)),
      fs.writeFile(path.join(dataPath, "photoEarnings.json"), JSON.stringify(photoEarnings, null, 2)),
    ])

    console.log("Data saved successfully")
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

    for (const event of eventsData) {
      if (notifiedEvents.has(event.id)) continue

      const eventDateTime = parseEventDateTime(event.date, event.time)

      if (eventDateTime >= fiveMinutesFromOneHour && eventDateTime <= oneHourFromNow) {
        console.log(`[v0] 🔔 Отправляем уведомление для события: ${event.title}`)

        const participants = eventParticipants[event.id] || []

        for (const participant of participants) {
          if (bot && participant.userId) {
            try {
              await bot.sendMessage(
                participant.userId,
                `🔔 Нагадування!\n\nПодія "${event.title}" почнеться через 1 годину!\n\n📅 ${event.date} о ${event.time}\n📍 ${event.location}`,
              )
              console.log(`[v0] ✅ Уведомление отправлено пользователю ${participant.userId}`)
            } catch (error) {
              console.error(`[v0] ❌ Ошибка отправки уведомления пользователю ${participant.userId}:`, error.message)
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

    const { eventId, description, userId, firstName, albumId, albumIndex, albumTotal, hasBlur } = req.body

    if (!eventId) {
      console.error("[v0] ❌ ОШИБКА: Event ID не предоставлен!")
      return res.status(400).json({ error: "Event ID is required" })
    }

    const blurEnabled = hasBlur === "true" || hasBlur === true

    if (blurEnabled) {
      const weekStart = getWeekStart()
      const userWeekKey = `${userId}_${weekStart}`

      if (weeklyBlurPhotos[userWeekKey]) {
        // Дозволяємо продовжити, якщо це той самий альбом із блюром від цього ж користувача
        if (albumId) {
          const sameAlbumBlur = photosData.find(
            (p) => p.albumId === albumId && String(p.userId) === String(userId) && p.hasBlur,
          )
          if (!sameAlbumBlur) {
            console.log("[v0] ⚠️ Ліміт блюр-фото: інший альбом/фото у цей тиждень")
            return res.status(400).json({
              error:
                "Ви вже використали ліміт блюр-фото на цей тиждень (1 фото/альбом з блюром на тиждень)",
            })
          }
        } else {
          console.log("[v0] ⚠️ Ліміт блюр-фото: вже було фото з блюром цього тижня")
          return res.status(400).json({
            error: "Ви вже використали ліміт блюр-фото на цей тиждень (1 фото з блюром на тиждень)",
          })
        }
      } else {
        // Помічаємо використання ліміту на цей тиждень
        weeklyBlurPhotos[userWeekKey] = albumId || new Date().toISOString()
        console.log(`[v0] ✅ Встановлено блюр для користувача ${userId}, ключ: ${userWeekKey}, альбом: ${albumId || 'single'}`)
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

    const newPhoto = {
      id: Date.now().toString() + "-" + (albumIndex || "0"),
      filename: req.file.filename,
      url: `/uploads/photos/${req.file.filename}`,
      eventId,
      description: description || "",
      userId,
      firstName: firstName || "Анонім",
      uploadedAt: new Date().toISOString(),
      status: "pending",
      albumId: albumId || null,
      albumIndex: albumIndex ? Number.parseInt(albumIndex) : null,
      albumTotal: albumTotal ? Number.parseInt(albumTotal) : null,
      unlockCount: 0,
      hasBlur: blurEnabled,
      paidUnlocks: 0,
    }

    console.log("[v0] 💾 Добавляем фото в массив photosData...")
    photosData.push(newPhoto)
    console.log("[v0] ✅ Фото добавлено. Всего фото:", photosData.length)

    await saveData()
    console.log("[v0] ✅ Данные сохранены")

    // Відправляємо повідомлення в Telegram тільки для першого фото альбому або окремого фото
    if (bot && botUsers.length > 0 && (!albumIndex || albumIndex === "0")) {
      console.log("[v0] 🤖 Отправляем уведомление в Telegram...")
      const adminUsers = botUsers.slice(0, 1)
      for (const admin of adminUsers) {
        try {
          const event = eventsData.find((e) => e.id === eventId)
          const eventName = event ? event.title : "Подія"
          const photoCount = albumTotal ? ` (${albumTotal} фото)` : ""
          console.log("[v0] 📤 Отправляем фото адміну:", admin.chatId)

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
              admin.chatId,
              `${publicBaseUrl}${newPhoto.url}`,
              {
              caption: `📸 Нове фото на модерацію${photoCount}:\n\n🎉 Івент: ${eventName}\n👤 Автор: ${newPhoto.firstName}\n📝 Опис: ${newPhoto.description || "без опису"}`,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Підтвердити", callback_data: buildCallbackData('p', newPhoto.id, 'ap') },
                    { text: "❌ Відхилити", callback_data: buildCallbackData('p', newPhoto.id, 'rj') },
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
    res.json({
      success: true,
      message: "Фото відправлено на модерацію",
      photo: newPhoto,
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

app.get("/api/photos/:photoId/reactions", (req, res) => {
  const { photoId } = req.params
  const reactions = photoReactions[photoId] || {}

  const counts = { "❤️": 0 }
  Object.values(reactions).forEach((reaction) => {
    if (counts[reaction] !== undefined) {
      counts[reaction]++
    }
  })

  res.json({ reactions: counts, userReaction: reactions[req.query.userId] || null })
})

app.get("/api/photos", (req, res) => {
  const { eventId } = req.query

  let photos = photosData.filter((photo) => photo.status === "approved")

  if (eventId) {
    photos = photos.filter((p) => p.eventId === eventId)
  }

  // Сортуємо фото за датою - нові зверху
  photos.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))

  const photosWithUnlockCount = photos.map((photo) => ({
    ...photo,
    unlockCount: photoUnlocks[photo.id] ? photoUnlocks[photo.id].length : 0,
  }))

  res.json(photosWithUnlockCount)
})

app.get("/api/photos/pending", (req, res) => {
  const pendingPhotos = photosData.filter((p) => p.status === "pending")
  res.json(pendingPhotos)
})

app.post("/api/photos/:id/moderate", async (req, res) => {
  try {
    const { action, description, eventId, albumId } = req.body // Додано albumId
    const photo = photosData.find((p) => p.id === req.params.id)

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    if (action === "approve") {
      photo.status = "approved"
      photo.approvedAt = new Date().toISOString()
      if (description !== undefined) photo.description = description
      if (eventId !== undefined) photo.eventId = eventId
      if (albumId !== undefined) photo.albumId = albumId
      
      console.log(`[v0] ✅ Фото ${photo.id} одобрено, hasBlur: ${photo.hasBlur}`)
      
      res.json({ success: true, message: "Фото схвалено", hasBlur: photo.hasBlur })
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

    // Удалено строку: photosData = photosData.filter((p) => p.eventId !== eventId)

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
  const { password, type } = req.body

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: "Invalid password" })
  }

  try {
    if (type === "events") {
      eventsData = []
      eventMessages = {}
      eventParticipants = {}
    } else if (type === "videos") {
      videosData = []
    } else if (type === "photos") {
      photosData = []
    } else if (type === "schedules") {
      schedulesData = []
    } else if (type === "all") {
      eventsData = []
      videosData = []
      photosData = []
      schedulesData = []
      eventMessages = {}
      eventParticipants = {}
      navigationPhotos = [] // Додано очищення фото навігації
    }

    await saveData()
    res.json({ success: true, message: "Database cleaned successfully" })
  } catch (error) {
    console.error("Error cleaning database:", error)
    res.status(500).json({ error: "Failed to clean database" })
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

app.post("/api/events/:id/messages/photos", uploadPhoto.array("photos", 10), async (req, res) => {
  console.log("[v0] 📸 ========== ВІДПРАВКА МНОЖИННИХ ФОТО В ЧАТ ==========")

  try {
    const { message, userId, firstName, photoUrl } = req.body // Видалено eventId, воно береться з params
    const photos = req.files
    const eventId = req.params.id // Використовуємо id з параметрів маршруту

    if (!photos || photos.length === 0) {
      return res.status(400).json({ error: "Фото не завантажено" })
    }

    if (photos.length > 10) {
      return res.status(400).json({ error: "Максимум 10 фото" })
    }

    console.log("[v0] 📷 Кількість фото:", photos.length)

    const restrictionKey = `${eventId}_${userId}`
    if (userRestrictions[restrictionKey]) {
      const restriction = userRestrictions[restrictionKey]
      if (restriction.blocked) {
        return res.status(403).json({ error: "Ви заблоковані в цьому івенті" })
      }
      if (restriction.muted && (!restriction.muteUntil || new Date(restriction.muteUntil) > new Date())) {
        return res.status(403).json({ error: "Ви в муті. Не можете писати повідомлення" })
      }
    }

    if (!eventMessages[eventId]) {
      eventMessages[eventId] = []
    }

    // Створюємо одне повідомлення з множинними фото
    const photoPaths = photos.map((photo) => `/uploads/photos/${photo.filename}`)

    const newMessage = {
      id: Date.now().toString(),
      text: message || "",
      timestamp: new Date().toISOString(),
      sender: "user",
      userId,
      firstName,
      photoUrl,
      photos: photoPaths, // Масив шляхів до фото
    }

    eventMessages[eventId].push(newMessage)
    console.log("[v0] ✅ Повідомлення з фото додано")

    if (typingUsers[eventId] && typingUsers[eventId][userId]) {
      delete typingUsers[eventId][userId]
    }

    await saveData()
    console.log("[v0] 💾 Дані збережено")

    res.json(newMessage)
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
      id: Date.now().toString(),
      filename: req.file.filename,
      url: `/uploads/navigation/${req.file.filename}`,
      userId,
      uploadedAt: new Date().toISOString(),
    }

    navigationPhotos.push(newPhoto)
    await saveData()

    res.json({ success: true, photo: newPhoto })
  } catch (error) {
    console.error("Error uploading navigation photo:", error)
    res.status(500).json({ error: "Помилка завантаження фото" })
  }
})

app.get("/api/navigation/photos", (req, res) => {
  res.json(navigationPhotos)
})

app.delete("/api/navigation/photos/:id", async (req, res) => {
  try {
    const photoIndex = navigationPhotos.findIndex((p) => p.id === req.params.id)

    if (photoIndex === -1) {
      return res.status(404).json({ error: "Фото не знайдено" })
    }

    const photo = navigationPhotos[photoIndex]

    // Видаляємо файл
    try {
      await fs.unlink(path.join(__dirname, "uploads/navigation", photo.filename))
    } catch (err) {
      console.error("Error deleting file:", err)
    }

    navigationPhotos.splice(photoIndex, 1)
    await saveData()

    res.json({ success: true })
  } catch (error) {
    console.error("Error deleting navigation photo:", error)
    res.status(500).json({ error: "Помилка видалення фото" })
  }
})

// ========== API для Telegram Stars ==========

// Отримати баланс користувача
app.get("/api/stars/balance/:userId", (req, res) => {
  const { userId } = req.params
  const balance = userStarsBalances[userId] || 0
  res.json({ balance })
})

// Додати реакцію на фото
app.post("/api/photos/:photoId/react", async (req, res) => {
  try {
    const { photoId } = req.params
    const { userId, reaction } = req.body

    if (!photoId || !userId || !reaction) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    if (!photoReactions[photoId]) {
      photoReactions[photoId] = {}
    }

    photoReactions[photoId][userId] = reaction

    await saveData()
    res.json({ success: true })
  } catch (error) {
    console.error("Error adding reaction:", error)
    res.status(500).json({ error: "Failed to add reaction" })
  }
})

// Отримати реакції на фото
app.get("/api/photos/:photoId/reactions", (req, res) => {
  const { photoId } = req.params
  const reactions = photoReactions[photoId] || {}

  const counts = { "❤️": 0 }
  Object.values(reactions).forEach((reaction) => {
    if (counts[reaction] !== undefined) {
      counts[reaction]++
    }
  })

  res.json({ reactions: counts, userReaction: reactions[req.query.userId] || null })
})

// Створити інвойс для розблокування фото
app.post("/api/photos/:photoId/createInvoice", async (req, res) => {
  try {
    const { photoId } = req.params
    const { userId } = req.body

    const photo = photosData.find((p) => p.id === photoId)
    if (!photo) {
      return res.status(404).json({ error: "Photo not found" })
    }

    // Перевірка, чи вже розблоковано
    if (photoUnlocks[photoId] && photoUnlocks[photoId].includes(String(userId))) {
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
app.get("/api/photos/:photoId/unlocked", (req, res) => {
  const { photoId } = req.params
  const { userId } = req.query

  const unlocked = photoUnlocks[photoId] && photoUnlocks[photoId].includes(String(userId))
  res.json({ unlocked })
})

// Перевірити ліміт блюр-фото на тиждень
app.get("/api/photos/blur-limit/:userId", (req, res) => {
  const { userId } = req.params
  const weekStart = getWeekStart()
  const userWeekKey = `${userId}_${weekStart}`
  
  const limitReached = !!weeklyBlurPhotos[userWeekKey]
  res.json({ limitReached })
})

// Запит на вивід зірок
app.post("/api/stars/withdraw", async (req, res) => {
  try {
    const { userId, amount } = req.body

    if (!userId || !amount) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const balance = userStarsBalances[userId] || 0

    if (amount < 50) {
      return res.status(400).json({ error: "Мінімальна сума виводу - 50 зірок" })
    }

    if (balance < amount) {
      return res.status(400).json({ error: "Недостатньо зірок на балансі" })
    }

    // Відправляємо повідомлення адміну для ручної обробки
    if (bot && botUsers.length > 0) {
      const adminUsers = botUsers.slice(0, 1)
      for (const admin of adminUsers) {
        await bot.sendMessage(
          admin.chatId,
          `💰 Запит на вивід зірок:\n\nКористувач ID: ${userId}\nСума: ${amount} ⭐️\nПоточний баланс: ${balance} ⭐️`,
        )
      }
    }

    res.json({ success: true, message: "Запит на вивід відправлено адміністратору" })
  } catch (error) {
    console.error("Error processing withdrawal:", error)
    res.status(500).json({ error: "Failed to process withdrawal" })
  }
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
