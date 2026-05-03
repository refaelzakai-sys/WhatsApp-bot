const { default: makeWASocket, useMultiFileAuthState, disconnectReason } = require("@whiskeysockets/baileys");
const fs = require("fs");
const http = require("http");
const QRCode = require('qrcode');
const pino = require('pino');

let qrCodeData = "";
let sock; // שומר על החיבור שלנו כדי שנוכל לאתחל אותו
const PORT = process.env.PORT || 3000;
const OWNER_NUMBER = "0583293459@s.whatsapp.net";
const CONTACTS_FILE = "./contacts.json";
const SAVE_KEYWORDS = ['שמור', 'שמירה', 'תשמור', 'לשמור'];

// פונקציה לניקוי נתוני התחברות כדי לקבל ברקוד חדש ונקי
function clearAuth() {
    try {
        if (fs.existsSync('./auth_info')) {
            fs.rmSync('./auth_info', { recursive: true, force: true });
        }
    } catch (e) {
        console.error("שגיאה בניקוי תיקיית החיבור:", e);
    }
}

// יצירת קובץ אנשי קשר למניעת קריסות
try {
    if (!fs.existsSync(CONTACTS_FILE)) {
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify([]));
    }
} catch (e) {}

// --- שרת אינטרנט להצגת הברקוד ---
const server = http.createServer(async (req, res) => {
    try {
        if (qrCodeData) {
            const qrImage = await QRCode.toDataURL(qrCodeData);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f0f2f5;font-family:sans-serif;">
                    <div style="background:white;padding:30px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;">
                        <h1 style="color:#128c7e;margin-bottom:10px;">סרוק לחיבור הבוט</h1>
                        <img src="${qrImage}" style="width:300px;margin-bottom:20px;">
                        <p style="color:#e74c3c;font-weight:bold;margin:0;">הברקוד מתחדש אוטומטית כל 5 דקות</p>
                    </div>
                    <script>setTimeout(() => { location.reload(); }, 15000);</script>
                </body>
                </html>
            `);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end("<body style='display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f0f2f5;'><h1 style='color:#27ae60;'>הבוט מחובר, או מכין ברקוד חדש... רענן בעוד כמה שניות. ✅</h1><script>setTimeout(() => { location.reload(); }, 10000);</script></body>");
        }
    } catch (err) {
        res.writeHead(500);
        res.end("Server Error");
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server running on port ${PORT}`);
});

// --- הלוגיקה של הבוט ---
async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }), // משתיק שגיאות שיכולות להקריס את Render
            browser: ["Rafael Digital", "Chrome", "1.0.0"]
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                qrCodeData = qr;
                console.log("נוצר ברקוד חדש");
            }

            if (connection === 'close') {
                qrCodeData = "";
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
                if (shouldReconnect) {
                    setTimeout(startBot, 2000); // ניסיון חיבור מחדש
                } else {
                    // המשתמש התנתק מהטלפון - מנקים ומתחילים מחדש
                    clearAuth();
                    setTimeout(startBot, 2000);
                }
            } else if (connection === 'open') {
                qrCodeData = ""; // מנקים את הברקוד כי התחברנו בהצלחה
                console.log('✅ הבוט מחובר לוואטסאפ!');
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;

                const senderId = msg.key.remoteJid;
                const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
                
                let savedContacts = [];
                try {
                    savedContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
                } catch (e) { savedContacts = []; }

                if (!savedContacts.includes(senderId)) {
                    await sock.sendMessage(senderId, { text: "ברוכים הבאים לסטטוס - אפ במה אפשר לעזור?" });
                    savedContacts.push(senderId);
                    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(savedContacts));
                }

                if (SAVE_KEYWORDS.some(kw => text.includes(kw))) {
                    await sock.sendMessage(senderId, { text: "נשמרת בהצלחה אל תשכח לשמור אותנו 😉" });
                    const cleanNum = senderId.split('@')[0];
                    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:ליד - ${cleanNum}\nTEL;TYPE=CELL:${cleanNum}\nEND:VCARD`;
                    await sock.sendMessage(OWNER_NUMBER, { contacts: { displayName: `ליד חדש`, contacts: [{ vcard }] } });
                }
            } catch (err) {
                console.error("שגיאה בהודעה נכנסת:", err);
            }
        });
    } catch (err) {
        console.error("שגיאה קריטית בהפעלת הבוט:", err);
    }
}

startBot();

// --- מנגנון רענון ברקוד כל 5 דקות ---
setInterval(() => {
    // מרעננים רק אם יש ברקוד שממתין לסריקה (כלומר, הבוט לא מחובר)
    if (qrCodeData) {
        console.log("עברו 5 דקות ללא סריקה. מייצר ברקוד חדש...");
        qrCodeData = "";
        
        try {
            if (sock) sock.end(new Error("Refresh QR")); // סוגרים את החיבור הישן בצורה מסודרת
        } catch (e) {}
        
        clearAuth(); // מוחקים את הקבצים הישנים כדי שהברקוד הבא יהיה נקי
        setTimeout(startBot, 3000); // מפעילים מחדש
    }
}, 5 * 60 * 1000);
