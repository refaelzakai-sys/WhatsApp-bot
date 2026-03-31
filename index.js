const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');
const express = require('express');

const app = express();
const port = process.env.PORT || 10000;
const groq = new Groq({ apiKey: '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' });

app.get('/', (req, res) => res.send('חנה מ-"פשוט להקשיב" פועלת (972505669532)'));
app.listen(port, '0.0.0.0', () => console.log(`השרת פועל על פורט ${port}`));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: '/usr/bin/google-chrome-stable', // נתיב קבוע בתוך Docker
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let adminState = { step: 0, numbers: [], text: '' };
const ADMIN_CMD = "a332935535a";

function isBusinessOpen() {
    const now = new Date();
    const day = now.getDay(); 
    const hour = now.getHours();
    if (day === 5 && hour >= 18) return false;
    if (day === 6 && hour < 19) return false;
    return true;
}

client.on('qr', (qr) => {
    console.log('--- סרוק את הברקוד (QR) ---');
    qrcode.generate(qr, { small: true });
    console.log('---------------------------');
});

client.on('ready', () => console.log('חנה מחוברת ומוכנה להקשיב!'));

client.on('message', async msg => {
    if (msg.from.includes('@g.us')) return;
    const userText = msg.body;

    // מערכת שידור המוני
    if (userText === ADMIN_CMD) {
        adminState.step = 1;
        return msg.reply("מצב ניהול. שלח רשימת מספרים:");
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

    if (!isBusinessOpen()) return;

    try {
        const triggerWords = ["אנונימי", "לא בנוח", "מי זה", "מי את", "אנונימיות"];
        if (triggerWords.some(word => userText.includes(word))) {
            return msg.reply("אני מבינה. אם נוח לך יותר לדבר באנונימיות מלאה, מוזמן/ת לצ'אט האנונימי באתר שלנו: https://did.li/pashutlehakshiv");
        }

        const completion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `את חנה מ'פשוט להקשיב'. את דמות אנושית, חמה ומקשיבה. 
                    אל תזכירי לעולם מתחרים. במקרה של סכנת חיים ממשית, הפני למוקד 100 או 101 בלבד.
                    דברי בעברית טבעית וחמה.` 
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

client.initialize().catch(err => console.error('Init Error:', err.message));

