const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: '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' });

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }
});

let adminState = { step: 0, numbers: [], text: '' };
const ADMIN_CMD = "a332935535a";

// פונקציה לבדיקת שעות פעילות - 24/6 (סגור רק בשבת)
function isBusinessOpen() {
    const now = new Date();
    const day = now.getDay(); // 6 זה שבת
    const hour = now.getHours();

    // הגדרה: סגור מיום שישי ב-18:00 עד מוצאי שבת ב-19:00
    if (day === 5 && hour >= 18) return false; // שישי בערב
    if (day === 6 && hour < 19) return false;  // שבת במהלך היום
    
    return true;
}

client.on('message', async msg => {
    // מניעת מענה בקבוצות (חנה עונה רק בפרטי)
    if (msg.from.includes('@g.us')) return;

    const userText = msg.body;

    // --- מערכת ניהול (שידור המוני) ---
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
            client.sendMessage(`${num}@c.us`, adminState.text);
        }
        adminState.step = 0;
        return msg.reply("השידור הושלם בהצלחה.");
    }

    // --- בדיקת שעות פעילות ---
    if (!isBusinessOpen()) return;

    // --- לוגיקה של חנה (Groq AI) ---
    try {
        // זיהוי צורך באנונימיות
        if (userText.includes("אנונימי") || userText.includes("לא בנוח") || userText.includes("מי זה")) {
            return msg.reply("אני מבינה לגמרי. אם נוח לך יותר לדבר בצורה אנונימית לחלוטין, את/ה מוזמן/ת לצ'אט שלנו כאן: https://did.li/pashutlehakshiv \nאני כאן אם תרצה/י להמשיך לדבר.");
        }

        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `את חנה מ'פשוט להקשיב'. את דמות אנושית, חמה ואמפתית. 
                    תפקידך להקשיב ולתמוך רגשית. לעולם אל תודי שאת בוט.
                    חוקים קשיחים:
                    1. אם המשתמש מביע כוונות אובדניות, סכנה עצמית או מצב רפואי דחוף, עלייך להפנות אותו מיד לגורם מוסמך: משטרה (100), מד"א (101) או ער"ן (1201).
                    2. את לא נותנת ייעוץ רפואי מקצועי.
                    3. דברי בעברית יומיומית, לא רשמית מדי, כמו חברה שמקשיבה.` 
                },
                { role: "user", content: userText }
            ],
            model: "llama3-70b-8192",
            temperature: 0.7,
        });

        const response = completion.choices[0].message.content;
        await client.sendMessage(msg.from, response);

    } catch (error) {
        console.error("Error with Groq:", error);
    }
});

client.on('qr', qr => {
    console.log('סרוק את ה-QR כדי לחבר את חנה (0505669532):');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('חנה מחוברת ומוכנה להקשיב!');
});

client.initialize();

