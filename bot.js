require('dotenv').config();
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const express = require('express');
const { Redis } = require('@upstash/redis');

const RITESH_PERSONAL_CHAT_ID = '6846541775';
const BOT_USERNAME = 'three_dimen_group_bot'; // no @

const BOT_TOKEN = process.env.TELE_BOT_KEY ? process.env.TELE_BOT_KEY.replace(/\\r|\\n/g, '').trim() : null;
const GROQ_API_KEY = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.replace(/\\r|\\n/g, '').trim() : null;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ? process.env.UPSTASH_REDIS_REST_URL.trim() : null;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ? process.env.UPSTASH_REDIS_REST_TOKEN.trim() : null;

if (!BOT_TOKEN || !GROQ_API_KEY) {
    console.error("❌ ERROR: Keys are missing in .env!");
    process.exit(1);
}
if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.error("❌ ERROR: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing in .env!");
    process.exit(1);
}

const redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });

const bot = new Telegraf(BOT_TOKEN);
const groq = new Groq({ apiKey: GROQ_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Autonomous Memory & Chat Engine Active! 🗣️🔥'));
app.listen(PORT, () => console.log(`📡 Health-check active on port ${PORT}`));

// ── ONLY transient, short-lived state lives in RAM ──────────────────────────
// chatBuffer: messages waiting for the next 5-second batch cycle (flushed every cycle).
// botTelegramId: fetched once at boot, tiny single value, not per-user data.
let chatBuffer = [];
let botTelegramId = null;

// ── Redis helpers: per-user data is fetched ONLY when that user is active in
//    a batch, used, saved back, and NOT kept resident in RAM afterwards. ────

const redisKey = (userId) => `user:${userId}`;

async function getUserRecord(userId) {
    try {
        const data = await redis.get(redisKey(userId));
        if (data) return data; // @upstash/redis auto-parses JSON
    } catch (err) {
        console.error(`❌ Redis GET failed for ${userId}:`, err.message);
    }
    // Default shape for a brand-new user
    return {
        userName: 'User',
        coreStory: 'No prior core story recorded.',
        freshMemory: 'No instant insights yet.',
        recentChats: [],
        cardMessageId: null
    };
}

async function saveUserRecord(userId, record) {
    try {
        await redis.set(redisKey(userId), record);
    } catch (err) {
        console.error(`❌ Redis SET failed for ${userId}:`, err.message);
    }
}

// 🧠 AUTONOMOUS BATCH ENGINE INSTRUCTION (DYNAMIC LANGUAGE ADAPTATION)
const ENGINE_INSTRUCTION =
    `You are 'Danish' (@three_dimen_group_bot), the friendly Group Manager of a 3D Artist Telegram Community.\n` +
    `You are reading a recent batch of raw chat messages from the group.\n\n` +
    `YOUR TWO CORE DUTIES:\n` +
    `1. MEMORY ANALYSIS: Each user is uniquely identified by their Telegram "userId" (not name — names can repeat). You will be shown their EXISTING core_story and fresh_memory for that exact userId. UPDATE and MERGE new info into the existing core_story — never discard prior known facts about that userId unless the new message contradicts them. Think of it as editing a running profile, not rewriting it from zero.\n` +
    `2. CONVERSATIONAL JUDGMENT: Decide if you should chime into the chat.\n` +
    `   - Set "should_respond": true if someone directly addressed you, mentioned you, replied to you (marked with [REPLYING_TO_DANISH]), asked ANY question (3D-related or not), greeted you personally, or made small talk directed at you.\n` +
    `   - Also feel free to reply true for general friendly banter where a chill community manager would naturally jump in — you don't have to restrict yourself to only 3D/Blender topics. You can have normal casual conversations too, not just technical ones.\n` +
    `   - Any message tagged [REPLYING_TO_DANISH] or [MENTIONS_DANISH] MUST get "should_respond": true.\n` +
    `   - Otherwise set "should_respond": false.\n\n` +
    `🚨 LANGUAGE & TONE LAWS (STRICT MATCHING):\n` +
    `- MATCH THE USER'S LANGUAGE: If the user speaks in English, reply strictly in clean, professional yet casual English. If they speak in Hinglish, reply in natural Indian Hinglish.\n` +
    `- NEVER force Hinglish or Hindi words on an English-speaking user.\n` +
    `- Direct, relevant, short, concise, human. Never use generic or robotic filler.\n` +
    `- Keep persona as 'Danish' (chill, knowledgeable, friendly 3D community manager who also enjoys casual chit-chat).\n\n` +
    `OUTPUT FORMAT REQUIREMENTS:\n` +
    `Return ONLY a JSON object with this exact structure:\n` +
    `{\n` +
    `  "memory_updates": [\n` +
    `    {\n` +
    `      "userId": "123456",\n` +
    `      "userName": "Name",\n` +
    `      "core_story": "Updated long term background summary of user based on chat",\n` +
    `      "fresh_memory": "Instant takeaway from their latest statements"\n` +
    `    }\n` +
    `  ],\n` +
    `  "should_respond": true,\n` +
    `  "target_message_id": "message_id_to_reply_to_if_any_else_null",\n` +
    `  "response_text": "Your adaptive language reply here"\n` +
    `}`;

// Deletes the previous DM profile card (if any) and sends the fresh one, using the
// record's own cardMessageId — no separate global tracker needed.
async function syncStructuredMemoryToTelegram(userId, record) {
    try {
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        if (record.cardMessageId) {
            try {
                await bot.telegram.deleteMessage(RITESH_PERSONAL_CHAT_ID, record.cardMessageId);
            } catch (e) {}
        }

        const recentLogs = (record.recentChats || [])
            .map(item => `${item.sender}: ${item.text}`)
            .join('\n');

        const payload =
            `🧠 [LIVE USER PROFILE & CONTEXT CARD]\n` +
            `👤 User: ${record.userName} (ID: ${userId})\n` +
            `⏰ Last Sync: ${timestamp}\n\n` +
            `📖 1. CORE LONG-TERM STORY:\n${record.coreStory}\n\n` +
            `💬 2. RECENT CHAT LOG:\n${recentLogs || "No recent history log."}\n\n` +
            `⚡ 3. FRESH / INSTANT MEMORY:\n${record.freshMemory}`;

        const sentMessage = await bot.telegram.sendMessage(RITESH_PERSONAL_CHAT_ID, payload);
        record.cardMessageId = sentMessage.message_id; // caller persists this
    } catch (err) {
        console.error("❌ DM Memory Sync Error:", err.message);
    }
}

// 🎉 WELCOME NEW MEMBERS HANDLER
bot.on('new_chat_members', async (ctx) => {
    try {
        const newMembers = ctx.message.new_chat_members;
        for (const member of newMembers) {
            if (member.is_bot && member.username === BOT_USERNAME) continue;
            const memberName = member.first_name || 'Artist';
            const welcomeText =
                `Welcome to the group, ${memberName}! 🎉\n\n` +
                `Main hu **Danish** (@${BOT_USERNAME}), tumhara Group Manager. ` +
                `Ye 3D Artists ka community space hai jahan hum Blender, Texturing, Animation aur Scripting discuss karte hain.\n\n` +
                `Apna intro do aur batao kis 3D software pe kaam kar rahe ho! 🚀`;

            await ctx.reply(welcomeText, { reply_to_message_id: ctx.message.message_id });
        }
    } catch (err) {
        console.error("❌ Welcome Handler Error:", err.message);
    }
});

// 📥 COLLECT ALL MESSAGES IN BUFFER (NO TRIGGER KEYWORDS REQUIRED)
// This handler does NOT touch Redis or any per-user RAM structure — it just
// queues the raw message. All lookups happen later, only for users in this batch.
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const userId = ctx.message.from.id;
    const userName = ctx.message.from.first_name || 'User';
    const rawMessage = ctx.message.text;
    const msgId = ctx.message.message_id;
    const chatId = ctx.chat.id;

    const isReplyToBot =
        ctx.message.reply_to_message &&
        ctx.message.reply_to_message.from &&
        (ctx.message.reply_to_message.from.id === botTelegramId ||
         ctx.message.reply_to_message.from.username === BOT_USERNAME);

    const mentionsBot =
        rawMessage.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`) ||
        /\bdanish\b/i.test(rawMessage);

    chatBuffer.push({
        chatId,
        msgId,
        userId,
        userName,
        text: rawMessage,
        isReplyToBot,
        mentionsBot,
        time: new Date().toLocaleTimeString('en-IN')
    });
});

// ⏱️ 5-SECOND BATCH PROCESSING ENGINE
setInterval(async () => {
    if (chatBuffer.length === 0) return;

    const currentBatch = [...chatBuffer];
    chatBuffer = [];

    const formattedBatchText = currentBatch.map(m => {
        let tags = '';
        if (m.isReplyToBot) tags += ' [REPLYING_TO_DANISH]';
        if (m.mentionsBot) tags += ' [MENTIONS_DANISH]';
        return `[MsgID: ${m.msgId} | UserID: ${m.userId} | ${m.userName}]${tags}: "${m.text}"`;
    }).join('\n');

    const hasDirectAddress = currentBatch.some(m => m.isReplyToBot || m.mentionsBot);

    // ── Fetch ONLY the users who are active in THIS batch — nobody else's data touches RAM ──
    const uniqueUserIds = [...new Set(currentBatch.map(m => String(m.userId)))];
    const userRecords = {}; // scoped to this batch only, discarded after this cycle
    for (const uid of uniqueUserIds) {
        userRecords[uid] = await getUserRecord(uid);
    }

    const existingMemoryContext = uniqueUserIds.map(uid => {
        const rec = userRecords[uid];
        return `[UserID: ${uid}]\n  existing_core_story: "${rec.coreStory}"\n  existing_fresh_memory: "${rec.freshMemory}"`;
    }).join('\n');

    try {
        const promptPayload =
            `EXISTING MEMORY FOR USERS IN THIS BATCH (matched by Telegram UserID — UPDATE/MERGE this, do NOT discard it):\n${existingMemoryContext}\n\n` +
            `CURRENT CHAT BATCH (Last 5 seconds):\n${formattedBatchText}\n\n` +
            `For each user's "core_story" in your output: start from their existing_core_story above and ADD/REFINE based on the new batch — never throw away previously known facts unless the new message directly contradicts them. "fresh_memory" can fully reflect just this latest batch.`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: ENGINE_INSTRUCTION },
                { role: 'user', content: promptPayload }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.4,
            response_format: { type: "json_object" }
        });

        const rawResult = completion.choices[0]?.message?.content;
        if (!rawResult) return;

        const data = JSON.parse(rawResult);

        // 1. MEMORY UPDATES — merge into the batch-scoped record, sync DM card, save to Redis, done.
        if (data.memory_updates && Array.isArray(data.memory_updates)) {
            for (const update of data.memory_updates) {
                if (!update.userId) continue;
                const uid = String(update.userId);
                const record = userRecords[uid] || await getUserRecord(uid);

                if (update.userName) record.userName = update.userName;
                if (update.core_story) record.coreStory = update.core_story.trim();
                if (update.fresh_memory) record.freshMemory = update.fresh_memory.trim();

                // attach this batch's raw messages from this user to the log (capped at 15)
                const thisUsersMsgs = currentBatch
                    .filter(m => String(m.userId) === uid)
                    .map(m => ({ sender: m.userName, text: m.text }));
                record.recentChats = [...(record.recentChats || []), ...thisUsersMsgs].slice(-15);

                await syncStructuredMemoryToTelegram(uid, record); // mutates record.cardMessageId
                await saveUserRecord(uid, record); // write-through to Redis; RAM copy discarded after this loop
            }
        }

        // 2. CONVERSATIONAL REPLY
        const shouldRespond = data.should_respond || hasDirectAddress;
        if (shouldRespond && data.response_text) {
            const targetChatId = currentBatch[0].chatId;
            const replyMsgId = data.target_message_id && data.target_message_id !== "null"
                ? parseInt(data.target_message_id)
                : currentBatch[currentBatch.length - 1].msgId;

            await bot.telegram.sendMessage(targetChatId, data.response_text, {
                reply_to_message_id: replyMsgId
            });
        }

    } catch (err) {
        console.error("❌ Batch Processing Engine Error:", err.message);
    }
    // userRecords goes out of scope here — nothing per-user lingers in RAM between cycles.
}, 5000);

async function startBot() {
    await bot.launch();
    console.log("🚀 Autonomous 5s Batch Memory Engine Active (Redis-backed, per-user lazy load)...");
    try {
        const me = await bot.telegram.getMe();
        botTelegramId = me.id;
    } catch (e) {
        console.error("❌ Could not fetch bot identity:", e.message);
    }
}

startBot().catch(err => console.error("❌ Launch Failed:", err.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
console.log("hello ji");