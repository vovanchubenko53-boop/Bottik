#!/bin/bash

# 🚀 Быстрый скрипт развертывания U-hub на Ubuntu 24.04
# Использование: sudo ./deploy-quick.sh

set -e

echo "============================================"
echo "  U-hub - Автоматическое развертывание"
echo "============================================"
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Пожалуйста, запустите скрипт с sudo${NC}"
    exit 1
fi

# Переменные
APP_DIR="/var/www/uhub"
APP_USER="uhub"
NODE_VERSION="20"

echo -e "${GREEN}Шаг 1: Обновление системы${NC}"
apt update && apt upgrade -y
apt install -y curl wget git ufw

echo -e "${GREEN}Шаг 2: Создание пользователя приложения${NC}"
if id "$APP_USER" &>/dev/null; then
    echo "Пользователь $APP_USER уже существует"
else
    adduser --disabled-password --gecos "" $APP_USER
    echo -e "${GREEN}Пользователь $APP_USER создан${NC}"
fi

echo -e "${GREEN}Шаг 3: Установка Node.js $NODE_VERSION${NC}"
if command -v node &> /dev/null; then
    echo "Node.js уже установлен: $(node -v)"
else
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
    echo -e "${GREEN}Node.js установлен: $(node -v)${NC}"
fi

echo -e "${GREEN}Шаг 4: Создание директорий приложения${NC}"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/uploads/videos
mkdir -p $APP_DIR/uploads/photos
mkdir -p $APP_DIR/data/schedules
mkdir -p $APP_DIR/logs

# Создание JSON файлов
echo '[]' > $APP_DIR/data/events.json
echo '[]' > $APP_DIR/data/videos.json
echo '[]' > $APP_DIR/data/photos.json

chown -R $APP_USER:$APP_USER $APP_DIR

echo -e "${YELLOW}ВНИМАНИЕ: Загрузите файлы проекта в $APP_DIR${NC}"
echo -e "${YELLOW}Используйте: scp, git clone, или SFTP${NC}"
read -p "Нажмите Enter когда файлы будут загружены..."

echo -e "${GREEN}Шаг 5: Установка зависимостей${NC}"
cd $APP_DIR
sudo -u $APP_USER npm install --production

echo -e "${GREEN}Шаг 6: Установка PM2${NC}"
npm install -g pm2

echo -e "${GREEN}Шаг 7: Создание файла .env${NC}"
if [ ! -f "$APP_DIR/.env" ]; then
    cat > $APP_DIR/.env << EOF
NODE_ENV=production
PORT=5000
TELEGRAM_BOT_TOKEN=your_token_here
SESSION_SECRET=$(openssl rand -hex 32)
EOF
    chmod 600 $APP_DIR/.env
    chown $APP_USER:$APP_USER $APP_DIR/.env
    echo -e "${YELLOW}ВАЖНО: Отредактируйте $APP_DIR/.env и добавьте TELEGRAM_BOT_TOKEN${NC}"
fi

echo -e "${GREEN}Шаг 8: Создание PM2 конфигурации${NC}"
cat > $APP_DIR/ecosystem.config.js << 'EOF'
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
EOF
chown $APP_USER:$APP_USER $APP_DIR/ecosystem.config.js

echo -e "${GREEN}Шаг 9: Запуск приложения через PM2${NC}"
cd $APP_DIR
sudo -u $APP_USER pm2 start ecosystem.config.js --env production
sudo -u $APP_USER pm2 save

# Настройка автозапуска PM2
env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp /home/$APP_USER

echo -e "${GREEN}Шаг 10: Установка Nginx${NC}"
apt install nginx -y

echo -e "${GREEN}Шаг 11: Настройка Nginx${NC}"
read -p "Введите доменное имя (или нажмите Enter для использования IP): " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    SERVER_NAME="_"
else
    SERVER_NAME="$DOMAIN_NAME www.$DOMAIN_NAME"
fi

cat > /etc/nginx/sites-available/uhub << EOF
server {
    listen 80;
    server_name $SERVER_NAME;

    client_max_body_size 100M;

    access_log /var/log/nginx/uhub-access.log;
    error_log /var/log/nginx/uhub-error.log;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
EOF

# Включение сайта
ln -sf /etc/nginx/sites-available/uhub /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Проверка конфигурации
nginx -t

# Перезапуск Nginx
systemctl restart nginx
systemctl enable nginx

echo -e "${GREEN}Шаг 12: Настройка Firewall${NC}"
ufw allow 'Nginx Full'
ufw allow 'OpenSSH'
ufw --force enable

echo ""
echo "============================================"
echo -e "${GREEN}  ✅ Установка завершена!${NC}"
echo "============================================"
echo ""
echo -e "Статус PM2: ${GREEN}pm2 status${NC}"
sudo -u $APP_USER pm2 status
echo ""
echo -e "${YELLOW}Следующие шаги:${NC}"
echo "1. Отредактируйте .env файл: nano $APP_DIR/.env"
echo "2. Добавьте TELEGRAM_BOT_TOKEN"
echo "3. Перезапустите приложение: pm2 restart uhub"
echo "4. Загрузите Excel расписания в: $APP_DIR/data/schedules/"
echo ""
if [ -n "$DOMAIN_NAME" ]; then
    echo -e "5. Установите SSL: ${GREEN}sudo certbot --nginx -d $DOMAIN_NAME${NC}"
    echo ""
    echo -e "Ваше приложение доступно по адресу: ${GREEN}http://$DOMAIN_NAME${NC}"
else
    SERVER_IP=$(hostname -I | awk '{print $1}')
    echo -e "Ваше приложение доступно по адресу: ${GREEN}http://$SERVER_IP${NC}"
fi
echo ""
echo -e "${YELLOW}Полезные команды:${NC}"
echo "- Логи приложения: pm2 logs uhub"
echo "- Перезапуск: pm2 restart uhub"
echo "- Статус Nginx: systemctl status nginx"
echo "- Логи Nginx: tail -f /var/log/nginx/uhub-error.log"
echo ""
