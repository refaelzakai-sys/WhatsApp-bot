const { default: makeWASocket, useMultiFileAuthState, disconnectReason } = require("@whiskeysockets/baileys");
const fs = require("fs");
const http = require("http");
const QRCode = require('qrcode');
const pino = require('pino');

// --- הגדרות בסיס ---
let qrCodeData = "";
let sock;
let refreshTimer;
const PORT = process.env.PORT || 3000;
const OWNER_NUMBER = "0583293459@s.whatsapp.net"; // המספר שלך לקבלת הלידים
const CONTACTS_FILE = "./contacts.json";
const SAVE_KEYWORDS = ['שמור', 'שמירה', 'תשמור', 'לשמור', 'save'];

// --- שרת להצגת הברקוד באתר של Render ---
const server = http.createServer(async (req, res) => {
    try {
        if (qrCodeData) {
            const qrImage = await QRCode.toDataURL(qrCodeData);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f0f2f5;font-family:sans-serif;">
                    <div style="background:white;padding:30px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;">
                        <h2 style="color:#128c7e;">Rafael Digital - חיבור בוט</h2>
                        <img src="${qrImage}" style="width:300px;border:5px solid #eee;">
                        <p style="color:#666;">הברקוד מתרענן אוטומטית כל 5 דקות.</p>
                    </div>
                    <script>setTimeout(() => { location.reload(); }, 15000);</script>
                </body>
                </html>
            `);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end("<body style='display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;'><h1>הבוט מחובר בהצלחה! ✅</h1></body>");
        }
    } catch (e) { res.end("טוען ברקוד..."); }
}).listen(PORT, '0.0.0.0');

// --- פונקציית הבוט המרכזית ---
async function startBot() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!fs.existsSync('./auth_info')) { fs.mkdirSync('./auth_info', { recursive: true }); }

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
        
        // ניהול ברקוד ורענון כל 5 דקות
        if (qr) {
            qrCodeData = qr;
            refreshTimer = setTimeout(() => {
                if (!sock?.user) {
                    qrCodeData = "";
                    if (sock) sock.end();
                    try { fs.rmSync('./auth_info', { recursive: true, force: true }); } catch (e) {}
                    startBot();
                }
            }, 5 * 60 * 1000);
        }

        // טיפול בניתוקים (תיקון לשגיאה שצילמת)
        if (connection === 'close') {
            qrCodeData = "";
            const statusCode = lastDisconnect?.error?.output?.statusCode || 0;
            const shouldReconnect = statusCode !== disconnectReason.loggedOut;
            
            if (shouldReconnect) {
                setTimeout(startBot, 5000);
            } else {
                try { fs.rmSync('./auth_info', { recursive: true, force: true }); } catch (e) {}
                startBot();
            }
        } else if (connection === 'open') {
            qrCodeData = "";
            if (refreshTimer) clearTimeout(refreshTimer);
            console.log('הבוט באוויר!');
        }
    });

    // --- טיפול בהודעות נכנסות ---
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const senderId = msg.key.remoteJid;
            const senderName = msg.pushName || "לקוח חדש";
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
            const cleanNum = senderId.split('@')[0];

            let savedContacts = [];
            try { 
                if (fs.existsSync(CONTACTS_FILE)) {
                    savedContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE)); 
                }
            } catch (e) { savedContacts = []; }

            // 1. הודעת ברוכים הבאים + שליחת המספר אליך (קורה רק בפנייה ראשונה)
            if (!savedContacts.includes(senderId)) {
                // שולח למשתמש הודעת פתיחה
                await sock.sendMessage(senderId, { text: "ברוכים הבאים לסטטוס - אפ במה במה אפשר לעזור?" });
                
                // שולח אליך (רפאל) את המספר שלו כאיש קשר מוכן לשמירה
                const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${senderName}\nTEL;TYPE=CELL:${cleanNum}\nEND:VCARD`;
                await sock.sendMessage(OWNER_NUMBER, { 
                    contacts: { displayName: senderName, contacts: [{ vcard }] } 
                });

                savedContacts.push(senderId);
                fs.writeFileSync(CONTACTS_FILE, JSON.stringify(savedContacts));
            }

            // 2. בדיקה אם המשתמש כתב מילת מפתח לשמירה (שמור/שמירה/save וכו')
            if (SAVE_KEYWORDS.some(kw => text.includes(kw))) {
                await sock.sendMessage(senderId, { text: "נשמרת בהצלחה אל תשכח לשמור אותנו 😉" });
            }

        } catch (e) { console.log("שגיאה בטיפול בהודעה, ממשיך כרגיל..."); }
    });
}

// יצירת קובץ הזיכרון אם הוא לא קיים
if (!fs.existsSync(CONTACTS_FILE)) fs.writeFileSync(CONTACTS_FILE, JSON.stringify([]));

startBot();
