const { default: makeWASocket, useMultiFileAuthState, delay, disconnectReason } = require("@whiskeysockets/baileys");
const fs = require("fs");
const http = require("http");
const QRCode = require('qrcode');

let qrCodeData = ""; // כאן יישמר ה-QR האחרון שנוצר

// --- שרת אינטרנט להצגת ה-QR באתר ---
const server = http.createServer(async (req, res) => {
    if (qrCodeData) {
        // אם יש QR, נהפוך אותו לתמונה ונציג בדף
        const qrImage = await QRCode.toDataURL(qrCodeData);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
                <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
                    <h1>סרוק את ה-QR לחיבור הבוט</h1>
                    <img src="${qrImage}" style="width:300px;border:10px solid white;box-shadow:0 0 15px rgba(0,0,0,0.2);">
                    <p>הדף מתרענן אוטומטית כל 30 שניות</p>
                    <script>setTimeout(() => { location.reload(); }, 30000);</script>
                </body>
            </html>
        `);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end("<h1>הבוט מחובר או שעדיין לא נוצר קוד QR. בדוק שוב בעוד רגע.</h1>");
    }
}).listen(process.env.PORT || 3000);

// --- הגדרות הבוט ---
const OWNER_NUMBER = "0583293459@s.whatsapp.net";
const CONTACTS_FILE = "./contacts.json";
const SAVE_KEYWORDS = ['שמור', 'שמירה', 'תשמור', 'לשמור', 'save'];

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // לא מדפיסים ללוגים כבקשתך
        browser: ["Refael Digital Bot", "Chrome", "1.0.0"]
    });

    // ניהול ה-QR
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeData = qr; // שמירת הקוד להצגה באתר
        }

        if (connection === 'close') {
            qrCodeData = "";
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            qrCodeData = ""; // מנקים את ה-QR ברגע שמתחברים
            console.log('✅ הבוט מחובר!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // לוגיקת הודעות (כמו קודם)
    let savedContacts = [];
    if (fs.existsSync(CONTACTS_FILE)) {
        try { savedContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE)); } catch (e) {}
    }

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderId = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        
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

// מנגנון איפוס כל 5 דקות במידה ולא מחובר
setInterval(() => {
    if (qrCodeData) {
        console.log("מבצע איפוס יזום לקוד ה-QR...");
        qrCodeData = "";
        // ניקוי תיקיית ה-Auth אם נתקע
        if (fs.existsSync('./auth_info')) {
            // כאן אפשר להוסיף לוגיקה למחיקת הקבצים אם תרצה איפוס עמוק יותר
        }
    }
}, 5 * 60 * 1000);

startBot();
