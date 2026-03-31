const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');
const express = require('express');

// הגדרות שרת ו-API
const app = express();
const port = process.env.PORT || 3000;
const groq = new Groq({ apiKey: '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' });

// דף נחיתה בסיסי כדי שהשרת יישאר דלוק
app.get('/', (req, res) => res.send('חנה מחוברת ופועלת 24/6 (0505669532)'));
app.listen(port, '0.0.0.0', () => console.log(`Server is running on port ${port}`));

// הגדרת הבוט עם נתיב ישיר לדפדפן של Render
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // זה התיקון שמונע את השגיאה האדומה ב-Render
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// משתנים למערכת הניהול (שידור המוני)
let adminState = { step: 0, numbers: [], text: '' };
const ADMIN_CMD = "a332935535a";

// פונקציית שעות פעילות (סגור רק בשבת)
function isBusinessOpen() {
    const now = new Date();
    const day = now.getDay(); 
    const hour = now.getHours();
    if (day === 5 && hour >= 18) return false; // שישי בערב
    if (day === 6 && hour < 19) return false;  // שבת עד הערב
    return true;
}

// הצגת QR ב-Logs
client.on('qr', (qr) => {
    console.log('--------------------------------------------');
    console.log('נא לסרוק את הקוד הבא בטלפון 0505669532:');
    qrcode.generate(qr, { small: true });
    console.log('--------------------------------------------');
});

client.on('ready', () => {
    console.log('חנה מחוברת בהצלחה ומוכנה לעזור!');
});

client.on('message', async msg => {
    if (msg.from.includes('@g.us')) return; // לא עונה בקבוצות

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
            try { await client.sendMessage(`${num}@c.us`, adminState.text); } catch(e) {}
        }
        adminState.step = 0;
        return msg.reply("השידור הסתיים.");
    }

    // --- בדיקת שעות פעילות ---
    if (!isBusinessOpen()) return;

    // --- מענה של חנה (AI) ---
    try {
        // בדיקת מילות מפתח לאנונימיות
        const triggerWords = ["אנונימי", "לא בנוח", "מי זה", "מי את"];
        if (triggerWords.some(word => userText.includes(word))) {
            return msg.reply("אני מבינה לגמרי. אם נוח לך יותר לדבר באנונימיות, מוזמן/ת לצ'אט שלנו כאן: https://did.li/pashutlehakshiv");
        }

        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `את חנה מ'פשוט להקשיב'. את דמות אנושית, חמה ואמפתית. 
                    תפקידך לתמוך רגשית. אם יש סכנת חיים, הפני למוקד 100, 101 או ער"ן (1201).` 
                },
                { role: "user", content: userText }
            ],
            model: "llama3-70b-8192",
        });

        await client.sendMessage(msg.from, completion.choices[0].message.content);

    } catch (error) {
        console.error("Error:", error.message);
    }
});

client.initialize().catch(err => console.error('Init Error:', err));
