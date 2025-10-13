const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;

let schedulesCache = [];

async function parseExcelSchedule(filePath, metadata = {}) {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.getWorksheet(1);
        const scheduleData = {
            id: metadata.id || Date.now().toString(),
            name: metadata.name || '',
            course: metadata.course || '',
            code: metadata.code || '',
            schedule: {
                monday: [],
                tuesday: [],
                wednesday: [],
                thursday: [],
                friday: []
            }
        };
        
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1 && !scheduleData.name) {
                scheduleData.name = row.getCell(1).value || 'Розклад';
            }
            
            if (rowNumber > 1) {
                const time = row.getCell(1).value;
                const monday = row.getCell(2).value;
                const tuesday = row.getCell(3).value;
                const wednesday = row.getCell(4).value;
                const thursday = row.getCell(5).value;
                const friday = row.getCell(6).value;
                
                if (time) {
                    if (monday) scheduleData.schedule.monday.push(parseClass(time, monday));
                    if (tuesday) scheduleData.schedule.tuesday.push(parseClass(time, tuesday));
                    if (wednesday) scheduleData.schedule.wednesday.push(parseClass(time, wednesday));
                    if (thursday) scheduleData.schedule.thursday.push(parseClass(time, thursday));
                    if (friday) scheduleData.schedule.friday.push(parseClass(time, friday));
                }
            }
        });
        
        return scheduleData;
    } catch (error) {
        console.error('Error parsing Excel schedule:', error);
        throw error;
    }
}

function parseClass(time, classInfo) {
    const classData = {
        time: time.toString(),
        subject: '',
        teacher: '',
        room: ''
    };
    
    if (typeof classInfo === 'string') {
        const parts = classInfo.split(/[,\n]/);
        classData.subject = parts[0]?.trim() || classInfo;
        classData.teacher = parts[1]?.trim() || '';
        classData.room = parts[2]?.trim() || '';
    } else {
        classData.subject = classInfo.toString();
    }
    
    return classData;
}

async function loadSchedulesFromDirectory(dirPath) {
    try {
        const schedulesDir = path.join(dirPath, 'schedules');
        
        try {
            await fs.access(schedulesDir);
        } catch {
            return getDefaultSchedules();
        }
        
        const files = await fs.readdir(schedulesDir);
        const excelFiles = files.filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
        
        if (excelFiles.length === 0) {
            return getDefaultSchedules();
        }
        
        const schedules = [];
        for (const file of excelFiles) {
            try {
                const filePath = path.join(schedulesDir, file);
                const fileName = file.replace(/\.(xlsx|xls)$/, '');
                const parts = fileName.split('_');
                
                const metadata = {
                    id: parts[0] || Date.now().toString(),
                    code: parts[0] || 'C1',
                    course: parts[1] || '1',
                    name: parts.slice(2).join(' ') || 'Розклад занять'
                };
                
                const schedule = await parseExcelSchedule(filePath, metadata);
                schedules.push(schedule);
            } catch (error) {
                console.error(`Error parsing ${file}:`, error.message);
            }
        }
        
        return schedules.length > 0 ? schedules : getDefaultSchedules();
    } catch (error) {
        console.error('Error loading schedules from directory:', error);
        return getDefaultSchedules();
    }
}

function getDefaultSchedules() {
    return [
        {
            id: '1',
            name: 'ННІМВ КНУ ім. Т.Г. Шевченка з ОП (СЗ) Міжнародні комунікації',
            code: 'C1',
            course: '1',
            schedule: {
                monday: [
                    { time: '08:30-10:05', subject: 'Українська мова', teacher: 'Проф. Іваненко О.П.', room: 'ауд. 201' },
                    { time: '10:25-12:00', subject: 'Англійська мова', teacher: 'Доц. Петренко М.В.', room: 'ауд. 305' },
                    { time: '12:20-13:55', subject: 'Історія України', teacher: 'Доц. Сидоренко А.І.', room: 'ауд. 115' }
                ],
                tuesday: [
                    { time: '08:30-10:05', subject: 'Математика', teacher: 'Проф. Коваленко С.М.', room: 'ауд. 410' },
                    { time: '10:25-12:00', subject: 'Інформатика', teacher: 'Ст. викл. Бондар Т.В.', room: 'лаб. 2' }
                ],
                wednesday: [
                    { time: '10:25-12:00', subject: 'Філософія', teacher: 'Доц. Мельник В.О.', room: 'ауд. 220' },
                    { time: '12:20-13:55', subject: 'Фізична культура', teacher: 'Тренер Шевченко Д.П.', room: 'спорт. зал' }
                ],
                thursday: [
                    { time: '08:30-10:05', subject: 'Економіка', teacher: 'Проф. Литвин Н.А.', room: 'ауд. 301' },
                    { time: '10:25-12:00', subject: 'Соціологія', teacher: 'Доц. Кравченко Ю.С.', room: 'ауд. 215' }
                ],
                friday: [
                    { time: '08:30-10:05', subject: 'Культурологія', teacher: 'Проф. Гончар І.М.', room: 'ауд. 120' }
                ]
            }
        },
        {
            id: '2',
            name: 'Факультет інформаційних технологій. Програмна інженерія',
            code: 'PI2',
            course: '2',
            schedule: {
                monday: [
                    { time: '08:30-10:05', subject: 'Алгоритми та структури даних', teacher: 'Проф. Ковальчук В.П.', room: 'ауд. 512' },
                    { time: '10:25-12:00', subject: 'Бази даних', teacher: 'Доц. Семенов А.В.', room: 'лаб. 3' }
                ],
                tuesday: [
                    { time: '08:30-10:05', subject: 'Веб-технології', teacher: 'Викл. Морозова К.С.', room: 'лаб. 1' },
                    { time: '10:25-12:00', subject: 'Операційні системи', teacher: 'Проф. Павленко Д.М.', room: 'ауд. 405' }
                ],
                wednesday: [
                    { time: '10:25-12:00', subject: 'Дискретна математика', teacher: 'Доц. Ткаченко О.І.', room: 'ауд. 310' }
                ],
                thursday: [
                    { time: '08:30-10:05', subject: 'Об\'єктно-орієнтоване програмування', teacher: 'Доц. Литвиненко Т.А.', room: 'лаб. 2' },
                    { time: '10:25-12:00', subject: 'Комп\'ютерні мережі', teacher: 'Проф. Савченко Р.В.', room: 'ауд. 508' }
                ],
                friday: [
                    { time: '08:30-10:05', subject: 'Англійська мова (професійна)', teacher: 'Викл. Бондаренко Н.М.', room: 'ауд. 203' }
                ]
            }
        }
    ];
}

async function initializeSchedules(dataPath) {
    schedulesCache = await loadSchedulesFromDirectory(dataPath);
    console.log(`Loaded ${schedulesCache.length} schedules into cache`);
    return schedulesCache;
}

async function searchSchedules(query, course) {
    if (schedulesCache.length === 0) {
        schedulesCache = getDefaultSchedules();
    }
    
    let results = [...schedulesCache];
    
    if (course) {
        results = results.filter(s => s.course === course.toString());
    }
    
    if (query && query.trim()) {
        const q = query.toLowerCase().trim();
        results = results.filter(s => 
            s.name.toLowerCase().includes(q) || 
            s.code.toLowerCase().includes(q)
        );
    }
    
    return results;
}

module.exports = {
    parseExcelSchedule,
    searchSchedules,
    loadSchedulesFromDirectory,
    initializeSchedules,
    getDefaultSchedules,
    parseClass
};