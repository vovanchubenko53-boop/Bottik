const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
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

const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 100 * 1024 * 1024 } });
const uploadPhoto = multer({ storage: photoStorage, limits: { fileSize: 10 * 1024 * 1024 } });

let newsCache = [];
let eventsData = [];
let schedulesData = [];
let videosData = [];
let photosData = [];
let eventMessages = {};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let bot = null;

if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        console.log('Telegram bot initialized');
        
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, 'Вітаємо в U-hub Bot! Тут ви отримаєте сповіщення про відео та події.');
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
        const event = eventsData.find(e => e.id === req.params.id);
        if (event) {
            event.participants++;
            event.joined = true;
            await saveData();
            res.json({ success: true, participants: event.participants });
        } else {
            res.status(404).json({ error: 'Event not found' });
        }
    } catch (error) {
        console.error('Error joining event:', error);
        res.status(500).json({ error: 'Failed to join event' });
    }
});

app.post('/api/events/:id/messages', (req, res) => {
    const { message } = req.body;
    const eventId = req.params.id;
    
    if (!eventMessages[eventId]) {
        eventMessages[eventId] = [];
    }
    
    const newMessage = {
        id: Date.now().toString(),
        text: message,
        timestamp: new Date().toISOString(),
        sender: 'user'
    };
    
    eventMessages[eventId].push(newMessage);
    res.json(newMessage);
});

app.get('/api/events/:id/messages', (req, res) => {
    const eventId = req.params.id;
    res.json(eventMessages[eventId] || []);
});

app.post('/api/videos/upload', uploadVideo.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }
        
        const videoData = {
            id: Date.now().toString(),
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: `/uploads/videos/${req.file.filename}`,
            uploadedAt: new Date().toISOString(),
            status: 'pending',
            size: req.file.size
        };
        
        videosData.push(videoData);
        await saveData();
        
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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