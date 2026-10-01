# JikoStock (Stock ya Jikoni)

Web app ya kurecord stock na kutrack mauzo ya jikoni, yenye **backend** (Node/Express) na majukumu mawili: **user** na **admin**.

## Vipengele
- Register / Sign in (nenosiri linahifadhiwa kwa bcrypt, session kwa JWT)
- Sheet: date, item, open, in, total, sales, closing, system, debt
- Hesabu automatic: `total = open + in`, `closing = total - sales`
- **User**: anajaza sheet, anahifadhi (Hifadhi), anaona na kupakua CSV ya rekodi zake, ripoti na PDF
- **Admin**: anaingia na kuona rekodi zote zilizohifadhiwa na watumiaji, anaweza **kuzihariri**, kuzifuta, kuchuja kwa mtumiaji, kuona ripoti (ya rekodi moja au ya wote) na kupakua CSV/PDF
- Ripoti ya bidhaa iliyouzika zaidi/kidogo kwa siku, wiki, mwezi, na mapendekezo
- Lugha: Kiswahili / English, Mode: dark / light

Kumbuka: rekodi zilizohifadhiwa haziwezi kuhaririwa na user wa kawaida, ni admin tu.

## Muundo
```
kitchen-stock/
├── server.js        # Express API (auth, sheet, saves, admin)
├── api/index.js     # Vercel serverless entry
├── vercel.json
├── package.json
├── public/index.html  # frontend
├── .env.example
└── README.md
```

## Kuiendesha kwenye kompyuta
```bash
npm install
ADMIN_CODE=msimbo-wa-admin JWT_SECRET=siri-ndefu npm start
```
Fungua http://localhost:3000 . Ukurasa wa kwanza una chaguo la **Mtumiaji / Admin** na **Ingia / Jisajili**.
- User wa kawaida anajisajili moja kwa moja.
- Admin anajisajili kwa kuweka **msimbo wa admin** (`ADMIN_CODE`). Bila msimbo sahihi hakuna anayeweza kuwa admin. Kwenye maendeleo (bila `ADMIN_CODE`) msimbo wa mfano ni `admin2026`. Kwenye production lazima uuweke mwenyewe.
- Akaunti ya User haiwezi kuingia kama Admin na kinyume chake.

## GitHub
```bash
git init
git add .
git commit -m "Kitchen Stock v2: backend with admin role"
git branch -M main
git remote add origin https://github.com/USERNAME/kitchen-stock.git
git push -u origin main
```

## Deploy kwenye Vercel (inapendekezwa)
App haifanyi kazi ikifunguliwa kama faili (`file://`) wala ikiwekwa kama site tuli (static): inahitaji `/api`. Mpangilio huu unatumia Vercel Serverless + **Upstash Redis** kuhifadhi data.

1. Weka folder hili (root ya repo, lenye `server.js`, `api/`, `public/`, `vercel.json`) kwenye GitHub.
2. vercel.com → Add New → Project → chagua repo. **Root Directory: acha tupu (root ya repo), SI `public`.** Framework Preset: *Other*. Build Command: acha tupu.
3. Kwenye project: **Storage** → Create Database → **Upstash for Redis** → Connect to Project. Vercel inaweka `KV_REST_API_URL` na `KV_REST_API_TOKEN` automatic.
4. **Settings → Environment Variables**, ongeza:
   - `JWT_SECRET` = string ndefu ya siri
   - `ADMIN_CODE` = msimbo wa siri wa kujisajili admin
   - (hiari) `ADMIN_USER` + `ADMIN_PASS` kwa admin wa kudumu
5. **Redeploy** (Deployments → ... → Redeploy) ili variables zitumike.

Ukiwa na project ya zamani iliyowekwa Root Directory = `public`, badilisha kwenye Settings → General → Root Directory (iwe tupu), kisha redeploy.

## Deploy kwenye Render (mbadala)
Web Service: build `npm install`, start `npm start`. Env: `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_CODE`. Data inahifadhiwa kwenye faili, kwa hiyo ongeza **Disk** (mfano `/var/data`) na weka `DATA_DIR=/var/data`, au weka Upstash Redis variables kama hapo juu.

## Hatua zinazofuata (kwa matumizi makubwa)
- Kubadilisha faili la JSON kuwa database halisi (PostgreSQL / SQLite / Supabase)
- Rate limiting kwenye login, na HTTPS ni lazima (Render inatoa automatic)
- Kubadilisha nenosiri na kureset nenosiri
