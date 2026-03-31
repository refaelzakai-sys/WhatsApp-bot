# השתמש בתמונה מוכנה שכוללת כבר את Node.js ואת Chrome מותקן
FROM ghcr.io/puppeteer/puppeteer:latest

# הגדרת תיקיית העבודה
WORKDIR /app

# העתקת קבצי הפרויקט
COPY package*.json ./
RUN npm install

COPY . .

# הגדרת פורט ל-Render
ENV PORT=10000
EXPOSE 10000

# הרצת הבוט
CMD ["node", "index.js"]
