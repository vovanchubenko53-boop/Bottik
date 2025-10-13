const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;

async function createSampleSchedule() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Розклад');
    
    worksheet.columns = [
        { header: 'Час', key: 'time', width: 15 },
        { header: 'Понеділок', key: 'monday', width: 30 },
        { header: 'Вівторок', key: 'tuesday', width: 30 },
        { header: 'Середа', key: 'wednesday', width: 30 },
        { header: 'Четвер', key: 'thursday', width: 30 },
        { header: 'П\'ятниця', key: 'friday', width: 30 }
    ];
    
    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 25;
    
    const scheduleData = [
        {
            time: '08:30-10:05',
            monday: 'Українська мова, Проф. Іваненко О.П., ауд. 201',
            tuesday: 'Математика, Проф. Коваленко С.М., ауд. 410',
            wednesday: '',
            thursday: 'Економіка, Проф. Литвин Н.А., ауд. 301',
            friday: 'Культурологія, Проф. Гончар І.М., ауд. 120'
        },
        {
            time: '10:25-12:00',
            monday: 'Англійська мова, Доц. Петренко М.В., ауд. 305',
            tuesday: 'Інформатика, Ст. викл. Бондар Т.В., лаб. 2',
            wednesday: 'Філософія, Доц. Мельник В.О., ауд. 220',
            thursday: 'Соціологія, Доц. Кравченко Ю.С., ауд. 215',
            friday: ''
        },
        {
            time: '12:20-13:55',
            monday: 'Історія України, Доц. Сидоренко А.І., ауд. 115',
            tuesday: '',
            wednesday: 'Фізична культура, Тренер Шевченко Д.П., спорт. зал',
            thursday: '',
            friday: ''
        }
    ];
    
    scheduleData.forEach(row => {
        worksheet.addRow(row);
    });
    
    await fs.mkdir(path.join(__dirname, '..', 'data', 'schedules'), { recursive: true });
    
    const filePath = path.join(__dirname, '..', 'data', 'schedules', 'C1_1_IIMV_Mizhnarodni_komunikatsii.xlsx');
    await workbook.xlsx.writeFile(filePath);
    console.log(`Excel schedule created: ${filePath}`);
    
    const filePath2 = path.join(__dirname, '..', 'data', 'schedules', 'PI2_2_FIT_Prohramna_inzheneriia.xlsx');
    const workbook2 = new ExcelJS.Workbook();
    const worksheet2 = workbook2.addWorksheet('Розклад');
    
    worksheet2.columns = [
        { header: 'Час', key: 'time', width: 15 },
        { header: 'Понеділок', key: 'monday', width: 30 },
        { header: 'Вівторок', key: 'tuesday', width: 30 },
        { header: 'Середа', key: 'wednesday', width: 30 },
        { header: 'Четвер', key: 'thursday', width: 30 },
        { header: 'П\'ятниця', key: 'friday', width: 30 }
    ];
    
    const scheduleData2 = [
        {
            time: '08:30-10:05',
            monday: 'Алгоритми та структури даних, Проф. Ковальчук В.П., ауд. 512',
            tuesday: 'Веб-технології, Викл. Морозова К.С., лаб. 1',
            wednesday: '',
            thursday: 'Об\'єктно-орієнтоване програмування, Доц. Литвиненко Т.А., лаб. 2',
            friday: 'Англійська мова (професійна), Викл. Бондаренко Н.М., ауд. 203'
        },
        {
            time: '10:25-12:00',
            monday: 'Бази даних, Доц. Семенов А.В., лаб. 3',
            tuesday: 'Операційні системи, Проф. Павленко Д.М., ауд. 405',
            wednesday: 'Дискретна математика, Доц. Ткаченко О.І., ауд. 310',
            thursday: 'Комп\'ютерні мережі, Проф. Савченко Р.В., ауд. 508',
            friday: ''
        }
    ];
    
    scheduleData2.forEach(row => {
        worksheet2.addRow(row);
    });
    
    await workbook2.xlsx.writeFile(filePath2);
    console.log(`Excel schedule created: ${filePath2}`);
}

createSampleSchedule().catch(console.error);