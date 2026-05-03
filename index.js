const { default: makeWASocket, useMultiFileAuthState, disconnectReason } = require("@whiskeysockets/baileys");
const fs = require("fs");
const http = require("http");
const QRCode = require('qrcode');
const pino = require('pino');

let qrCodeData = "";
let sock;
const PORT = process.env.PORT || 3000;
const OWNER_NUMBER = "0583293459@s.whatsapp.net";
const CONTACTS_FILE = "./contacts.json";
const SAVE_KEYWORDS = ['שמור', 'שמירה', 'תשמור', 'לשמור', 'save'];

// שרת להצגת הברקוד (יהיה זמין בקישור של Render)
http.createServer(async (req, res) => {
    try {
        if (qrCodeData) {
            const qrImage = await QRCode.toDataURL(qrCodeData);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f0f2f5;font-family:sans-serif;"><div style="background:white;padding:30px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;"><h2 style="color:#128c7e;">Rafael Digital</h2><img src="${qrImage}" style="width:300px;"><p>סרוק לחיבור הבוט - הברקוד מתרענן אוטומטית</p></div><script>setTimeout(()=>location.reload(),15000);</script></body></html>`);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end("<body style='display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;'><h1>הבוט מחובר! ✅</h1></body>");
        }
    } catch (e) { res.end("Loading..."); }
}).listen(PORT, '0.0.0.0');

async function startBot() {
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info', { recursive: true });
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
        if (qr) qrCodeData = qr;
        
        if (connection === 'close') {
            qrCodeData = "";
            const statusCode = lastDisconnect?.error?.output?.statusCode || 0;
            if (statusCode !== disconnectReason.loggedOut) {
                setTimeout(startBot, 5000);
            } else {
                fs.rmSync('./auth_info', { recursive: true, force: true });
                startBot();
            }
        } else if (connection === 'open') {
            qrCodeData = "";
            console.log('✅ Connected');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const senderId = msg.key.remoteJid;
            const senderName = msg.pushName || "לקוח חדש";
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
            const cleanNum = senderId.split('@')[0];

            let savedContacts = fs.existsSync(CONTACTS_FILE) ? JSON.parse(fs.readFileSync(CONTACTS_FILE)) : [];

            if (!savedContacts.includes(senderId)) {
                await sock.sendMessage(senderId, { text: "ברוכים הבאים לסטטוס - אפ במה אפשר לעזור?" });
                const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${senderName}\nTEL;TYPE=CELL:${cleanNum}\nEND:VCARD`;
                await sock.sendMessage(OWNER_NUMBER, { contacts: { displayName: senderName, contacts: [{ vcard }] } });
                savedContacts.push(senderId);
                fs.writeFileSync(CONTACTS_FILE, JSON.stringify(savedContacts));
            }

            if (SAVE_KEYWORDS.some(kw => text.includes(kw))) {
                await sock.sendMessage(senderId, { text: "נשמרת בהצלחה אל תשכח לשמור אותנו 😉" });
            }
        } catch (e) {}
    });
}
startBot();
