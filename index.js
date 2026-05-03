const { default: makeWASocket, useMultiFileAuthState, disconnectReason } = require("@whiskeysockets/baileys");
const fs = require("fs");
const http = require("http");
const QRCode = require('qrcode');
const pino = require('pino');

let qrCodeData = "";
let sock;
let qrRefreshTimer;

const PORT = process.env.PORT || 3000;
const OWNER_NUMBER = "0583293459@s.whatsapp.net";
const CONTACTS_FILE = "./contacts.json";
const SAVE_KEYWORDS = ['שמור', 'שמירה', 'תשמור', 'לשמור', 'save'];

// שרת תצוגה
const server = http.createServer(async (req, res) => {
    if (qrCodeData) {
        const qrImage = await QRCode.toDataURL(qrCodeData);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <html>
            <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f0f2f5;font-family:sans-serif;">
                <div style="background:white;padding:30px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;">
                    <h2 style="color:#128c7e;">Rafael Digital - חיבור בוט</h2>
                    <img src="${qrImage}" style="width:300px;border:5px solid #eee;">
                    <p style="color:#666;">הברקוד יתאפס אוטומטית כל 5 דקות אם לא ייסרק.</p>
                </div>
                <script>setTimeout(() => { location.reload(); }, 15000);</script>
            </body>
            </html>
        `);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end("<body style='display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;'><h1>הבוט מחובר! ✅</h1></body>");
    }
}).listen(PORT);

async function startBot() {
    // ניקוי טיימר קודם אם קיים
    clearTimeout(qrRefreshTimer);

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Rafael Digital", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeData = qr;
            // הגדרת רענון ל-5 דקות בדיוק
            qrRefreshTimer = setTimeout(() => {
                if (!sock.user) {
                    console.log("QR Expired. Refreshing...");
                    qrCodeData = "";
                    sock.end();
                    if (fs.existsSync('./auth_info')) fs.rmSync('./auth_info', { recursive: true, force: true });
                    startBot();
                }
            }, 5 * 60 * 1000);
        }

        if (connection === 'close') {
            qrCodeData = "";
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            qrCodeData = "";
            clearTimeout(qrRefreshTimer);
            console.log('Bot is Live!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderId = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        
        let savedContacts = [];
        try { savedContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE)); } catch (e) { savedContacts = []; }

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

// יצירת קובץ אנשי קשר אם חסר
if (!fs.existsSync(CONTACTS_FILE)) fs.writeFileSync(CONTACTS_FILE, JSON.stringify([]));

startBot();
