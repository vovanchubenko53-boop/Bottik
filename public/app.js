const API_URL = window.location.origin;
let currentEvent = null;
let currentSchedule = null;
let currentNews = null;
let userSchedule = null;

function updateTime() {
    const now = new Date();
    const time = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) + ' р';
    
    document.querySelectorAll('.time').forEach(el => el.textContent = time);
    document.querySelectorAll('.date').forEach(el => el.textContent = date);
}

function goToPage(pageId, event) {
    if (event && event.stopPropagation) {
        event.stopPropagation();
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    lucide.createIcons();
    
    if (pageId === 'page-news-feed') {
        loadNews();
    } else if (pageId === 'page-events-list') {
        loadEvents();
    } else if (pageId === 'page-event-photos') {
        loadPhotos();
    }
}

async function loadNews() {
    try {
        const response = await fetch(`${API_URL}/api/news`);
        const news = await response.json();
        
        const newsListEl = document.getElementById('news-list');
        if (news.length === 0) {
            newsListEl.innerHTML = '<div class="p-4 text-center text-gray-500">Новини не знайдено</div>';
            return;
        }
        
        newsListEl.innerHTML = news.map(item => `
            <div class="p-4 cursor-pointer" onclick='viewNewsDetail(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                <p class="font-bold leading-tight">${item.title}</p>
                <p class="text-sm text-gray-500 mt-1">"${item.source}" - ${item.timeAgo}</p>
            </div>
        `).join('');
        
        if (news[0]) {
            document.getElementById('main-news-title').textContent = news[0].title;
            document.getElementById('main-news-source').textContent = `"${news[0].source}" - ${news[0].timeAgo}`;
            if (news[0].date) {
                document.getElementById('main-news-date').textContent = news[0].date;
            }
        }
    } catch (error) {
        console.error('Error loading news:', error);
        document.getElementById('news-list').innerHTML = '<div class="p-4 text-center text-red-500">Помилка завантаження новин</div>';
    }
}

function viewNewsDetail(newsItem) {
    currentNews = newsItem;
    document.getElementById('news-detail-source').textContent = newsItem.source;
    document.getElementById('news-detail-time').textContent = newsItem.timeAgo;
    document.getElementById('news-detail-title').textContent = newsItem.title;
    document.getElementById('news-detail-content').textContent = newsItem.content || newsItem.description || 'Перейдіть за посиланням для повного перегляду';
    
    if (newsItem.link) {
        document.getElementById('news-detail-link').href = newsItem.link;
        document.getElementById('news-detail-link').style.display = 'block';
    } else {
        document.getElementById('news-detail-link').style.display = 'none';
    }
    
    if (newsItem.image) {
        document.getElementById('news-detail-image').src = newsItem.image;
        document.getElementById('news-detail-image').style.display = 'block';
    } else {
        document.getElementById('news-detail-image').style.display = 'none';
    }
    
    goToPage('page-news-detail');
}

function shareNews() {
    if (currentNews && currentNews.link) {
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(currentNews.link)}&text=${encodeURIComponent(currentNews.title)}`);
        } else {
            window.open(`https://t.me/share/url?url=${encodeURIComponent(currentNews.link)}&text=${encodeURIComponent(currentNews.title)}`, '_blank');
        }
    }
}

async function searchSchedule() {
    const course = document.getElementById('schedule-course').value;
    const search = document.getElementById('schedule-search-input').value;
    
    if (!course && !search) {
        alert('Будь ласка, оберіть курс або введіть назву спеціальності');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/schedules/search?course=${course}&query=${search}`);
        const schedules = await response.json();
        
        if (schedules.length > 0) {
            currentSchedule = schedules[0];
            document.getElementById('schedule-list-title').textContent = schedules[0].name;
            goToPage('page-schedule-list');
        } else {
            alert('Розклад не знайдено');
        }
    } catch (error) {
        console.error('Error searching schedule:', error);
        alert('Помилка пошуку розкладу');
    }
}

function viewScheduleDay(day) {
    const dayNames = {
        'monday': 'Понеділок',
        'tuesday': 'Вівторок',
        'wednesday': 'Середа',
        'thursday': 'Четвер',
        'friday': 'П\'ятниця'
    };
    
    document.getElementById('schedule-detail-day').textContent = dayNames[day];
    
    if (currentSchedule && currentSchedule.schedule && currentSchedule.schedule[day]) {
        const classes = currentSchedule.schedule[day];
        document.getElementById('schedule-classes').innerHTML = classes.map(cls => `
            <div class="border-l-4 border-blue-500 pl-3">
                <div class="font-bold">${cls.time}</div>
                <div class="text-gray-700">${cls.subject}</div>
                <div class="text-sm text-gray-500">${cls.teacher || ''} ${cls.room ? '• ' + cls.room : ''}</div>
            </div>
        `).join('');
    } else {
        document.getElementById('schedule-classes').innerHTML = '<div class="text-gray-500 text-center">Занять немає</div>';
    }
    
    goToPage('page-schedule-detail');
}

function addSchedule() {
    if (currentSchedule) {
        userSchedule = currentSchedule;
        localStorage.setItem('userSchedule', JSON.stringify(currentSchedule));
        document.getElementById('main-schedule-subtitle').textContent = `• ${currentSchedule.name}`;
        document.getElementById('main-schedule-subtitle').style.display = 'block';
        alert('Розклад додано до "Мій розклад"');
    }
}

function handleScheduleClick() {
    if (userSchedule) {
        currentSchedule = userSchedule;
        document.getElementById('schedule-list-title').textContent = userSchedule.name;
        goToPage('page-schedule-list');
    } else {
        goToPage('page-schedule-search');
    }
}

async function loadEvents() {
    try {
        const response = await fetch(`${API_URL}/api/events`);
        const events = await response.json();
        
        const eventsContainer = document.getElementById('events-container');
        if (events.length === 0) {
            eventsContainer.innerHTML = '<div class="text-center text-gray-500">Подій не знайдено</div>';
            return;
        }
        
        eventsContainer.innerHTML = events.map(event => {
            const isExpired = new Date(event.expiresAt) < new Date();
            const status = isExpired ? 'Подія завершена' : event.participants + ' учасників';
            
            return `
                <div class="event-card">
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
                    <div class="text-sm text-gray-500 mb-2">${status}</div>
                    ${!isExpired ? `<button class="w-full bg-blue-500 text-white font-semibold py-2 rounded-lg" onclick="viewEventDetail('${event.id}')">Приєднатися</button>` : '<div class="text-center text-gray-400 py-2">Подія завершена</div>'}
                </div>
            `;
        }).join('');
        
        lucide.createIcons();
        
        if (events[0]) {
            document.getElementById('main-event-title').textContent = events[0].title;
        }
    } catch (error) {
        console.error('Error loading events:', error);
        document.getElementById('events-container').innerHTML = '<div class="text-center text-red-500">Помилка завантаження подій</div>';
    }
}

async function viewEventDetail(eventId) {
    try {
        const response = await fetch(`${API_URL}/api/events/${eventId}`);
        currentEvent = await response.json();
        
        document.getElementById('event-detail-title').textContent = currentEvent.title;
        document.getElementById('event-detail-date').textContent = currentEvent.date;
        document.getElementById('event-detail-time').textContent = currentEvent.time;
        document.getElementById('event-detail-location').textContent = currentEvent.location;
        document.getElementById('event-detail-description').textContent = currentEvent.description;
        document.getElementById('event-detail-participants').textContent = currentEvent.participants + ' учасників';
        
        const isJoined = currentEvent.joined;
        const joinBtn = document.getElementById('event-join-btn');
        joinBtn.textContent = isJoined ? 'Відкрити чат' : 'Приєднатися';
        joinBtn.onclick = isJoined ? () => goToPage('page-event-chat') : joinEvent;
        
        goToPage('page-event-detail');
        lucide.createIcons();
    } catch (error) {
        console.error('Error loading event:', error);
    }
}

async function joinEvent() {
    if (!currentEvent) return;
    
    try {
        const response = await fetch(`${API_URL}/api/events/${currentEvent.id}/join`, {
            method: 'POST'
        });
        
        if (response.ok) {
            currentEvent.joined = true;
            currentEvent.participants++;
            document.getElementById('event-detail-participants').textContent = currentEvent.participants + ' учасників';
            
            const joinBtn = document.getElementById('event-join-btn');
            joinBtn.textContent = 'Відкрити чат';
            joinBtn.onclick = () => goToPage('page-event-chat');
            
            document.getElementById('event-chat-title').textContent = `Чат: ${currentEvent.title}`;
            goToPage('page-event-chat');
        }
    } catch (error) {
        console.error('Error joining event:', error);
        alert('Помилка приєднання до події');
    }
}

async function createEvent() {
    const eventData = {
        title: document.getElementById('event-name').value,
        date: document.getElementById('event-date').value,
        time: document.getElementById('event-time').value,
        location: document.getElementById('event-location').value,
        description: document.getElementById('event-description').value,
        duration: parseInt(document.getElementById('event-duration').value)
    };
    
    if (!eventData.title || !eventData.date || !eventData.time || !eventData.location) {
        alert('Будь ласка, заповніть всі обов\'язкові поля');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });
        
        if (response.ok) {
            alert('Івент створено успішно!');
            document.getElementById('event-name').value = '';
            document.getElementById('event-date').value = '';
            document.getElementById('event-time').value = '';
            document.getElementById('event-location').value = '';
            document.getElementById('event-description').value = '';
            goToPage('page-events-list');
        }
    } catch (error) {
        console.error('Error creating event:', error);
        alert('Помилка створення події');
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message || !currentEvent) return;
    
    try {
        const response = await fetch(`${API_URL}/api/events/${currentEvent.id}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        
        if (response.ok) {
            const chatMessages = document.getElementById('chat-messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message own';
            messageDiv.textContent = message;
            chatMessages.appendChild(messageDiv);
            input.value = '';
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

async function uploadVideo() {
    const input = document.getElementById('video-upload');
    const file = input.files[0];
    
    if (!file) return;
    
    const formData = new FormData();
    formData.append('video', file);
    
    try {
        const response = await fetch(`${API_URL}/api/videos/upload`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        const statusDiv = document.getElementById('video-status');
        statusDiv.className = 'bg-white rounded-xl shadow-sm p-4';
        statusDiv.innerHTML = `
            <p class="text-green-600 font-semibold mb-2">Відео завантажено!</p>
            <p class="text-sm text-gray-600">${result.message}</p>
        `;
        statusDiv.classList.remove('hidden');
        
        input.value = '';
    } catch (error) {
        console.error('Error uploading video:', error);
        alert('Помилка завантаження відео');
    }
}

async function uploadPhotos() {
    const input = document.getElementById('photo-upload');
    const files = input.files;
    
    if (!files.length) return;
    
    const formData = new FormData();
    for (let file of files) {
        formData.append('photos', file);
    }
    
    try {
        const response = await fetch(`${API_URL}/api/photos/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            alert('Фото завантажено успішно!');
            loadPhotos();
            input.value = '';
        }
    } catch (error) {
        console.error('Error uploading photos:', error);
        alert('Помилка завантаження фото');
    }
}

async function loadPhotos() {
    try {
        const response = await fetch(`${API_URL}/api/photos`);
        const photos = await response.json();
        
        const grid = document.getElementById('photos-grid');
        if (photos.length === 0) {
            grid.innerHTML = '<div class="col-span-3 text-center text-gray-500">Фото не знайдено</div>';
            return;
        }
        
        grid.innerHTML = photos.map(photo => `
            <img src="${API_URL}${photo.url}" class="w-full h-24 object-cover rounded-md" alt="Event photo">
        `).join('');
    } catch (error) {
        console.error('Error loading photos:', error);
    }
}

updateTime();
setInterval(updateTime, 1000);

const savedSchedule = localStorage.getItem('userSchedule');
if (savedSchedule) {
    userSchedule = JSON.parse(savedSchedule);
    document.getElementById('main-schedule-subtitle').textContent = `• ${userSchedule.name}`;
    document.getElementById('main-schedule-subtitle').style.display = 'block';
}

loadNews();
loadEvents();

if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
}

lucide.createIcons();