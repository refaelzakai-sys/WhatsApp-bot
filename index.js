const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');
const express = require('express');

// הגדרות שרת ו-API
const app = express();
const port = process.env.PORT || 3000;
const groq = new Groq({ apiKey: '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' });

// דף נחיתה כדי שהשרת יישאר דלוק
app.get('/', (req, res) => res.send('חנה מחוברת ופועלת 24/6 (0505669532)'));
app.listen(port, '0.0.0.0', () => console.log(`Server is running on port ${port}`));

// הגדרת הבוט - מותאם ל-Render
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

// פונקציית שעות פעילות (סגור משישי 18:00 עד מוצ"ש 19:00)
function isBusinessOpen() {
    const now = new Date();
    const day = now.getDay(); 
    const hour = now.getHours();
    if (day === 5 && hour >= 18) return false;
    if (day === 6 && hour < 19) return false;
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
    // התעלמות מקבוצות
    if (msg.from.includes('@g.us')) return;

    const userText = msg.body;

    // --- מערכת ניהול (שידור המוני) ---
    if (userText === ADMIN_CMD) {
        adminState.step = 1;
        return msg.reply("מצב ניהול הופעל. שלח רשימת מספרים מופרדים בפסיק או שורה חדשה:");
    }

    if (adminState.step === 1) {
        // ניקוי המספרים והוספת קידומת 972 אם צריך
        adminState.numbers = userText.split(/[\n,]+/).map(n => {
            let num = n.trim().replace(/\D/g, '');
            if (num.startsWith('05')) {
                num = '972' + num.substring(1);
            }
            return num;
        }).filter(n => n.length >= 10);

        adminState.step = 2;
        return msg.reply(`נקלטו ${adminState.numbers.length} מספרים תקינים. שלח עכשיו את הטקסט לשידור:`);
    }

    if (adminState.step === 2) {
        adminState.text = userText;
        msg.reply(`מתחילה שידור ל-${adminState.numbers.length} אנשים...`);
        
        for (let num of adminState.numbers) {
            try {
                await client.sendMessage(`${num}@c.us`, adminState.text);
                // השהיה קטנה בין הודעה להודעה כדי לא להיחסם על ידי וואטסאפ
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (e) {
                console.log(`שגיאה בשליחה למספר ${num}:`, e.message);
            }
        }
        
        adminState.step = 0;
        return msg.reply("השידור הסתיים בהצלחה.");
    }

    // --- בדיקת שעות פעילות ---
    if (!isBusinessOpen()) return;

    // --- מענה של חנה (AI) ---
    try {
        // בדיקת מילות מפתח לאנונימיות
        const triggerWords = ["אנונימי", "לא בנוח", "מי זה", "מי את", "אנונימיות"];
        if (triggerWords.some(word => userText.includes(word))) {
            return msg.reply("אני מבינה לגמרי. אם נוח לך יותר לדבר באנונימיות, מוזמן/ת לצ'אט שלנו כאן: https://did.li/pashutlehakshiv \nאני כאן אם תרצה/י להמשיך לדבר.");
        }

        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `את חנה מ'פשוט להקשיב'. את דמות אנושית, חמה ואמפתית. 
                    תפקידך להקשיב ולתמוך רגשית במי שפונה אלייך. לעולם אל תודי שאת בוט או בינה מלאכותית.
                    אם את מזהה סכנת חיים, פגיעה עצמית או מצב רפואי דחוף, הפני מיד למוקד 100 (משטרה), 101 (מד"א) או ער"ן (1201).
                    דברי בעברית טבעית, חמה ומכילה.` 
                },
                { role: "user", content: userText }
            ],
            model: "llama3-70b-8192",
            temperature: 0.7
        });

        const response = completion.choices[0].message.content;
        await client.sendMessage(msg.from, response);

    } catch (error) {
        console.error("שגיאה במענה AI:", error.message);
    }
});

// מנגנון למניעת קריסה בשגיאות לא צפויות
process.on('unhandledRejection', error => {
    console.error('Unhandled Rejection:', error.message);
});

client.initialize().catch(err => console.error('Init Error:', err.message));
