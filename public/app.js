const API_URL = window.location.origin
let currentEvent = null
let currentSchedule = null
let currentNews = null
let userSchedule = null
let telegramUser = null
const lucide = window.lucide // Declare the lucide variable

let chatUpdateInterval = null
let typingTimeout = null
const lastMessageId = null

let uhubChatUpdateInterval = null
let uhubTypingTimeout = null
const UHUB_CHAT_ID = "uhub-general-chat"

let allNewsCache = []
let currentCategory = "all"

if (window.Telegram && window.Telegram.WebApp) {
  const tg = window.Telegram.WebApp
  telegramUser = tg.initDataUnsafe?.user || null
}

if (!telegramUser) {
  const savedUser = localStorage.getItem("guestUser")
  if (savedUser) {
    telegramUser = JSON.parse(savedUser)
  } else {
    telegramUser = {
      id: Date.now(),
      first_name: "Гість",
      photo_url: null,
    }
    localStorage.setItem("guestUser", JSON.stringify(telegramUser))
  }
}

function updateTime() {
  const now = new Date()
  const time = now.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  const date = now.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })

  document.querySelectorAll(".time").forEach((el) => (el.textContent = time))
  document.querySelectorAll(".date").forEach((el) => (el.textContent = date))
}

function goToPage(pageId, event) {
  if (event && event.stopPropagation) {
    event.stopPropagation()
  }

  // Останавливаем автообновление чата при выходе
  if (pageId !== "page-event-chat" && chatUpdateInterval) {
    clearInterval(chatUpdateInterval)
    chatUpdateInterval = null
  }

  if (pageId !== "page-uhub-chat" && uhubChatUpdateInterval) {
    clearInterval(uhubChatUpdateInterval)
    uhubChatUpdateInterval = null
  }

  const targetPage = document.getElementById(pageId)
  if (!targetPage) {
    console.error("Page not found:", pageId)
    return
  }

  const currentPage = document.querySelector(".page.active")
  if (currentPage) {
    currentPage.classList.remove("active")
    void currentPage.offsetWidth
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      targetPage.classList.add("active")
      if (lucide) {
        lucide.createIcons()
      }
    })
  })

  if (pageId === "page-news-feed") {
    loadNews()
  } else if (pageId === "page-events-list") {
    loadEvents()
  } else if (pageId === "page-event-photos") {
    loadEventPhotos()
  } else if (pageId === "page-upload-photo") {
    loadUploadPhotoEvents()
  } else if (pageId === "page-event-chat") {
    loadChatMessages()
  } else if (pageId === "page-schedule-search") {
    loadAvailableSchedules()
  } else if (pageId === "page-schedule-list") {
    loadUserSchedule()
    updateScheduleDayCounts()
  } else if (pageId === "page-uhub-chat") {
    loadUhubChatMessages()
  }
}

function clearLegacySchedule() {
  // Очистить все возможные ключи localStorage
  const legacyKeys = ["userSchedule", "selectedSchedule", "scheduleData", "currentSchedule"]

  legacyKeys.forEach((key) => {
    localStorage.removeItem(key)
  })

  // Также сбросить переменные в памяти
  userSchedule = null
  currentSchedule = null

  // Обновить интерфейс
  document.getElementById("main-schedule-subtitle").style.display = "none"

  console.log("Legacy schedule data cleared")
}

function updateScheduleDayCounts() {
  if (!currentSchedule || !currentSchedule.schedule) return

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
  days.forEach((day) => {
    const count = currentSchedule.schedule[day] ? currentSchedule.schedule[day].length : 0
    const countElement = document.getElementById(`${day}-count`)
    if (countElement) {
      countElement.textContent = count === 0 ? "немає пар" : `${count} ${getPairsText(count)}`
    }
  })
}

function getPairsText(count) {
  if (count === 1) return "пара"
  if (count >= 2 && count <= 4) return "пари"
  return "пар"
}

function showModerationNotification(message) {
  // Удалить существующие уведомления
  const existingNotifications = document.querySelectorAll(".moderation-notification")
  existingNotifications.forEach((notification) => notification.remove())

  const notification = document.createElement("div")
  notification.className = "moderation-notification"
  notification.textContent = message

  document.body.appendChild(notification)

  setTimeout(() => {
    notification.remove()
  }, 3000)
}

async function loadNews() {
  try {
    const response = await fetch(`${API_URL}/api/news`)
    const news = await response.json()

    allNewsCache = news.slice(0, 100)

    const newsListEl = document.getElementById("news-list")
    if (allNewsCache.length === 0) {
      newsListEl.innerHTML = '<div class="p-4 text-center text-gray-500">Новини не знайдено</div>'
      return
    }

    // Отображаем новости с учетом текущей категории
    displayFilteredNews()

    if (news[0]) {
      document.getElementById("main-news-title").textContent = news[0].title
      document.getElementById("main-news-source").textContent = `"${news[0].source}" - ${news[0].timeAgo}`
      if (news[0].date) {
        document.getElementById("main-news-date").textContent = news[0].date
      }
    }
  } catch (error) {
    console.error("Error loading news:", error)
    document.getElementById("news-list").innerHTML =
      '<div class="p-4 text-center text-red-500">Помилка завантаження новин</div>'
  }
}

function viewNewsDetail(newsItem) {
  currentNews = newsItem
  document.getElementById("news-detail-source").textContent = newsItem.source
  document.getElementById("news-detail-time").textContent = newsItem.timeAgo
  document.getElementById("news-detail-title").textContent = newsItem.title
  document.getElementById("news-detail-content").textContent =
    newsItem.content || newsItem.description || "Перейдіть за посиланням для повного перегляду"

  if (newsItem.link) {
    document.getElementById("news-detail-link").href = newsItem.link
    document.getElementById("news-detail-link").style.display = "block"
  } else {
    document.getElementById("news-detail-link").style.display = "none"
  }

  if (newsItem.image) {
    document.getElementById("news-detail-image").src = newsItem.image
    document.getElementById("news-detail-image").style.display = "block"
  } else {
    document.getElementById("news-detail-image").style.display = "none"
  }

  goToPage("page-news-detail")
}

function shareNews() {
  if (currentNews && currentNews.link) {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(currentNews.link)}&text=${encodeURIComponent(currentNews.title)}`,
      )
    } else {
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(currentNews.link)}&text=${encodeURIComponent(currentNews.title)}`,
        "_blank",
      )
    }
  }
}

function filterNewsByCategory(category) {
  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.remove("active")
  })

  const clickedButton = document.querySelector(`.category-btn[data-category="${category}"]`)
  if (clickedButton) {
    clickedButton.classList.add("active")
  }

  currentCategory = category
  displayFilteredNews()
}

function getCategoryEmoji(category) {
  const emojiMap = {
    all: "Всі",
    kyiv: "📰",
    events: "🎭",
    music: "🎶",
    scholarships: "🎓",
    tech: "💻",
    energy: "⚡",
    beauty: "💄",
    knu: "🎓", // Заменили crypto на knu
  }
  return emojiMap[category] || ""
}

function displayFilteredNews() {
  const newsListEl = document.getElementById("news-list")

  let filteredNews = allNewsCache

  if (currentCategory !== "all") {
    filteredNews = allNewsCache.filter((item) => {
      // Используем поле category, которое добавляется при парсинге
      return item.category === currentCategory
    })
  }

  if (filteredNews.length === 0) {
    newsListEl.innerHTML = '<div class="p-4 text-center text-gray-500">Новини не знайдено для цієї категорії</div>'
    return
  }

  newsListEl.innerHTML = filteredNews
    .map(
      (item) => `
          <div class="p-4 cursor-pointer" onclick='viewNewsDetail(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
              <p class="font-bold leading-tight">${item.title}</p>
              <p class="text-sm text-gray-500 mt-1">"${item.source}" - ${item.timeAgo}</p>
          </div>
      `,
    )
    .join("")
}

async function loadAvailableSchedules() {
  try {
    const response = await fetch(`${API_URL}/api/admin/schedules?token=public`)
    const schedules = await response.json()

    const container = document.getElementById("available-schedules")

    if (schedules.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-500">Розклади ще не додано</p>'
      return
    }

    container.innerHTML = schedules
      .map(
        (schedule) => `
            <div class="bg-white rounded-lg p-4 shadow-sm cursor-pointer hover:shadow-md transition" onclick="selectUserSchedule('${schedule.id}', '${schedule.name}')">
                <p class="font-bold text-lg">${schedule.name}</p>
                <p class="text-sm text-gray-500 mt-1">Натисніть, щоб обрати</p>
            </div>
        `,
      )
      .join("")
  } catch (error) {
    console.error("Error loading schedules:", error)
    document.getElementById("available-schedules").innerHTML =
      '<p class="text-center text-red-500">Помилка завантаження</p>'
  }
}

async function selectUserSchedule(scheduleId, scheduleName) {
  try {
    const response = await fetch(`${API_URL}/api/schedules/user/${telegramUser.id}/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId }),
    })

    if (response.ok) {
      const data = await response.json()
      userSchedule = data.schedule
      currentSchedule = data.schedule
      localStorage.setItem("userSchedule", JSON.stringify(data.schedule))

      document.getElementById("main-schedule-subtitle").textContent = `• ${scheduleName}`
      document.getElementById("main-schedule-subtitle").style.display = "block"
      document.getElementById("schedule-list-title").textContent = scheduleName

      goToPage("page-schedule-list")
    }
  } catch (error) {
    console.error("Error selecting schedule:", error)
    alert("Помилка вибору розкладу")
  }
}

async function loadUserSchedule() {
  try {
    const response = await fetch(`${API_URL}/api/schedules/user/${telegramUser.id}`)
    const data = await response.json()

    if (data) {
      userSchedule = data
      currentSchedule = data
      document.getElementById("schedule-remove-btn").classList.remove("hidden")

      document.getElementById("main-schedule-subtitle").textContent = `• ${data.name}`
      document.getElementById("main-schedule-subtitle").style.display = "block"
    } else {
      document.getElementById("schedule-remove-btn").classList.add("hidden")
      document.getElementById("main-schedule-subtitle").style.display = "none"
    }
  } catch (error) {
    console.error("Error loading user schedule:", error)
  }
}

async function removeUserSchedule() {
  if (!confirm("Ви впевнені, що хочете видалити свій розклад?")) return

  try {
    const response = await fetch(`${API_URL}/api/schedules/user/${telegramUser.id}`, {
      method: "DELETE",
    })

    if (response.ok) {
      userSchedule = null
      currentSchedule = null

      // Полная очистка localStorage
      clearLegacySchedule()

      document.getElementById("schedule-remove-btn").classList.add("hidden")
      document.getElementById("main-schedule-subtitle").style.display = "none"

      // Принудительный переход на страницу выбора расписания
      setTimeout(() => {
        goToPage("page-schedule-search")
      }, 500)
    }
  } catch (error) {
    console.error("Error removing schedule:", error)
    alert("Помилка видалення розкладу")
  }
}

function viewScheduleDay(day) {
  const dayNames = {
    monday: "Понеділок",
    tuesday: "Вівторок",
    wednesday: "Середа",
    thursday: "Четвер",
    friday: "П'ятниця",
  }

  document.getElementById("schedule-detail-day").textContent = dayNames[day]

  if (currentSchedule && currentSchedule.schedule && currentSchedule.schedule[day]) {
    const classes = currentSchedule.schedule[day]
    document.getElementById("schedule-classes").innerHTML = classes
      .map(
        (cls) => `
            <div class="border-l-4 border-blue-500 pl-3">
                <div class="font-bold">${cls.time}</div>
                <div class="text-gray-700">${cls.subject}</div>
                <div class="text-sm text-gray-500">${cls.teacher || ""} ${cls.room ? "• " + cls.room : ""}</div>
            </div>
        `,
      )
      .join("")
  } else {
    document.getElementById("schedule-classes").innerHTML = '<div class="text-gray-500 text-center">Занять немає</div>'
  }

  goToPage("page-schedule-detail")
}

function handleScheduleClick() {
  if (userSchedule) {
    currentSchedule = userSchedule
    document.getElementById("schedule-list-title").textContent = userSchedule.name
    goToPage("page-schedule-list")
  } else {
    // Если нет - переходим к выбору расписания
    goToPage("page-schedule-search")
  }
}

function handleScheduleBottomClick() {
  console.log("[v0] 📅 Клик по нижней части блока расписания")
  console.log("[v0] 📊 userSchedule:", userSchedule)

  if (userSchedule) {
    // Если расписание выбрано - переходим к странице с расписанием (понедельник-пятница)
    console.log("[v0] ✅ Расписание выбрано, переходим к странице расписания")
    currentSchedule = userSchedule
    document.getElementById("schedule-list-title").textContent = userSchedule.name
    goToPage("page-schedule-list")
  } else {
    // Если расписание не выбрано - переходим к списку всех расписаний
    console.log("[v0] ⚠️ Расписание не выбрано, переходим к списку")
    goToPage("page-schedule-search")
  }
}

async function loadEvents() {
  console.log("[v0] 📋 ========== ЗАГРУЗКА СОБЫТИЙ ==========")

  try {
    const response = await fetch(`${API_URL}/api/events?_t=${Date.now()}`)
    const events = await response.json()

    console.log("[v0] ✅ Получено событий:", events.length)

    events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

    const eventsContainer = document.getElementById("events-container")
    if (events.length === 0) {
      console.log("[v0] ⚠️ Нет событий")
      eventsContainer.innerHTML = '<div class="text-center text-gray-500">Подій не знайдено</div>'

      const mainEventsList = document.getElementById("main-events-list")
      if (mainEventsList) {
        mainEventsList.innerHTML = '<p class="text-gray-400">Немає активних івентів</p>'
      }
      return
    }

    const eventsHTML = []
    const mainEventsHTML = []

    for (const event of events) {
      console.log(`[v0] 🔄 Обрабатываем: ${event.title}`)

      const isExpired = new Date(event.expiresAt) < new Date()

      const joinedResponse = await fetch(
        `${API_URL}/api/events/${event.id}/joined?userId=${telegramUser.id}&_t=${Date.now()}`,
      )
      const joinedData = await joinedResponse.json()
      const isJoined = joinedData.joined
      const actualParticipants = joinedData.participants

      console.log(`[v0]   - Участников: ${actualParticipants}`)
      console.log(`[v0]   - Присоединился: ${isJoined}`)
      console.log(`[v0]   - Истекло: ${isExpired}`)

      const shortTitle = event.title.length > 15 ? event.title.substring(0, 12) + "…" : event.title

      // Добавляем только первые 3 активных ивента на главную страницу
      if (!isExpired && mainEventsHTML.length < 3) {
        mainEventsHTML.push(shortTitle)
      }

      eventsHTML.push(`
                <div class="event-card ${isExpired ? "opacity-50" : ""}" id="event-card-${event.id}">
                    <h3 class="font-bold text-lg mb-2">${event.title}</h3>
                    <div class="flex items-center text-sm text-gray-600 mb-2">
                        <i data-lucide="calendar" class="w-4 h-4 mr-1"></i>
                        <span>${event.date}</span>
                        <i data-lucide="clock" class="w-4 h-4 ml-3 mr-1"></i>
                        <span>${event.time}</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-600 mb-3">
                        <i data-lucide="map-pin" class="w-4 h-4 mr-1"></i>
                        <span>${event.location}</span>
                    </div>
                    <p class="text-gray-700 mb-3">${event.description}</p>
                    <div class="flex items-center justify-between text-sm mb-2">
                        <div class="flex items-center text-gray-500">
                            <i data-lucide="users" class="w-4 h-4 mr-1"></i>
                            <span id="event-participants-${event.id}">${actualParticipants} учасників</span>
                        </div>
                        <div class="flex items-center text-gray-500">
                            <i data-lucide="user" class="w-4 h-4 mr-1"></i>
                            <span class="text-xs">@${event.creatorUsername || "Анонім"}</span>
                        </div>
                    </div>
                    <div id="event-buttons-${event.id}">
                        ${
                          !isExpired
                            ? isJoined
                              ? `
                            <div class="flex gap-2">
                                <button class="flex-1 bg-blue-500 text-white font-semibold py-2 rounded-lg" onclick="openEventChat('${event.id}')">Чат</button>
                                <button class="bg-red-500 text-white px-4 py-2 rounded-lg" onclick="leaveEventFromList('${event.id}')">
                                    <i data-lucide="log-out" class="w-5 h-5"></i>
                                </button>
                            </div>
                        `
                              : `
                            <button class="w-full bg-blue-500 text-white font-semibold py-2 rounded-lg" onclick="joinEventFromList('${event.id}')">Приєднатися</button>
                        `
                            : '<div class="text-center text-gray-400 py-2 bg-gray-100 rounded-lg">Подія завершена</div>'
                        }
                    </div>
                </div>
            `)
    }

    eventsContainer.innerHTML = eventsHTML.join("")

    const mainEventsList = document.getElementById("main-events-list")
    if (mainEventsList) {
      if (mainEventsHTML.length > 0) {
        mainEventsList.innerHTML = mainEventsHTML.map((title) => `<strong>• ${title}</strong>`).join(" ")
      } else {
        mainEventsList.innerHTML = '<p class="text-gray-400">Немає активних івентів</p>'
      }
    }

    if (lucide) {
      lucide.createIcons()
    }

    console.log("[v0] ✅ События отображены")
    console.log("[v0] 📋 ========== КОНЕЦ ЗАГРУЗКИ СОБЫТИЙ ==========")
  } catch (error) {
    console.error("[v0] 💥 Ошибка загрузки событий:", error)
    document.getElementById("events-container").innerHTML =
      '<div class="text-center text-red-500">Помилка завантаження подій</div>'
  }
}

async function viewEventDetail(eventId) {
  try {
    const response = await fetch(`${API_URL}/api/events/${eventId}`)
    currentEvent = await response.json()

    const joinedResponse = await fetch(`${API_URL}/api/events/${eventId}/joined?userId=${telegramUser.id}`)
    const joinedData = await joinedResponse.json()

    document.getElementById("event-detail-title").textContent = currentEvent.title
    document.getElementById("event-detail-date").textContent = currentEvent.date
    document.getElementById("event-detail-time").textContent = currentEvent.time
    document.getElementById("event-detail-location").textContent = currentEvent.location
    document.getElementById("event-detail-description").textContent = currentEvent.description
    document.getElementById("event-detail-participants").textContent = joinedData.participants + " учасників"

    updateEventButtons(joinedData.joined)

    goToPage("page-event-detail")
    if (lucide) {
      // Check if lucide is declared before using it
      lucide.createIcons()
    }
  } catch (error) {
    console.error("Error loading event:", error)
  }
}

function updateEventButtons(isJoined) {
  const btnContainer = document.getElementById("event-detail-buttons")
  if (isJoined) {
    btnContainer.innerHTML = `
            <div class="flex gap-2">
                <button class="flex-1 bg-blue-500 text-white font-semibold py-3 rounded-lg" onclick="goToPage('page-event-chat')">Чат</button>
                <button class="bg-red-500 text-white px-4 py-3 rounded-lg" onclick="leaveEvent()">
                    <i data-lucide="log-out" class="w-5 h-5"></i>
                </button>
            </div>
        `
  } else {
    btnContainer.innerHTML = `
            <button class="w-full bg-blue-500 text-white font-semibold py-3 rounded-lg" onclick="joinEvent()">Приєднатися</button>
        `
  }
  if (lucide) {
    // Check if lucide is declared before using it
    lucide.createIcons()
  }
}

async function joinEvent() {
  if (!currentEvent) return

  try {
    const response = await fetch(`${API_URL}/api/events/${currentEvent.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
        firstName: telegramUser.first_name,
        photoUrl: telegramUser.photo_url,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      document.getElementById("event-detail-participants").textContent = data.participants + " учасників"
      updateEventButtons(true)
      document.getElementById("event-chat-title").textContent = `Чат: ${currentEvent.title}`
    }
  } catch (error) {
    console.error("Error joining event:", error)
    alert("Помилка приєднання до події")
  }
}

async function joinEventFromList(eventId) {
  console.log("[v0] 🎉 ========== ПРИСОЕДИНЕНИЕ К СОБЫТИЮ ==========")
  console.log("[v0] 📋 Event ID:", eventId)
  console.log("[v0] 👤 User ID:", telegramUser.id)

  try {
    const response = await fetch(`${API_URL}/api/events/${eventId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
        firstName: telegramUser.first_name,
        photoUrl: telegramUser.photo_url,
      }),
    })

    const data = await response.json()
    console.log("[v0] 📊 Ответ сервера:", data)

    if (response.ok) {
      console.log("[v0] ✅ Успешно присоединились!")
      console.log("[v0] 📊 Участников:", data.participants)

      // Обновляем UI
      const participantsEl = document.getElementById(`event-participants-${eventId}`)
      const buttonsEl = document.getElementById(`event-buttons-${eventId}`)

      if (participantsEl) {
        participantsEl.textContent = data.participants + " учасників"
        console.log("[v0] ✅ Обновлено количество участников")
      }

      if (buttonsEl) {
        buttonsEl.innerHTML = `
                    <div class="flex gap-2">
                        <button class="flex-1 bg-blue-500 text-white font-semibold py-2 rounded-lg" onclick="openEventChat('${eventId}')">Чат</button>
                        <button class="bg-red-500 text-white px-4 py-2 rounded-lg" onclick="leaveEventFromList('${eventId}')">
                            <i data-lucide="log-out" class="w-5 h-5"></i>
                        </button>
                    </div>
                `
        if (lucide) {
          lucide.createIcons()
        }
        console.log("[v0] ✅ Обновлены кнопки")
      }

      console.log("[v0] 🎉 ========== КОНЕЦ ПРИСОЕДИНЕНИЯ ==========")
    } else {
      console.error("[v0] ❌ Ошибка сервера:", data.error)
      alert(data.error || "Помилка приєднання")
    }
  } catch (error) {
    console.error("[v0] 💥 Критическая ошибка:", error)
    alert("Помилка приєднання до події")
  }
}

async function leaveEventFromList(eventId) {
  console.log("[v0] 🚪 Выходим из события:", eventId)

  if (!confirm("Ви впевнені, що хочете вийти з цього івенту?")) {
    console.log("[v0] ❌ Выход отменен пользователем")
    return
  }

  try {
    const response = await fetch(`${API_URL}/api/events/${eventId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
      }),
    })

    const data = await response.json()
    console.log("[v0] 📊 Ответ сервера:", data)

    if (response.ok) {
      console.log("[v0] ✅ Успешно вышли из события")

      const participantsEl = document.getElementById(`event-participants-${eventId}`)
      const buttonsEl = document.getElementById(`event-buttons-${eventId}`)

      if (participantsEl) {
        participantsEl.textContent = data.participants + " учасників"
      }

      if (buttonsEl) {
        buttonsEl.innerHTML = `
                    <button class="w-full bg-blue-500 text-white font-semibold py-2 rounded-lg" onclick="joinEventFromList('${eventId}')">Приєднатися</button>
                `
      }
    }
  } catch (error) {
    console.error("[v0] 💥 Ошибка выхода:", error)
    alert("Помилка виходу з події")
  }
}

async function openEventChat(eventId) {
  console.log("[v0] 💬 ========== ОТКРЫТИЕ ЧАТА ==========")
  console.log("[v0] 📋 Event ID:", eventId)

  try {
    // Загружаем данные события
    const response = await fetch(`${API_URL}/api/events/${eventId}`)
    currentEvent = await response.json()

    console.log("[v0] ✅ Событие загружено:", currentEvent.title)

    // Устанавливаем название чата
    document.getElementById("event-chat-title").textContent = `Чат: ${currentEvent.title}`
    console.log("[v0] ✅ Название чата установлено")

    // Переходим на страницу чата
    goToPage("page-event-chat")

    // Загружаем сообщения
    await loadChatMessages()

    if (chatUpdateInterval) {
      clearInterval(chatUpdateInterval)
    }
    chatUpdateInterval = setInterval(async () => {
      await loadChatMessages(true) // true = тихое обновление без скролла
      await updateTypingIndicator()
    }, 1000) // Изменено с 2000 на 1000 мс

    console.log("[v0] 💬 ========== ЧАТ ОТКРЫТ ==========")
  } catch (error) {
    console.error("[v0] 💥 Ошибка открытия чата:", error)
    alert("Помилка відкриття чату")
  }
}

async function leaveEvent() {
  if (!currentEvent) return

  if (!confirm("Ви впевнені, що хочете вийти з цього івенту?")) return

  try {
    const response = await fetch(`${API_URL}/api/events/${currentEvent.id}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      document.getElementById("event-detail-participants").textContent = data.participants + " учасників"
      updateEventButtons(false)
    }
  } catch (error) {
    console.error("Error leaving event:", error)
    alert("Помилка виходу з події")
  }
}

async function createNewEvent(event) {
  const button = event.target
  const eventData = {
    title: document.getElementById("event-name").value,
    date: document.getElementById("event-date").value,
    time: document.getElementById("event-time").value,
    location: document.getElementById("event-location").value,
    description: document.getElementById("event-description").value,
    duration: Number.parseInt(document.getElementById("event-duration").value) || 24,
    creatorUsername: telegramUser.username || telegramUser.first_name || "Анонім",
  }

  if (!eventData.title || !eventData.date || !eventData.time || !eventData.location) {
    alert("Будь ласка, заповніть всі обов'язкові поля")
    return
  }

  button.classList.add("onclic")
  button.disabled = true

  try {
    const response = await fetch(`${API_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData),
    })

    const data = await response.json()

    if (response.ok) {
      button.classList.remove("onclic")
      button.classList.add("validate")

      showModerationNotification("Івент відправлено на модерацію!")

      setTimeout(() => {
        button.classList.remove("validate")
        button.disabled = false
        goToPage("page-events-list")
      }, 2000)
    } else {
      button.classList.remove("onclic", "validate")
      button.disabled = false
      alert(data.error || data.message || "Помилка створення події. Спробуйте ще раз.")
    }
  } catch (error) {
    button.classList.remove("onclic", "validate")
    button.disabled = false
    console.error("Error creating event:", error)
    alert("Помилка з'єднання. Перевірте інтернет та спробуйте ще раз.")
  }
}

async function loadChatMessages(silent = false) {
  if (!currentEvent) {
    console.error("[v0] ❌ currentEvent не установлен!")
    return
  }

  if (!silent) {
    console.log("[v0] 💬 Загружаем сообщения для события:", currentEvent.title)
  }

  try {
    const response = await fetch(`${API_URL}/api/events/${currentEvent.id}/messages`)
    const messages = await response.json()

    if (!silent) {
      console.log("[v0] 📨 Получено сообщений:", messages.length)
    }

    const chatMessages = document.getElementById("chat-messages")

    if (silent && messages.length > 0) {
      const existingMessages = chatMessages.querySelectorAll("[data-message-id]")
      const existingIds = Array.from(existingMessages).map((el) => el.getAttribute("data-message-id"))

      // Добавляем только новые сообщения
      const newMessages = messages.filter((msg) => {
        const msgId = `${msg.userId}-${msg.timestamp}`
        return !existingIds.includes(msgId)
      })

      if (newMessages.length > 0) {
        const wasAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 50

        newMessages.forEach((msg) => {
          const isOwn = msg.userId === telegramUser.id
          const avatar =
            msg.photoUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.firstName || "U")}&background=random`
          const msgId = `${msg.userId}-${msg.timestamp}`

          const messageDiv = document.createElement("div")
          messageDiv.className = `flex ${isOwn ? "justify-end" : "justify-start"} mb-3 chat-message-new`
          messageDiv.setAttribute("data-message-id", msgId)
          messageDiv.innerHTML = `
            ${!isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full mr-2 cursor-pointer" alt="${msg.firstName}" onclick="showUserProfile('${msg.userId}', '${currentEvent.id}')">` : ""}
            <div class="${isOwn ? "chat-message own" : "chat-message"}">
              ${!isOwn ? `<div class="text-xs font-semibold mb-1">${msg.firstName}</div>` : ""}
              <div>${msg.text}</div>
            </div>
            ${isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full ml-2 cursor-pointer" alt="${msg.firstName}" onclick="showUserProfile('${msg.userId}', '${currentEvent.id}')">` : ""}
          `

          chatMessages.appendChild(messageDiv)
        })

        if (wasAtBottom) {
          chatMessages.scrollTop = chatMessages.scrollHeight
        }
      }
    } else {
      chatMessages.innerHTML = messages
        .map((msg) => {
          const isOwn = msg.userId === telegramUser.id
          const avatar =
            msg.photoUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.firstName || "U")}&background=random`
          const msgId = `${msg.userId}-${msg.timestamp}`

          return `
            <div class="flex ${isOwn ? "justify-end" : "justify-start"} mb-3" data-message-id="${msgId}">
              ${!isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full mr-2 cursor-pointer" alt="${msg.firstName}" onclick="showUserProfile('${msg.userId}', '${currentEvent.id}')">` : ""}
              <div class="${isOwn ? "chat-message own" : "chat-message"}">
                ${!isOwn ? `<div class="text-xs font-semibold mb-1">${msg.firstName}</div>` : ""}
                <div>${msg.text}</div>
              </div>
              ${isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full ml-2 cursor-pointer" alt="${msg.firstName}" onclick="showUserProfile('${msg.userId}', '${currentEvent.id}')">` : ""}
            </div>
          `
        })
        .join("")

      if (messages.length === 0) {
        chatMessages.innerHTML =
          '<div class="text-center text-gray-500">Чат порожній. Будьте першим, хто напише повідомлення!</div>'
      }

      chatMessages.scrollTop = chatMessages.scrollHeight
    }

    if (!silent) {
      console.log("[v0] ✅ Сообщения отображены")
    }
  } catch (error) {
    console.error("[v0] 💥 Ошибка загрузки сообщений:", error)
  }
}

async function updateTypingIndicator() {
  if (!currentEvent) return

  try {
    const response = await fetch(`${API_URL}/api/events/${currentEvent.id}/typing?userId=${telegramUser.id}`)
    const typingUsers = await response.json()

    console.log("[v0] 👀 Печатающие пользователи:", typingUsers)

    const indicator = document.getElementById("typing-indicator")
    if (typingUsers.length > 0) {
      const names = typingUsers.slice(0, 2).join(", ")
      const text = typingUsers.length === 1 ? `${names} друкує...` : `${names} друкують...`
      indicator.textContent = text
      indicator.classList.remove("hidden")
      console.log("[v0] ✅ Показываем индикатор:", text)
    } else {
      indicator.classList.add("hidden")
      console.log("[v0] ⚠️ Скрываем индикатор - никто не печатает")
    }
  } catch (error) {
    console.error("[v0] ❌ Ошибка обновления индикатора печати:", error)
  }
}

function handleTyping() {
  if (!currentEvent) {
    console.log("[v0] ⚠️ handleTyping: currentEvent не установлен")
    return
  }

  console.log("[v0] ⌨️ Пользователь печатает...")

  // Отправляем индикатор "печатает"
  fetch(`${API_URL}/api/events/${currentEvent.id}/typing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: telegramUser.id,
      firstName: telegramUser.first_name,
      isTyping: true,
    }),
  })
    .then(() => console.log("[v0] ✅ Индикатор печати отправлен"))
    .catch((error) => console.error("[v0] ❌ Ошибка отправки индикатора печати:", error))

  // Сбрасываем таймер
  if (typingTimeout) {
    clearTimeout(typingTimeout)
  }

  // Через 3 секунды убираем индикатор
  typingTimeout = setTimeout(() => {
    console.log("[v0] ⏰ Таймаут печати - убираем индикатор")
    fetch(`${API_URL}/api/events/${currentEvent.id}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
        firstName: telegramUser.first_name,
        isTyping: false,
      }),
    })
      .then(() => console.log("[v0] ✅ Индикатор печати сброшен"))
      .catch((error) => console.error("[v0] ❌ Ошибка сброса индикатора печати:", error))
  }, 3000)
}

async function showUserProfile(userId, eventId) {
  try {
    const response = await fetch(`${API_URL}/api/events/${eventId}/participants/${userId}`)
    const participant = await response.json()

    const modal = document.getElementById("user-profile-modal")
    const avatar =
      participant.photoUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(participant.firstName || "U")}&background=random&size=128`

    document.getElementById("profile-avatar").src = avatar
    document.getElementById("profile-name").textContent = participant.firstName || "Користувач"
    document.getElementById("profile-joined").textContent =
      `Приєднався: ${new Date(participant.joinedAt).toLocaleDateString("uk-UA")}`

    modal.classList.add("active")
    document.body.style.overflow = "hidden"
  } catch (error) {
    console.error("[v0] Ошибка загрузки профиля:", error)
    alert("Помилка завантаження профілю")
  }
}

function closeUserProfile(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains("user-profile-close")) {
    return
  }

  const modal = document.getElementById("user-profile-modal")
  modal.classList.remove("active")
  document.body.style.overflow = ""
}

async function sendMessage() {
  console.log("[v0] 📤 Отправляем сообщение...")

  const input = document.getElementById("chat-input")
  const message = input.value.trim()

  if (!message || !currentEvent) {
    console.log("[v0] ⚠️ Сообщение пустое или событие не выбрано")
    return
  }

  console.log("[v0] 📝 Текст сообщения:", message)
  console.log("[v0] 🎉 Событие:", currentEvent.title)

  if (typingTimeout) {
    clearTimeout(typingTimeout)
  }
  fetch(`${API_URL}/api/events/${currentEvent.id}/typing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: telegramUser.id,
      firstName: telegramUser.first_name,
      isTyping: false,
    }),
  }).catch(() => {})

  try {
    const response = await fetch(`${API_URL}/api/events/${currentEvent.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        userId: telegramUser.id,
        firstName: telegramUser.first_name,
        photoUrl: telegramUser.photo_url,
      }),
    })

    console.log("[v0] 📊 Статус ответа:", response.status)

    if (response.ok) {
      console.log("[v0] ✅ Сообщение отправлено успешно")
      input.value = ""

      // Сразу перезагружаем сообщения
      await loadChatMessages()
      console.log("[v0] 🔄 Чат обновлен")
    } else if (response.status === 403) {
      const error = await response.json()
      console.error("[v0] ❌ Доступ запрещен:", error.error)
      alert(error.error || "У вас немає дозволу писати повідомлення")
    } else {
      console.error("[v0] ❌ Ошибка сервера:", response.status)
      alert("Помилка відправки повідомлення")
    }
  } catch (error) {
    console.error("[v0] 💥 Ошибка отправки сообщения:", error)
    alert("Помилка з'єднання")
  }
}

async function uploadVideo(event) {
  console.log("[v0] 🎬 НАЧАЛО ЗАГРУЗКИ ВИДЕО - Функция uploadVideo вызвана")
  console.log("[v0] 📋 Event объект:", event)

  const input = event.currentTarget
  console.log("[v0] 📥 Input элемент:", input)
  console.log("[v0] 📁 Количество выбранных файлов:", input.files.length)

  const file = input.files[0]
  const button = input.parentElement

  if (!file) {
    console.error("[v0] ❌ ОШИБКА: Файл не выбран!")
    console.log("[v0] 📊 Состояние input.files:", input.files)
    return
  }

  console.log("[v0] ✅ Файл выбран успешно")
  console.log("[v0] 📄 Имя файла:", file.name)
  console.log("[v0] 📦 Размер файла:", (file.size / 1024 / 1024).toFixed(2), "MB")
  console.log("[v0] 🎞️ Тип файла:", file.type)
  console.log("[v0] 🔄 Начинаем анимацию кнопки (onclic)")

  button.classList.add("onclic")

  let thumbnail = null
  try {
    console.log("[v0] 🖼️ Начинаем генерацию превью видео...")
    const thumbnailStart = Date.now()
    thumbnail = await generateVideoThumbnail(file)
    const thumbnailTime = Date.now() - thumbnailStart

    console.log("[v0] ✅ Превью сгенерировано успешно за", thumbnailTime, "мс")
    console.log("[v0] 🖼️ Размер превью:", thumbnail ? (thumbnail.size / 1024).toFixed(2) + " KB" : "неизвестно")
  } catch (thumbnailError) {
    console.warn("[v0] ⚠️ НЕ УДАЛОСЬ СОЗДАТЬ ПРЕВЬЮ, но продолжаем загрузку видео")
    console.warn("[v0] 📛 Ошибка превью:", thumbnailError.message)
    console.warn("[v0] 📋 Stack:", thumbnailError.stack)
    console.log("[v0] ✅ Видео будет загружено БЕЗ превью")
    thumbnail = null
  }

  try {
    console.log("[v0] 📦 Создаем FormData для отправки...")
    const formData = new FormData()
    formData.append("video", file)

    if (thumbnail) {
      formData.append("thumbnail", thumbnail)
      console.log("[v0] 📋 FormData создан с превью:")
      console.log("[v0]   - video:", file.name, file.size, "bytes")
      console.log("[v0]   - thumbnail:", thumbnail.size, "bytes")
    } else {
      console.log("[v0] 📋 FormData создан БЕЗ превью:")
      console.log("[v0]   - video:", file.name, file.size, "bytes")
      console.log("[v0]   - thumbnail: отсутствует (будет создано на сервере)")
    }

    console.log("[v0] 🌐 Отправляем запрос на сервер...")
    console.log("[v0] 🔗 URL:", `${API_URL}/api/videos/upload`)
    console.log("[v0] ⏰ Время начала запроса:", new Date().toLocaleTimeString())

    const uploadStart = Date.now()
    const response = await fetch(`${API_URL}/api/videos/upload`, {
      method: "POST",
      body: formData,
    })
    const uploadTime = Date.now() - uploadStart

    console.log("[v0] 📨 Ответ получен за", uploadTime, "мс")
    console.log("[v0] 📊 HTTP статус:", response.status, response.statusText)
    console.log("[v0] 📋 Headers ответа:", Object.fromEntries(response.headers.entries()))

    const result = await response.json()
    console.log("[v0] 📄 Тело ответа (JSON):", result)

    if (response.ok) {
      console.log("[v0] ✅ УСПЕХ! Видео загружено успешно")
      console.log("[v0] 🎉 ID видео:", result.video?.id)
      console.log("[v0] 📝 Статус модерации:", result.video?.status)

      button.classList.remove("onclic")
      button.classList.add("validate")
      console.log("[v0] ✔️ Анимация кнопки изменена на validate")

      showModerationNotification("Ваше відео відправлено на модерацію!")
      console.log("[v0] 💬 Уведомление о модерации показано")

      setTimeout(() => {
        button.classList.remove("validate")
        console.log("[v0] 🔄 Анимация кнопки сброшена")
      }, 2000)

      input.value = ""
      console.log("[v0] 🧹 Input очищен")
    } else {
      console.error("[v0] ❌ ОШИБКА СЕРВЕРА!")
      console.error("[v0] 📛 Код ошибки:", response.status)
      console.error("[v0] 📄 Сообщение ошибки:", result.error || result.message)
      console.error("[v0] 📋 Полный ответ:", result)

      button.classList.remove("onclic", "validate")
      alert(result.error || result.message || "Помилка завантаження відео")
    }
  } catch (error) {
    console.error("[v0] 💥 КРИТИЧЕСКАЯ ОШИБКА при отправке на сервер!")
    console.error("[v0] 📛 Тип ошибки:", error.name)
    console.error("[v0] 📄 Сообщение:", error.message)
    console.error("[v0] 📚 Stack trace:", error.stack)

    button.classList.remove("onclic", "validate")
    alert("Помилка завантаження відео")
  }

  console.log("[v0] 🏁 КОНЕЦ ФУНКЦИИ uploadVideo")
}

function generateVideoThumbnail(videoFile) {
  console.log("[v0] 🎬 Начинаем генерацию превью для видео:", videoFile.name)

  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    console.log("[v0] 🎥 Создали video элемент")
    console.log("[v0] 🖼️ Создали canvas элемент")

    let loadedDataFired = false
    let seekedFired = false

    video.addEventListener("loadeddata", () => {
      loadedDataFired = true
      console.log("[v0] ✅ Событие loadeddata сработало")
      console.log("[v0] 📊 Размеры видео:", video.videoWidth, "x", video.videoHeight)
      console.log("[v0] ⏱️ Длительность видео:", video.duration, "секунд")
      console.log("[v0] ⏩ Устанавливаем currentTime на 0.5 секунды")
      video.currentTime = 0.5
    })

    video.addEventListener("seeked", () => {
      seekedFired = true
      console.log("[v0] ✅ Событие seeked сработало")
      console.log("[v0] ⏰ Текущее время видео:", video.currentTime)

      const size = Math.min(video.videoWidth, video.videoHeight)
      const x = (video.videoWidth - size) / 2
      const y = (video.videoHeight - size) / 2

      console.log("[v0] 📐 Вычисленные параметры кадрирования:")
      console.log("[v0]   - Размер квадрата:", size)
      console.log("[v0]   - Смещение X:", x)
      console.log("[v0]   - Смещение Y:", y)

      canvas.width = size
      canvas.height = size
      console.log("[v0] 🖼️ Canvas размер установлен:", size, "x", size)

      try {
        ctx.drawImage(video, x, y, size, size, 0, 0, size, size)
        console.log("[v0] ✅ Кадр отрисован на canvas")
      } catch (drawError) {
        console.error("[v0] ❌ Ошибка при отрисовке на canvas:", drawError)
        reject(drawError)
        return
      }

      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.log("[v0] ✅ Blob создан успешно")
            console.log("[v0] 📦 Размер blob:", (blob.size / 1024).toFixed(2), "KB")
            console.log("[v0] 🎞️ Тип blob:", blob.type)
            resolve(blob)
          } else {
            console.error("[v0] ❌ Не удалось создать blob из canvas")
            reject(new Error("Не удалось создать превью"))
          }
        },
        "image/jpeg",
        0.8,
      )
    })

    video.addEventListener("error", (e) => {
      console.error("[v0] ❌ ОШИБКА при загрузке видео в элемент video")
      console.error("[v0] 📛 Код ошибки:", video.error?.code)
      console.error("[v0] 📄 Сообщение:", video.error?.message)
      console.error("[v0] 📋 Event:", e)
      reject(new Error("Ошибка загрузки видео: " + (video.error?.message || "неизвестная ошибка")))
    })

    // Таймаут на случай если события не сработают
    setTimeout(() => {
      if (!loadedDataFired) {
        console.error("[v0] ⏰ ТАЙМАУТ: Событие loadeddata не сработало за 10 секунд")
        reject(new Error("Таймаут загрузки видео"))
      } else if (!seekedFired) {
        console.error("[v0] ⏰ ТАЙМАУТ: Событие seeked не сработало за 10 секунд")
        reject(new Error("Таймаут перемотки видео"))
      }
    }, 10000)

    console.log("[v0] 🔗 Создаем URL для видео файла...")
    try {
      video.src = URL.createObjectURL(videoFile)
      console.log("[v0] ✅ URL создан:", video.src)
    } catch (urlError) {
      console.error("[v0] ❌ Ошибка создания URL:", urlError)
      reject(urlError)
    }
  })
}

function openTikTok(event) {
  if (event && event.stopPropagation) {
    event.stopPropagation()
  }
  const tiktokUrl = "https://www.tiktok.com/@uhub_ua?_t=ZM-90ZcsYFEWWC&_r=1"
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.openLink(tiktokUrl)
  } else {
    window.open(tiktokUrl, "_blank")
  }
}

let allPhotos = []
let allEventsForPhotos = []

function previewPhoto() {
  const input = document.getElementById("photo-file-input")
  const file = input.files[0]

  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const preview = document.getElementById("photo-preview")
      const img = document.getElementById("photo-preview-img")
      img.src = e.target.result
      preview.classList.remove("hidden")
      document.getElementById("photo-file-label").textContent = file.name
    }
    reader.readAsDataURL(file)
  }
}

async function uploadEventPhoto(event) {
  console.log("[v0] 📸 ========== НАЧАЛО ЗАГРУЗКИ ФОТО В СОБЫТИЕ ==========")

  const eventId = document.getElementById("upload-event-select").value
  const description = document.getElementById("upload-photo-description").value
  const fileInput = document.getElementById("photo-file-input")
  const file = fileInput.files[0]
  const button = event.currentTarget

  console.log("[v0] 📋 Данные формы:")
  console.log("[v0]   - Event ID:", eventId)
  console.log("[v0]   - Description:", description)
  console.log("[v0]   - File:", file ? file.name : "не выбран")

  if (!eventId) {
    console.error("[v0] ❌ Событие не выбрано!")
    alert("Будь ласка, оберіть івент")
    return
  }

  if (!file) {
    console.error("[v0] ❌ Файл не выбран!")
    alert("Будь ласка, оберіть фото")
    return
  }

  console.log("[v0] ✅ Файл выбран:")
  console.log("[v0]   - Имя:", file.name)
  console.log("[v0]   - Размер:", (file.size / 1024).toFixed(2), "KB")
  console.log("[v0]   - Тип:", file.type)

  button.classList.add("onclic")
  button.disabled = true

  const formData = new FormData()
  formData.append("photo", file)
  formData.append("eventId", eventId)
  formData.append("description", description)
  formData.append("userId", telegramUser.id)
  formData.append("firstName", telegramUser.first_name)

  console.log("[v0] 📦 FormData создан, отправляем на сервер...")

  try {
    const uploadStart = Date.now()
    const response = await fetch(`${API_URL}/api/photos/upload`, {
      method: "POST",
      body: formData,
    })
    const uploadTime = Date.now() - uploadStart

    console.log("[v0] 📨 Ответ получен за", uploadTime, "мс")
    console.log("[v0] 📊 HTTP статус:", response.status)

    const result = await response.json()
    console.log("[v0] 📄 Ответ сервера:", result)

    if (response.ok) {
      console.log("[v0] ✅ УСПЕХ! Фото загружено")

      button.classList.remove("onclic")
      button.classList.add("validate")

      showModerationNotification("Фото відправлено на модерацію!")

      setTimeout(() => {
        button.classList.remove("validate")
        button.disabled = false

        document.getElementById("upload-event-select").value = ""
        document.getElementById("upload-photo-description").value = ""
        fileInput.value = ""
        document.getElementById("photo-preview").classList.add("hidden")
        document.getElementById("photo-file-label").textContent = "📷 Обрати фото"

        goToPage("page-event-photos")
      }, 2000)
    } else {
      console.error("[v0] ❌ ОШИБКА СЕРВЕРА:", result.error || result.message)
      button.classList.remove("onclic", "validate")
      button.disabled = false
      alert(result.message || result.error || "Помилка завантаження фото")
    }

    console.log("[v0] 📸 ========== КОНЕЦ ЗАГРУЗКИ ФОТО ==========")
  } catch (error) {
    console.error("[v0] 💥 КРИТИЧЕСКАЯ ОШИБКА:", error)
    console.error("[v0] 📚 Stack:", error.stack)

    button.classList.remove("onclic", "validate")
    button.disabled = false
    alert("Помилка завантаження фото")
  }
}

async function loadEventPhotos() {
  try {
    const [photosRes, eventsRes] = await Promise.all([fetch(`${API_URL}/api/photos`), fetch(`${API_URL}/api/events`)])

    allPhotos = await photosRes.json()
    allEventsForPhotos = await eventsRes.json()

    const filter = document.getElementById("photo-event-filter")
    if (filter) {
      filter.innerHTML =
        '<option value="">Всі івенти</option>' +
        allEventsForPhotos.map((event) => `<option value="${event.id}">${event.title}</option>`).join("")
    }

    displayPhotos(allPhotos)
  } catch (error) {
    console.error("Error loading photos:", error)
    document.getElementById("photos-gallery").innerHTML =
      '<div class="col-span-2 text-center text-red-500">Помилка завантаження фото</div>'
  }
}

function filterPhotosByEvent() {
  const selectedEventId = document.getElementById("photo-event-filter").value

  if (selectedEventId) {
    const filtered = allPhotos.filter((p) => p.eventId === selectedEventId)
    displayPhotos(filtered)
  } else {
    displayPhotos(allPhotos)
  }
}

function displayPhotos(photos) {
  const gallery = document.getElementById("photos-gallery")

  if (photos.length === 0) {
    gallery.innerHTML = '<div class="col-span-2 text-center text-gray-500">Фото не знайдено</div>'
    return
  }

  gallery.innerHTML = photos
    .map((photo) => {
      const event = allEventsForPhotos.find((e) => e.id === photo.eventId)
      const eventName = event ? event.title : "Подія видалена"

      return `
      <div class="bg-white rounded-lg overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition" onclick='openPhotoModal(${JSON.stringify(photo).replace(/'/g, "&apos;")})'>
        <img src="${API_URL}${photo.url}" class="w-full h-40 object-cover" alt="${photo.description || eventName}">
        <div class="p-2">
          <p class="text-xs font-semibold text-gray-700">${eventName}</p>
          ${photo.description ? `<p class="text-xs text-gray-500 mt-1">${photo.description}</p>` : ""}
        </div>
      </div>
    `
    })
    .join("")
}

function openPhotoModal(photo) {
  const modal = document.getElementById("photo-modal")
  const event = allEventsForPhotos.find((e) => e.id === photo.eventId)
  const eventName = event ? event.title : "Подія видалена"

  document.getElementById("modal-photo-img").src = `${API_URL}${photo.url}`
  document.getElementById("modal-photo-event").textContent = eventName
  document.getElementById("modal-photo-description").textContent = photo.description || ""
  document.getElementById("modal-photo-author").textContent = photo.firstName ? `Автор: ${photo.firstName}` : ""

  modal.classList.add("active")
  document.body.style.overflow = "hidden"
}

function closePhotoModal(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains("photo-modal-close")) {
    return
  }

  const modal = document.getElementById("photo-modal")
  modal.classList.remove("active")
  document.body.style.overflow = ""
}

async function loadUploadPhotoEvents() {
  try {
    const response = await fetch(`${API_URL}/api/events`)
    const events = await response.json()

    const select = document.getElementById("upload-event-select")
    if (select) {
      select.innerHTML =
        '<option value="">Оберіть івент</option>' +
        events.map((event) => `<option value="${event.id}">${event.title}</option>`).join("")
    }
  } catch (error) {
    console.error("Error loading events for upload:", error)
  }
}

async function loadUhubChatMessages(silent = false) {
  if (!silent) {
    console.log("[v0] 💬 Загружаем сообщения общего чата U-hub")
  }

  try {
    const response = await fetch(`${API_URL}/api/uhub-chat/messages`)
    const messages = await response.json()

    if (!silent) {
      console.log("[v0] 📨 Получено сообщений:", messages.length)
    }

    const chatMessages = document.getElementById("uhub-chat-messages")

    if (silent && messages.length > 0) {
      const existingMessages = chatMessages.querySelectorAll("[data-message-id]")
      const existingIds = Array.from(existingMessages).map((el) => el.getAttribute("data-message-id"))

      const newMessages = messages.filter((msg) => {
        const msgId = `${msg.userId}-${msg.timestamp}`
        return !existingIds.includes(msgId)
      })

      if (newMessages.length > 0) {
        const wasAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 50

        newMessages.forEach((msg) => {
          const isOwn = msg.userId === telegramUser.id
          const avatar =
            msg.photoUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.firstName || "U")}&background=random`
          const msgId = `${msg.userId}-${msg.timestamp}`

          const messageDiv = document.createElement("div")
          messageDiv.className = `flex ${isOwn ? "justify-end" : "justify-start"} mb-3 chat-message-new`
          messageDiv.setAttribute("data-message-id", msgId)
          messageDiv.innerHTML = `
            ${!isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full mr-2 cursor-pointer" alt="${msg.firstName}">` : ""}
            <div class="${isOwn ? "chat-message own" : "chat-message"}">
              ${!isOwn ? `<div class="text-xs font-semibold mb-1">${msg.firstName}</div>` : ""}
              <div>${msg.text}</div>
            </div>
            ${isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full ml-2 cursor-pointer" alt="${msg.firstName}">` : ""}
          `

          chatMessages.appendChild(messageDiv)
        })

        if (wasAtBottom) {
          chatMessages.scrollTop = chatMessages.scrollHeight
        }
      }
    } else {
      chatMessages.innerHTML = messages
        .map((msg) => {
          const isOwn = msg.userId === telegramUser.id
          const avatar =
            msg.photoUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.firstName || "U")}&background=random`
          const msgId = `${msg.userId}-${msg.timestamp}`

          return `
            <div class="flex ${isOwn ? "justify-end" : "justify-start"} mb-3" data-message-id="${msgId}">
              ${!isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full mr-2 cursor-pointer" alt="${msg.firstName}">` : ""}
              <div class="${isOwn ? "chat-message own" : "chat-message"}">
                ${!isOwn ? `<div class="text-xs font-semibold mb-1">${msg.firstName}</div>` : ""}
                <div>${msg.text}</div>
              </div>
              ${isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full ml-2 cursor-pointer" alt="${msg.firstName}">` : ""}
            </div>
          `
        })
        .join("")

      if (messages.length === 0) {
        chatMessages.innerHTML =
          '<div class="text-center text-gray-500">Чат порожній. Будьте першим, хто напише повідомлення!</div>'
      }

      chatMessages.scrollTop = chatMessages.scrollHeight
    }

    // Запускаем автообновление чата
    if (!uhubChatUpdateInterval) {
      uhubChatUpdateInterval = setInterval(async () => {
        await loadUhubChatMessages(true)
        await updateUhubTypingIndicator()
      }, 1000)
    }

    if (!silent) {
      console.log("[v0] ✅ Сообщения общего чата отображены")
    }
  } catch (error) {
    console.error("[v0] 💥 Ошибка загрузки сообщений общего чата:", error)
  }
}

async function sendUhubMessage() {
  console.log("[v0] 📤 Отправляем сообщение в общий чат...")

  const input = document.getElementById("uhub-chat-input")
  const message = input.value.trim()

  if (!message) {
    console.log("[v0] ⚠️ Сообщение пустое")
    return
  }

  console.log("[v0] 📝 Текст сообщения:", message)

  if (uhubTypingTimeout) {
    clearTimeout(uhubTypingTimeout)
  }
  fetch(`${API_URL}/api/uhub-chat/typing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: telegramUser.id,
      firstName: telegramUser.first_name,
      isTyping: false,
    }),
  }).catch(() => {})

  try {
    const response = await fetch(`${API_URL}/api/uhub-chat/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        userId: telegramUser.id,
        firstName: telegramUser.first_name,
        photoUrl: telegramUser.photo_url,
      }),
    })

    console.log("[v0] 📊 Статус ответа:", response.status)

    if (response.ok) {
      console.log("[v0] ✅ Сообщение отправлено успешно")
      input.value = ""

      await loadUhubChatMessages()
      console.log("[v0] 🔄 Чат обновлен")
    } else {
      console.error("[v0] ❌ Ошибка сервера:", response.status)
      alert("Помилка відправки повідомлення")
    }
  } catch (error) {
    console.error("[v0] 💥 Ошибка отправки сообщения:", error)
    alert("Помилка з'єднання")
  }
}

function handleUhubTyping() {
  console.log("[v0] ⌨️ Пользователь печатает в общем чате...")

  fetch(`${API_URL}/api/uhub-chat/typing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: telegramUser.id,
      firstName: telegramUser.first_name,
      isTyping: true,
    }),
  })
    .then(() => console.log("[v0] ✅ Индикатор печати отправлен"))
    .catch((error) => console.error("[v0] ❌ Ошибка отправки индикатора печати:", error))

  if (uhubTypingTimeout) {
    clearTimeout(uhubTypingTimeout)
  }

  uhubTypingTimeout = setTimeout(() => {
    console.log("[v0] ⏰ Таймаут печати - убираем индикатор")
    fetch(`${API_URL}/api/uhub-chat/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
        firstName: telegramUser.first_name,
        isTyping: false,
      }),
    })
      .then(() => console.log("[v0] ✅ Индикатор печати сброшен"))
      .catch((error) => console.error("[v0] ❌ Ошибка сброса индикатора печати:", error))
  }, 3000)
}

async function updateUhubTypingIndicator() {
  try {
    const response = await fetch(`${API_URL}/api/uhub-chat/typing?userId=${telegramUser.id}`)
    const typingUsers = await response.json()

    const indicator = document.getElementById("uhub-typing-indicator")
    if (typingUsers.length > 0) {
      const names = typingUsers.slice(0, 2).join(", ")
      const text = typingUsers.length === 1 ? `${names} друкує...` : `${names} друкують...`
      indicator.textContent = text
      indicator.classList.remove("hidden")
    } else {
      indicator.classList.add("hidden")
    }
  } catch (error) {
    console.error("[v0] ❌ Ошибка обновления индикатора печати:", error)
  }
}

updateTime()
setInterval(updateTime, 1000)

const savedSchedule = localStorage.getItem("userSchedule")
if (savedSchedule) {
  userSchedule = JSON.parse(savedSchedule)
  document.getElementById("main-schedule-subtitle").textContent = `• ${userSchedule.name}`
  document.getElementById("main-schedule-subtitle").style.display = "block"
}

// Очистить старые данные расписания при загрузке
clearLegacySchedule()

console.log("[v0] 🚀 Инициализация приложения...")
loadNews()
loadEvents() // Загружаем события сразу
loadHeroImages()
loadApprovedVideos()
console.log("[v0] ✅ Приложение инициализировано")

if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready()
  window.Telegram.WebApp.expand()
}

if (lucide) {
  // Check if lucide is declared before using it
  lucide.createIcons()
}

function preloadImage(img, src, position) {
  const image = new Image()
  image.onload = () => {
    img.src = src
    if (position) {
      img.style.objectPosition = `${position.x}% ${position.y}%`
    }
    img.classList.add("loaded")
    if (img.parentElement && img.parentElement.classList.contains("image-container")) {
      img.parentElement.classList.add("loaded")
    }
  }
  image.src = src
}

async function loadHeroImages() {
  try {
    const response = await fetch(`${API_URL}/api/settings/images`)
    const data = await response.json()
    const images = data.images || data
    const positions = data.positions || {}

    if (images.news) {
      const newsImg = document.getElementById("main-news-img")
      preloadImage(newsImg, images.news, positions.news)
    }
    if (images.schedule) {
      const scheduleImgs = document.querySelectorAll("#main-schedule-card img")
      scheduleImgs.forEach((img) => {
        preloadImage(img, images.schedule, positions.schedule)
      })
    }
    if (images.video) {
      const videoImg = document.getElementById("main-video-img")
      preloadImage(videoImg, images.video, positions.video)
    }
    if (images.events) {
      const eventImg = document.getElementById("main-event-img")
      preloadImage(eventImg, images.events, positions.events)
    }
  } catch (error) {
    console.error("Error loading hero images:", error)
  }
}

async function loadApprovedVideos() {
  console.log("[v0] 📹 Загружаем одобренные видео для превью...")

  try {
    const response = await fetch(`${API_URL}/api/videos/approved`)
    const videos = await response.json()

    console.log("[v0] ✅ Получено видео:", videos.length)
    console.log("[v0] 📋 Данные видео:", videos)

    const grid = document.getElementById("main-video-grid")
    if (!grid) {
      console.error("[v0] ❌ Элемент main-video-grid не найден!")
      return
    }

    if (videos.length === 0) {
      console.log("[v0] ⚠️ Нет одобренных видео, показываем плейсхолдеры")
      grid.innerHTML = `
                <div class="aspect-square overflow-hidden rounded-md cursor-pointer" onclick="openTikTok(event)">
                    <img src="https://placehold.co/150x150/fecaca/900?text=V" class="w-full h-full object-cover">
                </div>
                <div class="aspect-square overflow-hidden rounded-md cursor-pointer" onclick="openTikTok(event)">
                    <img src="https://placehold.co/150x150/fecaca/900?text=V" class="w-full h-full object-cover">
                </div>
                <div class="aspect-square overflow-hidden rounded-md cursor-pointer" onclick="openTikTok(event)">
                    <img src="https://placehold.co/150x150/fecaca/900?text=V" class="w-full h-full object-cover">
                </div>
            `
      return
    }

    const thumbnails = []
    for (let i = 0; i < 3; i++) {
      if (videos[i] && videos[i].thumbnailPath) {
        const thumbnailUrl = `${API_URL}${videos[i].thumbnailPath}`
        console.log(`[v0] 🖼️ Превью ${i + 1}:`, thumbnailUrl)

        thumbnails.push(`
                    <div class="aspect-square overflow-hidden rounded-md cursor-pointer transition-transform hover:scale-105" onclick="openTikTok(event)">
                        <img src="${thumbnailUrl}" class="w-full h-full object-cover" alt="Video ${i + 1}" onerror="console.error('[v0] ❌ Ошибка загрузки превью:', this.src); this.src='https://placehold.co/150x150/fecaca/900?text=V'">
                    </div>
                `)
      } else {
        console.log(`[v0] ⚠️ Видео ${i + 1}: превью отсутствует`)
        thumbnails.push(`
                    <div class="aspect-square overflow-hidden rounded-md cursor-pointer transition-transform hover:scale-105" onclick="openTikTok(event)">
                        <img src="https://placehold.co/150x150/fecaca/900?text=V" class="w-full h-full object-cover">
                    </div>
                `)
      }
    }

    grid.innerHTML = thumbnails.join("")
    console.log("[v0] ✅ Превью видео обновлены в блоках")
  } catch (error) {
    console.error("[v0] ❌ Ошибка загрузки одобренных видео:", error)
    console.error("[v0] 📋 Stack:", error.stack)
  }
}
