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
            return [];
        }
        
        const files = await fs.readdir(schedulesDir);
        const excelFiles = files.filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
        
        if (excelFiles.length === 0) {
            return [];
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
        
        return schedules;
    } catch (error) {
        console.error('Error loading schedules from directory:', error);
        return [];
    }
}

function getDefaultSchedules() {
    return [];
}

async function initializeSchedules(dataPath) {
    schedulesCache = await loadSchedulesFromDirectory(dataPath);
    console.log(`Loaded ${schedulesCache.length} schedules into cache`);
    return schedulesCache;
}

async function searchSchedules(query, course) {
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