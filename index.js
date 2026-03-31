const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const Groq = require('groq-sdk');
const express = require('express');

const app = express();
const port = process.env.PORT || 10000;
const groq = new Groq({ apiKey: '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' });

let latestQR = "";

// יצירת דף אינטרנט שיציג את הברקוד לסריקה נוחה
app.get('/', (req, res) => {
    if (latestQR) {
        res.send(`
            <html>
                <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background-color:#f0f2f5;">
                    <div style="background:white; padding:40px; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.1); text-align:center;">
                        <h1 style="color:#128c7e;">חברו את חנה לוואטסאפ</h1>
                        <p>סרקו את הברקוד דרך מכשירים מקושרים באפליקציה</p>
                        <img src="${latestQR}" style="width:300px; margin:20px 0;">
                        <p style="font-size:12px; color:#666;">הדף מתרענן אוטומטית כל 30 שניות</p>
                    </div>
                    <script>setTimeout(() => location.reload(), 30000);</script>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;">
                    <h1 style="color:#128c7e;">חנה מחוברת או שהברקוד בטעינה...</h1>
                </body>
            </html>
        `);
    }
});

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));

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

client.on('qr', async (qr) => {
    console.log('--- קוד QR חדש הופק ---');
    qrcodeTerminal.generate(qr, { small: true });
    // הפיכת הקוד לתמונה שאפשר להציג באתר
    latestQR = await QRCode.toDataURL(qr);
});

client.on('ready', () => {
    console.log('חנה מחוברת ומוכנה לעבודה!');
    latestQR = ""; 
});

// לוגיקה של הבוט
let adminState = { step: 0, numbers: [], text: '' };
const ADMIN_CMD = "a332935535a";

client.on('message', async msg => {
    if (msg.from.includes('@g.us')) return;
    const userText = msg.body;

    // פקודת מנהל לשידור המוני
    if (userText === ADMIN_CMD) {
        adminState.step = 1;
        return msg.reply("מצב ניהול: שלח רשימת מספרים (מופרדים בפסיק או שורה חדשה):");
    }
    
    if (adminState.step === 1) {
        adminState.numbers = userText.split(/[\n,]+/).map(n => {
            let num = n.trim().replace(/\D/g, '');
            if (num.startsWith('05')) num = '972' + num.substring(1);
            return num;
        }).filter(n => n.length >= 10);
        adminState.step = 2;
        return msg.reply(`זוהו ${adminState.numbers.length} מספרים. שלח כעת את הודעת השידור:`);
    }

    if (adminState.step === 2) {
        adminState.text = userText;
        for (let num of adminState.numbers) {
            try { 
                await client.sendMessage(`${num}@c.us`, adminState.text);
                await new Promise(r => setTimeout(r, 1000));
            } catch(e) {}
        }
        adminState.step = 0;
        return msg.reply("השידור ההמוני הושלם בהצלחה.");
    }

    // מענה רגיל על ידי חנה (AI)
    try {
        const triggerWords = ["אנונימי", "לא בנוח", "מי זה", "מי את", "אנונימיות"];
        if (triggerWords.some(word => userText.includes(word))) {
            return msg.reply("אני מבינה. אם נוח לך יותר לדבר באנונימיות מלאה, מוזמן/ת לצ'אט האנונימי באתר שלנו: https://did.li/pashutlehakshiv");
        }

        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: "את חנה מ'פשוט להקשיב'. דמות אנושית, חמה ומקשיבה. אל תזכירי מתחרים. במקרה של סכנת חיים ממשית, הפני למוקד 100 או 101 בלבד. עני קצר ולעניין." 
                },
                { role: "user", content: userText }
            ],
            model: "llama3-70b-8192",
        });
        await client.sendMessage(msg.from, completion.choices[0].message.content);
    } catch (error) {
        console.error("AI Error:", error.message);
    }
});

client.initialize().catch(err => console.error('Init Error:', err.message));
