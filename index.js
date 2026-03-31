const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');
const express = require('express');

// הגדרות שרת ו-API
const app = express();
const port = process.env.PORT || 3000;
const groq = new Groq({ apiKey: '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' });

// שרת בסיסי כדי ש-Render לא יכבה את הבוט
app.get('/', (req, res) => res.send('חנה מחוברת ופועלת 24/6'));
app.listen(port, '0.0.0.0', () => console.log(`Server is running on port ${port}`));

// הגדרת הבוט עם הגדרות אופטימליות לזיכרון נמוך
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote'
        ]
    }
});

// משתנים למערכת הניהול (שידור המוני)
let adminState = { step: 0, numbers: [], text: '' };
const ADMIN_CMD = "a332935535a";

// פונקציית שעות פעילות - פתוח תמיד חוץ משבת
function isBusinessOpen() {
    const now = new Date();
    const day = now.getDay(); // 0-ראשון, 5-שישי, 6-שבת
    const hour = now.getHours();

    // סגור מכניסת שבת (שישי ב-18:00) ועד מוצאי שבת (19:00)
    if (day === 5 && hour >= 18) return false;
    if (day === 6 && hour < 19) return false;
    
    return true;
}

// הצגת QR ב-Logs
client.on('qr', (qr) => {
    console.log('סרוק את הקוד כדי לחבר את חנה:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('חנה (0505669532) מחוברת ומוכנה להקשיב!');
});

client.on('message', async msg => {
    // התעלמות מקבוצות
    if (msg.from.includes('@g.us')) return;

    const userText = msg.body;

    // 1. מערכת ניהול - שליחת הודעה המונית (הפקודה הסודית שלך)
    if (userText === ADMIN_CMD) {
        adminState.step = 1;
        return msg.reply("חנה במצב ניהול. שלח רשימת מספרים (מופרדים בפסיק או שורה חדשה):");
    }

    if (adminState.step === 1) {
        adminState.numbers = userText.split(/[\n,]+/).map(n => n.trim().replace(/\D/g, ''));
        adminState.step = 2;
        return msg.reply(`נקלטו ${adminState.numbers.length} מספרים. עכשיו שלח את הטקסט לשידור:`);
    }

    if (adminState.step === 2) {
        adminState.text = userText;
        for (let num of adminState.numbers) {
            try {
                await client.sendMessage(`${num}@c.us`, adminState.text);
            } catch (err) {
                console.log(`שגיאה בשליחה למספר ${num}`);
            }
        }
        adminState.step = 0;
        return msg.reply("השידור הושלם בהצלחה.");
    }

    // 2. בדיקת שעות פעילות (אם סגור - לא עונה)
    if (!isBusinessOpen()) return;

    // 3. לוגיקה של חנה (מענה עם Groq)
    try {
        // בדיקת אנונימיות או חוסר נוחות
        const triggerWords = ["אנונימי", "לא בנוח", "מי זה", "מי את", "אנונימיות"];
        if (triggerWords.some(word => userText.includes(word))) {
            return msg.reply("אני מבינה לגמרי. אם נוח לך יותר לדבר בצורה אנונימית לחלוטין, את/ה מוזמן/ת לצ'אט האנונימי באתר שלנו כאן: https://did.li/pashutlehakshiv \nאני כאן אם תרצה/י להמשיך לדבר.");
        }

        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `את חנה, נציגה אנושית בעמותת 'פשוט להקשיב'. 
                    את אמפתית, חמה ומקשיבה. לעולם אל תודי שאת בוט.
                    חוקים חשובים:
                    1. אם את מזהה כוונות אובדניות, פגיעה עצמית או מצב רפואי קריטי, הפני מיד למוקד 100 (משטרה), 101 (מד"א) או 1201 (ער"ן).
                    2. אם שואלים על אנונימיות, הפני לאתר: https://did.li/pashutlehakshiv.
                    3. עני רק לדברים שקשורים לפריקה, תמיכה רגשית ושיתוף.
                    דברי בעברית טבעית של בני אדם.` 
                },
                { role: "user", content: userText }
            ],
            model: "llama3-70b-8192",
            temperature: 0.7
        });

        const response = completion.choices[0].message.content;
        await client.sendMessage(msg.from, response);

    } catch (error) {
        console.error("שגיאה במענה של חנה:", error.message);
    }
});

// טיפול בשגיאות מערכת כדי שלא יקרוס
process.on('unhandledRejection', error => {
    console.error('Unhandled Rejection:', error);
});

client.initialize().catch(err => console.error('Client Init Error:', err));

