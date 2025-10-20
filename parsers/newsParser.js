const axios = require("axios")
const cheerio = require("cheerio")

const TELEGRAM_CHANNELS = [
  // Афиша, події, мероприятия
  { name: "Аффішер Києва", username: "afficherkyiv", category: "events" },
  { name: "Відчути Київ: події та місця", username: "Concertua", category: "events" },
  { name: "КОНТРАБАС", username: "kontrabass_promo", category: "events" },
  { name: "Kontramarka | Київ", username: "afishakontramarka", category: "events" },
  { name: "KARABAS.COM", username: "karabascom", category: "events" },

  // Музика
  { name: "Нумо їхати!", username: "numogo", category: "music" },
  { name: "NUAM", username: "NewUAM", category: "music" },
  { name: "ПОТОП", username: "potopvydav", category: "music" },
  { name: "Slay Music", username: "slaymsc", category: "music" },
  { name: "Liroom", username: "liroom", category: "music" },
  { name: "Bezodnya Music🎧", username: "bezodnyamusic", category: "music" },

  // Новини Києва
  { name: "Киевский Движ", username: "k_dvizh", category: "kyiv" },
  { name: "🟢Київ Новини | Live 24/7", username: "kyiv_novyny_24", category: "kyiv" },

  // Студлайф
  { name: "STUDLAVA", username: "studlava", category: "scholarships" },

  // Обмін, Стипендії, Гранти
  { name: "Erasmus+ Projects", username: "erasmusplusprojects", category: "scholarships" },
  { name: "Scholarships Corner", username: "scholarshipscorner", category: "scholarships" },
  { name: "UCU International", username: "ucu_international", category: "scholarships" },
  { name: "OP Corner", username: "opcorner", category: "scholarships" },
  { name: "Scholarships 365", username: "scholarships365", category: "scholarships" },
  { name: "The Global Scholarship", username: "theglobalscholarship", category: "scholarships" },
  { name: "Scholarship", username: "scholarship", category: "scholarships" },
  { name: "Scholarships EE", username: "scholarshipsee", category: "scholarships" },
  { name: "Study Abroad YMGrad", username: "study_abroad_ymgrad", category: "scholarships" },
  { name: "Opportunities Circle", username: "opportunitiescircleofficial", category: "scholarships" },
  { name: "FLEX Alumni Ukraine", username: "FLEXAlumniUkraine", category: "scholarships" },
  { name: "Leap Abroad", username: "leap_abroad", category: "scholarships" },
  { name: "Education USA Ukraine", username: "educationusaukraine", category: "scholarships" },

  // Наука, Технології, AI
  { name: "AI Best Tools", username: "AI_Best_Tools", category: "tech" },
  { name: "News Techs", username: "news_techs", category: "tech" },
  { name: "Science", username: "science", category: "tech" },
  { name: "USF Official", username: "usfofficial", category: "tech" },
  { name: "ITC UA", username: "itcua", category: "tech" },

  // IELTS
  { name: "Ingliz Tili UZ", username: "Ingliztiliuz", category: "scholarships" },
  { name: "English Made Easy", username: "Englishmade_easy", category: "scholarships" },

  // Бьюті
  { name: "UA Eva", username: "uaeva", category: "beauty" },
  { name: "Fashion Department KP", username: "fashiondepartment_kp", category: "beauty" },

  // Електроенергія
  // Додайте сюда канали про электроенергію, якщо потрібно
  { name: "Energy Channel", username: "energy_channel", category: "energy" },
]

const NEWS_SOURCES = [
  {
    name: "KNU Конкурси",
    url: "https://international.knu.ua/category/konkursy/",
    type: "website",
    parser: parseKNUInternational,
    category: "knu",
  },
  {
    name: "KNU Календар",
    url: "https://knu.ua/ua/knu-callendar",
    type: "website",
    parser: parseKNUCalendar,
    category: "knu",
  },
  {
    name: "KNU Новини",
    url: "https://knu.ua/ua/",
    type: "website",
    parser: parseKNUNews,
    category: "knu",
  },
  {
    name: "IIR Student Council",
    channel: "@iir_student_council",
    type: "telegram",
    category: "knu",
  },
  {
    name: "SPU KNU",
    channel: "@spu_knu",
    type: "telegram",
    category: "knu",
  },
  {
    name: "SRS KNU",
    channel: "@srs_knu",
    type: "telegram",
    category: "knu",
  },
  {
    name: "Elections KNU",
    channel: "@electionsknu",
    type: "telegram",
    category: "knu",
  },
]

async function parseKNUInternational() {
  try {
    const response = await axios.get("https://international.knu.ua/category/konkursy/", {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    const $ = cheerio.load(response.data)
    const articles = []

    $(".post").each((i, elem) => {
      if (i >= 5) return false

      const title = $(elem).find(".entry-title a").text().trim()
      const link = $(elem).find(".entry-title a").attr("href")
      const dateText = $(elem).find(".posted-on time").attr("datetime")
      const excerpt = $(elem).find(".entry-summary p").text().trim()

      if (title && link) {
        articles.push({
          title,
          link,
          source: "KNU Конкурси",
          description: excerpt || "",
          date: formatDate(dateText),
          timeAgo: getTimeAgo(dateText),
          content: excerpt,
        })
      }
    })

    return articles
  } catch (error) {
    console.error("Error parsing KNU International:", error.message)
    return []
  }
}

async function parseKNUCalendar() {
  try {
    const response = await axios.get("https://knu.ua/ua/knu-callendar", {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    const $ = cheerio.load(response.data)
    const articles = []

    $(".event-item, .calendar-event").each((i, elem) => {
      if (i >= 3) return false

      const title = $(elem).find("h3, .event-title").text().trim() || $(elem).find("a").first().text().trim()
      const link = $(elem).find("a").attr("href")
      const description = $(elem).find(".event-description, p").text().trim()

      if (title) {
        articles.push({
          title,
          link: link ? (link.startsWith("http") ? link : "https://knu.ua" + link) : "https://knu.ua/ua/knu-callendar",
          source: "KNU Календар",
          description: description || "",
          date: formatDate(new Date()),
          timeAgo: "сьогодні",
          content: description,
        })
      }
    })

    return articles
  } catch (error) {
    console.error("Error parsing KNU Calendar:", error.message)
    return []
  }
}

async function parseKNUNews() {
  try {
    const response = await axios.get("https://knu.ua/ua/", {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    const $ = cheerio.load(response.data)
    const articles = []

    $(".views-row, .news-item, article, .post-item, .item-list li").each((i, elem) => {
      if (i >= 10) return false

      const titleElem = $(elem).find(
        'h2, h3, h4, .news-title, .post-title, .views-field-title a, a[href*="/news/"], a[href*="/ua/news/"]',
      )
      const title = titleElem.text().trim() || $(elem).find("a").first().text().trim()
      const link = titleElem.attr("href") || $(elem).find("a").attr("href")
      const description = $(elem).find(".news-description, .excerpt, .views-field-body, p").first().text().trim()
      const dateElem = $(elem).find(".date, time, .post-date, .views-field-created, .views-field-post-date")
      const dateText = dateElem.attr("datetime") || dateElem.text().trim()

      if (title && title.length > 10) {
        const newsDate = dateText ? new Date(dateText) : new Date()
        articles.push({
          title,
          link: link ? (link.startsWith("http") ? link : "https://knu.ua" + link) : "https://knu.ua/ua/",
          source: "KNU Новини",
          description: description || "",
          date: formatDate(newsDate),
          timeAgo: getTimeAgo(newsDate),
          content: description,
          parsedDate: newsDate,
        })
      }
    })

    return articles.sort((a, b) => b.parsedDate - a.parsedDate).slice(0, 5)
  } catch (error) {
    console.error("Error parsing KNU News:", error.message)
    return []
  }
}

async function parseTelegramChannel(channelName, channelTitle = null) {
  try {
    const url = `https://t.me/s/${channelName.replace("@", "")}`
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    const $ = cheerio.load(response.data)
    const articles = []

    const messages = $(".tgme_widget_message").toArray()
    const latestMessages = messages.slice(-10)

    latestMessages.forEach((elem) => {
      const messageText = $(elem).find(".tgme_widget_message_text").text().trim()
      const link = $(elem).find(".tgme_widget_message_date").attr("href")
      const dateText = $(elem).find(".tgme_widget_message_date time").attr("datetime")

      if (messageText && messageText.length > 20) {
        const title = messageText.substring(0, 100) + (messageText.length > 100 ? "..." : "")
        const newsDate = dateText ? new Date(dateText) : new Date()
        articles.push({
          title,
          link: link || url,
          source: channelTitle || channelName,
          description: messageText,
          date: formatDate(newsDate),
          timeAgo: getTimeAgo(newsDate),
          content: messageText,
          parsedDate: newsDate,
        })
      }
    })

    return articles.sort((a, b) => b.parsedDate - a.parsedDate).slice(0, 3)
  } catch (error) {
    console.error(`Error parsing Telegram channel ${channelName}:`, error.message)
    return []
  }
}

function formatDate(dateInput) {
  try {
    let date
    if (!dateInput) {
      date = new Date()
    } else if (typeof dateInput === "string") {
      date = new Date(dateInput)
    } else if (dateInput instanceof Date) {
      date = dateInput
    } else {
      date = new Date()
    }

    if (isNaN(date.getTime())) {
      date = new Date()
    }

    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  } catch (error) {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, "0")
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const year = now.getFullYear()
    return `${day}.${month}.${year}`
  }
}

function getTimeAgo(dateInput) {
  try {
    let date
    if (!dateInput) {
      return "нещодавно"
    } else if (typeof dateInput === "string") {
      date = new Date(dateInput)
    } else if (dateInput instanceof Date) {
      date = dateInput
    } else {
      return "нещодавно"
    }

    if (isNaN(date.getTime())) {
      return "нещодавно"
    }

    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) {
      return diffMins <= 1 ? "щойно" : `${diffMins} хв тому`
    } else if (diffHours < 24) {
      return `${diffHours} год тому`
    } else if (diffDays < 7) {
      return `${diffDays} дн тому`
    } else {
      return formatDate(date)
    }
  } catch (error) {
    return "нещодавно"
  }
}

async function getAllNews() {
  const allNews = []

  for (const source of NEWS_SOURCES) {
    try {
      let articles = []

      if (source.type === "website" && source.parser) {
        articles = await source.parser()
      } else if (source.type === "telegram" && source.channel) {
        articles = await parseTelegramChannel(source.channel, source.name)
      }

      articles = articles.map((article) => ({
        ...article,
        category: source.category || "all",
      }))

      allNews.push(...articles)
    } catch (error) {
      console.error(`Error fetching from ${source.name}:`, error.message)
    }
  }

  for (const channel of TELEGRAM_CHANNELS) {
    try {
      const articles = await parseTelegramChannel(channel.username, channel.name)

      const categorizedArticles = articles.map((article) => ({
        ...article,
        category: channel.category || "all",
      }))

      allNews.push(...categorizedArticles)
    } catch (error) {
      console.error(`Error fetching from ${channel.name}:`, error.message)
    }
  }

  allNews.sort((a, b) => {
    const dateA = a.parsedDate || new Date(a.date.split(".").reverse().join("-"))
    const dateB = b.parsedDate || new Date(b.date.split(".").reverse().join("-"))
    return dateB - dateA
  })

  if (allNews.length === 0) {
    return [
      {
        title: "Вітаємо в U-hub!",
        source: "U-hub",
        description: "Тут ви знайдете останні новини КНУ",
        date: formatDate(new Date()),
        timeAgo: "щойно",
        link: "https://knu.ua",
        content: "Система завантажується. Спробуйте оновити через декілька хвилин.",
        parsedDate: new Date(),
        category: "all",
      },
    ]
  }

  return allNews.slice(0, 100)
}

module.exports = {
  getAllNews,
  parseKNUInternational,
  parseKNUCalendar,
  parseKNUNews,
  parseTelegramChannel,
  TELEGRAM_CHANNELS, // Экспортируем для использования в других модулях
}
