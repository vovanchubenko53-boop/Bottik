const API_URL = window.location.origin
let currentEvent = null
let currentSchedule = null
let currentNews = null
let userSchedule = null
let telegramUser = null
const lucide = window.lucide // Declare the lucide variable

let chatUpdateInterval = null
let typingTimeout = null
const UHUB_CHAT_ID = "uhub-general-chat"

let allNewsCache = []
let currentCategory = "all"

let currentGroupIndex = 0
let totalGroups = 1

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
    all: "",
    kyiv: "📰",
    events: "🎸",
    music: "🎶",
    scholarships: "🎓",
    tech: "🔬",
    energy: "⚡",
    beauty: "💄",
    knu: "🎓",
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

    // Группируем пары по времени
    const groupedByTime = {}
    classes.forEach((cls) => {
      if (!groupedByTime[cls.time]) {
        groupedByTime.time = []
      }
      groupedByTime[cls.time].push(cls)
    })

    // Определяем максимальное количество групп
    totalGroups = Math.max(...Object.values(groupedByTime).map((g) => g.length))
    currentGroupIndex = 0

    const container = document.getElementById("schedule-groups-container")
    const indicator = document.getElementById("schedule-group-indicator")

    if (totalGroups > 1) {
      // Создаем контейнеры для каждой группы
      container.innerHTML = ""

      for (let groupIdx = 0; groupIdx < totalGroups; groupIdx++) {
        const groupDiv = document.createElement("div")
        groupDiv.className = "schedule-group"

        const classesHTML = Object.keys(groupedByTime)
          .map((time) => {
            const group = groupedByTime[time]
            const cls = group[groupIdx] || group[0] // Если группы нет, показываем первую

            return `
            <div class="border-l-4 border-blue-500 pl-3">
                <div class="font-bold">${cls.time}</div>
                <div class="text-gray-700">${cls.subject}</div>
                <div class="text-sm text-gray-500">${cls.teacher || ""} ${cls.room ? "• " + cls.room : ""}</div>
                ${totalGroups > 1 ? `<div class="text-xs text-blue-500 mt-1">Група ${groupIdx + 1}</div>` : ""}
            </div>
          `
          })
          .join("")

        groupDiv.innerHTML = `<div class="space-y-4">${classesHTML}</div>`
        container.appendChild(groupDiv)
      }

      // Создаем индикаторы
      indicator.innerHTML = Array.from(
        { length: totalGroups },
        (_, i) => `<div class="schedule-group-dot ${i === 0 ? "active" : ""}" data-group="${i}"></div>`,
      ).join("")

      // Добавляем обработчик скролла
      container.addEventListener("scroll", handleScheduleScroll)

      // Добавляем клик по индикаторам
      indicator.querySelectorAll(".schedule-group-dot").forEach((dot, idx) => {
        dot.addEventListener("click", () => scrollToGroup(idx))
      })
    } else {
      // Одна группа - показываем как обычно
      container.innerHTML = `
        <div class="schedule-group">
          <div class="space-y-4">
            ${classes
              .map(
                (cls) => `
              <div class="border-l-4 border-blue-500 pl-3">
                  <div class="font-bold">${cls.time}</div>
                  <div class="text-gray-700">${cls.subject}</div>
                  <div class="text-sm text-gray-500">${cls.teacher || ""} ${cls.room ? "• " + cls.room : ""}</div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `
      indicator.innerHTML = ""
    }
  } else {
    document.getElementById("schedule-groups-container").innerHTML =
      '<div class="schedule-group"><div class="text-gray-500 text-center">Занять немає</div></div>'
    document.getElementById("schedule-group-indicator").innerHTML = ""
  }

  goToPage("page-schedule-detail")
}

function handleScheduleScroll() {
  const container = document.getElementById("schedule-groups-container")
  const scrollLeft = container.scrollLeft
  const width = container.offsetWidth
  const newIndex = Math.round(scrollLeft / width)

  if (newIndex !== currentGroupIndex) {
    currentGroupIndex = newIndex
    updateGroupIndicators()
  }
}

function scrollToGroup(index) {
  const container = document.getElementById("schedule-groups-container")
  const width = container.offsetWidth
  container.scrollTo({
    left: width * index,
    behavior: "smooth",
  })
  currentGroupIndex = index
  updateGroupIndicators()
}

function updateGroupIndicators() {
  document.querySelectorAll(".schedule-group-dot").forEach((dot, idx) => {
    if (idx === currentGroupIndex) {
      dot.classList.add("active")
    } else {
      dot.classList.remove("active")
    }
  })
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
          const isOwn = String(msg.userId) === String(telegramUser.id)
          const avatar =
            msg.photoUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.firstName || "U")}&background=random`
          const msgId = `${msg.userId}-${msg.timestamp}`

          const messageDiv = document.createElement("div")
          messageDiv.className = `flex ${isOwn ? "justify-end" : "justify-start"} mb-3 chat-message-new`
          messageDiv.setAttribute("data-message-id", msgId)

          let photosHTML = ""
          if (msg.photos && msg.photos.length > 0) {
            photosHTML = `
              <div class="grid ${msg.photos.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-1 mt-2">
                ${msg.photos
                  .map(
                    (photoUrl) => `
                  <img src="${API_URL}${photoUrl}" class="w-full rounded-lg cursor-pointer" onclick="openPhotoModal('${API_URL}${photoUrl}', '${msg.firstName}', '${currentEvent.title}')" alt="Фото">
                `,
                  )
                  .join("")}
              </div>
            `
          }

          messageDiv.innerHTML = `
            ${!isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full mr-2 cursor-pointer" alt="${msg.firstName}" onclick="showUserProfile('${msg.userId}', '${currentEvent.id}')">` : ""}
            <div class="${isOwn ? "chat-message own" : "chat-message"}">
              ${!isOwn ? `<div class="text-xs font-semibold mb-1">${msg.firstName}</div>` : ""}
              ${msg.text ? `<div>${msg.text}</div>` : ""}
              ${photosHTML}
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
          const isOwn = String(msg.userId) === String(telegramUser.id)
          const avatar =
            msg.photoUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.firstName || "U")}&background=random`
          const msgId = `${msg.userId}-${msg.timestamp}`

          let photosHTML = ""
          if (msg.photos && msg.photos.length > 0) {
            photosHTML = `
              <div class="grid ${msg.photos.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-1 mt-2">
                ${msg.photos
                  .map(
                    (photoUrl) => `
                  <img src="${API_URL}${photoUrl}" class="w-full rounded-lg cursor-pointer" onclick="openPhotoModal('${API_URL}${photoUrl}', '${msg.firstName}', '${currentEvent.title}')" alt="Фото">
                `,
                  )
                  .join("")}
              </div>
            `
          }

          return `
            <div class="flex ${isOwn ? "justify-end" : "justify-start"} mb-3" data-message-id="${msgId}">
              ${!isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full mr-2 cursor-pointer" alt="${msg.firstName}" onclick="showUserProfile('${msg.userId}', '${currentEvent.id}')">` : ""}
              <div class="${isOwn ? "chat-message own" : "chat-message"}">
                ${!isOwn ? `<div class="text-xs font-semibold mb-1">${msg.firstName}</div>` : ""}
                ${msg.text ? `<div>${msg.text}</div>` : ""}
                ${photosHTML}
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

function previewChatPhotos() {
  const input = document.getElementById("chat-photo-input")
  const preview = document.getElementById("chat-photo-preview")
  const files = input.files

  if (files.length > 10) {
    alert("Максимум 10 фото")
    input.value = ""
    return
  }

  if (files.length > 0) {
    preview.classList.remove("hidden")
    preview.innerHTML = ""

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const div = document.createElement("div")
        div.className = "relative"
        div.innerHTML = `
          <img src="${e.target.result}" class="w-full h-16 object-cover rounded-lg">
          <button onclick="removeChatPhoto(${index})" class="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✕</button>
        `
        preview.appendChild(div)
      }
      reader.readAsDataURL(file)
    })
  } else {
    preview.classList.add("hidden")
  }
}

function removeChatPhoto(index) {
  const input = document.getElementById("chat-photo-input")
  const dt = new DataTransfer()
  const files = Array.from(input.files)

  files.splice(index, 1)
  files.forEach((file) => dt.items.add(file))

  input.files = dt.files
  previewChatPhotos()
}

async function sendMessage() {
  console.log("[v0] 📤 Отправляем сообщение...")

  const input = document.getElementById("chat-input")
  const photoInput = document.getElementById("chat-photo-input")
  const message = input.value.trim()
  const photos = photoInput.files

  if (!message && photos.length === 0) {
    console.log("[v0] ⚠️ Сообщение и фото пустые")
    return
  }

  console.log("[v0] 📝 Текст сообщения:", message)
  console.log("[v0] 📷 Количество фото:", photos.length)

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
    let response

    if (photos.length > 0) {
      const formData = new FormData()
      Array.from(photos).forEach((photo) => {
        formData.append("photos", photo)
      })
      formData.append("message", message)
      formData.append("eventId", currentEvent.id)
      formData.append("userId", telegramUser.id)
      formData.append("firstName", telegramUser.first_name)
      formData.append("photoUrl", telegramUser.photo_url || "")

      response = await fetch(`${API_URL}/api/events/${currentEvent.id}/messages/photos`, {
        method: "POST",
        body: formData,
      })
    } else {
      response = await fetch(`${API_URL}/api/events/${currentEvent.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          userId: telegramUser.id,
          firstName: telegramUser.first_name,
          photoUrl: telegramUser.photo_url,
        }),
      })
    }

    console.log("[v0] 📊 Статус ответа:", response.status)

    if (response.ok) {
      console.log("[v0] ✅ Сообщение отправлено успешно")
      input.value = ""
      photoInput.value = ""
      document.getElementById("chat-photo-preview").classList.add("hidden")

      await loadChatMessages()
      console.log("[v0] 🔄 Чат обновлен")
    } else {
      const errorData = await response.json()
      console.error("[v0] ❌ Ошибка:", errorData)

      if (response.status === 403) {
        alert(errorData.error || "Ви не можете писати в цьому чаті")
      } else {
        alert("Помилка відправки повідомлення")
      }
    }
  } catch (error) {
    console.error("[v0] 💥 Ошибка отправки сообщения:", error)
    alert("Помилка відправки повідомлення")
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
  const files = Array.from(input.files)
  const preview = document.getElementById("photo-preview")

  if (files.length > 10) {
    alert("Максимум 10 фото за раз!")
    input.value = ""
    return
  }

  if (files.length > 0) {
    preview.innerHTML = ""
    preview.classList.remove("hidden")

    files.forEach((file, index) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const imgContainer = document.createElement("div")
        imgContainer.className = "relative"
        imgContainer.innerHTML = `
          <img src="${e.target.result}" class="w-full h-32 object-cover rounded-lg" alt="Фото ${index + 1}">
          <div class="absolute top-1 right-1 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">${index + 1}</div>
        `
        preview.appendChild(imgContainer)
      }
      reader.readAsDataURL(file)
    })

    document.getElementById("photo-file-label").textContent = `${files.length} фото обрано`
  }
}

let currentAlbumPhotos = []
let currentAlbumIndex = 0

function openAlbumModal(photos) {
  currentAlbumPhotos = photos
  currentAlbumIndex = 0
  showAlbumPhoto(0)

  const modal = document.getElementById("photo-modal")
  modal.classList.add("active")
  document.body.style.overflow = "hidden"
}

function showAlbumPhoto(index) {
  if (index < 0 || index >= currentAlbumPhotos.length) return

  currentAlbumIndex = index
  const photo = currentAlbumPhotos[index]
  const event = allEventsForPhotos.find((e) => e.id === photo.eventId)
  const eventName = event ? event.title : "Подія видалена"

  document.getElementById("modal-photo-img").src = `${API_URL}${photo.url}`
  document.getElementById("modal-photo-event").textContent = `${eventName} (${index + 1}/${currentAlbumPhotos.length})`
  document.getElementById("modal-photo-description").textContent = photo.description || ""
  document.getElementById("modal-photo-author").textContent = photo.firstName ? `Автор: ${photo.firstName}` : ""
}

function nextAlbumPhoto() {
  if (currentAlbumIndex < currentAlbumPhotos.length - 1) {
    showAlbumPhoto(currentAlbumIndex + 1)
  }
}

function prevAlbumPhoto() {
  if (currentAlbumIndex > 0) {
    showAlbumPhoto(currentAlbumIndex - 1)
  }
}

// Додаємо обробники клавіш для навігації по альбому
document.addEventListener("keydown", (e) => {
  const modal = document.getElementById("photo-modal")
  if (modal.classList.contains("active") && currentAlbumPhotos.length > 0) {
    if (e.key === "ArrowRight") {
      nextAlbumPhoto()
    } else if (e.key === "ArrowLeft") {
      prevAlbumPhoto()
    }
  }
})

async function uploadEventPhoto(event) {
  event.preventDefault()

  const eventId = document.getElementById("upload-event-select").value
  const description = document.getElementById("upload-photo-description").value
  const fileInput = document.getElementById("photo-file-input")
  const files = fileInput.files

  if (!eventId) {
    alert("Оберіть івент")
    return
  }

  if (files.length === 0) {
    alert("Оберіть хоча б одне фото")
    return
  }

  if (files.length > 10) {
    alert("Максимум 10 фото")
    return
  }

  const button = event.target
  button.classList.add("onclic")

  try {
    const albumId = Date.now().toString()

    for (let i = 0; i < files.length; i++) {
      const formData = new FormData()
      formData.append("photo", files[i])
      formData.append("eventId", eventId)
      formData.append("description", i === 0 ? description : "") // Опис тільки для першого фото
      formData.append("userId", telegramUser.id)
      formData.append("firstName", telegramUser.first_name)
      formData.append("albumId", albumId) // Додаємо ID альбому
      formData.append("albumIndex", i) // Індекс фото в альбомі
      formData.append("albumTotal", files.length) // Загальна кількість фото в альбомі

      const response = await fetch(`${API_URL}/api/photos/upload`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Помилка завантаження фото ${i + 1}`)
      }

      // Зберігаємо дані про зароблені зірки (тільки для першого фото в альбомі)
      if (i === 0) {
        const data = await response.json()
        window.lastUploadResponse = data
      }
    }

    button.classList.remove("onclic")
    button.classList.add("validate")

    setTimeout(() => {
      button.classList.remove("validate")

      let message = `${files.length} фото відправлено на модерацію`
      if (window.lastUploadResponse && window.lastUploadResponse.earnedStars > 0) {
        message += `\n\n🌟 Ви заробили ${window.lastUploadResponse.earnedStars} зірок за першу публікацію сьогодні!`
      } else if (window.lastUploadResponse && window.lastUploadResponse.dailyLimitReached) {
        message += `\n\n⚠️ Ви вже отримали зірки за сьогодні. Публікуйте знову завтра!`
      }

      alert(message)

      fileInput.value = ""
      document.getElementById("upload-photo-description").value = ""
      document.getElementById("photo-preview").classList.add("hidden")
      document.getElementById("photo-file-label").textContent = "📷 Обрати фото (до 10)"

      goToPage("page-event-photos")
      updateHeaderStarsBalance()
    }, 1500)
  } catch (error) {
    console.error("Error uploading photos:", error)
    button.classList.remove("onclic")
    alert("Помилка завантаження фото")
  }
}

function displayPhotos(photos) {
  const gallery = document.getElementById("photos-gallery")

  if (photos.length === 0) {
    gallery.innerHTML = '<div class="col-span-2 text-center text-gray-500">Фото не знайдено</div>'
    return
  }

  // Групуємо фото по альбомах
  const albums = {}
  const singlePhotos = []

  photos.forEach((photo) => {
    if (photo.albumId) {
      if (!albums[photo.albumId]) {
        albums[photo.albumId] = []
      }
      albums[photo.albumId].push(photo)
    } else {
      singlePhotos.push(photo)
    }
  })

  // Сортуємо фото в альбомах по індексу
  Object.keys(albums).forEach((albumId) => {
    albums[albumId].sort((a, b) => (a.albumIndex || 0) - (b.albumIndex || 0))
  })

  let html = ""

  // Відображаємо альбоми
  Object.keys(albums).forEach((albumId) => {
    const albumPhotos = albums[albumId]
    const firstPhoto = albumPhotos[0]
    const event = allEventsForPhotos.find((e) => e.id === firstPhoto.eventId)
    const eventName = event ? event.title : "Подія видалена"

    html += `
      <div class="bg-white rounded-lg overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition col-span-2" onclick='openAlbumModal(${JSON.stringify(albumPhotos).replace(/'/g, "&apos;")})'>
        <div class="relative">
          <img src="${API_URL}${firstPhoto.url}" class="w-full h-48 object-cover" alt="${firstPhoto.description || eventName}">
          <div class="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded-lg text-xs flex items-center gap-1">
            <i data-lucide="images" class="w-3 h-3"></i>
            ${albumPhotos.length}
          </div>
        </div>
        <div class="p-2">
          <p class="text-xs font-semibold text-gray-700">${eventName}</p>
          ${firstPhoto.description ? `<p class="text-xs text-gray-500 mt-1">${firstPhoto.description}</p>` : ""}
          <p class="text-xs text-gray-600 mt-1">@${firstPhoto.firstName || "Користувач"}</p>
        </div>
      </div>
    `
  })

  // Відображаємо окремі фото
  singlePhotos.forEach((photo) => {
    const event = allEventsForPhotos.find((e) => e.id === photo.eventId)
    const eventName = event ? event.title : "Подія видалена"
    const isOwnPhoto = String(photo.userId) === String(telegramUser.id)

    const earnedStarsCount = Math.floor((photo.unlockCount || 0) / 50)
    const starsDisplay = earnedStarsCount > 0 ? "⭐".repeat(Math.min(earnedStarsCount, 5)) : ""

    html += `
      <div class="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition">
        <div class="relative photo-container-${photo.id}" onclick='openPhotoModal(${JSON.stringify(photo).replace(/'/g, "&apos;")})' style="cursor: pointer;">
          <img id="photo-${photo.id}" src="${API_URL}${photo.url}" class="w-full h-40 object-cover ${isOwnPhoto ? "" : "photo-blurred"}" alt="${photo.description || eventName}">
          ${starsDisplay ? `<div class="absolute top-2 left-2 text-2xl">${starsDisplay}</div>` : ""}
          ${
            isOwnPhoto
              ? ""
              : `
          <div class="photo-unlock-overlay" onclick="event.stopPropagation(); unlockPhoto('${photo.id}')">
            <div class="text-2xl mb-2">🔒</div>
            <div class="font-bold">Відкрити фото</div>
            <div class="text-sm">1 ⭐</div>
          </div>
          `
          }
        </div>
        <div class="p-2">
          <p class="text-xs font-semibold text-gray-700">${eventName}</p>
          ${photo.description ? `<p class="text-xs text-gray-500 mt-1">${photo.description}</p>` : ""}
          <p class="text-xs text-gray-600 mt-1">@${photo.firstName || "Користувач"}</p>
          <div class="photo-reactions" id="reactions-${photo.id}"></div>
        </div>
      </div>
    `
  })

  gallery.innerHTML = html

  // Ініціалізуємо іконки
  if (lucide) {
    lucide.createIcons()
  }

  // Завантажуємо реакції для кожного фото та перевіряємо статус розблокування
  photos.forEach(async (photo) => {
    loadPhotoReactions(photo.id)

    const isOwnPhoto = String(photo.userId) === String(telegramUser.id)
    if (!isOwnPhoto) {
      const unlocked = await checkPhotoUnlocked(photo.id)
      if (unlocked) {
        const img = document.getElementById(`photo-${photo.id}`)
        const container = document.querySelector(`.photo-container-${photo.id}`)
        if (img) img.classList.remove("photo-blurred")
        if (container) {
          const overlay = container.querySelector(".photo-unlock-overlay")
          if (overlay) overlay.remove()
        }
      }
    }
  })
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

    // Оновлюємо баланс зірок в шапці
    updateHeaderStarsBalance()

    // Показуємо модальне вікно акції при першому відвідуванні
    showPromoModalIfNeeded()
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

function openPhotoModal(photo, eventTitle) {
  // changed parameter name to photo
  const modal = document.getElementById("photo-modal")
  const img = document.getElementById("modal-photo-img")
  const eventEl = document.getElementById("modal-photo-event")
  const authorEl = document.getElementById("modal-photo-author")
  const descriptionEl = document.getElementById("modal-photo-description")

  img.src = `${API_URL}${photo.url}`
  eventEl.textContent = eventTitle
  authorEl.textContent = `Автор: ${photo.firstName || "Користувач"}`
  descriptionEl.textContent = photo.description || ""

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

let navigationPhotos = []

async function uploadNavigationPhotos() {
  const input = document.getElementById("navigation-photo-input")
  const files = input.files

  if (files.length === 0) return

  if (files.length > 10) {
    alert("Максимум 10 фото")
    input.value = ""
    return
  }

  try {
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData()
      formData.append("photo", files[i])
      formData.append("type", "navigation")
      formData.append("userId", telegramUser.id)

      const response = await fetch(`${API_URL}/api/navigation/upload`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Помилка завантаження фото ${i + 1}`)
      }
    }

    alert("Фото схеми завантажено успішно")
    input.value = ""
    loadNavigationPhotos()
  } catch (error) {
    console.error("Error uploading navigation photos:", error)
    alert("Помилка завантаження фото")
  }
}

async function loadNavigationPhotos() {
  try {
    const response = await fetch(`${API_URL}/api/navigation/photos`)
    navigationPhotos = await response.json()

    const grid = document.getElementById("navigation-photos-grid")
    if (navigationPhotos.length === 0) {
      grid.innerHTML = '<p class="col-span-2 text-center text-gray-500 text-sm">Немає завантажених схем</p>'
      return
    }

    grid.innerHTML = navigationPhotos
      .map(
        (photo) => `
      <div class="relative cursor-pointer" onclick='openNavigationPhoto("${photo.url}")'>
        <img src="${API_URL}${photo.url}" class="w-full h-24 object-cover rounded-lg">
      </div>
    `,
      )
      .join("")
  } catch (error) {
    console.error("Error loading navigation photos:", error)
  }
}

function openNavigationPhoto(url) {
  const modal = document.getElementById("photo-modal")
  document.getElementById("modal-photo-img").src = `${API_URL}${url}`
  document.getElementById("modal-photo-event").textContent = "Схема корпусів"
  document.getElementById("modal-photo-description").textContent = ""
  document.getElementById("modal-photo-author").textContent = ""
  modal.classList.add("active")
  document.body.style.overflow = "hidden"
}

updateTime()
setInterval(updateTime, 1000)

// Загружаем расписание пользователя
const savedSchedule = localStorage.getItem("userSchedule")
if (savedSchedule) {
  userSchedule = JSON.parse(savedSchedule)
  document.getElementById("main-schedule-subtitle").textContent = `• ${userSchedule.name}`
  document.getElementById("main-schedule-subtitle").style.display = "block"
}

if (document.getElementById("page-schedule-detail")) {
  loadNavigationPhotos()
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

// ========== Telegram Stars System ==========

// Показати модальне вікно акції при першому відкритті галереї
function showPromoModalIfNeeded() {
  const hasSeenPromo = localStorage.getItem("hasSeenStarsPromo")
  if (!hasSeenPromo) {
    document.getElementById("promoModal").style.display = "flex"
    localStorage.setItem("hasSeenStarsPromo", "true")
  }
}

function closePromoModal() {
  document.getElementById("promoModal").style.display = "none"
}

// Показати профіль користувача з балансом
async function showStarsProfile() {
  try {
    const response = await fetch(`${API_URL}/api/stars/balance/${telegramUser.id}`)
    const data = await response.json()

    document.getElementById("profileStarsCount").textContent = data.balance
    document.getElementById("starsProfileModal").style.display = "flex"
  } catch (error) {
    console.error("Error loading stars balance:", error)
  }
}

function closeStarsProfileModal() {
  document.getElementById("starsProfileModal").style.display = "none"
}

// Запит на вивід зірок
async function requestWithdraw() {
  const amount = Number.parseInt(document.getElementById("withdrawAmount").value)

  if (!amount || amount < 50) {
    alert("Мінімальна сума виводу - 50 зірок")
    return
  }

  try {
    const response = await fetch(`${API_URL}/api/stars/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
        amount: amount,
      }),
    })

    const data = await response.json()

    if (data.success) {
      alert("Запит на вивід відправлено! Адміністратор розгляне його найближчим часом.")
      closeStarsProfileModal()
    } else {
      alert(data.error || "Помилка обробки запиту")
    }
  } catch (error) {
    console.error("Error requesting withdraw:", error)
    alert("Помилка відправки запиту")
  }
}

// Додати реакцію на фото
async function addPhotoReaction(photoId, reaction) {
  try {
    await fetch(`${API_URL}/api/photos/${photoId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
        reaction: reaction,
      }),
    })

    // Оновлюємо відображення реакцій
    loadPhotoReactions(photoId)
  } catch (error) {
    console.error("Error adding reaction:", error)
  }
}

// Завантажити реакції на фото
async function loadPhotoReactions(photoId) {
  try {
    const response = await fetch(`${API_URL}/api/photos/${photoId}/reactions?userId=${telegramUser.id}`)
    const data = await response.json()

    const container = document.getElementById(`reactions-${photoId}`)
    if (!container) return

    const reactions = ["❤️"]
    container.innerHTML = reactions
      .map((emoji) => {
        const count = data.reactions[emoji] || 0
        const isActive = data.userReaction === emoji
        return `
        <button class="reaction-button ${isActive ? "active" : ""}" 
                onclick="addPhotoReaction('${photoId}', '${emoji}')">
          ${emoji} ${count > 0 ? count : ""}
        </button>
      `
      })
      .join("")
  } catch (error) {
    console.error("Error loading reactions:", error)
  }
}

// Перевірити, чи фото розблоковано
async function checkPhotoUnlocked(photoId) {
  try {
    const response = await fetch(`${API_URL}/api/photos/${photoId}/unlocked?userId=${telegramUser.id}`)
    const data = await response.json()
    return data.unlocked
  } catch (error) {
    console.error("Error checking unlock status:", error)
    return false
  }
}

// Розблокувати фото через Telegram Stars
async function unlockPhoto(photoId) {
  try {
    const response = await fetch(`${API_URL}/api/photos/${photoId}/createInvoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: telegramUser.id }),
    })

    const data = await response.json()

    if (data.alreadyUnlocked) {
      // Фото вже розблоковано, просто показуємо його
      const img = document.getElementById(`photo-${photoId}`)
      if (img) {
        img.classList.remove("photo-blurred")
        const overlay = img.nextElementSibling
        if (overlay) overlay.remove()
      }
    } else if (data.success) {
      alert("Інвойс відправлено в Telegram бота. Перевірте повідомлення від бота для оплати.")
    }
  } catch (error) {
    console.error("Error creating invoice:", error)
    alert("Помилка створення інвойсу")
  }
}

// Оновити баланс зірок в шапці галереї
async function updateHeaderStarsBalance() {
  try {
    const response = await fetch(`${API_URL}/api/stars/balance/${telegramUser.id}`)
    const data = await response.json()

    const balanceEl = document.getElementById("headerStarsBalance")
    if (balanceEl) {
      balanceEl.textContent = data.balance
    }
  } catch (error) {
    console.error("Error updating header stars balance:", error)
  }
}

async function loadPhotos() {
  try {
    const response = await fetch(`${API_URL}/api/photos`)
    allPhotos = await response.json()

    allPhotos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))

    const eventsResponse = await fetch(`${API_URL}/api/events`)
    allEventsForPhotos = await eventsResponse.json()

    const filter = document.getElementById("photo-event-filter")
    if (filter) {
      filter.innerHTML =
        '<option value="">Всі івенти</option>' +
        allEventsForPhotos.map((event) => `<option value="${event.id}">${event.title}</option>`).join("")
    }

    displayPhotos(allPhotos)

    // Оновлюємо баланс зірок в шапці
    updateHeaderStarsBalance()

    // Показуємо модальне вікно акції при першому відвідуванні
    showPromoModalIfNeeded()
  } catch (error) {
    console.error("Error loading photos:", error)
    document.getElementById("photos-gallery").innerHTML =
      '<div class="col-span-2 text-center text-red-500">Помилка завантаження фото</div>'
  }
}
