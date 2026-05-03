const { default: makeWASocket, useMultiFileAuthState, delay, disconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const http = require("http");

// --- הגדרות שרת עבור Render (Health Check) ---
// Render דורש שהאפליקציה תקשיב לפורט מסוים, אחרת הוא יבצע Restart
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is alive and running!");
}).listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// --- הגדרות הבוט ---
const OWNER_NUMBER = "0583293459@s.whatsapp.net"; // המספר שלך לקבלת התראות
const CONTACTS_FILE = "./contacts.json";
const SAVE_KEYWORDS = ['שמור', 'שמירה', 'תשמור', 'לשמור', 'save'];

// פונקציה ליצירת כרטיס ביקור (VCF)
function createVCF(phoneNumber) {
    const cleanNumber = phoneNumber.split('@')[0];
    return `BEGIN:VCARD\nVERSION:3.0\nFN:ליד חדש - ${cleanNumber}\nTEL;TYPE=CELL:${cleanNumber}\nEND:VCARD`;
}

async function startBot() {
    // ניהול התחברות (Session)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // ה-QR יופיע ב-Logs של Render
        browser: ["Refael Digital Bot", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    // טעינת רשימת אנשי קשר מהקובץ
    let savedContacts = [];
    if (fs.existsSync(CONTACTS_FILE)) {
        try {
            savedContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE));
        } catch (e) {
            savedContacts = [];
        }
    }

    // האזנה להודעות נכנסות
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderId = msg.key.remoteJid;
        // חילוץ הטקסט מהודעה רגילה או הודעה עם לינק
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        
        let isNewUser = !savedContacts.includes(senderId);
        let responseText = "";

        // 1. טיפול במשתמש חדש (פעם ראשונה בלבד)
        if (isNewUser) {
            responseText += "ברוכים הבאים לסטטוס - אפ במה במה אפשר לעזור?\n\n";
            savedContacts.push(senderId);
            // עדכון הקובץ כדי שהבוט יזכור את המשתמש
            fs.writeFileSync(CONTACTS_FILE, JSON.stringify(savedContacts));
        }

        // 2. בדיקת מילות מפתח לשמירה (תמיד פעיל)
        const needsSaving = SAVE_KEYWORDS.some(kw => text.includes(kw));
        
        if (needsSaving) {
            responseText += "נשמרת בהצלחה אל תשכח לשמור אותנו 😉";
            
            // יצירת כרטיס ביקור ושליחה אליך (לבעלים)
            const vcard = createVCF(senderId);
            await sock.sendMessage(OWNER_NUMBER, { 
                contacts: {
                    displayName: `ליד חדש - ${senderId.split('@')[0]}`,
                    contacts: [{ vcard }]
                }
            });
        }

        // 3. שליחת התגובה למשתמש
        if (responseText) {
            await delay(1500); // השהיה קלה למראה אנושי
            await sock.sendMessage(senderId, { text: responseText });
        }
    });

    // ניהול חיבור מחדש במקרה של ניתוק
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ הבוט מחובר ומוכן לעבודה ב-Render!');
        }
    });
}

// הרצת הבוט
startBot().catch(err => console.log("שגיאה קריטית:", err));
