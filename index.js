const { default: makeWASocket, useMultiFileAuthState, delay, disconnectReason } = require("@whiskeysockets/baileys");
const fs = require("fs");
const http = require("http");
const QRCode = require('qrcode');
const pino = require('pino');

let qrCodeData = ""; 

// יצירת קובץ אנשי קשר אם הוא לא קיים כדי למנוע קריסה
const CONTACTS_FILE = "./contacts.json";
if (!fs.existsSync(CONTACTS_FILE)) {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify([]));
}

// שרת אינטרנט להצגת ה-QR
http.createServer(async (req, res) => {
    if (qrCodeData) {
        try {
            const qrImage = await QRCode.toDataURL(qrCodeData);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f0f2f5;font-family:sans-serif;"><div style="background:white;padding:20px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;"><h1 style="color:#128c7e;">סרוק לחיבור הבוט</h1><img src="${qrImage}" style="width:300px;"><p>הקוד מתרענן אוטומטית</p></div><script>setTimeout(() => { location.reload(); }, 25000);</script></body></html>`);
        } catch (err) {
            res.end("Error generating QR");
        }
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end("<body style='display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;'><h1>הבוט מחובר או בטעינה... ✅</h1></body>");
    }
}).listen(process.env.PORT || 3000);

const OWNER_NUMBER = "0583293459@s.whatsapp.net";
const SAVE_KEYWORDS = ['שמור', 'שמירה', 'תשמור', 'לשמור'];

async function startBot() {
    // וידוא קיום תיקיית auth
    if (!fs.existsSync('./auth_info')) {
        fs.mkdirSync('./auth_info');
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Rafael Digital", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrCodeData = qr;

        if (connection === 'close') {
            qrCodeData = "";
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            qrCodeData = "";
            console.log('✅ Connected!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderId = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        
        let savedContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE));

        if (!savedContacts.includes(senderId)) {
            await sock.sendMessage(senderId, { text: "ברוכים הבאים לסטטוס - אפ במה במה אפשר לעזור?" });
            savedContacts.push(senderId);
            fs.writeFileSync(CONTACTS_FILE, JSON.stringify(savedContacts));
        }

        if (SAVE_KEYWORDS.some(kw => text.includes(kw))) {
            await sock.sendMessage(senderId, { text: "נשמרת בהצלחה אל תשכח לשמור אותנו 😉" });
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:ליד - ${senderId.split('@')[0]}\nTEL;TYPE=CELL:${senderId.split('@')[0]}\nEND:VCARD`;
            await sock.sendMessage(OWNER_NUMBER, { contacts: { displayName: "ליד חדש", contacts: [{ vcard }] } });
        }
    });
}

// איפוס כל 5 דקות אם לא נסרק
setInterval(() => {
    if (qrCodeData) {
        qrCodeData = "";
        startBot();
    }
}, 5 * 60 * 1000);

startBot().catch(err => console.error("Start Error:", err));
