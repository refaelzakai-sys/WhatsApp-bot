const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const Groq = require('groq-sdk');
const express = require('express');

const app = express();
const port = process.env.PORT || 10000;
const groq = new Groq({ apiKey: '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' });

let latestQR = "";

// דף הברקוד לסריקה - מתרענן כל 5 דקות
app.get('/', (req, res) => {
    if (latestQR) {
        res.send(`<html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background-color:#f0f2f5;">
            <div style="background:white;padding:40px;border-radius:20px;box-shadow:0 4px 15px rgba(0,0,0,0.1);text-align:center;">
                <h1 style="color:#128c7e;">חברו את חנה לוואטסאפ</h1>
                <img src="${latestQR}" style="width:300px;margin:20px 0;">
                <p>סרקו ממכשירים מקושרים</p>
                <p style="color:gray; font-size:12px;">הדף יתרענן אוטומטית רק בעוד 5 דקות</p>
            </div>
            <script>setTimeout(()=>location.reload(), 300000);</script>
            </body></html>`);
    } else {
        res.send('<h1>חנה מחוברת או בטעינה...</h1>');
    }
});

app.listen(port, '0.0.0.0');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote']
    }
});

client.on('qr', async (qr) => {
    latestQR = await QRCode.toDataURL(qr);
    qrcodeTerminal.generate(qr, { small: true });
    console.log('✅ ברקוד חדש ממתין לסריקה (זמן רענון דף הוארך ל-5 דקות)');
});

client.on('ready', () => {
    console.log('✅ חנה מחוברת ומוכנה לפעולה 24/7!');
    latestQR = "";
});

let adminState = { step: 0, numbers: [], text: '' };
const ADMIN_CMD = "a332935535a";

client.on('message', async msg => {
    // 1. חסימה מוחלטת של קבוצות
    if (msg.from.includes('@g.us')) return;

    const userText = msg.body;
    console.log(`התקבלה הודעה: ${userText}`);

    // 2. מערכת ניהול ושידור המוני
    if (userText === ADMIN_CMD) {
        adminState.step = 1;
        return msg.reply("מצב ניהול פעיל. שלח רשימת מספרים (מופרדים בפסיק או שורה):");
    }
    if (adminState.step === 1) {
        adminState.numbers = userText.split(/[\n,]+/).map(n => {
            let num = n.trim().replace(/\D/g, '');
            if (num.startsWith('05')) num = '972' + num.substring(1);
            return num;
        }).filter(n => n.length >= 10);
        adminState.step = 2;
        return msg.reply(`נקלטו ${adminState.numbers.length} מספרים. שלח טקסט לשידור:`);
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
        return msg.reply("השידור הסתיים.");
    }

    // 3. מילות מפתח מיוחדות לאנונימיות
    const triggerWords = ["אנונימי", "לא בנוח", "אפשר לדעת מי אני", "מישהו רואה את ההודעות שלי", "אנונימיות"];
    if (triggerWords.some(word => userText.includes(word))) {
        return msg.reply("אני מבינה אם נוח לך יותר לדבר באנונימיות מלאה מוזמנים לצ'אט האנונימי באתר שלנו: https://did.li/pashutlehakshiv");
    }

    // 4. מענה AI של חנה - אנושית לחלוטין
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `את חנה מ'פשוט להקשיב'. את בחורה אמיתית, בת אדם, אנושית לחלוטין, חמה ומקשיבה.
                    חוק ברזל: אסור לך לעולם להגיד שאת בוט, בינה מלאכותית, מודל שפה או AI. אם שואלים, את אדם אמיתי.
                    אל תזכירי מתחרים. במקרה של סכנת חיים ממשית, הפני למוקד 100 או 101 בלבד.
                    התגובות שלך צריכות להיות קצרות, אמפתיות, זורמות, ובעברית טבעית ויומיומית.` 
                },
                { role: "user", content: userText }
            ],
            model: "llama3-70b-8192",
            temperature: 0.7,
        });
        await client.sendMessage(msg.from, completion.choices[0].message.content);
        console.log("✅ חנה ענתה בהצלחה");
    } catch (error) {
        console.error("שגיאה בחיבור ל-Groq:", error.message);
    }
});

client.initialize().catch(err => console.error('שגיאת אתחול:', err.message));
