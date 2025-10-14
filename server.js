const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const ExcelJS = require('exceljs');
const newsParser = require('./parsers/newsParser');
const scheduleParser = require('./parsers/scheduleParser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const videoStorage = multer.diskStorage({
    destination: './uploads/videos',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const photoStorage = multer.diskStorage({
    destination: './uploads/photos',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const heroImageStorage = multer.diskStorage({
    destination: './uploads/hero-images',
    filename: (req, file, cb) => {
        cb(null, 'hero-' + Date.now() + '-' + file.originalname);
    }
});

const scheduleStorage = multer.diskStorage({
    destination: './uploads/schedules',
    filename: (req, file, cb) => {
        cb(null, 'schedule-' + Date.now() + '-' + file.originalname);
    }
});

const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 100 * 1024 * 1024 } });
const uploadPhoto = multer({ storage: photoStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadHeroImage = multer({ storage: heroImageStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadSchedule = multer({ storage: scheduleStorage, limits: { fileSize: 5 * 1024 * 1024 } });

let newsCache = [];
let eventsData = [];
let schedulesData = [];
let videosData = [];
let photosData = [];
let eventMessages = {};
let eventParticipants = {};
let botUsers = [];
let adminSettings = {
    heroImages: {
        news: 'https://placehold.co/600x300/a3e635/444?text=News',
        schedule: 'https://placehold.co/600x300/60a5fa/FFF?text=Schedule',
        video: 'https://placehold.co/600x300/f87171/FFF?text=Video',
        events: 'https://placehold.co/600x300/c084fc/FFF?text=Events'
    }
};
const ADMIN_PASSWORD = '1234';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let bot = null;

if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        console.log('Telegram bot initialized');
        
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const user = msg.from;
            
            if (!botUsers.find(u => u.chatId === chatId)) {
                botUsers.push({
                    chatId,
                    firstName: user.first_name,
                    username: user.username,
                    joinedAt: new Date().toISOString()
                });
                saveBotUsers();
            }
            
            bot.sendMessage(chatId, 'Вітаємо в U-hub Bot! Тут ви отримаєте сповіщення про відео та події.');
        });
        
        bot.on('callback_query', async (query) => {
            const data = JSON.parse(query.data);
            
            if (data.type === 'video_mod') {
                const video = videosData.find(v => v.id === data.videoId);
                if (video) {
                    if (data.action === 'approve') {
                        video.status = 'approved';
                        video.approvedAt = new Date().toISOString();
                        bot.editMessageText(`✅ Відео схвалено`, {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id
                        });
                    } else if (data.action === 'reject') {
                        video.status = 'rejected';
                        video.rejectedAt = new Date().toISOString();
                        bot.editMessageText(`❌ Відео відхилено`, {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id
                        });
                    }
                    await saveData();
                }
                bot.answerCallbackQuery(query.id);
            }
        });
    } catch (error) {
        console.error('Error initializing Telegram bot:', error.message);
    }
}

async function initializeData() {
    try {
        const dataPath = path.join(__dirname, 'data');
        
        try {
            const eventsFile = await fs.readFile(path.join(dataPath, 'events.json'), 'utf-8');
            eventsData = JSON.parse(eventsFile);
        } catch (e) {
            eventsData = [
                {
                    id: '1',
                    title: 'Піцца та кава',
                    date: '28.08.2025',
                    time: '21:00',
                    location: 'кафе «Зустріч»',
                    description: 'Неформальна зустріч студентів за піцою та кавою',
                    participants: 5,
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    joined: false
                }
            ];
        }
        
        try {
            const videosFile = await fs.readFile(path.join(dataPath, 'videos.json'), 'utf-8');
            videosData = JSON.parse(videosFile);
        } catch (e) {
            videosData = [];
        }
        
        try {
            const photosFile = await fs.readFile(path.join(dataPath, 'photos.json'), 'utf-8');
            photosData = JSON.parse(photosFile);
        } catch (e) {
            photosData = [];
        }
        
        schedulesData = await scheduleParser.initializeSchedules(dataPath);
        
        await loadBotUsers();
        await loadAdminSettings();
        
    } catch (error) {
        console.error('Error initializing data:', error);
    }
}

async function saveData() {
    try {
        const dataPath = path.join(__dirname, 'data');
        await fs.writeFile(path.join(dataPath, 'events.json'), JSON.stringify(eventsData, null, 2));
        await fs.writeFile(path.join(dataPath, 'videos.json'), JSON.stringify(videosData, null, 2));
        await fs.writeFile(path.join(dataPath, 'photos.json'), JSON.stringify(photosData, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

async function saveBotUsers() {
    try {
        const dataPath = path.join(__dirname, 'data');
        await fs.mkdir(dataPath, { recursive: true });
        await fs.writeFile(path.join(dataPath, 'botUsers.json'), JSON.stringify(botUsers, null, 2));
    } catch (error) {
        console.error('Error saving bot users:', error);
    }
}

async function loadBotUsers() {
    try {
        const dataPath = path.join(__dirname, 'data');
        const botUsersFile = await fs.readFile(path.join(dataPath, 'botUsers.json'), 'utf-8');
        botUsers = JSON.parse(botUsersFile);
    } catch (e) {
        botUsers = [];
    }
}

async function saveAdminSettings() {
    try {
        const dataPath = path.join(__dirname, 'data');
        await fs.mkdir(dataPath, { recursive: true });
        await fs.writeFile(path.join(dataPath, 'adminSettings.json'), JSON.stringify(adminSettings, null, 2));
    } catch (error) {
        console.error('Error saving admin settings:', error);
    }
}

async function loadAdminSettings() {
    try {
        const dataPath = path.join(__dirname, 'data');
        const settingsFile = await fs.readFile(path.join(dataPath, 'adminSettings.json'), 'utf-8');
        adminSettings = JSON.parse(settingsFile);
    } catch (e) {
        adminSettings = {
            heroImages: {
                news: 'https://placehold.co/600x300/a3e635/444?text=News',
                schedule: 'https://placehold.co/600x300/60a5fa/FFF?text=Schedule',
                video: 'https://placehold.co/600x300/f87171/FFF?text=Video',
                events: 'https://placehold.co/600x300/c084fc/FFF?text=Events'
            }
        };
    }
}

async function updateNewsCache() {
    try {
        newsCache = await newsParser.getAllNews();
        console.log(`News cache updated: ${newsCache.length} articles`);
    } catch (error) {
        console.error('Error updating news cache:', error);
    }
}

app.get('/api/news', async (req, res) => {
    try {
        if (newsCache.length === 0) {
            await updateNewsCache();
        }
        res.json(newsCache);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

app.get('/api/schedules/search', async (req, res) => {
    try {
        const { course, query } = req.query;
        
        const results = await scheduleParser.searchSchedules(query, course);
        res.json(results);
    } catch (error) {
        console.error('Error searching schedules:', error);
        res.status(500).json({ error: 'Failed to search schedules' });
    }
});

app.get('/api/events', (req, res) => {
    res.json(eventsData);
});

app.get('/api/events/:id', (req, res) => {
    const event = eventsData.find(e => e.id === req.params.id);
    if (event) {
        res.json(event);
    } else {
        res.status(404).json({ error: 'Event not found' });
    }
});

app.post('/api/events', async (req, res) => {
    try {
        const { title, date, time, location, description, duration } = req.body;
        
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
            joined: false
        };
        
        eventsData.push(newEvent);
        eventMessages[newEvent.id] = [];
        await saveData();
        
        res.json(newEvent);
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

app.post('/api/events/:id/join', async (req, res) => {
    try {
        const { userId, firstName, photoUrl } = req.body;
        const event = eventsData.find(e => e.id === req.params.id);
        
        if (event) {
            if (!eventParticipants[event.id]) {
                eventParticipants[event.id] = [];
            }
            
            if (!eventParticipants[event.id].find(p => p.userId === userId)) {
                eventParticipants[event.id].push({ userId, firstName, photoUrl, joinedAt: new Date().toISOString() });
                event.participants = eventParticipants[event.id].length;
                await saveData();
            }
            
            res.json({ success: true, participants: event.participants, joined: true });
        } else {
            res.status(404).json({ error: 'Event not found' });
        }
    } catch (error) {
        console.error('Error joining event:', error);
        res.status(500).json({ error: 'Failed to join event' });
    }
});

app.post('/api/events/:id/leave', async (req, res) => {
    try {
        const { userId } = req.body;
        const event = eventsData.find(e => e.id === req.params.id);
        
        if (event) {
            if (eventParticipants[event.id]) {
                eventParticipants[event.id] = eventParticipants[event.id].filter(p => p.userId !== userId);
                event.participants = eventParticipants[event.id].length;
                await saveData();
            }
            
            res.json({ success: true, participants: event.participants, joined: false });
        } else {
            res.status(404).json({ error: 'Event not found' });
        }
    } catch (error) {
        console.error('Error leaving event:', error);
        res.status(500).json({ error: 'Failed to leave event' });
    }
});

app.get('/api/events/:id/joined', (req, res) => {
    const { userId } = req.query;
    const event = eventsData.find(e => e.id === req.params.id);
    
    if (event && eventParticipants[event.id]) {
        const isJoined = eventParticipants[event.id].some(p => p.userId === userId);
        res.json({ joined: isJoined, participants: event.participants });
    } else {
        res.json({ joined: false, participants: event?.participants || 0 });
    }
});

app.post('/api/events/:id/messages', (req, res) => {
    const { message, userId, firstName, photoUrl } = req.body;
    const eventId = req.params.id;
    
    if (!eventMessages[eventId]) {
        eventMessages[eventId] = [];
    }
    
    const newMessage = {
        id: Date.now().toString(),
        text: message,
        timestamp: new Date().toISOString(),
        sender: 'user',
        userId,
        firstName,
        photoUrl
    };
    
    eventMessages[eventId].push(newMessage);
    res.json(newMessage);
});

app.get('/api/events/:id/messages', (req, res) => {
    const eventId = req.params.id;
    res.json(eventMessages[eventId] || []);
});

const thumbnailStorage = multer.diskStorage({
    destination: './uploads/thumbnails',
    filename: (req, file, cb) => {
        cb(null, 'thumb-' + Date.now() + '.jpg');
    }
});
const uploadVideoWithThumbnail = multer({
    storage: videoStorage,
    limits: { fileSize: 100 * 1024 * 1024 }
}).fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]);

app.post('/api/videos/upload', uploadVideoWithThumbnail, async (req, res) => {
    try {
        if (!req.files || !req.files.video) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }
        
        const videoFile = req.files.video[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;
        
        let thumbnailPath = null;
        if (thumbnailFile) {
            const thumbnailFilename = 'thumb-' + Date.now() + '.jpg';
            const thumbnailDestPath = path.join(__dirname, 'uploads/thumbnails', thumbnailFilename);
            await fs.mkdir(path.join(__dirname, 'uploads/thumbnails'), { recursive: true });
            await fs.rename(thumbnailFile.path, thumbnailDestPath);
            thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;
        }
        
        const videoData = {
            id: Date.now().toString(),
            filename: videoFile.filename,
            originalName: videoFile.originalname,
            path: `/uploads/videos/${videoFile.filename}`,
            thumbnailPath: thumbnailPath,
            uploadedAt: new Date().toISOString(),
            status: 'pending',
            size: videoFile.size
        };
        
        videosData.push(videoData);
        await saveData();
        
        if (bot && botUsers.length > 0) {
            const adminUsers = botUsers.slice(0, 1);
            for (const admin of adminUsers) {
                try {
                    await bot.sendMessage(admin.chatId, `🎥 Нове відео на модерацію:\n\n📝 Назва: ${videoData.originalName}\n📅 Дата: ${new Date(videoData.uploadedAt).toLocaleString('uk-UA')}\n💾 Розмір: ${(videoData.size / 1024 / 1024).toFixed(2)} MB`, {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ Підтвердити', callback_data: JSON.stringify({ type: 'video_mod', videoId: videoData.id, action: 'approve' }) },
                                { text: '❌ Відхилити', callback_data: JSON.stringify({ type: 'video_mod', videoId: videoData.id, action: 'reject' }) }
                            ]]
                        }
                    });
                } catch (error) {
                    console.error('Error sending video notification to bot:', error.message);
                }
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Ваше відео відправлено на модерацію. Очікуйте на розгляд.',
            video: videoData
        });
    } catch (error) {
        console.error('Error uploading video:', error);
        res.status(500).json({ error: 'Failed to upload video' });
    }
});

app.get('/api/videos/pending', (req, res) => {
    const pendingVideos = videosData.filter(v => v.status === 'pending');
    res.json(pendingVideos);
});

app.get('/api/videos/approved', (req, res) => {
    const approvedVideos = videosData
        .filter(v => v.status === 'approved')
        .sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt))
        .slice(0, 3);
    res.json(approvedVideos);
});

app.post('/api/videos/:id/moderate', async (req, res) => {
    try {
        const { action } = req.body;
        const video = videosData.find(v => v.id === req.params.id);
        
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        if (action === 'approve') {
            video.status = 'approved';
            video.approvedAt = new Date().toISOString();
            res.json({ success: true, message: 'Відео схвалено' });
        } else if (action === 'reject') {
            video.status = 'rejected';
            video.rejectedAt = new Date().toISOString();
            res.json({ success: true, message: 'Відео відхилено' });
        }
        
        await saveData();
    } catch (error) {
        console.error('Error moderating video:', error);
        res.status(500).json({ error: 'Failed to moderate video' });
    }
});

app.post('/api/photos/upload', uploadPhoto.array('photos', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No photos uploaded' });
        }
        
        const newPhotos = req.files.map(file => ({
            id: Date.now().toString() + Math.random(),
            filename: file.filename,
            url: `/uploads/photos/${file.filename}`,
            uploadedAt: new Date().toISOString()
        }));
        
        photosData.push(...newPhotos);
        await saveData();
        
        res.json({ success: true, photos: newPhotos });
    } catch (error) {
        console.error('Error uploading photos:', error);
        res.status(500).json({ error: 'Failed to upload photos' });
    }
});

app.get('/api/photos', (req, res) => {
    res.json(photosData);
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: 'admin-authenticated' });
    } else {
        res.status(401).json({ error: 'Невірний пароль' });
    }
});

app.get('/api/admin/settings', (req, res) => {
    const { token } = req.query;
    if (token !== 'admin-authenticated') {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    res.json(adminSettings);
});

app.post('/api/admin/settings', async (req, res) => {
    const { token } = req.query;
    if (token !== 'admin-authenticated') {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    adminSettings = { ...adminSettings, ...req.body };
    await saveAdminSettings();
    res.json({ success: true, settings: adminSettings });
});

app.post('/api/admin/broadcast', async (req, res) => {
    const { token } = req.query;
    if (token !== 'admin-authenticated') {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const { message } = req.body;
    
    if (!bot) {
        return res.status(400).json({ error: 'Telegram бот не налаштований' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const user of botUsers) {
        try {
            await bot.sendMessage(user.chatId, message);
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`Failed to send to ${user.chatId}:`, error.message);
            errorCount++;
        }
    }
    
    res.json({ 
        success: true, 
        sent: successCount, 
        failed: errorCount,
        total: botUsers.length 
    });
});

app.get('/api/admin/videos/pending', (req, res) => {
    const { token } = req.query;
    if (token !== 'admin-authenticated') {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    const pendingVideos = videosData.filter(v => v.status === 'pending');
    res.json(pendingVideos);
});

app.post('/api/admin/upload-hero-images', uploadHeroImage.fields([
    { name: 'news', maxCount: 1 },
    { name: 'schedule', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'events', maxCount: 1 }
]), async (req, res) => {
    const { token } = req.query;
    if (token !== 'admin-authenticated') {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    try {
        const blocks = ['news', 'schedule', 'video', 'events'];
        
        for (const block of blocks) {
            if (req.files && req.files[block]) {
                const file = req.files[block][0];
                adminSettings.heroImages[block] = `/uploads/hero-images/${file.filename}`;
            } else if (req.body[`${block}_url`]) {
                adminSettings.heroImages[block] = req.body[`${block}_url`];
            }
        }
        
        await saveAdminSettings();
        res.json({ success: true, images: adminSettings.heroImages });
    } catch (error) {
        console.error('Error uploading hero images:', error);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

app.get('/api/settings/images', (req, res) => {
    res.json(adminSettings.heroImages);
});

async function parseExcelSchedule(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.worksheets[0];
    const schedule = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: []
    };
    
    const dayMap = {
        1: 'monday',
        2: 'tuesday',
        3: 'wednesday',
        4: 'thursday',
        5: 'friday'
    };
    
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        
        const timeCell = row.getCell(1).value;
        if (!timeCell) return;
        
        const time = String(timeCell).trim();
        
        for (let col = 2; col <= 6; col++) {
            const cell = row.getCell(col);
            const cellValue = cell.value;
            
            if (cellValue && String(cellValue).trim()) {
                const parts = String(cellValue).split('/').map(p => p.trim());
                const subject = parts[0] || '';
                const teacher = parts[1] || '';
                const room = parts[2] || '';
                
                const dayKey = dayMap[col - 1];
                if (dayKey && subject) {
                    schedule[dayKey].push({
                        time,
                        subject,
                        teacher,
                        room
                    });
                }
            }
        }
    });
    
    return schedule;
}

app.post('/api/admin/upload-schedule', uploadSchedule.single('schedule'), async (req, res) => {
    const { token } = req.query;
    if (token !== 'admin-authenticated') {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }
        
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Назва розкладу обов\'язкова' });
        }
        
        const schedule = await parseExcelSchedule(req.file.path);
        
        const newSchedule = {
            id: Date.now().toString(),
            name: name,
            schedule: schedule,
            uploadedAt: new Date().toISOString(),
            filePath: req.file.path
        };
        
        schedulesData.push(newSchedule);
        await saveData();
        
        res.json({ success: true, schedule: newSchedule });
    } catch (error) {
        console.error('Error uploading schedule:', error);
        res.status(500).json({ error: 'Помилка обробки файлу: ' + error.message });
    }
});

app.get('/api/admin/schedules', (req, res) => {
    const { token } = req.query;
    
    if (token === 'admin-authenticated') {
        res.json(schedulesData);
    } else if (token === 'public' || !token) {
        const schedulesToReturn = schedulesData.filter(s => !s.userId);
        res.json(schedulesToReturn);
    } else {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
});

app.delete('/api/admin/schedules/:id', async (req, res) => {
    const { token } = req.query;
    if (token !== 'admin-authenticated') {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    
    try {
        const scheduleIndex = schedulesData.findIndex(s => s.id === req.params.id);
        if (scheduleIndex === -1) {
            return res.status(404).json({ error: 'Розклад не знайдено' });
        }
        
        schedulesData.splice(scheduleIndex, 1);
        await saveData();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ error: 'Помилка видалення' });
    }
});

app.get('/api/schedules/user/:userId', (req, res) => {
    const userId = req.params.userId;
    const userSchedule = schedulesData.find(s => s.userId === userId);
    
    if (userSchedule) {
        res.json(userSchedule);
    } else {
        res.json(null);
    }
});

app.post('/api/schedules/user/:userId/set', async (req, res) => {
    try {
        const userId = req.params.userId;
        const { scheduleId } = req.body;
        
        const schedule = schedulesData.find(s => s.id === scheduleId);
        if (!schedule) {
            return res.status(404).json({ error: 'Розклад не знайдено' });
        }
        
        const userScheduleIndex = schedulesData.findIndex(s => s.userId === userId);
        if (userScheduleIndex !== -1) {
            schedulesData[userScheduleIndex] = { ...schedule, userId };
        } else {
            schedulesData.push({ ...schedule, userId, id: Date.now().toString() });
        }
        
        await saveData();
        res.json({ success: true, schedule: schedulesData.find(s => s.userId === userId) });
    } catch (error) {
        console.error('Error setting user schedule:', error);
        res.status(500).json({ error: 'Помилка встановлення розкладу' });
    }
});

app.delete('/api/schedules/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const userScheduleIndex = schedulesData.findIndex(s => s.userId === userId);
        
        if (userScheduleIndex !== -1) {
            schedulesData.splice(userScheduleIndex, 1);
            await saveData();
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing user schedule:', error);
        res.status(500).json({ error: 'Помилка видалення розкладу' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

initializeData().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`U-hub server running on port ${PORT}`);
        console.log(`Access the app at: http://0.0.0.0:${PORT}`);
        
        updateNewsCache();
        setInterval(updateNewsCache, 30 * 60 * 1000);
    });
});

module.exports = app;