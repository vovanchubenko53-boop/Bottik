const axios = require('axios');
const cheerio = require('cheerio');

const NEWS_SOURCES = [
    {
        name: 'KNU Конкурси',
        url: 'https://international.knu.ua/category/konkursy/',
        type: 'website',
        parser: parseKNUInternational
    },
    {
        name: 'KNU Календар',
        url: 'https://knu.ua/ua/knu-callendar',
        type: 'website',
        parser: parseKNUCalendar
    },
    {
        name: 'KNU Новини',
        url: 'https://knu.ua/ua/',
        type: 'website',
        parser: parseKNUNews
    },
    {
        name: 'IIR Student Council',
        channel: '@iir_student_council',
        type: 'telegram'
    },
    {
        name: 'SPU KNU',
        channel: '@spu_knu',
        type: 'telegram'
    },
    {
        name: 'SRS KNU',
        channel: '@srs_knu',
        type: 'telegram'
    }
];

async function parseKNUInternational() {
    try {
        const response = await axios.get('https://international.knu.ua/category/konkursy/', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const articles = [];
        
        $('.post').each((i, elem) => {
            if (i >= 5) return false;
            
            const title = $(elem).find('.entry-title a').text().trim();
            const link = $(elem).find('.entry-title a').attr('href');
            const dateText = $(elem).find('.posted-on time').attr('datetime');
            const excerpt = $(elem).find('.entry-summary p').text().trim();
            
            if (title && link) {
                articles.push({
                    title,
                    link,
                    source: 'KNU Конкурси',
                    description: excerpt || '',
                    date: formatDate(dateText),
                    timeAgo: getTimeAgo(dateText),
                    content: excerpt
                });
            }
        });
        
        return articles;
    } catch (error) {
        console.error('Error parsing KNU International:', error.message);
        return [];
    }
}

async function parseKNUCalendar() {
    try {
        const response = await axios.get('https://knu.ua/ua/knu-callendar', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const articles = [];
        
        $('.event-item, .calendar-event').each((i, elem) => {
            if (i >= 3) return false;
            
            const title = $(elem).find('h3, .event-title').text().trim() || 
                         $(elem).find('a').first().text().trim();
            const link = $(elem).find('a').attr('href');
            const description = $(elem).find('.event-description, p').text().trim();
            
            if (title) {
                articles.push({
                    title,
                    link: link ? (link.startsWith('http') ? link : 'https://knu.ua' + link) : 'https://knu.ua/ua/knu-callendar',
                    source: 'KNU Календар',
                    description: description || '',
                    date: formatDate(new Date()),
                    timeAgo: 'сьогодні',
                    content: description
                });
            }
        });
        
        return articles;
    } catch (error) {
        console.error('Error parsing KNU Calendar:', error.message);
        return [];
    }
}

async function parseKNUNews() {
    try {
        const response = await axios.get('https://knu.ua/ua/', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const articles = [];
        
        $('.news-item, article, .post-item').each((i, elem) => {
            if (i >= 5) return false;
            
            const title = $(elem).find('h2, h3, .news-title, .post-title').text().trim() ||
                         $(elem).find('a').first().text().trim();
            const link = $(elem).find('a').attr('href');
            const description = $(elem).find('.news-description, .excerpt, p').first().text().trim();
            const dateText = $(elem).find('.date, time, .post-date').text().trim();
            
            if (title && title.length > 10) {
                articles.push({
                    title,
                    link: link ? (link.startsWith('http') ? link : 'https://knu.ua' + link) : 'https://knu.ua/ua/',
                    source: 'KNU Новини',
                    description: description || '',
                    date: formatDate(dateText || new Date()),
                    timeAgo: getTimeAgo(dateText),
                    content: description
                });
            }
        });
        
        return articles;
    } catch (error) {
        console.error('Error parsing KNU News:', error.message);
        return [];
    }
}

async function parseTelegramChannel(channelName) {
    try {
        const url = `https://t.me/s/${channelName.replace('@', '')}`;
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const articles = [];
        
        $('.tgme_widget_message').each((i, elem) => {
            if (i >= 3) return false;
            
            const messageText = $(elem).find('.tgme_widget_message_text').text().trim();
            const link = $(elem).find('.tgme_widget_message_date').attr('href');
            const dateText = $(elem).find('.tgme_widget_message_date time').attr('datetime');
            
            if (messageText && messageText.length > 20) {
                const title = messageText.substring(0, 100) + (messageText.length > 100 ? '...' : '');
                articles.push({
                    title,
                    link: link || url,
                    source: channelName,
                    description: messageText,
                    date: formatDate(dateText),
                    timeAgo: getTimeAgo(dateText),
                    content: messageText
                });
            }
        });
        
        return articles;
    } catch (error) {
        console.error(`Error parsing Telegram channel ${channelName}:`, error.message);
        return [];
    }
}

function formatDate(dateInput) {
    try {
        let date;
        if (!dateInput) {
            date = new Date();
        } else if (typeof dateInput === 'string') {
            date = new Date(dateInput);
        } else if (dateInput instanceof Date) {
            date = dateInput;
        } else {
            date = new Date();
        }
        
        if (isNaN(date.getTime())) {
            date = new Date();
        }
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    } catch (error) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        return `${day}.${month}.${year}`;
    }
}

function getTimeAgo(dateInput) {
    try {
        let date;
        if (!dateInput) {
            return 'нещодавно';
        } else if (typeof dateInput === 'string') {
            date = new Date(dateInput);
        } else if (dateInput instanceof Date) {
            date = dateInput;
        } else {
            return 'нещодавно';
        }
        
        if (isNaN(date.getTime())) {
            return 'нещодавно';
        }
        
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 60) {
            return diffMins <= 1 ? 'щойно' : `${diffMins} хв тому`;
        } else if (diffHours < 24) {
            return `${diffHours} год тому`;
        } else if (diffDays < 7) {
            return `${diffDays} дн тому`;
        } else {
            return formatDate(date);
        }
    } catch (error) {
        return 'нещодавно';
    }
}

async function getAllNews() {
    const allNews = [];
    
    for (const source of NEWS_SOURCES) {
        try {
            let articles = [];
            
            if (source.type === 'website' && source.parser) {
                articles = await source.parser();
            } else if (source.type === 'telegram' && source.channel) {
                articles = await parseTelegramChannel(source.channel);
            }
            
            allNews.push(...articles);
        } catch (error) {
            console.error(`Error fetching from ${source.name}:`, error.message);
        }
    }
    
    allNews.sort((a, b) => {
        const dateA = new Date(a.date.split('.').reverse().join('-'));
        const dateB = new Date(b.date.split('.').reverse().join('-'));
        return dateB - dateA;
    });
    
    if (allNews.length === 0) {
        return [
            {
                title: 'Вітаємо в U-hub!',
                source: 'U-hub',
                description: 'Тут ви знайдете останні новини КНУ',
                date: formatDate(new Date()),
                timeAgo: 'щойно',
                link: 'https://knu.ua',
                content: 'Система завантажується. Спробуйте оновити через декілька хвилин.'
            }
        ];
    }
    
    return allNews.slice(0, 20);
}

module.exports = {
    getAllNews,
    parseKNUInternational,
    parseKNUCalendar,
    parseKNUNews,
    parseTelegramChannel
};