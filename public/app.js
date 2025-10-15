const API_URL = window.location.origin
let currentEvent = null
let currentSchedule = null
let currentNews = null
let userSchedule = null
let telegramUser = null
const lucide = window.lucide // Declare the lucide variable

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

  const targetPage = document.getElementById(pageId)
  if (!targetPage) {
    console.error("Page not found:", pageId)
    return
  }

  const currentPage = document.querySelector(".page.active")
  if (currentPage) {
    currentPage.classList.remove("active")
    // Force reflow to ensure animation restarts
    void currentPage.offsetWidth
  }

  // Small delay to ensure smooth transition
  requestAnimationFrame(() => {
    targetPage.classList.add("active")
    if (lucide) {
      // Check if lucide is declared before using it
      lucide.createIcons()
    }
  })

  if (pageId === "page-news-feed") {
    loadNews()
  } else if (pageId === "page-events-list") {
    loadEvents()
  } else if (pageId === "page-event-photos") {
    loadPhotos()
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

    const newsListEl = document.getElementById("news-list")
    if (news.length === 0) {
      newsListEl.innerHTML = '<div class="p-4 text-center text-gray-500">Новини не знайдено</div>'
      return
    }

    newsListEl.innerHTML = news
      .map(
        (item) => `
            <div class="p-4 cursor-pointer" onclick='viewNewsDetail(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                <p class="font-bold leading-tight">${item.title}</p>
                <p class="text-sm text-gray-500 mt-1">"${item.source}" - ${item.timeAgo}</p>
            </div>
        `,
      )
      .join("")

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
    } else {
      document.getElementById("schedule-remove-btn").classList.add("hidden")
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
    goToPage("page-schedule-search")
  }
}

async function loadEvents() {
  try {
    const response = await fetch(`${API_URL}/api/events`)
    const events = await response.json()

    const eventsContainer = document.getElementById("events-container")
    if (events.length === 0) {
      eventsContainer.innerHTML = '<div class="text-center text-gray-500">Подій не знайдено</div>'
      return
    }

    const eventsHTML = []
    for (const event of events) {
      const isExpired = new Date(event.expiresAt) < new Date()
      const joinedResponse = await fetch(`${API_URL}/api/events/${event.id}/joined?userId=${telegramUser.id}`)
      const joinedData = await joinedResponse.json()
      const isJoined = joinedData.joined

      eventsHTML.push(`
                <div class="event-card" id="event-card-${event.id}">
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
                    <div class="flex items-center text-sm text-gray-500 mb-2">
                        <i data-lucide="users" class="w-4 h-4 mr-1"></i>
                        <span id="event-participants-${event.id}">${joinedData.participants} учасників</span>
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
                            : '<div class="text-center text-gray-400 py-2">Подія завершена</div>'
                        }
                    </div>
                </div>
            `)
    }

    eventsContainer.innerHTML = eventsHTML.join("")
    if (lucide) {
      // Check if lucide is declared before using it
      lucide.createIcons()
    }

    if (events[0]) {
      document.getElementById("main-event-title").textContent = events[0].title
    }
  } catch (error) {
    console.error("Error loading events:", error)
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

    if (response.ok) {
      const participantsEl = document.getElementById(`event-participants-${eventId}`)
      const buttonsEl = document.getElementById(`event-buttons-${eventId}`)

      if (participantsEl) {
        participantsEl.textContent = data.participants + " учасників"
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
          // Check if lucide is declared before using it
          lucide.createIcons()
        }
      }
    }
  } catch (error) {
    console.error("Error joining event:", error)
    alert("Помилка приєднання до події")
  }
}

async function leaveEventFromList(eventId) {
  if (!confirm("Ви впевнені, що хочете вийти з цього івенту?")) return

  try {
    const response = await fetch(`${API_URL}/api/events/${eventId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: telegramUser.id,
      }),
    })

    const data = await response.json()

    if (response.ok) {
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
    console.error("Error leaving event:", error)
    alert("Помилка виходу з події")
  }
}

async function openEventChat(eventId) {
  try {
    const response = await fetch(`${API_URL}/api/events/${eventId}`)
    currentEvent = await response.json()
    document.getElementById("event-chat-title").textContent = `Чат: ${currentEvent.title}`
    goToPage("page-event-chat")
    loadChatMessages()
  } catch (error) {
    console.error("Error opening chat:", error)
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

async function createNewEvent() {
  const button = event.target
  const eventData = {
    title: document.getElementById("event-name").value,
    date: document.getElementById("event-date").value,
    time: document.getElementById("event-time").value,
    location: document.getElementById("event-location").value,
    description: document.getElementById("event-description").value,
    duration: Number.parseInt(document.getElementById("event-duration").value) || 24,
  }

  if (!eventData.title || !eventData.date || !eventData.time || !eventData.location) {
    alert("Будь ласка, заповніть всі обов'язкові поля")
    return
  }

  // Анимация кнопки
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
      // После успешного создания
      button.classList.remove("onclic")
      button.classList.add("validate")

      // Показать уведомление
      showModerationNotification("Івент відправлено на модерацію!")

      setTimeout(() => {
        button.classList.remove("validate")
        button.disabled = false
        // Переход на страницу ивентов
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

async function loadChatMessages() {
  if (!currentEvent) return

  try {
    const response = await fetch(`${API_URL}/api/events/${currentEvent.id}/messages`)
    const messages = await response.json()

    const chatMessages = document.getElementById("chat-messages")
    chatMessages.innerHTML = messages
      .map((msg) => {
        const isOwn = msg.userId === telegramUser.id
        const avatar =
          msg.photoUrl ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.firstName || "U")}&background=random`

        return `
                <div class="flex ${isOwn ? "justify-end" : "justify-start"} mb-3">
                    ${!isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full mr-2" alt="${msg.firstName}">` : ""}
                    <div class="${isOwn ? "chat-message own" : "chat-message"}">
                        ${!isOwn ? `<div class="text-xs font-semibold mb-1">${msg.firstName}</div>` : ""}
                        <div>${msg.text}</div>
                    </div>
                    ${isOwn ? `<img src="${avatar}" class="w-8 h-8 rounded-full ml-2" alt="${msg.firstName}">` : ""}
                </div>
            `
      })
      .join("")

    if (messages.length === 0) {
      chatMessages.innerHTML =
        '<div class="text-center text-gray-500">Чат порожній. Будьте першим, хто напише повідомлення!</div>'
    }

    chatMessages.scrollTop = chatMessages.scrollHeight
  } catch (error) {
    console.error("Error loading messages:", error)
  }
}

async function sendMessage() {
  const input = document.getElementById("chat-input")
  const message = input.value.trim()

  if (!message || !currentEvent) return

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

    if (response.ok) {
      await loadChatMessages()
      input.value = ""
    } else if (response.status === 403) {
      const error = await response.json()
      alert(error.error || "У вас немає дозволу писати повідомлення")
    }
  } catch (error) {
    console.error("Error sending message:", error)
  }
}

async function uploadVideo() {
  const input = document.getElementById("video-upload")
  const file = input.files[0]
  const button = input.parentElement

  if (!file) return

  // Анимация кнопки
  button.classList.add("onclic")

  try {
    const thumbnail = await generateVideoThumbnail(file)

    const formData = new FormData()
    formData.append("video", file)
    formData.append("thumbnail", thumbnail)

    const response = await fetch(`${API_URL}/api/videos/upload`, {
      method: "POST",
      body: formData,
    })

    const result = await response.json()

    // После успешной загрузки
    button.classList.remove("onclic")
    button.classList.add("validate")

    // Показать уведомление
    showModerationNotification("Ваше відео відправлено на модерацію!")

    setTimeout(() => {
      button.classList.remove("validate")
    }, 2000)

    input.value = ""
  } catch (error) {
    button.classList.remove("onclic", "validate")
    console.error("Error uploading video:", error)
    alert("Помилка завантаження відео")
  }
}

async function generateVideoThumbnail(videoFile) {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    video.addEventListener("loadeddata", () => {
      video.currentTime = 0.5
    })

    video.addEventListener("seeked", () => {
      const size = Math.min(video.videoWidth, video.videoHeight)
      const x = (video.videoWidth - size) / 2
      const y = (video.videoHeight - size) / 2

      canvas.width = size
      canvas.height = size

      ctx.drawImage(video, x, y, size, size, 0, 0, size, size)

      canvas.toBlob(
        (blob) => {
          resolve(blob)
        },
        "image/jpeg",
        0.8,
      )
    })

    video.src = URL.createObjectURL(videoFile)
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

async function uploadPhotos() {
  const input = document.getElementById("photo-upload")
  const files = input.files

  if (!files.length) return

  const formData = new FormData()
  for (const file of files) {
    formData.append("photos", file)
  }

  try {
    const response = await fetch(`${API_URL}/api/photos/upload`, {
      method: "POST",
      body: formData,
    })

    if (response.ok) {
      alert("Фото завантажено успішно!")
      loadPhotos()
      input.value = ""
    }
  } catch (error) {
    console.error("Error uploading photos:", error)
    alert("Помилка завантаження фото")
  }
}

async function loadPhotos() {
  try {
    const response = await fetch(`${API_URL}/api/photos`)
    const photos = await response.json()

    const grid = document.getElementById("photos-grid")
    if (photos.length === 0) {
      grid.innerHTML = '<div class="col-span-3 text-center text-gray-500">Фото не знайдено</div>'
      return
    }

    grid.innerHTML = photos
      .map(
        (photo) => `
            <img src="${API_URL}${photo.url}" class="w-full h-24 object-cover rounded-md" alt="Event photo">
        `,
      )
      .join("")
  } catch (error) {
    console.error("Error loading photos:", error)
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

loadNews()
loadEvents()
loadHeroImages()
loadApprovedVideos()

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
  try {
    const response = await fetch(`${API_URL}/api/videos/approved`)
    const videos = await response.json()

    const grid = document.getElementById("main-video-grid")
    if (!grid) return

    if (videos.length === 0) {
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
        thumbnails.push(`
                    <div class="aspect-square overflow-hidden rounded-md cursor-pointer" onclick="openTikTok(event)">
                        <img src="${API_URL}${videos[i].thumbnailPath}" class="w-full h-full object-cover">
                    </div>
                `)
      } else {
        thumbnails.push(`
                    <div class="aspect-square overflow-hidden rounded-md cursor-pointer" onclick="openTikTok(event)">
                        <img src="https://placehold.co/150x150/fecaca/900?text=V" class="w-full h-full object-cover">
                    </div>
                `)
      }
    }

    grid.innerHTML = thumbnails.join("")
  } catch (error) {
    console.error("Error loading approved videos:", error)
  }
}
