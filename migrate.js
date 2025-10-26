#!/usr/bin/env node

/**
 * Скрипт миграции данных из JSON файлов в SQLite базу данных
 * 
 * Использование:
 *   node migrate.js
 * 
 * Опции:
 *   --help    Показать справку
 *   --dry-run Запустить в режиме симуляции (без реальной миграции)
 * 
 * Примеры:
 *   node migrate.js           # Полная миграция
 *   node migrate.js --dry-run # Проверка без миграции
 */

const { migrateAllData } = require("./db")
const path = require("path")

// Парсинг аргументов командной строки
const args = process.argv.slice(2)
const isDryRun = args.includes("--dry-run")
const showHelp = args.includes("--help") || args.includes("-h")

// Показать справку
if (showHelp) {
  console.log(`
🔄 Скрипт миграции данных из JSON в SQLite

Использование:
  node migrate.js [опции]

Опции:
  --help, -h    Показать эту справку
  --dry-run     Режим симуляции (проверка файлов без миграции)

Описание:
  Этот скрипт мигрирует данные из JSON файлов в SQLite базу данных.
  Перед миграцией создаются резервные копии всех JSON файлов.
  
  Миграция выполняется в следующем порядке:
  1. События, расписания, видео, фото, фото навигации
  2. Участники событий, сообщения событий
  3. Реакции на фото, разблокировки, заработки
  4. Балансы Stars, запросы на вывод
  5. Ежедневные загрузки, еженедельные блюр-фото
  6. Настройки админа, ограничения пользователей

  Функции миграции являются идемпотентными - их можно запускать
  повторно без риска дублирования данных.

Примеры:
  node migrate.js              # Выполнить полную миграцию
  node migrate.js --dry-run    # Проверить файлы без миграции

Резервные копии:
  Все JSON файлы автоматически копируются в:
  data/backup/<timestamp>/

Логи:
  Прогресс миграции выводится в консоль с подробной статистикой.
  `)
  process.exit(0)
}

// Основная функция
async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗")
  console.log("║   🔄 МИГРАЦИЯ ДАННЫХ ИЗ JSON В SQLITE                    ║")
  console.log("╚═══════════════════════════════════════════════════════════╝")
  console.log()

  if (isDryRun) {
    console.log("⚠️  РЕЖИМ СИМУЛЯЦИИ (--dry-run)")
    console.log("   Реальная миграция не будет выполнена")
    console.log()
  }

  const dataDir = path.join(__dirname, "data")

  try {
    if (isDryRun) {
      // В режиме dry-run просто проверяем наличие файлов
      console.log("[v0] 📁 Проверка наличия JSON файлов...")
      
      const fs = require("fs")
      const files = [
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

      let foundFiles = 0
      let totalRecords = 0

      for (const file of files) {
        const filePath = path.join(dataDir, file)
        try {
          const data = fs.readFileSync(filePath, "utf-8")
          const parsed = JSON.parse(data)
          const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length
          console.log(`   ✅ ${file.padEnd(30)} - ${count} записей`)
          foundFiles++
          totalRecords += count
        } catch (err) {
          console.log(`   ❌ ${file.padEnd(30)} - не найден`)
        }
      }

      console.log()
      console.log(`[v0] 📊 Найдено файлов: ${foundFiles} из ${files.length}`)
      console.log(`[v0] 📊 Всего записей: ${totalRecords}`)
      console.log()
      console.log("[v0] ℹ️  Запустите без --dry-run для выполнения миграции")
    } else {
      // Выполняем реальную миграцию
      console.log("[v0] 🚀 Начало миграции данных...")
      console.log("[v0] 📂 Директория данных:", dataDir)
      console.log()

      const stats = await migrateAllData(dataDir)

      console.log()
      console.log("╔═══════════════════════════════════════════════════════════╗")
      console.log("║   ✅ МИГРАЦИЯ УСПЕШНО ЗАВЕРШЕНА                          ║")
      console.log("╚═══════════════════════════════════════════════════════════╝")
      console.log()
      console.log("💡 Подсказки:")
      console.log("   • Резервные копии JSON файлов сохранены в data/backup/")
      console.log("   • Теперь можно запускать приложение с данными из SQLite")
      console.log("   • Функции миграции идемпотентны - можно запустить снова")
      console.log()
    }
  } catch (error) {
    console.error()
    console.error("╔═══════════════════════════════════════════════════════════╗")
    console.error("║   ❌ ОШИБКА МИГРАЦИИ                                     ║")
    console.error("╚═══════════════════════════════════════════════════════════╝")
    console.error()
    console.error("Детали ошибки:")
    console.error(error)
    console.error()
    console.error("💡 Возможные решения:")
    console.error("   1. Проверьте, что файлы JSON существуют в папке data/")
    console.error("   2. Проверьте формат данных в JSON файлах")
    console.error("   3. Убедитесь, что база данных доступна для записи")
    console.error("   4. Проверьте логи выше для деталей")
    console.error()
    process.exit(1)
  }

  // Закрываем соединение с БД
  const { db } = require("./db")
  db.close((err) => {
    if (err) {
      console.error("[v0] ❌ Ошибка закрытия БД:", err.message)
    } else {
      console.log("[v0] 👋 Соединение с базой данных закрыто")
    }
    process.exit(0)
  })
}

// Обработка необработанных ошибок
process.on("unhandledRejection", (reason, promise) => {
  console.error()
  console.error("❌ Необработанная ошибка Promise:")
  console.error(reason)
  process.exit(1)
})

process.on("uncaughtException", (error) => {
  console.error()
  console.error("❌ Необработанное исключение:")
  console.error(error)
  process.exit(1)
})

// Запуск
main()
