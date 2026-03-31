const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');
const express = require('express');

// הגדרת השרת וה-API
const app = express();
const port = process.env.PORT || 3000;
const groq = new Groq({ apiKey: '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' });

// שרת אינטרנט בסיסי כדי ש-Render ו-UptimeRobot יראו שהבוט חי
app.get('/', (req, res) => res.send('חנה מחוברת ועובדת!'));
app.listen(port, () => console.log(`Server running on port ${port}`));

// הגדרת הבוט עם תיקון מיוחד לשרת Render
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // אלו ההגדרות שמונעות מהבוט לקרוס ב-Render
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

let adminState = { step: 0, numbers: [], text: '' };
const ADMIN_CMD = "a332935535a";

// פונקציית שעות פעילות - 24/6 (סגור רק בשבת)
function isBusinessOpen() {
    const now = new Date();
    const day = now.getDay(); // 6 = שבת
    const hour = now.getHours();
    if (day === 5 && hour >= 18) return false; // סגור משישי ב-18:00
    if (day === 6 && hour < 19) return false;  // נפתח במוצאי שבת ב-19:00
    return true;
}

client.on('qr', (qr) => {
    console.log('סרוק את הקוד הבא כדי לחבר את חנה (0505669532):');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('חנה מחוברת בהצלחה ומוכנה לעזור!');
});

client.on('message', async msg => {
    // חנה לא עונה בקבוצות
    if (msg.from.includes('@g.us')) return;

    const userText = msg.body;

    // --- מערכת ניהול (שידור המוני) ---
    if (userText === ADMIN_CMD) {
        adminState.step = 1;
        return msg.reply("מצב ניהול הופעל. שלח רשימת מספרים מופרדים בפסיק:");
    }
    if (adminState.step === 1) {
        adminState.numbers = userText.split(/[\n,]+/).map(n => n.trim().replace(/\D/g, ''));
        adminState.step = 2;
        return msg.reply(`נקלטו ${adminState.numbers.length} מספרים. שלח את הטקסט לשידור:`);
    }
    if (adminState.step === 2) {
        adminState.text = userText;
        for (let num of adminState.numbers) {
            client.sendMessage(`${num}@c.us`, adminState.text);
        }
        adminState.step = 0;
        return msg.reply("השידור הסתיים.");
    }

    // --- בדיקת שעות פעילות ---
    if (!isBusinessOpen()) return;

    // --- מענה של חנה (AI) ---
    try {
        // הפניה לאתר בצורך באנונימיות
        if (userText.includes("אנונימי") || userText.includes("לא בנוח") || userText.includes("מי זה")) {
            return msg.reply("אני מבינה לגמרי. אם נוח לך יותר לדבר באנונימיות, מוזמן/ת לצ'אט שלנו כאן: https://did.li/pashutlehakshiv");
        }

        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `את חנה מ'פשוט להקשיב'. את דמות אנושית, חמה ואמפתית. 
                    תפקידך להקשיב ולתמוך רגשית. לעולם אל תודי שאת בוט.
                    אם יש סכנת חיים או מצב רפואי דחוף, הפני מיד למוקד 100, 101 או ער"ן (1201).
                    דברי בעברית טבעית וחמה.` 
                },
                { role: "user", content: userText }
            ],
            model: "llama3-70b-8192",
            temperature: 0.7,
        });

        const response = completion.choices[0].message.content;
        await client.sendMessage(msg.from, response);

    } catch (error) {
        console.error("Groq/WhatsApp Error:", error);
    }
});

client.initialize();
