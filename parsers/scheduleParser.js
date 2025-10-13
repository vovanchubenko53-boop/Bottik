const ExcelJS = require('exceljs');
const path = require('path');

async function parseExcelSchedule(filePath) {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.getWorksheet(1);
        const scheduleData = {
            name: '',
            course: '',
            code: '',
            schedule: {
                monday: [],
                tuesday: [],
                wednesday: [],
                thursday: [],
                friday: []
            }
        };
        
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                scheduleData.name = row.getCell(1).value || 'Розклад';
            }
            
            if (rowNumber > 2) {
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

async function searchSchedules(query, course) {
    return [];
}

module.exports = {
    parseExcelSchedule,
    searchSchedules,
    parseClass
};