# 🚀 Инструкция по развертыванию U-hub на Ubuntu 24.04

## Предварительные требования

- Сервер с Ubuntu 24.04
- Пользователь с sudo правами
- Доменное имя (опционально, для SSL)

---

## Шаг 1: Подготовка сервера

### 1.1 Обновление системы
```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl wget git ufw
```

### 1.2 Создание пользователя для приложения (опционально)
```bash
# Создать пользователя uhub
sudo adduser uhub
sudo usermod -aG sudo uhub

# Переключиться на нового пользователя
su - uhub
```

---

## Шаг 2: Установка Node.js 20

### 2.1 Добавить официальный репозиторий NodeSource
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```

### 2.2 Установить Node.js и npm
```bash
sudo apt install -y nodejs
```

### 2.3 Проверить установку
```bash
node -v   # Должно показать v20.x.x
npm -v    # Должно показать v10.x.x
```

---

## Шаг 3: Загрузка проекта

### 3.1 Создать директорию для приложения
```bash
sudo mkdir -p /var/www/uhub
sudo chown -R $USER:$USER /var/www/uhub
cd /var/www/uhub
```

### 3.2 Загрузить файлы проекта

**Вариант A: Из Replit (скачать ZIP)**
1. В Replit нажмите на три точки возле файлов
2. Нажмите "Download as ZIP"
3. Загрузите на сервер:
```bash
# На вашем компьютере
scp uhub.zip user@your_server_ip:/var/www/uhub/

# На сервере
cd /var/www/uhub
unzip uhub.zip
rm uhub.zip
```

**Вариант B: Через Git (если используете)**
```bash
cd /var/www/uhub
git clone https://github.com/ваш_репозиторий/uhub.git .
```

**Вариант C: Вручную через SFTP**
Используйте FileZilla или WinSCP для загрузки файлов

---

## Шаг 4: Установка зависимостей проекта

```bash
cd /var/www/uhub
npm install --production
```

---

## Шаг 5: Настройка переменных окружения

### 5.1 Создать файл .env
```bash
nano /var/www/uhub/.env
```

### 5.2 Добавить переменные
```env
# Основные настройки
NODE_ENV=production
PORT=5000

# Telegram Bot
TELEGRAM_BOT_TOKEN=ваш_токен_от_botfather

# Секретный ключ для сессий
SESSION_SECRET=случайная_строка_минимум_32_символа

# TikTok API (если получили доступ)
TIKTOK_CLIENT_KEY=ваш_client_key
TIKTOK_CLIENT_SECRET=ваш_client_secret

# База данных (если будете использовать)
# DATABASE_URL=postgresql://user:password@localhost:5432/uhub
```

**Сохранить:** `Ctrl+O`, затем `Enter`, затем `Ctrl+X`

---

## Шаг 6: Создание необходимых директорий

```bash
cd /var/www/uhub

# Создать директории для загрузок
mkdir -p uploads/videos
mkdir -p uploads/photos
mkdir -p data/schedules

# Создать JSON базы данных
echo '[]' > data/events.json
echo '[]' > data/videos.json
echo '[]' > data/photos.json

# Установить права доступа
chmod -R 755 uploads
chmod -R 755 data
```

---

## Шаг 7: Установка и настройка PM2

### 7.1 Установить PM2 глобально
```bash
sudo npm install -g pm2
```

### 7.2 Создать конфигурационный файл PM2
```bash
nano /var/www/uhub/ecosystem.config.js
```

Вставить следующий код:
```javascript
module.exports = {
  apps: [{
    name: 'uhub',
    script: './server.js',
    instances: 2,
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '500M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### 7.3 Создать директорию для логов
```bash
mkdir -p /var/www/uhub/logs
```

### 7.4 Запустить приложение через PM2
```bash
cd /var/www/uhub
pm2 start ecosystem.config.js --env production
```

### 7.5 Проверить статус
```bash
pm2 status
pm2 logs uhub
```

### 7.6 Настроить автозапуск при перезагрузке
```bash
pm2 startup systemd
# Выполнить команду, которую PM2 выведет (с sudo)

pm2 save
```

---

## Шаг 8: Установка и настройка Nginx

### 8.1 Установить Nginx
```bash
sudo apt install nginx -y
```

### 8.2 Создать конфигурацию для U-hub
```bash
sudo nano /etc/nginx/sites-available/uhub
```

### 8.3 Базовая конфигурация (без SSL)
```nginx
server {
    listen 80;
    server_name ваш_домен.com www.ваш_домен.com;
    # Или используйте IP: server_name 123.456.789.0;

    client_max_body_size 100M;

    # Логи
    access_log /var/log/nginx/uhub-access.log;
    error_log /var/log/nginx/uhub-error.log;

    # Проксирование к Node.js приложению
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты для загрузки больших файлов
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }

    # Статические файлы (опционально)
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        proxy_pass http://localhost:5000;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 8.4 Включить сайт
```bash
# Создать символическую ссылку
sudo ln -s /etc/nginx/sites-available/uhub /etc/nginx/sites-enabled/

# Проверить конфигурацию
sudo nginx -t

# Перезапустить Nginx
sudo systemctl restart nginx
```

### 8.5 Настроить firewall
```bash
# Разрешить Nginx в firewall
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable
sudo ufw status
```

---

## Шаг 9: Установка SSL сертификата (HTTPS)

### 9.1 Установить Certbot
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 9.2 Получить SSL сертификат
```bash
sudo certbot --nginx -d ваш_домен.com -d www.ваш_домен.com
```

Certbot автоматически настроит HTTPS в Nginx!

### 9.3 Проверить автоматическое обновление
```bash
sudo certbot renew --dry-run
```

---

## Шаг 10: Проверка работы приложения

### 10.1 Проверить статус всех сервисов
```bash
# Проверить PM2
pm2 status

# Проверить Nginx
sudo systemctl status nginx

# Проверить логи
pm2 logs uhub --lines 50
sudo tail -f /var/log/nginx/uhub-access.log
```

### 10.2 Протестировать через браузер
```
http://ваш_домен.com
или
http://ваш_ip_адрес
```

---

## Шаг 11: Загрузка расписаний (Excel файлы)

### 11.1 Загрузить Excel файлы на сервер
```bash
# Через SCP с вашего компьютера
scp schedule.xlsx user@your_server:/var/www/uhub/data/schedules/

# Или через SFTP (FileZilla, WinSCP)
```

### 11.2 Формат названия файлов
```
КОД_КУРС_НАЗВАНИЕ.xlsx
Примеры:
- C1_1_IIMV_Mizhnarodni_komunikatsii.xlsx
- PI2_2_FIT_Prohramna_inzheneriia.xlsx
```

### 11.3 Перезапустить приложение
```bash
pm2 restart uhub
```

---

## 📋 Полезные команды PM2

```bash
# Управление процессами
pm2 list                    # Список всех процессов
pm2 restart uhub           # Перезапустить приложение
pm2 stop uhub              # Остановить приложение
pm2 start uhub             # Запустить приложение
pm2 delete uhub            # Удалить из PM2

# Мониторинг
pm2 monit                  # Реал-тайм мониторинг
pm2 logs uhub              # Просмотр логов
pm2 logs uhub --lines 100  # Последние 100 строк
pm2 logs uhub --err        # Только ошибки

# Обновление приложения
cd /var/www/uhub
git pull                   # Если используете Git
pm2 restart uhub --update-env

# Сброс логов
pm2 flush
```

---

## 🔧 Обновление приложения

```bash
# 1. Остановить приложение
pm2 stop uhub

# 2. Создать резервную копию
cd /var/www
sudo tar -czf uhub-backup-$(date +%Y%m%d).tar.gz uhub/

# 3. Обновить код
cd /var/www/uhub
git pull  # или загрузить новые файлы

# 4. Обновить зависимости
npm install --production

# 5. Запустить приложение
pm2 start uhub

# 6. Проверить логи
pm2 logs uhub
```

---

## 🛠️ Решение проблем

### Приложение не запускается
```bash
# Проверить логи PM2
pm2 logs uhub --err

# Проверить права доступа
ls -la /var/www/uhub
sudo chown -R $USER:$USER /var/www/uhub

# Проверить переменные окружения
pm2 env uhub
```

### Ошибка подключения к Nginx
```bash
# Проверить статус Nginx
sudo systemctl status nginx

# Проверить логи Nginx
sudo tail -f /var/log/nginx/uhub-error.log

# Перезапустить Nginx
sudo systemctl restart nginx
```

### Большие видео не загружаются
```bash
# Увеличить лимиты в Nginx
sudo nano /etc/nginx/sites-available/uhub
# Добавить: client_max_body_size 100M;

sudo nginx -t
sudo systemctl reload nginx
```

---

## 📊 Мониторинг производительности

### Установить htop для мониторинга системы
```bash
sudo apt install htop -y
htop
```

### PM2 monitoring (в реальном времени)
```bash
pm2 monit
```

### Проверить использование диска
```bash
df -h
du -sh /var/www/uhub/uploads/*
```

---

## 🔐 Безопасность

### Изменить права доступа
```bash
cd /var/www/uhub
chmod 600 .env                    # Защитить переменные окружения
chmod -R 755 public              # Публичные файлы
chmod -R 700 data                # Данные приложения
```

### Настроить fail2ban (защита от брутфорса)
```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Регулярные обновления системы
```bash
# Автоматические обновления безопасности
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## ✅ Чек-лист развертывания

- [ ] Сервер обновлен (apt update && apt upgrade)
- [ ] Node.js 20 установлен
- [ ] Файлы проекта загружены в /var/www/uhub
- [ ] npm install выполнен
- [ ] Файл .env создан с корректными данными
- [ ] Директории uploads/ и data/ созданы
- [ ] PM2 установлен и приложение запущено
- [ ] PM2 настроен на автозапуск
- [ ] Nginx установлен и настроен
- [ ] Firewall настроен (UFW)
- [ ] SSL сертификат установлен (опционально)
- [ ] Приложение доступно через браузер
- [ ] Telegram Bot интегрирован
- [ ] Excel расписания загружены

---

## 🚀 Быстрый скрипт установки

Сохраните этот скрипт как `deploy.sh` и выполните:

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 📞 Поддержка

Если возникнут проблемы:
1. Проверьте логи: `pm2 logs uhub`
2. Проверьте статус: `pm2 status`
3. Проверьте Nginx: `sudo systemctl status nginx`
4. Проверьте порт: `sudo netstat -tulpn | grep 5000`

---

**Готово!** Ваш U-hub теперь работает на Ubuntu 24.04 в production режиме! 🎉
